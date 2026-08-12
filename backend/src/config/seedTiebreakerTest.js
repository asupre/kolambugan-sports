const mongoose = require('mongoose');
require('dotenv').config();
const Season = require('../models/Season');
const Barangay = require('../models/Barangay');
const Sport = require('../models/Sport');
const Team = require('../models/Team');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const season = await Season.findOne().sort({ createdAt: -1 });
  const sport = await Sport.findOne({ name: 'Mobile Legends' });
  if (!season || !sport) { console.log('Need a season and Mobile Legends sport.'); return process.exit(1); }

  // Clear any existing ML tournament for a clean test.
  const existing = await Tournament.find({ sport: sport._id, season: season._id });
  for (const t of existing) await Match.deleteMany({ tournament: t._id });
  await Tournament.deleteMany({ sport: sport._id, season: season._id });

  // Grab 4 verified ML teams (A, B, C, D).
  const teams = await Team.find({ sport: sport._id, season: season._id, status: 'verified' }).limit(4);
  if (teams.length < 4) { console.log(`Need 4 verified ML teams; found ${teams.length}. Run seedTestTeams first.`); return process.exit(1); }
  const [A, B, C, D] = teams;

  // One group, top 2 advance → forces a 3-way tie for the 2nd spot.
  const tournament = await Tournament.create({
    sport: sport._id,
    season: season._id,
    format: 'round_robin',
    stage: 'group_stage',
    groups: ['A'],
    advancePerGroup: 2,
    knockoutSize: 8,
  });

  // Helper: create a completed group match with a winner.
  const game = async (home, away, winner) => {
    await Match.create({
      tournament: tournament._id,
      bracket: 'group',
      group: 'A',
      round: 1,
      teamA: home._id,
      teamB: away._id,
      bestOf: 1,
      status: 'completed',
      seriesWinner: winner._id,
      games: [{
        gameNumber: 1,
        scoreA: winner._id.equals(home._id) ? 1 : 0,
        scoreB: winner._id.equals(away._id) ? 1 : 0,
        winner: winner._id,
      }],
    });
  };

  // A beats everyone (clear 1st). Then a B→C→D→B cycle (all end 1-2, tied).
  await game(A, B, A);
  await game(A, C, A);
  await game(A, D, A);
  await game(B, C, B); // B beats C
  await game(C, D, C); // C beats D
  await game(D, B, D); // D beats B  → cycle: B,C,D each 1 win, 2 losses

  console.log('Tiebreaker test ready: A is clear 1st; B, C, D tied for the 2nd spot.');
  console.log('Go to the ML tournament — you should see "resolve tiebreakers".');
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });