import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, HelpCircle, LogOut, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { api } from "../api";
import InstructionModal from "./InstructionModal";
import { stepForPath } from "../lib/instructionContent";
import LoadingScreen from "./LoadingScreen";
import ProfilePanel from "./ProfilePanel";
import BannerBackdrop from "./BannerBackdrop";
import PageBanner, { bannerFor } from "./PageBanner";
import { useScrollLock } from "../lib/scrollLock";
import { useImageRev } from "../lib/profileImages";
import { getStoredTheme, storeTheme } from "../lib/theme";
import ThemeToggle from "./ThemeToggle";
import CrossTermsDialog from "./CrossTermsDialog";
import TermsNotifications from "./TermsNotifications";
import { SeasonBadge } from "./SeasonStatus";
import { useSeason } from "../lib/season";
import { useMediaQuery } from "../lib/useMediaQuery";
import { DARK_CHROME, LIGHT_CHROME, setThemeColor } from "../lib/themeChrome";
import { cn } from "../lib/utils";

const NAV_SCROLL_KEY = "admin-nav-scroll";

// menu can be flat ([{label, path, icon}, ...]) or grouped
// ([{header, items: [...]}, ...]) — grouped renders each header as a plain
// label over its items. Flattened once here so the sports-submenu and
// active-route effects don't need to know which shape they got.
function flattenItems(menu) {
  return menu[0]?.header !== undefined ? menu.flatMap((g) => g.items) : menu;
}

// Header avatar: tries the account's profile photo, falls back to initials
// on a 404 (no photo set) — same "image is the upload control" avatar the
// profile panel uses, just read-only here.
function HeaderAvatar({ user }) {
  // Shared version (lib/profileImages.js): a photo changed in Profile shows everywhere at once.
  const v = useImageRev("photo", user?.id);
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [v]);   // give a just-uploaded photo another chance to load
  if (!user?.id || imgError) {
    return (
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-semibold">
        {user?.username?.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={`/api/auth/users/${user.id}/photo?rev=${v}`}
      alt=""
      decoding="async"
      className="h-8 w-8 rounded-full object-cover bg-muted"
      onError={() => setImgError(true)}
    />
  );
}

// animateTheme={false} makes the theme toggle swap instantly instead of playing
// the circular reveal. Used by the organizer scoring screen: a View Transition
// makes the page non-interactive for its ~0.75s, so a score tap landing during
// the reveal is silently swallowed (measured Sep 2026) — unacceptable mid-match.
// Only the live scoring view (an open match) sets it; the organizer's match list animates.
// `seasonStrip` — the slim season bar under the header on phones. The header pill
// (desktop) costs no space, but the strip does, so the courtside scoring screen turns it off.
// subtitle / actions / pageHeader: the calm page header (Super Admin only for now): a big
// title, one plain sentence under it, and the page's main buttons on the right.
// The banner at the top of every Super Admin page (banner look): a flat landscape drawn in the
// league's greens (Mount Bucas, Panguil Bay, the sunrise from the logo, pines on the right), the
// greeting on the left, the round buttons on the right (desktop; phones keep them in the top bar).
// One inline SVG, no images or blur, so it costs nothing to paint.
// The picture: BannerBackdrop (the account's own, else the drawn landscape).
const DASHBOARD_PATHS = ["/admin", "/brgy/dashboard", "/organizer/dashboard"];
const ROLE_LABEL = { super_admin: "Super Admin", barangay_admin: "Barangay Admin", organizer: "Organizer" };
function LandscapeBanner({ userId, name, line, buttons }) {
  return (
    <div className="relative mb-7 h-28 overflow-hidden rounded-2xl bg-[#3B6A62] sm:h-36 print:hidden">
      <BannerBackdrop userId={userId} />
      <div className="relative z-[2] flex h-full items-center justify-between gap-4 px-5 sm:px-7">
        <div className="min-w-0 text-white [text-shadow:0_1px_8px_rgba(20,40,32,0.35)]">
          <p className="truncate text-[22px] font-semibold leading-tight sm:text-[26px]">Hello, {name}</p>
          <p className="mt-0.5 truncate text-[14px] text-white/85 sm:text-[15px]">{line}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-2.5 lg:flex">{buttons}</div>
      </div>
    </div>
  );
}

export default function AdminLayout({ title, menu, children, enableDarkMode = false, animateTheme = true, seasonStrip = true, subtitle, actions, pageHeader = true }) {
  const [open, setOpen] = useState(false);          // mobile: sidebar shown as an overlay
  // Desktop: the user's choice to collapse the whole sidebar to an icon rail. It only
  // TAKES EFFECT at desktop width (`rail` below) — the rail toggle is hidden on
  // phones, but this state used to leak into the phone menu: collapse at desktop
  // width, then resize a window / rotate a tablet, and the phone-style menu opened
  // at full width with every label hidden (icons only, nowhere to tell what's what).
  const [railPref, setRailPref] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // The circular theme reveal is a full-screen View Transition: smooth with a mouse,
  // but on a phone it stutters on modest hardware and makes the page ignore taps for
  // its ~0.75s. Touch screens get an instant swap (the sun/moon icon still animates).
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const rail = railPref && isDesktop;
  // The phone menu is an overlay: the page behind it shouldn't scroll.
  useScrollLock(open && !isDesktop);
  // The "calm" look (Oct 2026) for every admin page, all three roles. A class on
  // <html>, so dialogs / popovers that portal to <body> get it too; see :root.calm-theme in
  // index.css. Removed on unmount, so other roles and the public site never see it.
  // All three roles since Oct 2026 (was Super Admin only).
  const calm = true;
  useEffect(() => {
    if (!calm) return undefined;
    const el = document.documentElement;
    el.classList.add("calm-theme");
    return () => el.classList.remove("calm-theme");
  }, [calm]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showHelp, setShowHelp] = useState(false);   // on-demand reopen of the orientation modal
  const [showProfile, setShowProfile] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);  // barangay admin: the league terms pop-up is up
  const [sports, setSports] = useState([]);
  const [expanded, setExpanded] = useState({});      // which sport-submenus are open
  const [reviewPending, setReviewPending] = useState(0);
  const user = JSON.parse(localStorage.getItem("user") || "null");
  // "Banner" look (Oct 2026, from a fitness-dashboard reference the Super Admin liked), ALL three
  // roles: a white sidebar with icons beside the labels, the current page as a solid green pill,
  // the account (name + role, opens Profile) above Sign out, and on each role's Dashboard a rounded
  // picture banner with the greeting and the round buttons. CSS: :root.calm-fit in index.css.
  const fit = true;
  useEffect(() => {
    if (!fit) return undefined;
    const el = document.documentElement;
    el.classList.add("calm-fit");
    return () => el.classList.remove("calm-fit");
  }, [fit]);
  // The season stage, shown to the two admin roles on every page so they always
  // know whether registration is open, rosters are being verified, or play is on.
  const showSeason = user?.role === "barangay_admin" || user?.role === "organizer";
  const { season } = useSeason();
  const [theme, setTheme] = useState(() => (enableDarkMode ? getStoredTheme(user?.id) : "light"));
  const navigate = useNavigate();
  const location = useLocation();
  // The "Hello" picture banner is the Dashboard's only (Super Admin request); other pages keep the top bar.
  const showBanner = fit && DASHBOARD_PATHS.includes(location.pathname);
  const pageBanner = bannerFor(location.pathname);   // every other page: its promo-style banner

  // Every page opens at the TOP (Oct 2026 bug: scroll to the bottom of one page, click another
  // in the menu, and the new page opened scrolled to the bottom too). The browser keeps the
  // window scroll across client-side route changes, so reset it on each new path, before paint.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // First-login guide (Oct 2026: it used to open on the blank "Set a new password" page). The
  // password page sends `state.firstLoginGuide` with the redirect, so the guide opens here, over
  // the user's own dashboard. The state is cleared at once, so a refresh / Back won't reopen it.
  useEffect(() => {
    if (!location.state?.firstLoginGuide) return;
    setShowHelp(true);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate]);

  const grouped = menu[0]?.header !== undefined;
  const items = flattenItems(menu);
  const needsSports = items.some((m) => m.dynamic === "sports");
  const needsReviewBadge = items.some((m) => m.badge === "reviewPending");

  useLayoutEffect(() => {
    if (!enableDarkMode) return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    setThemeColor(theme === "dark" ? DARK_CHROME : LIGHT_CHROME);   // the phone's address bar
    return () => { root.classList.remove("dark"); setThemeColor(LIGHT_CHROME); };
  }, [enableDarkMode, theme]);

  useEffect(() => {
    if (!needsSports) return;
    api("/api/sports")
      .then((d) => setSports(d.sports || []))
      .catch(() => setSports([]));
  }, [needsSports]);

  // Red count badge on the Review Queue sidebar item — how many submitted
  // teams still need a verdict, season-wide. Refetches whenever this layout
  // mounts (i.e. on every admin-page navigation), which is fresh enough
  // without adding a poll interval.
  useEffect(() => {
    if (!needsReviewBadge) return;
    api("/api/review/queue")
      .then((d) => setReviewPending(d.totalPending || 0))
      .catch(() => setReviewPending(0));
  }, [needsReviewBadge, location.pathname]);

  // A group starts open when you're already somewhere inside it, so landing on
  // a sport page doesn't hide where you are.
  useEffect(() => {
    const next = {};
    items.forEach((m) => {
      if (m.dynamic && location.pathname.startsWith(m.path)) next[m.path] = true;
    });
    setExpanded((prev) => ({ ...prev, ...next }));
  }, [location.pathname]);

  // Called by ThemeToggle (from inside the view-transition callback when the
  // circular reveal runs, or directly on the instant fallback path). This
  // stays the source of truth: React state + per-user localStorage; the
  // `dark` class on <html> follows from the layout effect above. No colour
  // fade here any more — the reveal IS the transition, and the fallbacks are
  // meant to be instant.
  function handleThemeChange(next) {
    // Suppress every element's own hover/interaction `transition` for one
    // paint so the bulk CSS-variable recompute doesn't ALSO cross-fade
    // hundreds of elements at once (see `.theme-switching` in index.css) —
    // that cascade, not the circular reveal (already skipped on touch), is
    // what read as lag on a phone. Two rAFs: one to let the class-flip below
    // actually paint, one more before handing transitions back so nothing
    // still mid-recompute picks up a transition on the same frame.
    const root = document.documentElement;
    root.classList.add("theme-switching");
    setTheme(next);
    storeTheme(user?.id, next);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove("theme-switching");
      });
    });
  }

  function logout() {
    // No API call here, so this is instant enough to feel like nothing
    // happened — a short deliberate pause makes it read as a real
    // transition instead of an abrupt jump back to the login screen.
    setLoggingOut(true);
    setTimeout(() => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }, 450);
  }

  function go(path) {
    navigate(path);
    setOpen(false);
  }

  const itemClass = (active) =>
    cn(
      "w-full flex items-center gap-3 rounded-lg text-sm font-medium transition",
      rail ? "justify-center px-0 py-2.5" : "px-3 py-2",
      active ? "bg-primary/10 text-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    );

  // Every admin page mounts its own AdminLayout, so the sidebar used to start back at
  // the top on each navigation — pick "Reports" low in the list and the new page
  // opened with Reports scrolled out of sight below the fold. Keep the scroll position
  // across pages, then make sure the current item is in view.
  const navRef = useRef(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    try { nav.scrollTop = Number(sessionStorage.getItem(NAV_SCROLL_KEY)) || 0; } catch { /* storage blocked */ }
    nav.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [location.pathname, sports.length]);

  function renderItem(item) {
    const active = location.pathname === item.path;

    if (item.dynamic === "sports") {
      // No room for an inline flyout in the collapsed rail — collapsed, this
      // is just a shortcut straight to the section (which lands on the first
      // sport); expanded, it opens the per-sport submenu as usual.
      const isOpen = !rail && !!expanded[item.path];
      const inside = location.pathname.startsWith(item.path);
      return (
        <div key={item.path}>
          <button
            onClick={() => (rail ? go(item.path) : setExpanded((e) => ({ ...e, [item.path]: !isOpen })))}
            className={itemClass(inside && location.pathname === item.path)}
            title={rail ? item.label : undefined}
          >
            {rail ? (
              <item.icon className="size-[19px]" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <>
                {fit && <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />}
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronDown className={cn("size-4 text-sidebar-foreground/40 transition-transform", !isOpen && "-rotate-90")} aria-hidden="true" />
              </>
            )}
          </button>

          {isOpen && (
            <div className="mt-1 ml-4 pl-3 border-l border-sidebar-border space-y-0.5">
              {sports.length === 0 && (
                <p className="px-3 py-1.5 text-sidebar-foreground/40 text-xs">Loading…</p>
              )}
              {sports.map((s) => {
                const path = `${item.path}/${s._id}`;
                return (
                  <button
                    key={s._id}
                    onClick={() => go(path)}
                    aria-current={location.pathname === path ? "page" : undefined}
                    className={cn(
                      "w-full text-left px-3 py-1.5 rounded-lg text-[13px] transition",
                      location.pathname === path
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent"
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    const showBadge = item.badge === "reviewPending" && reviewPending > 0;

    return (
      <button
        key={item.path}
        onClick={() => go(item.path)}
        aria-current={active ? "page" : undefined}
        className={itemClass(active)}
        title={rail ? (showBadge ? `${item.label} (${reviewPending} pending)` : item.label) : undefined}
      >
        {rail && (
          <span className="relative">
            <item.icon className="size-[19px]" strokeWidth={1.75} aria-hidden="true" />
            {showBadge && (
              <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-sidebar" />
            )}
          </span>
        )}
        {!rail && (
          <>
            {fit && <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />}
            <span className="flex-1 text-left">{item.label}</span>
            {showBadge && (
              <span className="min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white">
                {reviewPending}
              </span>
            )}
          </>
        )}
      </button>
    );
  }

  if (loggingOut) return <LoadingScreen message="Signing out…" />;

  return (
    <div className="min-h-screen bg-background flex print:block print:min-h-0">
      {/* FIXED at every width, never in the page flow (Oct 2026, "collapsing the sidebar is
          laggy"). It used to be lg:sticky inside the flex row, so its 200ms width animation
          re-laid out the WHOLE page (tables, brackets, cards) on every frame. Now only this
          narrow panel animates (contain: layout keeps its reflow inside it), and the content
          column's padding below jumps to the new width in ONE step. */}
      <aside
        className={cn(
          "print:hidden fixed z-(--z-sidebar) inset-y-0 left-0 bg-sidebar border-r border-sidebar-border flex flex-col transform transition-[transform,width] duration-200 [contain:layout] lg:translate-x-0 lg:h-dvh",
          open ? "translate-x-0" : "-translate-x-full",
          rail ? "w-64 lg:w-16" : "w-64"
        )}
      >
        <div className={cn("h-16 flex items-center border-b border-sidebar-border shrink-0 px-5", rail && "lg:justify-center lg:px-2")}>
          <div className={cn("flex items-center gap-2 min-w-0 flex-1", rail && "lg:hidden")}>
            <img src="/logo/ksl-mark-simple.svg" alt="" className="h-8 w-8 shrink-0" />
            <span className="font-semibold text-sidebar-foreground text-sm truncate">Kolambugan Sports</span>
          </div>
          {/* Phone menu: an explicit close button (it used to close only by tapping
              the dimmed page behind it, which isn't obvious). */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent transition"
          >
            <X className="size-5" />
          </button>
          {/* Desktop-only rail toggle, beside the logo — mobile has its own
              open/close via the header button, a separate overlay concept. */}
          <button
            onClick={() => setRailPref((r) => !r)}
            className="hidden lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition"
            title={rail ? "Expand sidebar" : "Collapse sidebar"}
          >
            {rail ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        <nav
          ref={navRef}
          onScroll={(e) => { try { sessionStorage.setItem(NAV_SCROLL_KEY, String(e.currentTarget.scrollTop)); } catch { /* storage blocked */ } }}
          className={cn("py-3 space-y-1 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-thin scroll-shadow-y [--scroll-shadow-bg:var(--sidebar)]", rail ? "lg:px-2 px-3" : "px-3")}
        >
          {grouped
            ? menu.map((group) => (
                <div key={group.header} className="pb-1">
                  {!rail && (
                    <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/40">
                      {group.header}
                    </p>
                  )}
                  {rail && <div className="hidden lg:block my-2 border-t border-sidebar-border/60" />}
                  <div className="space-y-1">
                    {group.items.map((item) => renderItem(item))}
                  </div>
                </div>
              ))
            : items.map((item) => renderItem(item))}
        </nav>

        <div className="p-3 border-t border-sidebar-border shrink-0 space-y-1">
          {fit && !rail && (
            <button
              onClick={() => setShowProfile(true)}
              className="hidden lg:flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-sidebar-accent"
            >
              <HeaderAvatar user={user} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-sidebar-foreground">{user?.username}</span>
                <span className="block text-[12px] text-sidebar-foreground/55">{ROLE_LABEL[user?.role] || user?.role}</span>
              </span>
            </button>
          )}
          <button
            onClick={logout}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition",
              rail ? "justify-center px-0 py-2" : "px-3 py-2"
            )}
            title={rail ? "Sign out" : undefined}
          >
            {rail ? <LogOut className="size-[19px]" strokeWidth={1.75} aria-hidden="true" /> : fit ? <><LogOut className="size-[18px]" strokeWidth={1.75} aria-hidden="true" /> Sign out</> : "Sign out"}
          </button>
        </div>
      </aside>

      {open && (
        <div onClick={() => setOpen(false)} className="fixed inset-0 bg-black/30 z-(--z-sidebar-backdrop) lg:hidden" />
      )}

      {/* Room for the fixed sidebar on desktop. No transition on purpose: one reflow, not 12. */}
      <div className={cn("flex-1 flex flex-col min-w-0 print:block print:pl-0", rail ? "lg:pl-16" : "lg:pl-64")}>
        {/* Sticky so the menu/profile/theme controls stay reachable without scrolling back
            up — the page (not `main`) is what actually scrolls in this layout, so without
            this the header just scrolled away like any other content. --z-header keeps it
            under the phone menu and its backdrop, and above page content (see <main>). */}
        <header className={cn("print:hidden sticky top-0 z-(--z-header) h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6", showBanner && "lg:hidden")}>
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="lg:hidden text-foreground" aria-label="Open menu">
              <PanelLeftOpen className="size-5" />
            </button>
            {/* Calm pages show the title big in the page itself; the bar stays quiet. */}
            <h1 className={cn("text-foreground font-semibold", calm && "lg:hidden")}>{title}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {user?.role === "super_admin" && <TermsNotifications />}
            <button
              onClick={() => setShowHelp(true)}
              aria-label="How this works"
              title="How this works"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition"
            >
              <HelpCircle className="size-4" />
            </button>
            {enableDarkMode && <ThemeToggle theme={theme} onThemeChange={handleThemeChange} animate={animateTheme && finePointer} />}
            {showSeason && season && <SeasonBadge status={season.status} name={season.name} className="hidden sm:inline-flex" />}
            <span className="hidden sm:inline">{user?.username}</span>
            {/* Opens Profile. On phones this is the only way in (the sidebar account is desktop-only). */}
            <button onClick={() => setShowProfile(true)} aria-label="Profile" title="Profile" className="rounded-full transition hover:opacity-85">
              <HeaderAvatar user={user} />
            </button>
          </div>
        </header>

        {showSeason && seasonStrip && season && (
          <div className="print:hidden sm:hidden flex items-center gap-2 border-b bg-card px-4 py-2 text-xs text-muted-foreground">
            <SeasonBadge status={season.status} />
            <span className="truncate">{season.name}</span>
          </div>
        )}

        {/* `isolate` = its own stacking context: whatever z-index a page uses inside (the
            Season stepper's circles, bracket columns) stays BELOW the sticky header instead
            of tying with it and painting on top because it comes later in the DOM. */}
        <main className="isolate flex-1 p-4 lg:p-6 bg-background print:p-0">
          {calm ? (
            // Calm look: one centred column, like the dashboard and the reference site.
            <div className="mx-auto max-w-6xl pb-12 pt-2 sm:px-2 lg:pt-4 print:max-w-none print:p-0">
              {showBanner && (
                <LandscapeBanner
                  userId={user?.id}
                  name={user?.username}
                  line={season ? season.name : "Inter-Barangay Sports League"}
                  buttons={
                    <>
                      {user?.role === "super_admin" && (
                        <TermsNotifications className="size-9 rounded-full bg-white/90 text-[#2E413B] shadow-sm hover:bg-white hover:text-[#2E413B]" />
                      )}
                      <button onClick={() => setShowHelp(true)} aria-label="How this works" title="How this works"
                        className="flex size-9 items-center justify-center rounded-full bg-white/90 text-[#2E413B] shadow-sm transition hover:bg-white">
                        <HelpCircle className="size-[18px]" />
                      </button>
                      {enableDarkMode && (
                        <span className="flex size-9 items-center justify-center rounded-full bg-white/90 text-[#2E413B] shadow-sm [&_button]:text-[#2E413B] [&_button:hover]:bg-transparent">
                          <ThemeToggle theme={theme} onThemeChange={handleThemeChange} animate={animateTheme && finePointer} />
                        </span>
                      )}
                      <span className="rounded-full ring-2 ring-white/90 shadow-sm">
                        <HeaderAvatar user={user} />
                      </span>
                    </>
                  }
                />
              )}
              {/* Promo-style page banner (components/PageBanner.jsx) in place of the plain title:
                  the page name, a bold line, "How this works", a drawn illustration. The page's
                  own buttons sit under it on the right. */}
              {pageHeader && pageBanner && (
                <>
                  <PageBanner banner={pageBanner} title={title} onHelp={() => setShowHelp(true)} />
                  {actions && <div className="-mt-3 mb-6 flex flex-wrap items-center justify-end gap-2 print:hidden">{actions}</div>}
                </>
              )}
              {pageHeader && !pageBanner && (
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
                  <div className="min-w-0">
                    <h1 className="text-[30px] font-semibold leading-tight tracking-tight sm:text-[36px]">{title}</h1>
                    {subtitle && <p className="mt-1.5 text-[16px] text-muted-foreground sm:text-[17px]">{subtitle}</p>}
                  </div>
                  {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
                </div>
              )}
              {children}
            </div>
          ) : children}
        </main>
      </div>

      {/* League terms (every barangay admin): answered before anything else, so the
          first-login guide waits until it's closed. */}
      {user?.role === "barangay_admin" && <CrossTermsDialog onOpenChange={setTermsOpen} />}
      {showHelp && !termsOpen && (
        <InstructionModal role={user?.role} initialStep={stepForPath(user?.role, location.pathname)} onClose={() => setShowHelp(false)} />
      )}
      <ProfilePanel
        open={showProfile}
        onOpenChange={setShowProfile}
      />
    </div>
  );
}
