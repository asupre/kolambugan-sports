// src/models/Season.js
// A Season is the top-level container. ONE season runs all 7 sports at a time.
// Only the Super Admin can move it through its lifecycle states.

const mongoose = require('mongoose');

const seasonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,          // e.g. "2026 Season"
      trim: true,
    },
    status: {
      type: String,
      enum: [                  // the season can ONLY be one of these five states
        'setup',
        'registration_open',
        'verification',
        'ongoing',
        'completed',
      ],
      default: 'setup',        // a new season always starts in setup
    },
    openedBy: {
      type: mongoose.Schema.Types.ObjectId,  // which Super Admin opened it
      ref: 'User',             // links to the User model (we'll build that soon)
    },
    openedAt: {
      type: Date,
    },
    closedAt: {
      type: Date,
    },
    // Set once "Clean up this season" has removed the season's residency
    // documents and reference list (and optionally player photos) to free
    // storage. Results, rosters, stats and champions are kept.
    cleanedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,          // auto-adds createdAt and updatedAt fields
  }
);

module.exports = mongoose.model('Season', seasonSchema);