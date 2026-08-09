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
                active ? "bg-indigo-600 text-white"
                : done ? "bg-indigo-100 text-indigo-700"
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

// Reusable modal for creating a season.
function CreateSeasonModal({ open, onClose, onCreate, busy, error }) {
  const [name, setName] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      {/* dim backdrop */}
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      {/* modal card */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-slate-900 font-semibold text-lg mb-1">Create a season</h3>
        <p className="text-slate-500 text-sm mb-4">It will start in the Setup stage.</p>
        <label className="block text-slate-700 text-sm font-medium mb-1.5">Season name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. 2026 Season"
          autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
        />
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium py-2.5 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(name.trim())}
            disabled={busy || !name.trim()}
            className="flex-1 rounded-lg bg-indigo-600 text-white text-sm font-medium py-2.5 hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Season() {
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api("/api/seasons/current");
      setSeason(data.season);
    } catch (e) {
      setSeason(null); // no season yet
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createSeason(name) {
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/seasons", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setSeason(data.season);
      setModalOpen(false);
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
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-md">
          <h2 className="text-slate-800 font-semibold mb-1">No active season</h2>
          <p className="text-slate-500 text-sm mb-4">Create a season to begin the cycle.</p>
          <button
            onClick={() => { setError(""); setModalOpen(true); }}
            className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-5 py-2.5 hover:bg-indigo-700 transition"
          >
            + Create Season
          </button>
        </div>
      ) : (
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
                  This cannot be undone.
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
              <>
                <p className="text-slate-500 text-sm mb-4">
                  This season is <span className="font-medium">completed</span> and archived. Start a
                  new one to begin the next cycle.
                </p>
                <button
                  onClick={() => { setError(""); setModalOpen(true); }}
                  className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-5 py-2.5 hover:bg-indigo-700 transition"
                >
                  + Create New Season
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <CreateSeasonModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={createSeason}
        busy={busy}
        error={error}
      />
    </AdminLayout>
  );
}