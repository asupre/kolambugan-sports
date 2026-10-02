import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Panel, TileGridSkeleton, SportTabs, SearchInput, DIVISION_LABEL, initials, playerPhotoUrl, SHOW_PLAYER_PHOTOS } from "../../components/PublicUI";
import Reveal from "../../components/Reveal";
import DepthCarousel from "../../components/DepthCarousel";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { posterCarouselProps } from "../../lib/posterCarousel";

// Players page (Oct 2026): one React Bits "Depth Carousel" per team: the front
// player's poster card faces you, the rest stack back in 3D. Drag, swipe,
// arrows, dots or the keyboard move it; tapping a side card brings it forward,
// tapping the front card opens the team page.
// Opens on the FIRST sport tab (it used to jump to Basketball, skipping the
// Badminton tab that sits first in line).

// Poster card: the headshot fills the card; with no photo, big initials on a
// soft gradient. Jersey + surname on a dark scrim at the bottom. Clicking goes
// to the player's team page (players have no page of their own).
function PlayerCard({ p, teamId }) {
  const [failed, setFailed] = useState(false);
  const name = `${p.firstName || ""} ${p.lastName || ""}`.trim();
  const show = SHOW_PLAYER_PHOTOS && p.hasPhoto && !failed;
  return (
    <div className="h-full w-full">
      <Link
        to={`/teams/${teamId}`}
        draggable={false}
        className="group relative block h-full w-full overflow-hidden rounded-[14px] border border-white/[0.12] hover:border-[#FACC15]/50 transition"
      >
        {show ? (
          <img
            src={playerPhotoUrl(p.id)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover bg-[#22344F]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center pb-20 bg-gradient-to-br from-[#1E3A5F] via-[#172840] to-[#0E2340]">
            <span className="text-white/25 text-[64px] font-bold tracking-tight" style={{ fontFamily: "Anton, sans-serif" }}>
              {initials(name) || "—"}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3.5 pt-14 pb-3.5">
          <div className="flex items-baseline gap-2 min-w-0">
            {p.jerseyNumber != null && (
              <span className="text-[#FACC15] text-[22px] leading-none tabular-nums shrink-0" style={{ fontFamily: "Anton, sans-serif" }}>
                {p.jerseyNumber}
              </span>
            )}
            <span className="text-white text-[19px] font-bold uppercase leading-tight truncate">{p.lastName}</span>
          </div>
          <div className="text-slate-300 text-[14px] truncate mt-0.5">{p.firstName}</div>
          {p.stats?.points > 0 && (
            <span className="inline-block mt-2 rounded-full border border-[#FACC15]/40 bg-black/30 px-2.5 py-0.5 text-[12px] font-medium text-[#FACC15] tabular-nums">
              {p.stats.points} PTS · {p.stats.games} GP
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

// One team: a Depth Carousel of PlayerCards. Phones: a 250px front card that
// uses the full width (no arrows, so no side padding) and a tighter stack.
function TeamRow({ t }) {
  const wide = useMediaQuery("(min-width: 640px)");
  // Stable, so the carousel's memoized cards never re-render while it moves.
  const renderPlayer = useCallback((p) => <PlayerCard p={p} teamId={t.id} />, [t.id]);
  return (
    <Panel
      className="[content-visibility:auto] [contain-intrinsic-size:auto_480px]"
      blur={false}
      title={t.name}
      count={`${t.barangay ? `Brgy. ${t.barangay} · ` : ""}${DIVISION_LABEL[t.division] || t.division} · ${t.players.length}`}
      empty="No players listed."
    >
      {t.players.length > 0 && (
        <>
          <Reveal className="px-2 sm:px-5 pt-5 pb-3">
            <DepthCarousel
              items={t.players}
              getKey={(p) => p.id}
              label={`${t.name} players`}
              {...posterCarouselProps(wide)}
              renderItem={renderPlayer}
            />
          </Reveal>
          <div className="px-4 sm:px-5 py-3.5 border-t border-white/[0.08]">
            <Link to={`/teams/${t.id}`} className="text-[#FACC15] text-[14px] font-medium hover:underline">
              Team page →
            </Link>
          </div>
        </>
      )}
    </Panel>
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
        // The first tab in line — no favourite sport.
        setSport(list[0] || "");
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
        {loading ? " "
          : `${total} ${total === 1 ? "player" : "players"} across ${teams.length} ${teams.length === 1 ? "team" : "teams"}`}
      </p>

      <SportTabs sports={sports} value={sport} onChange={setSport} allLabel={null} />
      <SearchInput value={q} onChange={setQ} placeholder="Search a player, team, or barangay…" />

      {loading ? (
        <TileGridSkeleton tiles={10} cols="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" />
      ) : visibleTeams.length === 0 ? (
        <Panel empty={`No verified ${sport || ""} teams yet.`} />
      ) : (
        visibleTeams.map((t) => <TeamRow key={t.id} t={t} />)
      )}
    </>
  );
}
