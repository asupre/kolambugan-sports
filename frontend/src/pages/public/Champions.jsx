import { useEffect, useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { api } from "../../api";
import { Panel, PhotoRowSkeleton, Crest, SportTabs } from "../../components/PublicUI";
import { Lightbox } from "../../components/DocumentViewer";
import Reveal from "../../components/Reveal";
import { formatPrize } from "../../lib/peso";
import { ScrollLock } from "../../lib/scrollLock";

// Champions (Oct 2026 redesign): a LEADERBOARD of barangays ranked by titles comes first;
// tapping a barangay's name opens its trophy cabinet (every title, with photos, MVP, prize).
// The year-by-year archive stays underneath. The sport tabs filter all of it.
// TWO leaderboards (Oct 2026): THIS SEASON (titles the Super Admin ticked "This season", so the
// public sees who is the overall champion of the current season) and ALL-TIME (every title,
// so past champions stay visible after a season ends).
//
// Champions are free text (no Team / Barangay link, see models/Champion.js), so a barangay
// is matched to its crest by NAME against /api/barangays (case / spacing tolerant).

// ?f= is the photo's file id (photoRev), so a replaced photo gets a new URL
// and visitors see it without a hard refresh (Oct 2026).
const photoUrl = (c) => `/api/champions/${c.id}/photo?f=${c.photoRev || "none"}`;
const titleOf = (c) => c.teamName || `Barangay ${c.barangay}`;
const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
const MEDAL = { 1: "/medals/trophy.png", 2: "/medals/2nd-place.png", 3: "/medals/3rd-place.png" };
const ANTON = { fontFamily: "Anton, sans-serif" };

// Barangays ranked by titles. Ties share a rank (1, 1, 3); within a tie, the more recent
// winner is listed first, then A-Z.
function buildBoard(list) {
  const by = new Map();
  list.forEach((c) => {
    const key = norm(c.barangay);
    const row = by.get(key) || { name: c.barangay, titles: [], sports: {} };
    row.titles.push(c);
    row.sports[c.sport] = (row.sports[c.sport] || 0) + 1;
    by.set(key, row);
  });
  const rows = [...by.values()].map((r) => ({
    ...r,
    count: r.titles.length,
    latest: Math.max(...r.titles.map((t) => t.year)),
    first: Math.min(...r.titles.map((t) => t.year)),
    sportList: Object.entries(r.sports).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  }));
  rows.sort((a, b) => b.count - a.count || b.latest - a.latest || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].count === r.count ? rows[i - 1].rank : i + 1; });
  return rows;
}

export default function Champions() {
  const [champions, setChampions] = useState([]);
  const [season, setSeason] = useState(null);           // { name, status } of the current season
  const [brgyIds, setBrgyIds] = useState({});          // normalised name -> barangay id (crests)
  const [sport, setSport] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(() => new Set()); // photos that didn't load
  const [gallery, setGallery] = useState(null);         // { list, i } for the zoom viewer
  const [cabinet, setCabinet] = useState(null);         // barangay name whose titles are open

  useEffect(() => {
    let alive = true;
    api("/api/champions")
      .then((d) => { if (alive) { setChampions(d.champions || []); setSeason(d.currentSeason || null); } })
      .catch(() => { if (alive) setChampions([]); })
      .finally(() => { if (alive) setLoading(false); });
    api("/api/barangays")
      .then((d) => {
        if (!alive) return;
        const map = {};
        (d.barangays || []).forEach((b) => { map[norm(b.name)] = b._id; });
        setBrgyIds(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const sports = [...new Set(champions.map((c) => c.sport))].sort();
  const shown = sport ? champions.filter((c) => c.sport === sport) : champions;
  const board = useMemo(() => buildBoard(shown), [shown]);
  const seasonShown = shown.filter((c) => c.thisSeason);
  const seasonBoard = buildBoard(seasonShown);
  // Overall champion = the barangay alone at the top of this season's board (a tie names nobody).
  const leaderCount = seasonBoard.filter((r) => r.rank === 1).length;
  const seasonDone = season?.status === "completed";

  const byYear = {};
  shown.forEach((c) => { (byYear[c.year] = byYear[c.year] || []).push(c); });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  const okPhoto = (c) => c.hasPhoto && !failed.has(c.id);
  const markFailed = (id) => setFailed((s) => new Set(s).add(id));
  // The zoom viewer pages through the photos of whatever list the click came from.
  const openPhoto = (list, c) => {
    const withPhoto = list.filter(okPhoto);
    setGallery({ list: withPhoto, i: Math.max(0, withPhoto.findIndex((p) => p.id === c.id)) });
  };
  const idOf = (name) => brgyIds[norm(name)] || null;

  // The cabinet shows EVERY title of that barangay (all sports), newest first.
  const cabinetRow = cabinet ? buildBoard(champions).find((r) => norm(r.name) === norm(cabinet)) : null;
  const archiveList = years.flatMap((y) => byYear[y]);

  return (
    <>
      <h1 className="text-slate-50 text-[32px] sm:text-[40px] font-semibold tracking-tight leading-tight mb-1.5">Champions</h1>
      <p className="text-slate-400 text-[16px] sm:text-[17px] mb-6">
        {loading ? " " : "Which barangay has won the most? Tap a name to see its titles."}
      </p>

      {sports.length > 0 && (
        <SportTabs sports={sports} value={sport} onChange={setSport} allLabel="All sports" />
      )}

      {loading ? (
        <PhotoRowSkeleton rows={2} />
      ) : shown.length === 0 ? (
        <Panel emptyTitle="No champions recorded yet" emptyIcon="trophy" empty="Past winners appear here once the SK Federation records them." />
      ) : (
        <>
          <div className="mb-8 grid gap-5 lg:grid-cols-2 lg:items-start">
            <Reveal>
              <Panel
                title={season ? `${season.name} leaderboard` : "This season"}
                count={seasonShown.length
                  ? `${seasonDone ? "Final" : "So far"} · ${seasonShown.length} ${seasonShown.length === 1 ? "title" : "titles"}`
                  : "This season"}
                emptyTitle={seasonShown.length ? undefined : "No champions crowned yet this season"}
                emptyIcon="trophy"
                empty={seasonShown.length ? undefined : "As each division finishes, its champion is added here and the barangays are ranked."}

              >
                {seasonShown.length > 0 && (
                  <ol>
                    {seasonBoard.map((r) => (
                      <LeaderRow key={norm(r.name)} r={r} barangayId={idOf(r.name)} onOpen={() => setCabinet(r.name)}
                        overall={r.rank === 1 && leaderCount === 1 ? (seasonDone ? "Overall champion" : "Leading the season") : null} />
                    ))}
                  </ol>
                )}
              </Panel>
            </Reveal>
            <Reveal delay={0.08}>
              <Panel
                title="All-time leaderboard"
                count={`${board.length} ${board.length === 1 ? "barangay" : "barangays"} · ${shown.length} ${shown.length === 1 ? "title" : "titles"}${sport ? ` in ${sport}` : ""}`}

              >
                <ol>
                  {board.map((r) => (
                    <LeaderRow key={norm(r.name)} r={r} barangayId={idOf(r.name)} onOpen={() => setCabinet(r.name)} />
                  ))}
                </ol>
              </Panel>
            </Reveal>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-slate-100 text-[20px] font-semibold tracking-tight">Every title</h2>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>
          {years.map((y) => (
            <Reveal key={y}>
              <section className="mb-7">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-[#4ADE80] text-[26px] font-bold tabular-nums leading-none" style={ANTON}>{y}</h3>
                  <span className="text-slate-500 text-[13px]">
                    {byYear[y].length} {byYear[y].length === 1 ? "title" : "titles"}
                  </span>
                  <div className="h-px flex-1 bg-[#242C27]" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {byYear[y].map((c) => (
                    <ChampionCard
                      key={c.id}
                      c={c}
                      showPhoto={okPhoto(c)}
                      onOpenPhoto={() => openPhoto(archiveList, c)}
                      onPhotoError={() => markFailed(c.id)}
                      onOpenBarangay={() => setCabinet(c.barangay)}
                    />
                  ))}
                </div>
              </section>
            </Reveal>
          ))}
        </>
      )}

      {/* The zoom viewer is itself a dialog: opened from the cabinet it must render INSIDE the
          cabinet (below), or the cabinet would treat clicks on it as "outside" and close. */}
      {gallery && !cabinetRow && <GalleryViewer gallery={gallery} setGallery={setGallery} />}

      <BarangayCabinet
        row={cabinetRow}
        barangayId={cabinetRow ? idOf(cabinetRow.name) : null}
        onClose={() => { setCabinet(null); setGallery(null); }}
        okPhoto={okPhoto}
        onPhotoError={markFailed}
        onOpenPhoto={(c) => openPhoto(cabinetRow.titles, c)}
      >
        {gallery && cabinetRow && <GalleryViewer gallery={gallery} setGallery={setGallery} />}
      </BarangayCabinet>
    </>
  );
}

function GalleryViewer({ gallery, setGallery }) {
  const { list, i } = gallery;
  const c = list[i];
  if (!c) return null;
  const many = list.length > 1;
  return (
    <Lightbox
      src={photoUrl(c)}
      alt={`${c.year} ${c.sport} champion`}
      caption={`${c.year} ${c.sport}${c.division ? ` · ${c.division}` : ""} · ${titleOf(c)}`}
      position={many ? `${i + 1} / ${list.length}` : undefined}
      onClose={() => setGallery(null)}
      onPrev={many ? () => setGallery({ list, i: (i - 1 + list.length) % list.length }) : undefined}
      onNext={many ? () => setGallery({ list, i: (i + 1) % list.length }) : undefined}
    />
  );
}

// One leaderboard row. The barangay NAME is the button (the user asked for "names of brgy
// clickable"); the whole row is a big tap target on phones too.
function LeaderRow({ r, barangayId, onOpen, overall = null }) {
  const top = r.rank <= 3;
  return (
    <li className="border-b border-white/[0.08] last:border-0">
      <button
        type="button"
        onClick={onOpen}
        className={`group flex w-full items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 text-left transition hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-[#4ADE80]/60 ${
          r.rank === 1 ? "bg-[#F5A524]/[0.06]" : ""
        }`}
      >
        <span className="flex w-8 shrink-0 justify-center">
          {top ? (
            <img src={MEDAL[r.rank]} alt={`Rank ${r.rank}`} className="size-7 object-contain" loading="lazy" decoding="async" />
          ) : (
            <span className="text-slate-500 text-[16px] font-semibold tabular-nums">{r.rank}</span>
          )}
        </span>
        <Crest name={r.name} barangayId={barangayId} size={44} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[17px] font-semibold group-hover:text-[#4ADE80] group-hover:underline underline-offset-4 ${r.rank === 1 ? "text-[#F5A524]" : "text-slate-100"}`}>
            {r.name}
          </span>
          {overall && (
            <span className="mt-1 inline-block rounded-full bg-[#F5A524]/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#F5A524]">
              {overall}
            </span>
          )}
          <span className="mt-1 flex flex-wrap gap-1.5">
            {r.sportList.map(([s, n]) => (
              <span key={s} className="rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-[12px] text-slate-300">
                {s}{n > 1 ? ` ×${n}` : ""}
              </span>
            ))}
          </span>
        </span>
        <span className="hidden sm:block shrink-0 text-right text-slate-400 text-[13px] leading-tight">
          Last won<br /><span className="text-slate-200 text-[15px] font-semibold tabular-nums">{r.latest}</span>
        </span>
        <span className="shrink-0 w-14 text-right">
          <span className={`block text-[30px] leading-none tabular-nums ${r.rank === 1 ? "text-[#F5A524]" : "text-slate-100"}`} style={ANTON}>{r.count}</span>
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mt-1">{r.count === 1 ? "title" : "titles"}</span>
        </span>
      </button>
    </li>
  );
}

// The barangay's trophy cabinet: a dark dialog with its crest, totals and every title it won.
function BarangayCabinet({ row, barangayId, onClose, okPhoto, onPhotoError, onOpenPhoto, children }) {
  const open = !!row;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/60" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-(--z-overlay) flex max-h-[90dvh] overscroll-contain w-[calc(100vw-24px)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0E1B2E] text-slate-100 shadow-2xl shadow-black/60 outline-none"
        >
          <ScrollLock />
          {row && (
            <>
              <div className="flex items-center gap-4 border-b border-white/[0.08] px-5 py-4 sm:px-6">
                <Crest name={row.name} barangayId={barangayId} size={56} />
                <div className="min-w-0 flex-1">
                  <DialogPrimitive.Title className="line-clamp-2 text-[20px] sm:text-[22px] font-semibold leading-tight tracking-tight">
                    Barangay {row.name}
                  </DialogPrimitive.Title>
                  <p className="text-slate-400 text-[14px]">
                    {row.count} {row.count === 1 ? "title" : "titles"}
                    {row.first === row.latest ? ` · ${row.latest}` : ` · ${row.first} to ${row.latest}`}
                  </p>
                </div>
                <DialogPrimitive.Close
                  aria-label="Close"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </DialogPrimitive.Close>
              </div>

              <div className="overflow-y-auto overscroll-contain scrollbar-public px-5 py-5 sm:px-6">
                <div className="mb-5 flex flex-wrap gap-2">
                  {row.sportList.map(([s, n]) => (
                    <span key={s} className="rounded-full border border-[#4ADE80]/30 bg-[#4ADE80]/[0.08] px-3 py-1 text-[13px] font-medium text-[#4ADE80]">
                      {s} · {n} {n === 1 ? "title" : "titles"}
                    </span>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[...row.titles].sort((a, b) => b.year - a.year || a.sport.localeCompare(b.sport)).map((c) => (
                    <ChampionCard
                      key={c.id}
                      c={c}
                      showYear
                      showPhoto={okPhoto(c)}
                      onOpenPhoto={() => onOpenPhoto(c)}
                      onPhotoError={() => onPhotoError(c.id)}
                    />
                  ))}
                </div>
              </div>
              {children}
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ChampionCard({ c, showPhoto, onOpenPhoto, onPhotoError, onOpenBarangay, showYear }) {
  return (
    <article className="flex flex-col rounded-2xl border border-white/[0.12] bg-white/[0.05] lg:backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden">
      {showPhoto ? (
        <button
          type="button"
          onClick={onOpenPhoto}
          className="group relative block aspect-video w-full overflow-hidden bg-[#242C27] cursor-zoom-in"
          aria-label={`View photo: ${titleOf(c)}`}
        >
          <img
            src={photoUrl(c)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={onPhotoError}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[12px] font-medium text-white opacity-90 group-hover:opacity-100">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
            </svg>
            Zoom
          </span>
        </button>
      ) : (
        <div className="relative flex aspect-video w-full items-center justify-center bg-white/[0.04]">
          <Crest name={c.barangay} size={64} />
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2 mb-1">
          {showYear && <span className="text-slate-100 text-[13px] font-bold tabular-nums">{c.year}</span>}
          <span className="text-[#4ADE80] text-[13px] font-semibold uppercase tracking-wide">{c.sport}</span>
          {c.division && <span className="text-slate-500 text-[13px]">· {c.division}</span>}
        </div>

        <h3 className="text-slate-50 text-[20px] font-semibold tracking-tight leading-tight">{titleOf(c)}</h3>
        {onOpenBarangay ? (
          <button
            type="button"
            onClick={onOpenBarangay}
            className="self-start text-left text-[#4ADE80] text-[14px] mt-0.5 hover:underline underline-offset-4"
          >
            Barangay {c.barangay} →
          </button>
        ) : (
          c.teamName && <p className="text-slate-400 text-[14px] mt-0.5">Barangay {c.barangay}</p>
        )}

        {(c.mvp || c.prize) && (
          <dl className="mt-3 pt-3 border-t border-white/[0.08] grid grid-cols-2 gap-3">
            {c.mvp && (
              <div className="min-w-0">
                <dt className="text-slate-500 text-[12px] uppercase tracking-wider">MVP</dt>
                <dd className="text-slate-100 text-[15px] font-medium truncate">{c.mvp}</dd>
              </div>
            )}
            {c.prize && (
              <div className="min-w-0">
                <dt className="text-slate-500 text-[12px] uppercase tracking-wider">Prize</dt>
                <dd className="text-slate-100 text-[15px] font-medium truncate">{formatPrize(c.prize)}</dd>
              </div>
            )}
          </dl>
        )}

        {c.notes && <p className="text-slate-400 text-[14px] mt-3 leading-relaxed">{c.notes}</p>}
      </div>
    </article>
  );
}
