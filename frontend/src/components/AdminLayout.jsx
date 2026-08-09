import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function AdminLayout({ title, menu, children }) {
  const [open, setOpen] = useState(false); // mobile sidebar toggle
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user") || "null");

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed z-30 inset-y-0 left-0 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 lg:translate-x-0 lg:static ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-200">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <span className="font-semibold text-slate-800 text-sm">Kolambugan Sports</span>
        </div>

        <nav className="p-3 space-y-1">
          {menu.map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-full p-3 border-t border-slate-200">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
          >
            <span className="text-base">⎋</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile overlay when sidebar open */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
        />
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden text-slate-600 text-xl"
              aria-label="Open menu"
            >
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

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}