// src/models/Champion.js
// A past champion — a record of who won a sport in a given year.
//
// Every field is FREE TEXT rather than a reference. Champions predate this
// system: a 2019 winner has no Team document, no Player document, and possibly
// no barangay record under the same name. Storing text keeps history enterable
// without inventing fake records for seasons the system never ran.

const mongoose = require('mongoose');

const championSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true },
    sport: { type: String, required: true, trim: true },   // "Basketball"
    division: { type: String, trim: true, default: '' },   // "U15", "Boys", "Open"
    barangay: { type: String, required: true, trim: true },// the winning barangay
    teamName: { type: String, trim: true, default: '' },
    mvp: { type: String, trim: true, default: '' },
    prize: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },

    // The season this title counts for on the SEASONAL leaderboard (Oct 2026): set to the current
    // season when the Super Admin ticks 'This season'. null = history only (titles from before the
    // system, or a deleted season). Every champion is on the all-time leaderboard either way.
    season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', default: null },

    // Proof of the win — a team photo, trophy shot, or certificate. PUBLIC.
    photo: { type: mongoose.Schema.Types.ObjectId, default: null },

    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Public listing sorts newest year first, then by sport.
championSchema.index({ year: -1, sport: 1 });

module.exports = mongoose.model('Champion', championSchema);