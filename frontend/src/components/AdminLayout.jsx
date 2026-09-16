import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { api } from "../api";
import LoadingScreen from "./LoadingScreen";
import { getStoredTheme, storeTheme } from "../lib/theme";
import { cn } from "../lib/utils";

// menu can be flat ([{label, path, icon}, ...]) or grouped
// ([{header, items: [...]}, ...]) — grouped renders each header as a plain
// label over its items. Flattened once here so the sports-submenu and
// active-route effects don't need to know which shape they got.
function flattenItems(menu) {
  return menu[0]?.header !== undefined ? menu.flatMap((g) => g.items) : menu;
}

export default function AdminLayout({ title, menu, children, enableDarkMode = false }) {
  const [open, setOpen] = useState(false);          // mobile: sidebar shown as an overlay
  const [rail, setRail] = useState(false);           // desktop: whole sidebar collapsed to an icon rail
  const [loggingOut, setLoggingOut] = useState(false);
  const [sports, setSports] = useState([]);
  const [expanded, setExpanded] = useState({});      // which sport-submenus are open
  const [theme, setTheme] = useState(() => (enableDarkMode ? getStoredTheme() : "light"));
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user") || "null");

  const grouped = menu[0]?.header !== undefined;
  const items = flattenItems(menu);
  const needsSports = items.some((m) => m.dynamic === "sports");

  useLayoutEffect(() => {
    if (!enableDarkMode) return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    return () => root.classList.remove("dark");
  }, [enableDarkMode, theme]);

  useEffect(() => {
    if (!needsSports) return;
    api("/api/sports")
      .then((d) => setSports(d.sports || []))
      .catch(() => setSports([]));
  }, [needsSports]);

  // A group starts open when you're already somewhere inside it, so landing on
  // a sport page doesn't hide where you are.
  useEffect(() => {
    const next = {};
    items.forEach((m) => {
      if (m.dynamic && location.pathname.startsWith(m.path)) next[m.path] = true;
    });
    setExpanded((prev) => ({ ...prev, ...next }));
  }, [location.pathname]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    storeTheme(next);
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

    return (
      <button key={item.path} onClick={() => go(item.path)} className={itemClass(active)} title={rail ? item.label : undefined}>
        <span className="text-base">{item.icon}</span>
        {!rail && item.label}
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
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-bold text-sm">K</span>
            </div>
            <span className="font-semibold text-sidebar-foreground text-sm truncate">Kolambugan Sports</span>
          </div>
          {/* Desktop-only rail toggle, beside the logo — mobile has its own
              open/close via the header button, a separate overlay concept. */}
          <button
            onClick={() => setRail((r) => !r)}
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
        <header className="h-16 bg-background border-b border-border flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="lg:hidden text-foreground" aria-label="Open menu">
              <PanelLeftOpen className="size-5" />
            </button>
            <h1 className="text-foreground font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {enableDarkMode && (
              <button
                onClick={toggleTheme}
                aria-label="Toggle dark mode"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
            )}
            <span className="hidden sm:inline">{user?.username}</span>
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-semibold">
              {user?.username?.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 bg-background">{children}</main>
      </div>
    </div>
  );
}
