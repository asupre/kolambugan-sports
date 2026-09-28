import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { Panel, PhotoRowSkeleton, Crest, SportTabs } from "../../components/PublicUI";
import { Lightbox } from "../../components/DocumentViewer";
import Reveal from "../../components/Reveal";

const photoUrl = (c) => `/api/champions/${c.id}/photo?c=2`;
const titleOf = (c) => c.teamName || `Barangay ${c.barangay}`;

// Sport tabs come from the CHAMPIONS themselves, not the current season — a
// sport the league no longer runs still has a history worth showing.
export default function Champions() {
  const [champions, setChampions] = useState([]);
  const [sport, setSport] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // index into `withPhoto` of the open photo
  const [failed, setFailed] = useState(() => new Set()); // photos that didn't load

  useEffect(() => {
    let alive = true;
    api("/api/champions")
      .then((d) => { if (alive) setChampions(d.champions || []); })
      .catch(() => { if (alive) setChampions([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const sports = [...new Set(champions.map((c) => c.sport))].sort();
  const shown = sport ? champions.filter((c) => c.sport === sport) : champions;

  const byYear = {};
  shown.forEach((c) => { (byYear[c.year] = byYear[c.year] || []).push(c); });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  // The lightbox pages through every photo on screen, in display order.
  const withPhoto = years.flatMap((y) => byYear[y]).filter((c) => c.hasPhoto && !failed.has(c.id));
  const openPhoto = (c) => setOpen(withPhoto.findIndex((p) => p.id === c.id));
  const markFailed = (id) => setFailed((s) => new Set(s).add(id));

  // Titles per barangay across the whole archive (not the sport filter).
  const leaders = useMemo(() => {
    const tally = {};
    champions.forEach((c) => { tally[c.barangay] = (tally[c.barangay] || 0) + 1; });
    return Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  }, [champions]);

  const current = open != null ? withPhoto[open] : null;

  return (
    <>
      <h1 className="text-slate-100 text-[28px] font-semibold tracking-tight mb-1">Champions</h1>
      <p className="text-slate-400 text-[15px] mb-4">
        {loading ? " " : "Past winners of the Inter-Barangay Sports League"}
      </p>

      {sports.length > 0 && (
        <SportTabs sports={sports} value={sport} onChange={setSport} allLabel="All sports" />
      )}

      {loading ? (
        <PhotoRowSkeleton rows={2} />
      ) : shown.length === 0 ? (
        <Panel empty="No champions recorded yet." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <div className="min-w-0">
            {years.map((y) => (
              <Reveal key={y}>
                <section className="mb-7">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-[#F5A524] text-[26px] font-bold tabular-nums leading-none" style={{ fontFamily: "Anton, sans-serif" }}>
                      {y}
                    </h2>
                    <span className="text-slate-500 text-[13px]">
                      {byYear[y].length} {byYear[y].length === 1 ? "title" : "titles"}
                    </span>
                    <div className="h-px flex-1 bg-[#1C2430]" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {byYear[y].map((c) => (
                      <ChampionCard
                        key={c.id}
                        c={c}
                        showPhoto={c.hasPhoto && !failed.has(c.id)}
                        onOpenPhoto={() => openPhoto(c)}
                        onPhotoError={() => markFailed(c.id)}
                      />
                    ))}
                  </div>
                </section>
              </Reveal>
            ))}
          </div>

          {leaders.length > 0 && (
            <div className="lg:sticky lg:top-24">
              <Panel title="Most titles" count="all sports">
                <ol>
                  {leaders.map(([name, n], i) => (
                    <li key={name} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-[#1C2430] last:border-0">
                      <span className={`w-5 text-[15px] tabular-nums ${i === 0 ? "text-[#F5A524] font-semibold" : "text-slate-500"}`}>
                        {i + 1}
                      </span>
                      <span className={`flex-1 min-w-0 truncate text-[15px] ${i === 0 ? "text-slate-100 font-medium" : "text-slate-300"}`}>
                        {name}
                      </span>
                      <span className="text-slate-100 text-[15px] font-semibold tabular-nums">{n}</span>
                    </li>
                  ))}
                </ol>
              </Panel>
            </div>
          )}
        </div>
      )}

      {current && (
        <Lightbox
          src={photoUrl(current)}
          alt={`${current.year} ${current.sport} champion`}
          caption={`${current.year} ${current.sport}${current.division ? ` · ${current.division}` : ""} — ${titleOf(current)}`}
          position={withPhoto.length > 1 ? `${open + 1} / ${withPhoto.length}` : undefined}
          onClose={() => setOpen(null)}
          onPrev={withPhoto.length > 1 ? () => setOpen((i) => (i - 1 + withPhoto.length) % withPhoto.length) : undefined}
          onNext={withPhoto.length > 1 ? () => setOpen((i) => (i + 1) % withPhoto.length) : undefined}
        />
      )}
    </>
  );
}

function ChampionCard({ c, showPhoto, onOpenPhoto, onPhotoError }) {
  return (
    <article className="flex flex-col rounded-lg border border-[#1C2430] bg-[#0F141C] overflow-hidden">
      {showPhoto ? (
        <button
          type="button"
          onClick={onOpenPhoto}
          className="group relative block aspect-video w-full overflow-hidden bg-[#1C2430] cursor-zoom-in"
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
        <div className="relative flex aspect-video w-full items-center justify-center bg-[#141A24]">
          <Crest name={c.barangay} size={64} />
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[#F5A524] text-[13px] font-semibold uppercase tracking-wide">{c.sport}</span>
          {c.division && <span className="text-slate-500 text-[13px]">· {c.division}</span>}
        </div>

        <h3 className="text-slate-50 text-[20px] font-semibold tracking-tight leading-tight">{titleOf(c)}</h3>
        {c.teamName && <p className="text-slate-400 text-[14px] mt-0.5">Barangay {c.barangay}</p>}

        {(c.mvp || c.prize) && (
          <dl className="mt-3 pt-3 border-t border-[#1C2430] grid grid-cols-2 gap-3">
            {c.mvp && (
              <div className="min-w-0">
                <dt className="text-slate-500 text-[12px] uppercase tracking-wider">MVP</dt>
                <dd className="text-slate-100 text-[15px] font-medium truncate">{c.mvp}</dd>
              </div>
            )}
            {c.prize && (
              <div className="min-w-0">
                <dt className="text-slate-500 text-[12px] uppercase tracking-wider">Prize</dt>
                <dd className="text-slate-100 text-[15px] font-medium truncate">{c.prize}</dd>
              </div>
            )}
          </dl>
        )}

        {c.notes && <p className="text-slate-400 text-[14px] mt-3 leading-relaxed">{c.notes}</p>}
      </div>
    </article>
  );
}
