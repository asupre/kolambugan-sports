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

// ── Match card (Oct 2026, Super Admin's "new UI sample for web") ──────────
// Clean rounded card on the steel-navy palette: a stage chip on top, then the
// two teams facing each other — crest ABOVE the name, so long names get the
// full column on a phone — with the time (or score) in the middle.

function Side({ team, tone }) {
  const name = !team
    ? "text-slate-500 italic font-normal"
    : tone === "win" ? "text-white font-semibold"
    : tone === "lose" ? "text-slate-400"
    : "text-slate-100 font-medium";
  return (
    <div className="flex flex-col items-center text-center min-w-0 gap-2">
      <div className={`relative ${tone === "lose" ? "opacity-50 grayscale" : ""}`}>
        {team ? (
          <Crest name={team.name} barangayId={team.barangayId} size={52} />
        ) : (
          <span className="block size-[52px] rounded-lg border border-dashed border-[#2E4466]" />
        )}
      </div>
      <div className={`text-[14px] sm:text-[15px] leading-snug line-clamp-2 break-words max-w-full ${name}`}>
        {team ? team.name : "Awaiting opponent"}
      </div>
      {tone === "win" && (
        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide bg-emerald-500/15 text-emerald-400">
          Winner
        </span>
      )}
    </div>
  );
}

// One game. `showComp` adds the sport/division (used where cards aren't
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
    <div className={`rounded-xl border bg-[#122036] p-4 transition-colors hover:border-[#2E4466] ${live ? "border-red-500/50" : "border-[#22344F]"}`}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="rounded-md bg-[#172840] px-2 py-1 text-[12px] text-slate-300 truncate min-w-0">
          {[showComp ? compOf(m) : null, stageOf(m)].filter(Boolean).join(" · ") || "Match"}
        </span>
        {live ? (
          <span className="flex items-center gap-1.5 shrink-0 rounded-md bg-red-500/15 px-2 py-1 text-[12px] font-semibold text-red-400">
            <LiveDot />
            {m.totalPeriods > 1 ? `LIVE · ${PERIOD_PREFIX[m.sport] || "P"}${Math.min(m.periodsPlayed + 1, m.totalPeriods)}` : "LIVE"}
          </span>
        ) : done ? (
          <span className="shrink-0 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
            {m.status === "forfeited" ? "Forfeit" : "Final"}
            {showDate && m.schedule ? ` · ${matchDateLabel(m.schedule)}` : ""}
          </span>
        ) : showComp && m.venue ? (
          <span className="shrink-0 text-[12px] text-slate-500">{m.venue}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
        <Side team={m.teamA} tone={tone(aWon, bWon)} />

        <div className="flex flex-col items-center justify-center min-w-[72px] sm:min-w-[96px] pt-2.5">
          {live || done ? (
            <div className="flex items-baseline gap-1.5 text-[30px] sm:text-[34px] leading-none tabular-nums" style={{ fontFamily: "Anton, sans-serif" }}>
              <span className={done ? scoreTone(aWon, bWon) : "text-white"}>{m.scoreA}</span>
              <span className="text-slate-500 px-0.5">:</span>
              <span className={done ? scoreTone(bWon, aWon) : "text-white"}>{m.scoreB}</span>
            </div>
          ) : (
            <>
              <div className={`leading-none tabular-nums ${time ? "text-white text-[26px] sm:text-[30px]" : "text-slate-400 text-[20px]"}`}
                style={{ fontFamily: "Anton, sans-serif" }}>
                {time || "TBA"}
              </div>
              <span className="mt-2 rounded-full bg-[#FACC15] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#0B1626]">
                VS
              </span>
            </>
          )}
          {(live || done) && m.periods?.length > 1 && (
            <div className="mt-2 text-[11px] text-slate-500 tabular-nums text-center">
              {m.periods.map((p) => `${p.a}-${p.b}`).join(" · ")}
            </div>
          )}
        </div>

        <Side team={m.teamB} tone={tone(bWon, aWon)} />
      </div>
    </div>
  );
}

const GRID = "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4";

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
          className="mt-2.5 text-[14px] font-medium text-[#FACC15] hover:text-[#FDE047] transition"
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
      <div className="flex items-baseline gap-2.5 border-b border-[#22344F] pb-2 mb-4">
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
    <div role="tablist" className="inline-flex rounded-lg border border-[#22344F] bg-[#122036] p-1 mb-6 max-w-full overflow-x-auto">
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={`flex items-center gap-2 shrink-0 rounded-md px-4 py-2 text-[15px] font-medium transition ${
              on ? "bg-[#22344F] text-slate-50" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.live && <LiveDot />}
            {t.label}
            <span className={`tabular-nums text-[13px] ${on ? "text-[#FACC15]" : "text-slate-500"}`}>{t.count}</span>
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
