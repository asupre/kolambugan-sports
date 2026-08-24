// DEV ONLY — give every player-less team in a sport a roster, so live scoring can
// be tested. Fake names only. Run from backend/, then delete.
const mongoose = require('mongoose');
require('dotenv').config();
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Sport = require('../models/Sport');

const SPORT_NAME = 'Badminton';
const PER_TEAM = 2;
const FIRST = ['Juan','Pedro','Miguel','Carlo','Rey','Ariel','Dennis','Noel','Ramon','Jomar','Kier','Vince'];
const LAST  = ['Santos','Reyes','Cruz','Bautista','Garcia','Mendoza','Torres','Flores','Ramos','Aquino'];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const sport = await Sport.findOne({ name: SPORT_NAME });
  const teams = await Team.find({ sport: sport._id });
  let made = 0;

  for (const t of teams) {
    const existing = await TeamPlayer.countDocuments({ team: t._id });
    if (existing > 0) continue;
    for (let i = 0; i < PER_TEAM; i++) {
      const p = await Player.create({
        firstName: FIRST[i % FIRST.length],
        lastName: `${LAST[i % LAST.length]}`,
        birthdate: new Date(2000, i % 12, (i % 27) + 1),
        age: 25,
        jerseyNumber: i + 1,
        eligibilityStatus: 'eligible',
      });
      await TeamPlayer.create({ team: t._id, player: p._id });
      made++;
    }
  }
  console.log(`Added ${made} players across ${teams.length} ${SPORT_NAME} teams.`);
  await mongoose.disconnect();
})();