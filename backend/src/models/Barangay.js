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
  },

  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Barangay', barangaySchema);