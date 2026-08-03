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

  // Whitelist lookup by normalized barangay name.
  const brgyByName = {};
  (await Barangay.find().lean()).forEach((b) => { brgyByName[norm(b.name)] = b; });

  const summary = { eligible: 0, needs_document: 0, flagged: 0 };

  for (const p of players) {
    let status;
    const age = ageFrom(p.birthdate);

    if (age !== null && age < MINOR_AGE) {
      status = 'needs_document';                    // minors always need parental consent
    } else {
      const fn = norm(p.firstName), ln = norm(p.lastName);
      let candidates = refs.filter((r) => norm(r.firstName) === fn && norm(r.lastName) === ln);

      // Disambiguate same-name people by birthdate when both sides have one.
      if (candidates.length > 1 && p.birthdate) {
        const exact = candidates.filter((r) => r.birthdate && sameDay(r.birthdate, p.birthdate));
        if (exact.length) candidates = exact;
      }

      if (candidates.length === 0) {
        status = 'needs_document';                  // not on the list → possible Dayo / new player
      } else if (
        candidates.some((r) => teamBrgyName && norm(r.barangay) === teamBrgyName) ||
        !candidates.some((r) => r.barangay)
      ) {
        // Their own barangay, OR the list carries no barangay info to check against.
        status = 'eligible';
      } else {
        // Rostered on a barangay the list doesn't show as their home.
        const home = brgyByName[norm(candidates[0].barangay)];
        status = home && home.allowsCrossBarangay ? 'eligible' : 'flagged';
      }
    }

    if (p.eligibilityStatus !== status) {
      await Player.updateOne({ _id: p._id }, { $set: { eligibilityStatus: status } });
    }
    summary[status]++;
  }

  return summary;
}

module.exports = { prescreenTeam };