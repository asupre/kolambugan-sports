const express = require('express');
const Sport = require('../models/Sport');
const Barangay = require('../models/Barangay');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

router.get('/sports', async (req, res) => {
  const sports = await Sport.find().sort({ name: 1 });
  res.json({ sports });
});

// PATCH /api/sports/divisions — super admin; set which sports run boys/girls brackets.
// body: { divisions: { "<sportId>": true/false, ... } }
router.patch('/sports/divisions', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { divisions } = req.body;
    if (!divisions || typeof divisions !== 'object') {
      return res.status(400).json({ message: 'divisions map is required.' });
    }
    const updates = Object.entries(divisions).map(([sportId, isDivided]) =>
      Sport.updateOne({ _id: sportId }, { $set: { isDivided: !!isDivided } })
    );
    await Promise.all(updates);
    const sports = await Sport.find().sort({ name: 1 });
    res.json({ message: 'Division settings saved.', sports });
  } catch (err) {
    console.error('Save divisions error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

router.get('/barangays', async (req, res) => {
  const barangays = await Barangay.find().sort({ name: 1 });
  res.json({ barangays });
});

module.exports = router;