const express = require('express');
const Sport = require('../models/Sport');
const Barangay = require('../models/Barangay');

const router = express.Router();

router.get('/sports', async (req, res) => {
  const sports = await Sport.find().sort({ name: 1 });
  res.json({ sports });
});

router.get('/barangays', async (req, res) => {
  const barangays = await Barangay.find().sort({ name: 1 });
  res.json({ barangays });
});

module.exports = router;