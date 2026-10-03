import { useEffect, useMemo, useState } from "react";
import { Award, CalendarRange, ImagePlus, Medal, Pencil, Plus, Search, Trash2, Trophy, X } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { superAdminMenu } from "../../components/menus";
import { StatTile } from "../../components/DashboardBits";
import { Lightbox } from "../../components/DocumentViewer";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
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
import { cn } from "../../lib/utils";
import { formatAmountInput, formatPrize, prizeAmount } from "../../lib/peso";

const BLANK = {
  year: "", sport: "", division: "", barangay: "",
  teamName: "", mvp: "", prize: "", notes: "",
};

const MAX_PHOTO = 3 * 1024 * 1024;
// ?f= is the photo's file id (photoRev): replacing the photo changes the URL, so
// the new one shows at once instead of the browser's cached copy (Oct 2026).
const photoUrl = (c) => `/api/champions/${c.id}/photo?f=${c.photoRev || "none"}`;

export default function Champions() {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const [champions, setChampions] = useState([]);
  const [sports, setSports] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  // null = dialog closed; {} = adding; a champion = editing it.
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null); // champion whose photo is open full-size

  const [query, setQuery] = useState("");
  const [sportFilter, setSportFilter] = useState("all");

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

  async function remove(c) {
    if (!(await confirm(`Delete the ${c.year} ${c.sport} champion (${c.barangay})? This can't be undone.`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api(`/api/champions/${c.id}`, { method: "DELETE" });
      setOk("Champion deleted.");
      await load();
    } catch (e) {
      showError(e.message);
    }
  }

  async function onSaved(message) {
    setEditing(null);
    setOk(message);
    await load();
  }

  // Summary: how many titles, what span of years, and which barangay has won most.
  const summary = useMemo(() => {
    const years = champions.map((c) => c.year);
    const tally = {};
    champions.forEach((c) => { tally[c.barangay] = (tally[c.barangay] || 0) + 1; });
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return {
      span: years.length ? (Math.min(...years) === Math.max(...years) ? String(years[0]) : `${Math.min(...years)}–${Math.max(...years)}`) : "—",
      seasons: new Set(years).size,
      leaders: ranked.slice(0, 5),
      barangays: ranked.length,
    };
  }, [champions]);

  const sportNames = useMemo(
    () => [...new Set(champions.map((c) => c.sport))].sort(),
    [champions]
  );

  const q = query.trim().toLowerCase();
  const shown = champions.filter((c) => {
    if (sportFilter !== "all" && c.sport !== sportFilter) return false;
    if (!q) return true;
    return [c.barangay, c.teamName, c.mvp, c.sport, c.division, String(c.year)]
      .join(" ").toLowerCase().includes(q);
  });

  // Group by year, newest first.
  const byYear = {};
  shown.forEach((c) => { (byYear[c.year] = byYear[c.year] || []).push(c); });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  return (
    <AdminLayout title="Champions" menu={superAdminMenu} enableDarkMode
      subtitle="Every past winner, including years before this system. Shown on the public Champions page and leaderboard."
      actions={<Button onClick={() => setEditing({})}><Plus /> Add champion</Button>}>
      <div className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {ok && (
          <Alert className="border-green-500/30 bg-green-500/5">
            <AlertDescription className="flex items-center justify-between gap-2 text-green-700 dark:text-green-400">
              {ok}
              <button type="button" onClick={() => setOk("")} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
                <X className="size-4" />
              </button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Titles recorded" value={champions.length} Icon={Trophy} tone="amber" loading={loading} />
          <StatTile label="Seasons" value={summary.seasons} sub={summary.span !== "—" ? summary.span : undefined} Icon={CalendarRange} tone="blue" loading={loading} />
          <StatTile label="Winning barangays" value={summary.barangays} Icon={Medal} tone="teal" loading={loading} />
          <StatTile
            label="Most titles"
            value={summary.leaders[0] ? summary.leaders[0][1] : "—"}
            sub={summary.leaders[0]?.[0]}
            Icon={Award}
            tone="violet"
            loading={loading}
          />
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 w-full rounded-xl" />)}
          </div>
        ) : champions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Trophy className="size-6" />
              </div>
              <div>
                <p className="font-medium">No champions recorded yet</p>
                <p className="text-sm text-muted-foreground">Start with last season's winners. A team photo or trophy shot makes the public page.</p>
              </div>
              <Button onClick={() => setEditing({})}><Plus /> Add the first champion</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="space-y-5 min-w-0">
              {/* Search + sport chips */}
              <div className="space-y-3">
                <div className="relative max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search barangay, team, MVP, year…"
                    className="pl-8"
                  />
                </div>
                {sportNames.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin sm:flex-wrap sm:overflow-visible">
                    {["all", ...sportNames].map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        className="shrink-0"
                        variant={sportFilter === s ? "default" : "secondary"}
                        onClick={() => setSportFilter(s)}
                      >
                        {s === "all" ? "All sports" : s}
                        <span className="opacity-60 tabular-nums">
                          {s === "all" ? champions.length : champions.filter((c) => c.sport === s).length}
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {years.length === 0 ? (
                <p className="text-sm text-muted-foreground">No champions match.</p>
              ) : (
                years.map((y) => (
                  <section key={y} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold tabular-nums">{y}</h2>
                      <span className="text-xs text-muted-foreground">
                        {byYear[y].length} {byYear[y].length === 1 ? "title" : "titles"}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                      {byYear[y].map((c) => (
                        <ChampionCard
                          key={c.id}
                          c={c}
                          onView={() => setViewing(c)}
                          onEdit={() => setEditing(c)}
                          onDelete={() => remove(c)}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>

            {/* Title count per barangay — who dominates the archive. */}
            <Card className="h-fit xl:sticky xl:top-20">
              <CardContent className="space-y-3">
                <p className="text-sm font-semibold">Most titles</p>
                <ol className="space-y-2">
                  {summary.leaders.map(([name, n], i) => (
                    <li key={name} className="flex items-center gap-3">
                      <span className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        i === 0 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
                      )}>
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate text-sm">{name}</span>
                      <span className="text-sm font-semibold tabular-nums">{n}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {editing && (
        <ChampionDialog
          champion={editing.id ? editing : null}
          sports={sports}
          barangays={barangays}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}

      {viewing && (
        <Lightbox
          src={photoUrl(viewing)}
          alt={`${viewing.year} ${viewing.sport} champion`}
          caption={`${viewing.year} · ${viewing.sport}${viewing.division ? ` · ${viewing.division}` : ""} — ${viewing.barangay}`}
          onClose={() => setViewing(null)}
        />
      )}
    </AdminLayout>
  );
}

function ChampionCard({ c, onView, onEdit, onDelete }) {
  return (
    <Card className="gap-0 py-0 overflow-hidden">
      {c.hasPhoto ? (
        <button type="button" onClick={onView} className="relative block aspect-video w-full overflow-hidden bg-muted" title="View photo">
          <img src={photoUrl(c)} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        </button>
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-amber-500/10 to-amber-500/0 text-amber-600/70 dark:text-amber-400/70">
          <Trophy className="size-10" />
          <span className="text-xs text-muted-foreground">No photo</span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{c.sport}</Badge>
          {c.division && <Badge variant="outline">{c.division}</Badge>}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight">{c.barangay}</p>
          {c.teamName && <p className="truncate text-sm text-muted-foreground">{c.teamName}</p>}
        </div>
        {(c.mvp || c.prize) && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
            {c.mvp && (<><dt className="text-muted-foreground">MVP</dt><dd className="truncate">{c.mvp}</dd></>)}
            {c.prize && (<><dt className="text-muted-foreground">Prize</dt><dd className="truncate">{formatPrize(c.prize)}</dd></>)}
          </dl>
        )}
        {c.notes && <p className="line-clamp-2 text-xs text-muted-foreground">{c.notes}</p>}
        <div className="mt-auto flex justify-end gap-1.5 pt-1">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
          <Button size="icon-sm" variant="destructive" aria-label="Delete champion" title="Delete" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// Add / edit form. "Other" lets in sports and barangays that no longer exist under
// that name — past champions predate the current configuration.
function ChampionDialog({ champion, sports, barangays, onClose, onSaved }) {
  const [form, setForm] = useState(() => champion ? {
    year: String(champion.year), sport: champion.sport, division: champion.division || "",
    barangay: champion.barangay, teamName: champion.teamName || "", mvp: champion.mvp || "",
    prize: prizeAmount(champion.prize), notes: champion.notes || "",
  } : BLANK);
  const [otherSport, setOtherSport] = useState(() => !!champion && !sports.some((s) => s.name === champion.sport));
  const [otherBarangay, setOtherBarangay] = useState(() => !!champion && !barangays.some((b) => b.name === champion.barangay));
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const canSave = form.year.trim() && form.sport.trim() && form.barangay.trim();
  const shownPhoto = preview || (champion?.hasPhoto ? photoUrl(champion) : null);

  function pickPhoto(file) {
    setError("");
    if (!file) return;
    if (file.size > MAX_PHOTO) { setError("That photo is over 3 MB."); return; }
    setPhoto(file);
  }

  // Always multipart — the routes accept it with or without a file, and it keeps
  // one code path instead of branching on whether a photo was picked.
  async function save() {
    setBusy(true); setError("");
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      // The form holds only the amount; the ₱ is added here.
      Object.entries(form).forEach(([k, v]) => fd.append(k, k === "prize" ? formatPrize(v) : v));
      if (photo) fd.append("photo", photo);

      const res = await fetch(champion ? `/api/champions/${champion.id}` : "/api/champions", {
        method: champion ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}` },  // no Content-Type — the browser sets the boundary
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Could not save."); return; }
      await onSaved(champion ? "Champion updated." : "Champion added.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[92dvh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{champion ? "Edit champion" : "Add a champion"}</DialogTitle>
          <DialogDescription>Year, sport and barangay are required; everything else is optional.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[13rem_minmax(0,1fr)]">
          {/* Photo — the image itself is the upload control. */}
          <div className="space-y-1.5">
            <Label>Proof photo</Label>
            <label className="group relative flex aspect-[4/3] sm:aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/50 hover:bg-muted">
              {shownPhoto ? (
                <>
                  <img src={shownPhoto} alt="" className="size-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    Change photo
                  </span>
                </>
              ) : (
                <span className="flex flex-col items-center gap-1.5 px-3 text-center text-muted-foreground">
                  <ImagePlus className="size-7" />
                  <span className="text-xs">Team photo, trophy shot or certificate</span>
                </span>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => { pickPhoto(e.target.files[0] || null); e.target.value = ""; }}
              />
            </label>
            <p className="text-muted-foreground text-xs">
              JPEG, PNG or WebP · up to 3 MB. Public.
              {photo && (
                <button type="button" className="ml-1 underline hover:text-foreground" onClick={() => setPhoto(null)}>
                  {champion?.hasPhoto ? "Keep current" : "Remove"}
                </button>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
            <div className="space-y-1.5">
              <Label>Year *</Label>
              <Input type="number" inputMode="numeric" value={form.year} onChange={set("year")} placeholder="2025" />
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
              <Input value={form.division} onChange={set("division")} placeholder="U15, Boys, Open…" />
            </div>

            <div className="space-y-1.5">
              <Label>Team name</Label>
              <Input value={form.teamName} onChange={set("teamName")} placeholder="Baybay Warriors" />
            </div>

            <div className="space-y-1.5">
              <Label>MVP</Label>
              <Input value={form.mvp} onChange={set("mvp")} placeholder="Player name" />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="champion-prize">Prize amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₱</span>
                <Input id="champion-prize" className="pl-7" inputMode="decimal" value={form.prize}
                  onChange={(e) => setForm({ ...form, prize: formatAmountInput(e.target.value) })}
                  placeholder="15,000" />
              </div>
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={set("notes")} placeholder="Anything worth recording" />
            </div>
          </div>
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !canSave}>
            {busy ? "Saving…" : champion ? "Save changes" : "Add champion"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
