// src/routes/notifications.js
// The Barangay Admin's notifications bell (Nov 2026). Season updates (lib/notify.js), newest
// first. Unread = newer than User.notificationsSeenAt; opening the bell marks them read.

const express = require('express');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, authorize('barangay_admin'));

const LIMIT = 30;

// GET /api/notifications: this account's latest notifications + unread count.
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notificationsSeenAt').lean();
    const filter = { role: 'barangay_admin', barangay: { $in: [null, req.user.barangay || null] } };
    const rows = await Notification.find(filter).sort({ createdAt: -1 }).limit(LIMIT).lean();
    const seenAt = user?.notificationsSeenAt || null;
    const unread = await Notification.countDocuments(seenAt ? { ...filter, createdAt: { $gt: seenAt } } : filter);
    res.json({
      unread: Math.min(unread, LIMIT),
      notifications: rows.map((n) => ({
        _id: n._id,
        title: n.title,
        body: n.body,
        link: n.link,
        stage: n.stage,
        at: n.createdAt,
        unread: !seenAt || n.createdAt > seenAt,
      })),
    });
  } catch (err) {
    console.error('Notifications list error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/notifications/seen: the bell was opened; everything so far is read.
router.post('/seen', async (req, res) => {
  try {
    await User.updateOne({ _id: req.user.id }, { $set: { notificationsSeenAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Notifications seen error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;
