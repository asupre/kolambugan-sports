// DEV ONLY — verified basketball teams split across two age divisions, so both
// tournaments can be generated. Run from backend/:  node src/config/seedVerifiedTeams.js
const mongoose = require('mongoose');
require('dotenv').config();
const Season = require('../models/Season');
const Sport = require('../models/Sport');
const Barangay = require('../models/Barangay');
const Team = require('../models/Team');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');

const SPORT_NAME = 'Badminton';
const DIVISIONS = ['boys', 'girls'];
const PER_DIVISION = 12;   // minimum for 4 groups of 3

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const season = await Season.findOne().sort({ createdAt: -1 });
    if (!season) { console.log('No season found.'); process.exit(1); }
    const sport = await Sport.findOne({ name: SPORT_NAME });
    if (!sport) { console.log(`Sport "${SPORT_NAME}" not found.`); process.exit(1); }

    // clean slate for this sport
    const oldT = await Tournament.find({ sport: sport._id, season: season._id });
    for (const t of oldT) { await Match.deleteMany({ tournament: t._id }); await Tournament.deleteOne({ _id: t._id }); }
    await Team.deleteMany({ sport: sport._id, season: season._id });
    console.log(`Cleared ${oldT.length} old ${SPORT_NAME} tournament(s) and their teams.`);

    const barangays = await Barangay.find();
    if (barangays.length < PER_DIVISION) { console.log(`Only ${barangays.length} barangays.`); process.exit(1); }

    for (const division of DIVISIONS) {
      for (let i = 0; i < PER_DIVISION; i++) {
        const b = barangays[i % barangays.length];
        await Team.create({
          teamName: `${b.name} ${division}`,
          barangay: b._id, sport: sport._id, season: season._id,
          division, format: 'team',
          status: 'verified', submittedAt: new Date(),
        });
      }
      console.log(`Created ${PER_DIVISION} verified teams for division "${division}".`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
})();