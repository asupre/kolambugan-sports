const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const ReferenceList = require('../models/ReferenceList');
const Team = require('../models/Team');
const TeamPlayer = require('../models/TeamPlayer');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');
const { decideFromCandidates, norm, ageFrom, sameDay, sameMiddleInitial, MINOR_AGE, rescreenSeason } = require('../services/prescreen');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Tolerant header mapping so the Federation's column names don't have to be exact.
function canonicalKey(h) {
  const k = (h || '').toLowerCase().replace(/[^a-z]/g, '');
  if (['firstname', 'first', 'givenname', 'fname'].includes(k)) return 'firstName';
  if (['middlename', 'middle', 'mname', 'mi', 'middleinitial'].includes(k)) return 'middleName';
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

    // Matching now REQUIRES middle name + birthdate to agree (Sep 2026 —
    // name alone was no longer accurate enough, see prescreen.js) — a row
    // missing either can never confirm a match, so surface how many are
    // short of that rather than let it look like a silent, unexplained
    // wave of needs_document results later.
    const missingForMatch = docs.filter((d) => !d.middleName || !d.birthdate).length;

    // Replacing the list is exactly as consequential as flipping a
    // barangay's allowsCrossBarangay flag — it can move ANY player's
    // eligibility in either direction without the player themselves
    // changing at all, so re-screen the whole season now instead of
    // leaving every already-screened Player stale until something else
    // happens to touch them (a correction, a cross-barangay toggle...).
    // Reported directly: a Mukas Badminton player still showed
    // needs_document on the roster even though the just-replaced list
    // now matched them — because nothing had re-run their decision since
    // the old (no-middle-name) list was still in effect when they were
    // last screened. Same helper, same shape, as reference.js's toggle.
    const rescreen = await rescreenSeason(season._id);

    res.status(201).json({
      message: 'Reference list uploaded.'
        + (rescreen.changed > 0
          ? ` ${rescreen.changed} player(s) re-screened against the new list.`
            + (rescreen.reopened > 0 ? ` ${rescreen.reopened} verified team(s) reopened for review.` : '')
          : ''),
      inserted: docs.length,
      skippedRows: skipped,
      hasBirthdates: docs.some((d) => d.birthdate),
      hasMiddleNames: docs.some((d) => d.middleName),
      hasBarangays: docs.some((d) => d.barangay),
      missingForMatch,
      rescreen,
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

    const teams = await Team.find({ season: season._id })
      .populate('barangay', 'name allowsCrossBarangay')
      .populate('sport', 'name')
      .lean();
    const teamById = new Map(teams.map((t) => [String(t._id), t]));
    // Which game (sport + division) and which barangay a player is rostered
    // for — so the Super Admin can see what a resident plays, and for whom
    // (a barangay may field another barangay's residents). Attached to every
    // match entry below. One entry per team, so a resident on three teams
    // for one barangay yields three entries with the same barangay.
    const gameOf = (t) => ({
      sport: t && t.sport ? t.sport.name : null,
      division: t ? t.division || null : null,
      barangay: t && t.barangay ? t.barangay.name : null,
    });
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
    // Separate, INFORMATIONAL-only map for under-15 players who are STILL
    // awaiting a decision. decideFromCandidates deliberately never matches a
    // minor to a reference row — the list is the SK voters' list (15-30), so
    // nobody under 15 can legitimately be on it, and a minor's official status
    // is always needs_document regardless of a same-name row. But while the
    // Super Admin is reviewing one of those documents by hand, a same-name
    // (and ideally same-barangay) row is still a useful signal of whether the
    // family shows up in the municipality's own records at all — so surface
    // it, clearly labeled as informational, never as a real match.
    const minorMatchByRefId = new Map();
    // Adults who share a NAME with a row but were still flagged "not on the
    // list" because the middle initial and/or birthdate disagree. Without this
    // the page showed the same-name row with no hint why it hadn't matched, so
    // it looked like a bug. Super Admin only — this exposes the list's own
    // birthdate/middle name next to the roster's, so it must never leak into
    // the flagReason a Barangay Admin sees.
    const nearMissByRefId = new Map();
    for (const link of links) {
      const p = link.player;
      if (!p) continue;
      const team = teamById.get(String(link.team));
      const candidates = refIndex.get(`${norm(p.lastName)}|${norm(p.firstName)}`) || [];
      const age = ageFrom(p.birthdate);
      const isMinor = age !== null && age < MINOR_AGE;

      if (isMinor) {
        if (candidates.length === 0) continue;
        const teamBrgyName = norm(team && team.barangay && team.barangay.name);
        if (p.eligibilityStatus === 'eligible') {
          // The Super Admin approved them (via the submitted document) despite
          // the automated screen never matching a minor — promote the same-name
          // row from an informational hint to a REAL, resolved match once that
          // happens, so the highlight actually changes on approval instead of
          // staying purple forever.
          const cand = candidates.find((c) => teamBrgyName && norm(c.barangay) === teamBrgyName) || candidates[0];
          const key = String(cand._id);
          if (!matchByRefId.has(key)) matchByRefId.set(key, []);
          matchByRefId.get(key).push({
            status: 'approved_minor',
            playerName: `${p.lastName}, ${p.firstName}`,
            teamName: team && team.teamName,
            ...gameOf(team),
          });
        } else {
          for (const cand of candidates) {
            const key = String(cand._id);
            if (!minorMatchByRefId.has(key)) minorMatchByRefId.set(key, []);
            minorMatchByRefId.get(key).push({
              playerName: `${p.lastName}, ${p.firstName}`,
              teamName: team && team.teamName,
              ...gameOf(team),
              sameBarangay: !!(teamBrgyName && norm(cand.barangay) === teamBrgyName),
            });
          }
        }
        continue;
      }

      const { status, code, matchedReferenceId } = decideFromCandidates(p, team && team.barangay, candidates);
      if (code === 'not_on_list' && candidates.length > 0) {
        for (const cand of candidates) {
          const key = String(cand._id);
          if (!nearMissByRefId.has(key)) nearMissByRefId.set(key, []);
          nearMissByRefId.get(key).push({
            playerName: `${p.lastName}, ${p.firstName}`,
            teamName: team && team.teamName,
            ...gameOf(team),
            differs: {
              middle: sameMiddleInitial(cand.middleName, p.middleName)
                ? null : { roster: p.middleName || null, list: cand.middleName || null },
              birthdate: sameDay(cand.birthdate, p.birthdate)
                ? null : { roster: p.birthdate || null, list: cand.birthdate || null },
            },
          });
        }
      }
      if (matchedReferenceId) {
        const key = String(matchedReferenceId);
        if (!matchByRefId.has(key)) matchByRefId.set(key, []);
        matchByRefId.get(key).push({
          status,
          playerName: `${p.lastName}, ${p.firstName}`,
          teamName: team && team.teamName,
          ...gameOf(team),
        });
      }
    }

    const withMatch = records.map((r) => ({
      ...r,
      matches: matchByRefId.get(String(r._id)) || [],
      minorMatches: minorMatchByRefId.get(String(r._id)) || [],
      nearMisses: nearMissByRefId.get(String(r._id)) || [],
    }));
    res.json({ records: withMatch });
  } catch (err) {
    console.error('Reference list fetch error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});


module.exports = router;