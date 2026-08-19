// DEV ONLY — add verified teams for one sport so the 4-group double-elim can be
// tested. Also removes any existing tournament for that sport so /generate is clear.
// Run from backend/:  node src/config/seedVerifiedTeams.js   then delete it.
const mongoose = require('mongoose');
require('dotenv').config();
const Season = require('../models/Season');
const Sport = require('../models/Sport');
const Barangay = require('../models/Barangay');
const Team = require('../models/Team');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');

const SPORT_NAME = 'Basketball';
const HOW_MANY = 26;   // 10 -> groups of 3/3/2/2, exercises byes nicely

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const season = await Season.findOne().sort({ createdAt: -1 });
    if (!season) { console.log('No season found. Create a season first.'); process.exit(1); }
    const sport = await Sport.findOne({ name: SPORT_NAME });
    if (!sport) { console.log(`Sport "${SPORT_NAME}" not found.`); process.exit(1); }

    // Clean slate: remove any existing tournament + its matches for this sport/season,
    // and any leftover teams we previously made for it.
    const oldT = await Tournament.find({ sport: sport._id, season: season._id });
    for (const t of oldT) { await Match.deleteMany({ tournament: t._id }); await Tournament.deleteOne({ _id: t._id }); }
    await Team.deleteMany({ sport: sport._id, season: season._id });
    console.log(`Cleared ${oldT.length} old ${SPORT_NAME} tournament(s) and their teams.`);

    const barangays = await Barangay.find().limit(HOW_MANY);
    if (barangays.length < HOW_MANY) { console.log(`Only ${barangays.length} barangays found.`); process.exit(1); }

    const made = [];
    for (let i = 0; i < HOW_MANY; i++) {
      const b = barangays[i];
      const team = await Team.create({
        teamName: `${b.name} ${SPORT_NAME}`,
        barangay: b._id, sport: sport._id, season: season._id,
        status: 'verified', submittedAt: new Date(),
      });
      made.push(team.teamName);
    }

    console.log(`\nCreated ${made.length} verified ${SPORT_NAME} teams:`);
    made.forEach((n) => console.log('  ' + n));
    console.log('\nNow generate via the API: POST /api/tournaments/generate  { sportId: <Basketball id> }');

    await mongoose.disconnect();
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
})();