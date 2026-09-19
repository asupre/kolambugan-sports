// src/models/ReferenceList.js
// The list of known Kolambugan residents (from the voters' list via LYDO, or the
// previous season's verified players). Each document = one resident on the list.
// The verification engine checks submitted players against these records.
// This list is REPLACED each time a new one is uploaded (it's a fresh snapshot).

const mongoose = require('mongoose');

const referenceListSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    // Not `required: true` — the source list (SK Federation's own export,
    // eventually the SK voters' list via LYDO) may not always carry one, and
    // replacing the whole list shouldn't hard-fail an upload over a missing
    // column. But the matching logic in prescreen.js now REQUIRES it (along
    // with birthdate) to agree before calling a player "eligible" — a row
    // missing it just can't ever confirm a match, same as a missing birthdate.
    middleName: {
      type: String,
      trim: true,
    },
    birthdate: {
      type: Date,              // now REQUIRED for a match to be confirmed — see prescreen.js
    },
    barangay: {
      type: String,            // stored as text (from the uploaded list), not a ref
      trim: true,
    },
    season: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Season',           // which season's upload this record belongs to
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',             // which Super Admin uploaded this list
    },
  },
  {
    timestamps: true,
  }
);

// Speeds up the name-matching lookups the verification engine does constantly.

referenceListSchema.index({ season: 1 });
referenceListSchema.index({ season: 1, lastName: 1, firstName: 1 });

module.exports = mongoose.model('ReferenceList', referenceListSchema);