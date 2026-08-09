const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');
const { hashPassword } = require('./password');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const newPw = 'TestPass123';               // the password you'll use
  const u = await User.findOne({ username: 'sk_federation' });
  if (!u) { console.log('sk_federation not found'); return process.exit(1); }
  u.passwordHash = await hashPassword(newPw);
  u.mustChangePassword = true;
  await u.save();
  console.log(`sk_federation password is now: ${newPw}`);
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });