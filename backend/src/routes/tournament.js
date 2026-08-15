const express = require('express');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const Team = require('../models/Team');
const Sport = require('../models/Sport');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');

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

// POST /api/tournaments/generate
// body: { sportId, numGroups?, advancePerGroup? }
// Super admin builds a grouped round-robin from the verified teams.
router.post('/generate', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.status(409).json({ message: 'No active season.' });

    const sport = await Sport.findById(req.body.sportId);
    if (!sport) return res.status(404).json({ message: 'Sport not found.' });

    if (await Tournament.findOne({ sport: sport._id, season: season._id })) {
      return res.status(409).json({ message: 'A tournament for this sport already exists this season. Delete it to regenerate.' });
    }

    const isRoundRobin = sport.name === 'Mobile Legends' || sport.tournamentFormat === 'round_robin';
    if (!isRoundRobin) {
      return res.status(400).json({ message: 'Grouped round-robin is available now; double-elimination is the next block.' });
    }

    const teams = await Team.find({ sport: sport._id, season: season._id, status: 'verified' });

    // Knockout size drives everything: always 8 groups.
    // Top 8  -> advance 1 per group.  Top 16 -> advance 2 per group.
    const knockoutSize = parseInt(req.body.knockoutSize, 10);
    if (![8, 16].includes(knockoutSize)) {
      return res.status(400).json({ message: 'Knockout size must be 8 or 16.' });
    }
    // Need at least as many verified teams as the knockout size.
    if (teams.length < knockoutSize) {
      return res.status(400).json({
        message: `A Top ${knockoutSize} knockout needs at least ${knockoutSize} verified teams; found ${teams.length}.`,
      });
    }

    const NUM_GROUPS = 8;
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
      // Single-elim tiebreaker: only the winner advances (loser is eliminated).
      // The last match has no nextMatchWin → its winner is the group's decider.
      await placeInto(match.nextMatchWin, winner);
      advanced = match.nextMatchWin
        ? { winnerTo: match.nextMatchWin }
        : { tiebreakerWinner: String(winner) };
    } else if (match.bracket === 'winners' || match.bracket === 'losers' || match.bracket === 'final') {
      await placeInto(match.nextMatchWin, winner);   // winner moves on
      await placeInto(match.nextMatchLose, loser);   // loser drops (winners → losers)
      advanced = { winnerTo: match.nextMatchWin, loserTo: match.nextMatchLose };

      // Grand final has no nextMatch → its winner is the champion.
      if (match.bracket === 'final') {
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
    const tournament = await Tournament.findById(req.params.id).populate('sport', 'name');
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

// DELETE /api/tournaments/:id  — super admin; removes a tournament + its matches (to regenerate).
router.delete('/:id', authenticate, authorize('super_admin'), async (req, res) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'Tournament not found.' });
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
    const tournament = await Tournament.findById(req.params.id).populate('sport', 'name');
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

    const isML = tournament.sport?.name === 'Mobile Legends';

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
      // DOUBLE ELIMINATION (physical sports) — still hardcoded for 8 teams (arbitrary-N is next).
      const bestOf = 3;
      const wqf = [];
      for (let i = 0; i < 4; i++) wqf.push(await mk('winners', 1, bestOf, seeds[i * 2], seeds[i * 2 + 1]));
      const wsf = [await mk('winners', 2, bestOf), await mk('winners', 2, bestOf)];
      const wf = await mk('winners', 3, bestOf);
      const lr1 = [await mk('losers', 1, bestOf), await mk('losers', 1, bestOf)];
      const lr2 = [await mk('losers', 2, bestOf), await mk('losers', 2, bestOf)];
      const lr3 = await mk('losers', 3, bestOf);
      const lf = await mk('losers', 4, bestOf);
      const gf = await mk('final', 1, bestOf);
      await wire(wqf[0], wsf[0], lr1[0]); await wire(wqf[1], wsf[0], lr1[0]);
      await wire(wqf[2], wsf[1], lr1[1]); await wire(wqf[3], wsf[1], lr1[1]);
      await wire(wsf[0], wf, lr2[0]); await wire(wsf[1], wf, lr2[1]);
      await wire(wf, gf, lf);
      await wire(lr1[0], lr2[0], null); await wire(lr1[1], lr2[1], null);
      await wire(lr2[0], lr3, null); await wire(lr2[1], lr3, null);
      await wire(lr3, lf, null); await wire(lf, gf, null);
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
    const matches = await Match.find({ tournament: req.params.id, bracket: { $in: ['winners', 'losers', 'final', 'third'] } })
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
module.exports = router;