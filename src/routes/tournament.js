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

// POST /api/tournaments/generate  { sportId }  — super admin builds the tournament from verified teams.
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
      return res.status(400).json({ message: 'Round-robin generation is available now; double-elimination is the next block.' });
    }

    const teams = await Team.find({ sport: sport._id, season: season._id, status: 'verified' });
    if (teams.length < 2) {
      return res.status(400).json({ message: `Need at least 2 verified teams; found ${teams.length}.` });
    }

    const tournament = await Tournament.create({
      sport: sport._id, season: season._id, format: 'round_robin', stage: 'group_stage',
    });

    const rounds = roundRobinRounds(teams.map((t) => t._id.toString()));
    const docs = [];
    rounds.forEach((pairs, ri) => pairs.forEach(([a, b]) => docs.push({
      tournament: tournament._id, bracket: 'group', round: ri + 1,
      teamA: a, teamB: b, bestOf: 1, status: 'scheduled',
    })));
    await Match.insertMany(docs);

    res.status(201).json({ tournament, teams: teams.length, matches: docs.length, rounds: rounds.length });
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
router.get('/:id/standings', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id).populate('sport', 'name');
    if (!tournament) return res.status(404).json({ message: 'Tournament not found.' });

    const matches = await Match.find({ tournament: tournament._id });
    const ids = new Set();
    matches.forEach((m) => { if (m.teamA) ids.add(String(m.teamA)); if (m.teamB) ids.add(String(m.teamB)); });
    const teams = await Team.find({ _id: { $in: [...ids] } }).select('teamName');
    const nameById = {}; teams.forEach((t) => { nameById[String(t._id)] = t.teamName; });

    const stats = {}; const h2h = {};
    [...ids].forEach((id) => { stats[id] = { teamId: id, teamName: nameById[id] || '?', played: 0, wins: 0, losses: 0, gameWinDiff: 0, points: 0 }; });

    matches.forEach((m) => {
      if (m.status !== 'completed' || !m.seriesWinner) return;
      const a = String(m.teamA), b = String(m.teamB), w = String(m.seriesWinner), l = w === a ? b : a;
      stats[a].played++; stats[b].played++; stats[w].wins++; stats[l].losses++; stats[w].points += 3;
      let ga = 0, gb = 0;
      m.games.forEach((g) => { if (String(g.winner) === a) ga++; else if (String(g.winner) === b) gb++; });
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

    res.json({ tournament: { id: tournament._id, sport: tournament.sport && tournament.sport.name, stage: tournament.stage }, standings: table });
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

module.exports = router;