const express = require('express');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Sport = require('../models/Sport');
const Document = require('../models/Document');
const { authenticate, authorize } = require('../middleware/auth');
const { requireSeasonState, getCurrentSeason } = require('../middleware/season');
const { prescreenTeam,  prescreenPlayer } = require('../services/prescreen');
const { uploadPhoto, uploadDoc, putFile, sendFile, deleteFile } = require('../config/gridfs');

const router = express.Router();

const MIN_PLAYERS = 10;
const MAX_PLAYERS = 15;

const ROSTER_LIMITS = {
  team:    { min: 10, max: 15 },
  singles: { min: 1,  max: 1  },
  doubles: { min: 2,  max: 2  },
};

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

        const division = req.body.division || 'open';
    const format = req.body.format || sport.entryFormat || 'team';

    // Mobile Legends allows two teams per barangay; every other sport is one team
    // per barangay PER DIVISION (so a barangay can enter both u17 and u30).
        // Configured per sport; Mobile Legends is the seeded exception at 2.
    const maxTeams = sport.teamsPerBarangay ?? (sport.name === 'Mobile Legends' ? 2 : 1);
    const existing = await Team.find({
      barangay: req.user.barangay,
      sport: sportId,
      season: req.season._id,
      division,
    });

        if (existing.length >= maxTeams) {
      return res.status(409).json({
        message: maxTeams === 1
          ? `Your barangay already has a ${division} team for ${sport.name} this season.`
          : `Your barangay already has the maximum of ${maxTeams} teams for ${sport.name} this season.`,
      });
    }

    // Within the same sport, the two teams can't share the exact same name.
    const nameClash = existing.some(
      (t) => t.teamName.trim().toLowerCase() === teamName.trim().toLowerCase()
    );
    if (nameClash) {
      return res.status(409).json({
        message: `Your barangay already has a ${sport.name} team named "${teamName.trim()}". Use a distinct name (e.g. add 1 or 2).`,
      });
    }

    const team = await Team.create({
      teamName: teamName.trim(),
      barangay: req.user.barangay,
      sport: sportId,
      season: req.season._id,
      division,
      format,
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

        const limits = ROSTER_LIMITS[team.format] || ROSTER_LIMITS.team;
    const count = await TeamPlayer.countDocuments({ team: team._id });
    if (count >= limits.max) {
      return res.status(409).json({ message: `A ${team.format} roster can have at most ${limits.max} player(s).` });
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
// PATCH /api/teams/:id/players/:playerId — correct a player's details.
//
// Exists because the only alternative was REJECT, which deletes the player, their
// documents, their photo, and reopens the roster — a brutal price for a typo, and
// no help at all once a wrong name is already on the public site.
//
// Deliberately has NO submittedAt check and no season gate: a correction has to
// work after submission, which is exactly when typos get noticed.
//
// Changing the name or birthdate invalidates the residency screen, since those
// are what the reference lookup uses — so it re-screens. A corrected spelling
// clears automatically; a wrong one gets flagged. The check can't be edited around.
router.patch('/:id/players/:playerId', authenticate,
  authorize('barangay_admin', 'super_admin'), async (req, res) => {
  try {
    const team = await loadOwnedTeam(req, res);
    if (!team) return;

    const link = await TeamPlayer.findOne({ team: team._id, player: req.params.playerId });
    if (!link) return res.status(404).json({ message: 'That player is not on this team.' });

    const player = await Player.findById(req.params.playerId);
    if (!player) return res.status(404).json({ message: 'Player not found.' });

    const { firstName, middleName, lastName, birthdate, address, jerseyNumber } = req.body;
    const before = { first: player.firstName, last: player.lastName, birth: String(player.birthdate) };

    if (firstName !== undefined) {
      if (!String(firstName).trim()) return res.status(400).json({ message: 'First name cannot be empty.' });
      player.firstName = String(firstName).trim();
    }
    if (lastName !== undefined) {
      if (!String(lastName).trim()) return res.status(400).json({ message: 'Last name cannot be empty.' });
      player.lastName = String(lastName).trim();
    }
    if (middleName !== undefined) player.middleName = String(middleName).trim() || undefined;
    if (address !== undefined) player.address = String(address).trim() || undefined;
    if (jerseyNumber !== undefined) {
      player.jerseyNumber = jerseyNumber === null || jerseyNumber === '' ? undefined : Number(jerseyNumber);
    }
    if (birthdate !== undefined) {
      const d = new Date(birthdate);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid birthdate.' });
      player.birthdate = d;
      player.age = computeAge(d);
    }

    await player.save();

    const identityChanged =
      before.first !== player.firstName ||
      before.last !== player.lastName ||
      before.birth !== String(player.birthdate);

    let screening = null;
    if (identityChanged) screening = await prescreenPlayer(player, team);

    const fresh = await Player.findById(player._id);
    res.json({
      message: identityChanged ? 'Player updated and re-screened.' : 'Player updated.',
      player: fresh,
      rescreened: identityChanged,
      screening,
    });
  } catch (err) {
    console.error('Update player error:', err);
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

        const limits = ROSTER_LIMITS[team.format] || ROSTER_LIMITS.team;
    const count = await TeamPlayer.countDocuments({ team: team._id });
    if (count < limits.min || count > limits.max) {
      return res.status(400).json({
        message: `A ${team.format} roster must have between ${limits.min} and ${limits.max} players. Yours has ${count}.`,
      });
    }

    team.submittedAt = new Date();
    team.status = 'pending';        // ← add: resubmit clears a prior 'rejected'
    await team.save();

    // Automated residency pre-screen — sets each player's eligibilityStatus.
    const screening = await prescreenTeam(team);

    res.json({ team, playerCount: count, screening });   // ← add screening here
  } catch (err) {
    console.error('Submit roster error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/teams/:id/players/:playerId/photo — barangay admin uploads a player's
// headshot. Multipart, field name "photo". Replaces any existing photo.
router.post('/:id/players/:playerId/photo', authenticate, authorize('barangay_admin'),
  uploadPhoto.single('photo'), async (req, res) => {
  try {
    const team = await loadOwnedTeam(req, res);
    if (!team) return;
    if (!req.file) return res.status(400).json({ message: 'No photo uploaded.' });

    // The player must actually be on this team.
    const link = await TeamPlayer.findOne({ team: team._id, player: req.params.playerId });
    if (!link) return res.status(404).json({ message: 'That player is not on this team.' });

    const player = await Player.findById(req.params.playerId);
    if (!player) return res.status(404).json({ message: 'Player not found.' });

    const oldPhoto = player.photo;
    player.photo = await putFile('photos', req.file.buffer, `player-${player._id}`, req.file.mimetype, {
      player: String(player._id),
    });
    await player.save();
    if (oldPhoto) await deleteFile('photos', oldPhoto);   // clean up the replaced one

    res.status(201).json({ message: 'Photo uploaded.', photo: String(player.photo) });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(400).json({ message: err.message || 'Could not upload the photo.' });
  }
});

// GET /api/players/:playerId/photo — PUBLIC; serves the headshot for team rosters.
router.get('/players/:playerId/photo', async (req, res) => {
  try {
    const player = await Player.findById(req.params.playerId).select('photo');
    if (!player || !player.photo) return res.status(404).json({ message: 'No photo.' });
    await sendFile('photos', player.photo, res);
  } catch (err) {
    console.error('Photo fetch error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// DELETE /api/teams/:id/players/:playerId/photo — remove a player's photo.
router.delete('/:id/players/:playerId/photo', authenticate, authorize('barangay_admin'), async (req, res) => {
  try {
    const team = await loadOwnedTeam(req, res);
    if (!team) return;
    const link = await TeamPlayer.findOne({ team: team._id, player: req.params.playerId });
    if (!link) return res.status(404).json({ message: 'That player is not on this team.' });

    const player = await Player.findById(req.params.playerId);
    if (player?.photo) { await deleteFile('photos', player.photo); player.photo = null; await player.save(); }
    res.json({ message: 'Photo removed.' });
  } catch (err) {
    console.error('Photo delete error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/teams/needs-documents — barangay admin; players on their teams who still
// need a residency document, across all their teams this season.
router.get('/needs-documents', authenticate, authorize('barangay_admin'), async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ players: [] });

    const teams = await Team.find({ barangay: req.user.barangay, season: season._id }).populate('sport', 'name');
    const out = [];
    for (const t of teams) {
      const links = await TeamPlayer.find({ team: t._id }).populate('player');
      for (const l of links) {
        const p = l.player;
        if (!p) continue;
        if (p.eligibilityStatus !== 'needs_document' && p.eligibilityStatus !== 'flagged') continue;
        const docs = await Document.find({ player: p._id }).select('docType verifyStatus createdAt');
        out.push({
          playerId: String(p._id),
          name: `${p.lastName}, ${p.firstName}`,
          age: p.age,
          eligibilityStatus: p.eligibilityStatus,
          flagReason: p.flagReason || '',
          teamId: String(t._id),
          teamName: t.teamName,
          sport: t.sport?.name,
          documents: docs,
        });
      }
    }
    res.json({ players: out });
  } catch (err) {
    console.error('Needs-documents error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/teams/:id/players/:playerId/documents — upload a residency document.
// Multipart: field "document", plus docType in the body.
const DOC_TYPES = ['birth_certificate', 'voters_id', 'barangay_clearance', 'parental_consent'];

router.post('/:id/players/:playerId/documents', authenticate, authorize('barangay_admin'),
  uploadDoc.single('document'), async (req, res) => {
  try {
    const team = await loadOwnedTeam(req, res);
    if (!team) return;
    if (!req.file) return res.status(400).json({ message: 'No document uploaded.' });
    if (!DOC_TYPES.includes(req.body.docType)) {
      return res.status(400).json({ message: `docType must be one of: ${DOC_TYPES.join(', ')}.` });
    }

    const link = await TeamPlayer.findOne({ team: team._id, player: req.params.playerId });
    if (!link) return res.status(404).json({ message: 'That player is not on this team.' });

    const fileId = await putFile('documents', req.file.buffer, `doc-${req.params.playerId}`, req.file.mimetype, {
      player: String(req.params.playerId),
    });

    const doc = await Document.create({
      player: req.params.playerId,
      docType: req.body.docType,
      file: fileId,
      verifyStatus: 'pending',
    });

    res.status(201).json({ message: 'Document uploaded. The SK Federation will review it.', document: doc });
  } catch (err) {
    console.error('Document upload error:', err);
    res.status(400).json({ message: err.message || 'Could not upload the document.' });
  }
});

// GET /api/teams/documents/:docId/file — SUPER ADMIN ONLY. Residency documents are
// private (IDs, birth certificates) — never public, unlike player photos.
router.get('/documents/:docId/file', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const doc = await Document.findById(req.params.docId);
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    await sendFile('documents', doc.file, res);
  } catch (err) {
    console.error('Document fetch error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;