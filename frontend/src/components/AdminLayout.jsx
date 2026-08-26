import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../api";

export default function AdminLayout({ title, menu, children }) {
  const [open, setOpen] = useState(false);       // mobile sidebar toggle
  const [sports, setSports] = useState([]);
  const [expanded, setExpanded] = useState({});  // which groups are open
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user") || "null");

  const needsSports = menu.some((m) => m.dynamic === "sports");

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
    menu.forEach((m) => {
      if (m.dynamic && location.pathname.startsWith(m.path)) next[m.path] = true;
    });
    setExpanded((prev) => ({ ...prev, ...next }));
  }, [location.pathname]);

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
    `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
      active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside
        className={`fixed z-30 inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-200 lg:translate-x-0 lg:static ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-200 shrink-0">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <span className="font-semibold text-slate-800 text-sm">Kolambugan Sports</span>
        </div>

        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          {menu.map((item) => {
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
                    <span className="text-slate-400 text-xs">{isOpen ? "▾" : "▸"}</span>
                  </button>

                  {isOpen && (
                    <div className="mt-1 ml-4 pl-3 border-l border-slate-200 space-y-0.5">
                      {sports.length === 0 && (
                        <p className="px-3 py-1.5 text-slate-400 text-xs">Loading…</p>
                      )}
                      {sports.map((s) => {
                        const path = `${item.path}/${s._id}`;
                        return (
                          <button
                            key={s._id}
                            onClick={() => go(path)}
                            className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] transition ${
                              location.pathname === path
                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                : "text-slate-500 hover:bg-slate-100"
                            }`}
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
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 shrink-0">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
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
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="lg:hidden text-slate-600 text-xl" aria-label="Open menu">
              ☰
            </button>
            <h1 className="text-slate-800 font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="hidden sm:inline">{user?.username}</span>
            <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-semibold">
              {user?.username?.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}