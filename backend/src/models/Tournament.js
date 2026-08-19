// src/models/Tournament.js
// One tournament = the competition for ONE sport in ONE season.
// It holds the format and grouping info. The actual games live in the Match model.

const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema(
  {
    sport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sport',
      required: true,          // which sport this tournament is for
    },
      // Which division of the sport this tournament is for. One tournament per
    // (sport, season, division) — e.g. Basketball has 'under17' and 'under30'.
    division: {
      type: String,
      enum: ['open', 'boys', 'girls', 'under17', 'under30'],
      default: 'open',
    },
    season: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Season',
      required: true,          // which season it belongs to
    },
    stage: {
      type: String,
      enum: ['group_stage', 'elimination', 'completed'],
      default: 'group_stage',  // tournaments progress through these stages
    },
    format: {
      type: String,
      enum: ['double_elimination', 'round_robin'],
      required: true,
      // copied from the sport: physical -> double_elimination, ML -> round_robin
    },
    groups: {
      type: [String],          // e.g. ["A", "B", "C", "D"] for the group draw
      default: [],
    },
    advancePerGroup: {
      type: Number,            // how many teams advance from each group (e.g. 2)
      default: 2,
    },
    knockoutSize: {
      type: Number,            // 8 or 16 — the Top-N knockout the group stage funnels into
      enum: [8, 16],
      default: 16,
    },
      
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Tournament', tournamentSchema);