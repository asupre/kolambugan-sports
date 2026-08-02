const express = require('express');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Sport = require('../models/Sport');
const { authenticate, authorize } = require('../middleware/auth');
const { requireSeasonState, getCurrentSeason } = require('../middleware/season');

const router = express.Router();

const MIN_PLAYERS = 10;
const MAX_PLAYERS = 15;

// Age from birthdate.
function computeAge(birthdate) {
  const d = new Date(birthdate);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

// Load a team and confirm this barangay admin owns it (super_admin may access any).
// Returns the team, or sends an error response and returns null.
async function loadOwnedTeam(req, res) {
  const team = await Team.findById(req.params.id);
  if (!team) {
    res.status(404).json({ message: 'Team not found.' });
    return null;
  }
  const isOwner =
    req.user.role === 'super_admin' ||
    (req.user.barangay && String(team.barangay) === String(req.user.barangay));
  if (!isOwner) {
    res.status(403).json({ message: "You can only manage your own barangay's team." });
    return null;
  }
  return team;
}

// POST /api/teams  — create this barangay's team for a sport (draft).
router.post('/', authenticate, authorize('barangay_admin'),
  requireSeasonState('registration_open'), async (req, res) => {
  try {
    const { teamName, sportId } = req.body;
    if (!teamName || !teamName.trim() || !sportId) {
      return res.status(400).json({ message: 'Team name and sport are required.' });
    }
    if (!req.user.barangay) {
      return res.status(400).json({ message: 'Your account is not linked to a barangay.' });
    }

    const sport = await Sport.findById(sportId);
    if (!sport) {
      return res.status(404).json({ message: 'Sport not found.' });
    }

    // One team per barangay + sport + season.
    const existing = await Team.findOne({
      barangay: req.user.barangay,
      sport: sportId,
      season: req.season._id,
    });
    if (existing) {
      return res.status(409).json({ message: `Your barangay already has a team for ${sport.name} this season.` });
    }

    const team = await Team.create({
      teamName: teamName.trim(),
      barangay: req.user.barangay,
      sport: sportId,
      season: req.season._id,
    });

    res.status(201).json({ team });
  } catch (err) {
    console.error('Create team error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/teams/mine  — this barangay admin's teams for the current season.
router.get('/mine', authenticate, authorize('barangay_admin'), async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ teams: [] });

    const teams = await Team.find({ barangay: req.user.barangay, season: season._id })
      .populate('sport', 'name')
      .sort({ createdAt: 1 });

    const withCounts = await Promise.all(teams.map(async (t) => {
      const playerCount = await TeamPlayer.countDocuments({ team: t._id });
      return { ...t.toObject(), playerCount };
    }));

    res.json({ teams: withCounts });
  } catch (err) {
    console.error('List teams error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/teams/:id/players  — add one player to a draft roster.
router.post('/:id/players', authenticate, authorize('barangay_admin'),
  requireSeasonState('registration_open'), async (req, res) => {
  try {
    const team = await loadOwnedTeam(req, res);
    if (!team) return;

    if (team.submittedAt) {
      return res.status(409).json({ message: 'This roster is already submitted and can no longer be edited.' });
    }

    const count = await TeamPlayer.countDocuments({ team: team._id });
    if (count >= MAX_PLAYERS) {
      return res.status(409).json({ message: `A roster can have at most ${MAX_PLAYERS} players.` });
    }

    const { firstName, middleName, lastName, birthdate, address, jerseyNumber } = req.body;
    if (!firstName || !lastName || !birthdate) {
      return res.status(400).json({ message: 'First name, last name, and birthdate are required.' });
    }

    const player = await Player.create({
      firstName: firstName.trim(),
      middleName: middleName ? middleName.trim() : undefined,
      lastName: lastName.trim(),
      birthdate: new Date(birthdate),
      age: computeAge(birthdate),
      address: address ? address.trim() : undefined,
      jerseyNumber: jerseyNumber != null ? Number(jerseyNumber) : undefined,
    });

    await TeamPlayer.create({ team: team._id, player: player._id });

    res.status(201).json({ player, playerCount: count + 1 });
  } catch (err) {
    console.error('Add player error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/teams/:id/players  — roster for the editing view (owner or super_admin).
router.get('/:id/players', authenticate, async (req, res) => {
  try {
    const team = await loadOwnedTeam(req, res);
    if (!team) return;

    const links = await TeamPlayer.find({ team: team._id }).populate('player');
    const players = links.map(l => l.player);

    res.json({ players, playerCount: players.length });
  } catch (err) {
    console.error('List players error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// DELETE /api/teams/:id/players/:playerId  — remove a player from a draft roster.
router.delete('/:id/players/:playerId', authenticate, authorize('barangay_admin'),
  requireSeasonState('registration_open'), async (req, res) => {
  try {
    const team = await loadOwnedTeam(req, res);
    if (!team) return;

    if (team.submittedAt) {
      return res.status(409).json({ message: 'This roster is already submitted and can no longer be edited.' });
    }

    const link = await TeamPlayer.findOneAndDelete({ team: team._id, player: req.params.playerId });
    if (!link) {
      return res.status(404).json({ message: 'That player is not on this team.' });
    }

    // If the player isn't on any other team, delete the Player doc too.
    const otherLinks = await TeamPlayer.countDocuments({ player: req.params.playerId });
    if (otherLinks === 0) {
      await Player.findByIdAndDelete(req.params.playerId);
    }

    const playerCount = await TeamPlayer.countDocuments({ team: team._id });
    res.json({ message: 'Player removed.', playerCount });
  } catch (err) {
    console.error('Remove player error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/teams/:id/submit  — lock the roster; enforce 10–15.
router.post('/:id/submit', authenticate, authorize('barangay_admin'),
  requireSeasonState('registration_open'), async (req, res) => {
  try {
    const team = await loadOwnedTeam(req, res);
    if (!team) return;

    if (team.submittedAt) {
      return res.status(409).json({ message: 'This roster has already been submitted.' });
    }

    const count = await TeamPlayer.countDocuments({ team: team._id });
    if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
      return res.status(400).json({
        message: `A roster must have between ${MIN_PLAYERS} and ${MAX_PLAYERS} players. Yours has ${count}.`,
      });
    }

    team.submittedAt = new Date();
    await team.save();

    // LATER: the reference-list auto pre-screen hooks in here — it sets each
    // player's eligibilityStatus. For now, submit just locks the roster.

    res.json({ team, playerCount: count });
  } catch (err) {
    console.error('Submit roster error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;