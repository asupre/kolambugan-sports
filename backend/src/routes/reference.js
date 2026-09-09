const express = require('express');
const Sport = require('../models/Sport');
const Barangay = require('../models/Barangay');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();
const Team = require('../models/Team');
const { getCurrentSeason } = require('../middleware/season');
const multer = require('multer');
const { putFile, sendFile, deleteFile } = require('../config/gridfs');

router.get('/sports', async (req, res) => {
  const sports = await Sport.find().sort({ name: 1 });
  res.json({ sports });
});

// PATCH /api/sports/divisions — super admin; set which sports run boys/girls brackets.
// body: { divisions: { "<sportId>": true/false, ... } }
router.patch('/sports/divisions', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { divisions } = req.body;
    if (!divisions || typeof divisions !== 'object') {
      return res.status(400).json({ message: 'divisions map is required.' });
    }
    const updates = Object.entries(divisions).map(([sportId, isDivided]) =>
      Sport.updateOne({ _id: sportId }, { $set: { isDivided: !!isDivided } })
    );
    await Promise.all(updates);
    const sports = await Sport.find().sort({ name: 1 });
    res.json({ message: 'Division settings saved.', sports });
  } catch (err) {
    console.error('Save divisions error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

router.get('/barangays', async (req, res) => {
  const rows = await Barangay.find().select('name allowsCrossBarangay logo').sort({ name: 1 });
  res.json({
    barangays: rows.map((b) => ({
      _id: b._id,
      name: b.name,
      allowsCrossBarangay: b.allowsCrossBarangay,
      hasLogo: !!b.logo,
    })),
  });
});

const ALLOWED_DIVISIONS = ['open', 'boys', 'girls', 'under17', 'under30'];
const ALLOWED_FORMATS = ['team', 'singles', 'doubles'];

// PATCH /api/sports/:id/config — super admin; replaces seedSportConfig.js.
// body: { divisions: ['under17','under30'], entryFormat: 'team' }
router.patch('/sports/:id/config', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const sport = await Sport.findById(req.params.id);
    if (!sport) return res.status(404).json({ message: 'Sport not found.' });

    const divisions = Array.isArray(req.body.divisions) ? [...new Set(req.body.divisions)] : null;
    const entryFormat = req.body.entryFormat;

    if (!divisions || divisions.length === 0) {
      return res.status(400).json({ message: 'Pick at least one division.' });
    }
    const badDivision = divisions.find((d) => !ALLOWED_DIVISIONS.includes(d));
    if (badDivision) return res.status(400).json({ message: `Unknown division "${badDivision}".` });
    if (!ALLOWED_FORMATS.includes(entryFormat)) {
      return res.status(400).json({ message: 'Entry format must be team, singles, or doubles.' });
    }

    // Registered teams were built against the CURRENT config — roster limits come
    // from entryFormat, and each team is pinned to a division. Switching badminton
    // from doubles to singles now would leave 2-player teams in a 1-player sport.
    const season = await getCurrentSeason();
    if (season) {
      const teamCount = await Team.countDocuments({ sport: sport._id, season: season._id });
      const sameDivisions =
        JSON.stringify([...divisions].sort()) === JSON.stringify([...(sport.divisions || [])].sort());
      if (teamCount > 0 && (!sameDivisions || entryFormat !== sport.entryFormat)) {
        return res.status(409).json({
          message: `${teamCount} team(s) are already registered for ${sport.name} this season. Set this up before registration opens, or remove those teams first.`,
        });
      }
    }

    sport.divisions = divisions;
    sport.entryFormat = entryFormat;
    await sport.save();

    res.json({ message: `${sport.name} updated.`, sport });
  } catch (err) {
    console.error('Sport config error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

const BUCKET = 'logos';

// Its own limit and bucket — a crest is small, and keeping it separate from
// player photos means a bug in one path can't reach the other.
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(new Error('Logo must be a JPEG, PNG, or WebP image.'));
    }
    cb(null, true);
  },
});

// GET /api/barangays/:id/logo — PUBLIC; the crest shown on team pages.
router.get('/barangays/:id/logo', async (req, res) => {
  try {
    const b = await Barangay.findById(req.params.id).select('logo');
    if (!b || !b.logo) return res.status(404).json({ message: 'No logo.' });
    await sendFile(BUCKET, b.logo, res, 300);
  } catch (err) {
    console.error('Barangay logo error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/barangays/:id/logo — barangay admin, own barangay only.
// Super admin may set any, so a bad upload can be corrected without chasing
// down whoever made it.
router.post('/barangays/:id/logo', authenticate,
  authorize('barangay_admin', 'super_admin'), uploadLogo.single('logo'), async (req, res) => {
  try {
    if (req.user.role === 'barangay_admin' && String(req.user.barangay) !== String(req.params.id)) {
      return res.status(403).json({ message: "You can only change your own barangay's logo." });
    }
    if (!req.file) return res.status(400).json({ message: 'No image uploaded.' });

    const b = await Barangay.findById(req.params.id);
    if (!b) return res.status(404).json({ message: 'Barangay not found.' });

    const old = b.logo;
    b.logo = await putFile(BUCKET, req.file.buffer, `logo-${b._id}`, req.file.mimetype, {
      barangay: String(b._id),
    });
    await b.save();
    if (old) await deleteFile(BUCKET, old);

    res.status(201).json({ message: 'Logo updated.', barangay: b.name });
  } catch (err) {
    console.error('Logo upload error:', err);
    res.status(400).json({ message: err.message || 'Could not upload the logo.' });
  }
});

// DELETE /api/barangays/:id/logo — clears it back to the monogram.
router.delete('/barangays/:id/logo', authenticate,
  authorize('barangay_admin', 'super_admin'), async (req, res) => {
  try {
    if (req.user.role === 'barangay_admin' && String(req.user.barangay) !== String(req.params.id)) {
      return res.status(403).json({ message: "You can only change your own barangay's logo." });
    }
    const b = await Barangay.findById(req.params.id);
    if (!b || !b.logo) return res.status(404).json({ message: 'No logo to remove.' });

    await deleteFile(BUCKET, b.logo);
    b.logo = null;
    await b.save();
    res.json({ message: 'Logo removed.' });
  } catch (err) {
    console.error('Logo delete error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// PATCH /api/barangays/:id/cross — super admin; allow this barangay's residents
// to play for another barangay's team.
//
// The rule already existed in the residency screen but could only be set by
// editing the database, which meant the league couldn't run without a developer.
router.patch('/barangays/:id/cross', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const allowed = req.body.allowsCrossBarangay;
    if (typeof allowed !== 'boolean') {
      return res.status(400).json({ message: 'allowsCrossBarangay must be true or false.' });
    }
    const b = await Barangay.findByIdAndUpdate(
      req.params.id, { allowsCrossBarangay: allowed }, { new: true }
    );
    if (!b) return res.status(404).json({ message: 'Barangay not found.' });

    res.json({ message: `${b.name} updated.`, barangay: { _id: b._id, name: b.name, allowsCrossBarangay: b.allowsCrossBarangay } });
  } catch (err) {
    console.error('Cross-barangay error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;