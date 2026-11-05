const express = require('express');
const mongoose = require('mongoose');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const PlayerMatchStats = require('../models/PlayerMatchStats');
const Sport = require('../models/Sport');
const { authenticate, authorize } = require('../middleware/auth');
const { isManilaToday } = require('../config/time');
const { getCurrentSeason, seasonEnded } = require('../middleware/season');

const router = express.Router();
router.use(authenticate, authorize('organizer', 'super_admin'));
const { PERIOD_LABEL, LEGACY_STAT_COLUMNS, rulesFor } = require('../lib/sportRules');
const { totalPeriods, clockView, freshClock, periodSecondsFor, pauseClock, clockRemaining } = require('../lib/gameClock');

// Games-won sports (chess, billiards, esports — scoringMode 'final') play a SERIES: the organizer
// picks its length at start (stored in bestOf, like a sport's period count), and it ends as soon
// as one side has won a majority of it — best of 3 = first to 2, best of 5 = first to 3.
const isGamesWon = (sport) => rulesFor(sport).scoringMode === 'final';
const winsNeeded = (bestOf) => Math.floor((bestOf || 1) / 2) + 1;
// What "every period" means at End match: a series' length, or the periods incl. overtimes.
const gamesWonTotal = (match, sport) => (isGamesWon(sport) ? (match.bestOf || 1) : totalPeriods(match));


// Load a match and confirm this organizer owns its sport.
async function loadOwnedMatch(req, res) {
  const match = await Match.findById(req.params.matchId);
  if (!match) { res.status(404).json({ message: 'Match not found.' }); return null; }
  // The rule fields ride along: rulesFor() reads them, and with only `name` populated a
  // sport's saved point values / period settings were silently ignored by the routes.
  const t = await Tournament.findById(match.tournament)
    .populate('sport', 'name category entryFormat onCourt pointValues periodLabel periodOptions scoreSheet customStats');
  if (!t) { res.status(404).json({ message: 'Tournament not found.' }); return null; }
  if (req.user.role === 'organizer' && String(req.user.assignedSport) !== String(t.sport._id)) {
    res.status(403).json({ message: 'You can only score matches for your assigned sport.' });
    return null;
  }
  // A completed season is the archive: its matches can be viewed, never changed.
  if (req.method !== 'GET' && await seasonEnded(t.season)) {
    res.status(409).json({ message: 'This season has ended. Its matches can no longer be scored or changed.' });
    return null;
  }
    return { match, tournament: t, sportName: t.sport.name, sport: t.sport };
}

// ---- Jobs (Oct 2026) ------------------------------------------------------------------
// One organizer account, up to three devices per match: the score keeper and one stats keeper
// per team. Each job is claimed by ONE device, identified by a random id the browser tab makes
// for itself and sends as the X-Device-Id header. The routes below check that the device
// asking holds the right job. This separates DEVICES, not people: everyone shares the login.
const JOB_KEYS = ['score', 'statsA', 'statsB'];
const JOB_NAME = { score: 'score keeper', statsA: 'team A stats', statsB: 'team B stats' };
// A job whose device hasn't had the match open for this long can be taken over (a dead phone).
const STALE_MS = 2 * 60 * 1000;
// How often an open screen refreshes its `seen` time (its 3s refresh does it, throttled).
const SEEN_EVERY_MS = 30 * 1000;
const EMPTY_SLOT = { device: null, since: null, seen: null };

function deviceOf(req) {
  const d = String(req.get('x-device-id') || '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(d) ? d : null;
}
const slotOf = (match, key) => match.jobs?.[key] || {};
const holds = (match, req, key) => {
  const d = deviceOf(req);
  return !!d && slotOf(match, key).device === d;
};
const myJobOf = (match, req) => JOB_KEYS.find((k) => holds(match, req, k)) || null;
const isStale = (slot, now = Date.now()) => !slot.seen || now - new Date(slot.seen).getTime() > STALE_MS;

// Refuses the request (403) unless this device holds one of `keys`.
function requireJob(match, req, res, keys, what) {
  if (keys.some((k) => holds(match, req, k))) return true;
  const names = keys.map((k) => JOB_NAME[k]).join(' or ');
  res.status(403).json({
    code: 'not_your_job',
    message: `Only the device holding the ${names} job can ${what}. Pick your job at the top of the match screen.`,
  });
  return false;
}

// What each job looks like to the device asking: free, mine, or held by another device (and
// whether that device has gone quiet). Device ids themselves never leave the server.
function jobsView(match, req, now = Date.now()) {
  const d = deviceOf(req);
  return Object.fromEntries(JOB_KEYS.map((k) => {
    const s = slotOf(match, k);
    const taken = !!s.device;
    return [k, {
      taken,
      mine: taken && s.device === d,
      stale: taken && s.device !== d && isStale(s, now),
      seenSecondsAgo: taken && s.seen ? Math.round((now - new Date(s.seen).getTime()) / 1000) : null,
    }];
  }));
}

// A version filter for an after-match form. A match made before versions existed has no field,
// which counts as version 0.
const versionIs = (path, v) => (v === 0 ? { $or: [{ [path]: 0 }, { [path]: { $exists: false } }] } : { [path]: v });
// The three form versions, as sent back to the browser.
const versionsOut = (m) => ({ A: m.formVersion?.A || 0, B: m.formVersion?.B || 0, result: m.formVersion?.result || 0 });
// A score filter that also matches an older match with no stored score (counts as 0).
const scoreIs = (v) => (v === 0 ? { $in: [0, null] } : v);

// Strip the device ids from a match before it goes to the browser.
function matchOut(doc) {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete o.jobs;
  return o;
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
      seasonEnded: season.status === 'completed',   // the screen goes view-only
      matches: matches.map((m) => ({
        ...matchOut(m),
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

    // This device has the match open: keep its job from looking abandoned (throttled write).
    const now = Date.now();
    const mine = myJobOf(match, req);
    if (mine) {
      const s = slotOf(match, mine);
      if (!s.seen || now - new Date(s.seen).getTime() > SEEN_EVERY_MS) {
        await Match.updateOne(
          { _id: match._id, [`jobs.${mine}.device`]: s.device },
          { $set: { [`jobs.${mine}.seen`]: new Date(now) } }
        );
      }
    }

            res.json({
      match: matchOut(full),
            ...rulesFor(ctx.sport),
      clockNow: clockView(full, now),   // seconds left right now (devices tick from this)
      serverNow: now,
      jobs: jobsView(match, req, now),
      myJob: mine,
      rosterA, rosterB, statByPlayer,
            division: ctx.tournament.division || 'open',
      sport: sportName,
    });
  } catch (err) {
    console.error('Organizer match detail error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/organizer/matches/:matchId/claim   body: { job, confirmSwitch?, takeOver? }
// This device takes a job. A job held by another device can't be taken, unless that device has
// been quiet for STALE_MS (a dead phone) and `takeOver` is sent. One device holds at most one
// job: taking a new one releases the old one; once the match has started that needs
// `confirmSwitch` (the screen asks first).
router.post('/matches/:matchId/claim', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    const d = deviceOf(req);
    if (!d) return res.status(400).json({ message: "This browser didn't identify itself. Reload the page and try again." });
    const job = String(req.body.job || '');
    if (!JOB_KEYS.includes(job)) return res.status(400).json({ message: 'Unknown job.' });
    if (match.status === 'forfeited') return res.status(409).json({ message: 'This match was forfeited; there is nothing to record.' });
    if (job !== 'score' && rulesFor(ctx.sport).statFields.length === 0) {
      return res.status(400).json({ message: `${ctx.sportName} has no live player stats, so there is only the score keeper job.` });
    }

    const current = myJobOf(match, req);
    if (current === job) return res.json({ message: 'This job is already yours.', myJob: job });
    if (current && match.status !== 'scheduled' && !req.body.confirmSwitch) {
      return res.status(409).json({
        code: 'confirm_switch',
        message: `You are the ${JOB_NAME[current]}. Switch to ${JOB_NAME[job]}? Your current job will be free for another device.`,
      });
    }

    const s = slotOf(match, job);
    const path = `jobs.${job}`;
    const ok = [{ [`${path}.device`]: null }, { [`${path}.device`]: d }];
    if (s.device && s.device !== d) {
      if (!isStale(s)) {
        return res.status(409).json({ code: 'job_taken', message: `Another device is already the ${JOB_NAME[job]}.` });
      }
      if (!req.body.takeOver) {
        return res.status(409).json({
          code: 'job_stale',
          message: `Another device holds the ${JOB_NAME[job]} job but hasn't been seen for a while. Take it over? Only do this if that device is no longer in use.`,
        });
      }
      // Take over only if it is still the same quiet device (nothing changed since we looked).
      ok.push({ [`${path}.device`]: s.device, [`${path}.seen`]: s.seen || null });
    }

    const now = new Date();
    const claimed = await Match.findOneAndUpdate(
      { _id: match._id, status: { $ne: 'forfeited' }, $or: ok },
      { $set: { [path]: { device: d, since: now, seen: now } } },
      { returnDocument: 'after' }
    );
    if (!claimed) return res.status(409).json({ code: 'job_taken', message: `Another device just took the ${JOB_NAME[job]} job.` });

    // Free whatever this device held before.
    for (const k of JOB_KEYS) {
      if (k !== job) await Match.updateOne({ _id: match._id, [`jobs.${k}.device`]: d }, { $set: { [`jobs.${k}`]: EMPTY_SLOT } });
    }
    res.json({ message: `You are the ${JOB_NAME[job]}.`, myJob: job });
  } catch (err) {
    console.error('Claim job error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/organizer/matches/:matchId/release   body: { job }
// Frees a job: your own, or (score keeper) a stats job whose phone died, or any job for a
// Super Admin.
router.post('/matches/:matchId/release', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    const job = String(req.body.job || '');
    if (!JOB_KEYS.includes(job)) return res.status(400).json({ message: 'Unknown job.' });
    const allowed = holds(match, req, job)
      || (job !== 'score' && holds(match, req, 'score'))
      || req.user.role === 'super_admin';
    if (!allowed) {
      return res.status(403).json({ code: 'not_your_job', message: 'Only the score keeper can free another device\'s job.' });
    }
    const s = slotOf(match, job);
    if (s.device) await Match.updateOne({ _id: match._id, [`jobs.${job}.device`]: s.device }, { $set: { [`jobs.${job}`]: EMPTY_SLOT } });
    res.json({ message: `The ${JOB_NAME[job]} job is free.` });
  } catch (err) {
    console.error('Release job error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/organizer/matches/:matchId/start   body: { periods }
router.post('/matches/:matchId/start', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match, sportName } = ctx;
    if (!requireJob(match, req, res, ['score'], 'start the match')) return;
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

    // Timed sports: minutes per period, picked at Start (Nov 2026). Overtime length is the rule.
    const timed = rulesFor(ctx.sport).timed;
    if (timed) {
      const minutes = Number(req.body.periodMinutes ?? timed.defaultMinutes);
      if (!timed.minutes.includes(minutes)) {
        return res.status(400).json({ message: `Pick a period length: ${timed.minutes.join(', ')} minutes.` });
      }
      match.periodMinutes = minutes;
      match.overtimeMinutes = timed.overtimeMinutes;
      match.clock = freshClock(minutes * 60);
    } else {
      match.periodMinutes = null;
      match.overtimeMinutes = null;
      match.clock = null;
    }
    match.overtimes = 0;

    // Starting lineup (Oct 2026): for a team sport with an on-court count, the organizer picks
    // who starts for each side in a modal before the match begins. A side whose whole roster
    // fits on court needs no pick (everyone starts).
    const onCourt = rulesFor(ctx.sport).onCourt;
    if (onCourt) {
      for (const [side, teamId] of [['A', match.teamA], ['B', match.teamB]]) {
        const links = await TeamPlayer.find({ team: teamId }).select('player');
        const roster = links.map((l) => String(l.player));
        const picked = req.body[`lineup${side}`];
        let lineup;
        if (Array.isArray(picked)) {
          lineup = [...new Set(picked.map(String))];
          if (lineup.length !== picked.length) return res.status(400).json({ message: 'A player was picked twice.' });
          if (lineup.some((id) => !roster.includes(id))) {
            return res.status(400).json({ message: 'A player in the lineup is not on that team.' });
          }
        } else if (roster.length <= onCourt) {
          lineup = roster;
        } else {
          return res.status(400).json({ message: `Pick the starting ${onCourt} for each team.` });
        }
        if (lineup.length === 0 && roster.length > 0) {
          return res.status(400).json({ message: 'Each team needs at least one player on court.' });
        }
        if (lineup.length > onCourt) {
          return res.status(400).json({ message: `Only ${onCourt} players can be on court per team.` });
        }
        match[`lineup${side}`] = lineup;
      }
    } else {
      match.lineupA = [];
      match.lineupB = [];
    }
    match.subs = [];

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
    if (!requireJob(match, req, res, ['score'], 'change the score')) return;
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
      const played = match.games.length;
      const gameNumber = played + 1;
      // ATOMIC (Oct 2026): written only if the score and the number of games are still what
      // was read above, so a second request at the same moment can't overwrite this one (the
      // loser gets a 409 and the screen refreshes).
      const saved = await Match.findOneAndUpdate(
        { _id: match._id, status: 'ongoing', liveScoreA: scoreIs(a), liveScoreB: scoreIs(b), games: { $size: played } },
        {
          $inc: { [side === 'A' ? 'liveScoreA' : 'liveScoreB']: 1 },
          $push: { games: { gameNumber, scoreA: side === 'A' ? 1 : 0, scoreB: side === 'B' ? 1 : 0, winner: teamId } },
          $set: {
            lastAction: {
              type: 'game', side, player: null, amount: 1,
              label: `${team?.teamName || (side === 'A' ? 'team A' : 'team B')} won game ${gameNumber}`,
            },
          },
        },
        { returnDocument: 'after' }
      );
      if (!saved) return res.status(409).json({ code: 'score_changed', message: 'The score just changed on another request. The screen has been refreshed; check it and tap again if needed.' });
      return res.json({ message: 'Game recorded.', liveScoreA: saved.liveScoreA, liveScoreB: saved.liveScoreB });
    }

    // Once every period has been banked, the match is done scoring — the only
    // remaining action is ending it. Otherwise stray points would land in the
    // running total with no period to belong to, and the periods would stop
    // summing to the final score.
    const periodsTotal = totalPeriods(match);
    const tied = (match.liveScoreA || 0) === (match.liveScoreB || 0);
    // Timed sports: no points until the clock has been started in this period (Nov 2026, Super
    // Admin). Once it has run, points are allowed while it is paused (free throws are shot with
    // the clock stopped) and at 0:00.
    if (match.clock && match.games.length < periodsTotal && !match.clock.started && !match.clock.running) {
      return res.status(409).json({ code: 'clock_not_started', message: 'Start the clock first. Points can be added once this period is under way.' });
    }
    if (match.games.length >= periodsTotal) {
      return res.status(409).json({
        message: tied
          ? 'The scores are level after the last period. Start overtime first.'
          : `All ${periodsTotal} period(s) are recorded. End the match to finish.`,
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
    let action = null;
    if (points > 0) {
      const team = await Team.findById(side === 'A' ? match.teamA : match.teamB).select('teamName');
      action = {
        type: 'points', side, player: null, amount: points,
        label: `+${points} ${team?.teamName || (side === 'A' ? 'team A' : 'team B')}`,
      };
    }
    // ATOMIC (Oct 2026): up to three people work one match on the same account, so a
    // read-add-save could lose a tap that lands at the same moment. $inc can't lose one;
    // a take-back only applies while the score is high enough (never below 0).
    const filter = { _id: match._id, status: 'ongoing' };
    if (points < 0) filter[field] = { $gte: -points };
    const update = { $inc: { [field]: points } };
    if (points > 0) update.$set = { lastAction: action };
    const saved = await Match.findOneAndUpdate(filter, update, { returnDocument: 'after' });
    if (!saved) return res.status(409).json({ message: "Can't take that off: the score is lower than that (it may have just changed). Check the scoreboard." });

    res.json({ message: 'Scored.', liveScoreA: saved.liveScoreA, liveScoreB: saved.liveScoreB });
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
    if (!requireJob(match, req, res, ['score'], 'undo the score')) return;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'The match is not running.' });

    const last = match.lastAction;
    if (!last || !['points', 'game'].includes(last.type)) return res.status(400).json({ message: 'Nothing to undo.' });

    const field = last.side === 'A' ? 'liveScoreA' : 'liveScoreB';
    // ATOMIC (Oct 2026): score taps no longer wait for each other on screen, so a tap can be
    // saving while Undo runs. A read-subtract-save here could write back a score that misses
    // that tap; $inc can't. The filter also makes sure this exact action is still the last
    // one (a second Undo press finds nothing to undo) and never takes the score below 0.
    const filter = {
      _id: match._id, status: 'ongoing',
      'lastAction.type': last.type, 'lastAction.side': last.side, 'lastAction.label': last.label,
      [field]: { $gte: last.amount },
    };
    const update = {
      $inc: { [field]: -last.amount },
      $set: { lastAction: { type: null, side: null, player: null, amount: 0, label: '' } },
    };
    // A games-won tap also wrote a games[] entry — take that back too, only while the game
    // count is still what was read (so it is that tap's game being removed).
    if (last.type === 'game' && match.games.length) {
      update.$pop = { games: 1 };
      filter.games = { $size: match.games.length };
    }
    const saved = await Match.findOneAndUpdate(filter, update, { returnDocument: 'after' });
    if (!saved) return res.status(409).json({ message: 'Nothing to undo (the score may have just changed). Check the scoreboard.' });

    res.json({ message: 'Undone.', liveScoreA: saved.liveScoreA, liveScoreB: saved.liveScoreB });
  } catch (err) {
    console.error('Undo error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/organizer/matches/:matchId/substitute   body: { side: 'A'|'B', outId?, inId? }
// A substitution while the match is live (Oct 2026): `outId` comes off the court and `inId`
// (from the bench) goes on. Either may be left out on its own: inId only = add a player to a
// side that is short (a latecomer), outId only = take a player off (fouled out / injured, no
// one to replace them). Logged in match.subs.
router.post('/matches/:matchId/substitute', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Substitutions are made while the match is live.' });
    const onCourt = rulesFor(ctx.sport).onCourt;
    if (!onCourt) return res.status(400).json({ message: `${ctx.sportName} has no lineup to substitute.` });

    const { side } = req.body;
    if (!['A', 'B'].includes(side)) return res.status(400).json({ message: 'side must be "A" or "B".' });
    const outId = req.body.outId ? String(req.body.outId) : null;
    const inId = req.body.inId ? String(req.body.inId) : null;
    if (!outId && !inId) return res.status(400).json({ message: 'Pick who comes off and who goes in.' });
    if ((outId && !mongoose.isValidObjectId(outId)) || (inId && !mongoose.isValidObjectId(inId))) {
      return res.status(400).json({ message: 'Unknown player.' });
    }
    if (outId && inId && outId === inId) return res.status(400).json({ message: 'Pick two different players.' });
    // The team's own stats keeper or the score keeper (Oct 2026).
    if (!requireJob(match, req, res, [`stats${side}`, 'score'], `substitute for this team`)) return;

    const field = `lineup${side}`;
    const lineup = (match[field] || []).map(String);
    // Friendly messages from what was read; the update below re-checks everything atomically.
    if (outId && !lineup.includes(outId)) {
      return res.status(409).json({ code: 'lineup_changed', message: 'That player is not on court (the lineup may have just changed).' });
    }
    if (inId) {
      const link = await TeamPlayer.findOne({ team: side === 'A' ? match.teamA : match.teamB, player: inId }).select('_id');
      if (!link) return res.status(400).json({ message: 'The player going in is not on that team.' });
      if (lineup.includes(inId)) return res.status(409).json({ code: 'lineup_changed', message: 'That player is already on court.' });
    }
    if (inId && !outId && lineup.length >= onCourt) {
      return res.status(409).json({ code: 'lineup_changed', message: `Only ${onCourt} players can be on court. Pick who comes off.` });
    }

    // ATOMIC (Oct 2026): the score keeper and the team's stats keeper can both substitute, so
    // the lineup is changed in ONE conditional update instead of read-change-save. The filter
    // demands the lineup still looks the way this change expects; if another substitution got
    // there first, nothing is written and the device gets a 409 and refreshes.
    const entry = {
      side, playerOut: outId, playerIn: inId,
      period: Math.min((match.games?.length || 0) + 1, totalPeriods(match)),
      at: new Date(),
      by: myJobOf(match, req),
    };
    const base = { _id: match._id, status: 'ongoing' };
    let filter;
    let update;
    if (outId && inId) {
      // Swap: the outgoing player is in the lineup and the incoming one isn't; `$` is the
      // outgoing player's slot (the element the $eq matched).
      filter = { ...base, [field]: { $eq: outId, $ne: inId } };
      update = { $set: { [`${field}.$`]: inId }, $push: { subs: entry } };
    } else if (inId) {
      // Add only: not already on court, and the lineup is below the court size (no element at
      // index onCourt-1).
      filter = { ...base, [field]: { $ne: inId }, [`${field}.${onCourt - 1}`]: { $exists: false } };
      update = { $push: { [field]: inId, subs: entry } };
    } else {
      // Remove only: the player is on court.
      filter = { ...base, [field]: outId };
      update = { $pull: { [field]: outId }, $push: { subs: entry } };
    }
    const saved = await Match.findOneAndUpdate(filter, update, { returnDocument: 'after' });
    if (!saved) {
      return res.status(409).json({ code: 'lineup_changed', message: 'The lineup just changed on another device. The screen has been refreshed; check who is on court and try again.' });
    }
    res.json({ message: 'Substitution made.', lineupA: saved.lineupA, lineupB: saved.lineupB });
  } catch (err) {
    console.error('Substitute error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/organizer/matches/:matchId/player-stat
// body: { playerId, stat, amount }
// LIVE player stats (Oct 2026, brought back): while the match runs, a stats keeper (one per
// barangay, on the same organizer account as the score keeper) taps a player's points, fouls,
// rebounds… and the public team page picks it up on its next refresh. Player points are
// stats only: they do NOT change the team score (the score keeper owns that). `amount` is
// the tap (points use the sport's point values, everything else 1); a negative amount is
// that device's own Undo and never takes a stat below 0. Atomic, so taps from several
// devices at once can't overwrite each other. The after-match form opens prefilled with
// these numbers for corrections.
router.post('/matches/:matchId/player-stat', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Player stats can be tapped only while the match is live.' });

    const rules = rulesFor(ctx.sport);
    const stat = String(req.body.stat || '');
    if (!rules.statFields.includes(stat)) {
      return res.status(400).json({ message: `"${stat}" isn't on ${ctx.sportName}'s score sheet.` });
    }
    const amount = Number(req.body.amount);
    const max = stat === 'points' ? Math.max(...rules.pointValues, 1) : 1;
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > max) {
      return res.status(400).json({ message: `amount must be a non-zero whole number from -${max} to ${max}.` });
    }

    const playerId = String(req.body.playerId || '');
    if (!mongoose.isValidObjectId(playerId)) return res.status(400).json({ message: 'That player is not on either team.' });
    const link = await TeamPlayer.findOne({ player: playerId, team: { $in: [match.teamA, match.teamB] } }).select('team');
    if (!link) return res.status(400).json({ message: 'That player is not on either team.' });
    // Only that team's stats keeper (Oct 2026).
    const side = String(link.team) === String(match.teamA) ? 'A' : 'B';
    if (!requireJob(match, req, res, [`stats${side}`], "record this team's player stats")) return;

    const path = LEGACY_STAT_COLUMNS.includes(stat) ? stat : `extra.${stat}`;
    let doc;
    if (amount > 0) {
      doc = await PlayerMatchStats.findOneAndUpdate(
        { match: match._id, player: playerId },
        { $inc: { [path]: amount } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
    } else {
      doc = await PlayerMatchStats.findOneAndUpdate(
        { match: match._id, player: playerId, [path]: { $gte: -amount } },
        { $inc: { [path]: amount } },
        { returnDocument: 'after' }
      );
      if (!doc) return res.status(409).json({ message: "Can't take that back: the player's stat is already lower than that." });
    }
    const value = path.startsWith('extra.') ? doc.extra?.[stat] || 0 : doc[stat] || 0;
    res.json({ message: 'Recorded.', playerId, stat, value });
  } catch (err) {
    console.error('Player stat error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// PUT /api/organizer/matches/:matchId/stats?side=A|B
// body: { players: [{ playerId, points?, assists?, fouls?, rebounds?, role? }], version }
// The POST-MATCH form: the organizer totals each player's game from the scoresheet and enters
// it here. Only on a finished match, and can be re-saved to correct it. Which fields count
// comes from the sport (`statFields`), and `role` only exists for esports (`roles`). A player
// whose row is all zeros with no role is treated as "didn't play" and has no record at all.
// Player totals are NOT forced to equal the team score — the screen shows the difference, but
// an official must never be blocked from saving what is on the sheet.
//
// PER TEAM (Oct 2026): `?side=A` saves only team A's rows and is allowed only from the device
// holding team A's stats job. A sport with no live stats has no stats jobs, so there the score
// keeper saves the form, and may leave `side` out to save both teams (`version` is then
// { A, B }). `version` is the form version the device loaded (match.formVersion); a save made
// from an older copy gets a 409 instead of overwriting the newer save. The MVP moved to
// PUT /result.
router.put('/matches/:matchId/stats', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    if (match.status !== 'completed') {
      return res.status(409).json({ message: 'Player stats are entered after the match is finished.' });
    }

    const rules = rulesFor(ctx.sport);
    const sideQ = req.query.side;
    if (sideQ != null && !['A', 'B'].includes(sideQ)) return res.status(400).json({ message: 'side must be A or B.' });
    const sides = sideQ ? [sideQ] : ['A', 'B'];
    const noStatsJobs = rules.statFields.length === 0;
    if (!sideQ && !noStatsJobs) {
      return res.status(400).json({ message: 'Save one team at a time (side=A or side=B).' });
    }
    for (const s of sides) {
      const keys = noStatsJobs ? ['score'] : [`stats${s}`];
      if (!requireJob(match, req, res, keys, "save this team's player stats")) return;
    }

    // The version each side's form was loaded at.
    const versions = {};
    for (const s of sides) {
      const v = Number(sideQ ? req.body.version : req.body.version?.[s]);
      if (!Number.isInteger(v) || v < 0) return res.status(400).json({ message: 'The form version is missing. Reload the form and try again.' });
      versions[s] = v;
    }

    const rows = Array.isArray(req.body.players) ? req.body.players : [];

    const links = await TeamPlayer.find({ team: { $in: [match.teamA, match.teamB] } }).select('player team');
    // Which side each player is on, for the side check and the points cap below.
    const sideOf = {};
    links.forEach((l) => { sideOf[String(l.player)] = String(l.team) === String(match.teamA) ? 'A' : 'B'; });

    // Validate everything first so a bad row can't leave the form half-saved.
    const clean = [];
    for (const r of rows) {
      const id = String(r?.playerId || '');
      if (!sideOf[id]) return res.status(400).json({ message: 'A player in the form is not on either team.' });
      if (!sides.includes(sideOf[id])) {
        return res.status(400).json({ message: "A player in the form is on the other team. Each team's stats are saved from its own form." });
      }

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
      for (const d of clean) sum[sideOf[d.player]] += Number(d.$set.points) || 0;
      for (const [side, team, score] of [['A', match.teamA, match.liveScoreA || 0], ['B', match.teamB, match.liveScoreB || 0]]) {
        if (sides.includes(side) && sum[side] > score) {
          const name = (await Team.findById(team).select('teamName'))?.teamName || 'a team';
          return res.status(400).json({
            message: `${name}'s players add up to ${sum[side]} points, but the team scored ${score}. Player points can't be more than the team's score.`,
          });
        }
      }
    }

    // Take the version first (atomic): of two saves made from the same copy, only one gets
    // past this, and the other is told to reload.
    const filter = { _id: match._id, status: 'completed', $and: sides.map((s) => versionIs(`formVersion.${s}`, versions[s])) };
    const inc = Object.fromEntries(sides.map((s) => [`formVersion.${s}`, 1]));
    const bumped = await Match.findOneAndUpdate(filter, { $inc: inc }, { returnDocument: 'after' });
    if (!bumped) {
      return res.status(409).json({ code: 'stale_form', message: 'Someone else saved this form. Reload to see the latest.' });
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

    res.json({
      message: `Player stats saved (${saved} player${saved === 1 ? '' : 's'}).`,
      saved,
      formVersion: versionsOut(bumped),
    });
  } catch (err) {
    console.error('Save stats error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// PUT /api/organizer/matches/:matchId/result   body: { mvpPlayerId, version }
// The score keeper's after-match form (Oct 2026): confirms the final result and picks the MVP.
// The result itself can't change here (the winner has already advanced); this saves the MVP,
// with the same version check as the stats forms.
router.put('/matches/:matchId/result', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    if (match.status !== 'completed') return res.status(409).json({ message: 'The result is confirmed after the match is finished.' });
    if (!requireJob(match, req, res, ['score'], 'confirm the result')) return;

    const v = Number(req.body.version);
    if (!Number.isInteger(v) || v < 0) return res.status(400).json({ message: 'The form version is missing. Reload the form and try again.' });

    const mvp = req.body.mvpPlayerId ? String(req.body.mvpPlayerId) : null;
    if (mvp) {
      const onEither = mongoose.isValidObjectId(mvp)
        && await TeamPlayer.findOne({ team: { $in: [match.teamA, match.teamB] }, player: mvp }).select('_id');
      if (!onEither) return res.status(400).json({ message: 'The MVP must be a player in this match.' });
    }

    const saved = await Match.findOneAndUpdate(
      { _id: match._id, status: 'completed', ...versionIs('formVersion.result', v) },
      { $set: { mvp }, $inc: { 'formVersion.result': 1 } },
      { returnDocument: 'after' }
    );
    if (!saved) return res.status(409).json({ code: 'stale_form', message: 'Someone else saved this form. Reload to see the latest.' });
    res.json({ message: 'Result confirmed.', formVersion: versionsOut(saved) });
  } catch (err) {
    console.error('Confirm result error:', err);
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
    if (!requireJob(match, req, res, ['score'], 'end the match')) return;

        if (match.status === 'completed' || match.status === 'forfeited') return res.status(409).json({ message: 'This match already has a result.' });
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Start the match before ending it.' });

    const total = gamesWonTotal(match, ctx.sport);
    const a = match.liveScoreA || 0;
    const b = match.liveScoreB || 0;
    const gamesWon = isGamesWon(ctx.sport);
    if (gamesWon) {
      const need = winsNeeded(total);
      if (Math.max(a, b) < need) {
        return res.status(409).json({
          message: `Best of ${total}: a side needs ${need} game win${need === 1 ? '' : 's'} to take the match. It's ${a}–${b}.`,
        });
      }
    } else if (match.games.length < total) {
      return res.status(409).json({
        message: `All ${total} ${PERIOD_LABEL[ctx.sportName] || 'period'}(s) must be recorded first, ${match.games.length} done.`,
      });
    }

    if (a === b) return res.status(400).json({ message: 'A match cannot end in a tie. The score must separate the teams.' });

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
    if (match.clock) match.clock = pauseClock(match.clock);
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
    if (!requireJob(match, req, res, ['score'], 'end a period')) return;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Start the match first.' });
    if (isGamesWon(ctx.sport)) {
      return res.status(409).json({ message: 'Each game is recorded when you tap its winner. End the match once a side has won the series.' });
    }

    const played = match.games.length;
    const total = totalPeriods(match);
    if (played >= total) {
      // A tie is broken by an extra period the organizer starts on purpose (POST /overtime).
      // It used to add a period here and bank it at once as 0-0.
      if ((match.liveScoreA || 0) === (match.liveScoreB || 0)) {
        return res.status(409).json({ message: 'The scores are level. Start overtime to break the tie.' });
      }
      return res.status(409).json({ message: `All ${total} ${PERIOD_LABEL[sportName] || 'period'}(s) are recorded. End the match.` });
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
    // The clock is set up for the next period (stopped, full length). After the last one it
    // stays at 0:00 until overtime is started.
    if (match.clock) {
      const next = played + 2;
      match.clock = next <= total ? freshClock(periodSecondsFor(match, next))
        : { ...pauseClock(match.clock), elapsed: match.clock.periodSeconds };
    }
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
// POST /api/organizer/matches/:matchId/clock   body: { action: 'start' | 'pause' | 'set', seconds? }
// The game clock of a timed sport (lib/gameClock.js). Score keeper only. 'set' corrects the time
// left (0..period length) and keeps it running or stopped as it was.
router.post('/matches/:matchId/clock', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    if (!requireJob(match, req, res, ['score'], 'run the clock')) return;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Start the match first.' });
    if (!match.clock) return res.status(409).json({ message: 'This game is not played on a clock.' });
    if (match.games.length >= totalPeriods(match)) {
      return res.status(409).json({ message: 'Every period is over. Start overtime or end the match.' });
    }
    const now = Date.now();
    const c = match.clock;
    const action = req.body.action;
    if (action === 'start') {
      if (clockRemaining(c, now) <= 0) return res.status(409).json({ message: 'Time is up. End this period.' });
      if (!c.running) match.clock = { periodSeconds: c.periodSeconds, running: true, startedAt: new Date(now), elapsed: c.elapsed || 0, started: true };
    } else if (action === 'pause') {
      match.clock = pauseClock(c, now);
    } else if (action === 'set') {
      const seconds = Number(req.body.seconds);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > c.periodSeconds) {
        return res.status(400).json({ message: `The time left must be between 0:00 and ${Math.floor(c.periodSeconds / 60)}:00.` });
      }
      const running = !!c.running && seconds > 0;
      match.clock = { periodSeconds: c.periodSeconds, running, startedAt: running ? new Date(now) : null, elapsed: c.periodSeconds - seconds, started: !!c.started };
    } else {
      return res.status(400).json({ message: 'action must be start, pause or set.' });
    }
    await match.save();
    res.json({ clock: clockView(match, now), serverNow: now });
  } catch (err) {
    console.error('Clock error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/organizer/matches/:matchId/overtime — the scores are level after every period:
// add one more period to break the tie (basketball: a 5-minute overtime; a set-based sport: one
// deciding set). Repeats until a side leads. Score keeper only.
router.post('/matches/:matchId/overtime', async (req, res) => {
  try {
    const ctx = await loadOwnedMatch(req, res);
    if (!ctx) return;
    const { match } = ctx;
    if (!requireJob(match, req, res, ['score'], 'start overtime')) return;
    if (match.status !== 'ongoing') return res.status(409).json({ message: 'Start the match first.' });
    if (isGamesWon(ctx.sport)) return res.status(409).json({ message: 'A series is decided by games won, not overtime.' });
    if (match.games.length < totalPeriods(match)) return res.status(409).json({ message: 'Finish the current period first.' });
    if ((match.liveScoreA || 0) !== (match.liveScoreB || 0)) return res.status(409).json({ message: 'The scores are not level, so there is no overtime. End the match.' });
    match.overtimes = (match.overtimes || 0) + 1;
    if (match.overtimeMinutes) match.clock = freshClock(match.overtimeMinutes * 60);
    await match.save();
    res.json({ message: `Overtime ${match.overtimes} started.`, overtimes: match.overtimes });
  } catch (err) {
    console.error('Overtime error:', err);
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
    if (!requireJob(match, req, res, ['score'], 'cancel the match')) return;

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
    match.overtimes = 0;
    match.clock = null;
    match.periodMinutes = null;
    match.overtimeMinutes = null;
    match.lineupA = [];
    match.lineupB = [];
    match.subs = [];
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
    if (!requireJob(match, req, res, ['score'], 'record a forfeit')) return;

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