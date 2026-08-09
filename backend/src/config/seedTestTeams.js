const mongoose = require('mongoose');
require('dotenv').config();
const Season = require('../models/Season');
const Barangay = require('../models/Barangay');
const Sport = require('../models/Sport');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const season = await Season.findOne().sort({ createdAt: -1 });
  if (!season) { console.log('No season. Create one first.'); return process.exit(1); }

  const barangay = await Barangay.findOne({ name: 'Poblacion' });
  const sport = await Sport.findOne({ name: 'Basketball' });
  if (!barangay || !sport) { console.log('Missing barangay or sport.'); return process.exit(1); }

  const existing = await Team.findOne({ teamName: 'Review Test Team', season: season._id });
  if (existing) {
    await TeamPlayer.deleteMany({ team: existing._id });
    await Team.deleteOne({ _id: existing._id });
    console.log('Cleared previous Review Test Team.');
  }

  const team = await Team.create({
    teamName: 'Review Test Team',
    barangay: barangay._id,
    sport: sport._id,
    season: season._id,
    status: 'pending',
    submittedAt: new Date(),
  });

  const roster = [
    { status: 'eligible', reason: '' },
    { status: 'eligible', reason: '' },
    { status: 'eligible', reason: '' },
    { status: 'eligible', reason: '' },
    { status: 'eligible', reason: '' },
    { status: 'eligible', reason: '' },
    { status: 'eligible', reason: '' },
    { status: 'eligible', reason: '' },
    { status: 'flagged', reason: 'Listed under Baybay, not Poblacion — cross-barangay not allowed' },
    { status: 'needs_document', reason: 'Not found on the reference list — needs a residency document' },
  ];

  for (let i = 0; i < roster.length; i++) {
    const p = await Player.create({
      firstName: `Player${i + 1}`,
      lastName: 'Test',
      birthdate: new Date('2000-01-01'),
      age: 25,
      eligibilityStatus: roster[i].status,
      flagReason: roster[i].reason,
    });
    await TeamPlayer.create({ player: p._id, team: team._id });
  }

  console.log('Created "Review Test Team" with reasons on the flagged/needs-doc players.');
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });