const express = require('express');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const Document = require('../models/Document');
const Barangay = require('../models/Barangay');
const Sport = require('../models/Sport');
const Match = require('../models/Match');
const ReferenceList = require('../models/ReferenceList');
const { deleteFile } = require('../config/gridfs');
const { decidePlayer, nearMissesFor, looseRegex } = require('../services/prescreen');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');

const router = express.Router();

// Everything here is Super Admin only.
router.use(authenticate, authorize('super_admin'));

// The queue can be READ at any time, but a verdict (approve / reject / verify) is only
// allowed once the season reaches the verification stage — until then rosters are still
// being built and the reference list may still change (Super Admin decision, Sep 2026).
// "Reopen" has its own, stricter check below.
async function requireVerificationStage(req, res, next) {
  try {
    const season = await getCurrentSeason();
    if (!season || season.status !== 'verification') {
      return res.status(409).json({
        message: `The Review Queue is read-only until the season reaches the verification stage. It is currently "${season ? season.status : 'not set up'}".`,
      });
    }
    next();
  } catch (err) {
    console.error('Verification-stage gate error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
}

// GET /api/review/queue — submitted teams awaiting review, with a status tally
// each, PLUS a per-barangay breakdown across all 26 barangays (so the Super
// Admin can pick a barangay to work through instead of scrolling every team
// in the season at once) and a season-wide pending count for a sidebar badge.
router.get('/queue', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ teams: [], barangays: [], totalPending: 0 });

    // A fixed handful of queries, batched — NOT one query per team. This used to
    // loop over every team doing its own roster lookup (+ a populate, + a
    // count for verified ones): ~1-1.7s with only ~34 teams on Atlas, since
    // each round trip pays network latency, and it grew with every team.
    // "Every barangay" so a barangay with nothing submitted yet, or one that's
    // fully verified, still shows up (as empty / cleared) — the picker always
    // lists all 26.
    const [submitted, allBarangays, seasonSports, reopened] = await Promise.all([
      Team.find({ season: season._id, submittedAt: { $ne: null } })
        .populate('barangay', 'name')
        .populate('sport', 'name')
        .lean(),
      Barangay.find().sort({ name: 1 }).lean(),
      Sport.find({ divisions: { $exists: true, $ne: [] } }).select('divisions').lean(),
      // Teams a player was rejected from: reopened for their barangay to add a
      // replacement and resubmit (see requireRosterWindow in routes/team.js). Listed
      // so they don't vanish from the queue while they're being fixed.
      Team.find({ season: season._id, status: 'rejected', submittedAt: null })
        .populate('barangay', 'name')
        .populate('sport', 'name')
        .sort({ updatedAt: 1 })
        .lean(),
    ]);

    const pendingTeams = submitted
      .filter((t) => t.status === 'pending')
      .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
    // Verified teams, so the Super Admin can reopen one for corrections (a
    // verified team is locked for its Barangay Admin, and the queue itself
    // only lists pending teams — without this there was no way back).
    const verifiedTeams = submitted
      .filter((t) => t.status === 'verified')
      .sort((a, b) => a.teamName.localeCompare(b.teamName));

    // ONE query for every roster link, then ONE for the players of the pending
    // teams only (verified teams just need a head count).
    const links = await TeamPlayer.find({ team: { $in: submitted.map((t) => t._id) } })
      .select('team player')
      .lean();
    const playersByTeam = new Map();
    for (const l of links) {
      const k = String(l.team);
      if (!playersByTeam.has(k)) playersByTeam.set(k, []);
      playersByTeam.get(k).push(l.player);
    }
    const pendingPlayerIds = pendingTeams.flatMap((t) => playersByTeam.get(String(t._id)) || []);
    const statusById = new Map(
      (await Player.find({ _id: { $in: pendingPlayerIds } }).select('eligibilityStatus').lean())
        .map((p) => [String(p._id), p.eligibilityStatus])
    );

    const out = pendingTeams.map((t) => {
      const ids = playersByTeam.get(String(t._id)) || [];
      const tally = { eligible: 0, needs_document: 0, flagged: 0, pending: 0 };
      ids.forEach((id) => {
        const s = statusById.get(String(id));
        if (s) tally[s]++;
      });
      return {
        teamId: t._id,
        teamName: t.teamName,
        barangayId: t.barangay && String(t.barangay._id),
        barangay: t.barangay && t.barangay.name,
        sport: t.sport && t.sport.name,
        division: t.division,
        playerCount: ids.length,
        tally,
        needsAttention: tally.flagged + tally.needs_document + tally.pending > 0,
      };
    });

    // "Cleared" means the barangay has a VERIFIED team in every (sport,
    // division) slot this season is actually running — not just that
    // whatever subset it happened to submit is done. Reported directly: a
    // barangay with one verified Chess team was showing "Cleared" even
    // though it hadn't touched the other ~10 sport/division slots. A slot
    // is one per division (Basketball u15 + u30 is 2 slots, Chess Open is
    // 1), NOT multiplied by how many teams a barangay may field in it — a
    // barangay only ever needs ONE team to complete a slot; Mobile
    // Legends's optional 2nd team is a bonus entry, not a second required
    // slot, same as any other sport's second team would be if it had one.
    const requiredSlots = seasonSports.reduce((sum, s) => sum + (s.divisions?.length || 0), 0);

    const statsByBarangay = {};
    submitted.forEach((t) => {
      const key = String(t.barangay && t.barangay._id);
      if (!statsByBarangay[key]) statsByBarangay[key] = { pending: 0, verified: 0, verifiedSlots: new Set() };
      if (t.status === 'verified') {
        statsByBarangay[key].verified++;
        statsByBarangay[key].verifiedSlots.add(`${t.sport && t.sport._id}|${t.division}`);
      } else {
        statsByBarangay[key].pending++; // status 'pending' — the only other state a submitted team can be in
      }
    });

    const barangays = allBarangays.map((b) => {
      const stats = statsByBarangay[String(b._id)] || { pending: 0, verified: 0, verifiedSlots: new Set() };
      const completedSlots = stats.verifiedSlots.size;
      return {
        id: b._id,
        name: b.name,
        pendingTeams: stats.pending,
        verifiedTeams: stats.verified,
        completedSlots,
        requiredSlots,
        cleared: stats.pending === 0 && requiredSlots > 0 && completedSlots >= requiredSlots,
      };
    });

    res.json({
      season: season.name,
      seasonStatus: season.status,
      teams: out,
      verifiedTeams: verifiedTeams.map((t) => ({
        teamId: t._id,
        teamName: t.teamName,
        barangayId: t.barangay && String(t.barangay._id),
        barangay: t.barangay && t.barangay.name,
        sport: t.sport && t.sport.name,
        division: t.division,
        playerCount: (playersByTeam.get(String(t._id)) || []).length,
      })),
      reopenedTeams: reopened.map((t) => ({
        teamId: t._id,
        teamName: t.teamName,
        barangayId: t.barangay && String(t.barangay._id),
        barangay: t.barangay && t.barangay.name,
        sport: t.sport && t.sport.name,
        division: t.division,
      })),
      barangays,
      totalPending: out.length,
    });
  } catch (err) {
    console.error('Review queue error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/review/teams/:teamId — full roster with each player's status, photo,
// and any residency documents they've uploaded, for review.
router.get('/teams/:teamId', async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId)
      .populate('barangay', 'name')
      .populate('sport', 'name');
    if (!team) return res.status(404).json({ message: 'Team not found.' });

    const links = await TeamPlayer.find({ team: team._id }).populate('player');
    // For flagged players, re-run the screening decision LIVE and report WHICH
    // kind of flag it is (cross-barangay violation, or not on the list /
    // possible Dayo). Neither can be approved. Live rather than stored, so it's
    // right for flags saved before this existed, and after a barangay's
    // cross-barangay setting changes (a stale flag that is no longer flagged
    // comes back null, so it isn't blocked).
    const teamBarangay = await Barangay.findById(team.barangay._id);
    const players = await Promise.all(
      links.map((l) => l.player).filter(Boolean).map(async (p) => {
        const docs = await Document.find({ player: p._id })
          .select('docType verifyStatus createdAt')
          .sort({ createdAt: 1 });
        let flagBlock = null;
        if (p.eligibilityStatus === 'flagged') {
          const d = await decidePlayer(p, team, teamBarangay);
          if (d.status === 'flagged') flagBlock = d.code;   // 'cross_barangay' | 'not_on_list'
        }
        // Same-name reference rows that disagree on middle initial/birthdate —
        // the Reference List page's orange near-miss, scoped to just this
        // player, so the generic "not on the list" / "15 or under" reason
        // doesn't hide what's actually a likely typo. Only worth computing for
        // a player who ISN'T a confirmed match: a needs_document minor, or an
        // adult flagged specifically for not being found at all (a
        // cross_barangay flag means they WERE found, just under the wrong
        // barangay's rule, so there's nothing to compare).
        let nearMiss = [];
        if (p.eligibilityStatus === 'needs_document' || flagBlock === 'not_on_list') {
          const candidates = await ReferenceList.find({
            season: team.season,
            lastName: looseRegex(p.lastName),
            firstName: looseRegex(p.firstName),
          }).lean();
          nearMiss = nearMissesFor(p, candidates);
        }
        return { ...p.toObject(), documents: docs, flagBlock, nearMiss };
      })
    );

    res.json({ team, players });
  } catch (err) {
    console.error('Review team error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/review/teams/:teamId/players/:playerId/approve — mark a player eligible.
// Their pending documents are approved in the same action (the Super Admin has
// reviewed the person; the documents were the evidence).
router.post('/teams/:teamId/players/:playerId/approve', requireVerificationStage, async (req, res) => {
  try {
    const link = await TeamPlayer.findOne({ team: req.params.teamId, player: req.params.playerId });
    if (!link) return res.status(404).json({ message: 'That player is not on this team.' });

    // A `needs_document` player has NO reference-list match at all — the only
    // evidence an approval can rest on is a submitted document (an "eligible"
    // player never needed one, and a `flagged` player's issue is the
    // cross-barangay rule, not missing paperwork, so this check is deliberately
    // scoped to needs_document only). Block an approve with nothing to look at.
    const player = await Player.findById(req.params.playerId);
    if (!player) return res.status(404).json({ message: 'Player not found.' });

    // A flagged player can't be approved, of either kind (Super Admin decision,
    // Sep 2026). Checked live, same as the team-detail route, so a stale flag
    // that no longer applies isn't blocked.
    //  - cross_barangay: the team's barangay isn't allowed to field players from
    //    another barangay. Reject, or tick "allow cross-barangay" for it in
    //    League Setup (re-screens the season and clears the flag itself).
    //  - not_on_list: possible Dayo. If the name is just misspelled the
    //    Barangay Admin corrects it (auto re-screen); otherwise reject.
    if (player.eligibilityStatus === 'flagged') {
      const team = await Team.findById(req.params.teamId);
      const d = await decidePlayer(player, team);
      if (d.status === 'flagged') {
        return res.status(409).json({
          message: d.code === 'cross_barangay'
            ? `${d.reason}. This can't be approved — reject the player, or allow cross-barangay players for this barangay in League Setup.`
            : "This player isn't on the reference list (possible Dayo), so they can't be approved. If the name is misspelled, the Barangay Admin can correct it and it will re-screen; otherwise reject the player.",
        });
      }
    }

    if (player.eligibilityStatus === 'needs_document') {
      const docCount = await Document.countDocuments({ player: req.params.playerId });
      if (docCount === 0) {
        return res.status(400).json({
          message: 'This player has no residency document uploaded yet — the Barangay Admin needs to submit one before this player can be approved.',
        });
      }
    }

    // Clear flagReason too — a manual approve overrides whatever the automated
    // pre-screen said (e.g. "15 or under — needs parental consent and documents",
    // "Not found on the reference list…"), so leaving the old reason in place
    // made the Review Queue and player modal keep showing that warning even
    // though the player is now eligible.
    await Player.updateOne({ _id: req.params.playerId }, { $set: { eligibilityStatus: 'eligible', flagReason: '' } });
    await Document.updateMany(
      { player: req.params.playerId, verifyStatus: 'pending' },
      { $set: { verifyStatus: 'approved', reviewedBy: req.user.id, reviewedAt: new Date() } }
    );

    res.json({ message: 'Player approved.', playerId: req.params.playerId, eligibilityStatus: 'eligible' });
  } catch (err) {
    console.error('Approve player error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/review/teams/:teamId/players/:playerId/reject
// Removes the player and EVERYTHING attached (documents + their GridFS files,
// photo file), then reopens the roster so the Barangay Admin can replace them.
router.post('/teams/:teamId/players/:playerId/reject', requireVerificationStage, async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId);
    if (!team) return res.status(404).json({ message: 'Team not found.' });

    const link = await TeamPlayer.findOneAndDelete({ team: team._id, player: req.params.playerId });
    if (!link) return res.status(404).json({ message: 'That player is not on this team.' });

    // Only purge the person if no other team still uses them.
        const otherLinks = await TeamPlayer.countDocuments({ player: req.params.playerId });
    if (otherLinks === 0) {
      const player = await Player.findById(req.params.playerId);
      const docs = await Document.find({ player: req.params.playerId });
      for (const d of docs) await deleteFile('documents', d.file);
      await Document.deleteMany({ player: req.params.playerId });
      if (player?.photo) await deleteFile('photos', player.photo);
      await Player.findByIdAndDelete(req.params.playerId);
    }

    // Reopen the roster.
    team.submittedAt = null;
    team.status = 'rejected';
    await team.save();

    const remaining = await TeamPlayer.countDocuments({ team: team._id });
    res.json({
      message: 'Player rejected and removed, along with their documents and photo. This team is reopened for its barangay only: they can add a replacement and resubmit, and it comes back to this queue when they do.',
      teamStatus: team.status,
      remainingPlayers: remaining,
    });
  } catch (err) {
    console.error('Reject player error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/review/teams/:teamId/verify — finalize a team once everyone is eligible.
router.post('/teams/:teamId/verify', requireVerificationStage, async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId);
    if (!team) return res.status(404).json({ message: 'Team not found.' });
    if (!team.submittedAt) {
      return res.status(409).json({ message: 'This team has not been submitted.' });
    }

    const links = await TeamPlayer.find({ team: team._id }).populate('player');
    const unresolved = links.filter((l) => l.player && l.player.eligibilityStatus !== 'eligible');
    if (unresolved.length) {
      return res.status(400).json({
        message: `Cannot verify: ${unresolved.length} player(s) still need a decision (flagged, needs_document, or pending).`,
      });
    }

    team.status = 'verified';
    await team.save();
    res.json({ message: 'Team verified.', teamId: team._id, status: team.status });
  } catch (err) {
    console.error('Verify team error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/review/teams/:teamId/reopen — undo a verification so the team can be
// corrected. A verified team's player details are locked for the Barangay Admin
// (see PATCH /api/teams/:id/players/:playerId); reopening puts it back to
// 'pending' — it reappears in the queue, the Barangay Admin can edit again, and
// the Super Admin re-verifies afterwards. Only allowed while the season is in
// `verification`. Also blocked once the team is in a match:
// verified teams are what tournaments are built from, so the tournament has to
// be deleted first (same guard as DELETE /api/teams/:id).
router.post('/teams/:teamId/reopen', async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId);
    if (!team) return res.status(404).json({ message: 'Team not found.' });
    if (team.status !== 'verified') {
      return res.status(409).json({ message: 'This team is not verified.' });
    }
    // Only during the verification period — that's what reopening is for.
    // Once the season is ongoing the brackets are drawn and results are being
    // entered, so a verified team is final (Super Admin decision, Sep 2026).
    const season = await getCurrentSeason();
    if (!season || season.status !== 'verification') {
      return res.status(409).json({
        message: `Teams can only be reopened during the verification period. The season is currently "${season ? season.status : 'not set up'}".`,
      });
    }
    const inMatches = await Match.countDocuments({ $or: [{ teamA: team._id }, { teamB: team._id }] });
    if (inMatches > 0) {
      return res.status(409).json({
        message: `${team.teamName} already appears in ${inMatches} match(es), so it can't be reopened. Delete its tournament first.`,
      });
    }
    team.status = 'pending';
    await team.save();
    res.json({ message: `${team.teamName} reopened — it's back in the queue and its Barangay Admin can correct it.`, teamId: team._id, status: team.status });
  } catch (err) {
    console.error('Reopen team error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;