import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../../api";
import { LiveDot, GlassBackdrop } from "../../components/PublicUI";
import { cn } from "../../lib/utils";
import { PUBLIC_CHROME, LIGHT_CHROME, setThemeColor } from "../../lib/themeChrome";

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
// (Forward AND back navigation both land at the top — same as before Lenis.)
// When Lenis is running, jump through it (immediate, no glide) so its own
// internal scroll target stays in step; otherwise use the plain window call.
function ScrollToTop({ lenisRef }) {
  const { pathname } = useLocation();
  useEffect(() => {
    const lenis = lenisRef.current;
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo(0, 0);
  }, [pathname, lenisRef]);
  return null;
}

// Smooth inertia scrolling (Lenis) — PUBLIC site only. It's initialised here,
// in the public layout, and nowhere else: admin/organizer pages keep native
// scrolling, where precision matters more than feel. Rules:
//  - skipped entirely under prefers-reduced-motion: reduce;
//  - touch devices keep NATIVE momentum scrolling (`syncTouch: false` — the
//    v1 name for the old "smoothTouch: false");
//  - it drives the real window scroll (no transforms), so the sticky header,
//    IntersectionObserver-based Motion reveals, hash links and browser
//    find-in-page all keep working untouched;
//  - destroyed on unmount, which also removes the classes it put on <html>.
function useLenis(lenisRef) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo ease-out
      smoothWheel: true,
      syncTouch: false,
      autoRaf: true,
    });
    lenisRef.current = lenis;
    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [lenisRef]);
}

export default function PublicLayout() {
  // Always dark: native controls (scrollbars, the search field's keyboard) and the
  // phone's address bar should match, not stay light over a dark page.
  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = "dark";
    setThemeColor(PUBLIC_CHROME);
    return () => { root.style.colorScheme = ""; root.style.backgroundColor = ""; setThemeColor(LIGHT_CHROME); };
  }, []);

  const [meta, setMeta] = useState(null);
  const lenisRef = useRef(null);
  useLenis(lenisRef);

  useEffect(() => {
    api("/api/public/overview")
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  const liveNow = meta?.counts?.liveNow || 0;

  const linkClass = ({ isActive }) =>
    `whitespace-nowrap border-b-2 transition ${
      isActive ? "text-[#FACC15] border-[#FACC15]" : "text-slate-400 border-transparent hover:text-slate-200"
    }`;

  return (
        <div className="min-h-screen bg-[#0B1626] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(37,99,235,0.16),transparent_70%),radial-gradient(ellipse_60%_40%_at_100%_60%,rgba(56,189,248,0.06),transparent_70%)] bg-no-repeat text-slate-200 flex flex-col overflow-x-clip">
      {/* overflow-x-CLIP, not -hidden: `hidden` silently makes this div a scroll
      container (overflow-y becomes auto), which made the sticky header
      below stick to THIS div instead of the page — so it never stuck.
      `clip` still stops horizontal overflow but creates no scroll
      container, so sticky works. */}
      <ScrollToTop lenisRef={lenisRef} />

      {/* Same background as the hero (and the page itself) with no border —
          so on Home the logo/nav reads as sitting INSIDE the hero panel,
          not as a separate bar stacked on top of it. Semi-transparent +
          blurred so it still works as a floating sticky header once you've
          scrolled past the hero into plain page content. */}
      {/* Glassmorphism (Oct 2026): fixed coloured glows behind every public page, for
          the frosted panels to blur. main/footer sit above it (relative z-10). */}
      <GlassBackdrop />
      <header className="bg-[#0B1626]/70 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
          {/* Header row layout (Sep 2026, from the Super Admin's sketch):
              logo, nav (centered at lg+), season-name pill at the far right —
              at lg+. Below lg there isn't room for the lockup + 8 links +
              season on one line, so the (single) desktop nav wraps onto its
              own row via `basis-full order-last`, as before. Phones use the
              separate icon nav below. */}
          <div className="flex flex-wrap items-center gap-x-8 py-3 lg:flex-nowrap">
            <Link to="/" className="flex items-center min-w-0">
              <img
                src="/logo/ksl-lockup-horizontal-dark.svg"
                alt="Kolambugan Sports — Inter-Barangay League"
                className="h-11 w-auto shrink-0"
              />
            </Link>

            {/* Smaller/quieter than the logo — the logo carries the brand
                weight, the nav sits back. Each link gets its own animated
                underline (grows in from the left on hover, eased) instead of
                an instant color/border flip. Active state starts fully grown. */}
            <nav className="order-last hidden basis-full gap-6 text-[13px] font-medium sm:flex lg:order-none lg:mx-auto lg:basis-auto">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className="group relative py-3.5 whitespace-nowrap">
                  {({ isActive }) => (
                    <>
                      <span className={cn(
                        "transition-colors duration-200",
                        isActive ? "text-[#FACC15]" : "text-slate-400 group-hover:text-slate-100"
                      )}>
                        {n.label}
                      </span>
                      <span
                        className={cn(
                          "absolute inset-x-0 -bottom-px h-[2px] origin-left bg-[#FACC15] transition-transform duration-300 ease-out",
                          isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                        )}
                      />
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2 shrink-0">
              {liveNow > 0 && (
                <span className="flex items-center gap-1.5 bg-red-500/15 text-red-400 text-[12px] font-semibold px-2 py-1 rounded whitespace-nowrap">
                  <LiveDot /> {liveNow} LIVE
                </span>
              )}
              {meta?.season?.name && (
                <span className="text-[#FACC15] text-[10px] sm:text-[13px] font-bold tracking-wide bg-[#FACC15]/15 sm:bg-transparent sm:border sm:border-[#FACC15]/40 px-2 py-1 sm:px-4 sm:py-2 rounded sm:rounded-full truncate max-w-[120px] sm:max-w-[220px]">
                  {meta.season.name.toUpperCase()}
                </span>
              )}
            </div>
          </div>

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

      <main className="relative z-10 flex-1 max-w-[1400px] mx-auto px-4 lg:px-8 w-full py-6">
        <Outlet context={{ meta }} />
      </main>

      {/* Mobile gets its own pass here, not just a squeeze of the desktop
          layout: text bumped up a step (11px/10px read as genuinely small
          held at arm's length) and the 7-item Explore list — which just
          stacked into one long column, all the height of NAV plus no
          visual organisation — becomes a tidy 2-column block instead.
          Both collapse back to the original compact desktop sizing at sm:. */}
      <footer className="relative z-10 bg-[#070F1C]/85 backdrop-blur-xl border-t border-white/[0.08] mt-8">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-10 sm:py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-6">
            <div className="text-center sm:text-left">
              <h3 className="text-slate-100 text-[15px] sm:text-sm font-semibold mb-3">The League</h3>
              <p className="text-slate-400 text-[14px] sm:text-[13px] leading-relaxed">
                {meta?.counts?.barangays || 26} barangays · {meta?.counts?.sports || 7} sports<br />
                {meta?.season?.name || "Current"} season<br />
                Municipality of Kolambugan
              </p>
            </div>
            <div className="text-center sm:text-left">
              <h3 className="text-slate-100 text-[15px] sm:text-sm font-semibold mb-3">Explore</h3>
              <div className="inline-grid grid-cols-2 sm:flex sm:flex-col gap-x-6 gap-y-2 sm:gap-1.5 text-left">
                {NAV.filter((n) => !n.end).map((n) => (
                  <Link key={n.to} to={n.to} className="text-slate-400 text-[14px] sm:text-[13px] hover:text-slate-300">{n.label}</Link>
                ))}
              </div>
            </div>
            <div className="text-center sm:text-left">
              <h3 className="text-slate-100 text-[15px] sm:text-sm font-semibold mb-3">Organised by</h3>
              <p className="text-slate-400 text-[14px] sm:text-[13px] leading-relaxed">
                SK Federation of Kolambugan<br />
                Local Youth Development Office<br />
                <span className="text-slate-500">
                  Developed as an undergraduate thesis,<br />
                  Lanao School of Science and Technology
                </span>
              </p>
            </div>
          </div>
          <div className="border-t border-slate-500/10 pt-4 text-center text-slate-500 text-[12px]">
            © {new Date().getFullYear()} Inter-Barangay Sports League Management System
          </div>
        </div>
      </footer>
    </div>
  );
}