// Charts for the Barangay Admin Dashboard (Nov 2026, Super Admin request). Plain HTML, no chart
// library. Colours are the `--viz-*` tokens in index.css (light + dark), checked with the
// dataviz validator against the admin card surfaces (#ffffff / #232622): the three status
// colours pass all-pairs CVD separation; aqua is under 3:1 on white, so every chart also prints
// its values as text (legend counts, value labels) and has a screen-reader table.
// Mark rules: bars <= 24px thick, 4px rounded data end, square at the baseline, 2px surface gap
// between touching segments, text in text colours (never the series colour).
import { useRef, useState } from "react";
import { cn } from "../lib/utils";

// ── Hover tooltip shared by every chart ───────────────────────────────────────────────────────
function useTip() {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const show = (e, lines) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, w: box.width, lines });
  };
  const hide = () => setTip(null);
  const node = tip && (
    <div role="presentation"
      className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2.5 py-1.5 text-[12px] text-popover-foreground shadow-md"
      style={{
        left: Math.min(Math.max(tip.x, 70), tip.w - 70), top: tip.y - 10,
        transform: "translate(-50%, -100%)", whiteSpace: "nowrap",
      }}>
      {tip.lines.map((l, i) => <div key={i} className={i === 0 ? "font-medium" : "text-muted-foreground"}>{l}</div>)}
    </div>
  );
  return { ref, show, hide, node };
}

const markHandlers = (tip, lines) => ({
  onPointerEnter: (e) => tip.show(e, lines),
  onPointerMove: (e) => tip.show(e, lines),
  onPointerLeave: tip.hide,
});

function Swatch({ color }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />;
}

function SrTable({ caption, head, rows }) {
  return (
    // Wrapped in a div: a bare `div > table` would make the Card treat the chart as a table and drop its box.
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ChartEmpty({ children }) {
  return <p className="py-6 text-center text-[14px] text-muted-foreground">{children}</p>;
}

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

// ── 1. Players by status: one whole split into parts (segmented bar) ──────────────────────────
export function PlayerStatusChart({ players }) {
  const tip = useTip();
  const parts = [
    { key: "verified", label: "Verified", value: players?.verified || 0, color: "var(--viz-1)" },
    { key: "review", label: "Under review", value: players?.review || 0, color: "var(--viz-2)" },
    { key: "draft", label: "Drafts", value: players?.draft || 0, color: "var(--viz-3)" },
  ];
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return <ChartEmpty>No players yet. Add players to your rosters on My Teams.</ChartEmpty>;
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div ref={tip.ref} className="viz relative">
      <p className="text-[13px] text-muted-foreground">
        <span className="text-[26px] font-semibold leading-none text-foreground">{pct(players.verified, total)}%</span>
        <span className="ml-1.5">of your {total} player{total === 1 ? "" : "s"} are verified</span>
      </p>
      <div className="mt-3 flex h-6 w-full gap-[2px]" aria-hidden="true">
        {shown.map((p, i) => (
          <div key={p.key} {...markHandlers(tip, [p.label, `${p.value} player${p.value === 1 ? "" : "s"} · ${pct(p.value, total)}%`])}
            className={cn("h-full min-w-[6px] cursor-default", i === 0 && "rounded-l-[4px]", i === shown.length - 1 && "rounded-r-[4px]")}
            style={{ flexGrow: p.value, flexBasis: 0, background: p.color }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-[13px] sm:flex-row sm:flex-wrap sm:gap-x-5">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2 whitespace-nowrap">
            <Swatch color={p.color} />
            <span className="text-foreground">{p.label}</span>
            <span className="ml-auto tabular-nums text-muted-foreground sm:ml-0">{p.value} · {pct(p.value, total)}%</span>
          </li>
        ))}
      </ul>
      <SrTable caption="Players by status" head={["Status", "Players", "Share"]}
        rows={parts.map((p) => [p.label, p.value, `${pct(p.value, total)}%`])} />
      {tip.node}
    </div>
  );
}

// ── 2. Players per team: ranked horizontal bars, one series ───────────────────────────────────
export function TeamSizeChart({ teams, sportLine }) {
  const tip = useTip();
  if (!teams?.length) return <ChartEmpty>No teams yet. Register one from My Teams.</ChartEmpty>;
  const rows = [...teams].sort((a, b) => b.playerCount - a.playerCount);
  const max = Math.max(1, ...rows.map((t) => t.playerCount));
  return (
    <div ref={tip.ref} className="viz relative">
      <ul className="space-y-2.5" aria-hidden="true">
        {rows.map((t) => (
          <li key={t.id} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,10rem)_1fr] sm:items-center sm:gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground">{t.name}</p>
              <p className="truncate text-[12px] text-muted-foreground">{sportLine(t)}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                {t.playerCount > 0 ? (
                  <div {...markHandlers(tip, [t.name, `${sportLine(t)} · ${t.playerCount} player${t.playerCount === 1 ? "" : "s"}`])}
                    className="h-4 cursor-default rounded-r-[4px]"
                    style={{ width: `${(t.playerCount / max) * 100}%`, background: "var(--viz-1)" }} />
                ) : (
                  <div className="h-4 border-l-2" style={{ borderColor: "var(--viz-axis)" }} />
                )}
              </div>
              <span className="w-7 shrink-0 text-right text-[13px] tabular-nums text-foreground">{t.playerCount}</span>
            </div>
          </li>
        ))}
      </ul>
      <SrTable caption="Players per team" head={["Team", "Sport", "Players"]}
        rows={rows.map((t) => [t.name, sportLine(t), t.playerCount])} />
      {tip.node}
    </div>
  );
}

// ── 3. Wins and losses by sport: diverging bars (losses left, wins right) ─────────────────────
export function ResultsChart({ results }) {
  const tip = useTip();
  if (!results?.length) return <ChartEmpty>No games played yet. Results show here once your teams play.</ChartEmpty>;
  const max = Math.max(1, ...results.flatMap((r) => [r.wins, r.losses]));
  return (
    <div ref={tip.ref} className="viz relative">
      <ul className="mb-3 flex gap-4 text-[13px]">
        <li className="flex items-center gap-2"><Swatch color="var(--viz-loss)" /> Losses</li>
        <li className="flex items-center gap-2"><Swatch color="var(--viz-win)" /> Wins</li>
      </ul>
      <ul className="space-y-2.5" aria-hidden="true">
        {results.map((r) => (
          <li key={r.sport}>
            <p className="mb-1 text-[13px] font-medium text-foreground">{r.sport}</p>
            {/* Each number sits right at its bar's tip; 2rem of each half is kept for it. */}
            <div className="grid grid-cols-2 items-center">
              <div className="flex h-4 items-center justify-end gap-1.5 border-r pr-[2px]" style={{ borderColor: "var(--viz-axis)" }}>
                <span className="text-[13px] tabular-nums text-muted-foreground">{r.losses}</span>
                {r.losses > 0 && (
                  <div {...markHandlers(tip, [r.sport, `${r.losses} loss${r.losses === 1 ? "" : "es"}`])}
                    className="h-full cursor-default rounded-l-[4px]"
                    style={{ width: `calc((100% - 2rem) * ${r.losses / max})`, background: "var(--viz-loss)" }} />
                )}
              </div>
              <div className="flex h-4 items-center gap-1.5 pl-[2px]">
                {r.wins > 0 && (
                  <div {...markHandlers(tip, [r.sport, `${r.wins} win${r.wins === 1 ? "" : "s"}`])}
                    className="h-full cursor-default rounded-r-[4px]"
                    style={{ width: `calc((100% - 2rem) * ${r.wins / max})`, background: "var(--viz-win)" }} />
                )}
                <span className="text-[13px] tabular-nums text-foreground">{r.wins}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <SrTable caption="Wins and losses by sport" head={["Sport", "Wins", "Losses"]}
        rows={results.map((r) => [r.sport, r.wins, r.losses])} />
      {tip.node}
    </div>
  );
}

// ── 4. Players by age: columns over ordered age bands, one series ─────────────────────────────
export function AgeChart({ ages }) {
  const tip = useTip();
  const total = (ages || []).reduce((n, a) => n + a.count, 0);
  if (!total) return <ChartEmpty>No players yet.</ChartEmpty>;
  const max = Math.max(1, ...ages.map((a) => a.count));
  return (
    <div ref={tip.ref} className="viz relative">
      <div className="flex h-40 items-end gap-2 border-b sm:gap-3" style={{ borderColor: "var(--viz-axis)" }} aria-hidden="true">
        {ages.map((a) => (
          <div key={a.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[12px] tabular-nums text-foreground">{a.count}</span>
            {a.count > 0 && (
              <div {...markHandlers(tip, [a.label, `${a.count} player${a.count === 1 ? "" : "s"} · ${pct(a.count, total)}%`])}
                className="w-full max-w-6 cursor-default rounded-t-[4px]"
                style={{ height: `${(a.count / max) * 80}%`, background: "var(--viz-1)" }} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 sm:gap-3" aria-hidden="true">
        {ages.map((a) => (
          <span key={a.label} className="min-w-0 flex-1 text-center text-[11px] leading-tight text-muted-foreground sm:text-[12px]">{a.label}</span>
        ))}
      </div>
      <SrTable caption="Players by age" head={["Age", "Players"]} rows={ages.map((a) => [a.label, a.count])} />
      {tip.node}
    </div>
  );
}
