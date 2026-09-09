// DEV — generates a test reference list CSV for performance testing.
// Run from backend/:  node src/config/makeReferenceCsv.js 17000
//
// Reads the real barangay names from the database so cross-barangay checks work
// against actual data rather than invented names. DELETE BEFORE DEPLOY.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const Barangay = require('../models/Barangay');

const FIRST = [
  'Juan','Jose','Antonio','Pedro','Ricardo','Manuel','Roberto','Carlos','Eduardo','Fernando',
  'Miguel','Rafael','Alfredo','Ernesto','Rodolfo','Danilo','Renato','Arnel','Jerico','Mark',
  'John','Michael','Christian','Angelo','Joshua','Kevin','Ryan','Paolo','Marlon','Dennis',
  'Maria','Ana','Rosa','Carmen','Teresa','Elena','Cristina','Gloria','Luzviminda','Josefina',
  'Grace','Joy','Mary','Angel','Princess','Jessa','Rowena','Mylene','Analyn','Jocelyn',
  'Ariel','Noel','Leo','Kevin','Erwin','Sultan','Omar','Ali','Hassan','Ibrahim',
];

const MIDDLE = ['A','B','C','D','E','F','G','L','M','N','O','P','R','S','T','V'];

const LAST = [
  'Dela Cruz','Santos','Reyes','Ramos','Mercado','Aguilar','Gomez','Lim','Torres','Flores',
  'Bautista','Villanueva','Castro','Rivera','Morales','Gonzales','Fernandez','Lopez','Perez','Sanchez',
  'Aquino','Domingo','Navarro','Salazar','Padilla','Espinosa','Cabrera','Rosales','Alvarez','Mendoza',
  'Abdullah','Macapaar','Balindong','Dimaporo','Alonto','Pangandaman','Mamarinta','Sarip','Usman','Guro',
  'Ocampo','Panganiban','Tolentino','Velasco','Ignacio','Buenaventura','Magbanua','Quijano','Sarmiento','Trinidad',
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Ages spread across the SK range and older, so under-15s and adults both appear.
function birthdate() {
  const year = 1960 + Math.floor(Math.random() * 50);   // 1960–2009
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

(async () => {
  const target = Number(process.argv[2]) || 17000;

  await mongoose.connect(process.env.MONGO_URI);
  const barangays = (await Barangay.find().select('name').lean()).map((b) => b.name);
  await mongoose.disconnect();

  if (barangays.length === 0) {
    console.error('No barangays found — seed them first.');
    process.exit(1);
  }

  const rows = ['first_name,middle_name,last_name,birthdate,barangay'];
  const seen = new Set();

    // 60 first names × 50 surnames is only 3,000 combinations, so a 17k list needs
  // more than the name pools alone can produce. A suffix keeps every entry
  // unique and still lets a tester find a known name to register.
  let n = 0;
  while (rows.length <= target) {
    n += 1;
    const first = pick(FIRST);
    const last = `${pick(LAST)} ${n}`;
    const brgy = pick(barangays);
    rows.push(`${first},${pick(MIDDLE)}.,${last},${birthdate()},${brgy}`);
  }

  const out = path.join(__dirname, '..', '..', 'test-reference-list.csv');
  fs.writeFileSync(out, rows.join('\n'), 'utf8');

  console.log(`Wrote ${rows.length - 1} rows to ${out}`);
  console.log(`Across ${barangays.length} barangays.`);
  console.log('\nFirst few rows:');
  console.log(rows.slice(0, 4).join('\n'));
})();