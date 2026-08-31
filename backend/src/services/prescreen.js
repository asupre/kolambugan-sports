const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Barangay = require('../models/Barangay');
const ReferenceList = require('../models/ReferenceList');

const MINOR_AGE = 15;

const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

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

// Build the lookup structures once. Shared by the team screen and the single
// player re-screen so both decide by identical rules.
async function buildContext(seasonId) {
  const refs = await ReferenceList.find({ season: seasonId }).lean();

  // Indexed by normalized "lastname|firstname" so each player is ONE hash lookup
  // instead of a linear scan. Keeps screening flat against a 17k-row masterlist.
  const refIndex = new Map();
  for (const r of refs) {
    const key = `${norm(r.lastName)}|${norm(r.firstName)}`;
    if (!refIndex.has(key)) refIndex.set(key, []);
    refIndex.get(key).push(r);
  }

  const brgyByName = {};
  (await Barangay.find().lean()).forEach((b) => { brgyByName[norm(b.name)] = b; });

  return { refIndex, brgyByName };
}

// The decision for ONE player. Returns { status, reason } and writes nothing.
function decide(player, teamBarangay, ctx) {
  const age = ageFrom(player.birthdate);

  // Under 15 can't be on a voters' list at all, so there's nothing to look up.
  if (age !== null && age < MINOR_AGE) {
    return {
      status: 'needs_document',
      reason: `Under ${MINOR_AGE} — needs parental consent and documents`,
    };
  }

  const teamBrgyName = norm(teamBarangay && teamBarangay.name);
  const fn = norm(player.firstName), ln = norm(player.lastName);
  let candidates = ctx.refIndex.get(`${ln}|${fn}`) || [];

  if (candidates.length > 1 && player.birthdate) {
    const exact = candidates.filter((r) => r.birthdate && sameDay(r.birthdate, player.birthdate));
    if (exact.length) candidates = exact;
  }

  if (candidates.length === 0) {
    return {
      status: 'needs_document',
      reason: 'Not found on the reference list — check the spelling, or upload a residency document',
    };
  }

  if (
    candidates.some((r) => teamBrgyName && norm(r.barangay) === teamBrgyName) ||
    !candidates.some((r) => r.barangay)
  ) {
    return { status: 'eligible', reason: '' };
  }

  const home = ctx.brgyByName[norm(candidates[0].barangay)];
  if (home && home.allowsCrossBarangay) return { status: 'eligible', reason: '' };

  return {
    status: 'flagged',
    reason: `Listed under ${candidates[0].barangay}, not ${teamBarangay?.name || 'this barangay'} — cross-barangay not allowed`,
  };
}

// Runs on roster submission. Sets each player's eligibilityStatus, returns a tally.
async function prescreenTeam(team) {
  const teamBarangay = await Barangay.findById(team.barangay);
  const links = await TeamPlayer.find({ team: team._id }).populate('player');
  const players = links.map((l) => l.player).filter(Boolean);

  const ctx = await buildContext(team.season);
  const summary = { eligible: 0, needs_document: 0, flagged: 0 };

  for (const p of players) {
    const { status, reason } = decide(p, teamBarangay, ctx);
    if (p.eligibilityStatus !== status || p.flagReason !== reason) {
      await Player.updateOne({ _id: p._id }, { $set: { eligibilityStatus: status, flagReason: reason } });
    }
    summary[status]++;
  }

  return summary;
}

// Re-screen ONE player after their name or birthdate was corrected. The team is
// needed for the barangay comparison, which is half the decision.
async function prescreenPlayer(player, team) {
  const teamBarangay = await Barangay.findById(team.barangay);
  const ctx = await buildContext(team.season);
  const { status, reason } = decide(player, teamBarangay, ctx);

  await Player.updateOne({ _id: player._id }, { $set: { eligibilityStatus: status, flagReason: reason } });
  return { status, reason };
}

module.exports = { prescreenTeam, prescreenPlayer, MINOR_AGE };