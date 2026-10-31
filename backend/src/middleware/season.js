const Season = require('../models/Season');

// The current season is simply the most recently created one. Only one
// non-completed season exists at a time; older completed seasons stay as
// historical records for the champions archive.
async function getCurrentSeason() {
  return Season.findOne().sort({ createdAt: -1 });
}

// Gate a route to specific season states. Attaches the season to req.season.
// e.g. router.post('/rosters', authenticate, authorize('barangay_admin'),
//                   requireSeasonState('registration_open'), handler)
function requireSeasonState(...allowedStates) {
  return async (req, res, next) => {
    try {
      const season = await getCurrentSeason();
      if (!season) {
        return res.status(409).json({ message: 'No active season. This action is unavailable right now.' });
      }
      if (!allowedStates.includes(season.status)) {
        return res.status(409).json({
          message: `This action is only allowed during: ${allowedStates.join(', ')}. The season is currently "${season.status}".`,
        });
      }
      req.season = season; // hand the season to the route handler
      next();
    } catch (err) {
      console.error('Season gate error:', err);
      res.status(500).json({ message: 'Something went wrong.' });
    }
  };
}

// True when the given season (id or doc) is completed, or no longer exists. A
// completed season is the archive: its brackets, results and dates are frozen.
async function seasonEnded(season) {
  if (!season) return false;
  const s = season.status ? season : await Season.findById(season).select('status').lean();
  return !s || s.status === 'completed';
}

module.exports = { getCurrentSeason, requireSeasonState, seasonEnded };