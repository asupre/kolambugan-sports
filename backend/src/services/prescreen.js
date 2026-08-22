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

// Runs on roster submission. Sets each player's eligibilityStatus and returns a tally.
async function prescreenTeam(team) {
  const teamBarangay = await Barangay.findById(team.barangay);
  const teamBrgyName = norm(teamBarangay && teamBarangay.name);

  const links = await TeamPlayer.find({ team: team._id }).populate('player');
  const players = links.map((l) => l.player).filter(Boolean);

   // This season's reference snapshot, loaded once.
  const refs = await ReferenceList.find({ season: team.season }).lean();

  // Index by normalized "lastname|firstname" so each player is ONE hash lookup
  // instead of a linear scan of the whole list. Keeps screening time flat even
  // when the reference list is a 17k-row voters' masterlist.
  const refIndex = new Map();
  for (const r of refs) {
    const key = `${norm(r.lastName)}|${norm(r.firstName)}`;
    if (!refIndex.has(key)) refIndex.set(key, []);
    refIndex.get(key).push(r);
  }

  // Whitelist lookup by normalized barangay name.
  const brgyByName = {};
  (await Barangay.find().lean()).forEach((b) => { brgyByName[norm(b.name)] = b; });

  const summary = { eligible: 0, needs_document: 0, flagged: 0 };

 for (const p of players) {
    let status, reason = "";
    const age = ageFrom(p.birthdate);

    if (age !== null && age < MINOR_AGE) {
      status = 'needs_document';
      reason = `Under ${MINOR_AGE} — needs parental consent and documents`;
    } else {
      const fn = norm(p.firstName), ln = norm(p.lastName);
            let candidates = refIndex.get(`${ln}|${fn}`) || [];

      if (candidates.length > 1 && p.birthdate) {
        const exact = candidates.filter((r) => r.birthdate && sameDay(r.birthdate, p.birthdate));
        if (exact.length) candidates = exact;
      }

      if (candidates.length === 0) {
        status = 'needs_document';
        reason = "Not found on the reference list — needs a residency document";
      } else if (
        candidates.some((r) => teamBrgyName && norm(r.barangay) === teamBrgyName) ||
        !candidates.some((r) => r.barangay)
      ) {
        status = 'eligible';
      } else {
        const home = brgyByName[norm(candidates[0].barangay)];
        if (home && home.allowsCrossBarangay) {
          status = 'eligible';
        } else {
          status = 'flagged';
          reason = `Listed under ${candidates[0].barangay}, not ${teamBarangay?.name || "this barangay"} — cross-barangay not allowed`;
        }
      }
    }

    if (p.eligibilityStatus !== status || p.flagReason !== reason) {
      await Player.updateOne({ _id: p._id }, { $set: { eligibilityStatus: status, flagReason: reason } });
    }
    summary[status]++;
  }

  return summary;
}

module.exports = { prescreenTeam };