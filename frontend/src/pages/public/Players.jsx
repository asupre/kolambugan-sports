import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { Panel, TileGridSkeleton, SportTabs, SearchInput, DIVISION_LABEL, initials, playerPhotoUrl, SHOW_PLAYER_PHOTOS } from "../../components/PublicUI";
import Reveal from "../../components/Reveal";
import { StarIcon } from "../../components/MvpBadge";
import DepthCarousel from "../../components/DepthCarousel";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { posterCarouselProps } from "../../lib/posterCarousel";

// Players page (Oct 2026): one React Bits "Depth Carousel" per team: the front
// player's poster card faces you, the rest stack back in 3D. Drag, swipe,
// arrows, dots or the keyboard move it; tapping a side card brings it forward,
// tapping the front card opens the team page.
// Opens on the FIRST sport tab (it used to jump to Basketball, skipping the
// Badminton tab that sits first in line).

// Poster card that FLIPS (Oct 2026). Front: the headshot fills the card (no photo = big
// initials), jersey + surname on a dark scrim, a star if they've been a match MVP. Tap the
// front card: it turns over to games played, points and MVP awards. Tap the back: the
// team page, scrolled to this player's row of full stats (?player=<id>).
// The carousel swallows a tap on a SIDE card (it only brings it forward), so only the front
// card ever flips. The flip is a CSS transform on this card only; the carousel never
// re-renders for it (renderItem stays stable, see TeamRow).
const ANTON = { fontFamily: "Anton, sans-serif" };
const FACE = "absolute inset-0 overflow-hidden rounded-[14px] [backface-visibility:hidden]";

// One stat on the back: label left, big number right (rows, so all three fit a 333px phone card).
function StatBlock({ value, label }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.1] bg-white/[0.05] px-3.5 py-2">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-300">{label}</span>
      <span className="text-slate-100 text-[28px] leading-none tabular-nums" style={ANTON}>{value}</span>
    </div>
  );
}

function PlayerCard({ p, teamId }) {
  const [failed, setFailed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const navigate = useNavigate();
  const name = `${p.firstName || ""} ${p.lastName || ""}`.trim();
  const show = SHOW_PLAYER_PHOTOS && p.hasPhoto && !failed;
  const s = p.stats || {};
  const games = s.games || 0;
  const points = s.points || 0;
  const mvps = s.mvps || 0;

  function onClick() {
    if (!flipped) setFlipped(true);
    else navigate(`/teams/${teamId}?player=${p.id}`);
  }

  return (
    <div className="h-full w-full [perspective:1100px]">
      <button
        type="button"
        onClick={onClick}
        draggable={false}
        aria-label={flipped ? `${name}: open full stats on the team page` : `${name}: show season stats`}
        className={`group relative block h-full w-full rounded-[14px] text-left outline-none [transform-style:preserve-3d] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-[#FACC15]/60 ${flipped ? "[transform:rotateY(180deg)]" : ""}`}
      >
        {/* FRONT */}
        <div className={`${FACE} border border-white/[0.12] group-hover:border-[#FACC15]/50 transition-colors`}>
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
              <span className="text-white/25 text-[64px] font-bold tracking-tight" style={ANTON}>
                {initials(name) || "?"}
              </span>
            </div>
          )}
          {mvps > 0 && (
            <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-[#FACC15]/50 bg-black/55 px-2 py-0.5 text-[12px] font-bold text-[#FACC15]">
              <StarIcon /> {mvps > 1 ? `MVP ×${mvps}` : "MVP"}
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3.5 pt-14 pb-3.5">
            <div className="flex items-baseline gap-2 min-w-0">
              {p.jerseyNumber != null && (
                <span className="text-[#FACC15] text-[22px] leading-none tabular-nums shrink-0" style={ANTON}>
                  {p.jerseyNumber}
                </span>
              )}
              <span className="text-white text-[19px] font-bold uppercase leading-tight truncate">{p.lastName}</span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span className="text-slate-300 text-[14px] truncate">{p.firstName}</span>
              <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" /><path d="M21 3v5h-5" />
                </svg> Stats
              </span>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div className={`${FACE} [transform:rotateY(180deg)] flex flex-col border border-[#FACC15]/40 bg-gradient-to-b from-[#1A2E4C] via-[#122036] to-[#0B1626] p-4`}>
          <div className="flex items-baseline gap-2 min-w-0">
            {p.jerseyNumber != null && (
              <span className="text-[#FACC15] text-[26px] leading-none tabular-nums shrink-0" style={ANTON}>{p.jerseyNumber}</span>
            )}
            <div className="min-w-0">
              <div className="text-white text-[19px] font-bold uppercase leading-tight truncate">{p.lastName}</div>
              <div className="text-slate-300 text-[14px] truncate">{p.firstName}</div>
            </div>
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-[#FACC15]">This season</p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            <StatBlock value={games} label="Games played" />
            <StatBlock value={points} label="Points" />
            <StatBlock value={mvps} label={mvps === 1 ? "MVP award" : "MVP awards"} />
          </div>
          <span className="mt-auto pt-3 text-center text-[13px] font-medium text-[#FACC15]">
            Tap for full stats →
          </span>
        </div>
      </button>
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
      <h1 className="text-slate-50 text-[32px] sm:text-[40px] font-semibold tracking-tight leading-tight mb-1.5">Players</h1>
      <p className="text-slate-400 text-[16px] sm:text-[17px] mb-6">
        {loading ? " "
          : `${total} ${total === 1 ? "player" : "players"} across ${teams.length} ${teams.length === 1 ? "team" : "teams"}`}
      </p>

      <SportTabs sports={sports} value={sport} onChange={setSport} allLabel={null} />
      <SearchInput value={q} onChange={setQ} placeholder="Search a player, team, or barangay…" />

      {loading ? (
        <TileGridSkeleton tiles={10} cols="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" />
      ) : visibleTeams.length === 0 ? (
        <Panel emptyTitle="No players yet" emptyIcon="users" emptyAction={{ to: "/teams", label: "See the teams" }}
          empty={`Players appear here once ${sport ? `${sport} teams are` : "teams are"} verified.`} />
      ) : (
        visibleTeams.map((t) => <TeamRow key={t.id} t={t} />)
      )}
    </>
  );
}
