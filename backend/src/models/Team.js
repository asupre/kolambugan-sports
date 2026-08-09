// src/models/Team.js
// A team = one barangay's entry into one sport for one season.
// Example: "Baybay Warriors" in Basketball for the 2026 Season.

const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    barangay: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Barangay',
      required: true,          // every team belongs to a barangay
    },
    sport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sport',
      required: true,          // every team plays one sport
    },
    season: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Season',
      required: true,          // every team belongs to one season
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',      // a newly submitted team starts as pending
    },
    // Roster lifecycle, separate from verification status above.
    // null = still a draft (editable); a date = submitted & locked.
    submittedAt: {
      type: Date,
      default: null,
    },
    division: { type: String, enum: ['boys', 'girls', 'open'], default: 'open' },
  },
  {
    timestamps: true,
  }
  
);

module.exports = mongoose.model('Team', teamSchema);