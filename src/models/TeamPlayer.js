// src/models/TeamPlayer.js
const mongoose = require('mongoose');

const teamPlayerSchema = new mongoose.Schema(
  {
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  },
  { timestamps: true }
);

teamPlayerSchema.index({ team: 1, player: 1 }, { unique: true });

module.exports = mongoose.model('TeamPlayer', teamPlayerSchema);