const express = require('express');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Document = require('../models/Document');
const { deleteFile } = require('../config/gridfs');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');

const router = express.Router();

// Everything here is Super Admin only.
router.use(authenticate, authorize('super_admin'));

// GET /api/review/queue — submitted teams awaiting review, with a status tally each.
router.get('/queue', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ teams: [] });

    const teams = await Team.find({ season: season._id, submittedAt: { $ne: null }, status: 'pending' })
      .populate('barangay', 'name')
      .populate('sport', 'name')
      .sort({ submittedAt: 1 });

    const out = await Promise.all(teams.map(async (t) => {
      const links = await TeamPlayer.find({ team: t._id }).populate('player');
      const tally = { eligible: 0, needs_document: 0, flagged: 0, pending: 0 };
      links.forEach((l) => { if (l.player) tally[l.player.eligibilityStatus]++; });
      return {
        teamId: t._id,
        teamName: t.teamName,
        barangay: t.barangay && t.barangay.name,
        sport: t.sport && t.sport.name,
        playerCount: links.length,
        tally,
        needsAttention: tally.flagged + tally.needs_document + tally.pending > 0,
      };
    }));

    res.json({ season: season.name, teams: out });
  } catch (err) {
    console.error('Review queue error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/review/teams/:teamId — full roster with each player's status, photo,
// and any residency documents they've uploaded, for review.
router.get('/teams/:teamId', async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId)
      .populate('barangay', 'name')
      .populate('sport', 'name');
    if (!team) return res.status(404).json({ message: 'Team not found.' });

    const links = await TeamPlayer.find({ team: team._id }).populate('player');
    const players = await Promise.all(
      links.map((l) => l.player).filter(Boolean).map(async (p) => {
        const docs = await Document.find({ player: p._id })
          .select('docType verifyStatus createdAt')
          .sort({ createdAt: 1 });
        return { ...p.toObject(), documents: docs };
      })
    );

    res.json({ team, players });
  } catch (err) {
    console.error('Review team error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/review/teams/:teamId/players/:playerId/approve — mark a player eligible.
// Their pending documents are approved in the same action (the Super Admin has
// reviewed the person; the documents were the evidence).
router.post('/teams/:teamId/players/:playerId/approve', async (req, res) => {
  try {
    const link = await TeamPlayer.findOne({ team: req.params.teamId, player: req.params.playerId });
    if (!link) return res.status(404).json({ message: 'That player is not on this team.' });

    await Player.updateOne({ _id: req.params.playerId }, { $set: { eligibilityStatus: 'eligible' } });
    await Document.updateMany(
      { player: req.params.playerId, verifyStatus: 'pending' },
      { $set: { verifyStatus: 'approved', reviewedBy: req.user.id, reviewedAt: new Date() } }
    );

    res.json({ message: 'Player approved.', playerId: req.params.playerId, eligibilityStatus: 'eligible' });
  } catch (err) {
    console.error('Approve player error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/review/teams/:teamId/players/:playerId/reject
// Removes the player and EVERYTHING attached (documents + their GridFS files,
// photo file), then reopens the roster so the Barangay Admin can replace them.
router.post('/teams/:teamId/players/:playerId/reject', async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId);
    if (!team) return res.status(404).json({ message: 'Team not found.' });

    const link = await TeamPlayer.findOneAndDelete({ team: team._id, player: req.params.playerId });
    if (!link) return res.status(404).json({ message: 'That player is not on this team.' });

    // Only purge the person if no other team still uses them.
        const otherLinks = await TeamPlayer.countDocuments({ player: req.params.playerId });
    if (otherLinks === 0) {
      const player = await Player.findById(req.params.playerId);
      const docs = await Document.find({ player: req.params.playerId });
      for (const d of docs) await deleteFile('documents', d.file);
      await Document.deleteMany({ player: req.params.playerId });
      if (player?.photo) await deleteFile('photos', player.photo);
      await Player.findByIdAndDelete(req.params.playerId);
    }

    // Reopen the roster.
    team.submittedAt = null;
    team.status = 'rejected';
    await team.save();

    const remaining = await TeamPlayer.countDocuments({ team: team._id });
    res.json({
      message: 'Player rejected and removed, along with their documents and photo. The roster has been reopened.',
      teamStatus: team.status,
      remainingPlayers: remaining,
    });
  } catch (err) {
    console.error('Reject player error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/review/teams/:teamId/verify — finalize a team once everyone is eligible.
router.post('/teams/:teamId/verify', async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId);
    if (!team) return res.status(404).json({ message: 'Team not found.' });
    if (!team.submittedAt) {
      return res.status(409).json({ message: 'This team has not been submitted.' });
    }

    const links = await TeamPlayer.find({ team: team._id }).populate('player');
    const unresolved = links.filter((l) => l.player && l.player.eligibilityStatus !== 'eligible');
    if (unresolved.length) {
      return res.status(400).json({
        message: `Cannot verify: ${unresolved.length} player(s) still need a decision (flagged, needs_document, or pending).`,
      });
    }

    team.status = 'verified';
    await team.save();
    res.json({ message: 'Team verified.', teamId: team._id, status: team.status });
  } catch (err) {
    console.error('Verify team error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;