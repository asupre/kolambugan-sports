// src/routes/terms.js
// League terms and conditions (Nov 2026, Super Admin request). EVERY barangay must accept
// them: its Barangay Admin sees a pop-up after logging in and answers Accept or Decline.
// Registration stays closed until it accepts (lib/crossTerms.js). Answers show up in the
// Super Admin's notifications bell. An answer is final until the Super Admin presses "Ask again".
// The terms text itself lives in the frontend (frontend/src/lib/crossTerms.js).

const express = require('express');
const Barangay = require('../models/Barangay');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/terms/mine: barangay admin; does this account need to answer the terms?
router.get('/mine', authorize('barangay_admin'), async (req, res) => {
  try {
    const b = req.user.barangay ? await Barangay.findById(req.user.barangay).select('name allowsCrossBarangay crossTerms').lean() : null;
    if (!b) return res.json({ required: false, status: null });
    const status = b.crossTerms?.status || null;
    // Page 2 of the pop-up: the barangays currently allowed to field players from other barangays.
    const cross = await Barangay.find({ allowsCrossBarangay: true }).select('name').sort({ name: 1 }).lean();
    res.json({
      required: !status, status, barangayName: b.name, allowsCrossBarangay: !!b.allowsCrossBarangay,
      crossBarangays: cross.map((x) => x.name),
    });
  } catch (err) {
    console.error('Terms mine error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/terms/mine { accept: true|false }: barangay admin answers, once.
router.post('/mine', authorize('barangay_admin'), async (req, res) => {
  try {
    if (typeof req.body.accept !== 'boolean') return res.status(400).json({ message: 'accept must be true or false.' });
    if (!req.user.barangay) return res.status(400).json({ message: 'Your account is not linked to a barangay.' });
    const user = await User.findById(req.user.id).select('username').lean();
    const status = req.body.accept ? 'accepted' : 'declined';
    // Conditional update: only while there is no answer yet, so two tabs can't both answer
    // and an answer can't be changed here.
    const b = await Barangay.findOneAndUpdate(
      { _id: req.user.barangay, 'crossTerms.status': { $in: [null, undefined] } },
      { $set: { crossTerms: { status, by: req.user.id, byName: user?.username || null, at: new Date(), seen: false } } },
      { returnDocument: 'after' }
    );
    if (!b) {
      const cur = await Barangay.findById(req.user.barangay).select('crossTerms').lean();
      if (!cur) return res.status(404).json({ message: 'Barangay not found.' });
      return res.status(409).json({ message: `You already ${cur.crossTerms.status} the terms.`, status: cur.crossTerms.status });
    }
    res.json({
      status,
      message: req.body.accept
        ? 'Thank you. You accepted the terms.'
        : 'You declined the terms. The SK Federation has been notified.',
    });
  } catch (err) {
    console.error('Terms answer error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/terms: super admin; every barangay with its answer, plus how many answers are
// new since the notifications were last opened.
router.get('/', authorize('super_admin'), async (req, res) => {
  try {
    const [rows, admins] = await Promise.all([
      Barangay.find()
        .select('name allowsCrossBarangay crossTerms').sort({ name: 1 }).lean(),
      User.find({ role: 'barangay_admin' }).select('barangay').lean(),
    ]);
    const hasAdmin = new Set(admins.map((u) => String(u.barangay)));
    const barangays = rows.map((b) => ({
      _id: b._id,
      name: b.name,
      allowsCrossBarangay: !!b.allowsCrossBarangay,
      hasAdmin: hasAdmin.has(String(b._id)),
      status: b.crossTerms?.status || null,
      byName: b.crossTerms?.byName || null,
      at: b.crossTerms?.at || null,
      seen: !!b.crossTerms?.seen,
    }));
    const unseen = barangays.filter((b) => b.status && !b.seen);
    res.json({
      barangays,
      unseen: unseen.length,
      unseenDeclined: unseen.filter((b) => b.status === 'declined').length,
    });
  } catch (err) {
    console.error('Terms list error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/terms/seen: super admin opened the notifications; clears the bell's count.
router.post('/seen', authorize('super_admin'), async (req, res) => {
  try {
    await Barangay.updateMany({ 'crossTerms.status': { $in: ['accepted', 'declined'] }, 'crossTerms.seen': { $ne: true } }, { $set: { 'crossTerms.seen': true } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Terms seen error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/terms/:id/reset: super admin; "Ask again". Clears the answer, so the pop-up shows
// on that barangay admin's next page load.
router.post('/:id/reset', authorize('super_admin'), async (req, res) => {
  try {
    const b = await Barangay.findByIdAndUpdate(
      req.params.id,
      { $set: { crossTerms: { status: null, by: null, byName: null, at: null, seen: false } } },
      { returnDocument: 'after' }
    );
    if (!b) return res.status(404).json({ message: 'Barangay not found.' });
    res.json({ message: `${b.name} will be asked to answer the terms again.` });
  } catch (err) {
    console.error('Terms reset error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;
