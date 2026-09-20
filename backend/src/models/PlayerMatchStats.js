// src/models/PlayerMatchStats.js
// One player's stats in one match. Filled in by the organizer on the post-match form
// (basketball: points / assists / fouls / rebounds; volleyball, badminton, pickleball: points;
// esports: the role played). A player with no record simply didn't play.
// This is what lets the system show who the top scorer is (the Organizer picks the MVP
// on the same form).

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
    rebounds: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    // Any score-sheet column that isn't one of the four above (blocks, steals, kills…).
    extra: { type: mongoose.Schema.Types.Mixed, default: undefined },
    // Esports only — the role this player played (e.g. "Support (Roamer)", "Slayer").
    role: { type: String, default: null, trim: true },
  },
  {
    timestamps: true,
  }
      
);

// One stats record per player per match — prevents duplicates.
playerMatchStatsSchema.index({ match: 1, player: 1 }, { unique: true });

module.exports = mongoose.model('PlayerMatchStats', playerMatchStatsSchema);