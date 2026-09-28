import { useEffect, useState } from "react";
import { api } from "../../api";
import {
  Panel, PanelSkeleton, SportTabs, FixtureRow, ScoreStrip, DateBar,
  matchDateLabel, matchTime, matchContext, DIVISION_LABEL,
} from "../../components/PublicUI";

// "2026-09-25" in Manila time — for comparing days, not for display.
const manilaDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(d));

// Long lists open a few rows at a time — 71 fixtures at once is not a list
// anyone reads.
function Collapsible({ items, render, initial = 6, noun = "matches" }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, initial);
  return (
    <>
      {shown.map(render)}
      {items.length > initial && (
        <button
          onClick={() => setOpen(!open)}
          className="w-full px-4 py-3.5 text-[14px] font-medium text-[#F5A524] hover:text-[#ffbe4d] border-t border-[#1C2430] transition"
        >
          {open ? "Show less" : `Show all ${items.length} ${noun}`}
        </button>
      )}
    </>
  );
}

// Dated fixtures, grouped under a date bar per day.
function ByDate({ list, sportShown }) {
  const byDate = {};
  list.forEach((m) => { (byDate[matchDateLabel(m.schedule)] = byDate[matchDateLabel(m.schedule)] || []).push(m); });
  return Object.entries(byDate).map(([date, rows]) => (
    <div key={date}>
      <DateBar count={rows.length > 1 ? `${rows.length} games` : null}>{date}</DateBar>
      {rows.map((m) => (
        <FixtureRow key={m.id} m={m} when={matchTime(m.schedule)} where={m.venue}
          context={matchContext(m, { sport: !sportShown })} />
      ))}
    </div>
  ));
}

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [sports, setSports] = useState([]);
  const [sport, setSport] = useState("");
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
  const byTime = (a, b) => new Date(a.schedule) - new Date(b.schedule);
  const today = manilaDay(new Date());
  // Today and later = what's coming up. A game dated in the past that was never
  // started isn't "upcoming" — it used to sit in date order among the rest, so
  // the list opened on a game from days ago.
  const upcoming = scheduled.filter((m) => m.schedule && manilaDay(m.schedule) >= today).sort(byTime);
  const overdue = scheduled.filter((m) => m.schedule && manilaDay(m.schedule) < today).sort(byTime);
  const undated = scheduled.filter((m) => !m.schedule);
  // Most recent result first — a results feed reads backwards.
  const done = real.filter((m) => m.status === "completed" || m.status === "forfeited").reverse();

  // Undated fixtures group by competition instead, since there's no date to
  // group them by and mixing four sports in one list helps nobody.
  const byComp = {};
  undated.forEach((m) => {
    const key = `${m.sport} · ${DIVISION_LABEL[m.division] || m.division}`;
    (byComp[key] = byComp[key] || []).push(m);
  });

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
          {live.length > 0 && (
            <Panel title="Live" count={`${live.length} in progress`}>
              <div>{live.map((m) => <ScoreStrip key={m.id} m={m} />)}</div>
            </Panel>
          )}

          <Panel title="Upcoming" count={upcoming.length ? `${upcoming.length}` : null}
            empty="No dated games coming up yet.">
            {upcoming.length > 0 && <div><ByDate list={upcoming} sportShown={!!sport} /></div>}
          </Panel>

          {undated.length > 0 && (
            <Panel title="Fixtures" count={`${undated.length} not yet dated`}>
              <div>
                {Object.entries(byComp).sort().map(([comp, list]) => (
                  <div key={comp}>
                    <DateBar count={list.length}>{comp}</DateBar>
                    <Collapsible
                      items={list}
                      noun="fixtures"
                      render={(m) => (
                        <FixtureRow key={m.id} m={m} when={m.roundLabel || (m.round ? `Round ${m.round}` : "TBD")}
                          where={m.group ? `Group ${m.group}` : null} />
                      )}
                    />
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Results" count={done.length > 0 ? `${done.length}` : null} empty="No results yet.">
            {done.length > 0 && (
              <div>
                <Collapsible items={done} initial={8} noun="results" render={(m) => <ScoreStrip key={m.id} m={m} />} />
              </div>
            )}
          </Panel>

          {overdue.length > 0 && (
            <Panel title="Waiting for a result" count={`${overdue.length}`}>
              <div><ByDate list={overdue} sportShown={!!sport} /></div>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
