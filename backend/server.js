// server.js — entry point for the Inter-Barangay Sports League Management System

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.set('trust proxy', 1);

// Middleware
app.use(cors());               // allows the React frontend to call this API
app.use(express.json());       // lets the server read JSON request bodies
app.use('/api/auth', require('./src/routes/auth'));   // ✓ not './routes/auth'
app.use('/api/seasons', require('./src/routes/season'));
app.use('/api/teams', require('./src/routes/team'));
app.use('/api', require('./src/routes/reference'));   // → /api/sports, /api/barangays
app.use('/api/reference-list', require('./src/routes/referenceList'));
app.use('/api/review', require('./src/routes/review'));
app.use('/api/tournaments', require('./src/routes/tournament'));
app.use('/api/stats', require('./src/routes/stats'));
app.use('/api/accounts', require('./src/routes/accounts'));
app.use('/api/organizer', require('./src/routes/organizer'));
app.use('/api/public', require('./src/routes/public'));


// A simple test route so we can confirm the server is alive
app.get('/', (req, res) => {
  res.json({ message: 'Kolambugan Sports League API is running' });
});

// Connect to MongoDB, then start the server
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });