const express = require('express');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const PlayerMatchStats = require('../models/PlayerMatchStats');
const Sport = require('../models/Sport');
const { authenticate, authorize } = require('../middleware/auth');
const { isManilaToday } = require('../config/time');

const router = express.Router();
router.use(authenticate, authorize('organizer', 'super_admin'));

// How each sport is scored live.
//   player — every point belongs to a player (basketball)
//   rally  — player points PLUS a team button for points the opponent gave away
//   final  — no per-player scoring; the organizer records who won each game
const SCORING_MODE = {
  'Basketball': 'player',
  'Badminton': 'rally',
  'Pickleball': 'rally',
  'Volleyball': 'rally',
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
// Which point values a sport can score in one action. Basketball has 1/2/3;
// rally sports only ever add a single point.
const POINT_VALUES = {
  'Basketball': [1, 2, 3],
  'Badminton': [1],
  'Pickleball': [1],
  'Volleyball': [1],
};
// Which stats each sport records beyond points. Fouls only belong where the
// sport actually has them.
const STAT_TYPES = {
  'Basketball': ['foul', 'rebound', 'assist'],
  'Volleyball': [],
  'Badminton': [],
  'Pickleball': [],
};
// How many players are on court at once — the scoring screen shows only these,
// so an organizer isn't scrolling a 15-player roster mid-game.
const ON_COURT = {
  'Basketball': 5,
  'Volleyball': 6,
};

// A configured sport wins; otherwise the built-in default for one of the seven
// seeded sports; otherwise something safe. A sport nobody has configured still
// works, and a configured one no longer depends on its name.
function rulesFor(sport) {
  const name = sport?.name;
  return {
    scoringMode: sport?.scoringMode || SCORING_MODE[name] || 'final',
    pointValues: sport?.pointValues?.length ? sport.pointValues : (POINT_VALUES[name] || [1]),
    periodLabel: sport?.periodLabel || PERIOD_LABEL[name] || 'period',
    periodOptions: sport?.periodOptions?.length ? sport.periodOptions : (PERIOD_OPTIONS[name] || [1, 3, 5, 7]),
    statTypes: sport?.statTypes?.length ? sport.statTypes : (STAT_TYPES[name] || []),
    onCourt: sport?.onCourt ?? ON_COURT[name] ?? null,
  };
}

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
    return { match, tournament: t, sportName: t.sport.name, sport: t.sport };
}

// GET /api/organizer/matches — every match in this organizer's sport, newest first.
router.get('/matches', async (req, res) => {
  try {
    const sportId = req.user.role === 'organizer' ? req.user.assignedSport : req.query.sportId;
    if (!sportId) return res.status(400).json({ message: 'No sport assigned.' });

    const sport = await Sport.findById(sportId);
        const tournaments = await Tournament.find({ sport: sportId }).select('_id division');
    const tIds = tournaments.map((t) => t._id);
    const divisionByTournament = {};
    tournaments.forEach((t) => { divisionByTournament[String(t._id)] = t.division || 'open'; });

    // barangay comes along so the courtside screen can show crests rather than
    // blank tiles; division so a U17 match can't be mistaken for a U30 one.
    const matches = await Match.find({ tournament: { $in: tIds } })
      .populate('teamA', 'teamName barangay').populate('teamB', 'teamName barangay')
      .sort({ status: 1, round: 1, createdAt: 1 });

    res.json({
      sport: sport?.name,
            scoringMode: rulesFor(sport).scoringMode,
      matches: matches.map((m) => ({
        ...m.toObject(),
        division: divisionByTournament[String(m.tournament)] || 'open',
      })),
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
      .populate('teamA', 'teamName barangay').populate('teamB', 'teamName barangay')
      .populate('mvp', 'firstName lastName');
            res.json({
      match: full,
            ...rulesFor(ctx.sport),
      rosterA, rosterB, statByPlayer,
            division: ctx.tournament.division || 'open',
      sport: sportName,
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


    // Soft schedule check: warn but allow. Dates are an organisational aid, not an
    // integrity control — an organizer must never be blocked from recording a game
    // that is actually being played. A match with no date is always startable.
        if (match.schedule && !req.body.confirmOffSchedule && !isManilaToday(match.schedule)) {
      const sched = new Date(match.schedule);
      return res.status(409).json({
        message: `This match is scheduled for ${sched.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}. Start it anyway?`,
        needsConfirmation: true,
        scheduledFor: match.schedule,
      });
    }

    // How many periods (quarters/sets) this match runs. Organizer decides at start.
    const periods = Number(req.body.periods ?? 1);
       if (![1, 2, 3, 4, 5, 7].includes(periods)) {
            return res.status(400).json({ message: 'periods must be 1, 2, 3, 4, 5, or 7.' });
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
            periodLabel: rulesFor(ctx.sport).periodLabel,
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
        // Once every period has been banked, the match is done scoring — the only
    // remaining action is ending it. Otherwise stray points would land in the
    // running total with no period to belong to, and the periods would stop
    // summing to the final score.
        const totalPeriods = match.bestOf || 1;
    const tied = (match.liveScoreA || 0) === (match.liveScoreB || 0);
    if (match.games.length >= totalPeriods && !tied) {
      return res.status(409).json({
        message: `All ${totalPeriods} period(s) are recorded. End the match to finish.`,
      });
    }

    const { side, playerId } = req.body;
    const points = Number(req.body.points);
    if (!['A', 'B'].includes(side)) return res.status(400).json({ message: 'side must be "A" or "B".' });
        // The cap comes from the sport's own point values, so a configured sport
    // isn't stuck with basketball's 1/2/3 ceiling.
    const maxPoints = Math.max(...rulesFor(ctx.sport).pointValues, 1);
    if (!Number.isInteger(points) || Math.abs(points) > maxPoints || points === 0) {
      return res.status(400).json({ message: `points must be a non-zero integer between -${maxPoints} and ${maxPoints}.` });
    }

            const mode = rulesFor(ctx.sport).scoringMode;
    let applied = points;   // what actually gets added to the team tally

    if (mode === 'player' && !playerId) {
      return res.status(400).json({ message: `${sportName} is scored per player — pick a player.` });
    }

    // Rally sports attribute a point to a player when there is one; a team point
    // (opponent error) arrives with no playerId and credits nobody.
    if ((mode === 'player' || mode === 'rally') && playerId) {
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
        if (applied > 0) {
      const p = playerId ? await Player.findById(playerId).select('lastName') : null;
      match.lastAction = {
        type: 'points', side, player: playerId || null, amount: applied,
        label: `+${applied} ${p?.lastName || (side === 'A' ? 'team A' : 'team B')}`,
      };
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

// POST /api/organizer/matches/:matchId/stat
// body: { playerId, type: 'foul'|'rebound'|'assist', delta?: 1|-1 }
// One route for every non-scoring stat, so adding another later is a list entry
// rather than a new endpoint.
router.post('/matches/:matchId/stat', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match, sportName } = ctx;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Start the match first.' });

    const type = req.body.type;
        const allowed = rulesFor(ctx.sport).statTypes;
    if (!allowed.includes(type)) {
      return res.status(400).json({ message: `${sportName} doesn't record ${type || 'that stat'}.` });
    }
    if (!req.body.playerId) return res.status(400).json({ message: 'playerId is required.' });

    const delta = Number(req.body.delta ?? 1);
    if (![1, -1].includes(delta)) return res.status(400).json({ message: 'delta must be 1 or -1.' });

    const field = type === 'foul' ? 'fouls' : type === 'rebound' ? 'rebounds' : 'assists';
    const existing = await PlayerMatchStats.findOne({ match: match._id, player: req.body.playerId });
    if (delta === -1 && (existing?.[field] || 0) === 0) {
      return res.status(400).json({ message: `That player has no ${type} to undo.` });
    }

    const stat = await PlayerMatchStats.findOneAndUpdate(
      { match: match._id, player: req.body.playerId },
      { $inc: { [field]: delta } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    if (delta === 1) {
      const p = await Player.findById(req.body.playerId).select('lastName');
      match.lastAction = {
        type, side: null, player: req.body.playerId, amount: 1,
        label: `${type} ${p?.lastName || ''}`.trim(),
      };
      await match.save();
    }

    res.json({ message: 'Recorded.', playerId: req.body.playerId, [field]: stat[field] });
  } catch (err) {
    console.error('Stat error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/organizer/matches/:matchId/undo — reverses the last action.
router.post('/matches/:matchId/undo', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'The match is not running.' });

    const last = match.lastAction;
    if (!last || !last.type) return res.status(400).json({ message: 'Nothing to undo.' });

    if (last.type === 'points') {
      const field = last.side === 'A' ? 'liveScoreA' : 'liveScoreB';
      match[field] = Math.max(0, (match[field] || 0) - last.amount);
      if (last.player) {
        await PlayerMatchStats.updateOne(
          { match: match._id, player: last.player },
          { $inc: { points: -last.amount } }
        );
      }
    } else {
      const field = last.type === 'foul' ? 'fouls' : last.type === 'rebound' ? 'rebounds' : 'assists';
      await PlayerMatchStats.updateOne(
        { match: match._id, player: last.player },
        { $inc: { [field]: -1 } }
      );
    }

    match.lastAction = { type: null, side: null, player: null, amount: 0, label: '' };
    await match.save();

    res.json({ message: 'Undone.', liveScoreA: match.liveScoreA, liveScoreB: match.liveScoreB });
  } catch (err) {
    console.error('Undo error:', err);
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
      // A tie can't stand — allow an extra deciding period rather than trapping
      // the organizer with no legal action.
      if ((match.liveScoreA || 0) === (match.liveScoreB || 0)) {
        match.bestOf = total + 1;
      } else {
        return res.status(409).json({ message: `All ${total} ${PERIOD_LABEL[sportName] || 'period'}(s) are recorded. End the match.` });
      }
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
// POST /api/organizer/matches/:matchId/cancel — undo a started match.
// Resets it to 'scheduled' and discards everything recorded: live score, periods,
// and per-player stats. For a match started by mistake or one that must be voided.
// A completed match cannot be cancelled — its winner has already advanced through
// the bracket, so undoing that needs an admin-level correction.
router.post('/matches/:matchId/cancel', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;

    if (match.status === 'completed') {
      return res.status(409).json({ message: 'This match is already finished and cannot be cancelled.' });
    }
    if (match.status !== 'ongoing') {
      return res.status(409).json({ message: 'This match has not been started.' });
    }

    await PlayerMatchStats.deleteMany({ match: match._id });

    match.status = 'scheduled';
    match.liveScoreA = 0;
    match.liveScoreB = 0;
    match.games = [];
    match.startedAt = null;
    match.mvp = null;
    await match.save();

    res.json({ message: 'Match cancelled and reset.', matchId: match._id, status: match.status });
  } catch (err) {
    console.error('Cancel match error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// POST /api/organizer/matches/:matchId/forfeit  body: { forfeitingSide: 'A'|'B' }
// A no-show is known before tip-off, so this is only available on a match that
// hasn't started. Recorded 1–0 so the result reads clearly and the bracket
// advances by the same rules as any other match; the 'forfeited' status is what
// tells everyone why the score looks like that.
router.post('/matches/:matchId/forfeit', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;

    if (match.status === 'completed' || match.status === 'forfeited') {
      return res.status(409).json({ message: 'This match already has a result.' });
    }
    if (match.status === 'ongoing') {
      return res.status(409).json({ message: 'Cancel the match first, then record the forfeit.' });
    }
    if (!match.teamA || !match.teamB) {
      return res.status(400).json({ message: 'This match is still waiting for a team.' });
    }

    const losing = req.body.forfeitingSide;
    if (!['A', 'B'].includes(losing)) {
      return res.status(400).json({ message: 'Pick which team forfeited.' });
    }

    const winner = losing === 'A' ? match.teamB : match.teamA;
    const loser = losing === 'A' ? match.teamA : match.teamB;

    match.liveScoreA = losing === 'A' ? 0 : 1;
    match.liveScoreB = losing === 'B' ? 0 : 1;
    match.games = [{
      gameNumber: 1,
      scoreA: match.liveScoreA,
      scoreB: match.liveScoreB,
      winner,
    }];
    match.seriesWinner = winner;
    match.status = 'forfeited';
    match.enteredBy = req.user.id;
    match.enteredAt = new Date();
    await match.save();

    // Same advancement as a played match — a forfeit still sends someone through.
    const placeInto = async (nextId, teamId) => {
      if (!nextId || !teamId) return;
      const next = await Match.findById(nextId);
      if (!next) return;
      if (!next.teamA) next.teamA = teamId;
      else if (!next.teamB) next.teamB = teamId;
      await next.save();
    };

    if (match.isTiebreaker) {
      await placeInto(match.nextMatchWin, winner);
    } else if (['winners', 'losers', 'final', 'knockout', 'ko_final'].includes(match.bracket)) {
      await placeInto(match.nextMatchWin, winner);
      await placeInto(match.nextMatchLose, loser);
      if (match.bracket === 'final' || match.bracket === 'ko_final') {
        const t = await Tournament.findById(match.tournament);
        if (t) { t.stage = 'completed'; await t.save(); }
      }
    }

    res.json({ message: 'Forfeit recorded.', matchId: match._id, winner: String(winner) });
  } catch (err) {
    console.error('Forfeit error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;