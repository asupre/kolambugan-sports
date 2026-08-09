const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const ReferenceList = require('../models/ReferenceList');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Tolerant header mapping so the Federation's column names don't have to be exact.
function canonicalKey(h) {
  const k = (h || '').toLowerCase().replace(/[^a-z]/g, '');
  if (['firstname', 'first', 'givenname', 'fname'].includes(k)) return 'firstName';
  if (['lastname', 'last', 'surname', 'familyname', 'lname'].includes(k)) return 'lastName';
  if (['birthdate', 'birthday', 'dob', 'dateofbirth'].includes(k)) return 'birthdate';
  if (['barangay', 'brgy', 'barangayname'].includes(k)) return 'barangay';
  return null;
}

// POST /api/reference-list  — Super Admin uploads a CSV; replaces this season's list.
router.post('/', authenticate, authorize('super_admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a CSV file (form field name: "file").' });
    }
    const season = await getCurrentSeason();
    if (!season) {
      return res.status(409).json({ message: 'No active season to attach the reference list to.' });
    }

    let rows;
    try {
      rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    } catch (e) {
      return res.status(400).json({ message: 'Could not parse the CSV. Check the file format.' });
    }
    if (!rows.length) return res.status(400).json({ message: 'The CSV has no data rows.' });

    const docs = [];
    const skipped = [];
    rows.forEach((row, i) => {
      const rec = { season: season._id, uploadedBy: req.user.id };
      for (const [h, v] of Object.entries(row)) {
        const key = canonicalKey(h);
        if (key) rec[key] = v;
      }
      if (!rec.firstName || !rec.lastName) { skipped.push(i + 2); return; } // +2 = header + 1-based
      if (rec.birthdate) {
        const d = new Date(rec.birthdate);
        rec.birthdate = isNaN(d.getTime()) ? undefined : d;
      }
      docs.push(rec);
    });

    if (!docs.length) {
      return res.status(400).json({ message: 'No valid rows. Each row needs at least a first and last name.' });
    }

    // Snapshot semantics: replace this season's list entirely.
    await ReferenceList.deleteMany({ season: season._id });
    await ReferenceList.insertMany(docs);

    res.status(201).json({
      message: 'Reference list uploaded.',
      inserted: docs.length,
      skippedRows: skipped,
      hasBirthdates: docs.some((d) => d.birthdate),
      hasBarangays: docs.some((d) => d.barangay),
    });
  } catch (err) {
    console.error('Reference list upload error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/reference-list/status  — how many records exist for the current season.
router.get('/status', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ count: 0 });
    const count = await ReferenceList.countDocuments({ season: season._id });
    res.json({ count, season: season.name });
  } catch (err) {
    console.error('Reference list status error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// GET /api/reference-list — the current season's reference records (Super Admin).
router.get('/', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ records: [] });
    const records = await ReferenceList.find({ season: season._id })
      .sort({ lastName: 1, firstName: 1 })
      .lean();
    res.json({ records });
  } catch (err) {
    console.error('Reference list fetch error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;