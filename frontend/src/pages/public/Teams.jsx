import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Crest, Panel, TileGridSkeleton, SportTabs, SearchInput, Tag, DIVISION_LABEL, FORMAT_LABEL } from "../../components/PublicUI";

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

   // Group by sport, then division — a barangay can field both U17 and U30.
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
          const list = groups[key];
          return (
            <Panel
              key={key}
              title={`${sportName} · ${DIVISION_LABEL[division] || division}`}
              count={`${list.length}`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#1C2430]">
                {list.map((t) => (
                  <Link
                    key={t.id}
                    to={`/teams/${t.id}`}
                    className="flex items-center gap-3 px-5 py-4 bg-[#0F141C] hover:bg-[#141A24] transition"
                  >
                                        <Crest name={t.barangay || t.name} barangayId={t.barangayId} />
                    <div className="min-w-0">
                      <div className="text-slate-100 text-[15px] font-medium truncate">{t.name}</div>
                      <div className="text-slate-500 text-[12px] truncate">
                        {t.barangay ? `Brgy. ${t.barangay}` : "—"}
                        {t.format ? ` · ${FORMAT_LABEL[t.format] || t.format}` : ""}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>
          );
        })
      )}
    </>
  );
}