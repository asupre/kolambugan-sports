// src/models/Barangay.js
// The 26 barangays of Kolambugan. Each team belongs to a barangay,
// and each barangay admin account is tied to one.

const mongoose = require('mongoose');

const barangaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,            // no two barangays can have the same name
      trim: true,
    },
    allowsCrossBarangay: {
      type: Boolean,
      default: false,          // most barangays: players must be from that barangay
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Barangay', barangaySchema);