const express = require('express');
const Season = require('../models/Season');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Barangay = require('../models/Barangay');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/stats/dashboard — summary counts for the Super Admin home.
router.get('/dashboard', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await Season.findOne().sort({ createdAt: -1 });
    const barangays = await Barangay.countDocuments();

    let teams = 0;
    let toReview = 0;

    if (season) {
      teams = await Team.countDocuments({ season: season._id });

      // Players needing attention: flagged or needs_document, on this season's teams.
      const seasonTeams = await Team.find({ season: season._id }).select('_id');
      const teamIds = seasonTeams.map((t) => t._id);
      const links = await TeamPlayer.find({ team: { $in: teamIds } }).select('player');
      const playerIds = links.map((l) => l.player);
      toReview = await Player.countDocuments({
        _id: { $in: playerIds },
        eligibilityStatus: { $in: ['flagged', 'needs_document'] },
      });
    }

    res.json({
      season: season ? { name: season.name, status: season.status } : null,
      teams,
      playersToReview: toReview,
      barangays,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;