const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Sport = require('../models/Sport');
const Document = require('../models/Document');
const Match = require('../models/Match');
const Barangay = require('../models/Barangay');
const { knockoutSizeOf, teamsAllowedFor } = require('../lib/sportRules');
const { authenticate, authorize } = require('../middleware/auth');
const { requireSeasonState, getCurrentSeason } = require('../middleware/season');
const { prescreenTeam,  prescreenPlayer, decidePlayer, norm, looseRegex } = require('../services/prescreen');
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

// Basketball's two divisions are age caps, not just labels: 'under15' means
// 15 and under (not 14 and under), 'under30' means 30 and under (not 29 and
// under, and not unlimited either — 31+ doesn't belong there). Every other
// division (open/boys/girls) is gender/skill-based, not age-based, so it has
// no entry here and no cap applies.
// 'under30' also has a FLOOR of 16 (Sep 2026) — the two divisions must not
// overlap. Without a floor, a 15-and-under player could legally sit on
// EITHER roster, which defeats the point of splitting them by age in the
// first place. under15 stays 0-15; under30 is 16-30.
const DIVISION_AGE_LIMIT = { under15: 15, under30: 30 };
const DIVISION_AGE_MIN = { under30: 16 };
const DIVISION_AGE_LABEL = { under15: 'Under 15', under30: 'Under 30' };

function checkDivisionAge(division, birthdate) {
  const limit = DIVISION_AGE_LIMIT[division];
  if (!limit) return { ok: true };
  const age = computeAge(birthdate);
  if (age > limit) return { ok: false, age, limit, label: DIVISION_AGE_LABEL[division], reason: 'over' };
  const min = DIVISION_AGE_MIN[division];
  if (min && age < min) return { ok: false, age, limit, min, label: DIVISION_AGE_LABEL[division], reason: 'under' };
  return { ok: true };
}

function divisionAgeMessage(ageCheck, playerPhrase) {
  if (ageCheck.reason === 'under') {
    return `This is a ${ageCheck.label} team — ${playerPhrase} ${ageCheck.age}, under the ${ageCheck.min}-and-up minimum for this division.`;
  }
  return `This is a ${ageCheck.label} team — ${playerPhrase} ${ageCheck.age}, over the ${ageCheck.limit}-and-under limit.`;
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

// Boys and girls divisions don't mix (Super Admin rule, Sep 2026). There is no
// gender field on Player, so the barangay's OWN rosters are the evidence: once
// an athlete is on one of this barangay's BOYS teams this season (any sport),
// they may only be added to other boys or open teams — never a girls team —
// and vice versa. E.g. a Badminton Boys player can also play Volleyball Boys
// or Billiards (open), but not Pickleball Girls. Age divisions (under15 /
// under30) and open carry no gender and are never checked. Returns a Map of
// playerKey() -> "Badminton Girls (Team name)" for every athlete on an
// opposite-gender team, or an empty Map when this team isn't boys/girls.
const OPPOSITE_GENDER = { boys: 'girls', girls: 'boys' };
const GENDER_LABEL = { boys: 'Boys', girls: 'Girls' };
async function genderConflictIndex(team) {
  const opposite = OPPOSITE_GENDER[team.division];
  if (!opposite) return new Map();
  const teams = await Team.find({
    barangay: team.barangay,
    season: team.season,
    division: opposite,
    _id: { $ne: team._id },
  }).populate('sport', 'name').select('teamName sport division').lean();
  if (!teams.length) return new Map();

  const labelById = new Map(teams.map((t) => [
    String(t._id),
    `${t.sport ? t.sport.name : 'another sport'} ${GENDER_LABEL[opposite]} (${t.teamName})`,
  ]));
  const links = await TeamPlayer.find({ team: { $in: teams.map((t) => t._id) } })
    .populate('player', 'lastName firstName birthdate').lean();
  const index = new Map();
  for (const link of links) {
    const p = link.player;
    if (!p) continue;
    index.set(playerKey(p.lastName, p.firstName, p.birthdate), labelById.get(String(link.team)));
  }
  return index;
}
const genderConflictMessage = (first, last, team, where) =>
  `${String(first).trim()} ${String(last).trim()} is already on your ${where} roster, so they can't play in a ${GENDER_LABEL[team.division]} division. A player on a ${GENDER_LABEL[OPPOSITE_GENDER[team.division]]} team can only join other ${GENDER_LABEL[OPPOSITE_GENDER[team.division]]} or Open teams.`;

// An UNCHECKED barangay's team fields ONLY its own residents (the cross-barangay
// checkbox in League Setup belongs to the RECRUITING team's barangay). This used to be
// enforced only at SUBMIT, and only for players on the reference list, so a Tabigue
// (unchecked) admin could import a CSV of Inudaran players and the import stamped
// every one of them with Tabigue as their address (Sep 2026 bug). Now add, CSV import
// and "Correct this player" refuse a player the system can tell belongs elsewhere:
//   1. the CSV row's own address names a different barangay (import only; the manual
//      form's address must already be the team's barangay, see checkAddress), or
//   2. an adult (16+) is on the reference list under a different barangay.
// Minors are never on the list, so with no address column there's no way to know
// their home barangay; the "one athlete, one barangay" rule and the documents are
// what's left. A checked barangay's team (e.g. Inudaran) is never blocked here.
function barangayNamedIn(address, barangays, ownName) {
  const words = (s) => ` ${String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\bsto\b/g, 'santo').replace(/\bsta\b/g, 'santa').trim()} `;
  const addr = words(address);
  if (!addr.trim()) return null;
  const hits = barangays.filter((b) => addr.includes(words(b.name)));
  // "Small Banisilon" also contains "Banisilon": keep only the longest names.
  const named = hits.filter((b) => !hits.some((o) => o !== b && words(o.name).includes(words(b.name))));
  if (!named.length || named.some((b) => norm(b.name) === norm(ownName))) return null;
  return named[0].name;
}
async function crossBarangayBlock(team, teamBrgy, player, { address, barangays } = {}) {
  if (!teamBrgy || teamBrgy.allowsCrossBarangay) return null;
  if (address !== undefined && barangays) {
    const other = barangayNamedIn(address, barangays, teamBrgy.name);
    if (other) return `their address is in ${other}, and ${teamBrgy.name} can only field its own residents (cross-barangay isn't allowed for ${teamBrgy.name})`;
  }
  const d = await decidePlayer(player, team, teamBrgy);
  if (d.code === 'cross_barangay') {
    return `the reference list has them under another barangay, and ${teamBrgy.name} can only field its own residents (cross-barangay isn't allowed for ${teamBrgy.name})`;
  }
  return null;
}

// A player's address is deliberately just their team's barangay name and
// nothing else (Sep 2026, Super Admin decision — the player plays for that
// barangay, so it stands in as their address). An optional "Brgy."/"Barangay"
// prefix is tolerated; the STORED value is always the canonical name.
// Address plays no part in residency screening either way.
async function checkAddress(team, address) {
  const brgy = await Barangay.findById(team.barangay).select('name');
  const name = brgy ? brgy.name : '';
  const stripped = String(address || '').replace(/^\s*(barangay|brgy\.?)\s+/i, '');
  return { name, ok: !!name && norm(stripped) === norm(name) };
}

// One athlete plays for ONE barangay per season (Super Admin rule, Sep 2026).
// They can play as many teams/sports as they like FOR that barangay (each team
// gets its own Player record), and a barangay whose `allowsCrossBarangay` is
// on may field a resident of another barangay — but once that athlete is on
// barangay A's roster, no OTHER barangay may roster them this season. Matched
// by name + birthdate (the same identity playerKey() uses), since nothing else
// links two Player records for the same person. Returns
// { barangay, teamName, sport } for the other barangay's team, or null.
// A targeted lookup (names first, then their links), not a scan of the season.
async function otherBarangayHolder(team, lastName, firstName, birthdate) {
  const key = playerKey(lastName, firstName, birthdate);
  const candidates = await Player.find({
    lastName: looseRegex(lastName),
    firstName: looseRegex(firstName),
  }).select('lastName firstName birthdate').lean();
  const same = candidates.filter((p) => playerKey(p.lastName, p.firstName, p.birthdate) === key);
  if (!same.length) return null;

  const links = await TeamPlayer.find({ player: { $in: same.map((p) => p._id) } }).select('team').lean();
  if (!links.length) return null;
  const teams = await Team.find({
    _id: { $in: links.map((l) => l.team) },
    season: team.season,
    barangay: { $ne: team.barangay },
  }).populate('barangay', 'name').populate('sport', 'name').lean();
  const t = teams[0];
  return t ? { barangay: t.barangay && t.barangay.name, teamName: t.teamName, sport: t.sport && t.sport.name } : null;
}
const otherBarangayMessage = (first, last, h) =>
  `${String(first).trim()} ${String(last).trim()} is already on ${h.barangay}'s ${h.sport} roster this season. A player can only play for one barangay (they can play as many sports as they like for that one).`;

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

    // One team per barangay PER DIVISION (so a barangay can enter both u15 and u30),
    // except a round-robin sport (Mobile Legends), which follows the knockout size the
    // Super Admin set in League Setup: Top 8 = 1 team, Top 16 = 2 (Sep 2026).
    const maxTeams = teamsAllowedFor(sport);
    const ko = knockoutSizeOf(sport);
    const existing = await Team.find({
      barangay: req.user.barangay,
      sport: sportId,
      season: req.season._id,
      division,
    });

        if (existing.length >= maxTeams) {
      return res.status(409).json({
        message: ko
          ? `${sport.name} is a Top ${ko} knockout this season, which allows ${maxTeams} team${maxTeams === 1 ? '' : 's'} per barangay — you already have ${existing.length}.`
          : maxTeams === 1
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

    // Sent as its own field (not by populating `barangay`, which other code
    // reads as an id) — the roster form pre-fills each player's address with it.
    const brgy = await Barangay.findById(req.user.barangay).select('name');

    // Per-team screening tally, shown beside "Submitted" on My Teams (Sep 2026):
    // how many players are flagged, still need a document, or have one uploaded and
    // are waiting for the SK Federation. Batched — three queries for the whole list,
    // not one per team.
    const links = await TeamPlayer.find({ team: { $in: teams.map((t) => t._id) } })
      .populate('player', 'eligibilityStatus').lean();
    const needDocIds = links
      .filter((l) => l.player && l.player.eligibilityStatus === 'needs_document')
      .map((l) => l.player._id);
    const withDoc = new Set(
      (await Document.distinct('player', { player: { $in: needDocIds } })).map(String)
    );
    const tallyByTeam = new Map();
    for (const l of links) {
      const key = String(l.team);
      const t = tallyByTeam.get(key) || { players: 0, eligible: 0, flagged: 0, needsDocument: 0, docInReview: 0, pending: 0 };
      t.players++;
      const s = l.player && l.player.eligibilityStatus;
      if (s === 'eligible') t.eligible++;
      else if (s === 'flagged') t.flagged++;
      else if (s === 'needs_document') {
        if (withDoc.has(String(l.player._id))) t.docInReview++;
        else t.needsDocument++;
      } else t.pending++;
      tallyByTeam.set(key, t);
    }

    const withCounts = teams.map((t) => {
      const tally = tallyByTeam.get(String(t._id)) || { players: 0, eligible: 0, flagged: 0, needsDocument: 0, docInReview: 0, pending: 0 };
      return { ...t.toObject(), playerCount: tally.players, screening: tally, barangayName: brgy ? brgy.name : '' };
    });

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
          message: 'This team is verified and locked. Ask the Super Admin to reopen it first.',
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
    if (!firstName || !middleName || !lastName || !birthdate || !address) {
      return res.status(400).json({
        message: 'First name, middle name, last name, birthdate, and address are all required.',
      });
    }
    // Jersey number is optional (Sep 2026) — but if one is given it must be numeric.
    const hasJersey = jerseyNumber !== undefined && jerseyNumber !== null && jerseyNumber !== '';
    if (hasJersey && !Number.isFinite(Number(jerseyNumber))) {
      return res.status(400).json({ message: 'Jersey number must be a number.' });
    }
    const addr = await checkAddress(team, address);
    if (!addr.ok) {
      return res.status(400).json({ message: `Address must be your barangay's name: "${addr.name}".` });
    }
    const ageCheck = checkDivisionAge(team.division, birthdate);
    if (!ageCheck.ok) {
      return res.status(400).json({ message: divisionAgeMessage(ageCheck, 'this player is') });
    }

    const dupIndex = await siblingTeamRosterIndex(team);
    const dupTeamName = dupIndex.get(playerKey(lastName, firstName, birthdate));
    if (dupTeamName) {
      return res.status(409).json({
        message: `${firstName.trim()} ${lastName.trim()} is already on ${dupTeamName}'s roster for this sport — the same player can't be on two of your barangay's teams in one sport.`,
      });
    }
    const genderIndex = await genderConflictIndex(team);
    const genderWhere = genderIndex.get(playerKey(lastName, firstName, birthdate));
    if (genderWhere) {
      return res.status(409).json({ message: genderConflictMessage(firstName, lastName, team, genderWhere) });
    }
    const holder = await otherBarangayHolder(team, lastName, firstName, birthdate);
    if (holder) return res.status(409).json({ message: otherBarangayMessage(firstName, lastName, holder) });
    const teamBrgy = await Barangay.findById(team.barangay).select('name allowsCrossBarangay');
    const crossReason = await crossBarangayBlock(team, teamBrgy, { firstName, middleName, lastName, birthdate: new Date(birthdate) });
    if (crossReason) {
      return res.status(409).json({ message: `${firstName.trim()} ${lastName.trim()} can't be added: ${crossReason}.` });
    }

    const player = await Player.create({
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
      birthdate: new Date(birthdate),
      age: computeAge(birthdate),
      address: addr.name,
      jerseyNumber: hasJersey ? Number(jerseyNumber) : undefined,
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
  if (['address', 'addr', 'homeaddress', 'completeaddress', 'residenceaddress', 'residence'].includes(k)) return 'address';
  // A separate barangay column — never stored (the address is always the team's
  // barangay), but read as evidence by the cross-barangay check on import (Sep 2026:
  // a roster whose barangay sat under "Barangay" slipped through the address check).
  if (['barangay', 'brgy', 'homebarangay', 'barangayname', 'barangayofresidence', 'brgyname'].includes(k)) return 'barangay';
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
    const genderIndex = await genderConflictIndex(team);
    // The address is always the team's barangay name (see checkAddress), so a
    // CSV's own address column is ignored — every imported player gets it.
    const importAddress = (await checkAddress(team, '')).name || undefined;
    // For the cross-barangay check below (the CSV address is read for THAT, then
    // still replaced by the team's barangay name when stored).
    const teamBrgy = await Barangay.findById(team.barangay).select('name allowsCrossBarangay');
    const allBarangays = teamBrgy && !teamBrgy.allowsCrossBarangay ? await Barangay.find().select('name').lean() : null;

    const skipped = [];
    const toCreate = [];
    for (const [i, row] of rows.entries()) {
      const rowNum = i + 2; // +2 = header row + 1-based data row
      const rec = {};
      for (const [h, v] of Object.entries(row)) {
        const key = canonicalPlayerKey(h);
        if (key) rec[key] = v;
      }
      if (!rec.firstName || !rec.lastName || !rec.birthdate) {
        skipped.push({ row: rowNum, reason: 'Missing first name, last name, or birthdate.' });
        continue;
      }
      const d = new Date(rec.birthdate);
      if (isNaN(d.getTime())) {
        skipped.push({ row: rowNum, reason: `Unreadable birthdate "${rec.birthdate}".` });
        continue;
      }
      const ageCheck = checkDivisionAge(team.division, d);
      if (!ageCheck.ok) {
        const limitPhrase = ageCheck.reason === 'under'
          ? `under the ${ageCheck.label} team's ${ageCheck.min}-and-up minimum`
          : `over the ${ageCheck.label} team's ${ageCheck.limit}-and-under limit`;
        skipped.push({ row: rowNum, reason: `${rec.firstName} ${rec.lastName} is ${ageCheck.age}, ${limitPhrase}.` });
        continue;
      }
      const key2 = playerKey(rec.lastName, rec.firstName, d);
      const dupTeamName = dupIndex.get(key2);
      if (dupTeamName) {
        skipped.push({ row: rowNum, reason: `${rec.firstName} ${rec.lastName} is already on ${dupTeamName}'s roster for this sport.` });
        continue;
      }
      const genderWhere = genderIndex.get(key2);
      if (genderWhere) {
        skipped.push({ row: rowNum, reason: `${rec.firstName} ${rec.lastName} is already on your ${genderWhere} roster — can't play in a ${GENDER_LABEL[team.division]} division.` });
        continue;
      }
      const holder = await otherBarangayHolder(team, rec.lastName, rec.firstName, d);
      if (holder) {
        skipped.push({ row: rowNum, reason: `${rec.firstName} ${rec.lastName} is already on ${holder.barangay}'s ${holder.sport} roster — a player can only play for one barangay.` });
        continue;
      }
      const crossReason = await crossBarangayBlock(team, teamBrgy,
        { firstName: rec.firstName, middleName: rec.middleName, lastName: rec.lastName, birthdate: d },
        { address: [rec.address, rec.barangay].filter(Boolean).join(', '), barangays: allBarangays });
      if (crossReason) {
        skipped.push({ row: rowNum, reason: `${rec.firstName} ${rec.lastName}: ${crossReason}.` });
        continue;
      }
      if (toCreate.length >= remaining) {
        skipped.push({ row: rowNum, reason: `Roster is full (max ${limits.max}).` });
        continue;
      }
      toCreate.push({
        firstName: rec.firstName.trim(),
        middleName: rec.middleName ? rec.middleName.trim() : undefined,
        lastName: rec.lastName.trim(),
        birthdate: d,
        age: computeAge(d),
        address: importAddress,
        jerseyNumber: rec.jerseyNumber != null && rec.jerseyNumber !== '' ? Number(rec.jerseyNumber) : undefined,
      });
      dupIndex.set(key2, team.teamName);
    }

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

    // Once the Super Admin has verified a team its player details are FROZEN
    // for the Barangay Admin (Sep 2026) — an edit re-runs the residency screen
    // and can flip an already-verified team back to pending. Photos are a
    // separate route and stay editable. The Super Admin can still correct.
    if (team.status === 'verified' && req.user.role === 'barangay_admin') {
      return res.status(409).json({
        message: 'This team is verified, so its player details are locked. Only player photos can be changed. If something needs correcting, ask the Super Admin to reopen the team (only possible during the verification period).',
      });
    }

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
    if (address !== undefined) {
      if (!String(address).trim()) return res.status(400).json({ message: 'Address cannot be empty.' });
      const addr = await checkAddress(team, address);
      if (!addr.ok) {
        return res.status(400).json({ message: `Address must be your barangay's name: "${addr.name}".` });
      }
      player.address = addr.name;
    }
    if (jerseyNumber !== undefined) {
      player.jerseyNumber = jerseyNumber === null || jerseyNumber === '' ? undefined : Number(jerseyNumber);
    }
    if (birthdate !== undefined) {
      const d = new Date(birthdate);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid birthdate.' });
      const ageCheck = checkDivisionAge(team.division, d);
      if (!ageCheck.ok) {
        return res.status(400).json({ message: divisionAgeMessage(ageCheck, 'this player would be') });
      }
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
      const genderWhere = (await genderConflictIndex(team)).get(playerKey(player.lastName, player.firstName, player.birthdate));
      if (genderWhere) {
        return res.status(409).json({ message: genderConflictMessage(player.firstName, player.lastName, team, genderWhere) });
      }
      const holder = await otherBarangayHolder(team, player.lastName, player.firstName, player.birthdate);
      if (holder) return res.status(409).json({ message: otherBarangayMessage(player.firstName, player.lastName, holder) });
    }
    if (firstName !== undefined || lastName !== undefined || middleName !== undefined || birthdate !== undefined) {
      const teamBrgy = await Barangay.findById(team.barangay).select('name allowsCrossBarangay');
      const crossReason = await crossBarangayBlock(team, teamBrgy, player);
      if (crossReason) {
        return res.status(409).json({ message: `${player.firstName} ${player.lastName} can't be saved like this: ${crossReason}.` });
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

    // Backstop for the per-player age-cap check on add/import/correct (a
    // player added before that check existed, or by some other path, could
    // otherwise reach submission — and past this point they'd be screened
    // for residency only, never for the division's age cap, at all).
    const ageLimit = DIVISION_AGE_LIMIT[team.division];
    if (ageLimit) {
      const ageMin = DIVISION_AGE_MIN[team.division];
      const links = await TeamPlayer.find({ team: team._id }).populate('player', 'firstName lastName birthdate');
      const players = links.map((l) => l.player).filter(Boolean);
      const overAge = players.filter((p) => computeAge(p.birthdate) > ageLimit);
      if (overAge.length) {
        return res.status(400).json({
          message: `This is a ${DIVISION_AGE_LABEL[team.division]} team (${ageLimit} and under). Over the limit: ${overAge.map((p) => `${p.firstName} ${p.lastName} (${computeAge(p.birthdate)})`).join(', ')}.`,
        });
      }
      if (ageMin) {
        const underAge = players.filter((p) => computeAge(p.birthdate) < ageMin);
        if (underAge.length) {
          return res.status(400).json({
            message: `This is a ${DIVISION_AGE_LABEL[team.division]} team (${ageMin} and up). Under the minimum: ${underAge.map((p) => `${p.firstName} ${p.lastName} (${computeAge(p.birthdate)})`).join(', ')}.`,
          });
        }
      }
    }

    // Backstop for the boys/girls rule (players added before it existed).
    const genderIndex = await genderConflictIndex(team);
    if (genderIndex.size) {
      const links = await TeamPlayer.find({ team: team._id }).populate('player', 'firstName lastName birthdate');
      const clash = links.map((l) => l.player).filter(Boolean)
        .map((p) => ({ p, where: genderIndex.get(playerKey(p.lastName, p.firstName, p.birthdate)) }))
        .filter((x) => x.where);
      if (clash.length) {
        return res.status(400).json({
          message: `This is a ${GENDER_LABEL[team.division]} team, but these players are already on a ${GENDER_LABEL[OPPOSITE_GENDER[team.division]]} roster: ${clash.map((x) => `${x.p.firstName} ${x.p.lastName} (${x.where})`).join(', ')}. Remove them first.`,
        });
      }
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

// DELETE /api/teams/:id/players/:playerId/documents/:docId — remove a wrongly
// uploaded document (Sep 2026). Barangay Admin, own team only. Blocked once the
// SK Federation has already reviewed it (`approved`/`rejected` — the verdict is
// on record; ask the Super Admin to reopen the team instead) or once the team
// itself is verified and locked, same as the player-detail edit lock.
router.delete('/:id/players/:playerId/documents/:docId', authenticate, authorize('barangay_admin'),
  async (req, res) => {
  try {
    const team = await loadOwnedTeam(req, res);
    if (!team) return;

    if (team.status === 'verified') {
      return res.status(409).json({
        message: 'This team is verified and locked. Ask the Super Admin to reopen it first.',
      });
    }

    const link = await TeamPlayer.findOne({ team: team._id, player: req.params.playerId });
    if (!link) return res.status(404).json({ message: 'That player is not on this team.' });

    const doc = await Document.findOne({ _id: req.params.docId, player: req.params.playerId });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    if (doc.verifyStatus !== 'pending') {
      return res.status(409).json({
        message: `This document has already been ${doc.verifyStatus} — it can no longer be deleted. Upload a new one instead, or ask the Super Admin to reopen the team.`,
      });
    }

    await deleteFile('documents', doc.file);
    await Document.deleteOne({ _id: doc._id });

    res.json({ message: 'Document deleted.' });
  } catch (err) {
    console.error('Document delete error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/teams/:id/players/:playerId/documents/:docId/file — Barangay Admin,
// own team only. Lets them actually SEE what they uploaded (not just its
// filename and status) before deciding whether to keep it or delete/replace
// it — the super-admin-only route below has no ownership check at all, so it
// can't just be reused here with a role added to `authorize`.
router.get('/:id/players/:playerId/documents/:docId/file', authenticate, authorize('barangay_admin'),
  async (req, res) => {
  try {
    const team = await loadOwnedTeam(req, res);
    if (!team) return;

    const link = await TeamPlayer.findOne({ team: team._id, player: req.params.playerId });
    if (!link) return res.status(404).json({ message: 'That player is not on this team.' });

    const doc = await Document.findOne({ _id: req.params.docId, player: req.params.playerId });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    await sendFile('documents', doc.file, res, 'private, no-store');
  } catch (err) {
    console.error('Document file (barangay admin) error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/teams/documents/:docId/file — SUPER ADMIN ONLY. Residency documents are
// private (IDs, birth certificates) — never public, unlike player photos.
router.get('/documents/:docId/file', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const doc = await Document.findById(req.params.docId);
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    await sendFile('documents', doc.file, res, 'private, no-store');
  } catch (err) {
    console.error('Document fetch error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;