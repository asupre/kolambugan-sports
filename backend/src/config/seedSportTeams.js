// DEV — creates verified teams with rosters for one sport, so a tournament can
// be generated and its bracket tested without registering by hand.
//
// Run from backend/:
//   node src/config/seedSportTeams.js "Call of Duty: Mobile" 16
//
// Skips registration and residency screening on purpose: it writes teams
// straight to `verified` with eligible players. That means it does NOT test the
// registration or verification paths — only the draw and the bracket.
//
// DELETE BEFORE DEPLOY.

const mongoose = require('mongoose');
require('dotenv').config();

const Season = require('../models/Season');
const Sport = require('../models/Sport');
const Barangay = require('../models/Barangay');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');

const ROSTER = { team: 10, doubles: 2, singles: 1 };

const FIRST = ['Juan', 'Jose', 'Mark', 'Kevin', 'Ariel', 'Noel', 'Leo', 'Erwin',
  'Paolo', 'Dennis', 'Angelo', 'Joshua', 'Ryan', 'Marlon', 'Christian'];
const LAST = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza',
  'Torres', 'Flores', 'Ramos', 'Aquino', 'Castro', 'Rivera'];
const pick = (a, i) => a[i % a.length];

(async () => {
  const sportName = process.argv[2];
  const count = Number(process.argv[3]) || 16;
  if (!sportName) {
    console.error('Give a sport name, e.g. node src/config/seedSportTeams.js "Basketball" 16');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const season = await Season.findOne().sort({ createdAt: -1 });
  if (!season) { console.error('No season exists. Create one first.'); process.exit(1); }

  const sport = await Sport.findOne({ name: sportName });
  if (!sport) { console.error(`No sport named "${sportName}".`); process.exit(1); }

  const barangays = await Barangay.find().sort({ name: 1 });
  if (barangays.length === 0) { console.error('No barangays.'); process.exit(1); }

  const division = (sport.divisions && sport.divisions[0]) || 'open';
  const format = sport.entryFormat || 'team';
  const rosterSize = ROSTER[format] || 10;
  const perBarangay = sport.teamsPerBarangay ?? (sport.name === 'Mobile Legends' ? 2 : 1);

  console.log(`${sport.name} · ${division} · ${format} · ${rosterSize} players per team`);
  console.log(`Up to ${perBarangay} team(s) per barangay, ${barangays.length} barangays available.`);

  if (count > barangays.length * perBarangay) {
    console.error(`Can't make ${count} teams — only ${barangays.length * perBarangay} possible.`);
    process.exit(1);
  }

  let made = 0;
  for (let slot = 1; slot <= perBarangay && made < count; slot++) {
    for (const b of barangays) {
      if (made >= count) break;

      const teamName = perBarangay > 1 ? `${b.name} ${slot}` : `${b.name} ${division}`;
      if (await Team.findOne({ teamName, season: season._id, sport: sport._id })) continue;

      const team = await Team.create({
        teamName,
        barangay: b._id,
        sport: sport._id,
        season: season._id,
        division,
        format,
        status: 'verified',          // straight to verified — screening is skipped
        submittedAt: new Date(),
      });

      for (let i = 0; i < rosterSize; i++) {
        const player = await Player.create({
          firstName: pick(FIRST, made * 3 + i),
          lastName: pick(LAST, made * 5 + i),
          birthdate: new Date(2000 + (i % 8), (i % 12), 1 + (i % 27)),
          age: 20 + (i % 6),
          jerseyNumber: i + 1,
          eligibilityStatus: 'eligible',
        });
        await TeamPlayer.create({ team: team._id, player: player._id });
      }

      made += 1;
      console.log(`  ${made}. ${teamName}`);
    }
  }

  console.log(`\nCreated ${made} verified team(s). Generate the tournament from the admin.`);
  await mongoose.disconnect();
})();