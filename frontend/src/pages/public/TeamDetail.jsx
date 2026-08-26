import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { Crest, Panel, PlayerAvatar, Tag, DIVISION_LABEL, FORMAT_LABEL } from "../../components/PublicUI";

export default function TeamDetail() {
  const { id } = useParams();
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

  if (loading) return <p className="text-slate-500 text-sm">Loading…</p>;

  if (error || !data?.team) {
    return (
      <Panel>
        <div className="px-5 py-8 text-center">
          <p className="text-slate-300 text-sm mb-3">{error || "That team could not be found."}</p>
          <Link to="/teams" className="text-[#F5A524] text-sm hover:underline">Back to teams</Link>
        </div>
      </Panel>
    );
  }

  const { team, players = [] } = data;

  // Volleyball is side-scored, and billiards and chess are win/loss only —
  // no PlayerMatchStats rows exist, so the stat columns would be a wall of
  // zeroes. Show them only when the sport actually records them.
    const statsTracked = players.some((p) => (p.stats?.points || 0) > 0 || (p.stats?.fouls || 0) > 0);

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
    <th className={`px-3 py-2.5 text-slate-500 text-[11px] font-medium uppercase tracking-wide ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
  const Td = ({ children, right, dim }) => (
    <td className={`px-3 py-3 text-[14px] tabular-nums ${right ? "text-right" : ""} ${dim ? "text-slate-500" : "text-slate-200"}`}>
      {children}
    </td>
  );

  return (
    <>
      <Link to="/teams" className="text-slate-500 text-[13px] hover:text-slate-300 transition">
        ← Teams
      </Link>

      <div className="flex items-center gap-4 mt-3 mb-5">
        <Crest name={team.barangay || team.name} size={56} />
        <div className="min-w-0">
          <h1 className="text-slate-100 text-2xl font-semibold tracking-tight truncate">{team.name}</h1>
          <div className="text-slate-500 text-sm truncate">
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
        {roster.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-[#1C2430]">
                <tr>
                  <Th>#</Th>
                  <Th>Player</Th>
                  <Th right>Age</Th>
                  {statsTracked && <><Th right>GP</Th><Th right>PTS</Th><Th right>PPG</Th><Th right>Fouls</Th></>}
                </tr>
              </thead>
              <tbody>
                {roster.map((p) => {
                  const s = p.stats || { points: 0, fouls: 0, games: 0 };
                  const ppg = s.games > 0 ? (s.points / s.games).toFixed(1) : "—";
                  return (
                    <tr key={p.id} className="border-b border-[#1C2430] last:border-0">
                      <Td dim>{p.jerseyNumber ?? "—"}</Td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar player={p} size={32} />
                          <span className="text-slate-100 text-[14px] truncate">
                            {p.lastName}{p.firstName ? `, ${p.firstName}` : ""}
                          </span>
                        </div>
                      </td>
                      <Td right dim>{p.age ?? "—"}</Td>
                      {statsTracked && (
                        <>
                          <Td right dim>{s.games}</Td>
                          <Td right>{s.points}</Td>
                          <Td right dim>{ppg}</Td>
                          <Td right dim>{s.fouls}</Td>
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