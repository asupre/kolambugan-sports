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
    // Account-recovery code (Super Admin only, Sep 2026) — a self-service
    // backup for "I forgot my password and there's no one above me to reset
    // it" (the two Super Admin accounts have no one else to turn to). Never
    // stored in plaintext, same as passwordHash; shown to the account holder
    // exactly once, at generation, in POST /api/auth/recovery-code. Consumed
    // (cleared) the moment it's used to reset a password via
    // POST /api/auth/forgot-password, so a leaked code can't be replayed —
    // the account holder generates a fresh one afterward. Per-account, so
    // regenerating or using one Super Admin's code never touches another's.
    recoveryCodeHash: {
      type: String,
      default: null,
    },
    recoveryCodeSetAt: {
      type: Date,
      default: null,
    },
    // Profile picture (Sep 2026) — a GridFS id in the `photos` bucket, same
    // bucket player headshots use. Served publicly like a player photo (a
    // staff avatar isn't sensitive the way a residency document is).
    photo: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Dashboard banner picture (Oct 2026): the "Hello" banner on the account's own Dashboard.
    // Each account picks its own from the profile panel. GridFS id in the `photos` bucket.
    banner: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Barangay Admin notifications bell (Nov 2026): notifications newer than this are unread.
    notificationsSeenAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);