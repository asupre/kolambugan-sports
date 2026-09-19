const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const ReferenceList = require('../models/ReferenceList');
const Team = require('../models/Team');
const TeamPlayer = require('../models/TeamPlayer');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');
const { decideFromCandidates, norm } = require('../services/prescreen');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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
// GET /api/reference-list — the current season's reference records (Super Admin),
// each tagged with the CURRENT player it matches (if any), so the page can prove
// the list is accurate instead of just listing names.
//
// This re-runs the exact same decideFromCandidates() decision prescreen.js uses,
// LIVE, against every player currently on a team this season — it does NOT read
// a stored field off Player. That's deliberate: it works retroactively for every
// player regardless of when they were screened, with nothing to backfill if this
// matching logic (or this feature) changes later.
router.get('/', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ records: [] });
    const records = await ReferenceList.find({ season: season._id })
      .sort({ lastName: 1, firstName: 1 })
      .lean();

    const refIndex = new Map();
    for (const r of records) {
      const key = `${norm(r.lastName)}|${norm(r.firstName)}`;
      if (!refIndex.has(key)) refIndex.set(key, []);
      refIndex.get(key).push(r);
    }

    const teams = await Team.find({ season: season._id }).populate('barangay', 'name allowsCrossBarangay').lean();
    const teamById = new Map(teams.map((t) => [String(t._id), t]));
    const links = await TeamPlayer.find({ team: { $in: teams.map((t) => t._id) } }).populate('player').lean();

    // referenceList _id (string) -> [{ status, playerName, teamName }, ...].
    // An ARRAY, not a single value — matching is by name only, so two
    // different players who happen to share a name (or one name registered
    // on two different teams) can both land on the same reference row. That
    // is itself worth surfacing, not silently overwriting: it's exactly the
    // kind of thing this list is supposed to catch (e.g. someone's real
    // home barangay correctly clears them on one team but flags them as a
    // mismatch on another).
    const matchByRefId = new Map();
    for (const link of links) {
      const p = link.player;
      if (!p) continue;
      const team = teamById.get(String(link.team));
      const candidates = refIndex.get(`${norm(p.lastName)}|${norm(p.firstName)}`) || [];
      const { status, matchedReferenceId } = decideFromCandidates(p, team && team.barangay, candidates);
      if (matchedReferenceId) {
        const key = String(matchedReferenceId);
        if (!matchByRefId.has(key)) matchByRefId.set(key, []);
        matchByRefId.get(key).push({
          status,
          playerName: `${p.lastName}, ${p.firstName}`,
          teamName: team && team.teamName,
        });
      }
    }

    const withMatch = records.map((r) => ({ ...r, matches: matchByRefId.get(String(r._id)) || [] }));
    res.json({ records: withMatch });
  } catch (err) {
    console.error('Reference list fetch error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});


module.exports = router;