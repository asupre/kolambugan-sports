// ---- dates -----------------------------------------------------------------
// All league dates are Philippine dates whatever the viewer's device says.
const PH = "Asia/Manila";

// "2026-09-25" — a stable per-day key for grouping.
export const dayKey = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: PH }).format(new Date(iso));
export const fmtDay = (iso) =>
  new Date(iso).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: PH });
const manilaHM = (iso) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: PH, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  return { h: +parts.find((p) => p.type === "hour").value % 24, m: +parts.find((p) => p.type === "minute").value };
};
// A date picked without a time is stored as midnight Manila; showing "12:00 AM"
// for those would be wrong, so a time is only shown when one was actually set.
// Two conventions exist: midnight MANILA (what parseManila stores now) and midnight UTC
// (older data). Both mean "no time set"; checking only one made every date-only match show a
// made-up "12:00 AM" / "8:00 AM".
export const hasTime = (iso) => {
  const x = new Date(iso);
  if (x.getUTCHours() === 0 && x.getUTCMinutes() === 0) return false;
  const { h, m } = manilaHM(iso);
  return h !== 0 || m !== 0;
};
export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: PH });

export const DIVISION_TEXT = { boys: "Boys", girls: "Girls", under15: "Under 15", under30: "Under 30" };
export const divisionLabel = (d) => DIVISION_TEXT[d] || "";

// Width of the left "when" column on match rows — wide enough that "Sun Sep 20"
// and "10:00 AM" stay on one line each.
export const WHEN_W = "w-[5.25rem]";

// "Sep 18, 2026" — a date-only display in Manila time, "—" when there is none.
export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: PH }) : "—";
