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
    if (teams.length < 2) {
      return res.status(400).json({ message: `Need at least 2 verified teams; found ${teams.length}.` });
    }

    // Super Admin chooses the group count; default to 1 group (single pool) if omitted.
    let numGroups = parseInt(req.body.numGroups, 10);
    if (!Number.isInteger(numGroups) || numGroups < 1) numGroups = 1;
    const maxGroups = Math.floor(teams.length / 2);
    if (numGroups > Math.max(1, maxGroups)) {
      return res.status(400).json({
        message: `Too many groups for ${teams.length} teams. Each group needs at least 2 teams, so use at most ${Math.max(1, maxGroups)} group(s).`,
      });
    }

    let advancePerGroup = parseInt(req.body.advancePerGroup, 10);
    if (!Number.isInteger(advancePerGroup) || advancePerGroup < 1) advancePerGroup = 2;

    // Shuffle then snake-distribute so groups are as even as possible (differ by ≤1).
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const groupNames = LABELS.slice(0, numGroups);
    const buckets = {};
    groupNames.forEach((g) => { buckets[g] = []; });
    shuffled.forEach((team, i) => { buckets[groupNames[i % numGroups]].push(team); });

    const tournament = await Tournament.create({
      sport: sport._id,
      season: season._id,
      format: 'round_robin',
      stage: 'group_stage',
      groups: groupNames,
      advancePerGroup,
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
      numGroups,
      advancePerGroup,
      groupSizes,
      matches: docs.length,
    });
  } catch (err) {
    console.error('Generate tournament error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/tournaments/matches/:matchId/result  { scoreA, scoreB }  — super admin or the assigned organizer.
router.post('/matches/:matchId/result', authenticate, authorize('super_admin', 'organizer'), async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) return res.status(404).json({ message: 'Match not found.' });
    if (match.status === 'completed') return res.status(409).json({ message: 'This match already has a result.' });
    if (!match.teamA || !match.teamB) return res.status(400).json({ message: 'This match is missing a team.' });

    // Organizer may only score their assigned sport.
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

    const winner = a > b ? match.teamA : match.teamB; // winner derived from the score, never chosen
    match.games = [{ gameNumber: 1, scoreA: a, scoreB: b, winner }];
    match.seriesWinner = winner;
    match.status = 'completed';
    match.enteredBy = req.user.id;
    match.enteredAt = new Date();
    await match.save();

    res.json({ message: 'Result recorded.', matchId: match._id, winner });
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
      } else if (tiedAtCutoff.length > 0 && tbResolved) {
        // Cutoff tie was resolved by playoff: teams above the tie qualify outright,
        // then fill remaining spots using the playoff mini-standings among the tied teams.
        const clearIn = table.filter(
          (t) => t.wins > table[advance - 1].wins ||
                 (t.wins === table[advance - 1].wins && t.gameWinDiff > table[advance - 1].gameWinDiff)
        );
        const spotsLeft = advance - clearIn.length;
        const playoffRank = rankGroup(tb, nameById); // rank the tied teams by their playoff games
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

// POST /api/tournaments/:id/tiebreakers — super admin; generate playoff matches for tied groups.
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

      // Round-robin among just the tied teams to decide the spot(s).
      const rounds = roundRobinRounds(tied.map((t) => t.teamId));
      rounds.forEach((pairs, ri) => pairs.forEach(([a, b]) => created.push({
        tournament: tournament._id, bracket: 'group', group: g, round: 100 + ri, // 100+ = playoff rounds
        teamA: a, teamB: b, bestOf: 1, isTiebreaker: true, status: 'scheduled',
      })));
    }

    if (!created.length) {
      return res.status(400).json({ message: 'No unresolved cutoff ties found. Either no ties, groups incomplete, or tiebreakers already exist.' });
    }
    await Match.insertMany(created);
    res.status(201).json({ message: 'Tiebreaker matches generated.', matches: created.length });
  } catch (err) {
    console.error('Generate tiebreakers error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;