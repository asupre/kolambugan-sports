import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import {
  Panel, SportTabs, LiveDot, matchDateLabel, DIVISION_LABEL,
} from "../../components/PublicUI";
import { VsMatchList, VsMatchSkeleton } from "../../components/VsMatch";

// Days are drawn a few at a time: the Upcoming tab can hold 200+ games, and
// rendering every day at once froze a phone for ~2s on each sport switch.
const DAYS_STEP = 2;

// Matches page, reworked Oct 2026 ("should be presentable and easy to understand"):
// Live / Upcoming / Results tabs instead of one long scroll, games grouped by day
// and then by competition (sport · division, with the venue said once). Each game
// is one VS row (components/VsMatch.jsx), one per line like the Super Admin's sample.

// "2026-09-25" in Manila time — for comparing days, not for display.
// The formatter is built ONCE — creating one per call (it runs several times per
// match, ~400 matches) was the ~2s freeze on a phone when switching sport.
const MANILA_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });
const manilaDay = (d) => MANILA_DAY.format(new Date(d));


const compOf = (m) => `${m.sport} · ${DIVISION_LABEL[m.division] || m.division}`;
const isDone = (m) => m.status === "completed" || m.status === "forfeited";


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


// A competition's games under one heading. Long lists open four at a time.
// (The venue is NOT in the heading — every VS row shows it under the time.)
function CompetitionBlock({ comp, list, showDate = false, initial = 4 }) {
  const [open, setOpen] = useState(false);
  const shown = open ? list : list.slice(0, initial);
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-2.5">
        <h3 className="text-slate-100 text-[15px] font-semibold">{comp}</h3>
        <span className="text-slate-500 text-[13px]">
          {`${list.length} ${list.length === 1 ? "game" : "games"}`}
        </span>
      </div>
      <VsMatchList matches={shown} showDate={showDate} />
      {list.length > initial && (
        <button
          onClick={() => setOpen(!open)}
          className="mt-2.5 text-[14px] font-medium text-[#4ADE80] hover:text-[#86EFAC] transition"
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
    // content-visibility: an off-screen day is not laid out or painted until it scrolls near.
    <section className="mb-7 [content-visibility:auto] [contain-intrinsic-size:auto_900px]">
      <div className="flex items-baseline gap-2.5 border-b border-white/[0.08] pb-2 mb-4">
        <h2 className="text-white text-[22px] uppercase tracking-wide leading-none" style={{ fontFamily: "Anton, sans-serif" }}>{label}</h2>
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
    <div role="tablist" className="inline-flex rounded-xl border border-white/[0.12] bg-white/[0.05] lg:backdrop-blur-xl p-1 mb-6 max-w-full overflow-x-auto">
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={`flex items-center gap-2 shrink-0 rounded-md px-4 py-2 text-[15px] font-medium transition ${
              on ? "bg-[#242C27] text-slate-50" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.live && <LiveDot />}
            {t.label}
            <span className={`tabular-nums text-[13px] ${on ? "text-[#4ADE80]" : "text-slate-500"}`}>{t.count}</span>
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
  const [daysShown, setDaysShown] = useState(DAYS_STEP);
  // Last response as text: a poll that returns the same data skips the
  // re-render entirely (every 10s redraw used to stall a phone for ~1s).
  const lastRef = useRef("");

  useEffect(() => {
    api("/api/public/tournaments")
      .then((d) => setSports([...new Set((d.tournaments || []).map((t) => t.sport))].sort()))
      .catch(() => setSports([]));
  }, []);

  useEffect(() => {
    let alive = true;
    // A sport switch shows the skeleton at once instead of leaving the old list
    // frozen on screen until the new one arrives.
    setLoading(true);
    setDaysShown(DAYS_STEP);
    lastRef.current = "";
    const load = () =>
      api(`/api/public/matches${sport ? `?sport=${encodeURIComponent(sport)}` : ""}`)
        .then((d) => {
          if (!alive) return;
          const text = JSON.stringify(d.matches || []);
          if (text === lastRef.current) return; // nothing changed — no re-render
          lastRef.current = text;
          setMatches(d.matches || []);
        })
        .catch(() => { if (alive && lastRef.current === "") setMatches([]); })
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

  const pickTab = (v) => { setTab(v); setDaysShown(DAYS_STEP); };

  // Show N day-blocks, then a "Show more days" button.
  const paged = (blocks) => (
    <>
      {blocks.slice(0, daysShown)}
      {blocks.length > daysShown && (
        <button
          onClick={() => setDaysShown((n) => n + DAYS_STEP)}
          className="w-full rounded-xl border border-white/[0.12] bg-white/[0.05] py-3.5 text-[15px] font-semibold text-[#4ADE80] hover:bg-white/[0.08] transition"
        >
          Show more days ({blocks.length - daysShown} more)
        </button>
      )}
    </>
  );

  const dayLabel = (day, list) => {
    const label = matchDateLabel(list[0].schedule);
    return day === today ? `Today · ${label}` : label;
  };

  return (
    <>
      <h1 className="text-slate-50 text-[32px] sm:text-[40px] font-semibold tracking-tight leading-tight mb-1.5">Matches</h1>
      <p className="text-slate-400 text-[16px] sm:text-[17px] mb-6 max-w-2xl">Every game this season: live now, coming up, and final scores.</p>

      {/* Flip to the skeleton in the SAME render as the tab click, so the old list
          is never redrawn first (that made the skeleton appear ~2s late on a phone). */}
      <SportTabs sports={sports} value={sport} onChange={(v) => { if (v !== sport) { setLoading(true); setSport(v); } }} />

      {loading ? (
        <VsMatchSkeleton rows={5} />
      ) : real.length === 0 ? (
        <Panel emptyTitle="No games scheduled yet" emptyIcon="calendar" emptyAction={{ to: "/teams", label: "See the teams" }}
          empty="The schedule appears here once teams are verified and the brackets are drawn." />
      ) : (
        <>
          <Tabs tabs={tabs} value={current} onChange={pickTab} />

          {current === "live" && (
            <VsMatchList matches={live} showDate={false} />
          )}

          {current === "upcoming" && (
            <>
              {upcoming.length === 0 && undated.length === 0 && overdue.length === 0 && (
                <Panel emptyTitle="Nothing coming up" emptyIcon="calendar" empty="New games show up here as soon as they are dated." />
              )}
              {paged([
                ...byDay(upcoming).map(([day, list]) => (
                  <DayBlock key={day} label={dayLabel(day, list)} list={list}
                    note={`${list.length} ${list.length === 1 ? "game" : "games"}`} />
                )),
                undated.length > 0 && (
                  <DayBlock key="tba" label="Date to be announced" list={undated}
                    note={`${undated.length} ${undated.length === 1 ? "game" : "games"}`} />
                ),
                overdue.length > 0 && (
                  <DayBlock key="overdue" label="Waiting for a result" list={overdue}
                    note="Scheduled on an earlier day, not played or recorded yet" showDate />
                ),
              ].filter(Boolean))}
            </>
          )}

          {current === "results" && (
            done.length === 0 ? (
              <Panel emptyTitle="No results yet" emptyIcon="trophy" empty="Final scores appear here as games finish." />
            ) : (
              <>
                {/* Most recent day first — a results feed reads backwards. */}
                {paged([
                  ...byDay(done.filter((m) => m.schedule)).reverse().map(([day, list]) => (
                    <DayBlock key={day} label={dayLabel(day, list)} list={list}
                      note={`${list.length} ${list.length === 1 ? "result" : "results"}`} />
                  )),
                  done.some((m) => !m.schedule) && (
                    <DayBlock key="undated" label="Undated" list={done.filter((m) => !m.schedule)} />
                  ),
                ].filter(Boolean))}
              </>
            )
          )}
        </>
      )}
    </>
  );
}
