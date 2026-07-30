// server.js — entry point for the Inter-Barangay Sports League Management System

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());               // allows the React frontend to call this API
app.use(express.json());       // lets the server read JSON request bodies

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