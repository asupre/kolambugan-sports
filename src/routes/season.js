const express = require('express');
const Season = require('../models/Season');
const { authenticate, authorize } = require('../middleware/auth');
const { getCurrentSeason } = require('../middleware/season');

const router = express.Router();

// The only legal forward transitions — one step at a time, never backward.
const NEXT_STATE = {
  setup: 'registration_open',
  registration_open: 'verification',
  verification: 'ongoing',
  ongoing: 'completed',
  completed: null, // terminal
};

// GET /api/seasons/current  — public; the dashboard needs to know the state.
router.get('/current', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) {
      return res.status(404).json({ message: 'No season has been created yet.' });
    }
    res.json({ season });
  } catch (err) {
    console.error('Get current season error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/seasons  — super admin creates a new season (starts in 'setup').
router.post('/', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Season name is required.' });
    }

    // Block a new season while an existing one hasn't finished.
    const latest = await getCurrentSeason();
    if (latest && latest.status !== 'completed') {
      return res.status(409).json({
        message: `A season ("${latest.name}") is still active (${latest.status}). Complete it before starting a new one.`,
      });
    }

    const season = await Season.create({
      name: name.trim(),
      status: 'setup',
      openedBy: req.user.id,
      openedAt: new Date(),
    });

    res.status(201).json({ season });
  } catch (err) {
    console.error('Create season error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/seasons/:id/advance  — super admin moves the season one step forward.
router.post('/:id/advance', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const season = await Season.findById(req.params.id);
    if (!season) {
      return res.status(404).json({ message: 'Season not found.' });
    }

    const next = NEXT_STATE[season.status];
    if (!next) {
      return res.status(400).json({ message: 'This season is already completed and cannot advance.' });
    }

    // Optional safety: the client can send the state it THINKS comes next.
    // If it doesn't match, refuse — stops a stale admin screen from
    // accidentally skipping a state (e.g. jumping past verification).
    const { expectedNext } = req.body;
    if (expectedNext && expectedNext !== next) {
      return res.status(409).json({
        message: `Season is "${season.status}"; the next state is "${next}", not "${expectedNext}". Refresh and try again.`,
      });
    }

    season.status = next;
    if (next === 'completed') {
      season.closedAt = new Date();
    }
    await season.save();

    res.json({ season });
  } catch (err) {
    console.error('Advance season error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;