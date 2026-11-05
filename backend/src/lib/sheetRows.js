// Reads an uploaded roster / reference-list file into plain rows ({ header: value }), whether it
// is a CSV or an Excel workbook (.xlsx, first sheet). Both uploads (the Super Admin's reference
// list and a barangay's player import) use this, so they accept the same files.
//
// The two files share one column layout (Nov 2026, a panelist: "the Super Admin's format should
// pair with the barangay admin's"): Last name, First name, Middle name, Birthdate, Age, Barangay,
// and the barangay's file adds Jersey no. Headers are still matched loosely by each route.

const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');

const SHARED_COLUMNS = ['Last name', 'First name', 'Middle name', 'Birthdate', 'Age', 'Barangay'];

function isXlsx(file) {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.xlsx')) return true;
  // An .xlsx is a zip: it starts with "PK".
  return file.buffer.length > 2 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b;
}

// "YYYY-MM-DD" from an Excel date cell. Excel dates come back as UTC midnight, so read the
// UTC parts (the local parts would be the day before west of UTC).
function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return ymd(v);
  if (typeof v === 'object') {
    if (v.result !== undefined) return cellText(v.result);          // formula
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return String(v.text);               // hyperlink
    return '';
  }
  return String(v).trim();
}

async function readXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  let headers = null;
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    for (let c = 1; c <= row.cellCount; c++) values.push(cellText(row.getCell(c).value));
    if (!headers) { headers = values; return; }
    if (values.every((v) => v === '')) return;
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = values[i] ?? ''; });
    rows.push(obj);
  });
  return rows;
}

// Returns the rows, or throws an Error whose message is safe to show the user.
async function readSheet(file) {
  // The old Excel 97-2003 format (.xls) starts with D0 CF; it isn't supported.
  if ((file.originalname || '').toLowerCase().endsWith('.xls')
    || (file.buffer.length > 2 && file.buffer[0] === 0xd0 && file.buffer[1] === 0xcf)) {
    throw new Error('This is an old Excel 97-2003 (.xls) file. In Excel, use Save As and pick "Excel Workbook (.xlsx)" or CSV.');
  }
  if (isXlsx(file)) {
    try {
      return await readXlsx(file.buffer);
    } catch {
      throw new Error('Could not read the Excel file. Save it as .xlsx (or .csv) and try again.');
    }
  }
  try {
    return parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch {
    throw new Error('Could not parse the CSV. Check the file format.');
  }
}

module.exports = { readSheet, SHARED_COLUMNS };
