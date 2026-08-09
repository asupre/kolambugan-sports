const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { comparePassword, hashPassword } = require('../config/password');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const TOKEN_EXPIRY = '8h';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in a few minutes.' },
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

module.exports = router;