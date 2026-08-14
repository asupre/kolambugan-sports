const mongoose = require('mongoose');
require('dotenv').config();
const Season = require('../models/Season');
const Sport = require('../models/Sport');
const Team = require('../models/Team');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const season = await Season.findOne().sort({ createdAt: -1 });
  const sport = await Sport.findOne({ name: 'Mobile Legends' });
  if (!season || !sport) { console.log('Need a season and Mobile Legends sport.'); return process.exit(1); }

  // Clear existing ML tournaments for a clean test.
  const existing = await Tournament.find({ sport: sport._id, season: season._id });
  for (const t of existing) await Match.deleteMany({ tournament: t._id });
  await Tournament.deleteMany({ sport: sport._id, season: season._id });

  // Need 6 verified ML teams (A..F). Run seedTestTeams first if you don't have them.
  const teams = await Team.find({ sport: sport._id, season: season._id, status: 'verified' }).limit(6);
  if (teams.length < 6) { console.log(`Need 6 verified ML teams; found ${teams.length}. Run seedTestTeams first.`); return process.exit(1); }
  const [A, B, C, D, E, F] = teams;

  // One group, top 2 advance → forces a 5-way tie (A..E all 3 wins; F last).
  const tournament = await Tournament.create({
    sport: sport._id,
    season: season._id,
    format: 'round_robin',
    stage: 'group_stage',
    groups: ['A'],
    advancePerGroup: 2,
    knockoutSize: 8,
  });

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

  // Rotational cycle among A-E (each 2-2), plus each beats F. F loses all.
  await game(A, B, A); await game(A, C, A); await game(A, D, D); await game(A, E, E);
  await game(B, C, B); await game(B, D, B); await game(B, E, E);
  await game(C, D, C); await game(C, E, C);
  await game(D, E, D);
  await game(A, F, A); await game(B, F, B); await game(C, F, C); await game(D, F, D); await game(E, F, E);

  console.log('5-way tie test ready: A, B, C, D, E all tied at 3 wins; F is clear last.');
  console.log('Top 2 advance → 5 teams tied for 2 spots. Go generate + score the tiebreaker.');
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });