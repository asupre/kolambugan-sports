import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import {
  Panel, PlayerAvatar, SportTabs, DIVISION_LABEL,
  initials, playerPhotoUrl, SHOW_PLAYER_PHOTOS,
} from "../../components/PublicUI";

// Points only compare WITHIN a sport, so a sport is always selected.
const PREFERRED = "Basketball";

// Round portrait. Degrades to a monogram, so a roster with no photos uploaded
// still reads as a list of people rather than a wall of empty tiles.
function PhotoTile({ player }) {
  const [failed, setFailed] = useState(false);
  const name = `${player.firstName || ""} ${player.lastName || ""}`.trim();
  const show = SHOW_PLAYER_PHOTOS && player.hasPhoto && !failed;
  return (
    <div className="w-16 h-16 rounded-full overflow-hidden bg-[#1C2430] flex items-center justify-center shrink-0">
      {show ? (
        <img
          src={playerPhotoUrl(player.id)}
          alt=""
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-slate-400 text-sm font-semibold">{initials(name) || "—"}</span>
      )}
    </div>
  );
}

function PlayerCard({ p }) {
  return (
    <div className="flex flex-col items-center text-center px-3 py-4 bg-[#0F141C]">
      <PhotoTile player={p} />
      <div className="mt-2.5 flex items-baseline gap-1.5 max-w-full">
        <span className="text-[#F5A524] text-[15px] font-bold tabular-nums shrink-0">
          {p.jerseyNumber ?? "—"}
        </span>
        <span className="text-slate-100 text-[13px] font-medium truncate">{p.lastName}</span>
      </div>
      <div className="text-slate-500 text-[11px] truncate max-w-full">{p.firstName}</div>
      {p.stats?.points > 0 && (
        <div className="text-slate-600 text-[10px] mt-1 tabular-nums">
          {p.stats.points} PTS · {p.stats.games} GP
        </div>
      )}
    </div>
  );
}

export default function Players() {
  const [view, setView] = useState("all"); // "all" | "leaders"
  const [teams, setTeams] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [sports, setSports] = useState([]);
  const [sport, setSport] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/public/tournaments")
      .then((d) => {
        const list = [...new Set((d.tournaments || []).map((t) => t.sport))].sort();
        setSports(list);
        setSport(list.includes(PREFERRED) ? PREFERRED : list[0] || "");
        if (list.length === 0) setLoading(false);
      })
      .catch(() => { setSports([]); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!sport) return;
    let alive = true;
    setLoading(true);
    const q = encodeURIComponent(sport);
    const req = view === "leaders"
      ? api(`/api/public/leaders?sport=${q}&limit=25`).then((d) => { if (alive) setLeaders(d.leaders || []); })
      : api(`/api/public/players?sport=${q}`).then((d) => { if (alive) setTeams(d.teams || []); });
    req
      .catch(() => { if (alive) { setLeaders([]); setTeams([]); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sport, view]);

  const total = teams.reduce((n, t) => n + (t.players?.length || 0), 0);

  const ViewTab = ({ v, label }) => (
    <button
      onClick={() => setView(v)}
      className={`px-3 py-1.5 rounded text-[13px] transition ${
        view === v ? "bg-[#1C2430] text-slate-100" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {label}
    </button>
  );

  const podium = (rank) =>
    rank === 1 ? "text-[#F5A524]" : rank <= 3 ? "text-slate-200" : "text-slate-500";

  return (
    <>
      <div className="flex items-end justify-between gap-4 mb-1">
        <h1 className="text-slate-100 text-2xl font-semibold tracking-tight">Players</h1>
        <div className="flex gap-1 shrink-0">
          <ViewTab v="all" label="All players" />
          <ViewTab v="leaders" label="Top scorers" />
        </div>
      </div>
      <p className="text-slate-500 text-sm mb-4">
        {loading ? "\u00A0"
          : view === "all"
            ? `${total} ${total === 1 ? "player" : "players"} across ${teams.length} ${teams.length === 1 ? "team" : "teams"}`
            : "Ranked by total points this season"}
      </p>

      <SportTabs sports={sports} value={sport} onChange={setSport} allLabel={null} />

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : view === "all" ? (
        teams.length === 0 ? (
          <Panel empty={`No verified ${sport || ""} teams yet.`} />
        ) : (
          teams.map((t) => (
            <Panel
              key={t.id}
              title={t.name}
              count={`${t.barangay ? `Brgy. ${t.barangay} · ` : ""}${DIVISION_LABEL[t.division] || t.division} · ${t.players.length}`}
              empty="No players listed."
            >
              {t.players.length > 0 && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-px bg-[#1C2430]">
                    {t.players.map((p) => <PlayerCard key={p.id} p={p} />)}
                  </div>
                  <div className="px-5 py-3 border-t border-[#1C2430]">
                    <Link to={`/teams/${t.id}`} className="text-[#F5A524] text-[12px] hover:underline">
                      Team page →
                    </Link>
                  </div>
                </>
              )}
            </Panel>
          ))
        )
      ) : leaders.length === 0 ? (
        <Panel empty={`No scoring recorded for ${sport || "this sport"} yet.`} />
      ) : (
        <Panel title={sport} count={`Top ${leaders.length}`}>
          <div>
            {leaders.map((p) => {
              const ppg = p.games > 0 ? (p.points / p.games).toFixed(1) : "—";
              return (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#1C2430] last:border-0">
                  <span className={`w-6 text-[15px] font-semibold tabular-nums ${podium(p.rank)}`}>{p.rank}</span>
                  <PlayerAvatar player={p} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-100 text-[15px] font-medium truncate">
                      {p.firstName} {p.lastName}
                    </div>
                    <div className="text-slate-500 text-[12px] truncate">{p.team || "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-slate-100 text-xl font-semibold tabular-nums leading-none">{p.points}</div>
                    <div className="text-slate-600 text-[11px] mt-1 tabular-nums">{p.games} GP · {ppg} PPG</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </>
  );
}