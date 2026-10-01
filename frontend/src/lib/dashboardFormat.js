// ---- dates -----------------------------------------------------------------
// All league dates are Philippine dates whatever the viewer's device says.
const PH = "Asia/Manila";

// Formatters are built ONCE: constructing an Intl.DateTimeFormat is expensive, and
// these run for every match on a page (Oct 2026: a per-call formatter stalled the
// public Matches page ~2s on a phone).
const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: PH });
const HM = new Intl.DateTimeFormat("en-GB", { timeZone: PH, hour: "2-digit", minute: "2-digit", hour12: false });

// "2026-09-25" — a stable per-day key for grouping.
export const dayKey = (iso) => DAY_KEY.format(new Date(iso));
export const fmtDay = (iso) =>
  new Date(iso).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: PH });
const manilaHM = (iso) => {
  const parts = HM.formatToParts(new Date(iso));
  return { h: +parts.find((p) => p.type === "hour").value % 24, m: +parts.find((p) => p.type === "minute").value };
};
// A date picked without a time is stored as midnight MANILA (parseManila), and must
// not show a made-up "12:00 AM" — so a time is only shown when it isn't midnight Manila.
// Do NOT also treat midnight UTC as "no time": midnight UTC IS 8:00 AM in Manila, so
// every game really set for 8:00 AM showed as TBD on the public site (Sep 28 2026).
export const hasTime = (iso) => {
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
