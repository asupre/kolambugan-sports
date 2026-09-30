import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Crest, Panel, PanelSkeleton, LiveDot, TabRow, DIVISION_LABEL } from "../../components/PublicUI";
import { useDragScroll } from "../../hooks/useDragScroll";
import { useMediaQuery } from "../../lib/useMediaQuery";
import Reveal from "../../components/Reveal";


// Stage split: group-stage matches carry a `group`, knockout matches don't.
// This avoids depending on the bracket label, which uses two naming schemes
// (`final`/`third` in one generator, `ko_final`/`ko_third` in the other).
const isGroupStage = (m) => !!m.group;
const isThird = (m) => (m.bracket || "").includes("third");

// Phones get a compact tree (Sep 2026): the desktop 240px cards made a Top 8
// about three screens wide on a phone. Below `sm` cards are 168px with smaller
// type and crests, and the columns sit closer. Wires are re-measured, so no
// layout math changes.
function MatchCard({ m, innerRef }) {
  const compact = !useMediaQuery("(min-width: 640px)");
  const done = ["completed", "forfeited"].includes(m.status);
  const live = m.status === "ongoing";
  const aWin = done && m.winner && String(m.winner) === String(m.teamA?.id);
  const bWin = done && m.winner && String(m.winner) === String(m.teamB?.id);

    const Side = ({ team, score, won }) => (
    <div className="flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-1.5 sm:py-2.5">
      <Crest name={team?.name} barangayId={team?.barangayId} size={compact ? 18 : 24} />
      <span className={`flex-1 min-w-0 truncate text-[13px] sm:text-[15px] ${won ? "text-slate-100 font-medium" : done ? "text-slate-500" : "text-slate-300"}`}>
        {team?.name || "TBD"}
      </span>
      {/* A forfeit is recorded 1–0; the tag on the no-show team says why. */}
      {m.status === "forfeited" && !won && (
        <span className="shrink-0 rounded px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide bg-red-500/15 text-red-400">
          Forfeited
        </span>
      )}
      {(done || live) && (
        <span className={`text-[13px] sm:text-[15px] font-bold tabular-nums w-6 sm:w-7 text-right ${won ? "text-[#F5A524]" : "text-slate-500"}`}>
          {score}
        </span>
      )}
    </div>
  );

  return (
    <div
      ref={innerRef}
      className={`rounded border bg-[#0F141C] w-42 sm:w-60 shrink-0 overflow-hidden ${
        live ? "border-red-500/40" : "border-[#1C2430]"
      }`}
    >
      <Side team={m.teamA} score={m.scoreA} won={aWin} />
      <div className="border-t border-[#1C2430]" />
      <Side team={m.teamB} score={m.scoreB} won={bWin} />
      {live && (
        <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 bg-red-500/10 text-red-400 text-[12px] font-semibold">
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
    <div className={`w-42 sm:w-60 shrink-0 rounded border px-2.5 sm:px-3 py-2 sm:py-3 ${
      done ? "border-[#F5A524]/40 bg-[#F5A524]/[0.06]" : "border-dashed border-[#1C2430] bg-[#0F141C]"
    }`}>
      <p className={`text-[12px] font-semibold uppercase tracking-wide ${done ? "text-[#F5A524]" : "text-slate-600"}`}>
        {label}
      </p>
      <p className={`text-[14px] sm:text-[16px] mt-0.5 truncate ${done ? "text-slate-100 font-medium" : "text-slate-600"}`}>
        {winner?.name || "TBD"}
      </p>
      {/* A 2-team group plays one match that decides both qualifiers, so naming
          only the winner would leave the runner-up unexplained. */}
      {bothQualify && (
        <p className={`text-[13px] sm:text-[15px] truncate ${done ? "text-slate-300" : "text-slate-600"}`}>
          {loser?.name || "TBD"}
        </p>
      )}
      {sublabel && <p className="text-[12px] sm:text-[13px] text-slate-400 mt-1">{sublabel}</p>}
    </div>
  );
}

// The Grand Final's loser finishes 2nd. Its own box, hung under the final.
function SecondPlaceCard({ match }) {
  const done = match && ["completed", "forfeited"].includes(match.status) && match.winner;
  const loser = done
    ? [match.teamA, match.teamB].find((t) => t && String(t.id) !== String(match.winner))
    : null;
  return (
    <div className={`w-42 sm:w-60 shrink-0 rounded border px-2.5 sm:px-3 py-2 sm:py-3 ${
      done ? "border-slate-400/40 bg-slate-400/[0.06]" : "border-dashed border-[#1C2430] bg-[#0F141C]"
    }`}>
      <p className={`text-[12px] font-semibold uppercase tracking-wide ${done ? "text-slate-300" : "text-slate-600"}`}>
        2nd place
      </p>
      <p className={`text-[14px] sm:text-[16px] mt-0.5 truncate ${done ? "text-slate-100 font-medium" : "text-slate-600"}`}>
        {loser?.name || "TBD"}
      </p>
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
function BracketSection({ title, matches, labelFor, winner, runnerUp }) {
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
  const grandFinal = runnerUp ? finalOf(matches) : null;

  return (
    <div className="mb-6">
      {title && <h3 className="text-slate-300 text-[14px] font-semibold uppercase tracking-wide mb-3">{title}</h3>}
      <div ref={dragRef} className="overflow-x-auto pb-2 cursor-grab">
        <div ref={stageRef} className={`relative flex gap-5 sm:gap-10 min-w-min ${grandFinal && rounds.length < 3 ? "pb-24 sm:pb-28" : ""}`}>
          <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible", pointerEvents: "none" }}>
            {wires.map((d, i) => <path key={i} d={d} stroke="#1C2430" strokeWidth="2" fill="none" />)}
          </svg>
          {rounds.map((r, i) => (
            <div key={r} className="relative z-10 flex flex-col">
              <p className="text-slate-400 text-[12px] sm:text-[13px] font-medium mb-2 whitespace-nowrap">{labelFor(r, i, rounds.length)}</p>
              <div className="flex-1 flex flex-col justify-around gap-2 sm:gap-3">
                {matches.filter((m) => m.round === r).map((m) =>
                  grandFinal && m.id === grandFinal.id ? (
                    // Absolutely placed so the final keeps its centred spot and the wires don't move.
                    <div key={m.id} className="relative">
                      <MatchCard m={m} innerRef={(el) => (boxRefs.current[m.id] = el)} />
                      <div className="absolute left-0 top-full mt-3">
                        <SecondPlaceCard match={m} />
                      </div>
                    </div>
                  ) : (
                    <MatchCard key={m.id} m={m} innerRef={(el) => (boxRefs.current[m.id] = el)} />
                  )
                )}
              </div>
            </div>
          ))}
                  

          {winner && (
            <div className="relative z-10 flex flex-col">
              <p className="text-slate-400 text-[13px] font-medium mb-2">&nbsp;</p>
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
      <div className="flex px-4 py-2.5 border-b border-[#1C2430] text-slate-500 text-[12px] font-medium tracking-wider">
        <span className="w-6">#</span>
        <span className="flex-1">TEAM</span>
        <span className="w-10 text-center">W</span>
        <span className="w-10 text-center">L</span>
      </div>
      {ordered.map((r, i) => {
                const isThrough = clear.has(r.teamId);
        const isContested = contested.has(r.teamId);
        // Before the group finishes, the leading rows are only provisional.
        const provisional = !qual?.complete && played && i < advance;
        const marked = isThrough || provisional;
        return (
          <div key={r.teamId}
            className={`flex items-center px-4 py-3 border-b border-[#1C2430] ${
              isThrough ? "bg-[#F5A524]/[0.06]" : isContested ? "bg-slate-500/[0.06]" : provisional ? "bg-[#F5A524]/[0.03]" : ""
            }`}>
            <span className={`w-6 text-[15px] tabular-nums ${marked ? "text-[#F5A524]" : "text-slate-600"}`}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0 flex items-center gap-2.5">
                            <Crest name={r.teamName} barangayId={r.barangayId} size={28} />
              <span className={`text-[16px] truncate ${marked ? "text-slate-100" : "text-slate-400"}`}>
                {r.teamName}
              </span>
                        {isContested && (
                <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400 uppercase tracking-wide">
                  Playoff
                </span>
              )}
            </div>
            <span className="w-10 text-center text-[16px] font-semibold text-slate-100 tabular-nums">{r.wins}</span>
            <span className="w-10 text-center text-[16px] text-slate-500 tabular-nums">{r.losses}</span>
          </div>
        );
      })}

      <div className="px-4 py-2 bg-[#141A24] border-b border-[#1C2430]">
        <span className="text-slate-300 text-[14px] font-semibold">Fixtures</span>
      </div>
      {matches.map((m) => {
        const done = ["completed", "forfeited"].includes(m.status);
        const aWin = done && String(m.winner) === String(m.teamA?.id);
        return (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#1C2430] last:border-0">
            <span className={`flex-1 min-w-0 truncate text-right text-[15px] ${aWin ? "text-slate-100" : "text-slate-400"}`}>
              {m.teamA?.name || "TBD"}
            </span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-slate-400 w-14 text-center">
              {done ? `${m.scoreA}–${m.scoreB}` : m.status === "ongoing" ? "LIVE" : "vs"}
            </span>
            <span className={`flex-1 min-w-0 truncate text-[15px] ${done && !aWin ? "text-slate-100" : "text-slate-400"}`}>
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
      <h1 className="text-slate-100 text-[28px] font-semibold tracking-tight mb-4">Brackets</h1>

      <TabRow
        items={tournaments.map((t) => ({ value: t.id, label: `${t.sport} ${DIVISION_LABEL[t.division] || t.division}` }))}
        value={tid}
        onChange={setTid}
      />

      {loading ? (
        <PanelSkeleton rows={6} />
      ) : matches.length === 0 ? (
        <Panel empty="No bracket drawn yet." />
      ) : (
        <>
          {knockoutMain.length > 0 ? (
            <Reveal>
            <Panel title="Knockout">
              <div className="px-4 sm:px-5 py-5">
                                <BracketSection matches={knockoutMain} labelFor={knockoutLabel}
                  winner={{
                    match: finalOf(knockoutMain),
                    label: "Champion",
                    sublabel: null,
                  }}
                  runnerUp />
                                {knockoutThird && (
                  <div>
                    <h3 className="text-slate-300 text-[14px] font-semibold uppercase tracking-wide mb-3">
                      Third place
                    </h3>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-10">
                      <MatchCard m={knockoutThird} innerRef={() => {}} />
                      <WinnerCard match={knockoutThird} label="Third place" sublabel={null} />
                    </div>
                  </div>
                )}
              </div>
            </Panel>
            </Reveal>
          ) : (
            <Panel>
              <p className="px-4 sm:px-5 py-5 text-slate-400 text-[15px] leading-relaxed">
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
              <Reveal key={g}>
              <Panel title={`Group ${g}`} count={`${inGroup.length} matches`}>
                {isRR ? (
                  <RoundRobinGroup
                    rows={standings[g] || []}
                    matches={roundRobin}
                    advance={advance}
                    qual={data?.qualification?.[g]}
                  />
                ) : (
                                    <div className="px-4 sm:px-5 py-5">
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
              </Reveal>
            );
          })}
        </>
      )}
    </>
  );
}