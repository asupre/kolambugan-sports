// src/config/password.js
// Helpers for hashing and checking passwords with bcrypt.
// We NEVER store raw passwords — only the hash.

const bcrypt = require('bcryptjs');

// Turn a plain password into a secure hash (for storing).
async function hashPassword(plainPassword) {
  const saltRounds = 10;                  // higher = more secure but slower; 10 is standard
  return await bcrypt.hash(plainPassword, saltRounds);
}

// Check if a plain password matches a stored hash (for login).
async function comparePassword(plainPassword, storedHash) {
  return await bcrypt.compare(plainPassword, storedHash);
}

module.exports = { hashPassword, comparePassword };