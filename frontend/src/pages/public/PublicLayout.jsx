import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { api } from "../../api";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/matches", label: "Matches" },
  { to: "/standings", label: "Standings" },
  { to: "/brackets", label: "Brackets" },
  { to: "/teams", label: "Teams" },
  { to: "/players", label: "Players" },
  { to: "/champions", label: "Champions" },
  { to: "/about", label: "About" },
];

export default function PublicLayout() {
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    api("/api/public/overview")
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  const liveNow = meta?.counts?.liveNow || 0;

  return (
    <div className="min-h-screen bg-[#0A1220] text-slate-200 flex flex-col">
      {/* Header */}
      <header className="bg-[#060C16]/95 border-b border-slate-500/15 sticky top-0 z-30 backdrop-blur-none">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-[#F5A524] flex items-center justify-center text-[#0A1220] font-bold text-sm">K</div>
              <div className="leading-tight">
                <div className="text-slate-100 font-semibold text-sm tracking-wide">KOLAMBUGAN SPORTS</div>
                <div className="text-slate-500 text-[9px] tracking-[0.15em]">INTER-BARANGAY LEAGUE</div>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              {liveNow > 0 && (
                <span className="bg-green-500/15 text-green-400 text-[10px] px-2.5 py-1 rounded">
                  ● {liveNow} LIVE
                </span>
              )}
              {meta?.season?.name && (
                <span className="bg-[#F5A524]/15 text-[#F5A524] text-[10px] px-2.5 py-1 rounded">
                  {meta.season.name.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          <nav className="flex gap-5 overflow-x-auto text-xs">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) =>
                  `py-2.5 whitespace-nowrap border-b-2 transition ${
                    isActive ? "text-[#F5A524] border-[#F5A524]" : "text-slate-400 border-transparent hover:text-slate-200"
                  }`
                }>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Page body */}
      <main className="flex-1 max-w-6xl mx-auto px-4 w-full py-6">
        <Outlet context={{ meta }} />
      </main>

      {/* Footer */}
      <footer className="bg-[#060C16] border-t border-slate-500/15 mt-8">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-6">
            <div>
              <h3 className="text-slate-100 text-xs font-semibold mb-3">The League</h3>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                {meta?.counts?.barangays || 26} barangays · {meta?.counts?.sports || 7} sports<br />
                {meta?.season?.name || "Current"} season<br />
                Municipality of Kolambugan
              </p>
            </div>
            <div>
              <h3 className="text-slate-100 text-xs font-semibold mb-3">Explore</h3>
              <div className="flex flex-col gap-1.5">
                {NAV.slice(1, 5).map((n) => (
                  <Link key={n.to} to={n.to} className="text-slate-500 text-[11px] hover:text-slate-300">{n.label}</Link>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-slate-100 text-xs font-semibold mb-3">Organised by</h3>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                SK Federation of Kolambugan<br />
                Local Youth Development Office<br />
                <span className="text-slate-600">
                  Developed as an undergraduate thesis,<br />
                  Lanao School of Science and Technology
                </span>
              </p>
            </div>
          </div>
          <div className="border-t border-slate-500/10 pt-4 text-center text-slate-600 text-[10px]">
            © {new Date().getFullYear()} Inter-Barangay Sports League Management System
          </div>
        </div>
      </footer>
    </div>
  );
}