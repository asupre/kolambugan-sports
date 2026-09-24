import { useEffect, useState } from "react";
import { api } from "../../api";
import { Panel, PhotoRowSkeleton, Crest, SportTabs } from "../../components/PublicUI";

// Sport tabs come from the CHAMPIONS themselves, not the current season — a
// sport the league no longer runs still has a history worth showing.
export default function Champions() {
  const [champions, setChampions] = useState([]);
  const [sport, setSport] = useState("");
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null); // champion whose photo is open

  useEffect(() => {
    let alive = true;
    api("/api/champions")
      .then((d) => { if (alive) setChampions(d.champions || []); })
      .catch(() => { if (alive) setChampions([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Escape closes the lightbox — a modal with no keyboard exit is a trap.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const sports = [...new Set(champions.map((c) => c.sport))].sort();
  const shown = sport ? champions.filter((c) => c.sport === sport) : champions;

  const byYear = {};
  shown.forEach((c) => { (byYear[c.year] = byYear[c.year] || []).push(c); });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  return (
    <>
      <h1 className="text-slate-100 text-2xl font-semibold tracking-tight mb-1">Champions</h1>
      <p className="text-slate-500 text-sm mb-4">
        {loading ? "\u00A0" : "Past winners of the Inter-Barangay Sports League"}
      </p>

      {sports.length > 0 && (
        <SportTabs sports={sports} value={sport} onChange={setSport} allLabel="All sports" />
      )}

      {loading ? (
        <PhotoRowSkeleton rows={2} />
      ) : shown.length === 0 ? (
        <Panel empty="No champions recorded yet." />
      ) : (
        years.map((y) => (
          <Panel key={y} title={String(y)} count={`${byYear[y].length}`}>
            <div>
              {byYear[y].map((c) => (
                <ChampionRow key={c.id} c={c} onOpenPhoto={() => setLightbox(c)} />
              ))}
            </div>
          </Panel>
        ))
      )}

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={`/api/champions/${lightbox.id}/photo?c=2`}
              alt=""
              className="w-full max-h-[80vh] object-contain rounded"
            />
            <div className="flex items-center justify-between gap-4 mt-3">
              <p className="text-slate-300 text-sm">
                {lightbox.year} {lightbox.sport}
                {lightbox.division ? ` · ${lightbox.division}` : ""} —{" "}
                {lightbox.teamName || `Barangay ${lightbox.barangay}`}
              </p>
              <button
                onClick={() => setLightbox(null)}
                className="text-slate-400 text-sm hover:text-slate-200 shrink-0"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChampionRow({ c, onOpenPhoto }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = c.hasPhoto && !failed;

  return (
    <div className="flex flex-col sm:flex-row gap-5 p-5 border-b border-[#1C2430] last:border-0">
      {showPhoto ? (
        <button
          onClick={onOpenPhoto}
          className="shrink-0 w-full sm:w-72 group cursor-zoom-in"
          title="View full size"
        >
          <img
            src={`/api/champions/${c.id}/photo?c=2`}
            alt=""
            onError={() => setFailed(true)}
            className="w-full h-48 sm:h-52 object-cover rounded bg-[#1C2430] group-hover:opacity-90 transition"
          />
        </button>
      ) : (
        <div className="shrink-0 w-full sm:w-72 h-48 sm:h-52 rounded bg-[#141A24] flex items-center justify-center">
          <Crest name={c.barangay} size={72} />
        </div>
      )}

      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[#F5A524] text-[12px] font-semibold uppercase tracking-wide">
            {c.sport}
          </span>
          {c.division && <span className="text-slate-600 text-[12px]">{c.division}</span>}
        </div>

        <h3 className="text-slate-50 text-2xl font-semibold tracking-tight leading-tight">
          {c.teamName || `Barangay ${c.barangay}`}
        </h3>
        {c.teamName && (
          <p className="text-slate-400 text-[14px] mt-0.5">Barangay {c.barangay}</p>
        )}

        <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
          {c.mvp && (
            <div>
              <dt className="text-slate-600 text-[10px] uppercase tracking-wider mb-0.5">Most valuable player</dt>
              <dd className="text-slate-100 text-[15px] font-medium">{c.mvp}</dd>
            </div>
          )}
          {c.prize && (
            <div>
              <dt className="text-slate-600 text-[10px] uppercase tracking-wider mb-0.5">Prize</dt>
              <dd className="text-slate-100 text-[15px] font-medium">{c.prize}</dd>
            </div>
          )}
        </dl>

        {c.notes && (
          <p className="text-slate-500 text-[13px] mt-4 leading-relaxed">{c.notes}</p>
        )}
      </div>
    </div>
  );
}