const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { comparePassword, hashPassword, generateRecoveryCode } = require('../config/password');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadPhoto, putFile, sendFile, deleteFile } = require('../config/gridfs');

const router = express.Router();

const TOKEN_EXPIRY = '8h';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in a few minutes.' },
});

// A recovery code is the only factor guarding a password reset, so it gets a
// tighter limit than login (which also has the password itself as a factor).
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const user = await User.findOne({ username: username.trim() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const passwordMatches = await comparePassword(password, user.passwordHash);   // ← passwordHash
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const payload = {
      id: user._id,
      role: user.role,
      barangay: user.barangay || null,               // ← barangay
      assignedSport: user.assignedSport || null,      // ← assignedSport
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    res.json({
      token,
      mustChangePassword: user.mustChangePassword,     // ← mustChangePassword
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        barangay: user.barangay || null,               // ← barangay
        assignedSport: user.assignedSport || null,      // ← assignedSport
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/change-password  (requires a valid token)
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const currentMatches = await comparePassword(currentPassword, user.passwordHash);   // ← passwordHash
    if (!currentMatches) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    const sameAsOld = await comparePassword(newPassword, user.passwordHash);             // ← passwordHash
    if (sameAsOld) {
      return res.status(400).json({ message: 'New password must be different from the current one.' });
    }

    user.passwordHash = await hashPassword(newPassword);   // ← passwordHash
    user.mustChangePassword = false;                        // ← mustChangePassword
    await user.save();

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change-password error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// GET /api/auth/profile — the logged-in account's own profile panel data.
// Never returns the recovery code itself (that's only ever shown once, at
// generation) — just whether one is set, so the panel can say "set" vs "not
// set yet" and prompt Super Admins who haven't made one.
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('username role recoveryCodeSetAt photo');
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    res.json({
      username: user.username,
      role: user.role,
      hasRecoveryCode: !!user.recoveryCodeSetAt,
      recoveryCodeSetAt: user.recoveryCodeSetAt,
      hasPhoto: !!user.photo,
    });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/auth/profile/photo — upload/replace your OWN profile picture.
// Multipart, field name "photo". Same headshot standard as a player photo
// (close-up, plain background), same GridFS bucket ('photos') — a staff
// avatar isn't sensitive the way a residency document is, so it's served
// publicly like a player photo (see GET /users/:id/photo below), not
// blob-fetched with a token.
router.post('/profile/photo', authenticate, uploadPhoto.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No photo uploaded.' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Account not found.' });

    const oldPhoto = user.photo;
    user.photo = await putFile('photos', req.file.buffer, `user-${user._id}`, req.file.mimetype, {
      user: String(user._id),
    });
    await user.save();
    if (oldPhoto) await deleteFile('photos', oldPhoto);   // clean up the replaced one

    res.status(201).json({ message: 'Photo uploaded.' });
  } catch (err) {
    console.error('Profile photo upload error:', err);
    res.status(400).json({ message: err.message || 'Could not upload the photo.' });
  }
});

// DELETE /api/auth/profile/photo — remove your OWN profile picture (back to initials).
router.delete('/profile/photo', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    if (user.photo) {
      await deleteFile('photos', user.photo);
      user.photo = null;
      await user.save();
    }
    res.json({ message: 'Photo removed.' });
  } catch (err) {
    console.error('Profile photo delete error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/auth/users/:id/photo — PUBLIC; serves an account's profile picture
// (any signed-in role, not just Super Admin — the header avatar for everyone
// can use this). Same public-by-design reasoning as a player photo.
router.get('/users/:id/photo', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('photo');
    if (!user || !user.photo) return res.status(404).json({ message: 'No photo.' });
    await sendFile('photos', user.photo, res);
  } catch (err) {
    console.error('Profile photo fetch error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/auth/recovery-code — SUPER ADMIN ONLY (self). Generates a fresh
// account-recovery code, replacing any previous one. Requires the current
// password, same as change-password, since this is just as sensitive — it's
// a second way into the account. The plaintext code is returned exactly ONCE
// in this response; only its bcrypt hash is stored, so it can never be shown
// again. Each Super Admin's code is independent (User.recoveryCodeHash is
// per-account) — regenerating one never touches another admin's code.
router.post('/recovery-code', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { currentPassword } = req.body;
    if (!currentPassword) {
      return res.status(400).json({ message: 'Enter your current password to generate a recovery code.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Account not found.' });

    const matches = await comparePassword(currentPassword, user.passwordHash);
    if (!matches) return res.status(401).json({ message: 'Current password is incorrect.' });

    const code = generateRecoveryCode();
    user.recoveryCodeHash = await hashPassword(code);
    user.recoveryCodeSetAt = new Date();
    await user.save();

    res.json({
      message: 'Recovery code generated. Save it somewhere safe. It will not be shown again.',
      code,
      recoveryCodeSetAt: user.recoveryCodeSetAt,
    });
  } catch (err) {
    console.error('Recovery-code error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/auth/forgot-password — PUBLIC (no token; this IS the "I can't log
// in" path). Resets a Super Admin's password using their recovery code
// instead of their old password. Scoped to super_admin only — a
// barangay_admin/organizer who forgets their password is reset by a Super
// Admin from the Accounts panel; this exists specifically because the Super
// Admins have no one above them to do that for them.
// One-time use: the code is CLEARED on a successful reset, so a leaked code
// can't be replayed — the admin generates a fresh one from their profile
// panel once they're back in.
router.post('/forgot-password', recoveryLimiter, async (req, res) => {
  try {
    const { username, recoveryCode, newPassword } = req.body;
    if (!username || !recoveryCode || !newPassword) {
      return res.status(400).json({ message: 'Username, recovery code, and new password are all required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findOne({ username: username.trim(), role: 'super_admin' });
    // Same generic message whether the username doesn't exist, isn't a Super
    // Admin, has no recovery code set, or the code is wrong — never reveal
    // which one, same reasoning as login's "Invalid username or password."
    const invalid = () => res.status(401).json({ message: 'Invalid username or recovery code.' });
    if (!user || !user.recoveryCodeHash) return invalid();

    const matches = await comparePassword(recoveryCode.trim(), user.recoveryCodeHash);
    if (!matches) return invalid();

    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    user.recoveryCodeHash = null;
    user.recoveryCodeSetAt = null;
    await user.save();

    res.json({ message: 'Password reset. You can now log in with your new password. Generate a new recovery code from your profile once you\'re back in.' });
  } catch (err) {
    console.error('Forgot-password error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;