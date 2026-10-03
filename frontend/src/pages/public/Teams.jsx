import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Crest, Panel, TileGridSkeleton, SportTabs, SearchInput, Tag, DIVISION_LABEL, FORMAT_LABEL } from "../../components/PublicUI";
import Reveal from "../../components/Reveal";
import DepthCarousel from "../../components/DepthCarousel";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { posterCarouselProps } from "../../lib/posterCarousel";

// One big, grabbable box per team, poster-card style: the crest fills the
// ENTIRE card (not just a top strip), with the team's name/barangay/format
// overlaid at the bottom on a dark scrim so the text stays legible over
// whatever the photo looks like. Fixed width so the row scrolls
// horizontally instead of wrapping.
// Oct 2026: a slide in a Depth Carousel, like the Players page; it fills the
// carousel's card box.
function TeamCard({ t }) {
  return (
    <div className="h-full w-full">
      <Link
        to={`/teams/${t.id}`}
        draggable={false}
        className="group relative block h-full w-full overflow-hidden rounded-[14px] border border-white/[0.12] hover:border-[#FACC15]/50 transition"
      >
        <Crest name={t.barangay || t.name} barangayId={t.barangayId} variant="cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3.5 pt-14 pb-3.5">
          <div className="text-white text-[19px] font-bold uppercase leading-tight truncate">{t.name}</div>
          <div className="text-slate-300 text-[14px] truncate mt-0.5">
            {t.barangay ? `Brgy. ${t.barangay}` : "—"}
          </div>
          {t.format && (
            <span className="inline-block mt-2 rounded-full border border-[#FACC15]/40 bg-black/30 px-2.5 py-0.5 text-[12px] font-medium text-[#FACC15]">
              {FORMAT_LABEL[t.format] || t.format}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

// Module-level, so it is a stable renderItem: the carousel's memoized cards
// then never re-render while it moves (see the Players page).
const renderTeam = (t) => <TeamCard t={t} />;

// One sport + division: a Depth Carousel of TeamCards, same settings as Players.
function TeamGroupPanel({ sportName, division, list }) {
  const wide = useMediaQuery("(min-width: 640px)");
  return (
    <Panel
      className="[content-visibility:auto] [contain-intrinsic-size:auto_480px]"
      blur={false}
      title={`${sportName} · ${DIVISION_LABEL[division] || division}`}
      count={`${list.length}`}
    >
      {/* The whole carousel reveals as ONE layer (per-card reveals stuttered on phones). */}
      <Reveal className="px-2 sm:px-5 pt-5 pb-3">
        <DepthCarousel
          items={list}
          getKey={(t) => t.id}
          label={`${sportName} ${DIVISION_LABEL[division] || division} teams`}
          {...posterCarouselProps(wide)}
          renderItem={renderTeam}
        />
      </Reveal>
    </Panel>
  );
}

// Rosters don't change mid-game, so this page doesn't poll.
export default function Teams() {
  const [teams, setTeams] = useState([]);
  const [sports, setSports] = useState([]);
  const [sport, setSport] = useState("");
  const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");

  useEffect(() => {
    api("/api/public/tournaments")
      .then((d) => setSports([...new Set((d.tournaments || []).map((t) => t.sport))].sort()))
      .catch(() => setSports([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api(`/api/public/teams${sport ? `?sport=${encodeURIComponent(sport)}` : ""}`)
      .then((d) => { if (alive) setTeams(d.teams || []); })
      .catch(() => { if (alive) setTeams([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sport]);

   // Group by sport, then division — a barangay can field both U15 and U30.
  const needle = q.trim().toLowerCase();
  const visible = needle
    ? teams.filter((t) => `${t.name} ${t.barangay || ""}`.toLowerCase().includes(needle))
    : teams;

  const groups = {};
  visible.forEach((t) => {
    const key = `${t.sport || "—"}||${t.division || "open"}`;
    (groups[key] = groups[key] || []).push(t);
  });
  const keys = Object.keys(groups).sort();;

  return (
    <>
      <h1 className="text-slate-50 text-[32px] sm:text-[40px] font-semibold tracking-tight leading-tight mb-1.5">Teams</h1>
      <p className="text-slate-400 text-[16px] sm:text-[17px] mb-6">
        {loading
          ? "\u00A0"
          : needle
          ? `${visible.length} of ${teams.length} ${teams.length === 1 ? "team" : "teams"} match "${q.trim()}"`
          : `${teams.length} verified ${teams.length === 1 ? "team" : "teams"} this season`}
      </p>

      <SportTabs sports={sports} value={sport} onChange={setSport} />
            <SearchInput value={q} onChange={setQ} placeholder="Search a team or barangay…" />

      {loading ? (
        <>
          <TileGridSkeleton tiles={6} cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />
          <TileGridSkeleton tiles={3} cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />
        </>
            ) : visible.length === 0 ? (
        <Panel emptyTitle={q ? "No matching teams" : "No verified teams yet"} emptyIcon={q ? "search" : "users"}
          empty={q ? `Nothing matches "${q}". Try a barangay name.` : "Teams appear here once the SK Federation verifies their rosters."} />
      ) : (
        keys.map((key) => {
          const [sportName, division] = key.split("||");
          return (
            <TeamGroupPanel key={key} sportName={sportName} division={division} list={groups[key]} />
          );
        })
      )}
    </>
  );
}