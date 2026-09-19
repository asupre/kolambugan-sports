import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../../api";
import { LiveDot } from "../../components/PublicUI";
import { cn } from "../../lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/matches", label: "Matches", icon: "matches" },
  { to: "/standings", label: "Standings", icon: "standings", short: "Table" },
  { to: "/brackets", label: "Brackets", icon: "brackets" },
  { to: "/teams", label: "Teams", icon: "teams" },
  { to: "/players", label: "Players", icon: "players" },
  { to: "/champions", label: "Champions", icon: "champions", short: "Titles" },
  { to: "/about", label: "About", icon: "about" },
];

const PATHS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H4a1 1 0 0 1-1-1z" />,
  matches: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 5v14" /></>,
  standings: <path d="M4 7h16M4 12h16M4 17h10" />,
  brackets: <path d="M4 6h5v5h4M4 18h5v-5M13 11v2M13 12h7" />,
  teams: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><circle cx="17.5" cy="9.5" r="2.5" /><path d="M17.5 14c2.5 0 3.5 2 3.5 4" /></>,
  players: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" /></>,
  champions: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 3M16 6h3a3 3 0 0 1-3 3" /><path d="M12 13v3M9 20h6" /></>,
  about: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
};

function Icon({ name, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// React Router keeps the scroll position across navigations, so tapping a nav
// link halfway down a long page lands you halfway down the next one. Reset it.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function PublicLayout() {
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    api("/api/public/overview")
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  const liveNow = meta?.counts?.liveNow || 0;

  const linkClass = ({ isActive }) =>
    `whitespace-nowrap border-b-2 transition ${
      isActive ? "text-[#F5A524] border-[#F5A524]" : "text-slate-400 border-transparent hover:text-slate-200"
    }`;

  return (
        <div className="min-h-screen bg-[#0A1220] text-slate-200 flex flex-col overflow-x-hidden">
      <ScrollToTop />

      {/* Same background as the hero (and the page itself) with no border —
          so on Home the logo/nav reads as sitting INSIDE the hero panel,
          not as a separate bar stacked on top of it. Semi-transparent +
          blurred so it still works as a floating sticky header once you've
          scrolled past the hero into plain page content. */}
      <header className="bg-[#0A1220]/90 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
                    <div className="flex items-center justify-between gap-2 py-3">
            <Link to="/" className="flex items-center min-w-0">
              <img
                src="/logo/ksl-lockup-horizontal-dark.svg"
                alt="Kolambugan Sports — Inter-Barangay League"
                className="h-11 w-auto shrink-0"
              />
            </Link>
            <div className="flex items-center gap-1.5 shrink-0">
              {liveNow > 0 && (
                <span className="flex items-center gap-1.5 bg-red-500/15 text-red-400 text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap">
                  <LiveDot /> {liveNow} LIVE
                </span>
              )}
              {meta?.season?.name && (
                <span className="bg-[#F5A524]/15 text-[#F5A524] text-[10px] px-2 py-1 rounded truncate max-w-[96px]">
                  {meta.season.name.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* Desktop: smaller/quieter than before (was text-[15px], reading
              too heavy next to the now-bigger logo) — the logo carries the
              brand weight, the nav should sit back. Each link gets its own
              animated underline (grows in from the left on hover, eased,
              rather than an instant color/border flip) instead of sharing
              one static border like the old `linkClass` — a small "motion"
              touch. Active state keeps the same idea but the underline
              simply starts fully grown. */}
          <nav className="hidden sm:flex gap-6 text-[13px] font-medium">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="group relative py-3.5 whitespace-nowrap">
                {({ isActive }) => (
                  <>
                    <span className={cn(
                      "transition-colors duration-200",
                      isActive ? "text-[#F5A524]" : "text-slate-400 group-hover:text-slate-100"
                    )}>
                      {n.label}
                    </span>
                    <span
                      className={cn(
                        "absolute inset-x-0 -bottom-px h-[2px] origin-left bg-[#F5A524] transition-transform duration-300 ease-out",
                        isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Mobile: icons. Eight items don't fit as words, and a tiny caption
              beats making people guess what a trophy outline means. */}
                    <nav className="flex sm:hidden [&>a]:flex-1 [&>a]:min-w-0">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>
                <span className="flex flex-col items-center gap-1 py-2 w-full">
                  <Icon name={n.icon} className="w-[22px] h-[22px]" />
                  <span className="text-[9px] leading-none truncate max-w-full">{n.short || n.label}</span>
                </span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto px-4 lg:px-8 w-full py-6">
        <Outlet context={{ meta }} />
      </main>

      {/* Mobile gets its own pass here, not just a squeeze of the desktop
          layout: text bumped up a step (11px/10px read as genuinely small
          held at arm's length) and the 7-item Explore list — which just
          stacked into one long column, all the height of NAV plus no
          visual organisation — becomes a tidy 2-column block instead.
          Both collapse back to the original compact desktop sizing at sm:. */}
      <footer className="bg-[#060C16] border-t border-slate-500/15 mt-8">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-10 sm:py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-6">
            <div className="text-center sm:text-left">
              <h3 className="text-slate-100 text-sm sm:text-xs font-semibold mb-3">The League</h3>
              <p className="text-slate-400 sm:text-slate-500 text-[13px] sm:text-[11px] leading-relaxed">
                {meta?.counts?.barangays || 26} barangays · {meta?.counts?.sports || 7} sports<br />
                {meta?.season?.name || "Current"} season<br />
                Municipality of Kolambugan
              </p>
            </div>
            <div className="text-center sm:text-left">
              <h3 className="text-slate-100 text-sm sm:text-xs font-semibold mb-3">Explore</h3>
              <div className="inline-grid grid-cols-2 sm:flex sm:flex-col gap-x-6 gap-y-2 sm:gap-1.5 text-left">
                {NAV.filter((n) => !n.end).map((n) => (
                  <Link key={n.to} to={n.to} className="text-slate-400 sm:text-slate-500 text-[13px] sm:text-[11px] hover:text-slate-300">{n.label}</Link>
                ))}
              </div>
            </div>
            <div className="text-center sm:text-left">
              <h3 className="text-slate-100 text-sm sm:text-xs font-semibold mb-3">Organised by</h3>
              <p className="text-slate-400 sm:text-slate-500 text-[13px] sm:text-[11px] leading-relaxed">
                SK Federation of Kolambugan<br />
                Local Youth Development Office<br />
                <span className="text-slate-500 sm:text-slate-600">
                  Developed as an undergraduate thesis,<br />
                  Lanao School of Science and Technology
                </span>
              </p>
            </div>
          </div>
          <div className="border-t border-slate-500/10 pt-4 text-center text-slate-500 sm:text-slate-600 text-[11px] sm:text-[10px]">
            © {new Date().getFullYear()} Inter-Barangay Sports League Management System
          </div>
        </div>
      </footer>
    </div>
  );
}