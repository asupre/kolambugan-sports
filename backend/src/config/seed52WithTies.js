const mongoose = require('mongoose');
require('dotenv').config();
const Season = require('../models/Season');
const Barangay = require('../models/Barangay');
const Sport = require('../models/Sport');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');

// Round-robin pairings for a list of team indices.
function pairs(n) {
  const out = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
  return out;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const season = await Season.findOne().sort({ createdAt: -1 });
  const sport = await Sport.findOne({ name: 'Mobile Legends' });
  if (!season || !sport) { console.log('Need a season and Mobile Legends sport.'); return process.exit(1); }

  // Wipe existing ML teams + tournaments for a clean slate.
  const oldTeams = await Team.find({ sport: sport._id, season: season._id });
  for (const t of oldTeams) await TeamPlayer.deleteMany({ team: t._id });
  await Team.deleteMany({ sport: sport._id, season: season._id });
  const oldTours = await Tournament.find({ sport: sport._id, season: season._id });
  for (const t of oldTours) await Match.deleteMany({ tournament: t._id });
  await Tournament.deleteMany({ sport: sport._id, season: season._id });

  const barangays = await Barangay.find().sort({ name: 1 });
  if (barangays.length < 26) { console.log(`Need 26 barangays; found ${barangays.length}.`); return process.exit(1); }

  // Create 52 teams: 2 per barangay.
  const allTeams = [];
  for (const b of barangays) {
    for (let n = 1; n <= 2; n++) {
      const team = await Team.create({
        teamName: `${b.name.trim()} ${n}`,
        barangay: b._id,
        sport: sport._id,
        season: season._id,
        status: 'verified',
        division: 'open',
        submittedAt: new Date(),
      });
      allTeams.push(team);
    }
  }
  console.log(`Created ${allTeams.length} verified ML teams.`);

  // 8 groups: sizes 7,7,7,7,6,6,6,6 = 52.
  const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const sizes = [7, 7, 7, 7, 6, 6, 6, 6];
  const groups = {};
  let idx = 0;
  LABELS.forEach((g, gi) => {
    groups[g] = allTeams.slice(idx, idx + sizes[gi]);
    idx += sizes[gi];
  });

  const tournament = await Tournament.create({
    sport: sport._id, season: season._id, format: 'round_robin',
    stage: 'group_stage', groups: LABELS, advancePerGroup: 2, knockoutSize: 16,
  });

  // Decide the winner of a match between two teams in a group.
  // Default: lower index (stronger) wins. In TIE groups, indices 1,2,3 cycle.
  const TIE_GROUPS = ['A', 'C']; // these get a 3-way tie for the 2nd spot
  function winnerIndex(g, i, j) {
    if (TIE_GROUPS.includes(g) && [1, 2, 3].includes(i) && [1, 2, 3].includes(j)) {
      // cycle: 1 beats 2, 2 beats 3, 3 beats 1
      const beats = { 1: 2, 2: 3, 3: 1 };
      return beats[i] === j ? i : j;
    }
    return i < j ? i : j; // stronger (lower index) wins
  }

  const docs = [];
  for (const g of LABELS) {
    const teams = groups[g];
    for (const [i, j] of pairs(teams.length)) {
      const winIdx = winnerIndex(g, i, j);
      const winner = teams[winIdx]._id;
      const home = teams[i], away = teams[j];
      docs.push({
        tournament: tournament._id, bracket: 'group', group: g, round: 1,
        teamA: home._id, teamB: away._id, bestOf: 1, status: 'completed',
        seriesWinner: winner,
        games: [{
          gameNumber: 1,
          scoreA: String(winner) === String(home._id) ? 1 : 0,
          scoreB: String(winner) === String(away._id) ? 1 : 0,
          winner,
        }],
      });
    }
  }
  await Match.insertMany(docs);

  console.log(`Tournament built: 8 groups, ${docs.length} group matches, all scored.`);
  console.log(`Groups A and C have a 3-way tie for the 2nd (last) qualifying spot.`);
  console.log(`Go to Mobile Legends → you should see tie prompts for A and C only.`);
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });