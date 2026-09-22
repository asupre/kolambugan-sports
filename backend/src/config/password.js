// src/config/password.js
// Helpers for hashing and checking passwords with bcrypt.
// We NEVER store raw passwords — only the hash.

const crypto = require('crypto');
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

// A Super Admin's one-time-display account-recovery code (see User.recoveryCodeHash).
// Excludes visually-ambiguous characters (0/O, 1/I/L) since this is meant to be
// hand-copied and saved somewhere offline, not typed from a password manager.
const RECOVERY_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateRecoveryCode() {
  const group = () => Array.from({ length: 4 }, () => RECOVERY_CHARSET[crypto.randomInt(RECOVERY_CHARSET.length)]).join('');
  return `${group()}-${group()}-${group()}-${group()}`;
}

module.exports = { hashPassword, comparePassword, generateRecoveryCode };