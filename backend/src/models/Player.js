// src/models/Player.js
const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, required: true, trim: true },
    birthdate: { type: Date, required: true },
    age: { type: Number },
    photo: { type: mongoose.Schema.Types.ObjectId, default: null },
    address: { type: String, trim: true },
    jerseyNumber: { type: Number },
    eligibilityStatus: {
      type: String,
      enum: ['pending', 'eligible', 'needs_document', 'flagged'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Player', playerSchema);