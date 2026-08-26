// src/routes/champion.js
// Past champions. Reads are PUBLIC (the Champions page); writes are super admin.
// Photos live in their own GridFS bucket so a bug in the player-photo path can't
// reach them, and vice versa.

const express = require('express');
const Champion = require('../models/Champion');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadPhoto, putFile, sendFile, deleteFile } = require('../config/gridfs');

const router = express.Router();
const BUCKET = 'champions';

// Trim and coerce the writable fields off a (possibly multipart) body.
function readFields(body) {
  const out = {};
  ['sport', 'division', 'barangay', 'teamName', 'mvp', 'prize', 'notes'].forEach((k) => {
    if (body[k] !== undefined) out[k] = String(body[k]).trim();
  });
  if (body.year !== undefined) out.year = Number(body.year);
  return out;
}

function validate(fields, { partial = false } = {}) {
  const need = (k) => fields[k] !== undefined && fields[k] !== '' && fields[k] !== null;
  if (!partial || fields.year !== undefined) {
    const y = fields.year;
    if (!Number.isInteger(y) || y < 1950 || y > new Date().getFullYear() + 1) {
      return 'Year must be a valid four-digit year.';
    }
  }
  if (!partial) {
    if (!need('sport')) return 'Sport is required.';
    if (!need('barangay')) return 'Barangay is required.';
  }
  return null;
}

// GET /api/champions — PUBLIC. Optional ?sport= and ?year= filters.
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.sport) filter.sport = req.query.sport;
    if (req.query.year) filter.year = Number(req.query.year);

    const champions = await Champion.find(filter).sort({ year: -1, sport: 1 });
    res.json({
      champions: champions.map((c) => ({
        id: c._id,
        year: c.year,
        sport: c.sport,
        division: c.division,
        barangay: c.barangay,
        teamName: c.teamName,
        mvp: c.mvp,
        prize: c.prize,
        notes: c.notes,
        hasPhoto: !!c.photo,
      })),
    });
  } catch (err) {
    console.error('List champions error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/champions/:id/photo — PUBLIC. Serves the proof photo.
router.get('/:id/photo', async (req, res) => {
  try {
    const c = await Champion.findById(req.params.id).select('photo');
    if (!c || !c.photo) return res.status(404).json({ message: 'No photo.' });
    await sendFile(BUCKET, c.photo, res);
  } catch (err) {
    console.error('Champion photo error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST /api/champions — super admin. Accepts JSON, or multipart with a "photo"
// field. multer only intercepts multipart, so a plain JSON body still works.
router.post('/', authenticate, authorize('super_admin'), uploadPhoto.single('photo'), async (req, res) => {
  try {
    const fields = readFields(req.body);
    const bad = validate(fields);
    if (bad) return res.status(400).json({ message: bad });

    const champion = await Champion.create({ ...fields, addedBy: req.user.id });

    if (req.file) {
      champion.photo = await putFile(
        BUCKET, req.file.buffer, `champion-${champion._id}`, req.file.mimetype,
        { champion: String(champion._id) }
      );
      await champion.save();
    }

    res.status(201).json({ message: 'Champion added.', champion });
  } catch (err) {
    console.error('Add champion error:', err);
    res.status(400).json({ message: err.message || 'Could not add the champion.' });
  }
});

// PATCH /api/champions/:id — super admin. Updates fields and/or replaces the photo.
router.patch('/:id', authenticate, authorize('super_admin'), uploadPhoto.single('photo'), async (req, res) => {
  try {
    const champion = await Champion.findById(req.params.id);
    if (!champion) return res.status(404).json({ message: 'Champion not found.' });

    const fields = readFields(req.body);
    const bad = validate(fields, { partial: true });
    if (bad) return res.status(400).json({ message: bad });
    Object.assign(champion, fields);

    if (req.file) {
      const old = champion.photo;
      champion.photo = await putFile(
        BUCKET, req.file.buffer, `champion-${champion._id}`, req.file.mimetype,
        { champion: String(champion._id) }
      );
      if (old) await deleteFile(BUCKET, old);
    }

    await champion.save();
    res.json({ message: 'Champion updated.', champion });
  } catch (err) {
    console.error('Update champion error:', err);
    res.status(400).json({ message: err.message || 'Could not update the champion.' });
  }
});

// DELETE /api/champions/:id — super admin. Removes the record and its photo,
// rather than orphaning the file in GridFS.
router.delete('/:id', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const champion = await Champion.findById(req.params.id);
    if (!champion) return res.status(404).json({ message: 'Champion not found.' });
    if (champion.photo) await deleteFile(BUCKET, champion.photo);
    await Champion.deleteOne({ _id: champion._id });
    res.json({ message: 'Champion removed.' });
  } catch (err) {
    console.error('Delete champion error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;