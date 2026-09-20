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
const { rescreenSeason } = require('../services/prescreen');
const { rulesFor, sheetOptionsFor, STAT_CATALOG } = require('../lib/sportRules');

// League Setup needs to know a sport's BUILT-IN scoring mode: which fields matter (point
// buttons, periods, stats…) depends on it, and a blank "Scoring" means "use the default".
const withDefaults = (s) => ({
  ...s.toObject(),
  defaultScoringMode: rulesFor(s).scoringMode,
  rules: rulesFor(s),
  // The score-sheet picker: what this sport's type can offer, and whether the sheet is the built-in one.
  sheetOptions: sheetOptionsFor(s),
  sheetIsDefault: !Array.isArray(s.scoreSheet),
});

router.get('/sports', async (req, res) => {
  const sports = await Sport.find().sort({ name: 1 });
  res.json({ sports: sports.map(withDefaults) });
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

    res.json({ message: `${sport.name} updated.`, sport: withDefaults(sport) });
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
// PATCH /api/barangays/:id/cross — super admin; allow this barangay's TEAMS to
// field players from any barangay (checked) or only their own (unchecked).
//
// The rule already existed in the residency screen but could only be set by
// editing the database, which meant the league couldn't run without a developer.
router.patch('/barangays/:id/cross', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const allowed = req.body.allowsCrossBarangay;
    if (typeof allowed !== 'boolean') {
      return res.status(400).json({ message: 'allowsCrossBarangay must be true or false.' });
    }
    const before = await Barangay.findById(req.params.id);
    if (!before) return res.status(404).json({ message: 'Barangay not found.' });
    const changed = before.allowsCrossBarangay !== allowed;

    const b = await Barangay.findByIdAndUpdate(
      req.params.id, { allowsCrossBarangay: allowed }, { new: true }
    );

    // This flag can flip a player's eligibility in either direction without
    // touching the player at all, so the Review Queue would otherwise stay
    // stale until someone happens to re-save that specific player.
    let note = '';
    if (changed) {
      const season = await getCurrentSeason();
      if (season) {
        const result = await rescreenSeason(season._id);
        if (result.changed > 0) {
          note = ` ${result.changed} player(s) re-screened.` + (result.reopened > 0
            ? ` ${result.reopened} verified team(s) reopened for review.` : '');
        }
      }
    }

    res.json({
      message: `${b.name} updated.${note}`,
      barangay: { _id: b._id, name: b.name, allowsCrossBarangay: b.allowsCrossBarangay },
    });
  } catch (err) {
    console.error('Cross-barangay error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// ── Sports ───────────────────────────────────────────────────────────────
// Sports were seeded by a script with no UI, so the league couldn't add one
// without a developer. Deletion is guarded: a sport with history stays, or its
// matches, teams and champions would be orphaned.

// A sport's editable scoring rules: what one tap can add, what a period is called and how many
// periods may be chosen. Validated here because the organizer routes trust them: the start route
// only accepts 1, 2, 3, 4, 5 or 7 periods, and a bad point value would let a score be recorded that
// the buttons can never produce. An empty list / blank name means "use the built-in default".
const ALLOWED_PERIODS = [1, 2, 3, 4, 5, 7];
function scoringFromBody(body) {
  const out = {};
  if (body.pointValues !== undefined) {
    if (!Array.isArray(body.pointValues)) return { error: 'Point values must be a list.' };
    const v = body.pointValues.map(Number);
    if (v.some((n) => !Number.isInteger(n) || n < 1 || n > 20)) {
      return { error: 'Point values must be whole numbers from 1 to 20.' };
    }
    out.pointValues = [...new Set(v)].sort((a, b) => a - b);
  }
  if (body.periodOptions !== undefined) {
    if (!Array.isArray(body.periodOptions)) return { error: 'Period counts must be a list.' };
    const v = body.periodOptions.map(Number);
    if (v.some((n) => !ALLOWED_PERIODS.includes(n))) {
      return { error: 'Period counts can only be 1, 2, 3, 4, 5 or 7.' };
    }
    out.periodOptions = [...new Set(v)].sort((a, b) => a - b);
  }
  if (body.periodLabel !== undefined) {
    out.periodLabel = String(body.periodLabel || '').trim().slice(0, 20) || null;
  }
  return { values: out };
}

// The Super Admin's own score sheet columns. The client sends the labels; the server derives a safe key
// ("x_" + slug) so it can't collide with a built-in column or contain characters Mongo rejects.
function customStatsFromBody(list) {
  if (!Array.isArray(list)) return { error: 'Custom columns must be a list.' };
  if (list.length > 12) return { error: 'A sport can have at most 12 custom columns.' };
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const label = String(typeof item === 'string' ? item : item?.label || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!label) continue;
    const key = 'x_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
    if (key === 'x_') return { error: `"${label}" needs at least one letter or number.` };
    if (seen.has(key)) return { error: `"${label}" is already a column.` };
    seen.add(key);
    out.push({ key, label });
  }
  return { values: out };
}

router.post('/sports', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Sport name is required.' });
    if (await Sport.findOne({ name })) {
      return res.status(409).json({ message: `"${name}" already exists.` });
    }
    const category = ['esports', 'board'].includes(req.body.category) ? req.body.category : 'physical';
    const tournamentFormat = req.body.tournamentFormat === 'round_robin'
      ? 'round_robin' : 'double_elimination';

    const scoring = scoringFromBody(req.body);
    if (scoring.error) return res.status(400).json({ message: scoring.error });

    const sport = await Sport.create({ name, category, tournamentFormat, ...scoring.values });
    res.status(201).json({
      message: `${name} added. Provision accounts to create its organizer login.`,
      sport: withDefaults(sport),
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
    if (req.body.category) {
      if (!['physical', 'esports', 'board'].includes(req.body.category)) {
        return res.status(400).json({ message: 'Type must be sports, esports or a board game.' });
      }
      sport.category = req.body.category;
    }
    // Custom columns: the client sends the full list of labels. A newly added column is ticked on
    // the sheet automatically (that's why you added it); a removed one is unticked.
    if (req.body.customStats !== undefined) {
      const cs = customStatsFromBody(req.body.customStats);
      if (cs.error) return res.status(400).json({ message: cs.error });
      const before = rulesFor(sport).sheet;
      const oldKeys = (sport.customStats || []).map((c) => c.key);
      const newKeys = cs.values.map((c) => c.key);
      const added = newKeys.filter((k) => !oldKeys.includes(k));
      const removed = oldKeys.filter((k) => !newKeys.includes(k));
      sport.customStats = cs.values;
      if (added.length || removed.length) {
        const base = Array.isArray(sport.scoreSheet) ? [...sport.scoreSheet] : [...before];
        sport.scoreSheet = [...base.filter((k) => !removed.includes(k)), ...added];
      }
    }
    // The after-match score sheet. null = back to the built-in default; an array = the pick
    // (empty = no player form). Unknown columns are refused rather than silently dropped.
    if (req.body.scoreSheet !== undefined) {
      if (req.body.scoreSheet === null) {
        sport.scoreSheet = undefined;
      } else if (Array.isArray(req.body.scoreSheet)) {
        const custom = (sport.customStats || []).map((c) => c.key);
        const bad = req.body.scoreSheet.filter((k) => !STAT_CATALOG[k] && !custom.includes(k));
        if (bad.length) return res.status(400).json({ message: `Unknown score sheet column: ${bad.join(', ')}.` });
        sport.scoreSheet = [...new Set(req.body.scoreSheet)];
      } else {
        return res.status(400).json({ message: 'scoreSheet must be a list.' });
      }
    }
    if (req.body.tournamentFormat) sport.tournamentFormat = req.body.tournamentFormat;

    const scoring = scoringFromBody(req.body);
    if (scoring.error) return res.status(400).json({ message: scoring.error });
    Object.assign(sport, scoring.values);

    // Per-sport rules. An empty value means "fall back to the default".
    ['scoringMode'].forEach((k) => {
      if (req.body[k] !== undefined) sport[k] = req.body[k] || null;
    });
    ['onCourt', 'teamsPerBarangay', 'numGroups', 'knockoutSize'].forEach((k) => {
      if (req.body[k] !== undefined) {
        sport[k] = req.body[k] === null || req.body[k] === '' ? null : Number(req.body[k]);
      }
    });
    ['statTypes'].forEach((k) => {
      if (Array.isArray(req.body[k])) sport[k] = req.body[k];
    });

    await sport.save();
    res.json({ message: `${sport.name} updated.`, sport: withDefaults(sport) });
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
    let crossChanged = false;
    if (req.body.allowsCrossBarangay !== undefined) {
      const next = !!req.body.allowsCrossBarangay;
      crossChanged = b.allowsCrossBarangay !== next;
      b.allowsCrossBarangay = next;
    }

    await b.save();

    // Same as PATCH /:id/cross — flipping this can change player eligibility
    // in either direction without touching any player, so re-screen now.
    let note = '';
    if (crossChanged) {
      const season = await getCurrentSeason();
      if (season) {
        const result = await rescreenSeason(season._id);
        if (result.changed > 0) {
          note = ` ${result.changed} player(s) re-screened.` + (result.reopened > 0
            ? ` ${result.reopened} verified team(s) reopened for review.` : '');
        }
      }
    }

    res.json({
      message: `${b.name} updated.${note}`,
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