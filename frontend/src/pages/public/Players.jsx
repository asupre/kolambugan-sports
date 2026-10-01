import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Panel, TileGridSkeleton, SportTabs, SearchInput, DIVISION_LABEL, initials, playerPhotoUrl, SHOW_PLAYER_PHOTOS } from "../../components/PublicUI";
import { RevealGroup, RevealItem } from "../../components/Reveal";

// Points only compare WITHIN a sport, so a sport is always selected.
const PREFERRED = "Basketball";

// Round portrait. Degrades to a monogram, so a roster with no photos uploaded
// still reads as a list of people rather than a wall of empty tiles.
function PhotoTile({ player }) {
  const [failed, setFailed] = useState(false);
  const name = `${player.firstName || ""} ${player.lastName || ""}`.trim();
  const show = SHOW_PLAYER_PHOTOS && player.hasPhoto && !failed;
  return (
    <div className="w-20 h-20 rounded-full overflow-hidden bg-[#22344F] flex items-center justify-center shrink-0">
      {show ? (
        <img
          src={playerPhotoUrl(player.id)}
          alt=""
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-slate-400 text-base font-semibold">{initials(name) || "—"}</span>
      )}
    </div>
  );
}

function PlayerCard({ p }) {
  return (
    <RevealItem className="border-r border-b border-white/[0.08] bg-white/[0.03]">
    <div className="flex h-full flex-col items-center text-center px-3 py-4">
      <PhotoTile player={p} />
      <div className="mt-2.5 flex items-baseline gap-1.5 max-w-full">
        <span className="text-[#FACC15] text-[17px] font-bold tabular-nums shrink-0">
          {p.jerseyNumber ?? "—"}
        </span>
        <span className="text-slate-100 text-[15px] font-semibold truncate">{p.lastName}</span>
      </div>
      <div className="text-slate-400 text-[13px] truncate max-w-full">{p.firstName}</div>
      {p.stats?.points > 0 && (
        <div className="text-slate-500 text-[12px] mt-1 tabular-nums">
          {p.stats.points} PTS · {p.stats.games} GP
        </div>
      )}
    </div>
    </RevealItem>
  );
}

export default function Players() {
  // The "Top scorers" view was removed Oct 2026 (Super Admin request): rosters only.
  const [teams, setTeams] = useState([]);
  const [sports, setSports] = useState([]);
  const [sport, setSport] = useState("");
  const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");

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
    api(`/api/public/players?sport=${q}`)
      .then((d) => { if (alive) setTeams(d.teams || []); })
      .catch(() => { if (alive) setTeams([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sport]);

    // Searching matches a player's name, or a team's — typing a barangay should
  // show that whole squad rather than nothing.
  const needle = q.trim().toLowerCase();
  const visibleTeams = !needle ? teams : teams
    .map((t) => {
      const teamHit = `${t.name} ${t.barangay || ""}`.toLowerCase().includes(needle);
      return {
        ...t,
        players: teamHit
          ? t.players
          : (t.players || []).filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(needle)),
      };
    })
    .filter((t) => t.players.length > 0);

  const total = visibleTeams.reduce((n, t) => n + (t.players?.length || 0), 0);

  return (
    <>
      <h1 className="text-slate-100 text-[28px] font-semibold tracking-tight mb-1">Players</h1>
      <p className="text-slate-400 text-[15px] mb-4">
        {loading ? "\u00A0"
          : `${total} ${total === 1 ? "player" : "players"} across ${teams.length} ${teams.length === 1 ? "team" : "teams"}`}
      </p>

      <SportTabs sports={sports} value={sport} onChange={setSport} allLabel={null} />
            <SearchInput value={q} onChange={setQ}
        placeholder="Search a player, team, or barangay…" />

      {loading ? (
        <TileGridSkeleton tiles={12} cols="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" />
      ) : (
                visibleTeams.length === 0 ? (
          <Panel empty={`No verified ${sport || ""} teams yet.`} />
        ) : (
                    visibleTeams.map((t) => (
            <Panel
              key={t.id}
              title={t.name}
              count={`${t.barangay ? `Brgy. ${t.barangay} · ` : ""}${DIVISION_LABEL[t.division] || t.division} · ${t.players.length}`}
              empty="No players listed."
            >
              {t.players.length > 0 && (
                <>
                  <div className="overflow-hidden">
                  <RevealGroup className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 -mr-px -mb-px">
                    {t.players.map((p) => <PlayerCard key={p.id} p={p} />)}
                  </RevealGroup>
                  </div>
                  <div className="px-4 sm:px-5 py-3.5 border-t border-white/[0.08]">
                    <Link to={`/teams/${t.id}`} className="text-[#FACC15] text-[14px] font-medium hover:underline">
                      Team page →
                    </Link>
                  </div>
                </>
              )}
            </Panel>
          ))
        )
      )}
    </>
  );
}