import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { registerLenis } from "../../lib/scrollLock";
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

// Phone nav icons (Oct 2026 redraw): one consistent 24px line set (lucide-style geometry,
// inlined: public pages don't import lucide), 1.75 stroke, round caps.
const PATHS = {
  home: <><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 21v-7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7" /></>,
  matches: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>,
  standings: <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />,
  brackets: <><path d="M3 5h6v6M3 17h6v-6M9 11h5" /><circle cx="17.5" cy="11" r="3" /></>,
  teams: <path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" />,
  players: <><circle cx="12" cy="7" r="4" /><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /></>,
  champions: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16" /><path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8" /><path d="M18 2H6v7a6 6 0 0 0 12 0z" /></>,
  about: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
};

function Icon({ name, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
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
// True once the page has scrolled past the very top. The desktop header is transparent (it
// blends into the page / Home hero) until then, and turns into a frosted bar after.
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let raf = 0;
    const check = () => { raf = 0; setScrolled(window.scrollY > 8); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
  return scrolled;
}

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
    registerLenis(lenis);   // so an open dialog can pause it (lib/scrollLock.js)
    return () => {
      registerLenis(null);
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
  const scrolled = useScrolled();

  useEffect(() => {
    api("/api/public/overview")
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  const liveNow = meta?.counts?.liveNow || 0;

  // Phone icon bar: the active item gets a soft green pill behind its icon (no underline).
  const linkClass = ({ isActive }) =>
    `group whitespace-nowrap transition-colors ${isActive ? "is-active text-[#4ADE80]" : "text-slate-400 hover:text-slate-200"}`;

  return (
        <div className="min-h-screen bg-[#0A0C0B] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(37,99,235,0.16),transparent_70%),radial-gradient(ellipse_60%_40%_at_100%_60%,rgba(56,189,248,0.06),transparent_70%)] bg-no-repeat text-slate-200 flex flex-col overflow-x-clip">
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
      {/* Desktop (lg+): BLENDS in at the top of the page (no fill, no border; on Home the hero
          photo runs up behind it), a soft top shade keeps the links readable, and once scrolled it
          becomes a frosted bar. Phones keep the solid bar with the icon nav. */}
      <header className={cn(
        "sticky top-0 z-30 border-b bg-[#0A0C0B]/85 backdrop-blur-sm transition-[background-color,border-color] duration-300",
        scrolled
          ? "border-white/[0.06] lg:bg-[#0A0C0B]/70 lg:backdrop-blur-xl"
          : "border-white/[0.06] lg:border-transparent lg:bg-transparent lg:backdrop-blur-none"
      )}>
        {/* The shade that keeps the links readable over a photo: taller than the header and fading
            out below it, so it ends without a visible edge (a 72px gradient left a faint line). */}
        {!scrolled && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 hidden h-40 bg-gradient-to-b from-[#0A0C0B]/60 via-[#0A0C0B]/25 to-transparent lg:block" />
        )}
        <div className="relative max-w-[1400px] mx-auto px-4 lg:px-8">
          {/* Header row layout (Sep 2026, from the Super Admin's sketch):
              logo, nav (centered at lg+), season-name pill at the far right —
              at lg+. Below lg there isn't room for the lockup + 8 links +
              season on one line, so the (single) desktop nav wraps onto its
              own row via `basis-full order-last`, as before. Phones use the
              separate icon nav below. */}
          <div className="flex flex-wrap items-center gap-x-8 py-3 lg:h-[72px] lg:flex-nowrap lg:py-0">
            <Link to="/" className="flex items-center min-w-0">
              <img
                src="/logo/ksl-lockup-horizontal-dark.svg"
                alt="Kolambugan Sports · Inter-Barangay League"
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
                        isActive ? "text-[#4ADE80]" : "text-slate-400 group-hover:text-slate-100"
                      )}>
                        {n.label}
                      </span>
                      <span
                        className={cn(
                          "absolute inset-x-0 -bottom-px h-[2px] origin-left bg-[#4ADE80] transition-transform duration-300 ease-out",
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
                <span className="text-[#4ADE80] text-[10px] sm:text-[13px] font-bold tracking-wide bg-[#4ADE80]/15 sm:bg-transparent sm:border sm:border-[#4ADE80]/40 px-2 py-1 sm:px-4 sm:py-2 rounded sm:rounded-full truncate max-w-[120px] sm:max-w-[220px]">
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
                <span className="flex flex-col items-center gap-1 py-1.5 w-full">
                  <span className="flex h-7 w-11 items-center justify-center rounded-full transition-colors group-[.is-active]:bg-[#4ADE80]/15">
                    <Icon name={n.icon} className="w-[22px] h-[22px]" />
                  </span>
                  <span className="text-[9px] leading-none truncate max-w-full group-[.is-active]:font-semibold">{n.short || n.label}</span>
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
      <footer className="relative z-10 bg-[#060807]/90 border-t border-white/[0.08] mt-8">
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