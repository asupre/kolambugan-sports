const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { comparePassword } = require('../utils/password'); // ← confirm path + export name

const router = express.Router();

const TOKEN_EXPIRY = '8h';

// Rate-limit the login endpoint — a decided requirement, and your defense line
// against brute-forcing the provisioned accounts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in a few minutes.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const user = await User.findOne({ username: username.trim() });

    // Same message on both failure paths — no username enumeration.
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const passwordMatches = await comparePassword(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // Payload carries the two scoping keys your RBAC will need:
    // barangay_id for barangay_admin, assigned_sport for organizer.
    const payload = {
      id: user._id,
      role: user.role,
      barangay_id: user.barangay_id || null,
      assigned_sport: user.assigned_sport || null,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    res.json({
      token,
      // Login ALWAYS succeeds regardless of season state (per your lifecycle rule);
      // this flag tells the frontend to route a first-login user to the change-password screen.
      must_change_password: user.must_change_password,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        barangay_id: user.barangay_id || null,
        assigned_sport: user.assigned_sport || null,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;