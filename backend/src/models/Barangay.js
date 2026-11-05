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
      default: false,          // unchecked: this barangay's TEAMS may only field its own residents. Checked: its teams may field residents of ANY barangay (flag is read from the TEAM's barangay)
    },
        // Barangay crest, shown across the public site. Public by design.
    logo: { type: mongoose.Schema.Types.ObjectId, default: null },
    // The cross-barangay terms (Nov 2026, Super Admin): a barangay that may field players from
    // other barangays must accept them. Its admin answers once, in a pop-up after login; the
    // answer is final until the Super Admin presses "Ask again" (POST /api/terms/:id/reset).
    // seen = the Super Admin has opened the notifications since this answer came in.
    crossTerms: {
      status: { type: String, enum: ['accepted', 'declined', null], default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      byName: { type: String, default: null },
      at: { type: Date, default: null },
      seen: { type: Boolean, default: false },
    },
  },

  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Barangay', barangaySchema);