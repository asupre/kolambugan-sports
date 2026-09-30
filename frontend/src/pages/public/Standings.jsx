import { useEffect, useState } from "react";
import { api } from "../../api";
import { Panel, PanelSkeleton, Crest, TabRow, DIVISION_LABEL } from "../../components/PublicUI";
import Reveal from "../../components/Reveal";

// Reads /api/public/bracket — the same call the Brackets page makes, so the
// table and the bracket can never disagree about who won what.
export default function Standings() {
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

  const standings = data?.standings || {};
  const qualifiers = data?.qualifiers || {};
    const qualification = data?.qualification || {};
  const groups = Object.keys(standings).sort();
  const current = tournaments.find((t) => t.id === tid);
  const isRoundRobin = (data?.matches || []).some((m) => m.group && m.bracket === "group");
  // How many teams each round-robin group sends through (Top 8 → 1, Top 16 → 2). Comes
  // from the tournament, not a constant — a hardcoded 2 was wrong for a Top 8 knockout.
  const advance = data?.tournament?.advancePerGroup || 2;

  return (
    <>
      <h1 className="text-slate-100 text-[28px] font-semibold tracking-tight mb-4">Standings</h1>

      <TabRow
        items={tournaments.map((t) => ({ value: t.id, label: `${t.sport} ${DIVISION_LABEL[t.division] || t.division}` }))}
        value={tid}
        onChange={setTid}
      />

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <PanelSkeleton rows={5} />
          <PanelSkeleton rows={5} />
        </div>
      ) : groups.length === 0 ? (
        <Panel empty="No group matches drawn yet." />
      ) : (
        <>
          <p className="text-slate-400 text-[15px] leading-relaxed mb-4">
            {isRoundRobin
              ? advance === 1
                ? "The winner of each group advances to the knockout round."
                : `The top ${advance} of each group advance to the knockout round.`
              : "Two teams advance from each group — the winner of the upper bracket and the winner of the lower bracket. Highlighted once decided."}
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {groups.map((g, gi) => {
              const rows = standings[g] || [];
              const seeds = qualifiers[g] || [];
                            const seedOf = (teamId) => seeds.find((s) => s.teamId === teamId)?.seed;
              // Round-robin groups settle ties with a playoff, so position alone
              // doesn't qualify anyone. Double-elim groups use seeds instead.
              const q = qualification[g];
              const clear = new Set(q?.clear || []);
              const contested = new Set(q?.contested || []);
                            // A qualifier below an eliminated team reads as a mistake, even
              // though the table is sorted by group record.
              const ordered = clear.size
                ? [...rows].sort((a, b) => (clear.has(b.teamId) ? 1 : 0) - (clear.has(a.teamId) ? 1 : 0))
                : rows;
              const provisional =
                seeds.length === 0 && clear.size === 0 && contested.size === 0 &&
                rows.some((r) => r.played > 0);

              return (
                <Reveal key={g} delay={(gi % 2) * 0.08}>
                <Panel title={`Group ${g}`}>
                  <div className="flex px-4 py-2.5 border-b border-[#1C2430] text-slate-500 text-[12px] font-medium tracking-wider">
                    <span className="w-6">#</span>
                    <span className="flex-1">TEAM</span>
                    <span className="w-10 text-center">W</span>
                    <span className="w-10 text-center">L</span>
                  </div>
                                    {ordered.map((r, i) => {
                                        const seed = seedOf(r.teamId);
                    const isThrough = clear.has(r.teamId);
                    const isContested = contested.has(r.teamId);
                    const marked = seed != null || isThrough || (provisional && r.wins > 0 && i < (isRoundRobin ? advance : 2));
                    return (
                      <div
                        key={r.teamId}
                        className={`flex items-center px-4 py-3 border-b border-[#1C2430] last:border-0 ${
                                                    marked ? "bg-[#F5A524]/[0.06]" : isContested ? "bg-slate-500/[0.06]" : ""
                        }`}
                      >
                        <span className={`w-6 text-[15px] tabular-nums ${marked ? "text-[#F5A524]" : "text-slate-600"}`}>
                          {seed ?? i + 1}
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
                        <span className="w-10 text-center text-[16px] font-semibold text-slate-100 tabular-nums">
                          {r.wins}
                        </span>
                        <span className="w-10 text-center text-[16px] text-slate-500 tabular-nums">
                          {r.losses}
                        </span>
                      </div>
                    );
                  })}
                  {rows.length === 0 && (
                    <p className="px-4 py-4 text-slate-500 text-sm">No matches yet.</p>
                  )}
                </Panel>
                </Reveal>
              );
            })}
          </div>

          {current && (
            <p className="text-slate-500 text-[13px] mt-2">
              {current.sport} · {DIVISION_LABEL[current.division] || current.division}
            </p>
          )}
        </>
      )}
    </>
  );
}