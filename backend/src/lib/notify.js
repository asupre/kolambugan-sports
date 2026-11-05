// src/lib/notify.js
// Writes the Barangay Admin notifications (Nov 2026). Called by routes/season.js whenever the
// season is created, moves on a stage, or is moved back. Edit the wording here.

const Notification = require('../models/Notification');

const STAGE_TEXT = {
  setup: {
    title: (s) => `New season: ${s.name}`,
    body: 'The SK Federation is setting up the league (games, divisions and barangays). Registration opens soon.',
    link: '/brgy/dashboard',
  },
  registration_open: {
    title: () => 'Registration is open',
    body: 'Register your teams, add every player with a photo, then submit each roster to the SK Federation before registration closes.',
    link: '/brgy',
  },
  verification: {
    title: () => 'Registration is closed: verification has started',
    body: 'The SK Federation is now checking the submitted rosters. Watch Verification Status and upload a document for any player who needs one.',
    link: '/brgy/documents',
  },
  ongoing: {
    title: () => 'The tournament has started',
    body: 'Verification is finished and games are being played. Check Matches for your schedule and results.',
    link: '/brgy/matches',
  },
  completed: {
    title: (s) => `${s.name} is completed`,
    body: 'All games are finished. Thank you for taking part. Results and champions stay on the public site.',
    link: '/brgy/matches',
  },
};

const STAGE_LABEL = {
  setup: 'Setup', registration_open: 'Registration', verification: 'Verification', ongoing: 'Ongoing', completed: 'Completed',
};

// Announce the season's current stage to every barangay. `back` = the Super Admin moved it
// back a stage (an accidental "move on"), so the title says so. Never throws: a failed
// notification must not fail the season change itself.
async function notifySeasonStage(season, { back = false } = {}) {
  try {
    const t = STAGE_TEXT[season.status];
    if (!t) return;
    await Notification.create({
      role: 'barangay_admin',
      barangay: null,
      season: season._id,
      kind: 'season',
      stage: season.status,
      title: back ? `Season moved back to ${STAGE_LABEL[season.status]}` : t.title(season),
      body: t.body,
      link: t.link,
    });
  } catch (err) {
    console.error('Notify season stage error:', err);
  }
}

// Self-heal (Nov 2026): a stage change made while the server ran older code (or one whose
// notification failed) was never announced. When a Barangay Admin opens the bell and the
// current season has NO notification for its current stage, post it now. Upsert, so two
// admins opening the bell at once don't both create it: the catch-up carries a unique `key`,
// so the second insert fails with a duplicate-key error, which is ignored.
async function ensureCurrentStageNotified(season) {
  try {
    if (!season || !STAGE_TEXT[season.status]) return;
    const exists = await Notification.exists({ season: season._id, kind: 'season', stage: season.status, barangay: null });
    if (exists) return;
    const t = STAGE_TEXT[season.status];
    await Notification.create({
      role: 'barangay_admin', barangay: null, season: season._id, kind: 'season', stage: season.status,
      title: t.title(season), body: t.body, link: t.link, key: `${season._id}:${season.status}`,
    });
  } catch (err) {
    if (err?.code !== 11000) console.error('Ensure stage notified error:', err);
  }
}

module.exports = { notifySeasonStage, ensureCurrentStageNotified };
