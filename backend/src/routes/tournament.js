const express = require('express');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const Team = require('../models/Team');
const Sport = require('../models/Sport');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');
const { parseManila } = require('../config/time');
const PlayerMatchStats = require('../models/PlayerMatchStats');

const router = express.Router();

// Circle-method scheduling: returns rounds, each round = array of [teamA, teamB] pairs,
// so every team plays once per round.
function roundRobinRounds(ids) {
  const t = [...ids];
  if (t.length % 2 !== 0) t.push(null); // odd → one team rests each round
  const n = t.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a !== null && b !== null) pairs.push([a, b]);
    }
    rounds.push(pairs);
    t.splice(1, 0, t.pop()); // rotate all but the first
  }
  return rounds;
}
// Stable pseudo-random value from a team id — used to order tied teams for the
// tiebreaker draw (byes). Same team always gets the same value, so byes stay
// consistent across reloads. (Lifted to module scope so both the generator and
// the qualification reader use one copy.)
function seedOf(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000007;
  return h;
}

// Standard single-elim seed positions for a bracket of `size` slots (a power of
// two). Returns 1-indexed seed numbers in slot order, arranged so seed 1 and
// seed 2 meet only in the final — which also puts byes (the highest seed numbers,
// absent when N < size) on the TOP seeds. e.g. seedOrder(8) -> [1,8,4,5,2,7,3,6]
function seedOrder(size) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const next = [];
    const sum = seeds.length * 2 + 1;
    for (const s of seeds) { next.push(s); next.push(sum - s); }
    seeds = next;
  }
  return seeds;
}

// Build a per-group SINGLE-ELIMINATION tiebreaker among `orderedIds` (already
// ordered by seedOf, so byes fall to the top of that order). Every match is
// bracket:'group', isTiebreaker:true, round 100+ (100 = first round), wired via
// nextMatchWin. Winner advances; loser is out. Returns the match count (N-1).
async function generateGroupSingleElim(tournamentId, group, orderedIds) {
  const N = orderedIds.length;
  const B = 1 << Math.ceil(Math.log2(N));        // next power of two >= N
  const numRounds = Math.log2(B);
  const order = seedOrder(B);
  const teamForSeed = (s) => (s <= N ? orderedIds[s - 1] : null); // seed > N = bye

  const mk = async (round) => (await Match.create({
    tournament: tournamentId,
    bracket: 'group',
    group,
    round: 100 + round,   // 100 = first tiebreaker round, 101 = next, ...
    bestOf: 1,            // decisive single game (bump to 3 here for BO3)
    isTiebreaker: true,
    status: 'scheduled',
  }))._id;
  const wire = (id, win) => Match.updateOne({ _id: id }, { $set: { nextMatchWin: win } });
  const placeInto = async (id, teamId) => {
    const m = await Match.findById(id);
    if (!m) return;
    if (!m.teamA) m.teamA = teamId; else if (!m.teamB) m.teamB = teamId;
    await m.save();
  };

  // (1) Create an empty match for every slot in every round, then wire winners forward.
  const roundIds = {};
  for (let r = 1; r <= numRounds; r++) {
    roundIds[r] = [];
    const count = B / Math.pow(2, r);
    for (let i = 0; i < count; i++) roundIds[r].push(await mk(r));
  }
  for (let r = 1; r < numRounds; r++) {
    for (let i = 0; i < roundIds[r].length; i++) {
      await wire(roundIds[r][i], roundIds[r + 1][Math.floor(i / 2)]);
    }
  }

  // (2) Fill round 1. If a pair has one bye, the real team skips into round 2 and
  //     the spurious round-1 match is deleted (leaving exactly N-1 real matches).
  for (let p = 0; p < B / 2; p++) {
    const ta = teamForSeed(order[2 * p]);
    const tb = teamForSeed(order[2 * p + 1]);
    const r1 = roundIds[1][p];
    if (ta && tb) {
      await Match.updateOne({ _id: r1 }, { $set: { teamA: ta, teamB: tb } });
    } else {
      const real = ta || tb;                                  // exactly one is a bye
      await placeInto(roundIds[2][Math.floor(p / 2)], real);  // advance straight to R2
      await Match.deleteOne({ _id: r1 });
    }
  }

  return N - 1;
}

// Build one group's DOUBLE-ELIMINATION bracket (upper + lower, byes handled).
// No in-group grand final: the upper-bracket winner qualifies #1 (0 losses) and
// the lower-bracket winner qualifies #2 (1 loss); both advance to the Top 8.
// orderedIds = the group's team ids, already ordered (byes fall to the top seeds).
async function generateGroupDoubleElim(tournamentId, group, orderedIds) {
    const N = orderedIds.length;
  if (N < 2) return { matches: 0, upperFinal: null, lowerFinal: null };
  if (N === 2) {
    // Degenerate group: only 2 teams, so both qualify. One decider match records
    // the group winner (qualifier #1); the loser is qualifier #2. No lower bracket.
    const m = await Match.create({
      tournament: tournamentId, bracket: 'winners', group, round: 1,
      bestOf: 3, status: 'scheduled', teamA: orderedIds[0], teamB: orderedIds[1],
    });
    return { matches: 1, upperFinal: m._id, lowerFinal: m._id };
  }
  const B = 1 << Math.ceil(Math.log2(N));   // next power of two >= N
  const U = Math.log2(B);

  // ---------- PLAN the full B-slot skeleton in memory (proven construction) ----------
  let sid = 0;
  const S = {};
  const node = (bracket, round) => {
    const n = { id: sid++, bracket, round, winTo: null, loseTo: null, A: null, B: null };
    S[n.id] = n; return n.id;
  };

  // Upper bracket (single-elim); winners feed forward.
  const UR = {};
  for (let r = 1; r <= U; r++) { UR[r] = []; const c = B / 2 ** r; for (let i = 0; i < c; i++) UR[r].push(node('winners', r)); }
  for (let r = 1; r < U; r++) for (let i = 0; i < UR[r].length; i++)
    S[UR[r][i]].winTo = { m: UR[r + 1][Math.floor(i / 2)], slot: i % 2 === 0 ? 'A' : 'B' };

  // Lower bracket (wave construction): minor, then (major, minor) pairs; last major = lower final.
  const lb = [];
  let surv = B / 2;
  { const c = surv / 2, ids = []; for (let i = 0; i < c; i++) ids.push(node('losers', lb.length + 1)); lb.push({ type: 'minor', ids }); surv = c; }
  for (let k = 2; k <= U; k++) {
    const ids = []; for (let i = 0; i < surv; i++) ids.push(node('losers', lb.length + 1)); lb.push({ type: 'major', ids, wave: k });
    if (k < U) { const c2 = surv / 2, ids2 = []; for (let i = 0; i < c2; i++) ids2.push(node('losers', lb.length + 1)); lb.push({ type: 'minor', ids: ids2 }); surv = c2; }
  }
  for (let ri = 0; ri < lb.length - 1; ri++) {
    const cur = lb[ri].ids, nxt = lb[ri + 1];
    if (nxt.type === 'minor') for (let i = 0; i < cur.length; i++) S[cur[i]].winTo = { m: nxt.ids[Math.floor(i / 2)], slot: i % 2 === 0 ? 'A' : 'B' };
    else for (let i = 0; i < cur.length; i++) S[cur[i]].winTo = { m: nxt.ids[i], slot: 'A' };
  }
  const upperFinal = UR[U][0];
  const lowerFinal = lb[lb.length - 1].ids[0];

  // Route upper-bracket losers down into the lower bracket.
  const r1 = lb[0].ids;
  for (let i = 0; i < UR[1].length; i++) S[UR[1][i]].loseTo = { m: r1[Math.floor(i / 2)], slot: i % 2 === 0 ? 'A' : 'B' };
  for (let k = 2; k <= U; k++) { const maj = lb.find((r) => r.type === 'major' && r.wave === k); for (let i = 0; i < UR[k].length; i++) S[UR[k][i]].loseTo = { m: maj.ids[i], slot: 'B' }; }

  // Seat real teams + phantoms (byes) by seed order.
  const order = seedOrder(B);
  const teamForSeed = (s) => (s <= N ? orderedIds[s - 1] : null);
  for (let p = 0; p < UR[1].length; p++) { S[UR[1][p]].A = teamForSeed(order[2 * p]); S[UR[1][p]].B = teamForSeed(order[2 * p + 1]); }

  // Propagate which slots become REAL; find the matches actually played + bye advances.
  const slotReal = {};
  for (const id of UR[1]) { slotReal[id + 'A'] = S[id].A !== null; slotReal[id + 'B'] = S[id].B !== null; }
  const byeWin = {};
  const ordered = Object.values(S).sort((a, b) => a.id - b.id);
  for (const m of ordered) {
    const aR = !!slotReal[m.id + 'A'], bR = !!slotReal[m.id + 'B'];
    if (aR && !bR) byeWin[m.id] = m.A; else if (bR && !aR) byeWin[m.id] = m.B;
    if (m.winTo) slotReal[m.winTo.m + m.winTo.slot] = aR || bR;
    if (m.loseTo) slotReal[m.loseTo.m + m.loseTo.slot] = aR && bR;
  }
  const kept = new Set(ordered.filter((m) => slotReal[m.id + 'A'] && slotReal[m.id + 'B']).map((m) => m.id));
  const follow = (ref) => { while (ref && !kept.has(ref.m)) ref = S[ref.m].winTo; return ref || null; };

  // ---------- PERSIST only the real matches, then wire them ----------
  const idMap = {};
  for (const id of kept) {
    const m = S[id];
    idMap[id] = (await Match.create({
      tournament: tournamentId, bracket: m.bracket, group, round: m.round,
      bestOf: 3, status: 'scheduled',
      teamA: UR[1].includes(id) ? m.A : null,
      teamB: UR[1].includes(id) ? m.B : null,
    }))._id;
  }
  // Pre-place bye-advanced teams into their real destination slot.
  for (const m of ordered) {
    if (kept.has(m.id)) continue;
    const t = byeWin[m.id]; if (!t) continue;
    const dest = follow(m.winTo); if (!dest || !idMap[dest.m]) continue;
    await Match.updateOne({ _id: idMap[dest.m] }, { $set: dest.slot === 'A' ? { teamA: t } : { teamB: t } });
  }
  // Wire winner/loser routing between real matches.
  for (const id of kept) {
    const m = S[id];
    const w = follow(m.winTo), l = follow(m.loseTo);
    await Match.updateOne({ _id: idMap[id] }, { $set: {
      nextMatchWin: w ? idMap[w.m] : null,
      nextMatchLose: l ? idMap[l.m] : null,
    } });
  }

  return { matches: kept.size, upperFinal: idMap[upperFinal], lowerFinal: idMap[lowerFinal] };
}

// POST /api/tournaments/generate
// body: { sportId, numGroups?, advancePerGroup? }
// Super admin builds a grouped round-robin from the verified teams.
router.post('/generate', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.status(409).json({ message: 'No active season.' });

    const sport = await Sport.findById(req.body.sportId);
    if (!sport) return res.status(404).json({ message: 'Sport not found.' });

        const division = req.body.division || 'open';
    if (await Tournament.findOne({ sport: sport._id, season: season._id, division })) {
      return res.status(409).json({ message: `A ${division} tournament for this sport already exists this season. Delete it to regenerate.` });
    }

            // Format now comes from the sport's own setting rather than its name, so a
    // new sport can use either draw.
    const isRoundRobin = sport.tournamentFormat === 'round_robin';

    // ---- PHYSICAL SPORTS: 4 groups, double-elimination within each group ----
    if (!isRoundRobin) {
            const teams = await Team.find({ sport: sport._id, season: season._id, status: 'verified', division });
            const NUM_GROUPS = sport.numGroups || 4;
      // Need at least 2 per group so every group can produce 2 qualifiers → a real Top 8.
            if (teams.length < NUM_GROUPS * 3) {
        return res.status(400).json({
          message: `Double-elimination needs at least ${NUM_GROUPS * 3} verified teams (3 per group across ${NUM_GROUPS} groups); found ${teams.length}.`,
        });
      }

      // Shuffle, then distribute as evenly as possible across the 4 groups.
      const shuffled = [...teams].sort(() => Math.random() - 0.5);
            const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const groupNames = LABELS.slice(0, NUM_GROUPS);
      const buckets = {};
      groupNames.forEach((g) => { buckets[g] = []; });
      shuffled.forEach((team, i) => { buckets[groupNames[i % NUM_GROUPS]].push(team); });

      const tournament = await Tournament.create({
        sport: sport._id,
        season: season._id,
        division,
        format: 'double_elimination',
        stage: 'group_stage',
        groups: groupNames,
        advancePerGroup: 2,           // upper-bracket winner + lower-bracket winner
                knockoutSize: sport.knockoutSize || NUM_GROUPS * 2,
      });

      // Build one double-elim bracket per group (byes handled inside the generator).
      let totalMatches = 0;
      const groupInfo = {};
      for (const g of groupNames) {
        const ids = buckets[g].map((t) => t._id.toString());
        const result = await generateGroupDoubleElim(tournament._id, g, ids);
        totalMatches += result.matches;
        groupInfo[g] = { teams: ids.length, matches: result.matches, upperFinal: result.upperFinal, lowerFinal: result.lowerFinal };
      }

      return res.status(201).json({
        tournament,
        format: 'double_elimination',
        teams: teams.length,
        numGroups: NUM_GROUPS,
        advancePerGroup: 2,
                knockoutSize: sport.knockoutSize || NUM_GROUPS * 2,
        groups: groupInfo,
        matches: totalMatches,
      });
    }
    // ---- else: MOBILE LEGENDS round-robin (unchanged below) ----

    const teams = await Team.find({ sport: sport._id, season: season._id, status: 'verified' });

    // Knockout size drives everything: always 8 groups.
    // Top 8  -> advance 1 per group.  Top 16 -> advance 2 per group.
        // The request may override, but a configured sport supplies its own default.
    const knockoutSize = parseInt(req.body.knockoutSize, 10) || sport.knockoutSize || 8;
    if (![8, 16, 32].includes(knockoutSize)) {
      return res.status(400).json({ message: 'Knockout size must be 8, 16, or 32.' });
    }
    // Need at least as many verified teams as the knockout size.
    if (teams.length < knockoutSize) {
      return res.status(400).json({
        message: `A Top ${knockoutSize} knockout needs at least ${knockoutSize} verified teams; found ${teams.length}.`,
      });
    }

        const NUM_GROUPS = sport.numGroups || 8;
    const advancePerGroup = knockoutSize / NUM_GROUPS; // 8 -> 1, 16 -> 2

    // Shuffle then distribute as evenly as possible across the 8 groups
    // (handles any team count, incl. odd numbers like 43 → groups differ by ≤1).
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const groupNames = LABELS.slice(0, NUM_GROUPS);
    const buckets = {};
    groupNames.forEach((g) => { buckets[g] = []; });
    shuffled.forEach((team, i) => { buckets[groupNames[i % NUM_GROUPS]].push(team); });

    const tournament = await Tournament.create({
      sport: sport._id,
      season: season._id,
      format: 'round_robin',
      stage: 'group_stage',
      groups: groupNames,
      advancePerGroup,
      knockoutSize,
    });

    // Round-robin inside each group.
    const docs = [];
    for (const g of groupNames) {
      const ids = buckets[g].map((t) => t._id.toString());
      const rounds = roundRobinRounds(ids);
      rounds.forEach((pairs, ri) => pairs.forEach(([a, b]) => docs.push({
        tournament: tournament._id,
        bracket: 'group',
        group: g,
        round: ri + 1,
        teamA: a,
        teamB: b,
        bestOf: 1,
        status: 'scheduled',
      })));
    }
    await Match.insertMany(docs);

    const groupSizes = {};
    groupNames.forEach((g) => { groupSizes[g] = buckets[g].length; });

    res.status(201).json({
      tournament,
      teams: teams.length,
      numGroups: NUM_GROUPS,
      advancePerGroup,
      knockoutSize,
      groupSizes,
      matches: docs.length,
    });
  } catch (err) {
    console.error('Generate tournament error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/tournaments/matches/:matchId/result  { scoreA, scoreB }
router.post('/matches/:matchId/result', authenticate, authorize('super_admin', 'organizer'), async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) return res.status(404).json({ message: 'Match not found.' });
    if (match.status === 'completed') return res.status(409).json({ message: 'This match already has a result.' });
    if (!match.teamA || !match.teamB) return res.status(400).json({ message: 'This match is missing a team (an earlier match may not be finished yet).' });

    if (req.user.role === 'organizer') {
      const t = await Tournament.findById(match.tournament);
      if (!t || String(req.user.assignedSport) !== String(t.sport)) {
        return res.status(403).json({ message: 'You can only score matches for your assigned sport.' });
      }
    }

    const a = Number(req.body.scoreA), b = Number(req.body.scoreB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
      return res.status(400).json({ message: 'scoreA and scoreB must be non-negative numbers.' });
    }
    if (a === b) return res.status(400).json({ message: 'A Mobile Legends match cannot end in a tie.' });

    const winner = a > b ? match.teamA : match.teamB;
    const loser = a > b ? match.teamB : match.teamA;
    match.games = [{ gameNumber: 1, scoreA: a, scoreB: b, winner }];
    match.seriesWinner = winner;
    match.status = 'completed';
    match.enteredBy = req.user.id;
    match.enteredAt = new Date();
    await match.save();

    // --- ADVANCEMENT (bracket matches only) ---
    // Drop a team into the next match's first empty slot (teamA, then teamB).
    const placeInto = async (nextId, teamId) => {
      if (!nextId || !teamId) return;
      const next = await Match.findById(nextId);
      if (!next) return;
      if (!next.teamA) next.teamA = teamId;
      else if (!next.teamB) next.teamB = teamId;
      await next.save();
    };

       let advanced = null;
    if (match.isTiebreaker) {
      // ... unchanged ...
      advanced = match.nextMatchWin
        ? { winnerTo: match.nextMatchWin }
        : { tiebreakerWinner: String(winner) };
    } else if (
      match.bracket === 'winners' || match.bracket === 'losers' || match.bracket === 'final' ||
      match.bracket === 'knockout' || match.bracket === 'ko_final'
    ) {
      await placeInto(match.nextMatchWin, winner);
      await placeInto(match.nextMatchLose, loser);
      advanced = { winnerTo: match.nextMatchWin, loserTo: match.nextMatchLose };
      if (match.bracket === 'final' || match.bracket === 'ko_final') {
        const t = await Tournament.findById(match.tournament);
        if (t) { t.stage = 'completed'; await t.save(); }
        advanced = { champion: String(winner) };
      }
    }

    res.json({ message: 'Result recorded.', matchId: match._id, winner, advanced });
  } catch (err) {
    console.error('Enter result error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/tournaments  — public; tournaments for the current season.
router.get('/', async (req, res) => {
  const season = await getCurrentSeason();
  if (!season) return res.json({ tournaments: [] });
  const tournaments = await Tournament.find({ season: season._id }).populate('sport', 'name');
  res.json({ tournaments });
});

// GET /api/tournaments/by-sport?sportId=X  — SUPER ADMIN. Every tournament for
// a sport, from ANY season — mirrors GET /api/teams?sportId= for the same
// reason: the plain GET / above is scoped to the current season only, so a
// tournament left behind by a deleted season is invisible there, and with it
// invisible to DELETE /api/tournaments/:id — the very thing standing between
// its teams and DELETE /api/teams/:id ("still appears in N match(es)").
router.get('/by-sport', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.sportId) filter.sport = req.query.sportId;
    const tournaments = await Tournament.find(filter)
      .populate('sport', 'name')
      .populate('season', 'name')
      .sort({ createdAt: -1 });
    res.json({ tournaments });
  } catch (err) {
    console.error('List tournaments by sport error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/tournaments/:id/matches  — public; fixtures.
router.get('/:id/matches', async (req, res) => {
  const matches = await Match.find({ tournament: req.params.id })
    .populate('teamA', 'teamName').populate('teamB', 'teamName').sort({ round: 1, createdAt: 1 });
  res.json({ matches });
});

// GET /api/tournaments/:id/standings  — public; computed W/L and ranking.
// GET /api/tournaments/:id/standings — public; standings computed per group.
router.get('/:id/standings', async (req, res) => {
  try {
        const tournament = await Tournament.findById(req.params.id).populate('sport', 'name tournamentFormat');
    if (!tournament) return res.status(404).json({ message: 'Tournament not found.' });

    const matches = await Match.find({ tournament: tournament._id });
    const ids = new Set();
    matches.forEach((m) => { if (m.teamA) ids.add(String(m.teamA)); if (m.teamB) ids.add(String(m.teamB)); });
    const teams = await Team.find({ _id: { $in: [...ids] } }).select('teamName');
    const nameById = {}; teams.forEach((t) => { nameById[String(t._id)] = t.teamName; });

    // Group matches by their group label.
    const byGroup = {};
    matches.forEach((m) => {
      const g = m.group || '-';
      (byGroup[g] = byGroup[g] || []).push(m);
    });

    const groupsOut = {};
    for (const [g, gMatches] of Object.entries(byGroup)) {
      const stats = {}; const h2h = {};
      const gids = new Set();
      gMatches.forEach((m) => { if (m.teamA) gids.add(String(m.teamA)); if (m.teamB) gids.add(String(m.teamB)); });
      [...gids].forEach((id) => { stats[id] = { teamId: id, teamName: nameById[id] || '?', played: 0, wins: 0, losses: 0, gameWinDiff: 0, points: 0 }; });

      gMatches.forEach((m) => {
        if (m.status !== 'completed' || !m.seriesWinner) return;
        const a = String(m.teamA), b = String(m.teamB), w = String(m.seriesWinner), l = w === a ? b : a;
        stats[a].played++; stats[b].played++; stats[w].wins++; stats[l].losses++; stats[w].points += 3;
        let ga = 0, gb = 0;
        m.games.forEach((game) => { if (String(game.winner) === a) ga++; else if (String(game.winner) === b) gb++; });
        stats[a].gameWinDiff += ga - gb; stats[b].gameWinDiff += gb - ga;
        h2h[[a, b].sort().join('|')] = w;
      });

      const table = Object.values(stats).sort((x, y) => {
        if (y.wins !== x.wins) return y.wins - x.wins;
        const key = [x.teamId, y.teamId].sort().join('|');
        if (h2h[key] === x.teamId) return -1;
        if (h2h[key] === y.teamId) return 1;
        return y.gameWinDiff - x.gameWinDiff;
      });
      table.forEach((row, i) => { row.rank = i + 1; });
      groupsOut[g] = table;
    }

    res.json({
      tournament: { id: tournament._id, sport: tournament.sport && tournament.sport.name, stage: tournament.stage, advancePerGroup: tournament.advancePerGroup },
      groups: groupsOut,
    });
  } catch (err) {
    console.error('Standings error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// DELETE /api/tournaments/:id  — super admin; removes a tournament + its matches
// (to regenerate, or to clear the way for deleting its sport/teams).
router.delete('/:id', authenticate, authorize('super_admin'), async (req, res) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'Tournament not found.' });
  const matches = await Match.find({ tournament: t._id }, '_id');
  await PlayerMatchStats.deleteMany({ match: { $in: matches.map((m) => m._id) } });
  await Match.deleteMany({ tournament: t._id });
  await Tournament.deleteOne({ _id: t._id });
  res.json({ message: 'Tournament and its matches deleted.' });
});

// Helper: rank a single group's teams (same logic as standings, reused).
function rankGroup(gMatches, nameById) {
  const stats = {}; const h2h = {};
  const gids = new Set();
  gMatches.forEach((m) => { if (m.teamA) gids.add(String(m.teamA)); if (m.teamB) gids.add(String(m.teamB)); });
  [...gids].forEach((id) => { stats[id] = { teamId: id, teamName: nameById[id] || '?', played: 0, wins: 0, losses: 0, gameWinDiff: 0, points: 0 }; });

  gMatches.forEach((m) => {
    if (m.status !== 'completed' || !m.seriesWinner) return;
    const a = String(m.teamA), b = String(m.teamB), w = String(m.seriesWinner), l = w === a ? b : a;
    stats[a].played++; stats[b].played++; stats[w].wins++; stats[l].losses++; stats[w].points += 3;
    let ga = 0, gb = 0;
    m.games.forEach((game) => { if (String(game.winner) === a) ga++; else if (String(game.winner) === b) gb++; });
    stats[a].gameWinDiff += ga - gb; stats[b].gameWinDiff += gb - ga;
    h2h[[a, b].sort().join('|')] = w;
  });

  const table = Object.values(stats).sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    return y.gameWinDiff - x.gameWinDiff;
  });
  return table;
}

// Are all of a group's round-robin (non-tiebreaker) matches finished?
function groupGamesComplete(gMatches) {
  const rr = gMatches.filter((m) => !m.isTiebreaker);
  return rr.length > 0 && rr.every((m) => m.status === 'completed');
}

// GET /api/tournaments/:id/qualification — per group: who's qualified, and any tie at the cutoff.
router.get('/:id/qualification', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found.' });
    const advance = tournament.advancePerGroup || 2;

    const matches = await Match.find({ tournament: tournament._id });
    const idset = new Set();
    matches.forEach((m) => { if (m.teamA) idset.add(String(m.teamA)); if (m.teamB) idset.add(String(m.teamB)); });
    const teams = await Team.find({ _id: { $in: [...idset] } }).select('teamName');
    const nameById = {}; teams.forEach((t) => { nameById[String(t._id)] = t.teamName; });

    const byGroup = {};
    matches.forEach((m) => { const g = m.group || '-'; (byGroup[g] = byGroup[g] || []).push(m); });

    // Stable pseudo-random seed from a team id (for the drawing-of-lots fallback).
    const seedOf = (id) => {
      const s = String(id); let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000007;
      return h;
    };

    const out = {};
    for (const [g, gMatches] of Object.entries(byGroup)) {
      const complete = groupGamesComplete(gMatches);
      const table = rankGroup(gMatches.filter((m) => !m.isTiebreaker), nameById);

      const tb = gMatches.filter((m) => m.isTiebreaker);
      const tbResolved = tb.length > 0 && tb.every((m) => m.status === 'completed');

      let qualified = [];
      let contestedNames = [];   // teams fighting in the tiebreaker (for display)

      if (complete) {
        if (table.length <= advance) {
          qualified = table.map((t) => t.teamName);           // fewer teams than spots
        } else {
          const lastIn = table[advance - 1];
          const tied = table.filter((t) => t.wins === lastIn.wins && t.gameWinDiff === lastIn.gameWinDiff);
          const clearIn = table.filter((t) =>
            t.wins > lastIn.wins || (t.wins === lastIn.wins && t.gameWinDiff > lastIn.gameWinDiff)
          );
          const spotsLeft = advance - clearIn.length;

          if (tied.length < 2 || tied.length <= spotsLeft) {
            qualified = table.slice(0, advance).map((t) => t.teamName); // no real contest
          } else {
            contestedNames = tied.map((t) => t.teamName);
            if (tbResolved) {
              const finalTb = tb.reduce((hi, m) => (!hi || m.round > hi.round ? m : hi), null);
              let winnerIds = [];
              if (spotsLeft === 1) {
                // One spot: the bracket champion takes it.
                if (finalTb && finalTb.seriesWinner) winnerIds = [String(finalTb.seriesWinner)];
              } else {
                // Two spots: BOTH finalists advance (reaching the final = qualifying).
                winnerIds = [finalTb && finalTb.teamA, finalTb && finalTb.teamB].filter(Boolean).map(String);
              }
              qualified = [
                ...clearIn.map((t) => t.teamName),
                ...winnerIds.map((id) => nameById[id] || '?'),
              ];
            }
          }
        }
      }

      out[g] = {
        complete,
        standings: table,
        qualified,
        tiedAtCutoff: qualified.length ? [] : contestedNames,
        needsTiebreaker: contestedNames.length > 0 && tb.length === 0,
        tiebreakerGenerated: tb.length > 0,
        tiebreakerResolved: tbResolved,
      };
    }

    res.json({ advancePerGroup: advance, groups: out });
  } catch (err) {
    console.error('Qualification error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/tournaments/:id/tiebreakers — super admin.
// For every group whose round-robin is complete and has MORE tied teams than open
// spots, build a per-group SINGLE-ELIMINATION playoff (win or go home). Byes are
// assigned by a stable draw (seedOf) since tied teams are equal on points.
router.post('/:id/tiebreakers', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found.' });
    const advance = tournament.advancePerGroup || 2;

    const matches = await Match.find({ tournament: tournament._id });
    const idset = new Set();
    matches.forEach((m) => { if (m.teamA) idset.add(String(m.teamA)); if (m.teamB) idset.add(String(m.teamB)); });
    const teams = await Team.find({ _id: { $in: [...idset] } }).select('teamName');
    const nameById = {}; teams.forEach((t) => { nameById[String(t._id)] = t.teamName; });

    const byGroup = {};
    matches.forEach((m) => { const g = m.group || '-'; (byGroup[g] = byGroup[g] || []).push(m); });

    let bracketsMade = 0, matchesMade = 0;
    for (const [g, gMatches] of Object.entries(byGroup)) {
      if (!groupGamesComplete(gMatches)) continue;
      if (gMatches.some((m) => m.isTiebreaker)) continue; // already generated

      const table = rankGroup(gMatches.filter((m) => !m.isTiebreaker), nameById);
      if (table.length <= advance) continue;

      const lastIn = table[advance - 1];
      const tied = table.filter((t) => t.wins === lastIn.wins && t.gameWinDiff === lastIn.gameWinDiff);
      const clearIn = table.filter((t) =>
        t.wins > lastIn.wins || (t.wins === lastIn.wins && t.gameWinDiff > lastIn.gameWinDiff)
      );
      const spotsLeft = advance - clearIn.length;

      // Only a real contest needs a playoff: more tied teams than open spots.
      if (tied.length < 2 || tied.length <= spotsLeft) continue;

      const ordered = [...tied]
        .sort((x, y) => seedOf(x.teamId) - seedOf(y.teamId)) // stable draw → byes to the top
        .map((t) => t.teamId);
      matchesMade += await generateGroupSingleElim(tournament._id, g, ordered);
      bracketsMade++;
    }

    if (!bracketsMade) {
      return res.status(400).json({ message: 'No unresolved cutoff ties found. Either no ties, groups incomplete, or tiebreakers already exist.' });
    }
    res.status(201).json({ message: 'Single-elimination tiebreaker(s) generated.', brackets: bracketsMade, matches: matchesMade });
  } catch (err) {
    console.error('Generate tiebreakers error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// Fisher–Yates shuffle for the random draw.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// POST /api/tournaments/:id/bracket
// ML = single-elimination (scales to any power-of-two N) + 3rd-place match.
// Physical sports = double-elimination.
router.post('/:id/bracket', authenticate, authorize('super_admin'), async (req, res) => {
  try {
        const tournament = await Tournament.findById(req.params.id).populate('sport', 'name tournamentFormat');
    if (!tournament) return res.status(404).json({ message: 'Tournament not found.' });

    const existing = await Match.findOne({ tournament: tournament._id, bracket: { $in: ['winners', 'losers', 'final', 'third'] } });
    if (existing) return res.status(409).json({ message: 'A bracket already exists for this tournament.' });

    const teamIds = Array.isArray(req.body.teamIds) ? req.body.teamIds : [];
    const n = teamIds.length;
    // Knockout needs a power of two (4, 8, 16, 32) so every round halves cleanly — no byes.
    const isPowerOfTwo = n >= 4 && (n & (n - 1)) === 0;
    if (!isPowerOfTwo) {
      return res.status(400).json({
        message: `The knockout needs a power-of-two team count (4, 8, 16, or 32); received ${n}. Adjust your group settings so a clean number advances.`,
      });
    }

        // By format, not by name — a new esport with a round-robin draw needs the
    // same single-elimination knockout that Mobile Legends gets.
    const isML = tournament.sport?.tournamentFormat === 'round_robin';

    const shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    const seeds = shuffle(teamIds);

    const mk = async (bracket, round, bestOf, teamA = null, teamB = null) => {
      const m = await Match.create({ tournament: tournament._id, bracket, round, teamA, teamB, bestOf, status: 'scheduled' });
      return m._id;
    };
    const wire = (id, win, lose) => Match.updateOne({ _id: id }, { $set: { nextMatchWin: win, nextMatchLose: lose } });

    if (isML) {
      // SINGLE ELIMINATION + 3RD PLACE — scales to any power-of-two N (8/16/32).
      const numRounds = Math.log2(n);                          // 16 teams → 4 rounds
      const bestOfFor = (round) => (round === numRounds ? 5 : 3); // final BO5, rest BO3

      const roundMatches = {};
      for (let r = 1; r <= numRounds; r++) {
        const matchesInRound = n / Math.pow(2, r);
        const bracket = r === numRounds ? 'final' : 'winners';
        roundMatches[r] = [];
        for (let i = 0; i < matchesInRound; i++) {
          if (r === 1) {
            roundMatches[r].push(await mk('winners', r, bestOfFor(r), seeds[i * 2], seeds[i * 2 + 1]));
          } else {
            roundMatches[r].push(await mk(bracket, r, bestOfFor(r)));
          }
        }
      }

      // 3rd-place match (BO3) for the two semifinal losers.
      const third = await mk('third', numRounds, 3);

      // Wire winners advancement; semifinal losers → 3rd-place, earlier losers eliminated.
      for (let r = 1; r < numRounds; r++) {
        const thisRound = roundMatches[r];
        const nextRound = roundMatches[r + 1];
        const isSemifinal = r === numRounds - 1;
        for (let i = 0; i < thisRound.length; i++) {
          const winnerTo = nextRound[Math.floor(i / 2)];
          const loserTo = isSemifinal ? third : null;
          await wire(thisRound[i], winnerTo, loserTo);
        }
      }
        } else {
      // Physical sports build their knockout from group qualifiers via
      // /de-bracket, which seeds A1–B2 properly. The hardcoded 8-team
      // double-elim that lived here silently ignored any team past the eighth.
      return res.status(400).json({
        message: 'This sport uses group double-elimination — generate its knockout from the group qualifiers instead.',
      });
    }

    tournament.stage = 'elimination';
    await tournament.save();

    const total = await Match.countDocuments({ tournament: tournament._id, bracket: { $in: ['winners', 'losers', 'final', 'third'] } });
    res.status(201).json({ message: 'Bracket generated.', matches: total, format: isML ? 'single_elimination' : 'double_elimination' });
  } catch (err) {
    console.error('Bracket generation error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// GET /api/tournaments/:id/bracket — public; the elimination matches, grouped by bracket/round.
router.get('/:id/bracket', async (req, res) => {
  try {
    const matches = await Match.find({ tournament: req.params.id, bracket: { $in: ['winners', 'losers', 'final', 'third', 'knockout', 'ko_final', 'ko_third'] } })
      .populate('teamA', 'teamName').populate('teamB', 'teamName').populate('seriesWinner', 'teamName')
      .sort({ bracket: 1, round: 1, createdAt: 1 });
    res.json({ matches });
  } catch (err) {
    console.error('Get bracket error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// POST /api/tournaments/:id/simulate-groups — DEV ONLY: auto-score all group matches.
// Assigns clean results that avoid cutoff ties, so testing can skip manual entry.
// REMOVE BEFORE DEPLOYMENT.
router.post('/:id/simulate-groups', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const matches = await Match.find({
      tournament: req.params.id,
      bracket: 'group',
      status: { $ne: 'completed' },
    });
    if (matches.length === 0) {
      return res.status(400).json({ message: 'No unscored group matches to simulate.' });
    }

    // To avoid cutoff ties, give each team a deterministic "strength" from its id,
    // and let the stronger team win. Stable + tie-avoiding across a group.
    const strength = (id) => {
      const s = String(id);
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
      return h;
    };

    let scored = 0;
    for (const m of matches) {
      if (!m.teamA || !m.teamB) continue;
      const aStr = strength(m.teamA), bStr = strength(m.teamB);
      const aWins = aStr >= bStr; // deterministic winner
      const scoreA = aWins ? 1 : 0;
      const scoreB = aWins ? 0 : 1;
      const winner = aWins ? m.teamA : m.teamB;
      m.games = [{ gameNumber: 1, scoreA, scoreB, winner }];
      m.seriesWinner = winner;
      m.status = 'completed';
      await m.save();
      scored++;
    }

    res.json({ message: `Simulated ${scored} group match(es).`, scored });
  } catch (err) {
    console.error('Simulate groups error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// TEMP DEV ROUTE — test one group's double-elim generation. REMOVE before deploy.
router.post('/:id/test-de', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body.teamIds) ? req.body.teamIds : [];
    if (ids.length < 2) return res.status(400).json({ message: 'Need at least 2 team ids.' });
    const result = await generateGroupDoubleElim(req.params.id, req.body.group || 'A', ids);
    res.status(201).json({ message: 'Double-elim group generated.', ...result });
  } catch (err) {
    console.error('test-de error:', err); res.status(500).json({ message: err.message });
  }
});
// GET /api/tournaments/:id/de-qualification — physical sports (double-elim groups).
// Per group: the 2 qualifiers, tagged with rank (1 = upper-bracket winner,
// 2 = lower-bracket winner). Item 3 uses these tags for standard Top 8 seeding.
router.get('/:id/de-qualification', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found.' });

    const matches = await Match.find({ tournament: tournament._id })
      .populate('teamA', 'teamName').populate('teamB', 'teamName').populate('seriesWinner', 'teamName');

    // group -> its winners/losers matches
    const byGroup = {};
    matches.forEach((m) => {
      if (m.bracket !== 'winners' && m.bracket !== 'losers') return;
      const g = m.group || '-';
      (byGroup[g] = byGroup[g] || []).push(m);
    });

    const out = {};
    let allComplete = Object.keys(byGroup).length > 0;

    for (const [g, gm] of Object.entries(byGroup)) {
      const complete = gm.every((m) => m.status === 'completed');
      if (!complete) allComplete = false;

      // Upper final = the 'winners' match with no nextMatchWin. Lower final = the
      // 'losers' match with no nextMatchWin. (2-team edge case: one match is both.)
      const upperFinal = gm.find((m) => m.bracket === 'winners' && !m.nextMatchWin);
      const lowerFinal = gm.find((m) => m.bracket === 'losers' && !m.nextMatchWin);

      const qualifiers = [];
      if (upperFinal && upperFinal.seriesWinner) {
        qualifiers.push({ seed: 1, teamId: String(upperFinal.seriesWinner._id), teamName: upperFinal.seriesWinner.teamName });
      }
      if (lowerFinal && lowerFinal.seriesWinner) {
        qualifiers.push({ seed: 2, teamId: String(lowerFinal.seriesWinner._id), teamName: lowerFinal.seriesWinner.teamName });
      } else if (!lowerFinal && upperFinal && upperFinal.status === 'completed') {
        // 2-team group: the single decider's loser is the #2 qualifier.
        const loserId = String(upperFinal.seriesWinner._id) === String(upperFinal.teamA?._id)
          ? upperFinal.teamB : upperFinal.teamA;
        if (loserId) qualifiers.push({ seed: 2, teamId: String(loserId._id), teamName: loserId.teamName });
      }

      out[g] = { complete, qualifiers };
    }

    res.json({ allComplete, qualifierCount: Object.values(out).reduce((n, x) => n + x.qualifiers.length, 0), groups: out });
  } catch (err) {
    console.error('DE qualification error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// POST /api/tournaments/:id/de-bracket — physical sports.
// Reads the 8 group qualifiers (2 per group, tagged by seed) and builds the
// Top 8 single-elimination knockout with STANDARD seeding (group winners kept
// apart from same-group runners-up) + a 3rd-place match. Reuses the same
// single-elim structure as Mobile Legends, but seeded (not shuffled).
router.post('/:id/de-bracket', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found.' });

    // Don't double-build the finals.
    const existing = await Match.findOne({ tournament: tournament._id, bracket: 'ko_final' });
    if (existing) return res.status(409).json({ message: 'A knockout bracket already exists for this tournament.' });

    // Pull the 2 qualifiers per group, tagged seed 1 (upper) / seed 2 (lower).
    const matches = await Match.find({ tournament: tournament._id });
    const byGroup = {};
    matches.forEach((m) => {
      if (m.bracket !== 'winners' && m.bracket !== 'losers') return;
      const g = m.group || '-';
      (byGroup[g] = byGroup[g] || []).push(m);
    });

    const q = {}; // e.g. q['A1'] = teamId
    let ready = true;
    for (const [g, gm] of Object.entries(byGroup)) {
      if (!gm.every((m) => m.status === 'completed')) { ready = false; break; }
      const upperFinal = gm.find((m) => m.bracket === 'winners' && !m.nextMatchWin);
      const lowerFinal = gm.find((m) => m.bracket === 'losers' && !m.nextMatchWin);
      if (upperFinal && upperFinal.seriesWinner) q[`${g}1`] = String(upperFinal.seriesWinner);
      if (lowerFinal && lowerFinal.seriesWinner) q[`${g}2`] = String(lowerFinal.seriesWinner);
      else if (!lowerFinal && upperFinal && upperFinal.status === 'completed') {
        q[`${g}2`] = String(upperFinal.seriesWinner) === String(upperFinal.teamA) ? String(upperFinal.teamB) : String(upperFinal.teamA);
      }
    }

    // Standard 8-seed order: same-group teams apart, group winners spread out.
    const order = ['A1', 'B2', 'C1', 'D2', 'B1', 'A2', 'D1', 'C2'];
    if (!ready || order.some((k) => !q[k])) {
      return res.status(400).json({ message: 'All 4 groups must be fully played and produce 8 qualifiers first.' });
    }
    const seeds = order.map((k) => q[k]); // seeded team ids, in bracket slot order

    // --- build single-elim Top 8 + 3rd place (same structure as ML) ---
    const mk = async (bracket, round, bestOf, teamA = null, teamB = null) => {
      const m = await Match.create({ tournament: tournament._id, bracket, round, teamA, teamB, bestOf, status: 'scheduled' });
      return m._id;
    };
    const wire = (id, win, lose) => Match.updateOne({ _id: id }, { $set: { nextMatchWin: win, nextMatchLose: lose } });

    const n = 8, numRounds = 3;                    // 8 → QF, SF, Final
    const bestOfFor = (r) => (r === numRounds ? 5 : 3); // final BO5, rest BO3

    const roundMatches = {};
    for (let r = 1; r <= numRounds; r++) {
      const cnt = n / Math.pow(2, r);
      const bracket = r === numRounds ? 'ko_final' : 'knockout';
      roundMatches[r] = [];
      for (let i = 0; i < cnt; i++) {
        if (r === 1) roundMatches[r].push(await mk('knockout', r, bestOfFor(r), seeds[i * 2], seeds[i * 2 + 1]));
        else roundMatches[r].push(await mk(bracket, r, bestOfFor(r)));
      }
    }
    const third = await mk('ko_third', numRounds, 3);

    for (let r = 1; r < numRounds; r++) {
      const isSemi = r === numRounds - 1;
      for (let i = 0; i < roundMatches[r].length; i++) {
        await wire(roundMatches[r][i], roundMatches[r + 1][Math.floor(i / 2)], isSemi ? third : null);
      }
    }

    tournament.stage = 'elimination';
    await tournament.save();

    const total = await Match.countDocuments({ tournament: tournament._id, bracket: { $in: ['knockout', 'ko_final', 'ko_third'] } });
    res.status(201).json({ message: 'Top 8 knockout generated (standard seeding + 3rd place).', matches: total });
  } catch (err) {
    console.error('DE bracket error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// PATCH /api/tournaments/matches/:matchId/schedule — super admin sets or clears
// one match's date. body: { schedule: "2026-09-12" | null }
router.patch('/matches/:matchId/schedule', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) return res.status(404).json({ message: 'Match not found.' });

    if (req.body.schedule !== undefined) {
      if (req.body.schedule === null || req.body.schedule === '') {
        match.schedule = null;
           } else {
        // Browser inputs carry no timezone — read them as Manila, not as the
        // server's own zone, which is UTC in production.
        const d = parseManila(req.body.schedule);
        if (!d) return res.status(400).json({ message: 'Invalid date.' });
        match.schedule = d;
      }
    }
    if (req.body.venue !== undefined) match.venue = String(req.body.venue).trim();

    await match.save();
    res.json({ message: 'Schedule updated.', matchId: match._id, schedule: match.schedule, venue: match.venue });
  } catch (err) {
    console.error('Set schedule error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/tournaments/:id/schedule-bulk — super admin dates many matches at once.
// body: { schedule: "2026-09-12", round?: 1, group?: "A", bracket?: "winners" }
// At least one filter is required so a mistaken call can't re-date a whole tournament.
router.post('/:id/schedule-bulk', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found.' });

        const d = parseManila(req.body.schedule);
    if (!d) return res.status(400).json({ message: 'Invalid date.' });

    const filter = { tournament: tournament._id };
    if (req.body.round != null) filter.round = Number(req.body.round);
    if (req.body.group) filter.group = req.body.group;
    if (req.body.bracket) filter.bracket = req.body.bracket;

    if (Object.keys(filter).length === 1) {
      return res.status(400).json({ message: 'Give at least one of: round, group, or bracket.' });
    }

        const set = { schedule: d };
    if (req.body.venue !== undefined) set.venue = String(req.body.venue).trim();
    const result = await Match.updateMany(filter, { $set: set });
    res.json({ message: `Scheduled ${result.modifiedCount} match(es).`, updated: result.modifiedCount });
  } catch (err) {
    console.error('Bulk schedule error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// POST /api/tournaments/matches/:matchId/revert — SUPER ADMIN.
// Undoes a COMPLETED match: pulls both teams back out of the matches they were
// advanced into, discards the score, periods and player stats, and returns it to
// 'scheduled' so the organizer can score it properly.
//
// Deliberately NOT a score editor. Editing the number directly would bypass
// PlayerMatchStats and the period record, leaving a result nothing supports.
//
// Refuses when anything downstream has already started: unwinding a chain of
// matches automatically is how a bracket ends up half-rolled-back. The admin
// cancels the downstream match first, then comes back here.
router.post('/matches/:matchId/revert', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) return res.status(404).json({ message: 'Match not found.' });
        if (!['completed', 'forfeited'].includes(match.status)) {
      return res.status(409).json({ message: 'Only a completed or forfeited match can be reverted.' });
    }

    const tournament = await Tournament.findById(match.tournament);

    // The final decided the champion and closed the tournament. Reopening that
    // is a bigger decision than correcting a score.
    if (['final', 'ko_final'].includes(match.bracket)) {
      return res.status(409).json({
        message: 'This is the final — reverting it would reopen a completed tournament. Delete and regenerate the bracket instead.',
      });
    }

    // Check both destinations before touching anything.
    const downstream = [];
    for (const id of [match.nextMatchWin, match.nextMatchLose]) {
      if (!id) continue;
      const next = await Match.findById(id)
        .populate('teamA', 'teamName').populate('teamB', 'teamName');
      if (!next) continue;
      if (next.status !== 'scheduled') {
        downstream.push(`${next.teamA?.teamName || 'TBD'} vs ${next.teamB?.teamName || 'TBD'} (${next.status})`);
      }
    }
    if (downstream.length) {
      return res.status(409).json({
        message: `A later match has already started: ${downstream.join('; ')}. Cancel it first, then revert this one.`,
      });
    }

    // Remove the teams BY ID. placeInto fills the first empty slot, so the team
    // could be sitting in either teamA or teamB — clearing by position would
    // evict whoever else was already there.
    const pullOut = async (nextId, teamId) => {
      if (!nextId || !teamId) return;
      const next = await Match.findById(nextId);
      if (!next) return;
      if (String(next.teamA) === String(teamId)) next.teamA = null;
      else if (String(next.teamB) === String(teamId)) next.teamB = null;
      await next.save();
    };

    const winner = match.seriesWinner;
    const loser = String(winner) === String(match.teamA) ? match.teamB : match.teamA;
    await pullOut(match.nextMatchWin, winner);
    await pullOut(match.nextMatchLose, loser);

    await PlayerMatchStats.deleteMany({ match: match._id });

    match.status = 'scheduled';
    match.seriesWinner = null;
    match.games = [];
    match.liveScoreA = 0;
    match.liveScoreB = 0;
    match.startedAt = null;
    match.mvp = null;
    match.enteredBy = null;
    match.enteredAt = null;
    await match.save();

    // A tiebreaker or knockout result can close a tournament's stage; reverting
    // one has to reopen it or the bracket page stops showing the group stage.
    if (tournament && tournament.stage === 'completed') {
      tournament.stage = 'elimination';
      await tournament.save();
    }

    res.json({ message: 'Match reverted. The organizer can score it again.', matchId: match._id });
  } catch (err) {
    console.error('Revert match error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
module.exports = router;