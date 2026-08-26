import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Crest, Panel, DIVISION_LABEL } from "../../components/PublicUI";

// Stage split: group-stage matches carry a `group`, knockout matches don't.
// This avoids depending on the bracket label, which uses two naming schemes
// (`final`/`third` in one generator, `ko_final`/`ko_third` in the other).
const isGroupStage = (m) => !!m.group;
const isThird = (m) => (m.bracket || "").includes("third");
const isFinal = (m) => (m.bracket || "").includes("final");

function MatchCard({ m, innerRef }) {
  const done = m.status === "completed";
  const live = m.status === "ongoing";
  const aWin = done && m.winner && String(m.winner) === String(m.teamA?.id);
  const bWin = done && m.winner && String(m.winner) === String(m.teamB?.id);

  const Side = ({ team, score, won }) => (
    <div className="flex items-center gap-2 px-3 py-2">
      <Crest name={team?.name} size={20} />
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
        <div className="px-3 py-1 bg-red-500/10 text-red-400 text-[10px] font-semibold">LIVE</div>
      )}
    </div>
  );
}

// One bracket tree: rounds as columns, elbows drawn from each match to the one
// its winner feeds. Wires are measured from the DOM because column heights are
// decided by flex, not by us. Pointers to matches outside this section (a
// winners-bracket loser dropping into losers) are skipped — there's no ref for
// them, so they resolve to nothing.
function BracketSection({ title, matches, labelFor }) {
  const stageRef = useRef(null);
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
      <div className="overflow-x-auto pb-2">
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
        </div>
      </div>
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
          <button
            key={t.id}
            onClick={() => setTid(t.id)}
            className={`px-3 py-2 text-[13px] whitespace-nowrap border-b-2 transition ${
              tid === t.id
                ? "text-[#F5A524] border-[#F5A524]"
                : "text-slate-400 border-transparent hover:text-slate-200"
            }`}
          >
            {t.sport} {DIVISION_LABEL[t.division] || t.division}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : matches.length === 0 ? (
        <Panel empty="No bracket drawn yet." />
      ) : (
        <>
          {knockoutMain.length > 0 ? (
            <Panel title="Knockout">
              <div className="px-5 py-5">
                <BracketSection matches={knockoutMain} labelFor={knockoutLabel} />
                {knockoutThird && (
                  <div>
                    <h3 className="text-slate-400 text-[12px] font-semibold uppercase tracking-wide mb-3">
                      Third place
                    </h3>
                    <MatchCard m={knockoutThird} innerRef={() => {}} />
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
            const winners = inGroup.filter((m) => m.bracket === "winners");
            const losers = inGroup.filter((m) => m.bracket === "losers");
            const roundRobin = inGroup.filter((m) => m.bracket === "group");
            return (
              <Panel key={g} title={`Group ${g}`} count={`${inGroup.length} matches`}>
                <div className="px-5 py-5">
                  {roundRobin.length > 0 && (
                    <BracketSection
                      title="Round robin"
                      matches={roundRobin}
                      labelFor={(r) => `Round ${r}`}
                    />
                  )}
                  <BracketSection title="Winners" matches={winners} labelFor={(r) => `Round ${r}`} />
                  <BracketSection title="Losers" matches={losers} labelFor={(r) => `Round ${r}`} />
                </div>
              </Panel>
            );
          })}
        </>
      )}
    </>
  );
}