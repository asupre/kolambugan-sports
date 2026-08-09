// src/config/seedData.js
// The real reference data for Kolambugan: 26 barangays and 7 sports.
// Source: official list — Kolambugan is subdivided into 26 barangays.

// The 10 small/remote barangays allowed to lend players (allowsCrossBarangay = true),
// as confirmed by the SK Federation. The other 16 field their own teams (false).
const barangays = [
  // --- The 10 whitelist barangays (cross-barangay play allowed) ---
  { name: 'Small Banisilon', allowsCrossBarangay: true },
  { name: 'Matampay',        allowsCrossBarangay: true },
  { name: 'Bubong',          allowsCrossBarangay: true },
  { name: 'Pantaon',         allowsCrossBarangay: true },
  { name: 'Inudaran',        allowsCrossBarangay: true },
  { name: 'San Roque',       allowsCrossBarangay: true },
  { name: 'Palao',           allowsCrossBarangay: true },
  { name: 'Santo Niño',      allowsCrossBarangay: true },
  { name: 'Sucodan',         allowsCrossBarangay: true },
  { name: 'Lumbac',          allowsCrossBarangay: true },

  // --- The remaining 16 barangays (field their own teams) ---
  { name: 'Austin Heights',  allowsCrossBarangay: false },
  { name: 'Baybay',          allowsCrossBarangay: false },
  { name: 'Caromatan',       allowsCrossBarangay: false },
  { name: 'Kulasihan',       allowsCrossBarangay: false },
  { name: 'Libertad',        allowsCrossBarangay: false },
  { name: 'Manga',           allowsCrossBarangay: false },
  { name: 'Mukas',           allowsCrossBarangay: false },
  { name: 'Muntay',          allowsCrossBarangay: false },
  { name: 'Pagalungan',      allowsCrossBarangay: false },
  { name: 'Pantar',          allowsCrossBarangay: false },
  { name: 'Poblacion',       allowsCrossBarangay: false },
  { name: 'Rebucon',         allowsCrossBarangay: false },
  { name: 'Riverside',       allowsCrossBarangay: false },
  { name: 'Simbuco',         allowsCrossBarangay: false },
  { name: 'Tabigue',         allowsCrossBarangay: false },
  { name: 'Titunod',         allowsCrossBarangay: false },
];

const sports = [
  { name: 'Basketball',     category: 'physical', tournamentFormat: 'double_elimination' },
  { name: 'Volleyball',     category: 'physical', tournamentFormat: 'double_elimination' },
  { name: 'Badminton',      category: 'physical', tournamentFormat: 'double_elimination' },
  { name: 'Billiards',      category: 'physical', tournamentFormat: 'double_elimination' },
  { name: 'Chess',          category: 'physical', tournamentFormat: 'double_elimination' },
  { name: 'Pickleball',     category: 'physical', tournamentFormat: 'double_elimination' },
  { name: 'Mobile Legends', category: 'esports',  tournamentFormat: 'round_robin' },
];

module.exports = { barangays, sports };