// src/models/Notification.js
// Notifications for Barangay Admins (Nov 2026, Super Admin request): "inform them of every
// update of the season, like registration, verification…". One document per announcement;
// `barangay: null` = every barangay, otherwise just that one (room for per-team news later).
// Read state is per account: User.notificationsSeenAt (anything newer is unread).

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['barangay_admin'], default: 'barangay_admin' },
    barangay: { type: mongoose.Schema.Types.ObjectId, ref: 'Barangay', default: null },
    season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', default: null },
    kind: { type: String, default: 'season' },     // 'season' = a season stage change
    stage: { type: String, default: null },        // the season stage it announces
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: null },         // where "Open" goes, e.g. /brgy
    // Only on a catch-up notification (lib/notify.js ensureCurrentStageNotified): "<season>:<stage>".
    // Unique, so two admins opening the bell at the same moment can't both create it. Normal
    // notifications leave it unset (a stage can legitimately be announced twice, after a back).
    key: { type: String, default: undefined },
  },
  { timestamps: true }
);

notificationSchema.index({ role: 1, createdAt: -1 });
notificationSchema.index({ key: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Notification', notificationSchema);
