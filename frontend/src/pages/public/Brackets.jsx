import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Crest, Panel, PanelSkeleton, LiveDot, DIVISION_LABEL } from "../../components/PublicUI";
import { useDragScroll } from "../../hooks/useDragScroll";


// Stage split: group-stage matches carry a `group`, knockout matches don't.
// This avoids depending on the bracket label, which uses two naming schemes
// (`final`/`third` in one generator, `ko_final`/`ko_third` in the other).
const isGroupStage = (m) => !!m.group;
const isThird = (m) => (m.bracket || "").includes("third");

function MatchCard({ m, innerRef }) {
  const done = m.status === "completed";
  const live = m.status === "ongoing";
  const aWin = done && m.winner && String(m.winner) === String(m.teamA?.id);
  const bWin = done && m.winner && String(m.winner) === String(m.teamB?.id);

    const Side = ({ team, score, won }) => (
    <div className="flex items-center gap-2 px-3 py-2">
      <Crest name={team?.name} barangayId={team?.barangayId} size={20} />
      <span className={`flex-1 min-w-0 truncate text-[13px] ${won ? "text-slate-100 font-medium" : done ? "text-slate-500" : "text-slate-300"}`}>
        {team?.name || "TBD"}
      </span>
      {(done || live) && (
        <span className={`text-[13px] font-semibold tabular-nums w-6 text-right ${won ? "text-[#F5A524]" : "text-slate-500"}`}>
          {score}
        </span>
      )}
    </div>
  );

  return (
    <div
      ref={innerRef}
      className={`rounded border bg-[#0F141C] w-52 shrink-0 overflow-hidden ${
        live ? "border-red-500/40" : "border-[#1C2430]"
      }`}
    >
      <Side team={m.teamA} score={m.scoreA} won={aWin} />
      <div className="border-t border-[#1C2430]" />
      <Side team={m.teamB} score={m.scoreB} won={bWin} />
      {live && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-400 text-[10px] font-semibold">
          <LiveDot /> LIVE
        </div>
      )}
    </div>
  );
}

// The last match of a bracket has nothing to its right, so the tree just stops
// and a viewer has to work out what winning it earned. This card says so.
function WinnerCard({ match, label, sublabel, bothQualify }) {
  const done = match && (match.status === "completed" || match.status === "forfeited") && match.winner;
  const winner = done
    ? [match.teamA, match.teamB].find((t) => t && String(t.id) === String(match.winner))
    : null;
  const loser = done
    ? [match.teamA, match.teamB].find((t) => t && String(t.id) !== String(match.winner))
    : null;
 
  return (
    <div className={`w-52 shrink-0 rounded border px-3 py-2.5 ${
      done ? "border-[#F5A524]/40 bg-[#F5A524]/[0.06]" : "border-dashed border-[#1C2430] bg-[#0F141C]"
    }`}>
      <p className={`text-[10px] uppercase tracking-wide ${done ? "text-[#F5A524]" : "text-slate-600"}`}>
        {label}
      </p>
      <p className={`text-[14px] mt-0.5 truncate ${done ? "text-slate-100 font-medium" : "text-slate-600"}`}>
        {winner?.name || "TBD"}
      </p>
      {/* A 2-team group plays one match that decides both qualifiers, so naming
          only the winner would leave the runner-up unexplained. */}
      {bothQualify && (
        <p className={`text-[13px] truncate ${done ? "text-slate-300" : "text-slate-600"}`}>
          {loser?.name || "TBD"}
        </p>
      )}
      {sublabel && <p className="text-[11px] text-slate-500 mt-1">{sublabel}</p>}
    </div>
  );
}
 
// The match a bracket ends on: the one no other match in it feeds from.
function finalOf(matches) {
  if (matches.length === 0) return null;
  const targets = new Set(matches.map((m) => m.nextMatchWin).filter(Boolean));
  return matches.find((m) => !targets.has(m.id) && !m.nextMatchWin)
    || matches.reduce((hi, m) => (!hi || (m.round || 0) > (hi.round || 0) ? m : hi), null);
}
// One bracket tree: rounds as columns, elbows drawn from each match to the one
// its winner feeds. Wires are measured from the DOM because column heights are
// decided by flex, not by us. Pointers to matches outside this section (a
// winners-bracket loser dropping into losers) resolve to nothing and are skipped.
function BracketSection({ title, matches, labelFor, winner }) {
  const stageRef = useRef(null);
  const dragRef = useDragScroll();
  const boxRefs = useRef({});
  const [wires, setWires] = useState([]);

  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  useLayoutEffect(() => {
    function measure() {
      const stage = stageRef.current;
      if (!stage) return;
      const base = stage.getBoundingClientRect();
      const ws = [];
      matches.forEach((m) => {
        const from = boxRefs.current[m.id];
        const to = m.nextMatchWin && boxRefs.current[m.nextMatchWin];
        if (!from || !to) return;
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const x1 = a.right - base.left, y1 = a.top - base.top + a.height / 2;
        const x2 = b.left - base.left, y2 = b.top - base.top + b.height / 2;
        const mx = (x1 + x2) / 2;
        ws.push(`M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`);
      });
      setWires(ws);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [matches]);

  if (matches.length === 0) return null;

  return (
    <div className="mb-6">
      {title && <h3 className="text-slate-400 text-[12px] font-semibold uppercase tracking-wide mb-3">{title}</h3>}
      <div ref={dragRef} className="overflow-x-auto pb-2 cursor-grab">
        <div ref={stageRef} className="relative flex gap-10 min-w-min">
          <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible", pointerEvents: "none" }}>
            {wires.map((d, i) => <path key={i} d={d} stroke="#1C2430" strokeWidth="2" fill="none" />)}
          </svg>
          {rounds.map((r, i) => (
            <div key={r} className="relative z-10 flex flex-col">
              <p className="text-slate-600 text-[11px] font-medium mb-2">{labelFor(r, i, rounds.length)}</p>
              <div className="flex-1 flex flex-col justify-around gap-3">
                {matches.filter((m) => m.round === r).map((m) => (
                  <MatchCard key={m.id} m={m} innerRef={(el) => (boxRefs.current[m.id] = el)} />
                ))}
              </div>
            </div>
          ))}
                  

          {winner && (
            <div className="relative z-10 flex flex-col">
              <p className="text-slate-600 text-[11px] font-medium mb-2">&nbsp;</p>
              <div className="flex-1 flex flex-col justify-around">
                <WinnerCard {...winner} />
              </div>
            </div>
          )}
        
        </div>
      </div>
    </div>
  );
}

// A round robin has no tree — every team plays every team — so a bracket layout
// would be a lie. Show the table that actually decides who advances, with the
// fixtures underneath.
function RoundRobinGroup({ rows, matches, advance, qual }) {
  const played = rows.some((r) => r.played > 0);
  const clear = new Set(qual?.clear || []);
  const contested = new Set(qual?.contested || []);
  // A qualifier below an eliminated team reads as a mistake, even though the
  // table is sorted by group record and the playoff is what decided it.
  const ordered = clear.size
    ? [...rows].sort((a, b) => (clear.has(b.teamId) ? 1 : 0) - (clear.has(a.teamId) ? 1 : 0))
    : rows;

  return (
    <div>
      <div className="flex px-4 py-2.5 border-b border-[#1C2430] text-slate-600 text-[10px] font-medium tracking-wider">
        <span className="w-6">#</span>
        <span className="flex-1">TEAM</span>
        <span className="w-9 text-center">W</span>
        <span className="w-9 text-center">L</span>
      </div>
      {ordered.map((r, i) => {
                const isThrough = clear.has(r.teamId);
        const isContested = contested.has(r.teamId);
        // Before the group finishes, the leading rows are only provisional.
        const provisional = !qual?.complete && played && i < advance;
        const marked = isThrough || provisional;
        return (
          <div key={r.teamId}
            className={`flex items-center px-4 py-2.5 border-b border-[#1C2430] ${
              isThrough ? "bg-[#F5A524]/[0.06]" : isContested ? "bg-slate-500/[0.06]" : provisional ? "bg-[#F5A524]/[0.03]" : ""
            }`}>
            <span className={`w-6 text-[13px] tabular-nums ${marked ? "text-[#F5A524]" : "text-slate-600"}`}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0 flex items-center gap-2.5">
                            <Crest name={r.teamName} barangayId={r.barangayId} size={22} />
              <span className={`text-[14px] truncate ${marked ? "text-slate-100" : "text-slate-400"}`}>
                {r.teamName}
              </span>
                        {isContested && (
                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400 uppercase tracking-wide">
                  Playoff
                </span>
              )}
            </div>
            <span className="w-9 text-center text-[14px] font-medium text-slate-200 tabular-nums">{r.wins}</span>
            <span className="w-9 text-center text-[14px] text-slate-500 tabular-nums">{r.losses}</span>
          </div>
        );
      })}

      <div className="px-4 py-2 bg-[#141A24] border-b border-[#1C2430]">
        <span className="text-slate-500 text-[11px] font-medium">Fixtures</span>
      </div>
      {matches.map((m) => {
        const done = m.status === "completed";
        const aWin = done && String(m.winner) === String(m.teamA?.id);
        return (
          <div key={m.id} className="flex items-center gap-3 px-4 py-2 border-b border-[#1C2430] last:border-0">
            <span className={`flex-1 min-w-0 truncate text-right text-[13px] ${aWin ? "text-slate-100" : "text-slate-400"}`}>
              {m.teamA?.name || "TBD"}
            </span>
            <span className="shrink-0 text-[13px] tabular-nums text-slate-500 w-14 text-center">
              {done ? `${m.scoreA}–${m.scoreB}` : m.status === "ongoing" ? "LIVE" : "vs"}
            </span>
            <span className={`flex-1 min-w-0 truncate text-[13px] ${done && !aWin ? "text-slate-100" : "text-slate-400"}`}>
              {m.teamB?.name || "TBD"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const knockoutLabel = (r, i, total) =>
  i === total - 1 ? "Final" : i === total - 2 ? "Semifinals" : i === total - 3 ? "Quarterfinals" : `Round ${r}`;

export default function Brackets() {
  const [tournaments, setTournaments] = useState([]);
  const [tid, setTid] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/public/tournaments")
      .then((d) => {
        const list = d.tournaments || [];
        setTournaments(list);
        setTid(list[0]?.id || "");
        if (list.length === 0) setLoading(false);
      })
      .catch(() => { setTournaments([]); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!tid) return;
    let alive = true;
    setLoading(true);
    const load = () =>
      api(`/api/public/bracket?tournament=${tid}`)
        .then((d) => { if (alive) setData(d); })
        .catch(() => { if (alive) setData(null); })
        .finally(() => { if (alive) setLoading(false); });
    load();
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [tid]);

  const matches = data?.matches || [];
  const standings = data?.standings || {};
  const advance = data?.tournament?.advancePerGroup || 2;

  const groupMatches = matches.filter(isGroupStage);
  const knockout = matches.filter((m) => !isGroupStage(m));
  const knockoutMain = knockout.filter((m) => !isThird(m));
  const knockoutThird = knockout.find(isThird);
  const groups = [...new Set(groupMatches.map((m) => m.group))].sort();

  return (
    <>
      <h1 className="text-slate-100 text-2xl font-semibold tracking-tight mb-4">Brackets</h1>

      <div className="flex gap-4 overflow-x-auto border-b border-[#1C2430] mb-6">
        {tournaments.map((t) => (
          <button key={t.id} onClick={() => setTid(t.id)}
            className={`px-3 py-2 text-[13px] whitespace-nowrap border-b-2 transition ${
              tid === t.id ? "text-[#F5A524] border-[#F5A524]" : "text-slate-400 border-transparent hover:text-slate-200"
            }`}>
            {t.sport} {DIVISION_LABEL[t.division] || t.division}
          </button>
        ))}
      </div>

      {loading ? (
        <PanelSkeleton rows={6} />
      ) : matches.length === 0 ? (
        <Panel empty="No bracket drawn yet." />
      ) : (
        <>
          {knockoutMain.length > 0 ? (
            <Panel title="Knockout">
              <div className="px-5 py-5">
                                <BracketSection matches={knockoutMain} labelFor={knockoutLabel}
                  winner={{
                    match: finalOf(knockoutMain),
                    label: "Champion",
                    sublabel: null,
                  }} />
                                {knockoutThird && (
                  <div>
                    <h3 className="text-slate-400 text-[12px] font-semibold uppercase tracking-wide mb-3">
                      Third place
                    </h3>
                    <div className="flex items-center gap-10">
                      <MatchCard m={knockoutThird} innerRef={() => {}} />
                      <WinnerCard match={knockoutThird} label="Third place" sublabel={null} />
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          ) : (
            <Panel>
              <p className="px-5 py-4 text-slate-500 text-sm">
                The knockout bracket is drawn once every group has finished and the
                qualifiers are confirmed.
              </p>
            </Panel>
          )}

          {groups.map((g) => {
            const inGroup = groupMatches.filter((m) => m.group === g);
            const roundRobin = inGroup.filter((m) => m.bracket === "group");
            const winners = inGroup.filter((m) => m.bracket === "winners");
            const losers = inGroup.filter((m) => m.bracket === "losers");
            // A round-robin group has no winners/losers brackets at all.
            const isRR = roundRobin.length > 0 && winners.length === 0;

            return (
              <Panel key={g} title={`Group ${g}`} count={`${inGroup.length} matches`}>
                {isRR ? (
                  <RoundRobinGroup
                    rows={standings[g] || []}
                    matches={roundRobin}
                    advance={advance}
                    qual={data?.qualification?.[g]}
                  />
                ) : (
                                    <div className="px-5 py-5">
                    <BracketSection title="Winners" matches={winners} labelFor={(r) => `Round ${r}`}
                      winner={winners.length > 0 ? {
                        match: finalOf(winners),
                        label: "Winner",
                        sublabel: losers.length === 0 ? "Both teams qualify" : "Qualifies as seed 1",
                        bothQualify: losers.length === 0,
                      } : null} />
                                        <BracketSection title="Losers" matches={losers} labelFor={(r, i) => `Round ${i + 1}`}
                      winner={losers.length > 0 ? {
                        match: finalOf(losers),
                        label: "Winner",
                        sublabel: "Qualifies as seed 2",
                      } : null} />
                    {roundRobin.length > 0 && (
                      <BracketSection title="Playoff" matches={roundRobin} labelFor={(r) => `Round ${r}`} />
                    )}
                  </div>
                )}
              </Panel>
            );
          })}
        </>
      )}
    </>
  );
}