// One column layout for BOTH uploads (Nov 2026, a panelist: the Super Admin's reference list
// should pair with the Barangay Admin's player import). Keep in step with
// backend/src/lib/sheetRows.js (SHARED_COLUMNS). Age is optional: the system always works it
// out from the birthdate.
export const SHARED_COLUMNS = ["Last name", "First name", "Middle name", "Birthdate", "Age", "Barangay"];
export const ROSTER_COLUMNS = [...SHARED_COLUMNS, "Jersey no."];

// Downloads an empty CSV with just the header row. The BOM makes Excel open it as UTF-8, so
// "Sto. Niño" survives a round trip.
export function downloadTemplate(columns, filename) {
  const blob = new Blob(["﻿" + columns.join(",") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const SHEET_ACCEPT = ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
