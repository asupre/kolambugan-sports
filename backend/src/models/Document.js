// src/models/Document.js
// A residency-proof document uploaded for a player who is NOT on the reference list
// (minors, new residents). The Super Admin reviews it and approves or rejects.

const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,          // which player this document proves residency for
    },
    docType: {
      type: String,
      enum: ['birth_certificate', 'voters_id', 'barangay_clearance', 'parental_consent'],
      required: true,
    },
    file: {
      type: mongoose.Schema.Types.ObjectId,   // GridFS file id of the uploaded file
      required: true,
    },
    verifyStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',      // waits for Super Admin review
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',             // which Super Admin approved/rejected it
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Document', documentSchema);