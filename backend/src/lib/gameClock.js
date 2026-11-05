// src/lib/gameClock.js
// Game clock + overtime (Nov 2026, Super Admin: "they can set time each quarter… we also need
// to overtime it… show the time in the public viewer"). Only TIMED sports have a clock (see
// TIMED in lib/sportRules.js: basketball). The clock counts DOWN one period; the organizer
// starts / pauses it (stoppages) and can correct it. It is stored as a snapshot, so every
// device and the public site compute the same time without the server ticking:
//   match.clock = { periodSeconds, running, startedAt, elapsed }
//   remaining   = periodSeconds - (elapsed + (running ? now - startedAt : 0)), never below 0
// Overtime: match.bestOf stays the REGULATION period count; match.overtimes counts the extra
// periods played to break a tie (bestOf's enum couldn't hold 4 + 2 overtimes).

const totalPeriods = (m) => (m.bestOf || 1) + (m.overtimes || 0);

function clockRemaining(clock, now = Date.now()) {
  if (!clock || !clock.periodSeconds) return null;
  let elapsed = clock.elapsed || 0;
  if (clock.running && clock.startedAt) elapsed += (now - new Date(clock.startedAt).getTime()) / 1000;
  return Math.max(0, clock.periodSeconds - elapsed);
}

// What a browser needs: seconds left (whole), whether it is ticking, the period's length.
function clockView(m, now = Date.now()) {
  const remaining = clockRemaining(m.clock, now);
  if (remaining === null) return null;
  return {
    remaining: Math.ceil(remaining),
    running: !!m.clock.running && remaining > 0,
    periodSeconds: m.clock.periodSeconds,
  };
}

const freshClock = (seconds) => ({ periodSeconds: seconds, running: false, startedAt: null, elapsed: 0 });

// Length of period `n` (1-based): a regulation period, or an overtime.
const periodSecondsFor = (m, n) => ((n > (m.bestOf || 1) ? m.overtimeMinutes : m.periodMinutes) || 0) * 60;

// Stop the clock where it is (banks the running time).
function pauseClock(clock, now = Date.now()) {
  if (!clock || !clock.running) return clock;
  const left = clockRemaining(clock, now);
  return { periodSeconds: clock.periodSeconds, running: false, startedAt: null, elapsed: clock.periodSeconds - left };
}

module.exports = { totalPeriods, clockRemaining, clockView, freshClock, periodSecondsFor, pauseClock };
