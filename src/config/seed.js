// src/config/seed.js
// Run this ONCE to populate the database with barangays, sports, and initial accounts.
// Usage: node src/config/seed.js
// NOTE: this clears existing barangays/sports/users and re-creates them.

const mongoose = require('mongoose');
require('dotenv').config();

const Barangay = require('../models/Barangay');
const Sport = require('../models/Sport');
const User = require('../models/User');
const { hashPassword } = require('./password');
const { barangays, sports } = require('./seedData');

// Generates a random temporary password (letters + numbers, easy to distribute).
function randomPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < length; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    // 1. Clear existing seed data (fresh start)
    await Barangay.deleteMany({});
    await Sport.deleteMany({});
    await User.deleteMany({});
    console.log('Cleared old barangays, sports, and users.');

    // 2. Insert barangays and sports
    const createdBarangays = await Barangay.insertMany(barangays);
    const createdSports = await Sport.insertMany(sports);
    console.log(`Inserted ${createdBarangays.length} barangays and ${createdSports.length} sports.`);

    // We'll collect the generated credentials to print at the end.
    const credentials = [];

    // 3. Create 2 Super Admin accounts (SK Federation + LYDO Head)
    for (const label of ['sk_federation', 'lydo_head']) {
      const pw = randomPassword();
      await User.create({
        username: label,
        passwordHash: await hashPassword(pw),
        role: 'super_admin',
        mustChangePassword: true,
      });
      credentials.push({ username: label, role: 'super_admin', password: pw });
    }

    // 4. Create one Barangay Admin account per barangay
    for (const brgy of createdBarangays) {
      const username = 'brgy_' + brgy.name.toLowerCase().replace(/\s+/g, '_');
      const pw = randomPassword();
      await User.create({
        username,
        passwordHash: await hashPassword(pw),
        role: 'barangay_admin',
        barangay: brgy._id,
        mustChangePassword: true,
      });
      credentials.push({ username, role: 'barangay_admin', password: pw });
    }

    // 5. Create Organizer accounts (one per sport; two for Mobile Legends = 8 total)
    for (const sport of createdSports) {
      const count = sport.name === 'Mobile Legends' ? 2 : 1;
      for (let i = 1; i <= count; i++) {
        const suffix = count > 1 ? `_${i}` : '';
        const username = 'org_' + sport.name.toLowerCase().replace(/\s+/g, '_') + suffix;
        const pw = randomPassword();
        await User.create({
          username,
          passwordHash: await hashPassword(pw),
          role: 'organizer',
          assignedSport: sport._id,
          mustChangePassword: true,
        });
        credentials.push({ username, role: 'organizer', password: pw });
      }
    }

    // 6. Print all credentials so the Super Admin can distribute them
    console.log('\n===== GENERATED ACCOUNTS (distribute these) =====');
    credentials.forEach(c => {
      console.log(`${c.role.padEnd(15)} | ${c.username.padEnd(28)} | ${c.password}`);
    });
    console.log(`\nTotal accounts created: ${credentials.length}`);

    await mongoose.disconnect();
    console.log('\nSeeding complete. Disconnected.');
  } catch (err) {
    console.error('Seeding error:', err.message);
    process.exit(1);
  }
}

seed();