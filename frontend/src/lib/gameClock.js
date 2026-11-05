// Game clock + overtime in the browser (Nov 2026; server side: backend/src/lib/gameClock.js).
// The server sends a snapshot { remaining, running, periodSeconds } and the page counts down
// from it on its own between refreshes, so the clock moves every second without polling.
import { useEffect, useRef, useState } from "react";

// "7:05", "0:42", "12:00".
export function fmtClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Seconds left right now, ticking while the snapshot says the clock runs. `at` = when the
// snapshot arrived (Date.now()); a new snapshot or `at` restarts the count from it.
export function useClockSeconds(clock, at) {
  const [, setTick] = useState(0);
  const running = !!clock?.running;
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [running, at]);
  if (!clock) return null;
  if (!running) return clock.remaining;
  return Math.max(0, clock.remaining - (Date.now() - (at || Date.now())) / 1000);
}

// Remember when each new clock snapshot arrived (for useClockSeconds).
export function useSnapshotTime(clock) {
  const ref = useRef({ key: null, at: Date.now() });
  const key = clock ? `${clock.remaining}|${clock.running}|${clock.periodSeconds}` : null;
  if (key !== ref.current.key) ref.current = { key, at: Date.now() };
  return ref.current.at;
}

// The current period's name. `n` = 1-based period number; anything past the regulation count is
// an overtime. short: "Q3" / "OT 1"; long: "Quarter 3" / "Overtime 1". Untimed sports call a
// tie-break period a deciding one ("Deciding set").
export function periodName({ n, regulation, label = "period", timed = false, short = false, prefix }) {
  if (n > regulation) {
    const ot = n - regulation;
    if (timed) return short ? `OT ${ot}` : `Overtime ${ot}`;
    return `Deciding ${label}${ot > 1 ? ` ${ot}` : ""}`;
  }
  if (short && prefix) return `${prefix}${n}`;
  return `${label.replace(/^./, (c) => c.toUpperCase())} ${n}`;
}
