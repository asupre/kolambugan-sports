import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { Button, Card } from "../../components/ui";

const superAdminMenu = [
  { label: "Dashboard", path: "/admin", icon: "▦" },
  { label: "Season", path: "/admin/season", icon: "◷" },
  { label: "Reference List", path: "/admin/reference", icon: "☑" },
  { label: "Review Queue", path: "/admin/review", icon: "⚑" },
  { label: "Tournaments", path: "/admin/tournaments", icon: "⛃" },
   { label: "Champions", path: "/admin/champions", icon: "★" },
   { label: "Site Images", path: "/admin/site-images", icon: "▣" },
  { label: "Accounts", path: "/admin/accounts", icon: "☺" },
];

const ROLE_LABEL = {
  super_admin: "Super Admin",
  barangay_admin: "Barangay Admin",
  organizer: "Organizer",
};

function AddAccountForm({ onCreated, onError }) {
  const [role, setRole] = useState("organizer");
  const [username, setUsername] = useState("");
  const [barangays, setBarangays] = useState([]);
  const [sports, setSports] = useState([]);
  const [barangayId, setBarangayId] = useState("");
  const [assignedSportId, setAssignedSportId] = useState("");
  const [busy, setBusy] = useState(false);

  // Load barangay + sport options for the dropdowns.
  useEffect(() => {
    
    Promise.all([
      api("/api/barangays").catch(() => ({ barangays: [] })),
      api("/api/sports").catch(() => ({ sports: [] })),
    ]).then(([b, s]) => {
      setBarangays(b.barangays || []);
      setSports(s.sports || []);
    });
  }, []);

  async function submit() {
    setBusy(true);
    try {
      const body = { role };
      if (username.trim()) body.username = username.trim();
      if (role === "barangay_admin") body.barangayId = barangayId;
      if (role === "organizer") body.assignedSportId = assignedSportId;
      const data = await api("/api/accounts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCreated(data); // { account, tempPassword }
      setUsername(""); setBarangayId(""); setAssignedSportId("");
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {["super_admin", "barangay_admin", "organizer"].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              role === r ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {r === "super_admin" ? "Super Admin" : r === "barangay_admin" ? "Barangay Admin" : "Organizer"}
          </button>
        ))}
      </div>

      {role === "barangay_admin" && (
        <select
          value={barangayId}
          onChange={(e) => setBarangayId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a barangay…</option>
          {barangays.map((b) => (
            <option key={b._id} value={b._id}>{b.name}</option>
          ))}
        </select>
      )}

      {role === "organizer" && (
        <select
          value={assignedSportId}
          onChange={(e) => setAssignedSportId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a sport…</option>
          {sports.map((s) => (
            <option key={s._id} value={s._id}>{s.name}</option>
          ))}
        </select>
      )}

      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder={role === "super_admin" ? "Username (e.g. lydo_head_2)" : "Username (optional — auto-generated if blank)"}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      <Button
        onClick={submit}
        disabled={busy || (role === "barangay_admin" && !barangayId) || (role === "organizer" && !assignedSportId) || (role === "super_admin" && !username.trim())}
      >
        {busy ? "Creating…" : "Create account"}
      </Button>
    </div>
  );
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Fresh temp passwords to reveal ONCE, keyed however we got them.
  const [reveals, setReveals] = useState([]); // [{ username, tempPassword }]
  const [resettingId, setResettingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api("/api/accounts");
      setAccounts(data.accounts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function provisionAll() {
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/accounts/provision-all", { method: "POST" });
      if (data.created?.length) {
        setReveals(data.created.map((c) => ({ username: c.username, tempPassword: c.tempPassword, label: c.label })));
      }
      alert(data.message);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(acc) {
    if (!window.confirm(`Reset the password for ${acc.username}? Their current password will stop working.`)) return;
    setResettingId(acc._id);
    setError("");
    try {
      const data = await api(`/api/accounts/${acc._id}/reset-password`, { method: "POST" });
      setReveals((prev) => [
        { username: data.username, tempPassword: data.tempPassword },
        ...prev.filter((r) => r.username !== data.username),
      ]);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setResettingId(null);
    }
  }

  async function deleteAccount(acc) {
    if (!window.confirm(`Delete ${acc.username}? This can't be undone.`)) return;
    setError("");
    try {
      await api(`/api/accounts/${acc._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message); // e.g. "has scored matches and can't be deleted"
    }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text);
  }

  // Group accounts by role for display.
  const grouped = { super_admin: [], barangay_admin: [], organizer: [] };
  accounts.forEach((a) => { (grouped[a.role] = grouped[a.role] || []).push(a); });

  return (
    <AdminLayout title="Accounts" menu={superAdminMenu}>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="max-w-4xl space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Add a single account */}
          <Card className="p-5">
            <h2 className="text-slate-800 font-semibold mb-1">Add an account</h2>
            <p className="text-slate-500 text-sm mb-3">
              For anything outside the standard set — like a second super admin. Barangay admins and
              organizers are limited to one per barangay / sport.
            </p>
            <AddAccountForm
              onCreated={(data) => {
                setReveals((prev) => [
                  { username: data.account.username, tempPassword: data.tempPassword },
                  ...prev,
                ]);
                load();
              }}
              onError={(msg) => setError(msg)}
            />
          </Card>

          {/* One-time password reveals */}
          {reveals.length > 0 && (
            <Card className="p-5 border-amber-200 bg-amber-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-amber-800 font-semibold text-sm">
                  New passwords — copy now, they won't be shown again
                </h3>
                <button
                  onClick={() => setReveals([])}
                  className="text-amber-700 text-xs hover:underline"
                >
                  Dismiss
                </button>
              </div>
              <div className="space-y-1.5">
                {reveals.map((r) => (
                  <div key={r.username} className="flex items-center gap-2 text-sm bg-white rounded-lg border border-amber-200 px-3 py-2">
                    <span className="font-medium text-slate-700 flex-1 truncate">
                      {r.username}{r.label ? <span className="text-slate-400"> · {r.label}</span> : null}
                    </span>
                    <code className="font-mono text-slate-900 bg-slate-100 rounded px-2 py-0.5">{r.tempPassword}</code>
                    <button
                      onClick={(e) => {
                        copy(r.tempPassword);
                        const b = e.currentTarget;
                        b.textContent = "Copied";
                        setTimeout(() => { b.textContent = "Copy"; }, 1200);
                      }}
                      className="text-xs font-medium px-2 py-1 rounded bg-slate-800 text-white hover:bg-slate-700"
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Account lists by role */}
          {["super_admin", "barangay_admin", "organizer"].map((role) => {
            const list = grouped[role] || [];
            if (list.length === 0) return null;
            return (
              <Card key={role} className="p-5">
                <h3 className="text-slate-800 font-semibold mb-3">
                  {ROLE_LABEL[role]}
                  <span className="text-slate-400 font-normal text-sm ml-2">({list.length})</span>
                </h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Username</th>
                        <th className="px-3 py-2 font-medium">Assigned to</th>
                        <th className="px-3 py-2 font-medium text-center">Password status</th>
                        <th className="px-3 py-2 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {list.map((a) => (
                        <tr key={a._id} className="text-slate-700">
                          <td className="px-3 py-2 font-medium">{a.username}</td>
                          <td className="px-3 py-2 text-slate-500">
                            {a.barangay?.name || a.assignedSport?.name || "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {a.mustChangePassword ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                Needs change
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                Set
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex gap-2">
                              <button
                                onClick={() => resetPassword(a)}
                                disabled={resettingId === a._id}
                                className="text-xs font-medium px-3 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {resettingId === a._id ? "…" : "Reset password"}
                              </button>
                              <button
                                onClick={() => deleteAccount(a)}
                                className="text-xs font-medium px-3 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}