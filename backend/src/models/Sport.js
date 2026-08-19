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
    // Whether this sport runs separate boys' and girls' brackets this season.
    // false = single "open" bracket; true = boys + girls, each its own bracket.
    // Set by the Super Admin when opening registration.
        isDivided: {
      type: Boolean,
      default: false,
    },
    // Which divisions this sport runs THIS SEASON (set by Super Admin when opening
    // registration). e.g. Basketball ['under17','under30']; Volleyball ['boys','girls'];
    // Billiards/ML ['open']. Drives one bracket per division.
    divisions: {
      type: [String],
      default: ['open'],
    },
    // The entry format this sport runs THIS SEASON:
    //   'team'    -> squad sports
    //   'singles' -> badminton if the admin picks singles; billiards
    //   'doubles' -> badminton if the admin picks doubles; pickleball (always)
    entryFormat: {
      type: String,
      enum: ['team', 'singles', 'doubles'],
      default: 'team',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Sport', sportSchema);