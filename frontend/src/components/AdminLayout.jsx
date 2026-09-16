import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, ChevronRight, Moon, Sun } from "lucide-react";
import { api } from "../api";
import { getStoredTheme, storeTheme } from "../lib/theme";
import { cn } from "../lib/utils";

// menu can be flat ([{label, path, icon}, ...]) or grouped
// ([{header, items: [...]}, ...]) — grouped renders each header as a
// collapsible section. Flattened once here so the sports-submenu and
// active-route effects don't need to know which shape they got.
function flattenItems(menu) {
  return menu[0]?.header !== undefined ? menu.flatMap((g) => g.items) : menu;
}

export default function AdminLayout({ title, menu, children, enableDarkMode = false }) {
  const [open, setOpen] = useState(false);       // mobile sidebar toggle
  const [sports, setSports] = useState([]);
  const [expanded, setExpanded] = useState({});  // which sport-submenus are open
  const [collapsed, setCollapsed] = useState({}); // which header groups are collapsed
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
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  function go(path) {
    navigate(path);
    setOpen(false);
  }

  const itemClass = (active) =>
    cn(
      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition",
      active ? "bg-primary/10 text-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    );

  function renderItem(item) {
    const active = location.pathname === item.path;

    if (item.dynamic === "sports") {
      const isOpen = !!expanded[item.path];
      const inside = location.pathname.startsWith(item.path);
      return (
        <div key={item.path}>
          <button
            onClick={() => setExpanded((e) => ({ ...e, [item.path]: !isOpen }))}
            className={itemClass(inside && location.pathname === item.path)}
          >
            <span className="text-base">{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            <span className="text-sidebar-foreground/40 text-xs">{isOpen ? "▾" : "▸"}</span>
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
      <button key={item.path} onClick={() => go(item.path)} className={itemClass(active)}>
        <span className="text-base">{item.icon}</span>
        {item.label}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside
        className={cn(
          "fixed z-30 inset-y-0 left-0 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transform transition-transform duration-200 lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border shrink-0">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">K</span>
          </div>
          <span className="font-semibold text-sidebar-foreground text-sm">Kolambugan Sports</span>
        </div>

        <nav className="p-3 space-y-1 flex-1 overflow-y-auto scrollbar-thin">
          {grouped
            ? menu.map((group) => {
                const isCollapsed = !!collapsed[group.header];
                return (
                  <div key={group.header} className="pb-1">
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [group.header]: !isCollapsed }))}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition"
                    >
                      {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                      {group.header}
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-1">
                        {group.items.map((item) => renderItem(item))}
                      </div>
                    )}
                  </div>
                );
              })
            : items.map((item) => renderItem(item))}
        </nav>

        <div className="p-3 border-t border-sidebar-border shrink-0">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition"
          >
            <span className="text-base">⎋</span>
            Sign out
          </button>
        </div>
      </aside>

      {open && (
        <div onClick={() => setOpen(false)} className="fixed inset-0 bg-black/30 z-20 lg:hidden" />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-background border-b border-border flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="lg:hidden text-foreground text-xl" aria-label="Open menu">
              ☰
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
