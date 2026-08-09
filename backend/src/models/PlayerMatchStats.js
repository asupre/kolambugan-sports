// src/models/PlayerMatchStats.js
// Records an individual player's stats in a single match: points and fouls.
// This is what lets the Organizer track per-player scoring, and what lets the
// system show who the top scorer is (the Organizer then declares MVP manually).

const mongoose = require('mongoose');

const playerMatchStatsSchema = new mongoose.Schema(
  {
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
    },
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
    },
    points: {
      type: Number,
      default: 0,
    },
    fouls: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// One stats record per player per match — prevents duplicates.
playerMatchStatsSchema.index({ match: 1, player: 1 }, { unique: true });

module.exports = mongoose.model('PlayerMatchStats', playerMatchStatsSchema);