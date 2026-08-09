// src/models/Sport.js
// The sports in the league. Physical sports use double-elimination;
// Mobile Legends uses grouped round-robin. This model stores that difference.

const mongoose = require('mongoose');

const sportSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,            // "Basketball", "Volleyball", "Mobile Legends", etc.
      trim: true,
    },
    category: {
      type: String,
      enum: ['physical', 'esports'],   // physical = the 6 court sports; esports = ML
      required: true,
    },
    tournamentFormat: {
      type: String,
      enum: ['double_elimination', 'round_robin'],
      required: true,
      // physical sports -> double_elimination
      // Mobile Legends  -> round_robin
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Sport', sportSchema);