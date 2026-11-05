// src/lib/crossTerms.js
// Registration gate for the league terms and conditions (Nov 2026, Super Admin): EVERY
// barangay may register teams and players only once its Barangay Admin has ACCEPTED the
// terms. Declined = registration closed for that barangay until the Super Admin presses
// "Ask again" and it accepts. Not answered yet = closed too (the pop-up asks on every page
// until they answer, so this only matters if someone goes around it).
// (Named "cross" because it started as cross-barangay-only terms; it now covers everyone.)

const Barangay = require('../models/Barangay');

// Returns the refusal message, or null when registration is allowed.
async function crossTermsBlock(barangayId) {
  if (!barangayId) return null;
  const b = await Barangay.findById(barangayId).select('name crossTerms').lean();
  if (!b) return null;
  const status = b.crossTerms?.status || null;
  if (status === 'accepted') return null;
  if (status === 'declined') {
    return `Registration is closed for ${b.name} because the league terms and conditions were declined. Contact the SK Federation if you want to be asked again.`;
  }
  return `Please accept the league terms and conditions first. They open when you load any page.`;
}

// Express middleware for barangay-admin registration routes (other roles pass).
async function requireCrossTerms(req, res, next) {
  try {
    if (req.user?.role !== 'barangay_admin') return next();
    const msg = await crossTermsBlock(req.user.barangay);
    if (msg) return res.status(403).json({ message: msg, code: 'cross_terms' });
    next();
  } catch (err) {
    console.error('Cross terms check error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
}

module.exports = { crossTermsBlock, requireCrossTerms };
