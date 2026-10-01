import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Panel, CarouselArrow, TileGridSkeleton, SportTabs, SearchInput, DIVISION_LABEL, initials, playerPhotoUrl, SHOW_PLAYER_PHOTOS } from "../../components/PublicUI";
import Reveal from "../../components/Reveal";
import { useDragScroll } from "../../hooks/useDragScroll";

// Players page (Oct 2026): same look as Teams — one drag-scroll row per team of
// poster cards — but BIGGER cards (w-52 / sm:w-60 vs the team's w-44 / sm:w-48).
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
    <div className="w-52 sm:w-60 shrink-0 snap-start">
      <Link
        to={`/teams/${teamId}`}
        className="group relative block aspect-[3/4] w-full overflow-hidden rounded-xl border border-white/[0.12] hover:border-[#FACC15]/50 transition"
      >
        {show ? (
          <img
            src={playerPhotoUrl(p.id)}
            alt=""
            loading="lazy"
            decoding="async"
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

// One team: a drag-to-scroll row of PlayerCards with prev/next arrows in the
// panel header (shown only when the row overflows), like Teams' TeamGroupPanel.
function TeamRow({ t }) {
  const dragRef = useDragScroll();
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const el = dragRef.current;
    if (!el) return undefined;
    function update() {
      setAtStart(el.scrollLeft <= 4);
      setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 4);
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.players.length]);

  function scroll(dir) {
    dragRef.current?.scrollBy({ left: dir * dragRef.current.clientWidth * 0.9, behavior: "smooth" });
  }
  const scrollable = !atStart || !atEnd;

  return (
    <Panel
      title={t.name}
      count={`${t.barangay ? `Brgy. ${t.barangay} · ` : ""}${DIVISION_LABEL[t.division] || t.division} · ${t.players.length}`}
      empty="No players listed."
      actions={scrollable && (
        <>
          <CarouselArrow dir="prev" onClick={() => scroll(-1)} disabled={atStart} />
          <CarouselArrow dir="next" onClick={() => scroll(1)} disabled={atEnd} />
        </>
      )}
    >
      {t.players.length > 0 && (
        <>
          <div
            ref={dragRef}
            // overflow-y-hidden: see Teams.jsx — keeps the reveal offset from
            // adding a vertical scrollbar inside the row.
            className="overflow-x-auto overflow-y-hidden cursor-grab snap-x snap-mandatory scroll-px-4 sm:scroll-px-5 px-4 sm:px-5 py-5"
          >
            {/* The whole row reveals as ONE layer (per-card reveals stuttered on phones). */}
            <Reveal className="flex gap-3">
              {t.players.map((p) => <PlayerCard key={p.id} p={p} teamId={t.id} />)}
            </Reveal>
          </div>
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
