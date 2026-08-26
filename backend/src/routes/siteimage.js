// src/routes/siteImage.js
// Super admin management of the public site's editable images.
// The PUBLIC serve route lives in routes/public.js, with everything else public.

const express = require('express');
const multer = require('multer');
const SiteImage = require('../models/SiteImage');
const { SLOTS } = require('../models/SiteImage');
const { authenticate, authorize } = require('../middleware/auth');
const { putFile, deleteFile } = require('../config/gridfs');

const router = express.Router();
const BUCKET = 'site';

// Its own limit rather than the 3 MB headshot cap — a banner shot straight off
// a phone is routinely larger than a cropped portrait.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(new Error('Image must be a JPEG, PNG, or WebP.'));
    }
    cb(null, true);
  },
});

const isSlot = (key) => SLOTS.some((s) => s.key === key);

// GET /api/site-images — super admin; every slot with whether it's filled.
router.get('/', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const rows = await SiteImage.find({});
    const by = {};
    rows.forEach((r) => { by[r.key] = r; });

    res.json({
      slots: SLOTS.map((s) => ({
        ...s,
        hasImage: !!by[s.key]?.file,
        focal: by[s.key]?.focal || 'center',
        updatedAt: by[s.key]?.updatedAt || null,
      })),
    });
  } catch (err) {
    console.error('List site images error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/site-images/:key — super admin; upload or replace one slot.
router.post('/:key', authenticate, authorize('super_admin'), upload.single('image'), async (req, res) => {
  try {
    const { key } = req.params;
    if (!isSlot(key)) return res.status(400).json({ message: 'Unknown image slot.' });
    if (!req.file) return res.status(400).json({ message: 'No image uploaded.' });

    let row = await SiteImage.findOne({ key });
    if (!row) row = new SiteImage({ key });

    const old = row.file;
    row.file = await putFile(BUCKET, req.file.buffer, `site-${key}`, req.file.mimetype, { key });
    row.updatedBy = req.user.id;
    await row.save();
    if (old) await deleteFile(BUCKET, old);   // don't orphan the replaced file

    res.status(201).json({ message: 'Image updated.', key, updatedAt: row.updatedAt });
  } catch (err) {
    console.error('Site image upload error:', err);
    res.status(400).json({ message: err.message || 'Could not upload the image.' });
  }
});

// DELETE /api/site-images/:key — super admin; clears a slot back to the placeholder.
router.delete('/:key', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const row = await SiteImage.findOne({ key: req.params.key });
    if (!row || !row.file) return res.status(404).json({ message: 'That slot is already empty.' });

    await deleteFile(BUCKET, row.file);
    row.file = null;
    row.updatedBy = req.user.id;
    await row.save();

    res.json({ message: 'Image removed.', key: row.key });
  } catch (err) {
    console.error('Site image delete error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// PATCH /api/site-images/:key/focal — which part of the image to keep when cropped.
router.patch('/:key/focal', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    if (!isSlot(req.params.key)) return res.status(400).json({ message: 'Unknown image slot.' });
    if (!['top', 'center', 'bottom'].includes(req.body.focal)) {
      return res.status(400).json({ message: 'Focal must be top, center, or bottom.' });
    }
    const row = await SiteImage.findOneAndUpdate(
      { key: req.params.key }, { focal: req.body.focal }, { new: true }
    );
    if (!row) return res.status(404).json({ message: 'That slot has no image yet.' });
    res.json({ message: 'Position updated.', key: row.key, focal: row.focal });
  } catch (err) {
    console.error('Set focal error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;