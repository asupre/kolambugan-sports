const express = require('express');
const Season = require('../models/Season');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Barangay = require('../models/Barangay');
const Sport = require('../models/Sport');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const ReferenceList = require('../models/ReferenceList');
const { authenticate, authorize } = require('../middleware/auth');
const { isManilaToday, manilaDay } = require('../config/time');
const { getCurrentSeason } = require('../middleware/season');
const { norm } = require('../services/prescreen');
const { roundLabels } = require('../lib/roundLabels');

const router = express.Router();

// GET /api/stats/dashboard — the Super Admin's home. Beyond headline counts it reports
// where the season stands in each part of the job (registration, verification,
// brackets, scheduling, accounts) so the page can say what needs doing next.
//
// A fixed handful of batched queries, grouped in memory — never one per team (the
// Review Queue lesson). Old fields (season, teams, playersToReview, barangays,
// sports, accounts.barangayAdmins/organizers, todayMatches) are unchanged.
//
// Player figures are ROSTER ENTRIES (each team has its own Player record), which is
// what screening and the Review Queue work in.
router.get('/dashboard', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await getCurrentSeason();

    // Everything that doesn't depend on another result goes in ONE batch (each round
    // trip to Atlas costs ~100ms); the season-scoped queries just resolve to empty
    // when there's no season.
    const [barangayList, sportList, accountList, teams, tournaments, referenceCount] = await Promise.all([
      Barangay.find().select('name').sort({ name: 1 }).lean(),
      Sport.find(Sport.ACTIVE).select('name divisions').sort({ name: 1 }).lean(),
      User.find({ role: { $in: ['barangay_admin', 'organizer'] } })
        .select('role barangay assignedSport mustChangePassword').lean(),
      season ? Team.find({ season: season._id }).select('teamName barangay sport division status submittedAt').lean() : [],
      season ? Tournament.find({ season: season._id }).select('sport division stage').lean() : [],
      season ? ReferenceList.countDocuments({ season: season._id }) : 0,
    ]);

    const barangayAdmins = accountList.filter((u) => u.role === 'barangay_admin');
    const organizers = accountList.filter((u) => u.role === 'organizer');
    const haveAdmin = new Set(barangayAdmins.map((u) => String(u.barangay)));
    const haveOrganizer = new Set(organizers.map((u) => String(u.assignedSport)));

    const out = {
      season: season ? { name: season.name, status: season.status } : null,
      teams: 0,
      playersToReview: 0,
      barangays: barangayList.length,
      sports: sportList.length,
      accounts: {
        barangayAdmins: barangayAdmins.length,
        organizers: organizers.length,
        tempPassword: accountList.filter((u) => u.mustChangePassword).length,
        missingBarangayAdmins: barangayList.filter((b) => !haveAdmin.has(String(b._id))).length,
        missingOrganizers: sportList.filter((s) => !haveOrganizer.has(String(s._id))).length,
      },
      todayMatches: [],
    };
    if (!season) return res.json(out);

    const teamIds = teams.map((t) => t._id);
    const teamById = new Map(teams.map((t) => [String(t._id), t]));

    const [links, matches] = await Promise.all([
      TeamPlayer.find({ team: { $in: teamIds } }).select('team player').lean(),
      Match.find({ tournament: { $in: tournaments.map((t) => t._id) } })
        .select('tournament status schedule teamA teamB venue').lean(),
    ]);
    const players = await Player.find({ _id: { $in: links.map((l) => l.player) } })
      .select('eligibilityStatus').lean();

    // ---- teams pipeline ----
    const stateOf = (t) => (t.status === 'verified' ? 'verified' : t.submittedAt ? 'review' : 'draft');
    const teamsByState = { draft: 0, review: 0, verified: 0 };
    teams.forEach((t) => { teamsByState[stateOf(t)]++; });

    // ---- players (roster entries) ----
    const pc = { eligible: 0, flagged: 0, needsDocument: 0, pending: 0 };
    players.forEach((p) => {
      if (p.eligibilityStatus === 'eligible') pc.eligible++;
      else if (p.eligibilityStatus === 'flagged') pc.flagged++;
      else if (p.eligibilityStatus === 'needs_document') pc.needsDocument++;
      else pc.pending++;
    });

    // ---- barangay participation ("cleared" = a verified team in every sport/division slot) ----
    const requiredSlots = sportList.reduce((n, s) => n + (s.divisions?.length || 0), 0);
    const byBarangay = new Map();
    teams.forEach((t) => {
      const k = String(t.barangay);
      if (!byBarangay.has(k)) byBarangay.set(k, { started: true, verifiedSlots: new Set() });
      if (t.status === 'verified') byBarangay.get(k).verifiedSlots.add(`${t.sport}|${t.division}`);
    });
    let cleared = 0, inProgress = 0;
    const notStartedNames = [];
    barangayList.forEach((b) => {
      const s = byBarangay.get(String(b._id));
      if (!s) notStartedNames.push(b.name);
      else if (requiredSlots > 0 && s.verifiedSlots.size >= requiredSlots) cleared++;
      else inProgress++;
    });

    // ---- competition: per sport and division ----
    const verifiedBySlot = new Map();
    teams.forEach((t) => {
      if (t.status !== 'verified') return;
      const k = `${t.sport}|${t.division || 'open'}`;
      verifiedBySlot.set(k, (verifiedBySlot.get(k) || 0) + 1);
    });
    const tournamentBySlot = new Map(tournaments.map((t) => [`${t.sport}|${t.division || 'open'}`, t]));
    const matchesByTournament = new Map();
    matches.forEach((m) => {
      const k = String(m.tournament);
      if (!matchesByTournament.has(k)) matchesByTournament.set(k, { total: 0, completed: 0 });
      const r = matchesByTournament.get(k);
      r.total++;
      if (m.status === 'completed' || m.status === 'forfeited') r.completed++;
    });
    const sportsProgress = sportList.map((s) => ({
      id: s._id,
      name: s.name,
      divisions: (s.divisions?.length ? s.divisions : ['open']).map((d) => {
        const slot = `${s._id}|${d}`;
        const tour = tournamentBySlot.get(slot);
        const mc = tour ? matchesByTournament.get(String(tour._id)) || { total: 0, completed: 0 } : null;
        return {
          division: d,
          verifiedTeams: verifiedBySlot.get(slot) || 0,
          tournament: tour ? { stage: tour.stage, total: mc.total, completed: mc.completed } : null,
        };
      }),
    }));

    // ---- matches, league-wide (Manila days) ----
    const today = manilaDay(new Date());
    const dayOf = (m) => (m.schedule ? manilaDay(m.schedule) : null);
    const both = (m) => !!(m.teamA && m.teamB);
    const scheduled = matches.filter((m) => m.status === 'scheduled');
    const matchStats = {
      total: matches.length,
      completed: matches.filter((m) => m.status === 'completed' || m.status === 'forfeited').length,
      live: matches.filter((m) => m.status === 'ongoing').length,
      overdue: scheduled.filter((m) => both(m) && dayOf(m) && dayOf(m) < today).length,
      undated: scheduled.filter((m) => both(m) && !dayOf(m)).length,
      upcoming: scheduled.filter((m) => dayOf(m) && dayOf(m) >= today).length,
    };

    // ---- today's games (carousel) ----
    // Also carries forward anything dated for a PAST day that never got played — a
    // league running behind schedule doesn't make those games disappear.
    const sportNameById = new Map(sportList.map((s) => [String(s._id), s.name]));
    const tournamentSport = new Map(tournaments.map((t) => [String(t._id), sportNameById.get(String(t.sport)) || '?']));
    const UNRESOLVED = ['scheduled', 'ongoing'];
    const headcount = new Map();
    links.forEach((l) => headcount.set(String(l.team), (headcount.get(String(l.team)) || 0) + 1));
    const todays = matches.filter((m) =>
      m.schedule && (isManilaToday(m.schedule) ||
        (new Date(m.schedule).getTime() < Date.now() && UNRESOLVED.includes(m.status)))
    );
    const nameOf = (id) => (id && teamById.get(String(id)) ? teamById.get(String(id)).teamName : 'TBD');
    const countOf = (id) => (id ? headcount.get(String(id)) || 0 : 0);

    Object.assign(out, {
      teams: teams.length,
      playersToReview: pc.flagged + pc.needsDocument,
      teamsByState,
      players: { total: players.length, ...pc },
      barangayProgress: { total: barangayList.length, cleared, inProgress, notStarted: notStartedNames.length, notStartedNames: notStartedNames.slice(0, 12) },
      referenceList: { count: referenceCount },
      sportsProgress,
      matches: matchStats,
      todayMatches: todays
        .sort((a, b) => new Date(a.schedule) - new Date(b.schedule))
        .map((m) => ({
          id: m._id,
          sport: tournamentSport.get(String(m.tournament)) || '?',
          teamA: nameOf(m.teamA),
          teamB: nameOf(m.teamB),
          players: countOf(m.teamA) + countOf(m.teamB),
          schedule: m.schedule,
          venue: m.venue || '',
          status: m.status,
        })),
    });
    res.json(out);
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/stats/brgy-dashboard — the Barangay Admin's home: how their players and
// teams stand, and what's coming up. Everything is fetched in a fixed handful of
// batched queries and grouped in memory (never a query per team — see the Review
// Queue for why).
//
// Players are counted as ATHLETES, not roster entries: each team gets its own
// Player record, so someone playing three sports would otherwise count three
// times. An athlete is identified by name + birthdate (case/whitespace-tolerant,
// the same identity the roster routes use) and counted ONCE, by their most
// advanced team — so verified + under review + draft always adds up to
// registered:
//   verified     on at least one team the Super Admin has verified
//   under review on a submitted team still awaiting review (and no verified team)
//   draft        only on rosters not yet submitted
router.get('/brgy-dashboard', authenticate, authorize('barangay_admin'), async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ season: null });

    const teams = await Team.find({ season: season._id, barangay: req.user.barangay })
      .populate('sport', 'name')
      .sort({ createdAt: 1 })
      .lean();
    const teamIds = teams.map((t) => t._id);
    const teamById = new Map(teams.map((t) => [String(t._id), t]));

    const [links, sportsWithDivisions, matches] = await Promise.all([
      TeamPlayer.find({ team: { $in: teamIds } }).select('team player').lean(),
      Sport.find({ ...Sport.ACTIVE, divisions: { $exists: true, $ne: [] } }).select('divisions').lean(),
      Match.find({ $or: [{ teamA: { $in: teamIds } }, { teamB: { $in: teamIds } }] })
        .populate('teamA', 'teamName')
        .populate('teamB', 'teamName')
        .populate({ path: 'tournament', select: 'division sport', populate: { path: 'sport', select: 'name' } })
        .lean(),
    ]);
    const players = await Player.find({ _id: { $in: links.map((l) => l.player) } })
      .select('lastName firstName birthdate eligibilityStatus')
      .lean();
    const playerById = new Map(players.map((p) => [String(p._id), p]));

    const stateOf = (t) => (t.status === 'verified' ? 'verified' : t.submittedAt ? 'review' : 'draft');
    const RANK = { draft: 1, review: 2, verified: 3 };
    const perTeam = new Map(); // teamId -> { count, attention }
    const athletes = new Map(); // identity -> best rank
    let attention = 0;
    for (const l of links) {
      const t = teamById.get(String(l.team));
      const p = playerById.get(String(l.player));
      if (!t || !p) continue;
      const state = stateOf(t);
      const key = `${norm(p.lastName)}|${norm(p.firstName)}|${p.birthdate ? new Date(p.birthdate).toDateString() : ''}`;
      athletes.set(key, Math.max(athletes.get(key) || 0, RANK[state]));

      const row = perTeam.get(String(t._id)) || { count: 0, attention: 0 };
      row.count++;
      // A player the screening flagged / wants a document for, on a team that
      // isn't verified yet — the thing the Barangay Admin can actually act on.
      if (state !== 'verified' && (p.eligibilityStatus === 'flagged' || p.eligibilityStatus === 'needs_document')) {
        row.attention++;
        attention++;
      }
      perTeam.set(String(t._id), row);
    }
    let verified = 0, review = 0, draft = 0;
    for (const r of athletes.values()) {
      if (r === RANK.verified) verified++;
      else if (r === RANK.review) review++;
      else draft++;
    }

    // "Slots" = one per sport/division the season runs; a barangay needs ONE
    // verified team in each (a second Mobile Legends team doesn't add a slot).
    const requiredSlots = sportsWithDivisions.reduce((n, s) => n + (s.divisions?.length || 0), 0);
    const slotOf = (t) => `${t.sport && t.sport._id}|${t.division}`;
    const startedSlots = new Set(teams.map(slotOf)).size;
    const verifiedSlots = new Set(teams.filter((t) => t.status === 'verified').map(slotOf)).size;

    // Matches for our teams.
    const myIds = new Set(teamIds.map(String));
    const shape = (m) => {
      const aMine = m.teamA && myIds.has(String(m.teamA._id));
      const mine = aMine ? m.teamA : m.teamB;
      const other = aMine ? m.teamB : m.teamA;
      return {
        id: m._id,
        status: m.status,
        schedule: m.schedule || null,
        venue: m.venue || '',
        sport: m.tournament && m.tournament.sport ? m.tournament.sport.name : '',
        division: (m.tournament && m.tournament.division) || 'open',
        group: m.group || null,
        mine: mine ? { id: mine._id, name: mine.teamName } : null,
        opponent: other ? { id: other._id, name: other.teamName } : null, // null = not decided yet
        scoreMine: aMine ? m.liveScoreA : m.liveScoreB,
        scoreOpponent: aMine ? m.liveScoreB : m.liveScoreA,
      };
    };
    const byDate = (a, b) => {
      if (!a.schedule && !b.schedule) return 0;
      if (!a.schedule) return 1;      // undated last
      if (!b.schedule) return -1;
      return new Date(a.schedule) - new Date(b.schedule);
    };
    const live = matches.filter((m) => m.status === 'ongoing').map(shape);
    const upcomingAll = matches.filter((m) => m.status === 'scheduled').map(shape).sort(byDate);
    const finished = matches.filter((m) => m.status === 'completed' || m.status === 'forfeited');
    const wins = finished.filter((m) => m.seriesWinner && myIds.has(String(m.seriesWinner))).length;

    res.json({
      season: { name: season.name, status: season.status },
      players: { registered: athletes.size, verified, review, draft, attention },
      entries: { required: requiredSlots, started: startedSlots, verified: verifiedSlots },
      teams: teams.map((t) => ({
        id: t._id,
        name: t.teamName,
        sport: t.sport && t.sport.name,
        division: t.division || 'open',
        state: stateOf(t),
        playerCount: (perTeam.get(String(t._id)) || {}).count || 0,
        attention: (perTeam.get(String(t._id)) || {}).attention || 0,
      })),
      matches: {
        live,
        upcoming: upcomingAll.slice(0, 6),
        upcomingTotal: upcomingAll.length,
        played: finished.length,
        wins,
        losses: finished.length - wins,
      },
    });
  } catch (err) {
    console.error('Barangay dashboard error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/stats/organizer-dashboard — the Organizer's home: what is scheduled for
// THEIR sport this season, by day. (A super admin may pass ?sportId to look at one.)
// Days are Manila days (the server runs UTC), compared as "YYYY-MM-DD" strings.
//   today        dated today and still to play or being played
//   overdue      dated BEFORE today but never started — needs attention
//   upcoming     dated after today
//   awaitingDate both teams known but no date set yet
//   notReady     a slot still waiting on an earlier match to decide a team
router.get('/organizer-dashboard', authenticate, authorize('organizer', 'super_admin'), async (req, res) => {
  try {
    const sportId = req.user.role === 'organizer' ? req.user.assignedSport : req.query.sportId;
    if (!sportId) return res.status(400).json({ message: 'No sport assigned.' });

    const season = await getCurrentSeason();
    if (!season) return res.json({ season: null });

    const [sport, tournaments, verifiedTeams] = await Promise.all([
      Sport.findById(sportId).select('name').lean(),
      Tournament.find({ sport: sportId, season: season._id }).select('division stage format').lean(),
      Team.countDocuments({ sport: sportId, season: season._id, status: 'verified' }),
    ]);
    const tIds = tournaments.map((t) => t._id);
    const divisionByTournament = new Map(tournaments.map((t) => [String(t._id), t.division || 'open']));

    const withBarangay = (path) => ({ path, select: 'teamName barangay', populate: { path: 'barangay', select: 'name' } });
    const matches = await Match.find({ tournament: { $in: tIds } })
      .populate(withBarangay('teamA'))
      .populate(withBarangay('teamB'))
      .lean();
    const labels = roundLabels(matches);

    const teamShape = (t) => (t ? { id: t._id, name: t.teamName, barangay: t.barangay && t.barangay.name } : null);
    const shape = (m) => ({
      id: m._id,
      status: m.status,
      schedule: m.schedule || null,
      venue: m.venue || '',
      division: divisionByTournament.get(String(m.tournament)) || 'open',
      bracket: m.bracket,
      round: m.round,
      roundLabel: labels.get(String(m._id)) || '',
      group: m.group || null,
      teamA: teamShape(m.teamA),
      teamB: teamShape(m.teamB),
      scoreA: m.liveScoreA,
      scoreB: m.liveScoreB,
      winner: m.seriesWinner || null,
    });

    const today = manilaDay(new Date());
    const dayOf = (m) => (m.schedule ? manilaDay(m.schedule) : null);
    const bySchedule = (a, b) => new Date(a.schedule || 0) - new Date(b.schedule || 0);
    const to = (list) => list.map(shape);

    const open = matches.filter((m) => m.status === 'scheduled' || m.status === 'ongoing');
    const scheduled = matches.filter((m) => m.status === 'scheduled');
    const both = (m) => !!(m.teamA && m.teamB);

    const live = matches.filter((m) => m.status === 'ongoing');
    const todayList = open.filter((m) => dayOf(m) === today).sort(bySchedule);
    const overdue = scheduled.filter((m) => both(m) && dayOf(m) && dayOf(m) < today).sort(bySchedule);
    const upcoming = scheduled.filter((m) => dayOf(m) && dayOf(m) > today).sort(bySchedule);
    const awaitingDate = scheduled.filter((m) => both(m) && !dayOf(m));
    const notReady = scheduled.filter((m) => !both(m));
    const finished = matches.filter((m) => m.status === 'completed' || m.status === 'forfeited');
    const recent = [...finished]
      .sort((a, b) => new Date(b.enteredAt || b.updatedAt || 0) - new Date(a.enteredAt || a.updatedAt || 0))
      .slice(0, 5);

    res.json({
      season: { name: season.name, status: season.status },
      sport: sport ? sport.name : '',
      counts: {
        total: matches.length,
        completed: finished.length,
        remaining: matches.length - finished.length,
        live: live.length,
        today: todayList.length,
        overdue: overdue.length,
        upcoming: upcoming.length,
        awaitingDate: awaitingDate.length,
        notReady: notReady.length,
        teams: verifiedTeams,
      },
      live: to(live),
      today: to(todayList),
      overdue: to(overdue.slice(0, 10)),
      upcoming: to(upcoming.slice(0, 12)),
      recent: to(recent),
      tournaments: tournaments.map((t) => {
        const mine = matches.filter((m) => String(m.tournament) === String(t._id));
        return {
          division: t.division || 'open',
          stage: t.stage,
          total: mine.length,
          completed: mine.filter((m) => m.status === 'completed' || m.status === 'forfeited').length,
        };
      }),
    });
  } catch (err) {
    console.error('Organizer dashboard error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;