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
    if (match.bracket === 'winners' || match.bracket === 'losers' || match.bracket === 'final') {
      await placeInto(match.nextMatchWin, winner);   // winner moves on
      await placeInto(match.nextMatchLose, loser);   // loser drops (winners bracket → losers bracket)
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

    const out = {};
    for (const [g, gMatches] of Object.entries(byGroup)) {
      const complete = groupGamesComplete(gMatches);
      const table = rankGroup(gMatches.filter((m) => !m.isTiebreaker), nameById);

      // A cutoff tie = teams sharing the same (wins, gameWinDiff) that spans the advance line.
      let tiedAtCutoff = [];
      if (complete && table.length > advance) {
        const lastIn = table[advance - 1];
        tiedAtCutoff = table.filter(
          (t) => t.wins === lastIn.wins && t.gameWinDiff === lastIn.gameWinDiff
        );
        // Only a real problem if more teams are tied here than remaining spots at that level.
        if (tiedAtCutoff.length < 2) tiedAtCutoff = [];
      }

      // Existing tiebreaker matches for this group (if already generated).
     // Existing tiebreaker matches for this group (if already generated).
      const tb = gMatches.filter((m) => m.isTiebreaker);
      const tbResolved = tb.length > 0 && tb.every((m) => m.status === 'completed');

      // Final qualifiers.
      let qualified = [];
      if (complete && tiedAtCutoff.length === 0) {
        // No cutoff tie — straightforward top-N.
        qualified = table.slice(0, advance).map((t) => t.teamName);
      }  else if (tiedAtCutoff.length > 0 && tbResolved) {
        const clearIn = table.filter(
          (t) => t.wins > table[advance - 1].wins ||
                 (t.wins === table[advance - 1].wins && t.gameWinDiff > table[advance - 1].gameWinDiff)
        );
        const spotsLeft = advance - clearIn.length;
        let playoffRank = rankGroup(tb, nameById);

        // FALLBACK: persistent tie after the playoff → stable random draw (drawing of lots).
        if (playoffRank.length > spotsLeft) {
          const cut = playoffRank[spotsLeft - 1];
          const stillTied = playoffRank.filter(
            (t) => t.wins === cut.wins && t.gameWinDiff === cut.gameWinDiff
          );
          if (stillTied.length > 1) {
            resolvedByDraw = true;
            const seedOf = (id) => {
              const s = String(id); let h = 0;
              for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000007;
              return h;
            };
            const clearlyRanked = playoffRank.filter(
              (t) => t.wins > cut.wins || (t.wins === cut.wins && t.gameWinDiff > cut.gameWinDiff)
            );
            const drawnTied = [...stillTied].sort((x, y) => seedOf(x.teamId) - seedOf(y.teamId));
            playoffRank = [...clearlyRanked, ...drawnTied];
          }
        }

        qualified = [
          ...clearIn.map((t) => t.teamName),
          ...playoffRank.slice(0, spotsLeft).map((t) => t.teamName),
        ];
      }

      out[g] = {
        complete,
        standings: table,
        qualified,
        tiedAtCutoff: (qualified.length ? [] : tiedAtCutoff.map((t) => t.teamName)),
        needsTiebreaker: tiedAtCutoff.length > 0 && tb.length === 0,
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

// POST /api/tournaments/:id/tiebreakers — super admin; single-elimination playoff for tied groups.
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

    const created = [];
    for (const [g, gMatches] of Object.entries(byGroup)) {
      if (!groupGamesComplete(gMatches)) continue;
      if (gMatches.some((m) => m.isTiebreaker)) continue; // already generated
      const table = rankGroup(gMatches.filter((m) => !m.isTiebreaker), nameById);
      if (table.length <= advance) continue;
      const lastIn = table[advance - 1];
      const tied = table.filter((t) => t.wins === lastIn.wins && t.gameWinDiff === lastIn.gameWinDiff);
      if (tied.length < 2) continue;

      // SINGLE-ELIMINATION among the tied teams. Random draw (fair, since they're equal).
      // Byes for non-power-of-two counts go to randomly-drawn teams.
      const drawn = shuffle(tied.map((t) => t.teamId));
      const size = Math.pow(2, Math.ceil(Math.log2(drawn.length))); // next power of 2
      const byes = size - drawn.length; // this many teams skip round 1

      // Teams with byes sit out round 1; the rest pair up.
      const byeTeams = drawn.slice(0, byes);
      const playingTeams = drawn.slice(byes);

      // Round 1 (playoff round 100): pair up the non-bye teams.
      const round1 = [];
      for (let i = 0; i < playingTeams.length; i += 2) {
        round1.push({
          tournament: tournament._id, bracket: 'group', group: g, round: 100,
          teamA: playingTeams[i], teamB: playingTeams[i + 1],
          bestOf: 1, isTiebreaker: true, status: 'scheduled',
        });
      }
      created.push(...round1);

      // Note: later rounds (semis/final of the playoff) get generated as round-1 completes,
      // OR we pre-create empty slots. For simplicity with small N, we pre-create the tree.
      // For 2 teams: 1 match, done. For 3: 1 R1 match + 1 final (bye team vs R1 winner).
      // For 4: 2 R1 matches + 1 final.
      const totalSlots = size / 2; // matches in round 1 of a full bracket of `size`
      // Number of rounds:
      const numRounds = Math.log2(size);
      // Pre-create empty later-round matches so advancement has somewhere to go.
      // (Advancement wiring handled by the result route via nextMatch — but tiebreakers
      //  are simpler; we mark them and let qualification rank by playoff results.)
    }

    if (!created.length) {
      return res.status(400).json({ message: 'No unresolved cutoff ties found.' });
    }
    await Match.insertMany(created);
    res.status(201).json({ message: 'Tiebreaker playoff generated.', matches: created.length });
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