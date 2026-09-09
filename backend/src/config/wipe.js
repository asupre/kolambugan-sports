// DEV — wipes season data for a clean end-to-end test run.
// KEEPS users, barangays, and sports. DELETE BEFORE DEPLOY.
// Run:  node src/config/wipe.js --yes
const mongoose = require('mongoose');
require('dotenv').config();

const DROP = [
  'teams', 'players', 'teamplayers', 'documents', 'matches', 'tournaments',
  'seasons', 'referencelists', 'playermatchstats', 'champions', 'siteimages',
  // GridFS buckets — photos, residency documents, champion photos, site
  // imagery, barangay logos. Dropping the collections without these leaves
  // orphaned files taking up space forever.
  'photos.files', 'photos.chunks',
  'documents.files', 'documents.chunks',
  'champions.files', 'champions.chunks',
  'site.files', 'site.chunks',
  'logos.files', 'logos.chunks',
];

(async () => {
  if (!process.argv.includes('--yes')) {
    console.log('This deletes all season data. Re-run with --yes to confirm.');
    process.exit(0);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const existing = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);

  for (const name of DROP) {
    if (!existing.includes(name)) continue;
    await mongoose.connection.db.collection(name).drop();
    console.log(`dropped ${name}`);
  }

  // Barangay logos live on the barangay document, and those survive the wipe.
  await mongoose.connection.db.collection('barangays').updateMany({}, { $set: { logo: null } });
  console.log('cleared barangay logo references');

  console.log('\nKept: users, barangays, sports.');
  await mongoose.disconnect();
})();