// DEV — set each sport's divisions + entryFormat for the season.
// Temporary stand-in for the Super Admin config UI (built later).
// Run from backend/:  node src/config/seedSportConfig.js
const mongoose = require('mongoose');
require('dotenv').config();
const Sport = require('../models/Sport');

// Badminton's format is the Super Admin's per-season choice — change here for now.
const BADMINTON_FORMAT = 'doubles';   // 'singles' or 'doubles'

const CONFIG = {
  'Basketball':     { divisions: ['under15', 'under30'], entryFormat: 'team' },
  'Volleyball':     { divisions: ['boys', 'girls'],      entryFormat: 'team' },
  'Badminton':      { divisions: ['boys', 'girls'],      entryFormat: BADMINTON_FORMAT },
  'Pickleball':     { divisions: ['boys', 'girls'],      entryFormat: 'doubles' },
  'Billiards':      { divisions: ['open'],               entryFormat: 'singles' },
  'Chess':          { divisions: ['open'],               entryFormat: 'singles' },
  'Mobile Legends': { divisions: ['open'],               entryFormat: 'team' },
};

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    for (const [name, cfg] of Object.entries(CONFIG)) {
      const res = await Sport.updateOne({ name }, { $set: cfg });
      console.log(res.matchedCount
        ? `${name.padEnd(16)} divisions=[${cfg.divisions}]  entryFormat=${cfg.entryFormat}`
        : `${name.padEnd(16)} NOT FOUND — check the sport name`);
    }
    await mongoose.disconnect();
  } catch (err) {
    console.error('Config seed error:', err.message);
    process.exit(1);
  }
})();