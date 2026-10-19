// Demo data for League Setup (Oct 2026, after a mock defense where registering by hand
// took hours). Super Admin only. Three actions:
//   POST   /api/demo/teams    — a team for EVERY barangay in every sport + division set in
//                               League Setup (skips slots a barangay already filled).
//   POST   /api/demo/rosters  — fills every empty demo team with residents taken from this
//                               season's uploaded REFERENCE LIST (the SK list, so only ages
//                               16-30), screened like a real roster, and verifies the team, so
//                               brackets can be generated at once. No made-up players: a team
//                               the list can't fill (and every Under 15 team) is left empty.
//   DELETE /api/demo          — removes every demo team / player and any tournament that
//                               contains a demo team (with its matches and player stats).
// Everything generated carries isDemo: true, so real registrations are never touched.

const express = require('express');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Sport = require('../models/Sport');
const Barangay = require('../models/Barangay');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const PlayerMatchStats = require('../models/PlayerMatchStats');
const ReferenceList = require('../models/ReferenceList');
const { decideFromCandidates, ageFrom, norm, MINOR_AGE } = require('../services/prescreen');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');

const router = express.Router();
router.use(authenticate, authorize('super_admin'));

// Generation only while registration / verification can still happen.
const GENERATE_STAGES = ['setup', 'registration_open', 'verification'];

const ROSTER_SIZE = { team: 12, esports: 6, doubles: 2, singles: 1 };
// Smallest roster a team may submit (ROSTER_LIMITS in routes/team.js).
const ROSTER_MIN = { team: 10, esports: 6, doubles: 2, singles: 1 };

// The SK reference list covers ages 15-30; 15 counts as a minor (MINOR_AGE) and is never
// matched to the list, so only 16-30 year olds are drawn from it.
const LIST_MIN_AGE = MINOR_AGE + 1;
const LIST_MAX_AGE = 30;

const keyOf = (p) => `${norm(p.lastName)}|${norm(p.firstName)}|${p.birthdate ? new Date(p.birthdate).toDateString() : ''}`;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// GET /api/demo — what exists now, for the League Setup card.
router.get('/', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    const teams = season ? await Team.find({ season: season._id, isDemo: true }).select('_id status') : [];
    const filled = teams.length
      ? (await TeamPlayer.distinct('team', { team: { $in: teams.map((t) => t._id) } })).length
      : 0;
    res.json({
      seasonStatus: season?.status || null,
      canGenerate: !!season && GENERATE_STAGES.includes(season.status),
      canCreateTeams: season?.status === 'registration_open',
      demoTeams: teams.length,
      emptyDemoTeams: teams.length - filled,
      demoPlayers: await Player.countDocuments({ isDemo: true }),
    });
  } catch (err) {
    console.error('Demo status error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

async function generationSeason(res, { teams = false } = {}) {
  const season = await getCurrentSeason();
  if (!season) { res.status(409).json({ message: 'Create a season first.' }); return null; }
  // Same rule as a real registration (POST /api/teams): teams only while registration is open.
  if (teams && season.status !== 'registration_open') {
    res.status(409).json({ message: 'Demo teams can only be created while registration is open. Move the season to Registration open first.' });
    return null;
  }
  if (!GENERATE_STAGES.includes(season.status)) {
    res.status(409).json({ message: 'Demo data can only be generated before the season is Ongoing.' });
    return null;
  }
  return season;
}

// POST /api/demo/teams
router.post('/teams', async (req, res) => {
  try {
    const season = await generationSeason(res, { teams: true });
    if (!season) return;
    const [sports, barangays, existing] = await Promise.all([
      Sport.find().sort({ name: 1 }),
      Barangay.find().sort({ name: 1 }),
      Team.find({ season: season._id }).select('barangay sport division'),
    ]);
    const taken = new Set(existing.map((t) => `${t.barangay}|${t.sport}|${t.division || 'open'}`));

    const docs = [];
    for (const sport of sports) {
      const divisions = sport.divisions?.length ? sport.divisions : ['open'];
      for (const division of divisions) {
        for (const b of barangays) {
          if (taken.has(`${b._id}|${sport._id}|${division}`)) continue;
          docs.push({
            teamName: b.name, barangay: b._id, sport: sport._id, season: season._id,
            division, format: sport.entryFormat || 'team', isDemo: true,
          });
        }
      }
    }
    if (docs.length) await Team.insertMany(docs);
    res.json({
      message: docs.length
        ? `Created ${docs.length} demo team${docs.length === 1 ? '' : 's'} (${sports.length} game${sports.length === 1 ? '' : 's'} × ${barangays.length} barangays). Now fill their rosters.`
        : 'Every barangay already has a team in every game and division. Nothing to add.',
      created: docs.length,
    });
  } catch (err) {
    console.error('Demo teams error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/demo/rosters
// Every player is a real row of this season's reference list (no made-up players: they
// would never pass screening). Two passes, so a cross-barangay team never takes a resident
// their own barangay needed:
//   1. every team takes residents of its OWN barangay;
//   2. teams whose barangay allows cross-barangay players fill their gaps with residents
//      nobody took in pass 1 (from any barangay).
// A team that still can't reach the minimum roster is left empty and its residents go back
// to the pool. Under 15 teams are left empty too: minors are never matched to the list.
router.post('/rosters', async (req, res) => {
  try {
    const season = await generationSeason(res);
    if (!season) return;

    const refs = await ReferenceList.find({ season: season._id, birthdate: { $ne: null } })
      .select('firstName middleName lastName birthdate barangay').lean();
    if (!refs.length) {
      return res.status(409).json({ message: "Upload this season's reference list first. Demo players are taken from it." });
    }

    const teams = await Team.find({ season: season._id, isDemo: true })
      .populate('barangay', 'name allowsCrossBarangay').populate('sport', 'category');
    const filled = new Set((await TeamPlayer.distinct('team', { team: { $in: teams.map((t) => t._id) } })).map(String));
    const empty = teams.filter((t) => !filled.has(String(t._id)));
    if (!empty.length) {
      return res.json({ message: 'Every demo team already has a roster. Nothing to fill.', teams: 0, players: 0 });
    }

    // Name + birthdate is a player's identity (one athlete, one barangay; boys/girls don't
    // mix), so every resident is used ONCE in the whole run, and never one already on a
    // real roster this season.
    const used = new Set();
    const seasonTeamIds = await Team.distinct('_id', { season: season._id });
    const rosteredIds = await TeamPlayer.distinct('player', { team: { $in: seasonTeamIds } });
    (await Player.find({ _id: { $in: rosteredIds } }).select('firstName lastName birthdate'))
      .forEach((p) => used.add(keyOf(p)));

    // Residents 16-30 with the middle name + birthdate a match needs, grouped by their
    // barangay on the list, shuffled so each run picks different people.
    const pools = new Map();
    for (const r of shuffle(refs)) {
      const age = ageFrom(r.birthdate);
      if (age === null || age < LIST_MIN_AGE || age > LIST_MAX_AGE || !norm(r.middleName)) continue;
      const k = keyOf(r);
      if (used.has(k)) continue;
      used.add(k);   // also drops duplicate rows of the same person
      const b = norm(r.barangay);
      if (!pools.has(b)) pools.set(b, []);
      pools.get(b).push(r);
    }
    const giveBack = (rows) => rows.forEach((r) => pools.get(norm(r.barangay)).push(r));

    const slots = empty
      .filter((t) => t.division !== 'under15')
      .map((team) => {
        const kind = team.format === 'singles' ? 'singles'
          : team.format === 'doubles' ? 'doubles'
          : team.sport?.category === 'esports' ? 'esports' : 'team';
        return { team, size: ROSTER_SIZE[kind], min: ROSTER_MIN[kind], rows: [] };
      });
    // Release a team that can't reach its minimum, so another team can use its residents.
    const settle = (slot) => {
      if (slot.rows.length >= slot.min) return;
      giveBack(slot.rows);
      slot.rows = [];
    };

    // Pass 1: own barangay.
    for (const slot of slots) {
      const pool = pools.get(norm(slot.team.barangay?.name)) || [];
      while (slot.rows.length < slot.size && pool.length) slot.rows.push(pool.pop());
      if (!slot.team.barangay?.allowsCrossBarangay) settle(slot);
    }
    // Pass 2: cross-barangay teams take whoever is left, from any barangay.
    for (const slot of slots.filter((s) => s.team.barangay?.allowsCrossBarangay)) {
      for (const pool of pools.values()) {
        while (slot.rows.length < slot.size && pool.length) slot.rows.push(pool.pop());
        if (slot.rows.length >= slot.size) break;
      }
      settle(slot);
    }

    const done = slots.filter((s) => s.rows.length);
    const players = [];
    const plan = [];   // [team, playerIndex] pairs, linked after insert
    let crossCount = 0;
    for (const slot of done) {
      slot.rows.forEach((r, i) => {
        const p = {
          firstName: r.firstName, middleName: r.middleName, lastName: r.lastName,
          birthdate: r.birthdate, age: ageFrom(r.birthdate),
        };
        const screening = decideFromCandidates(p, slot.team.barangay, [r]);
        if (norm(r.barangay) !== norm(slot.team.barangay?.name)) crossCount++;
        plan.push([slot.team, players.length]);
        players.push({
          ...p,
          address: slot.team.barangay?.name || '',
          jerseyNumber: i + 1,
          eligibilityStatus: screening.status,
          flagReason: screening.reason || '',
          isDemo: true,
        });
      });
    }

    const inserted = players.length ? await Player.insertMany(players) : [];
    if (plan.length) {
      await TeamPlayer.insertMany(plan.map(([team, pi]) => ({ team: team._id, player: inserted[pi]._id })));
      await Team.updateMany(
        { _id: { $in: done.map((s) => s.team._id) } },
        { $set: { status: 'verified', submittedAt: new Date() } }
      );
    }

    const under15 = empty.length - slots.length;
    const short = slots.length - done.length;
    const left = [
      short && `${short} team${short === 1 ? '' : 's'} left empty (not enough residents aged ${LIST_MIN_AGE}-${LIST_MAX_AGE} on the list for that barangay)`,
      under15 && `${under15} Under 15 team${under15 === 1 ? '' : 's'} left empty (minors aren't on the list; register them by hand with documents)`,
    ].filter(Boolean);
    res.json({
      message: `Filled ${done.length} team${done.length === 1 ? '' : 's'} with ${inserted.length} residents from the reference list (ages ${LIST_MIN_AGE}-${LIST_MAX_AGE}), all verified`
        + (crossCount ? `, ${crossCount} of them playing for a cross-barangay team` : '')
        + '.' + (left.length ? ` ${left.join('; ')}.` : '')
        + (done.length ? ' You can generate the brackets once the season is Ongoing.' : ''),
      teams: done.length,
      players: inserted.length,
      emptyLeft: short + under15,
    });
  } catch (err) {
    console.error('Demo rosters error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// DELETE /api/demo
router.delete('/', async (req, res) => {
  try {
    const teams = await Team.find({ isDemo: true }).select('_id');
    const teamIds = teams.map((t) => t._id);
    const tournamentIds = teamIds.length
      ? await Match.distinct('tournament', { $or: [{ teamA: { $in: teamIds } }, { teamB: { $in: teamIds } }] })
      : [];
    if (tournamentIds.length && await Match.exists({ tournament: { $in: tournamentIds }, status: 'ongoing' })) {
      return res.status(409).json({ message: 'A match with demo teams is being played right now. End or cancel it first.' });
    }

    const matchIds = await Match.distinct('_id', { tournament: { $in: tournamentIds } });
    const [stats, matches, tournaments, links, players, removedTeams] = [
      await PlayerMatchStats.deleteMany({ match: { $in: matchIds } }),
      await Match.deleteMany({ _id: { $in: matchIds } }),
      await Tournament.deleteMany({ _id: { $in: tournamentIds } }),
      await TeamPlayer.deleteMany({ team: { $in: teamIds } }),
      await Player.deleteMany({ isDemo: true }),
      await Team.deleteMany({ _id: { $in: teamIds } }),
    ];
    res.json({
      message: `Removed ${removedTeams.deletedCount} demo teams, ${players.deletedCount} demo players`
        + (tournaments.deletedCount ? `, ${tournaments.deletedCount} tournament(s) with ${matches.deletedCount} match(es)` : '')
        + '.',
      teams: removedTeams.deletedCount, players: players.deletedCount,
      tournaments: tournaments.deletedCount, matches: matches.deletedCount,
      stats: stats.deletedCount, links: links.deletedCount,
    });
  } catch (err) {
    console.error('Remove demo error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;
