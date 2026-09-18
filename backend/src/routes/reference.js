const express = require('express');
const Sport = require('../models/Sport');
const Barangay = require('../models/Barangay');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();
const Team = require('../models/Team');
const { getCurrentSeason } = require('../middleware/season');
const multer = require('multer');
const { putFile, sendFile, deleteFile } = require('../config/gridfs');
const Tournament = require('../models/Tournament');
const User = require('../models/User');

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

const ALLOWED_DIVISIONS = ['open', 'boys', 'girls', 'under15', 'under30'];
const ALLOWED_FORMATS = ['team', 'singles', 'doubles'];

// PATCH /api/sports/:id/config — super admin; replaces seedSportConfig.js.
// body: { divisions: ['under15','under30'], entryFormat: 'team' }
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

// ── Sports ───────────────────────────────────────────────────────────────
// Sports were seeded by a script with no UI, so the league couldn't add one
// without a developer. Deletion is guarded: a sport with history stays, or its
// matches, teams and champions would be orphaned.

router.post('/sports', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Sport name is required.' });
    if (await Sport.findOne({ name })) {
      return res.status(409).json({ message: `"${name}" already exists.` });
    }
    const category = req.body.category === 'esports' ? 'esports' : 'physical';
    const tournamentFormat = req.body.tournamentFormat === 'round_robin'
      ? 'round_robin' : 'double_elimination';

    const sport = await Sport.create({ name, category, tournamentFormat });
    res.status(201).json({
      message: `${name} added. Provision accounts to create its organizer login.`,
      sport,
    });
  } catch (err) {
    console.error('Add sport error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

router.patch('/sports/:id', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const sport = await Sport.findById(req.params.id);
    if (!sport) return res.status(404).json({ message: 'Sport not found.' });

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: 'Sport name cannot be empty.' });
      const clash = await Sport.findOne({ name, _id: { $ne: sport._id } });
      if (clash) return res.status(409).json({ message: `"${name}" already exists.` });
      sport.name = name;
    }
    if (req.body.category) sport.category = req.body.category;
    if (req.body.tournamentFormat) sport.tournamentFormat = req.body.tournamentFormat;

    // Per-sport rules. An empty value means "fall back to the default".
    ['scoringMode', 'periodLabel'].forEach((k) => {
      if (req.body[k] !== undefined) sport[k] = req.body[k] || null;
    });
    ['onCourt', 'teamsPerBarangay', 'numGroups', 'knockoutSize'].forEach((k) => {
      if (req.body[k] !== undefined) {
        sport[k] = req.body[k] === null || req.body[k] === '' ? null : Number(req.body[k]);
      }
    });
    ['pointValues', 'periodOptions', 'statTypes'].forEach((k) => {
      if (Array.isArray(req.body[k])) sport[k] = req.body[k];
    });

    await sport.save();
    res.json({ message: `${sport.name} updated.`, sport });
  } catch (err) {
    console.error('Update sport error:', err);
    res.status(400).json({ message: err.message || 'Could not update the sport.' });
  }
});

router.delete('/sports/:id', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const sport = await Sport.findById(req.params.id);
    if (!sport) return res.status(404).json({ message: 'Sport not found.' });

    const teams = await Team.countDocuments({ sport: sport._id });
    const tournaments = await Tournament.countDocuments({ sport: sport._id });
    const organizers = await User.countDocuments({ assignedSport: sport._id });
    if (teams || tournaments || organizers) {
      const parts = [
        teams ? `${teams} team(s)` : null,
        tournaments ? `${tournaments} tournament(s)` : null,
        organizers ? `${organizers} organizer account(s)` : null,
      ].filter(Boolean).join(', ');
      return res.status(409).json({
        message: `${sport.name} still has ${parts}. Remove those first — deleting it now would orphan their records.`,
      });
    }

    await Sport.deleteOne({ _id: sport._id });
    res.json({ message: `${sport.name} removed.` });
  } catch (err) {
    console.error('Delete sport error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// ── Barangays ────────────────────────────────────────────────────────────

router.post('/barangays', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Barangay name is required.' });
    if (await Barangay.findOne({ name })) {
      return res.status(409).json({ message: `"${name}" already exists.` });
    }
    const b = await Barangay.create({
      name,
      allowsCrossBarangay: !!req.body.allowsCrossBarangay,
    });
    res.status(201).json({
      message: `${name} added. Provision accounts to create its barangay admin login.`,
      barangay: { _id: b._id, name: b.name, allowsCrossBarangay: b.allowsCrossBarangay, hasLogo: false },
    });
  } catch (err) {
    console.error('Add barangay error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

router.patch('/barangays/:id', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const b = await Barangay.findById(req.params.id);
    if (!b) return res.status(404).json({ message: 'Barangay not found.' });

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: 'Barangay name cannot be empty.' });
      const clash = await Barangay.findOne({ name, _id: { $ne: b._id } });
      if (clash) return res.status(409).json({ message: `"${name}" already exists.` });
      b.name = name;
    }
    if (req.body.allowsCrossBarangay !== undefined) {
      b.allowsCrossBarangay = !!req.body.allowsCrossBarangay;
    }

    await b.save();
    res.json({
      message: `${b.name} updated.`,
      barangay: { _id: b._id, name: b.name, allowsCrossBarangay: b.allowsCrossBarangay, hasLogo: !!b.logo },
    });
  } catch (err) {
    console.error('Update barangay error:', err);
    res.status(400).json({ message: err.message || 'Could not update the barangay.' });
  }
});

router.delete('/barangays/:id', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const b = await Barangay.findById(req.params.id);
    if (!b) return res.status(404).json({ message: 'Barangay not found.' });

    const teams = await Team.countDocuments({ barangay: b._id });
    const admins = await User.countDocuments({ barangay: b._id });
    if (teams || admins) {
      const parts = [
        teams ? `${teams} team(s)` : null,
        admins ? `${admins} admin account(s)` : null,
      ].filter(Boolean).join(' and ');
      return res.status(409).json({ message: `${b.name} still has ${parts}. Remove those first.` });
    }

    if (b.logo) await deleteFile('logos', b.logo);
    await Barangay.deleteOne({ _id: b._id });
    res.json({ message: `${b.name} removed.` });
  } catch (err) {
    console.error('Delete barangay error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;