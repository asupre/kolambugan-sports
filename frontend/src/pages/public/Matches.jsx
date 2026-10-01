import { useEffect, useState } from "react";
import { api } from "../../api";
import {
  Panel, PanelSkeleton, SportTabs, Crest, LiveDot,
  matchDateLabel, matchTime, DIVISION_LABEL,
} from "../../components/PublicUI";

// Matches page, reworked Oct 2026 ("should be presentable and easy to understand"):
// Live / Upcoming / Results tabs instead of one long scroll, games grouped by day
// and then by competition (sport · division, with the venue said once), and a
// grid of match cards instead of full-width rows that left most of a desktop empty.

// "2026-09-25" in Manila time — for comparing days, not for display.
const manilaDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(d));

// Quarters in basketball, sets in the rally sports.
const PERIOD_PREFIX = { Basketball: "Q", Volleyball: "S", Badminton: "S", Pickleball: "S" };

const compOf = (m) => `${m.sport} · ${DIVISION_LABEL[m.division] || m.division}`;
const isDone = (m) => m.status === "completed" || m.status === "forfeited";

// "Group A · Winners Round 2", "Semifinals", "3rd place"…
const stageOf = (m) => [m.group ? `Group ${m.group}` : null, m.roundLabel].filter(Boolean).join(" · ");

// Group a list by a key, keeping first-seen order.
function groupBy(list, keyOf) {
  const out = new Map();
  list.forEach((m) => {
    const k = keyOf(m);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(m);
  });
  return [...out.entries()];
}

// ── VS card (Oct 2026, from the Super Admin's "vs sample ui") ──────────────
// [crest] [angled name banner]   time / score   [angled name banner] [crest]
// The banner is a violet→blue gradient cut at a slant on its inner edge, with a
// thin light strip under the name. A finished game's loser gets a grey banner.

// Slant on the edge that faces the centre.
const CLIP = {
  left: "polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)",
  right: "polygon(0 0, 100% 0, 100% 100%, 14px 100%)",
};

function Banner({ team, side, tone }) {
  const right = side === "right";
  const empty = !team;
  const bg = empty
    ? "bg-[#1D184F]"
    : tone === "lose"
    ? "bg-gradient-to-r from-[#3A3560] to-[#2B2852]"
    : right
    ? "bg-gradient-to-l from-[#9D3DF5] to-[#3B5BDB]"
    : "bg-gradient-to-r from-[#9D3DF5] to-[#3B5BDB]";
  return (
    <div className="flex-1 min-w-0" style={{ clipPath: CLIP[side] }}>
      <div className={`${bg} ${right ? "pl-5 pr-3 text-right" : "pl-3 pr-5"} py-2 sm:py-2.5`}>
        <div className={`text-[13px] sm:text-[15px] leading-tight line-clamp-2 break-words ${
          empty ? "text-slate-500 italic font-medium" : `font-bold uppercase tracking-wide ${tone === "lose" ? "text-slate-300" : "text-white"}`
        }`}>
          {team ? team.name : "Awaiting opponent"}
        </div>
      </div>
      <div className={`h-1 ${empty ? "bg-[#2B2566]" : tone === "lose" ? "bg-slate-500/40" : "bg-white/70"}`} />
    </div>
  );
}

function Side({ team, side, tone }) {
  const right = side === "right";
  return (
    <div className={`flex items-center gap-2 sm:gap-3 min-w-0 ${right ? "flex-row-reverse" : ""}`}>
      <div className={`relative shrink-0 ${tone === "lose" ? "opacity-60 grayscale" : ""}`}>
        {team ? (
          <Crest name={team.name} barangayId={team.barangayId} size={44} />
        ) : (
          <span className="block size-[44px] rounded border border-dashed border-[#3B3482]" />
        )}
        {tone === "win" && (
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded px-1 text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-[#0E0B2F]">
            Won
          </span>
        )}
      </div>
      <Banner team={team} side={side} tone={tone} />
    </div>
  );
}

// One game. `showComp` adds the sport/division line (used where cards aren't
// already under a competition heading, i.e. the Live tab).
function MatchCard({ m, showComp = false, showDate = false }) {
  const live = m.status === "ongoing";
  const done = isDone(m);
  const aWon = done && m.winner && String(m.winner) === String(m.teamA?.id);
  const bWon = done && m.winner && String(m.winner) === String(m.teamB?.id);
  const tone = (won, other) => (won ? "win" : other ? "lose" : null);
  const time = matchTime(m.schedule);
  const scoreTone = (won, lost) => (won ? "text-emerald-400" : lost ? "text-red-400" : "text-white");

  return (
    <div className={`rounded-xl border bg-[#161241]/80 px-3 sm:px-4 pt-3 pb-3.5 ${live ? "border-red-500/50" : "border-[#2B2566]"}`}>
      <div className="flex items-center justify-between gap-3 mb-2.5 text-[12px]">
        <span className="text-slate-400 truncate min-w-0">
          {[showComp ? compOf(m) : null, stageOf(m)].filter(Boolean).join(" · ")}
        </span>
        {showComp && m.venue && <span className="text-slate-500 shrink-0">{m.venue}</span>}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
        <Side team={m.teamA} side="left" tone={tone(aWon, bWon)} />

        <div className="text-center min-w-[64px] sm:min-w-[92px]">
          {live || done ? (
            <div className="text-[24px] sm:text-[30px] font-bold tabular-nums leading-none" style={{ fontFamily: "Anton, sans-serif" }}>
              <span className={done ? scoreTone(aWon, bWon) : "text-white"}>{m.scoreA}</span>
              <span className="text-slate-500 mx-1">:</span>
              <span className={done ? scoreTone(bWon, aWon) : "text-white"}>{m.scoreB}</span>
            </div>
          ) : (
            <div className={`text-[24px] sm:text-[30px] leading-none tabular-nums ${time ? "text-white" : "text-slate-400 text-[18px] sm:text-[20px]"}`}
              style={{ fontFamily: "Anton, sans-serif" }}>
              {time || "TBA"}
            </div>
          )}
          <div className="mt-1.5 text-[11px] sm:text-[12px] font-semibold uppercase tracking-wide">
            {live ? (
              <span className="inline-flex items-center gap-1 text-red-400">
                <LiveDot />
                {m.totalPeriods > 1 ? `${PERIOD_PREFIX[m.sport] || "P"}${Math.min(m.periodsPlayed + 1, m.totalPeriods)}` : "Live"}
              </span>
            ) : done ? (
              <span className="text-slate-400">
                {m.status === "forfeited" ? "Forfeit" : "Final"}
                {showDate && m.schedule ? ` · ${matchDateLabel(m.schedule)}` : ""}
              </span>
            ) : (
              <span className="text-[#A855F7]">VS</span>
            )}
          </div>
        </div>

        <Side team={m.teamB} side="right" tone={tone(bWon, aWon)} />
      </div>
      {(live || done) && m.periods?.length > 1 && (
        <div className="text-center text-slate-500 text-[12px] mt-3 tabular-nums">
          {m.periods.map((p) => `${p.a}-${p.b}`).join("  ·  ")}
        </div>
      )}
    </div>
  );
}

const GRID = "grid grid-cols-1 xl:grid-cols-2 gap-3";

// A competition's games under one heading; the venue is said once when every
// game shares it. Long lists open six at a time.
function CompetitionBlock({ comp, list, showDate = false, initial = 6 }) {
  const [open, setOpen] = useState(false);
  const venues = [...new Set(list.map((m) => m.venue).filter(Boolean))];
  const shared = venues.length === 1 ? venues[0] : null;
  const shown = open ? list : list.slice(0, initial);
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-2.5">
        <h3 className="text-slate-100 text-[15px] font-semibold">{comp}</h3>
        <span className="text-slate-500 text-[13px]">
          {[`${list.length} ${list.length === 1 ? "game" : "games"}`, shared].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div className={GRID}>
        {shown.map((m) => (
          <MatchCard key={m.id} m={m} showDate={showDate} />
        ))}
      </div>
      {list.length > initial && (
        <button
          onClick={() => setOpen(!open)}
          className="mt-2.5 text-[14px] font-medium text-[#A855F7] hover:text-[#C084FC] transition"
        >
          {open ? "Show less" : `Show all ${list.length} games`}
        </button>
      )}
    </div>
  );
}

// A day: a date heading, then each competition playing that day.
function DayBlock({ label, list, note, showDate }) {
  const byTime = (a, b) => new Date(a.schedule || 0) - new Date(b.schedule || 0) || (a.group || "").localeCompare(b.group || "");
  return (
    <section className="mb-7">
      <div className="flex items-baseline gap-2.5 border-b border-[#2B2566] pb-2 mb-4">
        <h2 className="text-slate-100 text-[18px] font-semibold">{label}</h2>
        {note && <span className="text-slate-500 text-[13px]">{note}</span>}
      </div>
      {groupBy([...list].sort((a, b) => compOf(a).localeCompare(compOf(b))), compOf).map(([comp, games]) => (
        <CompetitionBlock key={comp} comp={comp} list={[...games].sort(byTime)} showDate={showDate} />
      ))}
    </section>
  );
}

function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-[#2B2566] bg-[#161241] p-1 mb-6 max-w-full overflow-x-auto">
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={`flex items-center gap-2 shrink-0 rounded-md px-4 py-2 text-[15px] font-medium transition ${
              on ? "bg-[#2B2566] text-slate-50" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.live && <LiveDot />}
            {t.label}
            <span className={`tabular-nums text-[13px] ${on ? "text-[#A855F7]" : "text-slate-500"}`}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [sports, setSports] = useState([]);
  const [sport, setSport] = useState("");
  // null = pick automatically; ?tab=results (or live / upcoming) opens that tab.
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/public/tournaments")
      .then((d) => setSports([...new Set((d.tournaments || []).map((t) => t.sport))].sort()))
      .catch(() => setSports([]));
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api(`/api/public/matches${sport ? `?sport=${encodeURIComponent(sport)}` : ""}`)
        .then((d) => { if (alive) setMatches(d.matches || []); })
        .catch(() => { if (alive) setMatches([]); })
        .finally(() => { if (alive) setLoading(false); });
    load();
    const timer = setInterval(load, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, [sport]);

  // An empty bracket slot is not a fixture. Hide matches with no teams yet.
  const real = matches.filter((m) => m.teamA || m.teamB);

  const live = real.filter((m) => m.status === "ongoing");
  const scheduled = real.filter((m) => m.status === "scheduled");
  const today = manilaDay(new Date());
  // Today and later = what's coming up. A game dated in the past that was never
  // started isn't "upcoming" — it goes under "Waiting for a result".
  const upcoming = scheduled.filter((m) => m.schedule && manilaDay(m.schedule) >= today);
  const overdue = scheduled.filter((m) => m.schedule && manilaDay(m.schedule) < today);
  const undated = scheduled.filter((m) => !m.schedule);
  const done = real.filter(isDone);

  const byDay = (list) =>
    groupBy([...list].sort((a, b) => new Date(a.schedule) - new Date(b.schedule)), (m) => manilaDay(m.schedule));

  const tabs = [
    live.length > 0 && { value: "live", label: "Live", count: live.length, live: true },
    { value: "upcoming", label: "Upcoming", count: upcoming.length + undated.length + overdue.length },
    { value: "results", label: "Results", count: done.length },
  ].filter(Boolean);
  // Open on Live when something is on; fall back if the chosen tab disappears
  // (a live game ended).
  const current = tabs.some((t) => t.value === tab) ? tab : live.length > 0 ? "live" : "upcoming";

  const dayLabel = (day, list) => {
    const label = matchDateLabel(list[0].schedule);
    return day === today ? `Today · ${label}` : label;
  };

  return (
    <>
      <h1 className="text-slate-100 text-[28px] font-semibold tracking-tight mb-4">Matches</h1>

      <SportTabs sports={sports} value={sport} onChange={setSport} />

      {loading ? (
        <>
          <PanelSkeleton rows={2} />
          <PanelSkeleton rows={5} />
        </>
      ) : real.length === 0 ? (
        <Panel empty="No games scheduled yet. The schedule appears here once teams are verified and the brackets are drawn." />
      ) : (
        <>
          <Tabs tabs={tabs} value={current} onChange={setTab} />

          {current === "live" && (
            <div className={GRID}>
              {live.map((m) => <MatchCard key={m.id} m={m} showComp />)}
            </div>
          )}

          {current === "upcoming" && (
            <>
              {upcoming.length === 0 && undated.length === 0 && overdue.length === 0 && (
                <Panel empty="No games coming up." />
              )}
              {byDay(upcoming).map(([day, list]) => (
                <DayBlock key={day} label={dayLabel(day, list)} list={list}
                  note={`${list.length} ${list.length === 1 ? "game" : "games"}`} />
              ))}
              {undated.length > 0 && (
                <DayBlock label="Date to be announced" list={undated}
                  note={`${undated.length} ${undated.length === 1 ? "game" : "games"}`} />
              )}
              {overdue.length > 0 && (
                <DayBlock label="Waiting for a result" list={overdue}
                  note="Scheduled on an earlier day, not played or recorded yet" showDate />
              )}
            </>
          )}

          {current === "results" && (
            done.length === 0 ? (
              <Panel empty="No results yet." />
            ) : (
              <>
                {/* Most recent day first — a results feed reads backwards. */}
                {byDay(done.filter((m) => m.schedule)).reverse().map(([day, list]) => (
                  <DayBlock key={day} label={dayLabel(day, list)} list={list}
                    note={`${list.length} ${list.length === 1 ? "result" : "results"}`} />
                ))}
                {done.some((m) => !m.schedule) && (
                  <DayBlock label="Undated" list={done.filter((m) => !m.schedule)} />
                )}
              </>
            )
          )}
        </>
      )}
    </>
  );
}
