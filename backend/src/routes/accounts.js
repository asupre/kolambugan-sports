const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const Barangay = require('../models/Barangay');
const Sport = require('../models/Sport');
const { hashPassword } = require('../config/password');
const { authenticate, authorize } = require('../middleware/auth');
const Tournament = require('../models/Tournament');
const { getCurrentSeason } = require('../middleware/season');

const router = express.Router();

// Every route in this file is Super Admin only.
router.use(authenticate, authorize('super_admin'));

// A cryptographically-random 10-char temp password. No ambiguous characters
// (0/O/1/l/I) so it's easy to read off a screen and retype. NEVER a predictable
// pattern like the barangay name — one formula must not crack all 26 accounts.
function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// Turn a barangay/sport name into a username slug. Usernames are NOT secrets.
function slugUsername(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
}

// GET /api/accounts?role=  — list accounts (never returns password hashes).
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    const accounts = await User.find(filter)
      .select('username role mustChangePassword barangay assignedSport createdAt')
      .populate('barangay', 'name')
      .populate('assignedSport', 'name')
      .sort({ role: 1, username: 1 });
    res.json({ accounts });
  } catch (err) {
    console.error('List accounts error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/accounts  — provision ONE account. Returns the temp password ONCE.
// body: { role, username?, barangayId?, assignedSportId? }
const MAX_SUPER_ADMINS = 2;

router.post('/', async (req, res) => {
  try {
    let { username, role, barangayId, assignedSportId } = req.body;
    if (!['super_admin', 'barangay_admin', 'organizer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' });
    }

    // At most TWO Super Admin accounts (Oct 31 2026, Super Admin rule): the SK Federation and
    // the Head of LYDO.
    if (role === 'super_admin' && await User.countDocuments({ role: 'super_admin' }) >= MAX_SUPER_ADMINS) {
      return res.status(409).json({ message: `There can only be ${MAX_SUPER_ADMINS} Super Admin accounts.` });
    }

    let barangay = null;
    let assignedSport = null;

    if (role === 'barangay_admin') {
      if (!barangayId) return res.status(400).json({ message: 'A barangay is required for a barangay admin.' });
      const b = await Barangay.findById(barangayId);
      if (!b) return res.status(404).json({ message: 'Barangay not found.' });
      if (await User.findOne({ role: 'barangay_admin', barangay: b._id })) {
        return res.status(409).json({ message: `${b.name} already has a barangay admin.` });
      }
      barangay = b._id;
      if (!username) username = slugUsername(b.name);
    }

    if (role === 'organizer') {
      if (!assignedSportId) return res.status(400).json({ message: 'A sport is required for an organizer.' });
      const s = await Sport.findById(assignedSportId);
      if (!s) return res.status(404).json({ message: 'Sport not found.' });
      if (await User.findOne({ role: 'organizer', assignedSport: s._id })) {
        return res.status(409).json({ message: `${s.name} already has an organizer.` });
      }
      assignedSport = s._id;
      if (!username) username = 'organizer.' + slugUsername(s.name);
    }

    if (!username) return res.status(400).json({ message: 'A username is required.' });
    username = username.trim();
    if (await User.findOne({ username })) {
      return res.status(409).json({ message: `Username "${username}" is already taken.` });
    }

    const tempPassword = generateTempPassword();
    const user = await User.create({
      username,
      passwordHash: await hashPassword(tempPassword),
      role,
      barangay,
      assignedSport,
      mustChangePassword: true,
    });

    res.status(201).json({
      account: { id: user._id, username: user.username, role: user.role, mustChangePassword: true },
      tempPassword,   // shown ONCE — cannot be retrieved later (hashes are one-way)
    });
  } catch (err) {
    console.error('Create account error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/accounts/:id/reset-password — new temp password, forces change on next login.
// Super Admins can reset each other's passwords at any time (Oct 31 2026, Super Admin rule;
// replaces "only until they've set their own").
router.post('/:id/reset-password', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    const tempPassword = generateTempPassword();
    user.passwordHash = await hashPassword(tempPassword);
    user.mustChangePassword = true;
    await user.save();
    res.json({ username: user.username, tempPassword });   // shown ONCE
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/accounts/provision-all — create any MISSING barangay-admin (one per
// barangay) and organizer (one per sport) accounts. Returns every new credential
// ONCE so the Super Admin can copy the whole list for distribution.
router.post('/provision-all', async (req, res) => {
  try {
    const [barangays, sports] = await Promise.all([
      Barangay.find().select('name'),
      Sport.find().select('name'),
    ]);

    const makeUnique = async (base) => {
      let u = base, n = 1;
      while (await User.findOne({ username: u })) { n++; u = `${base}${n}`; }
      return u;
    };

    const created = [];

    for (const b of barangays) {
      if (await User.findOne({ role: 'barangay_admin', barangay: b._id })) continue;
      const username = await makeUnique(slugUsername(b.name));
      const tempPassword = generateTempPassword();
      await User.create({
        username, passwordHash: await hashPassword(tempPassword),
        role: 'barangay_admin', barangay: b._id, mustChangePassword: true,
      });
      created.push({ role: 'barangay_admin', label: b.name, username, tempPassword });
    }

    for (const s of sports) {
      if (await User.findOne({ role: 'organizer', assignedSport: s._id })) continue;
      const username = await makeUnique('organizer.' + slugUsername(s.name));
      const tempPassword = generateTempPassword();
      await User.create({
        username, passwordHash: await hashPassword(tempPassword),
        role: 'organizer', assignedSport: s._id, mustChangePassword: true,
      });
      created.push({ role: 'organizer', label: s.name, username, tempPassword });
    }

    res.status(201).json({
      created,
      message: created.length
        ? `Provisioned ${created.length} account(s). Copy these credentials now. Passwords can't be shown again.`
        : 'All barangays and sports already have accounts.',
    });
  } catch (err) {
    console.error('Provision-all error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
const Match = require('../models/Match');

// DELETE /api/accounts/:id — remove an account. Blocked if it entered results in the running
// season, if it's the last super admin, or if it's ANOTHER super admin's account (Oct 31 2026:
// a Super Admin deletes only their own; reverses the Sep 2026 "never yourself" rule).
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Account not found.' });

    // Super Admin accounts (Oct 31 2026, Super Admin rule): a Super Admin may delete ONLY their
    // own Super Admin account, never a peer's. Barangay admin / organizer accounts are unchanged.
    if (user.role === 'super_admin' && String(user._id) !== String(req.user.id)) {
      return res.status(409).json({ message: "A Super Admin account can only be deleted by its owner. You can reset its password instead." });
    }

    // Don't let the system be left with zero super admins.
    if (user.role === 'super_admin') {
      const supers = await User.countDocuments({ role: 'super_admin' });
      if (supers <= 1) return res.status(409).json({ message: 'Cannot delete the last super admin.' });
    }

    // Audit trail (revised Oct 2026, Super Admin rule). Results this account entered in the
    // CURRENT season, while that season is still running, are live: no delete (reset its
    // password to hand the sport to someone else). Once the season is completed, or a newer
    // season exists, it can be deleted.
    // Results from PAST seasons don't block it any more (an organizer from a finished season
    // used to be undeletable forever): their username is copied onto those matches first,
    // so every result still names who entered it.
    const season = await getCurrentSeason();
    const running = season && season.status !== 'completed';
    const currentT = running ? await Tournament.find({ season: season._id }).distinct('_id') : [];
    const scoredNow = await Match.countDocuments({ enteredBy: user._id, tournament: { $in: currentT } });
    if (scoredNow > 0) {
      return res.status(409).json({
        message: `${user.username} has entered ${scoredNow} result(s) this season, so it can't be deleted until the season is over. To give the sport to someone else, use Reset password instead.`,
      });
    }

    const kept = await Match.updateMany(
      { enteredBy: user._id },
      { $set: { enteredByName: user.username } }
    );
    await User.deleteOne({ _id: user._id });
    res.json({
      message: `Account "${user.username}" deleted.` + (kept.modifiedCount
        ? ` Its ${kept.modifiedCount} result(s) from past seasons still show "${user.username}" as who entered them.`
        : ''),
    });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;