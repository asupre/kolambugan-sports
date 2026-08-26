const express = require('express');
const Sport = require('../models/Sport');
const Barangay = require('../models/Barangay');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();
const Team = require('../models/Team');
const { getCurrentSeason } = require('../middleware/season');

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

const ALLOWED_DIVISIONS = ['open', 'boys', 'girls', 'under17', 'under30'];
const ALLOWED_FORMATS = ['team', 'singles', 'doubles'];

// PATCH /api/sports/:id/config — super admin; replaces seedSportConfig.js.
// body: { divisions: ['under17','under30'], entryFormat: 'team' }
router.patch('/sports/:id/config', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const sport = await Sport.findById(req.params.id);
    if (!sport) return res.status(404).json({ message: 'Sport not found.' });

    const divisions = Array.isArray(req.body.divisions) ? [...new Set(req.body.divisions)] : null;
    const entryFormat = req.body.entryFormat;

    if (!divisions || divisions.length === 0) {
      return res.status(400).json({ message: 'Pick at least one division.' });
    }
    const badDivision = divisions.find((d) => !ALLOWED_DIVISIONS.includes(d));
    if (badDivision) return res.status(400).json({ message: `Unknown division "${badDivision}".` });
    if (!ALLOWED_FORMATS.includes(entryFormat)) {
      return res.status(400).json({ message: 'Entry format must be team, singles, or doubles.' });
    }

    // Registered teams were built against the CURRENT config — roster limits come
    // from entryFormat, and each team is pinned to a division. Switching badminton
    // from doubles to singles now would leave 2-player teams in a 1-player sport.
    const season = await getCurrentSeason();
    if (season) {
      const teamCount = await Team.countDocuments({ sport: sport._id, season: season._id });
      const sameDivisions =
        JSON.stringify([...divisions].sort()) === JSON.stringify([...(sport.divisions || [])].sort());
      if (teamCount > 0 && (!sameDivisions || entryFormat !== sport.entryFormat)) {
        return res.status(409).json({
          message: `${teamCount} team(s) are already registered for ${sport.name} this season. Set this up before registration opens, or remove those teams first.`,
        });
      }
    }

    sport.divisions = divisions;
    sport.entryFormat = entryFormat;
    await sport.save();

    res.json({ message: `${sport.name} updated.`, sport });
  } catch (err) {
    console.error('Sport config error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;