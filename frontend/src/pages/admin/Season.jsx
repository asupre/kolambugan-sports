import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";

const superAdminMenu = [
  { label: "Dashboard", path: "/admin", icon: "▦" },
  { label: "Season", path: "/admin/season", icon: "◷" },
  { label: "Reference List", path: "/admin/reference", icon: "☑" },
  { label: "Review Queue", path: "/admin/review", icon: "⚑" },
  { label: "Tournaments", path: "/admin/tournaments", icon: "⛃" },
  { label: "Accounts", path: "/admin/accounts", icon: "☺" },
];

// The lifecycle, in order, with friendly labels and what "advance" does next.
const STAGES = [
  { key: "setup", label: "Setup", next: "Open Registration" },
  { key: "registration_open", label: "Registration Open", next: "Move to Verification" },
  { key: "verification", label: "Verification", next: "Start Season" },
  { key: "ongoing", label: "Ongoing", next: "Close & Archive Season" },
  { key: "completed", label: "Completed", next: null },
];

function StageTimeline({ current }) {
  const currentIndex = STAGES.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {STAGES.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                active
                  ? "bg-indigo-600 text-white"
                  : done
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {s.label}
            </div>
            {i < STAGES.length - 1 && <span className="text-slate-300">→</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function Season() {
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/seasons/current");
      setSeason(data.season);
    } catch (e) {
      // 404 = no season yet; that's a normal state, not an error to shout about.
      setSeason(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createSeason() {
    if (!newName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/seasons", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() }),
      });
      setSeason(data.season);
      setNewName("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!season) return;
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/seasons/${season._id}/advance`, { method: "POST" });
      setSeason(data.season);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const currentStage = season ? STAGES.find((s) => s.key === season.status) : null;

  return (
    <AdminLayout title="Season" menu={superAdminMenu}>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : !season ? (
        // No season yet — offer to create one.
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-md">
          <h2 className="text-slate-800 font-semibold mb-1">No active season</h2>
          <p className="text-slate-500 text-sm mb-4">
            Create a season to begin. It will start in <span className="font-medium">Setup</span>.
          </p>
          <label className="block text-slate-700 text-sm font-medium mb-1.5">Season name</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. 2026 Season"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition mb-3"
          />
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <button
            onClick={createSeason}
            disabled={busy || !newName.trim()}
            className="w-full rounded-lg bg-indigo-600 text-white text-sm font-medium py-2.5 hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {busy ? "Creating…" : "Create Season"}
          </button>
        </div>
      ) : (
        // Season exists — show its state and the advance control.
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="text-slate-500 text-sm">Current season</p>
                <h2 className="text-slate-900 text-xl font-semibold">{season.name}</h2>
              </div>
              <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium">
                {currentStage?.label || season.status}
              </span>
            </div>

            <div className="mt-5">
              <p className="text-slate-500 text-xs mb-2">Lifecycle</p>
              <StageTimeline current={season.status} />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-md">
            <h3 className="text-slate-800 font-semibold mb-1">Advance the season</h3>
            {currentStage?.next ? (
              <>
                <p className="text-slate-500 text-sm mb-4">
                  Next step: <span className="font-medium text-slate-700">{currentStage.next}</span>.
                  This moves the season forward and cannot be undone.
                </p>
                {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
                <button
                  onClick={advance}
                  disabled={busy}
                  className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-5 py-2.5 hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {busy ? "Working…" : currentStage.next}
                </button>
              </>
            ) : (
              <p className="text-slate-500 text-sm">
                This season is <span className="font-medium">completed</span> and archived. Create a
                new season to start another cycle.
              </p>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}