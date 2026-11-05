// The organizer's game clock (Nov 2026; timed sports only, i.e. basketball). Every device on the
// match sees it; only the score keeper (`canControl`) can start / pause / correct it. The time
// ticks locally from the server's snapshot (lib/gameClock.js). When it reaches 0:00 the score
// keeper's screen pauses it on the server, so the stored time stops at 0:00 too.
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Timer } from "lucide-react";
import { Card } from "./ui/card";
import { cn } from "../lib/utils";
import { fmtClock, useClockSeconds, useSnapshotTime } from "../lib/gameClock";

export default function GameClockCard({ clock, period, overtime, canControl, busy, onAction, note, onLiveChange }) {
  const at = useSnapshotTime(clock);
  const left = useClockSeconds(clock, at);
  const [editing, setEditing] = useState(false);
  const [mm, setMm] = useState(0);
  const [ss, setSs] = useState(0);
  const running = !!clock?.running && left > 0;
  const out = left !== null && left <= 0;
  // Tell the scoring screen whether the clock is ticking right now: points only go in then
  // (not before it starts, not paused, not at 0:00).
  useEffect(() => { onLiveChange?.(running); }, [running, onLiveChange]);
  useEffect(() => () => onLiveChange?.(false), [onLiveChange]);
  const maxMin = Math.floor((clock?.periodSeconds || 0) / 60);

  // Time's up: the score keeper's device stops the clock on the server (once per period).
  const stoppedFor = useRef(null);
  useEffect(() => {
    if (!canControl || !clock?.running || left > 0) return;
    const key = `${period}|${clock.periodSeconds}`;
    if (stoppedFor.current === key) return;
    stoppedFor.current = key;
    onAction("pause");
  }, [canControl, clock?.running, left, period, clock?.periodSeconds, onAction]);

  if (!clock) return null;

  function openEdit() {
    const s = Math.ceil(left || 0);
    setMm(Math.floor(s / 60)); setSs(s % 60); setEditing(true);
  }
  async function saveEdit() {
    const seconds = Math.min(mm * 60 + ss, clock.periodSeconds);
    if (await onAction("set", seconds)) setEditing(false);
  }

  const sel = "h-10 rounded-md border border-input bg-background px-2 text-base tabular-nums";
  return (
    <Card className={cn("mb-4 gap-0 p-4", overtime && "border-amber-500/50 bg-amber-500/5")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
          <Timer className="size-4" /> {period}
          {overtime && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">Overtime</span>}
        </span>
        <span className={cn("text-[12px] font-medium", running ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
          {running ? "Clock running" : out ? "Time's up" : "Clock stopped"}
        </span>
      </div>

      <p className={cn("my-2 text-center text-[56px] font-semibold leading-none tabular-nums",
        out ? "text-red-600 dark:text-red-400" : running ? "text-foreground" : "text-muted-foreground")}
        aria-live="off">
        {fmtClock(left)}
      </p>

      {canControl && !editing && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button onClick={() => onAction(running ? "pause" : "start")} disabled={busy || (out && !running)}
            className={cn("flex h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold text-white disabled:opacity-40",
              running ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700")}>
            {running ? <><Pause className="size-4 fill-current" /> Pause clock</> : <><Play className="size-4 fill-current" /> Start clock</>}
          </button>
          <button onClick={openEdit} disabled={busy}
            className="h-12 rounded-xl border px-4 text-sm font-medium hover:bg-accent disabled:opacity-40">
            Set time
          </button>
        </div>
      )}
      {canControl && editing && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <select aria-label="Minutes" className={sel} value={mm} onChange={(e) => setMm(Number(e.target.value))}>
              {Array.from({ length: maxMin + 1 }, (_, i) => i).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-lg text-muted-foreground">:</span>
            <select aria-label="Seconds" className={sel} value={ss} onChange={(e) => setSs(Number(e.target.value))}>
              {Array.from({ length: 60 }, (_, i) => i).map((n) => <option key={n} value={n}>{String(n).padStart(2, "0")}</option>)}
            </select>
            <span className="text-sm text-muted-foreground">left</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setEditing(false)} className="h-10 rounded-lg border text-sm hover:bg-accent">Cancel</button>
            <button onClick={saveEdit} disabled={busy} className="h-10 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              Save time
            </button>
          </div>
        </div>
      )}
      {note && <p className="mt-2 text-center text-xs text-muted-foreground">{note}</p>}
    </Card>
  );
}
