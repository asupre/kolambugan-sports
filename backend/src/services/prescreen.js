const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Barangay = require('../models/Barangay');
const ReferenceList = require('../models/ReferenceList');
const Team = require('../models/Team');

const MINOR_AGE = 15;

const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A case/whitespace-tolerant exact-match regex — same tolerance as norm(),
// just expressed so Mongo can run it: "Dela  Cruz" and "dela cruz" both match.
function looseRegex(s) {
  const parts = norm(s).split(' ').filter(Boolean).map(escapeRegex);
  if (!parts.length) return /^$/;
  return new RegExp(`^${parts.join('\\s+')}$`, 'i');
}

function ageFrom(birthdate) {
  if (!birthdate) return null;
  const d = new Date(birthdate), now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}
function sameDay(a, b) {
  if (!a || !b) return false;
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

// The decision for ONE player, given reference rows already matched by name.
// `teamBarangay` must be a FULL Barangay doc/object including allowsCrossBarangay.
// Pure function — same inputs always produce the same output, no I/O here,
// so a batch screen and a single-player screen can share this exact logic
// while fetching their candidates differently.
function decideFromCandidates(player, teamBarangay, candidates) {
  const age = ageFrom(player.birthdate);

  // Under 15 can't be on a voters' list at all, so there's nothing to look up —
  // no candidate is "matched" here even if a name happens to coincide.
  if (age !== null && age < MINOR_AGE) {
    return {
      status: 'needs_document',
      reason: `Under ${MINOR_AGE} — needs parental consent and documents`,
      matchedReferenceId: null,
    };
  }

  let cands = candidates;
  if (cands.length > 1 && player.birthdate) {
    const exact = cands.filter((r) => r.birthdate && sameDay(r.birthdate, player.birthdate));
    if (exact.length) cands = exact;
  }

  if (cands.length === 0) {
    return {
      status: 'needs_document',
      reason: 'Not found on the reference list — check the spelling, or upload a residency document',
      matchedReferenceId: null,
    };
  }

  const teamBrgyName = norm(teamBarangay && teamBarangay.name);
  const sameBrgyMatch = cands.find((r) => teamBrgyName && norm(r.barangay) === teamBrgyName);
  if (sameBrgyMatch || !cands.some((r) => r.barangay)) {
    return { status: 'eligible', reason: '', matchedReferenceId: (sameBrgyMatch || cands[0])._id };
  }

  // The flag lives on the TEAM's barangay, not the player's home barangay
  // (corrected Sep 2026 — this used to read the PLAYER's home barangay, which
  // is the opposite of what League Setup's checkbox means). A checked
  // barangay's team may field a resident of ANY barangay; an unchecked
  // barangay's team may only field its own residents.
  if (teamBarangay && teamBarangay.allowsCrossBarangay) {
    return { status: 'eligible', reason: '', matchedReferenceId: cands[0]._id };
  }

  const teamName = teamBarangay?.name || 'this barangay';
  return {
    status: 'flagged',
    reason: `Listed under ${cands[0].barangay}, not ${teamName} — ${teamName} doesn't allow cross-barangay players`,
    // The mismatched-barangay row itself — this IS the reason for the flag,
    // so it's worth surfacing the same way an eligible match is.
    matchedReferenceId: cands[0]._id,
  };
}

// Runs on roster submission. Screens every player on the team, so it fetches
// the WHOLE season's reference list ONCE and reuses it in memory — cheaper
// than one query per player when there are 10-15 of them.
async function prescreenTeam(team) {
  const teamBarangay = await Barangay.findById(team.barangay);
  const links = await TeamPlayer.find({ team: team._id }).populate('player');
  const players = links.map((l) => l.player).filter(Boolean);

  const refs = await ReferenceList.find({ season: team.season }).lean();
  const refIndex = new Map();
  for (const r of refs) {
    const key = `${norm(r.lastName)}|${norm(r.firstName)}`;
    if (!refIndex.has(key)) refIndex.set(key, []);
    refIndex.get(key).push(r);
  }
  const summary = { eligible: 0, needs_document: 0, flagged: 0 };

  for (const p of players) {
    const candidates = refIndex.get(`${norm(p.lastName)}|${norm(p.firstName)}`) || [];
    const { status, reason } = decideFromCandidates(p, teamBarangay, candidates);
    if (p.eligibilityStatus !== status || p.flagReason !== reason) {
      await Player.updateOne({ _id: p._id }, { $set: { eligibilityStatus: status, flagReason: reason } });
    }
    summary[status]++;
  }

  return summary;
}

// Re-screen ONE player after their name or birthdate was corrected. Queries
// the reference list directly by name (season+lastName+firstName is
// indexed) instead of loading the whole season's list just to check one
// player — was the slow path: ~0.5-1s to fetch and scan 17k rows in Node
// for a single correction, now a targeted lookup that returns at most a
// handful of rows.
async function prescreenPlayer(player, team) {
  const teamBarangay = await Barangay.findById(team.barangay);
  const candidates = await ReferenceList.find({
    season: team.season,
    lastName: looseRegex(player.lastName),
    firstName: looseRegex(player.firstName),
  }).lean();

  const { status, reason } = decideFromCandidates(player, teamBarangay, candidates);
  await Player.updateOne({ _id: player._id }, { $set: { eligibilityStatus: status, flagReason: reason } });
  return { status, reason };
}

// Re-screens every player on every team in a season. Needed when a
// barangay's allowsCrossBarangay flag changes: that can flip a player's
// status in EITHER direction (flagged -> eligible if now allowed, or
// eligible -> flagged if a previously-allowed exception is revoked)
// without that player's own name or birthdate changing at all — nothing
// else would ever trigger a re-screen for them otherwise. Fetches the
// season's reference list ONCE and reuses it
// across every team, same tradeoff as prescreenTeam.
async function rescreenSeason(seasonId) {
  const teams = await Team.find({ season: seasonId });
  if (!teams.length) return { screened: 0, changed: 0, reopened: 0 };

  const refs = await ReferenceList.find({ season: seasonId }).lean();
  const refIndex = new Map();
  for (const r of refs) {
    const key = `${norm(r.lastName)}|${norm(r.firstName)}`;
    if (!refIndex.has(key)) refIndex.set(key, []);
    refIndex.get(key).push(r);
  }
  const barangayCache = new Map();

  let screened = 0, changed = 0, reopened = 0;
  for (const team of teams) {
    const bId = String(team.barangay);
    if (!barangayCache.has(bId)) barangayCache.set(bId, await Barangay.findById(team.barangay));
    const teamBarangay = barangayCache.get(bId);

    const links = await TeamPlayer.find({ team: team._id }).populate('player');
    const players = links.map((l) => l.player).filter(Boolean);

    let anyNonEligible = false;
    for (const p of players) {
      const candidates = refIndex.get(`${norm(p.lastName)}|${norm(p.firstName)}`) || [];
      const { status, reason } = decideFromCandidates(p, teamBarangay, candidates);
      screened++;
      if (p.eligibilityStatus !== status || p.flagReason !== reason) {
        await Player.updateOne({ _id: p._id }, { $set: { eligibilityStatus: status, flagReason: reason } });
        changed++;
      }
      if (status !== 'eligible') anyNonEligible = true;
    }

    // Same safeguard as the "correct this player" route: a verified team
    // must never silently sit with a non-eligible player on it.
    if (team.status === 'verified' && anyNonEligible) {
      team.status = 'pending';
      await team.save();
      reopened++;
    }
  }

  return { screened, changed, reopened };
}

module.exports = {
  prescreenTeam,
  prescreenPlayer,
  rescreenSeason,
  MINOR_AGE,
  // Exported so the Reference List page can cross-reference LIVE, at read
  // time, instead of relying on a stored field on Player — that way it
  // works for every player regardless of when they were screened, with
  // nothing to backfill when this feature was added after the fact.
  decideFromCandidates,
  norm,
  ageFrom,
};
