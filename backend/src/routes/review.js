const express = require('express');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Document = require('../models/Document');
const Barangay = require('../models/Barangay');
const Sport = require('../models/Sport');
const { deleteFile } = require('../config/gridfs');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');

const router = express.Router();

// Everything here is Super Admin only.
router.use(authenticate, authorize('super_admin'));

// GET /api/review/queue — submitted teams awaiting review, with a status tally
// each, PLUS a per-barangay breakdown across all 26 barangays (so the Super
// Admin can pick a barangay to work through instead of scrolling every team
// in the season at once) and a season-wide pending count for a sidebar badge.
router.get('/queue', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ teams: [], barangays: [], totalPending: 0 });

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
        barangayId: t.barangay && String(t.barangay._id),
        barangay: t.barangay && t.barangay.name,
        sport: t.sport && t.sport.name,
        playerCount: links.length,
        tally,
        needsAttention: tally.flagged + tally.needs_document + tally.pending > 0,
      };
    }));

    // Every barangay, not just ones with a pending team — a barangay with
    // nothing submitted yet, or one that's fully verified, still needs to
    // show up (as empty / cleared) so the picker always lists all 26.
    const allBarangays = await Barangay.find().sort({ name: 1 });
    const submittedThisSeason = await Team.find({ season: season._id, submittedAt: { $ne: null } })
      .select('barangay status sport division');

    // "Cleared" means the barangay has a VERIFIED team in every (sport,
    // division) slot this season is actually running — not just that
    // whatever subset it happened to submit is done. Reported directly: a
    // barangay with one verified Chess team was showing "Cleared" even
    // though it hadn't touched the other ~10 sport/division slots. A slot
    // is one per division (Basketball u15 + u30 is 2 slots, Chess Open is
    // 1), NOT multiplied by how many teams a barangay may field in it — a
    // barangay only ever needs ONE team to complete a slot; Mobile
    // Legends's optional 2nd team is a bonus entry, not a second required
    // slot, same as any other sport's second team would be if it had one.
    const seasonSports = await Sport.find({ divisions: { $exists: true, $ne: [] } }).select('divisions');
    const requiredSlots = seasonSports.reduce((sum, s) => sum + (s.divisions?.length || 0), 0);

    const statsByBarangay = {};
    submittedThisSeason.forEach((t) => {
      const key = String(t.barangay);
      if (!statsByBarangay[key]) statsByBarangay[key] = { pending: 0, verified: 0, verifiedSlots: new Set() };
      if (t.status === 'verified') {
        statsByBarangay[key].verified++;
        statsByBarangay[key].verifiedSlots.add(`${t.sport}|${t.division}`);
      } else {
        statsByBarangay[key].pending++; // status 'pending' — the only other state a submitted team can be in
      }
    });

    const barangays = allBarangays.map((b) => {
      const stats = statsByBarangay[String(b._id)] || { pending: 0, verified: 0, verifiedSlots: new Set() };
      const completedSlots = stats.verifiedSlots.size;
      return {
        id: b._id,
        name: b.name,
        pendingTeams: stats.pending,
        verifiedTeams: stats.verified,
        completedSlots,
        requiredSlots,
        cleared: stats.pending === 0 && requiredSlots > 0 && completedSlots >= requiredSlots,
      };
    });

    const totalPending = out.length;

    res.json({ season: season.name, teams: out, barangays, totalPending });
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

    // A `needs_document` player has NO reference-list match at all — the only
    // evidence an approval can rest on is a submitted document (an "eligible"
    // player never needed one, and a `flagged` player's issue is the
    // cross-barangay rule, not missing paperwork, so this check is deliberately
    // scoped to needs_document only). Block an approve with nothing to look at.
    const player = await Player.findById(req.params.playerId);
    if (!player) return res.status(404).json({ message: 'Player not found.' });
    if (player.eligibilityStatus === 'needs_document') {
      const docCount = await Document.countDocuments({ player: req.params.playerId });
      if (docCount === 0) {
        return res.status(400).json({
          message: 'This player has no residency document uploaded yet — the Barangay Admin needs to submit one before this player can be approved.',
        });
      }
    }

    // Clear flagReason too — a manual approve overrides whatever the automated
    // pre-screen said (e.g. "Under 15 — needs parental consent and documents",
    // "Not found on the reference list…"), so leaving the old reason in place
    // made the Review Queue and player modal keep showing that warning even
    // though the player is now eligible.
    await Player.updateOne({ _id: req.params.playerId }, { $set: { eligibilityStatus: 'eligible', flagReason: '' } });
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