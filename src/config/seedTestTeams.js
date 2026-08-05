const mongoose = require('mongoose');
require('dotenv').config();
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Sport = require('../models/Sport');
const Barangay = require('../models/Barangay');
const Season = require('../models/Season');

const BARANGAYS = ['Poblacion', 'Baybay', 'Mukas', 'Caromatan', 'Libertad', 'Manga', 'Titunod', 'Rebucon'];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const season = await Season.findOne().sort({ createdAt: -1 });
  if (!season) { console.log('No season exists. Create one first.'); return process.exit(1); }
  const ml = await Sport.findOne({ name: 'Mobile Legends' });
  if (!ml) { console.log('No Mobile Legends sport. Run the main seed first.'); return process.exit(1); }

  // Clean slate: remove existing ML teams for this season and their players.
  const old = await Team.find({ sport: ml._id, season: season._id });
  for (const t of old) {
    const links = await TeamPlayer.find({ team: t._id });
    await Player.deleteMany({ _id: { $in: links.map((l) => l.player) } });
    await TeamPlayer.deleteMany({ team: t._id });
    await Team.deleteOne({ _id: t._id });
  }
  console.log(`Cleared ${old.length} existing ML team(s) for ${season.name}.`);

  for (const name of BARANGAYS) {
    const brgy = await Barangay.findOne({ name });
    if (!brgy) { console.log(`Barangay "${name}" not found, skipping.`); continue; }
    const team = await Team.create({
      teamName: `${name} Esports`,
      barangay: brgy._id, sport: ml._id, season: season._id,
      submittedAt: new Date(), status: 'verified',
    });
    for (let i = 1; i <= 10; i++) {
      const p = await Player.create({
        firstName: `${name.slice(0, 4)}${i}`, lastName: 'Player',
        birthdate: new Date('2004-01-01'), age: 22, eligibilityStatus: 'eligible',
      });
      await TeamPlayer.create({ team: team._id, player: p._id });
    }
    console.log(`Created verified ML team: ${team.teamName}`);
  }
  await mongoose.disconnect();
  console.log('Done — 4 verified Mobile Legends teams ready.');
}
run().catch((e) => { console.error(e); process.exit(1); });