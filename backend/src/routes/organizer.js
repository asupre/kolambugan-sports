const express = require('express');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const PlayerMatchStats = require('../models/PlayerMatchStats');
const Sport = require('../models/Sport');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, authorize('organizer', 'super_admin'));

// Which sports are scored live per player, per side, or not at all.
const SCORING_MODE = {
  'Basketball': 'player',
  'Badminton': 'player',
  'Pickleball': 'player',
  'Volleyball': 'side',
  'Billiards': 'final',
  'Chess': 'final',
  'Mobile Legends': 'final',
};
// What a period is called per sport (display only — the mechanics are identical:
// score accumulates across all periods, winner is the higher total).
const PERIOD_LABEL = {
  'Basketball': 'quarter',
  'Volleyball': 'set',
  'Badminton': 'set',
  'Pickleball': 'set',
};
// Sensible period counts per sport, so an organizer can't pick 7 quarters of basketball.
const PERIOD_OPTIONS = {
  'Basketball': [4],
  'Volleyball': [1, 3, 5],
  'Badminton': [1, 3, 5],
  'Pickleball': [1, 3, 5],
};

// Load a match and confirm this organizer owns its sport.
async function loadOwnedMatch(req, res) {
  const match = await Match.findById(req.params.matchId);
  if (!match) { res.status(404).json({ message: 'Match not found.' }); return null; }
  const t = await Tournament.findById(match.tournament).populate('sport', 'name');
  if (!t) { res.status(404).json({ message: 'Tournament not found.' }); return null; }
  if (req.user.role === 'organizer' && String(req.user.assignedSport) !== String(t.sport._id)) {
    res.status(403).json({ message: 'You can only score matches for your assigned sport.' });
    return null;
  }
  return { match, tournament: t, sportName: t.sport.name };
}

// GET /api/organizer/matches — every match in this organizer's sport, newest first.
router.get('/matches', async (req, res) => {
  try {
    const sportId = req.user.role === 'organizer' ? req.user.assignedSport : req.query.sportId;
    if (!sportId) return res.status(400).json({ message: 'No sport assigned.' });

    const sport = await Sport.findById(sportId);
    const tournaments = await Tournament.find({ sport: sportId }).select('_id division');
    const tIds = tournaments.map((t) => t._id);

    const matches = await Match.find({ tournament: { $in: tIds } })
      .populate('teamA', 'teamName').populate('teamB', 'teamName')
      .sort({ status: 1, round: 1, createdAt: 1 });

    res.json({
      sport: sport?.name,
      scoringMode: SCORING_MODE[sport?.name] || 'final',
      matches,
    });
  } catch (err) {
    console.error('Organizer matches error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/organizer/matches/:matchId — one match with both rosters + live stats.
router.get('/matches/:matchId', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match, sportName } = ctx;

    const rosterFor = async (teamId) => {
      if (!teamId) return [];
      const links = await TeamPlayer.find({ team: teamId }).populate('player');
      return links.map((l) => l.player).filter(Boolean);
    };
    const [rosterA, rosterB] = await Promise.all([rosterFor(match.teamA), rosterFor(match.teamB)]);

    const stats = await PlayerMatchStats.find({ match: match._id }).lean();
    const statByPlayer = {};
    stats.forEach((s) => { statByPlayer[String(s.player)] = { points: s.points, fouls: s.fouls }; });

    const full = await Match.findById(match._id)
      .populate('teamA', 'teamName').populate('teamB', 'teamName').populate('mvp', 'firstName lastName');

            res.json({
      match: full,
      scoringMode: SCORING_MODE[sportName] || 'final',
      periodOptions: PERIOD_OPTIONS[sportName] || [1, 3, 5, 7],
      periodLabel: PERIOD_LABEL[sportName] || 'period',
      rosterA, rosterB, statByPlayer,
    });
  } catch (err) {
    console.error('Organizer match detail error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/organizer/matches/:matchId/start   body: { periods }
router.post('/matches/:matchId/start', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match, sportName } = ctx;
    if (match.status === 'completed') return res.status(409).json({ message: 'This match is already finished.' });
    if (!match.teamA || !match.teamB) return res.status(400).json({ message: 'This match is still waiting for a team.' });

    // How many periods (quarters/sets) this match runs. Organizer decides at start.
    const periods = Number(req.body.periods ?? 1);
       if (![1, 2, 3, 4, 5, 7].includes(periods)) {
      return res.status(400).json({ message: 'periods must be 1, 3, 4, 5, or 7.' });
    }
    match.bestOf = periods;

    match.status = 'ongoing';
    match.startedAt = match.startedAt || new Date();
    match.games = [];               // periods get banked here as they finish
    match.liveScoreA = 0;
    match.liveScoreB = 0;
    await match.save();

    res.json({
      message: 'Match started.',
      matchId: match._id,
      status: match.status,
      periods,
      periodLabel: PERIOD_LABEL[sportName] || 'period',
    });
  } catch (err) {
    console.error('Start match error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/organizer/matches/:matchId/score
// body: { side: 'A'|'B', points: 1|2|3, playerId? }
// Player mode credits the player AND the team; side mode credits the team only.
// Negative points are allowed so an organizer can undo a mis-tap.
router.post('/matches/:matchId/score', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match, sportName } = ctx;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Start the match before scoring.' });

    const { side, playerId } = req.body;
    const points = Number(req.body.points);
    if (!['A', 'B'].includes(side)) return res.status(400).json({ message: 'side must be "A" or "B".' });
    if (!Number.isInteger(points) || Math.abs(points) > 3 || points === 0) {
      return res.status(400).json({ message: 'points must be a non-zero integer between -3 and 3.' });
    }

    const mode = SCORING_MODE[sportName] || 'final';
        let applied = points;   // what actually gets added to the team tally

    if (mode === 'player') {
      if (!playerId) return res.status(400).json({ message: `${sportName} is scored per player — pick a player.` });
      const teamId = side === 'A' ? match.teamA : match.teamB;
      const onTeam = await TeamPlayer.findOne({ team: teamId, player: playerId });
      if (!onTeam) return res.status(400).json({ message: 'That player is not on that team.' });

      const stat = await PlayerMatchStats.findOne({ match: match._id, player: playerId });
      const current = stat?.points || 0;
      // Never let a player go negative; only apply what they actually have to give back.
      applied = Math.max(points, -current);
      if (applied === 0) {
        return res.status(400).json({ message: 'That player has no points to undo.' });
      }

      await PlayerMatchStats.findOneAndUpdate(
        { match: match._id, player: playerId },
        { $inc: { points: applied } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
    }

        const field = side === 'A' ? 'liveScoreA' : 'liveScoreB';
    match[field] = Math.max(0, (match[field] || 0) + applied);
    await match.save();

    res.json({ message: 'Scored.', liveScoreA: match.liveScoreA, liveScoreB: match.liveScoreB });
  } catch (err) {
    console.error('Score error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/organizer/matches/:matchId/foul  body: { playerId, delta?: 1|-1 }
router.post('/matches/:matchId/foul', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Start the match first.' });

        const delta = Number(req.body.delta ?? 1);
    if (![1, -1].includes(delta)) return res.status(400).json({ message: 'delta must be 1 or -1.' });
    if (!req.body.playerId) return res.status(400).json({ message: 'playerId is required.' });

    const existing = await PlayerMatchStats.findOne({ match: match._id, player: req.body.playerId });
    if (delta === -1 && (existing?.fouls || 0) === 0) {
      return res.status(400).json({ message: 'That player has no fouls to undo.' });
    }

    const stat = await PlayerMatchStats.findOneAndUpdate(
      { match: match._id, player: req.body.playerId },
      { $inc: { fouls: delta } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    res.json({ message: 'Foul recorded.', playerId: req.body.playerId, fouls: stat.fouls });
  } catch (err) {
    console.error('Foul error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/organizer/matches/:matchId/mvp-suggestion — top scorer in this match.
router.get('/matches/:matchId/mvp-suggestion', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const top = await PlayerMatchStats.find({ match: req.params.matchId })
      .sort({ points: -1 }).limit(1).populate('player', 'firstName lastName');
    res.json({ suggestion: top[0] || null });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// POST /api/organizer/matches/:matchId/end
// Finalizes a live match: writes the live tally into games[], sets seriesWinner,
// marks it completed, records the MVP, and routes both teams through the locked
// bracket wiring. Advancement is SCORE-DRIVEN — the organizer never picks a winner.
// body: { mvpPlayerId? }
router.post('/matches/:matchId/end', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;

        if (match.status === 'completed') return res.status(409).json({ message: 'This match already has a result.' });
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Start the match before ending it.' });

    const total = match.bestOf || 1;
    if (match.games.length < total) {
      return res.status(409).json({
        message: `All ${total} ${PERIOD_LABEL[ctx.sportName] || 'period'}(s) must be recorded first — ${match.games.length} done.`,
      });
    }

    const a = match.liveScoreA || 0;
    const b = match.liveScoreB || 0;
    if (a === b) return res.status(400).json({ message: 'A match cannot end in a tie — the score must separate the teams.' });

    const winner = a > b ? match.teamA : match.teamB;
    const loser = a > b ? match.teamB : match.teamA;

    // MVP: whoever the organizer confirms (must be on one of the two rosters).
    if (req.body.mvpPlayerId) {
      const onEither = await TeamPlayer.findOne({
        team: { $in: [match.teamA, match.teamB] },
        player: req.body.mvpPlayerId,
      });
      if (!onEither) return res.status(400).json({ message: 'The MVP must be a player in this match.' });
      match.mvp = req.body.mvpPlayerId;
    }

        // games[] already holds each period's snapshot; stamp the overall winner on the last one.
    if (match.games.length) match.games[match.games.length - 1].winner = winner;
    match.seriesWinner = winner;
    match.status = 'completed';
    match.enteredBy = req.user.id;
    match.enteredAt = new Date();
    await match.save();

    // --- ADVANCEMENT (same rules as the admin result route) ---
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
      await placeInto(match.nextMatchWin, winner);
      advanced = match.nextMatchWin ? { winnerTo: match.nextMatchWin } : { tiebreakerWinner: String(winner) };
    } else if (['winners', 'losers', 'final', 'knockout', 'ko_final'].includes(match.bracket)) {
      await placeInto(match.nextMatchWin, winner);
      await placeInto(match.nextMatchLose, loser);
      advanced = { winnerTo: match.nextMatchWin, loserTo: match.nextMatchLose };

      if (match.bracket === 'final' || match.bracket === 'ko_final') {
        const t = await Tournament.findById(match.tournament);
        if (t) { t.stage = 'completed'; await t.save(); }
        advanced = { champion: String(winner) };
      }
    }

    res.json({
      message: 'Match completed.',
      matchId: match._id,
      finalScore: { a, b },
      winner: String(winner),
      advanced,
    });
  } catch (err) {
    console.error('End match error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// POST /api/organizer/matches/:matchId/end-period
// Banks a snapshot of the running score as one completed period. The score does
// NOT reset — it accumulates across all periods, and the winner is the higher total.
router.post('/matches/:matchId/end-period', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match, sportName } = ctx;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Start the match first.' });

    const played = match.games.length;
    const total = match.bestOf || 1;
    if (played >= total) {
      return res.status(409).json({ message: `All ${total} ${PERIOD_LABEL[sportName] || 'period'}(s) are already recorded. End the match.` });
    }
    // Bank only what was scored DURING this period (the running total minus
    // everything already banked), so the periods read like a scoresheet and
    // sum to the final score.
    const bankedA = match.games.reduce((n, g) => n + (g.scoreA || 0), 0);
    const bankedB = match.games.reduce((n, g) => n + (g.scoreB || 0), 0);

    match.games.push({
      gameNumber: played + 1,
      scoreA: (match.liveScoreA || 0) - bankedA,
      scoreB: (match.liveScoreB || 0) - bankedB,
      winner: null,
    });
    await match.save();

    res.json({
      message: `${PERIOD_LABEL[sportName] || 'Period'} ${played + 1} recorded.`,
      periodsPlayed: match.games.length,
      periods: total,
      runningScore: { a: match.liveScoreA, b: match.liveScoreB },
    });
  } catch (err) {
    console.error('End period error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;