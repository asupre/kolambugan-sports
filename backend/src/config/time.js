// All league dates are Philippine dates. The server's own timezone is an
// accident of where it's hosted — Render runs UTC — so nothing may rely on it.
// PH has no daylight saving, so a fixed +08:00 offset is exact.

const MANILA_OFFSET = '+08:00';

// The Manila calendar day of an instant, as "YYYY-MM-DD" for safe comparison.
function manilaDay(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(d));
}

const isManilaToday = (d) => !!d && manilaDay(d) === manilaDay(new Date());

// Parse a date or datetime that carries no timezone as MANILA time.
// "2026-09-12" and "2026-09-12T14:30" both come from browser inputs with no
// zone attached; read as server-local they'd land 8 hours out in production.
function parseManila(input) {
  if (input === null || input === undefined || input === '') return null;
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00${MANILA_OFFSET}`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) return new Date(`${s}${MANILA_OFFSET}`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = { manilaDay, isManilaToday, parseManila, MANILA_OFFSET };