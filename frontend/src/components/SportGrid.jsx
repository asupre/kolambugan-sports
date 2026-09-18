import { useEffect, useState } from "react";
import { api } from "../api";

const SPORT_ACCENT = {
  Basketball: "#F5A524", Volleyball: "#22C55E", Badminton: "#38BDF8",
  Pickleball: "#A78BFA", Billiards: "#F472B6", Chess: "#94A3B8", "Mobile Legends": "#EF4444",
};
const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls", under15: "Under 15", under30: "Under 30",
};
const SPORT_ICON = {
  Basketball: "🏀", Volleyball: "🏐", Badminton: "🏸", Pickleball: "🎾",
  Billiards: "🎱", Chess: "♟️", "Mobile Legends": "🎮",
};

// A grid of every tournament running this season — one tile per (sport, division),
// since a sport can run several independent competitions.
export default function SportGrid({ onPick, emptyText = "No tournaments have been generated yet." }) {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/public/tournaments")
      .then((d) => setTournaments(d.tournaments || []))
      .catch(() => setTournaments([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500 text-sm">Loading…</p>;
  if (tournaments.length === 0) return <p className="text-slate-500 text-sm">{emptyText}</p>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {tournaments.map((t) => {
        const accent = SPORT_ACCENT[t.sport] || "#F5A524";
        return (
          <button key={t.id} onClick={() => onPick(t)}
            className="text-left rounded-lg border border-slate-500/15 bg-[#0F192A]/70 p-4 hover:border-slate-400/40 transition">
            <div className="text-2xl mb-2">{SPORT_ICON[t.sport] || "●"}</div>
            <div className="text-slate-100 text-sm font-medium leading-tight">{t.sport}</div>
            <div className="text-[11px] mt-1" style={{ color: accent }}>
              {DIVISION_LABEL[t.division] || t.division}
            </div>
            <div className="text-slate-600 text-[10px] mt-2 tracking-wider uppercase">
              {t.stage === "group_stage" ? "Group stage" : t.stage === "elimination" ? "Knockout" : "Completed"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export { SPORT_ACCENT, DIVISION_LABEL, SPORT_ICON };