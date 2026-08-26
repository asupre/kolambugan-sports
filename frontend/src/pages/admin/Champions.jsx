import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { Button, Card } from "../../components/ui";
import { superAdminMenu } from "../../components/menus";

const BLANK = {
  year: "", sport: "", division: "", barangay: "",
  teamName: "", mvp: "", prize: "", notes: "",
};

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const label = "block text-slate-600 text-xs font-medium mb-1";

export default function Champions() {
  const [champions, setChampions] = useState([]);
  const [sports, setSports] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  // "Other" lets in sports and barangays that no longer exist under that name —
  // past champions predate the current configuration.
  const [otherSport, setOtherSport] = useState(false);
  const [otherBarangay, setOtherBarangay] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await api("/api/champions");
      setChampions(d.champions || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    Promise.all([
      api("/api/sports").catch(() => ({ sports: [] })),
      api("/api/barangays").catch(() => ({ barangays: [] })),
    ]).then(([s, b]) => {
      setSports(s.sports || []);
      setBarangays(b.barangays || []);
    });
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function reset() {
    setForm(BLANK); setPhoto(null); setEditingId(null);
    setOtherSport(false); setOtherBarangay(false);
  }

  function startEdit(c) {
    setEditingId(c.id);
    setForm({
      year: String(c.year), sport: c.sport, division: c.division || "",
      barangay: c.barangay, teamName: c.teamName || "", mvp: c.mvp || "",
      prize: c.prize || "", notes: c.notes || "",
    });
    setOtherSport(!sports.some((s) => s.name === c.sport));
    setOtherBarangay(!barangays.some((b) => b.name === c.barangay));
    setPhoto(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Always multipart — the routes accept it with or without a file, and it keeps
  // one code path instead of branching on whether a photo was picked.
  async function save() {
    setBusy(true); setError(""); setOk("");
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (photo) fd.append("photo", photo);

      const res = await fetch(editingId ? `/api/champions/${editingId}` : "/api/champions", {
        method: editingId ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}` },  // no Content-Type — the browser sets the boundary
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Could not save."); return; }

      setOk(editingId ? "Champion updated." : "Champion added.");
      reset();
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    if (!window.confirm(`Delete the ${c.year} ${c.sport} champion (${c.barangay})? This can't be undone.`)) return;
    setError("");
    try {
      await api(`/api/champions/${c.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  const canSave = form.year.trim() && form.sport.trim() && form.barangay.trim();

  // Group by year, newest first.
  const byYear = {};
  champions.forEach((c) => { (byYear[c.year] = byYear[c.year] || []).push(c); });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  return (
    <AdminLayout title="Champions" menu={superAdminMenu}>
      <div className="max-w-4xl space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        {ok && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
            <p className="text-green-700 text-sm">{ok}</p>
          </div>
        )}

        <Card className="p-5">
          <h2 className="text-slate-800 font-semibold mb-1">
            {editingId ? "Edit champion" : "Add a past champion"}
          </h2>
          <p className="text-slate-500 text-sm mb-4">
            Records from previous seasons, including years before this system existed.
            Year, sport, and barangay are required; everything else is optional.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Year *</label>
              <input type="number" value={form.year} onChange={set("year")} placeholder="2024" className={input} />
            </div>

            <div>
              <label className={label}>Sport *</label>
              {otherSport ? (
                <div className="flex gap-2">
                  <input value={form.sport} onChange={set("sport")} placeholder="Sport name" className={input} />
                  <button type="button" onClick={() => { setOtherSport(false); setForm({ ...form, sport: "" }); }}
                    className="text-xs text-slate-500 hover:text-slate-700 whitespace-nowrap">Use list</button>
                </div>
              ) : (
                <select value={form.sport}
                  onChange={(e) => e.target.value === "__other" ? (setOtherSport(true), setForm({ ...form, sport: "" })) : set("sport")(e)}
                  className={input}>
                  <option value="">Select a sport…</option>
                  {sports.map((s) => <option key={s._id} value={s.name}>{s.name}</option>)}
                  <option value="__other">Other…</option>
                </select>
              )}
            </div>

            <div>
              <label className={label}>Barangay *</label>
              {otherBarangay ? (
                <div className="flex gap-2">
                  <input value={form.barangay} onChange={set("barangay")} placeholder="Barangay name" className={input} />
                  <button type="button" onClick={() => { setOtherBarangay(false); setForm({ ...form, barangay: "" }); }}
                    className="text-xs text-slate-500 hover:text-slate-700 whitespace-nowrap">Use list</button>
                </div>
              ) : (
                <select value={form.barangay}
                  onChange={(e) => e.target.value === "__other" ? (setOtherBarangay(true), setForm({ ...form, barangay: "" })) : set("barangay")(e)}
                  className={input}>
                  <option value="">Select a barangay…</option>
                  {barangays.map((b) => <option key={b._id} value={b.name}>{b.name}</option>)}
                  <option value="__other">Other…</option>
                </select>
              )}
            </div>

            <div>
              <label className={label}>Division</label>
              <input value={form.division} onChange={set("division")} placeholder="U17, Boys, Open…" className={input} />
            </div>

            <div>
              <label className={label}>Team name</label>
              <input value={form.teamName} onChange={set("teamName")} placeholder="Baybay Warriors" className={input} />
            </div>

            <div>
              <label className={label}>MVP</label>
              <input value={form.mvp} onChange={set("mvp")} placeholder="Player name" className={input} />
            </div>

            <div>
              <label className={label}>Prize</label>
              <input value={form.prize} onChange={set("prize")} placeholder="₱15,000 + trophy" className={input} />
            </div>

            <div className="sm:col-span-2">
              <label className={label}>Notes</label>
              <input value={form.notes} onChange={set("notes")} placeholder="Anything worth recording" className={input} />
            </div>

            <div className="sm:col-span-2">
              <label className={label}>Proof photo {editingId && "(leave empty to keep the current one)"}</label>
              <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0] || null)}
                className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-medium hover:file:bg-indigo-100 cursor-pointer" />
              <p className="text-slate-400 text-xs mt-1">JPEG, PNG, or WebP · up to 3 MB. This photo is public.</p>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={save} disabled={busy || !canSave}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Add champion"}
            </Button>
            {editingId && (
              <Button variant="secondary" onClick={reset}>Cancel</Button>
            )}
          </div>
        </Card>

        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : champions.length === 0 ? (
          <Card className="p-5">
            <p className="text-slate-500 text-sm">No champions recorded yet.</p>
          </Card>
        ) : (
          years.map((y) => (
            <Card key={y} className="p-5">
              <h3 className="text-slate-800 font-semibold mb-3">
                {y}
                <span className="text-slate-400 font-normal text-sm ml-2">({byYear[y].length})</span>
              </h3>
              <div className="space-y-2">
                {byYear[y].map((c) => (
                  <div key={c.id} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2">
                    {c.hasPhoto ? (
                      <img src={`/api/champions/${c.id}/photo`} alt="" className="w-12 h-12 rounded object-cover bg-slate-100 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-[10px] shrink-0">
                        No photo
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-800 text-sm font-medium truncate">
                        {c.sport}{c.division ? ` · ${c.division}` : ""} — {c.barangay}
                      </div>
                      <div className="text-slate-500 text-xs truncate">
                        {[c.teamName, c.mvp && `MVP: ${c.mvp}`, c.prize].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div className="inline-flex gap-2 shrink-0">
                      <button onClick={() => startEdit(c)}
                        className="text-xs font-medium px-3 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
                        Edit
                      </button>
                      <button onClick={() => remove(c)}
                        className="text-xs font-medium px-3 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>
    </AdminLayout>
  );
}