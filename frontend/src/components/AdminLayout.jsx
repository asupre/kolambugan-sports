import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { HelpCircle, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { api } from "../api";
import InstructionModal from "./InstructionModal";
import LoadingScreen from "./LoadingScreen";
import ProfilePanel from "./ProfilePanel";
import { getStoredTheme, storeTheme } from "../lib/theme";
import ThemeToggle from "./ThemeToggle";
import { SeasonBadge } from "./SeasonStatus";
import { useSeason } from "../lib/season";
import { useMediaQuery } from "../lib/useMediaQuery";
import { DARK_CHROME, LIGHT_CHROME, setThemeColor } from "../lib/themeChrome";
import { cn } from "../lib/utils";

// menu can be flat ([{label, path, icon}, ...]) or grouped
// ([{header, items: [...]}, ...]) — grouped renders each header as a plain
// label over its items. Flattened once here so the sports-submenu and
// active-route effects don't need to know which shape they got.
function flattenItems(menu) {
  return menu[0]?.header !== undefined ? menu.flatMap((g) => g.items) : menu;
}

// Header avatar: tries the account's profile photo, falls back to initials
// on a 404 (no photo set) — same "image is the upload control" avatar the
// profile panel uses, just read-only here. `v` bumps after the panel closes
// so a just-changed photo shows up without a full page reload.
function HeaderAvatar({ user, v }) {
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
      src={`/api/auth/users/${user.id}/photo?v=${v}`}
      alt=""
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
export default function AdminLayout({ title, menu, children, enableDarkMode = false, animateTheme = true, seasonStrip = true }) {
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
  const [loggingOut, setLoggingOut] = useState(false);
  const [showHelp, setShowHelp] = useState(false);   // on-demand reopen of the orientation modal
  const [showProfile, setShowProfile] = useState(false);
  const [avatarV, setAvatarV] = useState(0);   // bumped when the profile panel closes, to refresh a just-changed photo
  const [sports, setSports] = useState([]);
  const [expanded, setExpanded] = useState({});      // which sport-submenus are open
  const [reviewPending, setReviewPending] = useState(0);
  const user = JSON.parse(localStorage.getItem("user") || "null");
  // The season stage, shown to the two admin roles on every page so they always
  // know whether registration is open, rosters are being verified, or play is on.
  const showSeason = user?.role === "barangay_admin" || user?.role === "organizer";
  const { season } = useSeason();
  const [theme, setTheme] = useState(() => (enableDarkMode ? getStoredTheme(user?.id) : "light"));
  const navigate = useNavigate();
  const location = useLocation();

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
    setTheme(next);
    storeTheme(user?.id, next);
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
      rail ? "justify-center px-0 py-2" : "px-3 py-2",
      active ? "bg-primary/10 text-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    );

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
            <span className="text-base">{item.icon}</span>
            {!rail && (
              <>
                <span className="flex-1 text-left">{item.label}</span>
                <span className="text-sidebar-foreground/40 text-xs">{isOpen ? "▾" : "▸"}</span>
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
        className={itemClass(active)}
        title={rail ? (showBadge ? `${item.label} (${reviewPending} pending)` : item.label) : undefined}
      >
        <span className="text-base relative">
          {item.icon}
          {showBadge && rail && (
            <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-sidebar" />
          )}
        </span>
        {!rail && (
          <>
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
    <div className="min-h-screen bg-background flex">
      <aside
        className={cn(
          "fixed z-30 inset-y-0 left-0 bg-sidebar border-r border-sidebar-border flex flex-col transform transition-[transform,width] duration-200 lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen",
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

        <nav className={cn("py-3 space-y-1 flex-1 overflow-y-auto scrollbar-thin", rail ? "lg:px-2 px-3" : "px-3")}>
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

        <div className="p-3 border-t border-sidebar-border shrink-0">
          <button
            onClick={logout}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition",
              rail ? "justify-center px-0 py-2" : "px-3 py-2"
            )}
            title={rail ? "Sign out" : undefined}
          >
            <span className="text-base">⎋</span>
            {!rail && "Sign out"}
          </button>
        </div>
      </aside>

      {open && (
        <div onClick={() => setOpen(false)} className="fixed inset-0 bg-black/30 z-20 lg:hidden" />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="lg:hidden text-foreground" aria-label="Open menu">
              <PanelLeftOpen className="size-5" />
            </button>
            <h1 className="text-foreground font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
            <button
              onClick={() => setShowProfile(true)}
              aria-label="Profile"
              title="Profile"
              className="rounded-full transition hover:ring-2 hover:ring-primary/40 hover:ring-offset-2 hover:ring-offset-card"
            >
              <HeaderAvatar user={user} v={avatarV} />
            </button>
          </div>
        </header>

        {showSeason && seasonStrip && season && (
          <div className="sm:hidden flex items-center gap-2 border-b bg-card px-4 py-2 text-xs text-muted-foreground">
            <SeasonBadge status={season.status} />
            <span className="truncate">{season.name}</span>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-6 bg-background">{children}</main>
      </div>

      {showHelp && (
        <InstructionModal role={user?.role} onClose={() => setShowHelp(false)} />
      )}
      <ProfilePanel
        open={showProfile}
        onOpenChange={(o) => { setShowProfile(o); if (!o) setAvatarV((n) => n + 1); }}
      />
    </div>
  );
}
