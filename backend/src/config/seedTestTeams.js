const mongoose = require('mongoose');
require('dotenv').config();
const Season = require('../models/Season');
const Barangay = require('../models/Barangay');
const Sport = require('../models/Sport');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');

const BARANGAYS = ['Poblacion', 'Baybay', 'Mukas', 'Caromatan', 'Libertad', 'Manga', 'Titunod', 'Rebucon'];
const TEAMS_PER_BARANGAY = 4; // → 8 barangays × 2 = 16 ML teams

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const season = await Season.findOne().sort({ createdAt: -1 });
  if (!season) { console.log('No season. Create one first.'); return process.exit(1); }

  const sport = await Sport.findOne({ name: 'Mobile Legends' });
  if (!sport) { console.log('Mobile Legends sport not found.'); return process.exit(1); }

  const old = await Team.find({ sport: sport._id, season: season._id });
  for (const t of old) await TeamPlayer.deleteMany({ team: t._id });
  await Team.deleteMany({ sport: sport._id, season: season._id });
  console.log(`Cleared ${old.length} existing ML team(s) for ${season.name}.`);

  let count = 0;
  for (const brgyName of BARANGAYS) {
    const barangay = await Barangay.findOne({ name: brgyName });
    if (!barangay) { console.log(`Barangay "${brgyName}" not found, skipping.`); continue; }

    for (let t = 1; t <= TEAMS_PER_BARANGAY; t++) {
      const team = await Team.create({
        teamName: `${brgyName} Esports ${t}`,
        barangay: barangay._id,
        sport: sport._id,
        season: season._id,
        status: 'verified',
        division: 'open',
        submittedAt: new Date(),
      });
      for (let i = 0; i < 10; i++) {
        const p = await Player.create({
          firstName: `P${i + 1}`,
          lastName: `${brgyName}${t}`,
          birthdate: new Date('2000-01-01'),
          age: 25,
          eligibilityStatus: 'eligible',
        });
        await TeamPlayer.create({ player: p._id, team: team._id });
      }
      count++;
      console.log(`Created verified ML team: ${team.teamName}`);
    }
  }

  console.log(`Done — ${count} verified Mobile Legends teams ready.`);
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });