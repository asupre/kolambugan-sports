const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Sport = require('../models/Sport');
const Document = require('../models/Document');
const Match = require('../models/Match');
const { authenticate, authorize } = require('../middleware/auth');
const { requireSeasonState, getCurrentSeason } = require('../middleware/season');
const { prescreenTeam,  prescreenPlayer, norm } = require('../services/prescreen');
const { uploadPhoto, uploadDoc, putFile, sendFile, deleteFile } = require('../config/gridfs');

const router = express.Router();
const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const MIN_PLAYERS = 10;
const MAX_PLAYERS = 15;

const ROSTER_LIMITS = {
  team:        { min: 10, max: 15 },
  esportsTeam: { min: 6,  max: 6  },  // Mobile Legends / esports team sports
  singles:     { min: 1,  max: 1  },
  doubles:     { min: 2,  max: 2  },
};

// Esports team sports (Mobile Legends) cap a roster at 6 (5 starters + 1 sub),
// not the 10–15 physical-sport team range — so a barangay's 2 ML entries
// (e.g. Mukas 1, Mukas 2) total at most 12 players between them.
async function getRosterLimits(team) {
  if (team.format === 'team') {
    const sport = await Sport.findById(team.sport).select('category');
    if (sport && sport.category === 'esports') return ROSTER_LIMITS.esportsTeam;
  }
  return ROSTER_LIMITS[team.format] || ROSTER_LIMITS.team;
}

// Age from birthdate.
function computeAge(birthdate) {
  const d = new Date(birthdate);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

// Identity key for the same-sport duplicate-roster check below — name
// (case/whitespace-tolerant, same convention as prescreen.js) + birthdate,
// so two unrelated people who happen to share a name aren't conflated.
function playerKey(lastName, firstName, birthdate) {
  return `${norm(lastName)}|${norm(firstName)}|${birthdate ? new Date(birthdate).toDateString() : ''}`;
}

// A barangay may field more than one team in the same sport (esports allows
// 2; teamsPerBarangay can allow more for others), but the SAME athlete can't
// be on two of them — nothing stopped a Barangay Admin from typing the same
// player into both team 1 and team 2's roster. Builds a lookup of every
// player already on one of this barangay's OTHER teams in the same sport
// this season, keyed by playerKey(), so add-player and CSV import can both
// check against it before creating a new Player record.
async function siblingTeamRosterIndex(team) {
  const siblingTeams = await Team.find({
    barangay: team.barangay,
    sport: team.sport,
    season: team.season,
    _id: { $ne: team._id },
  }).select('teamName');
  if (!siblingTeams.length) return new Map();

  const teamNameById = new Map(siblingTeams.map((t) => [String(t._id), t.teamName]));
  const links = await TeamPlayer.find({ team: { $in: siblingTeams.map((t) => t._id) } }).populate('player');

  const index = new Map();
  for (const link of links) {
    const p = link.player;
    if (!p) continue;
    index.set(playerKey(p.lastName, p.firstName, p.birthdate), teamNameById.get(String(link.team)));
  }
  return index;
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

// GET /api/teams?sportId=X  — SUPER ADMIN. Every team for a sport, from ANY
// season — including ones left behind by a deleted season. Deliberately not
// scoped to the current season: that's exactly how a sport ends up stuck
// (DELETE /api/sports/:id refuses while teams still reference it), so the
// cleanup view needs to see the orphans, not just this season's teams.
router.get('/', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.sportId) filter.sport = req.query.sportId;
    const teams = await Team.find(filter)
      .populate('barangay', 'name')
      .populate('season', 'name')
      .sort({ createdAt: -1 });

    const withCounts = await Promise.all(teams.map(async (t) => {
      const playerCount = await TeamPlayer.countDocuments({ team: t._id });
      return { ...t.toObject(), playerCount };
    }));

    res.json({ teams: withCounts });
  } catch (err) {
    console.error('List all teams error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// DELETE /api/teams/:id — SUPER ADMIN (any team, any status, e.g. orphan
// cleanup) or the owning BARANGAY ADMIN (their own team only, and only
// before it's verified — once verified it's locked into tournament
// generation, so undoing that needs the Super Admin). Permanently removes
// a team: its players (unless shared with another team via TeamPlayer),
// those players' documents and photos, and the team itself. Blocked while
// the team appears in any match — delete the tournament first (which
// clears its matches), same guard shape as DELETE /api/sports/:id.
router.delete('/:id', authenticate, authorize('super_admin', 'barangay_admin'), async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found.' });

    if (req.user.role === 'barangay_admin') {
      if (!req.user.barangay || String(team.barangay) !== String(req.user.barangay)) {
        return res.status(403).json({ message: "You can only delete your own barangay's team." });
      }
      if (team.status === 'verified') {
        return res.status(409).json({
          message: 'This team is verified and locked. Contact the Super Admin to remove it.',
        });
      }
    }

    const inMatches = await Match.countDocuments({ $or: [{ teamA: team._id }, { teamB: team._id }] });
    if (inMatches > 0) {
      return res.status(409).json({
        message: `${team.teamName} still appears in ${inMatches} match(es). Delete the tournament first.`,
      });
    }

    const links = await TeamPlayer.find({ team: team._id });
    for (const link of links) {
      const player = await Player.findById(link.player);
      if (!player) continue;

      const docs = await Document.find({ player: player._id });
      for (const doc of docs) {
        await deleteFile('documents', doc.file);
        await Document.deleteOne({ _id: doc._id });
      }
      if (player.photo) await deleteFile('photos', player.photo);

      const otherLinks = await TeamPlayer.countDocuments({ player: player._id, team: { $ne: team._id } });
      if (otherLinks === 0) await Player.findByIdAndDelete(player._id);
    }

    await TeamPlayer.deleteMany({ team: team._id });
    await Team.deleteOne({ _id: team._id });

    res.json({ message: `${team.teamName} deleted.` });
  } catch (err) {
    console.error('Delete team error:', err);
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

        const limits = await getRosterLimits(team);
    const count = await TeamPlayer.countDocuments({ team: team._id });
    if (count >= limits.max) {
      return res.status(409).json({ message: `A ${team.format} roster can have at most ${limits.max} player(s).` });
    }

    const { firstName, middleName, lastName, birthdate, address, jerseyNumber } = req.body;
    if (!firstName || !middleName || !lastName || !birthdate || !address || jerseyNumber === undefined || jerseyNumber === null || jerseyNumber === '') {
      return res.status(400).json({
        message: 'First name, middle name, last name, birthdate, address, and jersey number are all required.',
      });
    }
    if (!Number.isFinite(Number(jerseyNumber))) {
      return res.status(400).json({ message: 'Jersey number must be a number.' });
    }

    const dupIndex = await siblingTeamRosterIndex(team);
    const dupTeamName = dupIndex.get(playerKey(lastName, firstName, birthdate));
    if (dupTeamName) {
      return res.status(409).json({
        message: `${firstName.trim()} ${lastName.trim()} is already on ${dupTeamName}'s roster for this sport — the same player can't be on two of your barangay's teams in one sport.`,
      });
    }

    const player = await Player.create({
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
      birthdate: new Date(birthdate),
      age: computeAge(birthdate),
      address: address.trim(),
      jerseyNumber: Number(jerseyNumber),
    });

    await TeamPlayer.create({ team: team._id, player: player._id });

    res.status(201).json({ player, playerCount: count + 1 });
  } catch (err) {
    console.error('Add player error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// Tolerant header mapping for a barangay's own player CSV (a coach's
// spreadsheet, a prior season's export) — matched loosely the same way the
// SK Federation's reference-list upload matches its columns.
function canonicalPlayerKey(h) {
  const k = (h || '').toLowerCase().replace(/[^a-z]/g, '');
  if (['firstname', 'first', 'givenname', 'fname'].includes(k)) return 'firstName';
  if (['middlename', 'middle', 'mname', 'mi'].includes(k)) return 'middleName';
  if (['lastname', 'last', 'surname', 'familyname', 'lname'].includes(k)) return 'lastName';
  if (['birthdate', 'birthday', 'dob', 'dateofbirth'].includes(k)) return 'birthdate';
  if (['address', 'addr', 'homeaddress'].includes(k)) return 'address';
  if (['jerseynumber', 'jersey', 'jerseyno', 'number', 'no', 'jerseynum'].includes(k)) return 'jerseyNumber';
  return null;
}

// POST /api/teams/:id/players/import — bulk-add players to a draft roster
// from a CSV. Same rules as adding one at a time (draft only, capped at the
// roster's max) — rows beyond the cap or missing required fields are
// skipped and reported, not silently dropped, mirroring the reference-list
// upload's skippedRows shape.
router.post('/:id/players/import', authenticate, authorize('barangay_admin'),
  requireSeasonState('registration_open'), uploadCsv.single('file'), async (req, res) => {
  try {
    const team = await loadOwnedTeam(req, res);
    if (!team) return;

    if (team.submittedAt) {
      return res.status(409).json({ message: 'This roster is already submitted and can no longer be edited.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a CSV file (form field name: "file").' });
    }

    let rows;
    try {
      rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    } catch {
      return res.status(400).json({ message: 'Could not parse the CSV. Check the file format.' });
    }
    if (!rows.length) return res.status(400).json({ message: 'The CSV has no data rows.' });

    const limits = await getRosterLimits(team);
    const existingCount = await TeamPlayer.countDocuments({ team: team._id });
    const remaining = Math.max(0, limits.max - existingCount);
    // Also updated as rows are accepted below, so two rows in the SAME CSV
    // naming the same player get caught too, not just ones matched against
    // an already-saved sibling team.
    const dupIndex = await siblingTeamRosterIndex(team);

    const skipped = [];
    const toCreate = [];
    rows.forEach((row, i) => {
      const rowNum = i + 2; // +2 = header row + 1-based data row
      const rec = {};
      for (const [h, v] of Object.entries(row)) {
        const key = canonicalPlayerKey(h);
        if (key) rec[key] = v;
      }
      if (!rec.firstName || !rec.lastName || !rec.birthdate) {
        skipped.push({ row: rowNum, reason: 'Missing first name, last name, or birthdate.' });
        return;
      }
      const d = new Date(rec.birthdate);
      if (isNaN(d.getTime())) {
        skipped.push({ row: rowNum, reason: `Unreadable birthdate "${rec.birthdate}".` });
        return;
      }
      const key2 = playerKey(rec.lastName, rec.firstName, d);
      const dupTeamName = dupIndex.get(key2);
      if (dupTeamName) {
        skipped.push({ row: rowNum, reason: `${rec.firstName} ${rec.lastName} is already on ${dupTeamName}'s roster for this sport.` });
        return;
      }
      if (toCreate.length >= remaining) {
        skipped.push({ row: rowNum, reason: `Roster is full (max ${limits.max}).` });
        return;
      }
      toCreate.push({
        firstName: rec.firstName.trim(),
        middleName: rec.middleName ? rec.middleName.trim() : undefined,
        lastName: rec.lastName.trim(),
        birthdate: d,
        age: computeAge(d),
        address: rec.address ? rec.address.trim() : undefined,
        jerseyNumber: rec.jerseyNumber != null && rec.jerseyNumber !== '' ? Number(rec.jerseyNumber) : undefined,
      });
      dupIndex.set(key2, team.teamName);
    });

    if (!toCreate.length) {
      return res.status(400).json({ message: 'No valid rows to add.', added: 0, skippedRows: skipped });
    }

    const created = await Player.insertMany(toCreate);
    await TeamPlayer.insertMany(created.map((p) => ({ team: team._id, player: p._id })));

    const playerCount = await TeamPlayer.countDocuments({ team: team._id });
    res.status(201).json({
      message: `${created.length} player(s) added${skipped.length ? `, ${skipped.length} row(s) skipped` : ''}.`,
      added: created.length,
      skippedRows: skipped,
      playerCount,
    });
  } catch (err) {
    console.error('Import players error:', err);
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
// Changing the name, middle name, or birthdate invalidates the residency screen,
// since those are what the reference lookup uses — so it re-screens. A corrected
// spelling clears automatically; a wrong one gets flagged. The check can't be
// edited around.
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
    const before = {
      first: player.firstName,
      last: player.lastName,
      middle: player.middleName,
      birth: String(player.birthdate),
    };

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

    // A correction can rename a player into matching someone already on
    // one of the barangay's OTHER teams in this same sport just as easily
    // as adding them fresh would — same guard as POST /:id/players.
    if (firstName !== undefined || lastName !== undefined || birthdate !== undefined) {
      const dupIndex = await siblingTeamRosterIndex(team);
      const dupTeamName = dupIndex.get(playerKey(player.lastName, player.firstName, player.birthdate));
      if (dupTeamName) {
        return res.status(409).json({
          message: `${player.firstName} ${player.lastName} is already on ${dupTeamName}'s roster for this sport — the same player can't be on two of your barangay's teams in one sport.`,
        });
      }
    }

    await player.save();

    const identityChanged =
      before.first !== player.firstName ||
      before.last !== player.lastName ||
      before.middle !== player.middleName ||
      before.birth !== String(player.birthdate);

    let screening = null;
    let reopened = false;
    if (identityChanged) {
      screening = await prescreenPlayer(player, team);

      // A correction can un-clear a previously eligible player. If that
      // happens on a team the Super Admin already verified and locked, the
      // team must NOT stay "verified" with a flagged/needs-document player
      // sitting on it silently — that's exactly the Dayo gap verification
      // exists to catch. Send it back to the Review Queue (status only;
      // submittedAt is untouched, so the roster itself stays locked).
      if (team.status === 'verified' && screening.status !== 'eligible') {
        team.status = 'pending';
        await team.save();
        reopened = true;
      }
    }

    const fresh = await Player.findById(player._id);
    res.json({
      message: reopened
        ? 'Player updated and re-screened. This team no longer qualifies as verified, so it has been sent back to the Review Queue.'
        : identityChanged ? 'Player updated and re-screened.' : 'Player updated.',
      player: fresh,
      rescreened: identityChanged,
      screening,
      teamStatus: team.status,
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

        const limits = await getRosterLimits(team);
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