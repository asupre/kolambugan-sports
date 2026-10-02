// src/models/SiteImage.js
// Editable imagery for the public site. A FIXED set of slots, not a media
// library: the Super Admin can replace what's in each slot, but can't add
// slots or move them, because the layout around them is built in code.

const mongoose = require('mongoose');

// The single source of truth for what's editable. The admin panel renders from
// this list, and an upload to any key not in it is rejected.
const SLOTS = [
  // 'hero' removed then restored Sep 2026 — briefly dropped when the Home
  // hero went text-only, then brought back once the user confirmed they
  // actually want a photo behind the bold headline (now rendered as a
  // background layer with a dark gradient over it, not a plain strip).
  { key: 'hero',     label: 'Home banner',      where: 'Behind the home page headline', aspect: 2.2, hint: 'Wide. A dark gradient covers the left side for text. Action/faces on the right read best.' },
  { key: 'league',   label: 'About the league', where: 'Home page, first section',  aspect: 1.6, hint: 'Landscape.' },
  { key: 'barangay', label: 'Kolambugan',       where: 'Home page, second section', aspect: 1.6, hint: 'Landscape: the municipality or a barangay court.' },
  { key: 'about',    label: 'About page',       where: 'Top of the About page',     aspect: 1.6, hint: 'Landscape.' },
];

const siteImageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    file: { type: mongoose.Schema.Types.ObjectId, default: null },
        // Which part of the image survives the crop. A portrait in a wide banner
    // gets centred by default, which lands on the chest rather than the face.
    focal: { type: String, enum: ['top', 'center', 'bottom'], default: 'center' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteImage', siteImageSchema);
module.exports.SLOTS = SLOTS;