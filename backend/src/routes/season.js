const express = require('express');
const Season = require('../models/Season');
const mongoose = require('mongoose');
const Team = require('../models/Team');
const TeamPlayer = require('../models/TeamPlayer');
const Player = require('../models/Player');
const Document = require('../models/Document');
const ReferenceList = require('../models/ReferenceList');
const { deleteFile } = require('../config/gridfs');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');

const router = express.Router();

// The only legal forward transitions — one step at a time, never backward.
const NEXT_STATE = {
  setup: 'registration_open',
  registration_open: 'verification',
  verification: 'ongoing',
  ongoing: 'completed',
  completed: null, // terminal
};

// GET /api/seasons/current  — public; the dashboard needs to know the state.
router.get('/current', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) {
      return res.status(404).json({ message: 'No season has been created yet.' });
    }
    res.json({ season });
  } catch (err) {
    console.error('Get current season error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/seasons  — every season, newest first, for the Season page's history.
// (Registered AFTER '/current' above so that literal path wins.) Team counts come
// from one grouped query, not one per season.
router.get('/', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const [seasons, counts] = await Promise.all([
      Season.find().sort({ createdAt: -1 }).select('name status openedAt closedAt cleanedAt createdAt').lean(),
      Team.aggregate([
        { $group: { _id: '$season', teams: { $sum: 1 }, verified: { $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] } } } },
      ]),
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c]));
    res.json({
      seasons: seasons.map((s) => ({
        ...s,
        teams: (byId.get(String(s._id)) || {}).teams || 0,
        verifiedTeams: (byId.get(String(s._id)) || {}).verified || 0,
      })),
    });
  } catch (err) {
    console.error('List seasons error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/seasons  — super admin creates a new season (starts in 'setup').
router.post('/', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Season name is required.' });
    }

    // Block a new season while an existing one hasn't finished.
    const latest = await getCurrentSeason();
    if (latest && latest.status !== 'completed') {
      return res.status(409).json({
        message: `A season ("${latest.name}") is still active (${latest.status}). Complete it before starting a new one.`,
      });
    }

    const season = await Season.create({
      name: name.trim(),
      status: 'setup',
      openedBy: req.user.id,
      openedAt: new Date(),
    });

    res.status(201).json({ season });
  } catch (err) {
    console.error('Create season error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/seasons/:id/advance  — super admin moves the season one step forward.
router.post('/:id/advance', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await Season.findById(req.params.id);
    if (!season) {
      return res.status(404).json({ message: 'Season not found.' });
    }

    const next = NEXT_STATE[season.status];
    if (!next) {
      return res.status(400).json({ message: 'This season is already completed and cannot advance.' });
    }

    // Optional safety: the client can send the state it THINKS comes next.
    // If it doesn't match, refuse — stops a stale admin screen from
    // accidentally skipping a state (e.g. jumping past verification).
    const { expectedNext } = req.body;
    if (expectedNext && expectedNext !== next) {
      return res.status(409).json({
        message: `Season is "${season.status}"; the next state is "${next}", not "${expectedNext}". Refresh and try again.`,
      });
    }

    season.status = next;
    if (next === 'completed') {
      season.closedAt = new Date();
    }
    await season.save();

    res.json({ season });
  } catch (err) {
    console.error('Advance season error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// ---- Clean up a past season (free storage) -------------------------------
// The free Atlas tier is 512 MB and almost all of it is uploaded FILES:
// residency documents and player photos. A finished season no longer needs
// them, so the Super Admin can remove them here. What's removed:
//   - every residency document (GridFS file + Document record) of the season's players
//   - the season's reference list rows
//   - player photos, only if asked (they show on that season's public rosters)
// Kept: seasons, teams, rosters, player names, tournaments, matches, stats,
// champions. Only a COMPLETED season that is no longer the current one
// qualifies — the current season's pages still read all of it.

async function cleanupEligibility(season) {
  if (season.status !== 'completed') return 'Only a completed season can be cleaned up.';
  const current = await getCurrentSeason();
  if (current && String(current._id) === String(season._id)) {
    return 'This is still the current season. Create the next season first.';
  }
  return null;
}

// Total bytes of the given GridFS file ids in one bucket.
async function bucketBytes(bucketName, ids) {
  if (!ids.length) return 0;
  const [row] = await mongoose.connection.db.collection(`${bucketName}.files`)
    .aggregate([{ $match: { _id: { $in: ids } } }, { $group: { _id: null, bytes: { $sum: '$length' } } }])
    .toArray();
  return row ? row.bytes : 0;
}

// Everything a clean-up would touch, in a handful of batched queries.
async function cleanupTargets(season) {
  const teamIds = (await Team.find({ season: season._id }).select('_id').lean()).map((t) => t._id);
  const playerIds = [...new Set(
    (await TeamPlayer.find({ team: { $in: teamIds } }).select('player').lean()).map((l) => String(l.player)),
  )];
  const [docs, photoPlayers, referenceRows] = await Promise.all([
    Document.find({ player: { $in: playerIds } }).select('file').lean(),
    Player.find({ _id: { $in: playerIds }, photo: { $ne: null } }).select('photo').lean(),
    ReferenceList.countDocuments({ season: season._id }),
  ]);
  return {
    docFiles: docs.map((d) => d.file),
    docIds: docs.map((d) => d._id),
    photoFiles: photoPlayers.map((p) => p.photo),
    photoPlayerIds: photoPlayers.map((p) => p._id),
    referenceRows,
  };
}

// Delete GridFS files a few at a time (hundreds per season, not all at once).
async function deleteFiles(bucketName, ids) {
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(ids.slice(i, i + 10).map((id) => deleteFile(bucketName, id)));
  }
}

// GET /api/seasons/:id/cleanup — what a clean-up would remove, and its size.
router.get('/:id/cleanup', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await Season.findById(req.params.id);
    if (!season) return res.status(404).json({ message: 'Season not found.' });
    const t = await cleanupTargets(season);
    const [docBytes, photoBytes] = await Promise.all([
      bucketBytes('documents', t.docFiles),
      bucketBytes('photos', t.photoFiles),
    ]);
    res.json({
      blockedReason: await cleanupEligibility(season),
      cleanedAt: season.cleanedAt,
      documents: { count: t.docFiles.length, bytes: docBytes },
      photos: { count: t.photoFiles.length, bytes: photoBytes },
      referenceList: { count: t.referenceRows },
    });
  } catch (err) {
    console.error('Cleanup preview error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/seasons/:id/cleanup — body { photos: boolean }. Irreversible.
router.post('/:id/cleanup', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await Season.findById(req.params.id);
    if (!season) return res.status(404).json({ message: 'Season not found.' });
    const blocked = await cleanupEligibility(season);
    if (blocked) return res.status(409).json({ message: blocked });

    const withPhotos = req.body.photos === true;
    const t = await cleanupTargets(season);
    const [docBytes, photoBytes] = await Promise.all([
      bucketBytes('documents', t.docFiles),
      withPhotos ? bucketBytes('photos', t.photoFiles) : 0,
    ]);

    await deleteFiles('documents', t.docFiles);
    await Document.deleteMany({ _id: { $in: t.docIds } });
    const refResult = await ReferenceList.deleteMany({ season: season._id });
    if (withPhotos) {
      await deleteFiles('photos', t.photoFiles);
      await Player.updateMany({ _id: { $in: t.photoPlayerIds } }, { $set: { photo: null } });
    }

    season.cleanedAt = new Date();
    await season.save();

    res.json({
      message: 'Season cleaned up.',
      documents: t.docFiles.length,
      photos: withPhotos ? t.photoFiles.length : 0,
      referenceList: refResult.deletedCount,
      bytesFreed: docBytes + photoBytes,
      cleanedAt: season.cleanedAt,
    });
  } catch (err) {
    console.error('Cleanup error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;