const express = require('express');
const Season = require('../models/Season');
const mongoose = require('mongoose');
const Team = require('../models/Team');
const TeamPlayer = require('../models/TeamPlayer');
const Player = require('../models/Player');
const Document = require('../models/Document');
const ReferenceList = require('../models/ReferenceList');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const PlayerMatchStats = require('../models/PlayerMatchStats');
const Champion = require('../models/Champion');
const { deleteFile } = require('../config/gridfs');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');
const { notifySeasonStage } = require('../lib/notify');
const Notification = require('../models/Notification');

const router = express.Router();

// The only legal forward transitions, one step at a time. (Going back one step is
// POST /:id/back, below.)
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
    await notifySeasonStage(season);   // tells every Barangay Admin (bell)

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
    await notifySeasonStage(season);

    res.json({ season });
  } catch (err) {
    console.error('Advance season error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// The reverse of NEXT_STATE, for undoing an accidental advance.
const PREV_STATE = {
  registration_open: 'setup',
  verification: 'registration_open',
  ongoing: 'verification',
  completed: 'ongoing',
};

// POST /api/seasons/:id/back  — super admin moves the CURRENT season one step back
// (an accidental "move on"). Refused where going back would leave data that the
// earlier stage never allows: brackets during verification, or a season that was
// already cleaned up / replaced by a newer one.
router.post('/:id/back', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await Season.findById(req.params.id);
    if (!season) {
      return res.status(404).json({ message: 'Season not found.' });
    }

    const current = await getCurrentSeason();
    if (!current || String(current._id) !== String(season._id)) {
      return res.status(409).json({ message: 'Only the current season can go back a stage.' });
    }

    const prev = PREV_STATE[season.status];
    if (!prev) {
      return res.status(400).json({ message: 'This season is at the first stage and cannot go back.' });
    }

    // Same stale-screen guard as advancing.
    const { expectedPrevious } = req.body;
    if (expectedPrevious && expectedPrevious !== prev) {
      return res.status(409).json({
        message: `Season is "${season.status}"; the previous state is "${prev}", not "${expectedPrevious}". Refresh and try again.`,
      });
    }

    if (season.status === 'completed' && season.cleanedAt) {
      return res.status(409).json({ message: 'This season was cleaned up, so it cannot be reopened.' });
    }

    // Brackets are only drawn while ongoing; verification could still change the
    // verified teams they were drawn from.
    if (season.status === 'ongoing') {
      const brackets = await Tournament.countDocuments({ season: season._id });
      if (brackets > 0) {
        return res.status(409).json({
          message: `${brackets} bracket${brackets === 1 ? ' has' : 's have'} already been generated. Delete ${brackets === 1 ? 'it' : 'them'} on the Tournaments page first, then go back.`,
        });
      }
    }

    season.status = prev;
    if (prev === 'ongoing') season.closedAt = undefined;
    await season.save();
    await notifySeasonStage(season, { back: true });

    res.json({ season });
  } catch (err) {
    console.error('Season back error:', err);
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

// ── Delete a past season ─────────────────────────────────────────────────
// DELETE /api/seasons/:id — body { confirm: "<exact season name>" }. Irreversible.
// Only a season that is NOT the current one (the newest), which also means it is completed:
// deleting the current season would silently make the previous one current again.
// Removes EVERYTHING that points at it, so nothing is left orphaned (see GOTCHAS: a season
// deleted straight in the DB left teams, tournaments and a 17k-row reference list behind):
// its teams + roster links, players on no other season's team (+ documents, photos),
// tournaments, matches, player stats and reference list. Champions are KEPT: they are the
// historical record (free text), and only lose their link to this season.
router.delete('/:id', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await Season.findById(req.params.id);
    if (!season) return res.status(404).json({ message: 'Season not found.' });
    const current = await getCurrentSeason();
    if (current && String(current._id) === String(season._id)) {
      return res.status(409).json({ message: "This is the current season and can't be deleted." });
    }
    // An ongoing match of a past season is abandoned data, not live play, so no "being scored" check.
    if (String((req.body && req.body.confirm) || '').trim() !== season.name) {
      return res.status(400).json({ message: `Type "${season.name}" exactly to confirm.` });
    }

    const teamIds = (await Team.find({ season: season._id }).select('_id').lean()).map((t) => t._id);
    const links = await TeamPlayer.find({ team: { $in: teamIds } }).select('player').lean();
    const playerIds = [...new Set(links.map((l) => String(l.player)))];
    // A player linked to a team outside this season stays.
    const shared = new Set((await TeamPlayer.find({ player: { $in: playerIds }, team: { $nin: teamIds } })
      .select('player').lean()).map((l) => String(l.player)));
    const ownPlayers = playerIds.filter((id) => !shared.has(id));

    const tIds = (await Tournament.find({ season: season._id }).select('_id').lean()).map((t) => t._id);
    const matchIds = (await Match.find({ tournament: { $in: tIds } }).select('_id').lean()).map((m) => m._id);

    await PlayerMatchStats.deleteMany({ match: { $in: matchIds } });
    await Match.deleteMany({ _id: { $in: matchIds } });
    await Tournament.deleteMany({ _id: { $in: tIds } });

    const docs = await Document.find({ player: { $in: ownPlayers } }).select('file').lean();
    const photos = await Player.find({ _id: { $in: ownPlayers }, photo: { $ne: null } }).select('photo').lean();
    await deleteFiles('documents', docs.map((d) => d.file));
    await deleteFiles('photos', photos.map((p) => p.photo));
    await Document.deleteMany({ player: { $in: ownPlayers } });
    await Player.deleteMany({ _id: { $in: ownPlayers } });
    await TeamPlayer.deleteMany({ team: { $in: teamIds } });
    await Team.deleteMany({ _id: { $in: teamIds } });
    await ReferenceList.deleteMany({ season: season._id });
    await Notification.deleteMany({ season: season._id });
    await Champion.updateMany({ season: season._id }, { $set: { season: null } });
    await Season.deleteOne({ _id: season._id });

    res.json({
      message: `${season.name} was deleted.`,
      teams: teamIds.length,
      players: ownPlayers.length,
      tournaments: tIds.length,
      matches: matchIds.length,
    });
  } catch (err) {
    console.error('Delete season error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;