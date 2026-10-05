// Demo data for League Setup (Oct 2026, after a mock defense where registering by hand
// took hours). Super Admin only. Three actions:
//   POST   /api/demo/teams    — a team for EVERY barangay in every sport + division set in
//                               League Setup (skips slots a barangay already filled).
//   POST   /api/demo/rosters  — fills every empty demo team with MADE-UP players (no real
//                               residents: names are random combinations), marked eligible,
//                               and verifies the team, so brackets can be generated at once.
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
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');

const router = express.Router();
router.use(authenticate, authorize('super_admin'));

// Generation only while registration / verification can still happen.
const GENERATE_STAGES = ['setup', 'registration_open', 'verification'];

const ROSTER_SIZE = { team: 12, esports: 6, doubles: 2, singles: 1 };

const SURNAMES = [
  'Abad', 'Aquino', 'Bautista', 'Bernardo', 'Cabrera', 'Castillo', 'Cruz', 'Dela Cruz', 'Del Rosario',
  'Domingo', 'Estrada', 'Fernandez', 'Flores', 'Garcia', 'Gonzales', 'Hernandez', 'Ignacio', 'Jimenez',
  'Lopez', 'Magbanua', 'Malik', 'Manalo', 'Marcelo', 'Mendoza', 'Morales', 'Navarro', 'Ocampo', 'Pascual',
  'Perez', 'Ramos', 'Reyes', 'Rivera', 'Robles', 'Salazar', 'Santiago', 'Santos', 'Sison', 'Tan',
  'Tolentino', 'Torres', 'Valdez', 'Villanueva', 'Yap', 'Zamora',
];
const MALE = [
  'Adrian', 'Angelo', 'Benjie', 'Carlo', 'Christian', 'Daniel', 'Dennis', 'Edgar', 'Elmer', 'Francis',
  'Gabriel', 'Jayson', 'Jericho', 'Joel', 'John', 'Joshua', 'Kenneth', 'Kevin', 'Lester', 'Mark',
  'Michael', 'Nathan', 'Noel', 'Paolo', 'Patrick', 'Ramil', 'Renz', 'Rey', 'Romeo', 'Ryan', 'Vince',
];
const FEMALE = [
  'Abigail', 'Alyssa', 'Andrea', 'Angel', 'Bea', 'Camille', 'Carla', 'Christine', 'Daisy', 'Erika',
  'Grace', 'Hannah', 'Irene', 'Janelle', 'Jasmine', 'Joy', 'Kaye', 'Kristine', 'Lea', 'Maricel',
  'Michelle', 'Nicole', 'Patricia', 'Precious', 'Rachelle', 'Rose', 'Sheila', 'Trisha', 'Venus',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// Age range per division: the basketball caps (under15 = up to 15, under30 = 16-30) are
// enforced elsewhere, so generated players always fit them.
const ageRange = (division) => (division === 'under15' ? [11, 15] : [16, 30]);

// A birthdate that gives exactly `age` today.
function birthdateFor(age) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - rand(1, 330));
  d.setHours(0, 0, 0, 0);
  return d;
}

const firstNames = (division) =>
  division === 'girls' ? FEMALE : division === 'open' ? (Math.random() < 0.5 ? MALE : FEMALE) : MALE;

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
      demoTeams: teams.length,
      emptyDemoTeams: teams.length - filled,
      demoPlayers: await Player.countDocuments({ isDemo: true }),
    });
  } catch (err) {
    console.error('Demo status error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

async function generationSeason(res) {
  const season = await getCurrentSeason();
  if (!season) { res.status(409).json({ message: 'Create a season first.' }); return null; }
  if (!GENERATE_STAGES.includes(season.status)) {
    res.status(409).json({ message: 'Demo data can only be generated before the season is Ongoing.' });
    return null;
  }
  return season;
}

// POST /api/demo/teams
router.post('/teams', async (req, res) => {
  try {
    const season = await generationSeason(res);
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
router.post('/rosters', async (req, res) => {
  try {
    const season = await generationSeason(res);
    if (!season) return;
    const teams = await Team.find({ season: season._id, isDemo: true })
      .populate('barangay', 'name').populate('sport', 'category');
    const filled = new Set((await TeamPlayer.distinct('team', { team: { $in: teams.map((t) => t._id) } })).map(String));
    const empty = teams.filter((t) => !filled.has(String(t._id)));
    if (!empty.length) {
      return res.json({ message: 'Every demo team already has a roster. Nothing to fill.', teams: 0, players: 0 });
    }

    // Name + birthdate is a player's identity (one athlete, one barangay; boys/girls don't
    // mix), so every generated athlete gets a combination no one else in the season has.
    const used = new Set();
    const players = [];
    const plan = [];   // [teamIndex, playerIndex] pairs, linked after insert
    empty.forEach((team, ti) => {
      const size = team.format === 'singles' ? ROSTER_SIZE.singles
        : team.format === 'doubles' ? ROSTER_SIZE.doubles
        : team.sport?.category === 'esports' ? ROSTER_SIZE.esports : ROSTER_SIZE.team;
      const [lo, hi] = ageRange(team.division);
      for (let i = 0; i < size; i++) {
        let p;
        do {
          const age = rand(lo, hi);
          p = {
            firstName: pick(firstNames(team.division)),
            middleName: pick(SURNAMES),
            lastName: pick(SURNAMES),
            birthdate: birthdateFor(age),
            age,
          };
        } while (used.has(`${p.firstName}|${p.lastName}|${p.birthdate.toISOString()}`));
        used.add(`${p.firstName}|${p.lastName}|${p.birthdate.toISOString()}`);
        plan.push([ti, players.length]);
        players.push({
          ...p,
          address: team.barangay?.name || '',
          jerseyNumber: i + 1,
          eligibilityStatus: 'eligible',
          flagReason: '',
          isDemo: true,
        });
      }
    });

    const inserted = await Player.insertMany(players);
    await TeamPlayer.insertMany(plan.map(([ti, pi]) => ({ team: empty[ti]._id, player: inserted[pi]._id })));
    await Team.updateMany(
      { _id: { $in: empty.map((t) => t._id) } },
      { $set: { status: 'verified', submittedAt: new Date() } }
    );

    res.json({
      message: `Filled ${empty.length} team${empty.length === 1 ? '' : 's'} with ${inserted.length} made-up players, all verified. You can generate the brackets now (once the season is Ongoing).`,
      teams: empty.length,
      players: inserted.length,
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
