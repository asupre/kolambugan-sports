const express = require('express');
const mongoose = require('mongoose');
const Season = require('../models/Season');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Barangay = require('../models/Barangay');
const Sport = require('../models/Sport');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const { authenticate, authorize } = require('../middleware/auth');
const { isManilaToday } = require('../config/time');

const router = express.Router();

// GET /api/stats/dashboard — summary counts for the Super Admin home.
router.get('/dashboard', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await Season.findOne().sort({ createdAt: -1 });
    const barangays = await Barangay.countDocuments();
    const sports = await Sport.countDocuments();

    const [barangayAdmins, organizers] = await Promise.all([
      User.countDocuments({ role: 'barangay_admin' }),
      User.countDocuments({ role: 'organizer' }),
    ]);

    let teams = 0;
    let toReview = 0;
    let todayMatches = [];

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

      // Today's games, for the dashboard carousel — "how many would play today"
      // reads as a roster headcount, not just a match count, so each entry
      // carries both teams' player counts alongside the fixture.
      const tournaments = await Tournament.find({ season: season._id }).populate('sport', 'name');
      const sportById = {};
      tournaments.forEach((t) => { sportById[String(t._id)] = t.sport?.name || '?'; });
      const tournamentIds = tournaments.map((t) => t._id);

      const matches = await Match.find({ tournament: { $in: tournamentIds }, schedule: { $ne: null } })
        .populate('teamA', 'teamName')
        .populate('teamB', 'teamName');

      // "Today's games" also carries forward anything scheduled for a PAST day
      // that never got played — the league running behind schedule doesn't make
      // those games disappear, they're still today's business until someone
      // scores or forfeits them. Already-decided matches (completed/forfeited)
      // from past days are done and drop off normally.
      const UNRESOLVED = ['scheduled', 'ongoing'];
      const todays = matches.filter((m) =>
        isManilaToday(m.schedule) ||
        (new Date(m.schedule).getTime() < Date.now() && UNRESOLVED.includes(m.status))
      );

      const involvedTeamIds = [...new Set(
        todays.flatMap((m) => [m.teamA?._id, m.teamB?._id]).filter(Boolean).map(String)
      )];
      const counts = await TeamPlayer.aggregate([
        { $match: { team: { $in: involvedTeamIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
        { $group: { _id: '$team', n: { $sum: 1 } } },
      ]);
      const countByTeam = {};
      counts.forEach((c) => { countByTeam[String(c._id)] = c.n; });

      todayMatches = todays
        .sort((a, b) => new Date(a.schedule) - new Date(b.schedule))
        .map((m) => {
          const aCount = m.teamA ? (countByTeam[String(m.teamA._id)] || 0) : 0;
          const bCount = m.teamB ? (countByTeam[String(m.teamB._id)] || 0) : 0;
          return {
            id: m._id,
            sport: sportById[String(m.tournament)] || '?',
            teamA: m.teamA?.teamName || 'TBD',
            teamB: m.teamB?.teamName || 'TBD',
            players: aCount + bCount,
            schedule: m.schedule,
            venue: m.venue || '',
            status: m.status,
          };
        });
    }

    res.json({
      season: season ? { name: season.name, status: season.status } : null,
      teams,
      playersToReview: toReview,
      barangays,
      sports,
      accounts: { barangayAdmins, organizers },
      todayMatches,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;