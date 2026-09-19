import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Crest, Panel, CarouselArrow, TileGridSkeleton, SportTabs, SearchInput, Tag, DIVISION_LABEL, FORMAT_LABEL } from "../../components/PublicUI";
import { RevealGroup, RevealItem } from "../../components/Reveal";
import { useDragScroll } from "../../hooks/useDragScroll";

// One big, grabbable box per team, poster-card style: the crest fills the
// ENTIRE card (not just a top strip), with the team's name/barangay/format
// overlaid at the bottom on a dark scrim so the text stays legible over
// whatever the photo looks like. Fixed width so the row scrolls
// horizontally instead of wrapping.
function TeamCard({ t }) {
  return (
    <RevealItem className="w-40 sm:w-44 shrink-0 snap-start">
      <Link
        to={`/teams/${t.id}`}
        className="group relative block aspect-[3/4] w-full overflow-hidden rounded-xl border border-[#1C2430] hover:border-[#F5A524]/50 transition"
      >
        <Crest name={t.barangay || t.name} barangayId={t.barangayId} variant="cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3 pt-12 pb-3">
          <div className="text-white text-[15px] font-bold leading-tight truncate">{t.name}</div>
          <div className="text-slate-300 text-[11px] truncate mt-0.5">
            {t.barangay ? `Brgy. ${t.barangay}` : "—"}
          </div>
          {t.format && (
            <span className="inline-block mt-1.5 rounded-full border border-[#F5A524]/40 bg-black/30 px-2 py-0.5 text-[10px] font-medium text-[#F5A524]">
              {FORMAT_LABEL[t.format] || t.format}
            </span>
          )}
        </div>
      </Link>
    </RevealItem>
  );
}

// A drag-to-scroll row of TeamCards, with prev/next arrows in the panel
// header for anyone who'd rather click than grab. Arrows disable themselves
// at either end instead of just doing nothing.
function TeamGroupPanel({ sportName, division, list }) {
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
  }, [list.length]);

  function scroll(dir) {
    dragRef.current?.scrollBy({ left: dir * dragRef.current.clientWidth * 0.9, behavior: "smooth" });
  }

  const scrollable = !atStart || !atEnd;

  return (
    <Panel
      title={`${sportName} · ${DIVISION_LABEL[division] || division}`}
      count={`${list.length}`}
      actions={scrollable && (
        <>
          <CarouselArrow dir="prev" onClick={() => scroll(-1)} disabled={atStart} />
          <CarouselArrow dir="next" onClick={() => scroll(1)} disabled={atEnd} />
        </>
      )}
    >
      <div
        ref={dragRef}
        className="overflow-x-auto cursor-grab snap-x snap-mandatory px-5 py-5"
      >
        <RevealGroup className="flex gap-3">
          {list.map((t) => <TeamCard key={t.id} t={t} />)}
        </RevealGroup>
      </div>
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
      <h1 className="text-slate-100 text-2xl font-semibold tracking-tight mb-1">Teams</h1>
      <p className="text-slate-500 text-sm mb-4">
        {loading ? "\u00A0" : `${teams.length} verified ${teams.length === 1 ? "team" : "teams"} this season`}
      </p>

      <SportTabs sports={sports} value={sport} onChange={setSport} />
            <SearchInput value={q} onChange={setQ} placeholder="Search a team or barangay…" />

      {loading ? (
        <>
          <TileGridSkeleton tiles={6} cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />
          <TileGridSkeleton tiles={3} cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />
        </>
            ) : visible.length === 0 ? (
        <Panel empty={q ? `No teams match "${q}".` : "No verified teams yet. Teams appear here once residency review is complete."} />
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