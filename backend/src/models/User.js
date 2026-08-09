// src/models/User.js
// Every account in the system. NO self-registration — accounts are provisioned
// by the Super Admin. Roles: super_admin, barangay_admin, organizer.

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,            // no two accounts share a username
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,          // we NEVER store the raw password, only the hash
    },
    role: {
      type: String,
      enum: ['super_admin', 'barangay_admin', 'organizer'],
      required: true,
    },
    // For barangay_admin accounts: which barangay they manage.
    barangay: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Barangay',
      default: null,           // null for super_admin and organizer
    },
    // For organizer accounts: which sport they officiate.
    assignedSport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sport',
      default: null,           // null for super_admin and barangay_admin
    },
    // Forces a password change on first login (accounts start with a temp password).
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);