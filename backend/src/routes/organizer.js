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
const { getCurrentSeason } = require('../middleware/season');

const router = express.Router();
router.use(authenticate, authorize('organizer', 'super_admin'));
const { PERIOD_LABEL, LEGACY_STAT_COLUMNS, rulesFor } = require('../lib/sportRules');

// Games-won sports (chess, billiards, esports — scoringMode 'final') play a SERIES: the organizer
// picks its length at start (stored in bestOf, like a sport's period count), and it ends as soon
// as one side has won a majority of it — best of 3 = first to 2, best of 5 = first to 3.
const isGamesWon = (sport) => rulesFor(sport).scoringMode === 'final';
const winsNeeded = (bestOf) => Math.floor((bestOf || 1) / 2) + 1;


// Load a match and confirm this organizer owns its sport.
async function loadOwnedMatch(req, res) {
  const match = await Match.findById(req.params.matchId);
  if (!match) { res.status(404).json({ message: 'Match not found.' }); return null; }
  // The rule fields ride along: rulesFor() reads them, and with only `name` populated a
  // sport's saved point values / period settings were silently ignored by the routes.
  const t = await Tournament.findById(match.tournament)
    .populate('sport', 'name category pointValues periodLabel periodOptions scoreSheet customStats');
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
    // Current season only — without this, a new season still listed last season's
    // matches (scheduled and completed) on the organizer's screen.
    const season = await getCurrentSeason();
    if (!season) return res.json({ sport: sport?.name, scoringMode: rulesFor(sport).scoringMode, matches: [] });
    const tournaments = await Tournament.find({ sport: sportId, season: season._id }).select('_id division');
    const tIds = tournaments.map((t) => t._id);
    const divisionByTournament = {};
    tournaments.forEach((t) => { divisionByTournament[String(t._id)] = t.division || 'open'; });

    // barangay comes along so the courtside screen can show crests rather than
    // blank tiles; division so a U15 match can't be mistaken for a U30 one.
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
    stats.forEach((s) => {
      statByPlayer[String(s.player)] = {
        points: s.points, fouls: s.fouls, rebounds: s.rebounds, assists: s.assists, role: s.role || '',
        ...(s.extra || {}),
      };
    });

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
    if (match.status === 'completed' || match.status === 'forfeited') return res.status(409).json({ message: 'This match is already finished.' });
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
// body: { side: 'A'|'B', points: 1|2|3 }
// Scoring is by TEAM only — nothing is credited to a player while the game runs (player
// stats are entered on the post-match form, see PUT /stats). Negative points are allowed so
// an organizer can undo a mis-tap.
router.post('/matches/:matchId/score', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Start the match before scoring.' });

    // Games-won series: each tap is one game won, recorded straight into games[] (there are
    // no periods to bank), and scoring stops once a side has won the majority of the series.
    if (isGamesWon(ctx.sport)) {
      const { side } = req.body;
      if (!['A', 'B'].includes(side)) return res.status(400).json({ message: 'side must be "A" or "B".' });
      if (Number(req.body.points) !== 1) {
        return res.status(400).json({ message: 'Record one game at a time; use Undo to take one back.' });
      }
      const a = match.liveScoreA || 0;
      const b = match.liveScoreB || 0;
      if (Math.max(a, b) >= winsNeeded(match.bestOf)) {
        return res.status(409).json({
          message: `The series is decided (${a}–${b}, best of ${match.bestOf || 1}). End the match to finish.`,
        });
      }
      const teamId = side === 'A' ? match.teamA : match.teamB;
      const team = await Team.findById(teamId).select('teamName');
      const gameNumber = match.games.length + 1;
      match.games.push({
        gameNumber,
        scoreA: side === 'A' ? 1 : 0,
        scoreB: side === 'B' ? 1 : 0,
        winner: teamId,
      });
      if (side === 'A') match.liveScoreA = a + 1; else match.liveScoreB = b + 1;
      match.lastAction = {
        type: 'game', side, player: null, amount: 1,
        label: `${team?.teamName || (side === 'A' ? 'team A' : 'team B')} won game ${gameNumber}`,
      };
      await match.save();
      return res.json({ message: 'Game recorded.', liveScoreA: match.liveScoreA, liveScoreB: match.liveScoreB });
    }

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

    const { side } = req.body;
    const points = Number(req.body.points);
    if (!['A', 'B'].includes(side)) return res.status(400).json({ message: 'side must be "A" or "B".' });
    // The cap comes from the sport's own point values, so a configured sport
    // isn't stuck with basketball's 1/2/3 ceiling.
    const maxPoints = Math.max(...rulesFor(ctx.sport).pointValues, 1);
    if (!Number.isInteger(points) || Math.abs(points) > maxPoints || points === 0) {
      return res.status(400).json({ message: `points must be a non-zero integer between -${maxPoints} and ${maxPoints}.` });
    }

    const field = side === 'A' ? 'liveScoreA' : 'liveScoreB';
    if (points > 0) {
      const team = await Team.findById(side === 'A' ? match.teamA : match.teamB).select('teamName');
      match.lastAction = {
        type: 'points', side, player: null, amount: points,
        label: `+${points} ${team?.teamName || (side === 'A' ? 'team A' : 'team B')}`,
      };
    }
    match[field] = Math.max(0, (match[field] || 0) + points);
    await match.save();

    res.json({ message: 'Scored.', liveScoreA: match.liveScoreA, liveScoreB: match.liveScoreB });
  } catch (err) {
    console.error('Score error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/organizer/matches/:matchId/undo — reverses the last score tap.
router.post('/matches/:matchId/undo', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'The match is not running.' });

    const last = match.lastAction;
    if (!last || !['points', 'game'].includes(last.type)) return res.status(400).json({ message: 'Nothing to undo.' });

    const field = last.side === 'A' ? 'liveScoreA' : 'liveScoreB';
    match[field] = Math.max(0, (match[field] || 0) - last.amount);
    // A games-won tap also wrote a games[] entry — take that back too.
    if (last.type === 'game' && match.games.length) match.games.pop();
    match.lastAction = { type: null, side: null, player: null, amount: 0, label: '' };
    await match.save();

    res.json({ message: 'Undone.', liveScoreA: match.liveScoreA, liveScoreB: match.liveScoreB });
  } catch (err) {
    console.error('Undo error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// PUT /api/organizer/matches/:matchId/stats
// body: { players: [{ playerId, points?, assists?, fouls?, rebounds?, role? }], mvpPlayerId? }
// The POST-MATCH form: the organizer totals each player's game from the scoresheet and enters
// it here. Only on a finished match, and can be re-saved to correct it. Which fields count
// comes from the sport (`statFields`), and `role` only exists for esports (`roles`). A player
// whose row is all zeros with no role is treated as "didn't play" and has no record at all.
// Player totals are NOT forced to equal the team score — the screen shows the difference, but
// an official must never be blocked from saving what is on the sheet.
router.put('/matches/:matchId/stats', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    if (match.status !== 'completed') {
      return res.status(409).json({ message: 'Player stats are entered after the match is finished.' });
    }

    const rules = rulesFor(ctx.sport);
    const rows = Array.isArray(req.body.players) ? req.body.players : [];

    const links = await TeamPlayer.find({ team: { $in: [match.teamA, match.teamB] } }).select('player team');
    const onRoster = new Set(links.map((l) => String(l.player)));
    // Which side each player is on, for the points cap below.
    const sideOf = {};
    links.forEach((l) => { sideOf[String(l.player)] = String(l.team) === String(match.teamA) ? 'A' : 'B'; });

    // Validate everything first so a bad row can't leave the form half-saved.
    const clean = [];
    for (const r of rows) {
      const id = String(r?.playerId || '');
      if (!onRoster.has(id)) return res.status(400).json({ message: 'A player in the form is not on either team.' });

      const doc = { player: id, $set: {} };
      for (const f of rules.statFields) {
        const v = r[f] === '' || r[f] == null ? 0 : Number(r[f]);
        if (!Number.isInteger(v) || v < 0 || v > 999) {
          return res.status(400).json({ message: `${f} must be a whole number from 0 to 999.` });
        }
        // The original four are real columns; every other sheet column lives under `extra`.
        doc.$set[LEGACY_STAT_COLUMNS.includes(f) ? f : `extra.${f}`] = v;
      }
      const role = r.role ? String(r.role).trim() : '';
      if (role && !rules.roles.includes(role)) {
        return res.status(400).json({ message: `"${role}" is not a role for ${ctx.sportName}.` });
      }
      doc.$set.role = role || null;
      doc.empty = !role && Object.values(doc.$set).every((v) => v === 0 || v === null);
      clean.push(doc);
    }

    // Players can't score more than their team did (Oct 2026). Only for sports scored by
    // POINTS, where the team score is a points total; a games-won sport (chess, billiards,
    // esports) keeps its score as games, so a "points" column there isn't capped by it.
    if (rules.scoringMode !== 'final' && rules.statFields.includes('points')) {
      const sum = { A: 0, B: 0 };
      for (const d of clean) {
        const side = sideOf[d.player];
        if (side) sum[side] += Number(d.$set.points) || 0;
      }
      for (const [side, team, score] of [['A', match.teamA, match.liveScoreA || 0], ['B', match.teamB, match.liveScoreB || 0]]) {
        if (sum[side] > score) {
          const name = (await Team.findById(team).select('teamName'))?.teamName || 'a team';
          return res.status(400).json({
            message: `${name}'s players add up to ${sum[side]} points, but the team scored ${score}. Player points can't be more than the team's score.`,
          });
        }
      }
    }

    let mvp = match.mvp || null;
    if ('mvpPlayerId' in req.body) {
      if (req.body.mvpPlayerId && !onRoster.has(String(req.body.mvpPlayerId))) {
        return res.status(400).json({ message: 'The MVP must be a player in this match.' });
      }
      mvp = req.body.mvpPlayerId || null;
    }

    let saved = 0;
    for (const d of clean) {
      if (d.empty) {
        await PlayerMatchStats.deleteOne({ match: match._id, player: d.player });
      } else {
        await PlayerMatchStats.findOneAndUpdate(
          { match: match._id, player: d.player },
          { $set: d.$set },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );
        saved += 1;
      }
    }
    match.mvp = mvp;
    await match.save();

    res.json({ message: `Player stats saved (${saved} player${saved === 1 ? '' : 's'}).`, saved });
  } catch (err) {
    console.error('Save stats error:', err);
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

        if (match.status === 'completed' || match.status === 'forfeited') return res.status(409).json({ message: 'This match already has a result.' });
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Start the match before ending it.' });

    const total = match.bestOf || 1;
    const a = match.liveScoreA || 0;
    const b = match.liveScoreB || 0;
    const gamesWon = isGamesWon(ctx.sport);
    if (gamesWon) {
      const need = winsNeeded(total);
      if (Math.max(a, b) < need) {
        return res.status(409).json({
          message: `Best of ${total}: a side needs ${need} game win${need === 1 ? '' : 's'} to take the match — it's ${a}–${b}.`,
        });
      }
    } else if (match.games.length < total) {
      return res.status(409).json({
        message: `All ${total} ${PERIOD_LABEL[ctx.sportName] || 'period'}(s) must be recorded first — ${match.games.length} done.`,
      });
    }

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
    // (A games-won series already recorded each game's own winner.)
    if (!gamesWon && match.games.length) match.games[match.games.length - 1].winner = winner;
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
    if (isGamesWon(ctx.sport)) {
      return res.status(409).json({ message: 'Each game is recorded when you tap its winner. End the match once a side has won the series.' });
    }

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

    if (match.status === 'completed' || match.status === 'forfeited') {
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