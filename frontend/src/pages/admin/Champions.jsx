import { useEffect, useState } from "react";
import { Pencil, Trash2, Trophy, UploadCloud } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";

const BLANK = {
  year: "", sport: "", division: "", barangay: "",
  teamName: "", mvp: "", prize: "", notes: "",
};

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
    <AdminLayout title="Champions" menu={superAdminMenu} enableDarkMode>
      <div className="max-w-4xl space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {ok && (
          <Alert className="border-green-500/30 bg-green-500/5">
            <AlertDescription className="text-green-700 dark:text-green-400">{ok}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Edit champion" : "Add a past champion"}</CardTitle>
            <CardDescription>
              Records from previous seasons, including years before this system existed.
              Year, sport, and barangay are required; everything else is optional.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Year *</Label>
                <Input type="number" value={form.year} onChange={set("year")} placeholder="2024" />
              </div>

              <div className="space-y-1.5">
                <Label>Sport *</Label>
                {otherSport ? (
                  <div className="flex gap-2">
                    <Input value={form.sport} onChange={set("sport")} placeholder="Sport name" />
                    <button type="button" onClick={() => { setOtherSport(false); setForm({ ...form, sport: "" }); }}
                      className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">Use list</button>
                  </div>
                ) : (
                  <Select
                    value={form.sport}
                    onValueChange={(v) => v === "__other"
                      ? (setOtherSport(true), setForm({ ...form, sport: "" }))
                      : setForm({ ...form, sport: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a sport…" />
                    </SelectTrigger>
                    <SelectContent>
                      {sports.map((s) => <SelectItem key={s._id} value={s.name}>{s.name}</SelectItem>)}
                      <SelectItem value="__other">Other…</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Barangay *</Label>
                {otherBarangay ? (
                  <div className="flex gap-2">
                    <Input value={form.barangay} onChange={set("barangay")} placeholder="Barangay name" />
                    <button type="button" onClick={() => { setOtherBarangay(false); setForm({ ...form, barangay: "" }); }}
                      className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">Use list</button>
                  </div>
                ) : (
                  <Select
                    value={form.barangay}
                    onValueChange={(v) => v === "__other"
                      ? (setOtherBarangay(true), setForm({ ...form, barangay: "" }))
                      : setForm({ ...form, barangay: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a barangay…" />
                    </SelectTrigger>
                    <SelectContent>
                      {barangays.map((b) => <SelectItem key={b._id} value={b.name}>{b.name}</SelectItem>)}
                      <SelectItem value="__other">Other…</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Division</Label>
                <Input value={form.division} onChange={set("division")} placeholder="U17, Boys, Open…" />
              </div>

              <div className="space-y-1.5">
                <Label>Team name</Label>
                <Input value={form.teamName} onChange={set("teamName")} placeholder="Baybay Warriors" />
              </div>

              <div className="space-y-1.5">
                <Label>MVP</Label>
                <Input value={form.mvp} onChange={set("mvp")} placeholder="Player name" />
              </div>

              <div className="space-y-1.5">
                <Label>Prize</Label>
                <Input value={form.prize} onChange={set("prize")} placeholder="₱15,000 + trophy" />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={set("notes")} placeholder="Anything worth recording" />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label>Proof photo {editingId && "(leave empty to keep the current one)"}</Label>
                <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0] || null)}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-medium hover:file:bg-primary/15 cursor-pointer" />
                <p className="text-muted-foreground text-xs">JPEG, PNG, or WebP · up to 3 MB. This photo is public.</p>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button onClick={save} disabled={busy || !canSave}>
                <UploadCloud /> {busy ? "Saving…" : editingId ? "Save changes" : "Add champion"}
              </Button>
              {editingId && (
                <Button variant="secondary" onClick={reset}>Cancel</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : champions.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground text-sm">No champions recorded yet.</CardContent>
          </Card>
        ) : (
          years.map((y) => (
            <Card key={y} className="border-l-4 border-l-amber-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="size-4 text-amber-500" />
                  {y}
                  <span className="font-normal text-sm text-muted-foreground">({byYear[y].length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {byYear[y].map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                    {c.hasPhoto ? (
                      <img src={`/api/champions/${c.id}/photo`} alt="" className="w-12 h-12 rounded object-cover bg-muted shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center text-muted-foreground text-[10px] shrink-0">
                        No photo
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {c.sport}{c.division ? ` · ${c.division}` : ""} — {c.barangay}
                      </div>
                      <div className="text-muted-foreground text-xs truncate">
                        {[c.teamName, c.mvp && `MVP: ${c.mvp}`, c.prize].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div className="inline-flex gap-2 shrink-0">
                      <Button size="icon-sm" variant="outline" onClick={() => startEdit(c)}>
                        <Pencil />
                      </Button>
                      <Button size="icon-sm" variant="destructive" onClick={() => remove(c)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
