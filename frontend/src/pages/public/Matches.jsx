import { useEffect, useState } from "react";
import { api } from "../../api";
import { Crest, Panel, PanelSkeleton, SportTabs, LiveDot, DIVISION_LABEL } from "../../components/PublicUI";

// Quarters in basketball, sets in the rally sports. "P1" is internal shorthand;
// nobody watching says "period one".
const PERIOD_PREFIX = {
  Basketball: "Q",
  Volleyball: "S",
  Badminton: "S",
  Pickleball: "S",
};
const context = (m) =>
  [DIVISION_LABEL[m.division] || m.division, m.group ? `Grp ${m.group}` : null, m.round ? `R${m.round}` : null]
    .filter(Boolean).join(" · ");

// Pinned to Manila: the league's dates are Philippine dates regardless of where
// the viewer's device thinks it is.
const dateKey = (d) =>
  new Date(d).toLocaleDateString(undefined, {
    timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric",
  });

// A date-only schedule is stored as midnight UTC, which renders as 8:00 AM in
// Manila — a time nobody set. Only show a time when one was actually chosen.
const hasTime = (d) => {
  const x = new Date(d);
  return !(x.getUTCHours() === 0 && x.getUTCMinutes() === 0 && x.getUTCSeconds() === 0);
};

const timeOf = (d) =>
  d && hasTime(d)
    ? new Date(d).toLocaleTimeString([], { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })
    : null;

// A fixture with no score is one line. The stacked layout below is for matches
// that have something to show.
function FixtureRow({ m, trailing, sub }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1C2430] last:border-0">
      <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
        <span className="text-slate-200 text-[13px] truncate text-right">{m.teamA?.name || "TBD"}</span>
                <Crest name={m.teamA?.name} barangayId={m.teamA?.barangayId} size={22} />
      </div>
      <span className="text-slate-600 text-[11px] shrink-0">vs</span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
                <Crest name={m.teamB?.name} barangayId={m.teamB?.barangayId} size={22} />
        <span className="text-slate-200 text-[13px] truncate">{m.teamB?.name || "TBD"}</span>
      </div>
                   <div className="w-32 shrink-0 text-right">
        <div className="text-slate-500 text-[11px]">{trailing}</div>
        {sub && <div className="text-slate-600 text-[10px] leading-tight mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// Scoreboard strip — live and completed matches, where the score is the point.
function ScoreStrip({ m }) {
  const live = m.status === "ongoing";
  const aLeads = m.scoreA >= m.scoreB;
    const Line = ({ team, score, leading }) => (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2.5 min-w-0">
        <Crest name={team?.name} barangayId={team?.barangayId} size={26} />
        <span className={`text-[14px] truncate ${leading ? "text-slate-100" : "text-slate-400"}`}>
          {team?.name || "TBD"}
        </span>
      </div>
      <span className={`text-lg font-semibold tabular-nums pl-3 ${leading ? "text-slate-100" : "text-slate-500"}`}>
        {score}
      </span>
    </div>
  
  );
  return (
    <div className="px-4 py-3 border-b border-[#1C2430] last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-slate-600 text-[11px] truncate">
          {m.sport} · {context(m)}{m.venue ? ` · ${m.venue}` : ""}
        </span>
        {live ? (
          <span className="flex items-center gap-1.5 text-red-400 text-[11px] font-semibold">
            <LiveDot />
            {m.totalPeriods > 1
              ? `LIVE · ${PERIOD_PREFIX[m.sport] || "P"}${Math.min(m.periodsPlayed + 1, m.totalPeriods)}`
              : "LIVE"}
          </span>
        ) : (
          <span className="text-slate-600 text-[11px] shrink-0">{timeOf(m.schedule) || "Final"}</span>
        )}
      </div>
            <Line team={m.teamA} score={m.scoreA} leading={aLeads} />
      <Line team={m.teamB} score={m.scoreB} leading={!aLeads || m.scoreA === m.scoreB} />
      {m.periods?.length > 1 && (
        <div className="text-slate-600 text-[11px] mt-1.5 tabular-nums">
          {m.periods.map((p) => `${p.a}-${p.b}`).join("  ·  ")}
        </div>
      )}
    </div>
  );
}

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
          className="w-full px-4 py-2.5 text-[12px] text-slate-500 hover:text-slate-300 border-t border-[#1C2430] transition"
        >
          {open ? "Show less" : `Show all ${items.length} ${noun}`}
        </button>
      )}
    </>
  );
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
  const dated = scheduled.filter((m) => m.schedule);
  const undated = scheduled.filter((m) => !m.schedule);
  // Most recent result first — a results feed reads backwards.
    const done = real.filter((m) => m.status === "completed" || m.status === "forfeited").reverse();

  const byDate = {};
  dated.forEach((m) => { (byDate[dateKey(m.schedule)] = byDate[dateKey(m.schedule)] || []).push(m); });

  // Undated fixtures group by competition instead, since there's no date to
  // group them by and mixing four sports in one list helps nobody.
  const byComp = {};
  undated.forEach((m) => {
    const key = `${m.sport} · ${DIVISION_LABEL[m.division] || m.division}`;
    (byComp[key] = byComp[key] || []).push(m);
  });

  return (
    <>
      <h1 className="text-slate-100 text-2xl font-semibold tracking-tight mb-4">Matches</h1>

      <SportTabs sports={sports} value={sport} onChange={setSport} />

      {loading ? (
        <>
          <PanelSkeleton rows={2} />
          <PanelSkeleton rows={5} />
        </>
      ) : (
        <>
          {live.length > 0 && (
            <Panel title="Live" count={`${live.length} in progress`}>
              <div>{live.map((m) => <ScoreStrip key={m.id} m={m} />)}</div>
            </Panel>
          )}

          {dated.length > 0 && (
            <Panel title="Scheduled" count={`${dated.length}`}>
              <div>
                {Object.entries(byDate).map(([date, list]) => (
                  <div key={date}>
                    <div className="px-4 py-2 bg-[#141A24] border-b border-[#1C2430]">
                      <span className="text-slate-200 text-[12px] font-semibold">{date}</span>
                    </div>
                    {list.map((m) => (
                                            <FixtureRow
                        key={m.id}
                        m={m}
                        trailing={timeOf(m.schedule) || "TBD"}
                                                sub={[DIVISION_LABEL[m.division] || m.division, m.venue]
                          .filter(Boolean).join(" · ")}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {undated.length > 0 && (
            <Panel title="Fixtures" count={`${undated.length} not yet dated`}>
              <div>
                {Object.entries(byComp).sort().map(([comp, list]) => (
                  <div key={comp}>
                    <div className="px-4 py-2 bg-[#141A24] border-b border-[#1C2430]">
                      <span className="text-slate-200 text-[12px] font-semibold">{comp}</span>
                      <span className="text-slate-600 text-[11px] ml-2">{list.length}</span>
                    </div>
                    <Collapsible
                      items={list}
                      noun="fixtures"
                      render={(m) => (
                        <FixtureRow
                          key={m.id}
                          m={m}
                          trailing={[m.group ? `Grp ${m.group}` : null, m.round ? `R${m.round}` : null]
                            .filter(Boolean).join(" · ")}
                        />
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
                <Collapsible
                  items={done}
                  initial={8}
                  noun="results"
                  render={(m) => <ScoreStrip key={m.id} m={m} />}
                />
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}