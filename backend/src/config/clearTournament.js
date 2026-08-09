const mongoose = require('mongoose');
require('dotenv').config();
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const t = await Tournament.deleteMany({});
  const m = await Match.deleteMany({});
  console.log(`Deleted ${t.deletedCount} tournaments and ${m.deletedCount} matches.`);
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });