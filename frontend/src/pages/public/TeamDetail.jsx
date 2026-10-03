import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { Crest, Panel, PanelSkeleton, Skeleton, PlayerAvatar, Tag, DIVISION_LABEL, FORMAT_LABEL } from "../../components/PublicUI";

export default function TeamDetail() {
  const { id } = useParams();
  // ?player=<id>: arrived from a flipped player card (Players page) or a bracket MVP card.
  // That player's row is highlighted and scrolled into view once the roster loads.
  const [params] = useSearchParams();
  const focusId = params.get("player");
  const focusRef = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api(`/api/public/teams/${id}`)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message || "That team could not be loaded."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (loading || !focusId || !focusRef.current) return;
    // Instant: the public layout runs Lenis, which a native smooth scroll would fight.
    focusRef.current.scrollIntoView({ block: "center" });
  }, [loading, focusId]);

  if (loading) {
    return (
      <>
        <Skeleton className="h-4 w-16 mb-3" />
        <div className="flex items-center gap-4 mt-3 mb-5">
          <Skeleton className="h-14 w-14 rounded shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
        <PanelSkeleton rows={6} />
      </>
    );
  }

  if (error || !data?.team) {
    return (
      <Panel>
        <div className="px-5 py-8 text-center">
          <p className="text-slate-300 text-sm mb-3">{error || "That team could not be found."}</p>
          <Link to="/teams" className="text-[#4ADE80] text-sm hover:underline">Back to teams</Link>
        </div>
      </Panel>
    );
  }

  const { team, players = [] } = data;

  // Stat columns follow the sport's after-match score sheet (League Setup): chess
  // set to "points" shows points only, never fouls. The whole stat block stays
  // hidden until something has actually been recorded, so it isn't a wall of zeroes.
  const cols = team.statColumns || [];
  const has = (k) => cols.includes(k);
  const statsTracked = players.some((p) => (p.stats?.mvps || 0) > 0 || cols.some((k) => (p.stats?.[k] || 0) > 0));

  const roster = [...players].sort((a, b) => {
    const an = Number(a.jerseyNumber), bn = Number(b.jerseyNumber);
    const aHas = !Number.isNaN(an) && a.jerseyNumber != null;
    const bHas = !Number.isNaN(bn) && b.jerseyNumber != null;
    if (aHas && bHas) return an - bn;
    if (aHas) return -1;
    if (bHas) return 1;
    return (a.lastName || "").localeCompare(b.lastName || "");
  });

  const Th = ({ children, right }) => (
    <th className={`px-3 py-3 text-slate-300 text-[12px] font-semibold uppercase tracking-wide ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
  const Td = ({ children, right, dim }) => (
    <td className={`px-3 py-3 text-[15px] tabular-nums ${right ? "text-right" : ""} ${dim ? "text-slate-400" : "text-slate-100 font-semibold"}`}>
      {children}
    </td>
  );

  return (
    <>
      <Link to="/teams" className="inline-block py-1 text-slate-400 text-[15px] hover:text-slate-200 transition">
        ← Teams
      </Link>

      <div className="flex items-center gap-4 mt-3 mb-5">
                <Crest name={team.barangay || team.name} barangayId={team.barangayId} size={56} />
        <div className="min-w-0">
          <h1 className="text-slate-100 text-2xl font-semibold tracking-tight truncate">{team.name}</h1>
          <div className="text-slate-400 text-[15px] truncate">
            {team.barangay ? `Barangay ${team.barangay}` : "—"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {team.sport && <Tag>{team.sport}</Tag>}
        <Tag>{DIVISION_LABEL[team.division] || team.division}</Tag>
        {team.format && <Tag>{FORMAT_LABEL[team.format] || team.format}</Tag>}
      </div>

      <Panel
        title="Roster"
        count={`${roster.length} ${roster.length === 1 ? "player" : "players"}`}
        empty="No players listed."
      >
        {roster.length > 0 && statsTracked && (
          // On a phone the stat columns sit off to the right of the table.
          <p className="sm:hidden px-4 pt-3 text-slate-500 text-[13px]">Swipe the table sideways for stats →</p>
        )}
        {roster.length > 0 && (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full">
              <thead className="border-b border-white/[0.08]">
                <tr>
                  <Th>#</Th>
                  <Th>Player</Th>
                  <Th right>Age</Th>
                  {statsTracked && <><Th right>GP</Th>
                    {has("points") && <><Th right>PTS</Th><Th right>PPG</Th></>}
                    {has("rebounds") && <Th right>REB</Th>}
                    {has("assists") && <Th right>AST</Th>}
                    {has("fouls") && <Th right>Fouls</Th>}
                    <Th right>MVP</Th></>}
                </tr>
              </thead>
              <tbody>
                {roster.map((p) => {
                  const s = p.stats || { points: 0, fouls: 0, games: 0 };
                  const ppg = s.games > 0 ? (s.points / s.games).toFixed(1) : "—";
                  return (
                    <tr key={p.id} ref={String(p.id) === focusId ? focusRef : undefined}
                      className={`border-b border-white/[0.08] last:border-0 ${String(p.id) === focusId ? "bg-[#4ADE80]/[0.08] shadow-[inset_3px_0_0_#4ADE80]" : ""}`}>
                      <Td dim>{p.jerseyNumber ?? "—"}</Td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar player={p} size={36} />
                          <span className="text-slate-100 text-[15px] leading-snug min-w-[8rem]">
                            {p.lastName}{p.firstName ? `, ${p.firstName}` : ""}
                          </span>
                        </div>
                      </td>
                      <Td right dim>{p.age ?? "—"}</Td>
                      {statsTracked && (
                        <>
                          {/* Every stat as bright as PTS (Super Admin, Oct 2026: "it looks so gray"). */}
                          <Td right>{s.games}</Td>
                          {has("points") && <><Td right>{s.points}</Td><Td right>{ppg}</Td></>}
                          {has("rebounds") && <Td right>{s.rebounds || 0}</Td>}
                          {has("assists") && <Td right>{s.assists || 0}</Td>}
                          {has("fouls") && <Td right>{s.fouls || 0}</Td>}
                          {/* Times named Match MVP on the organizer's after-match score sheet. */}
                          <Td right>{s.mvps || 0}</Td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}