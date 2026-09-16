import { useEffect, useState } from "react";
import { ImageIcon, ImageOff, Pencil, ShieldAlert, Trash2, Upload, UserPlus, Users, X } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { brgyMenu } from "../../components/menus";
import { api } from "../../api";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button, buttonVariants } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { DatePicker } from "../../components/DateTimePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Separator } from "../../components/ui/separator";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";

const ROSTER_LIMITS = {
  team: { min: 10, max: 15 },
  singles: { min: 1, max: 1 },
  doubles: { min: 2, max: 2 },
};

const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls",
  under17: "Under 17", under30: "Under 30",
};

const ELIGIBILITY_BADGE = {
  eligible: "bg-green-500/15 text-green-600 dark:text-green-400",
  flagged: "bg-red-500/15 text-red-600 dark:text-red-400",
  needs_document: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

// Matches MINOR_AGE in the pre-screen service. Under this age a player can't be
// on the SK voters' list at all, so documents are needed regardless of spelling.
const MINOR_AGE = 15;

const DOC_TYPES = [
  { value: "birth_certificate", label: "Birth certificate" },
  { value: "parental_consent", label: "Parental consent" },
  { value: "barangay_clearance", label: "Barangay clearance" },
  { value: "voters_id", label: "Voter's ID" },
];

function RowSkeleton() {
  return (
    <div className="rounded-lg border px-3 py-2.5 flex items-center gap-3">
      <Skeleton className="size-9 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

function ageFrom(birthdate) {
  if (!birthdate) return null;
  const d = new Date(birthdate), now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

// Correcting a player. Deliberately available AFTER submission too — a typo is
// usually only noticed once screening flags it, which happens on submit.
function EditPlayer({ teamId, player, onSaved, onCancel }) {
  const [form, setForm] = useState({
    firstName: player.firstName || "",
    middleName: player.middleName || "",
    lastName: player.lastName || "",
    birthdate: player.birthdate ? new Date(player.birthdate).toISOString().slice(0, 10) : "",
    jerseyNumber: player.jerseyNumber ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const identityChanged =
    form.firstName.trim() !== (player.firstName || "") ||
    form.lastName.trim() !== (player.lastName || "") ||
    form.birthdate !== (player.birthdate ? new Date(player.birthdate).toISOString().slice(0, 10) : "");

  async function save() {
    setBusy(true); setError("");
    try {
      const res = await api(`/api/teams/${teamId}/players/${player._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          middleName: form.middleName.trim(),
          lastName: form.lastName.trim(),
          birthdate: form.birthdate,
          jerseyNumber: form.jerseyNumber === "" ? null : Number(form.jerseyNumber),
        }),
      });
      onSaved(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mt-1.5">
      <p className="text-sm font-medium mb-2">Correct this player</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        <Input placeholder="First name" value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        <Input placeholder="Last name" value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        <Input placeholder="Middle name" value={form.middleName}
          onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
        <div className="space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">Birthdate</Label>
          <DatePicker value={form.birthdate}
            onChange={(v) => setForm({ ...form, birthdate: v })} />
        </div>
        <Input type="number" placeholder="Jersey #" value={form.jerseyNumber}
          onChange={(e) => setForm({ ...form, jerseyNumber: e.target.value })} />
      </div>

      {identityChanged && (
        <p className="text-amber-700 text-xs mb-2">
          Changing the name or birthdate re-runs the residency check for this player.
        </p>
      )}
      {error && <p className="text-destructive text-sm mb-2">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || !form.firstName.trim() || !form.lastName.trim()}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// Upload a residency document for one player. Shown for under-15s, who can never
// be on the voters' list, and for anyone screening has flagged.
function DocumentUpload({ teamId, playerId, onUploaded }) {
  const [docType, setDocType] = useState("birth_certificate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function upload(file) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("document", file);
      fd.append("docType", docType);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/teams/${teamId}/players/${playerId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      setDone(true);
      onUploaded && onUploaded();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mt-1.5">
      <Select value={docType} onValueChange={setDocType}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DOC_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer text-primary border-primary/20 bg-primary/5 hover:bg-primary/10")}>
        <Upload />
        {busy ? "Uploading…" : done ? "Upload another" : "Attach document"}
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
          onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
      </label>
      {done && <span className="text-xs text-green-600">Uploaded — awaiting review</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

// The barangay crest, shown on every public page beside this barangay's teams.
// Uploaded here rather than by the federation: 26 barangays, and each one knows
// its own logo.
function LogoCard() {
  const [barangay, setBarangay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [v, setV] = useState(Date.now());   // cache-buster after a change

  const user = JSON.parse(localStorage.getItem("user") || "null");
  const myId = user?.barangay?._id || user?.barangay;

  async function load() {
    try {
      const d = await api("/api/barangays");
      setBarangay((d.barangays || []).find((b) => String(b._id) === String(myId)) || null);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { if (myId) load(); }, [myId]);

  async function upload(file) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/barangays/${myId}/logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      setV(Date.now());
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm("Remove your barangay logo? A monogram will show instead.")) return;
    setBusy(true); setError("");
    try {
      await api(`/api/barangays/${myId}/logo`, { method: "DELETE" });
      setV(Date.now());
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!myId) return null;

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="size-4 text-blue-500" /> Barangay logo
        </CardTitle>
        <CardDescription>
          Shown beside your teams everywhere on the public site — match results,
          standings, brackets. Square images work best. JPEG, PNG or WebP, up to 2&nbsp;MB.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-4">
          {barangay?.hasLogo ? (
            <img src={`/api/barangays/${myId}/logo?v=${v}`} alt=""
              className="h-20 w-20 rounded-lg object-cover bg-muted border" />
          ) : (
            <div className="h-20 w-20 rounded-lg bg-muted border border-dashed flex flex-col items-center justify-center gap-1 text-muted-foreground text-xs text-center px-2">
              <ImageOff className="size-4" />
              No logo
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className={cn(buttonVariants({ size: "sm" }), "cursor-pointer w-fit")}>
              <Upload />
              {busy ? "Working…" : barangay?.hasLogo ? "Replace logo" : "Upload logo"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
            </label>
            {barangay?.hasLogo && (
              <Button size="sm" variant="destructive" onClick={remove} disabled={busy} className="w-fit">
                <Trash2 /> Remove
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RosterEditor({ team, sports, onClose }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState("");
  const [uploadingId, setUploadingId] = useState(null);
  const [form, setForm] = useState({ firstName: "", middleName: "", lastName: "", birthdate: "", address: "", jerseyNumber: "" });

  const sport = sports.find((s) => s._id === (team.sport?._id || team.sport));
  const entryFormat = sport?.entryFormat || "team";
  const limits = ROSTER_LIMITS[entryFormat] || ROSTER_LIMITS.team;
  const locked = !!team.submittedAt;

  async function load() {
    setLoading(true);
    try {
      const data = await api(`/api/teams/${team._id}/players`);
      setPlayers(data.players || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [team._id]);

  async function addPlayer() {
    setBusy(true); setError("");
    try {
      await api(`/api/teams/${team._id}/players`, {
        method: "POST",
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          middleName: form.middleName.trim() || undefined,
          lastName: form.lastName.trim(),
          birthdate: form.birthdate,
          address: form.address.trim() || undefined,
          jerseyNumber: form.jerseyNumber !== "" ? Number(form.jerseyNumber) : undefined,
        }),
      });
      setForm({ firstName: "", middleName: "", lastName: "", birthdate: "", address: "", jerseyNumber: "" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePlayer(playerId) {
    setError("");
    try {
      await api(`/api/teams/${team._id}/players/${playerId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitRoster() {
    if (!window.confirm("Submit this roster? It will be locked and screened for residency.")) return;
    setBusy(true); setError("");
    try {
      await api(`/api/teams/${team._id}/submit`, { method: "POST" });
      alert("Roster submitted. The residency pre-screen has run — check each player's status.");
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(playerId, file) {
    if (!file) return;
    setUploadingId(playerId); setError("");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/teams/${team._id}/players/${playerId}/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploadingId(null);
    }
  }

  const canSubmit = !locked && players.length >= limits.min && players.length <= limits.max;
  const newAge = ageFrom(form.birthdate);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl! max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <DialogTitle>{team.teamName}</DialogTitle>
            <DialogDescription>
              {sport?.name}
              {team.division && team.division !== "open" ? ` · ${DIVISION_LABEL[team.division] || team.division}` : ""}
              {" · "}{players.length}/{limits.max} player{limits.max === 1 ? "" : "s"}
              {locked ? " · submitted" : ""}
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X /></Button>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert className="border-green-200 bg-green-50 text-green-700 [&_*]:text-green-700">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-1.5">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Player photos: close-up headshot, face clearly visible, plain background if possible.
              JPEG or PNG, max 3&nbsp;MB. Photos appear on the public team roster.
            </p>

            <div className="space-y-1.5">
              {players.length === 0 && <p className="text-muted-foreground text-sm">No players yet.</p>}
              {players.map((p) => {
                const age = p.age ?? ageFrom(p.birthdate);
                const isMinor = age !== null && age < MINOR_AGE;
                const needsDoc = isMinor
                  || p.eligibilityStatus === "needs_document"
                  || p.eligibilityStatus === "flagged";

                return (
                  <div key={p._id} className="rounded-lg border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.photo ? (
                        <img src={`/api/teams/players/${p._id}/photo`} alt=""
                          className="h-9 w-9 rounded-full object-cover bg-muted shrink-0" />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs shrink-0">
                          {p.lastName?.[0]}{p.firstName?.[0]}
                        </div>
                      )}
                      <label className="text-xs text-primary hover:underline cursor-pointer shrink-0">
                        {uploadingId === p._id ? "…" : p.photo ? "Change" : "Photo"}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                          onChange={(e) => { uploadPhoto(p._id, e.target.files[0]); e.target.value = ""; }} />
                      </label>
                      <span className="text-muted-foreground text-xs w-8 shrink-0">{p.jerseyNumber ?? "—"}</span>
                      <span className="flex-1 min-w-[8rem] truncate">
                        {p.lastName}, {p.firstName} {p.middleName || ""}
                      </span>
                      <span className="text-muted-foreground text-xs shrink-0">{age ?? "—"}</span>
                      {p.eligibilityStatus && (
                        <Badge variant="outline" className={cn("whitespace-nowrap", ELIGIBILITY_BADGE[p.eligibilityStatus])}>
                          {p.eligibilityStatus.replace("_", " ")}
                        </Badge>
                      )}
                      <Button size="icon-sm" variant="outline" onClick={() => setEditingId(editingId === p._id ? null : p._id)}>
                        <Pencil />
                      </Button>
                      {!locked && (
                        <Button size="icon-sm" variant="destructive" onClick={() => removePlayer(p._id)}>
                          <Trash2 />
                        </Button>
                      )}
                    </div>

                    {p.flagReason && (
                      <p className="text-xs text-amber-700 mt-1.5">{p.flagReason}</p>
                    )}

                    {needsDoc && (
                      <>
                        {isMinor && !p.eligibilityStatus && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
                            <ShieldAlert className="size-3.5 shrink-0" />
                            Under {MINOR_AGE} — too young for the voters' list, so a document is needed.
                          </p>
                        )}
                        <DocumentUpload teamId={team._id} playerId={p._id} onUploaded={load} />
                      </>
                    )}

                    {editingId === p._id && (
                      <EditPlayer
                        teamId={team._id}
                        player={p}
                        onCancel={() => setEditingId(null)}
                        onSaved={(res) => {
                          setEditingId(null);
                          const status = res.screening?.status?.replace("_", " ");
                          setNotice(
                            !res.rescreened
                              ? "Player updated."
                              : res.teamStatus === "pending"
                                ? `Updated. Residency re-checked — now "${status}". This team no longer qualifies as verified and has returned to the Review Queue.`
                                : `Updated. Residency re-checked — now "${status}".`
                          );
                          load();
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {!locked && players.length < limits.max && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium mb-2">Add a player</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <Input placeholder="First name" value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                    <Input placeholder="Last name" value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                    <Input placeholder="Middle name (optional)" value={form.middleName}
                      onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
                    <div className="space-y-1">
                      <Label className="text-xs font-normal text-muted-foreground">Birthdate</Label>
                      <DatePicker value={form.birthdate}
                        onChange={(v) => setForm({ ...form, birthdate: v })} />
                    </div>
                    <Input placeholder="Address (optional)" value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })} />
                    <Input type="number" placeholder="Jersey # (optional)" value={form.jerseyNumber}
                      onChange={(e) => setForm({ ...form, jerseyNumber: e.target.value })} />
                  </div>

                  {newAge !== null && newAge < MINOR_AGE && (
                    <p className="text-amber-700 text-xs mb-2">
                      Age {newAge} — under {MINOR_AGE}s aren't on the voters' list, so you'll be asked
                      to attach a birth certificate or parental consent once they're added.
                    </p>
                  )}

                  <Button onClick={addPlayer}
                    disabled={busy || !form.firstName.trim() || !form.lastName.trim() || !form.birthdate}>
                    {busy ? "Adding…" : "Add player"}
                  </Button>
                </div>
              </>
            )}

            {!locked && (
              <>
                <Separator />
                <div>
                  <p className="text-muted-foreground text-sm mb-2">
                    {canSubmit
                      ? "Roster is ready to submit. Once submitted it's locked and screened."
                      : `Need ${limits.min}–${limits.max} players to submit (currently ${players.length}).`}
                  </p>
                  <Button onClick={submitRoster} disabled={!canSubmit || busy}>
                    {busy ? "Submitting…" : "Submit roster"}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function BrgyDashboard() {
  const [sports, setSports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openTeam, setOpenTeam] = useState(null);

  const [sportId, setSportId] = useState("");
  const [division, setDivision] = useState("");
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([api("/api/sports"), api("/api/teams/mine")]);
      setSports(s.sports || []);
      setTeams(t.teams || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selectedSport = sports.find((s) => s._id === sportId);
  const divisions = selectedSport?.divisions?.length ? selectedSport.divisions : ["open"];
  const entryFormat = selectedSport?.entryFormat || "team";
  const limits = ROSTER_LIMITS[entryFormat] || ROSTER_LIMITS.team;

  async function createTeam() {
    setBusy(true); setError("");
    try {
      await api("/api/teams", {
        method: "POST",
        body: JSON.stringify({
          teamName: teamName.trim(),
          sportId,
          division: division || divisions[0],
        }),
      });
      setTeamName(""); setSportId(""); setDivision("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout title="Team Registration" menu={brgyMenu} enableDarkMode>
      {loading ? (
        <div className="max-w-4xl space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3.5 w-2/3" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-20 rounded-lg" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-28" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent className="space-y-2">
              <RowSkeleton />
              <RowSkeleton />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="max-w-4xl space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <LogoCard />

          <Card className="border-l-4 border-l-green-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="size-4 text-green-500" /> Register a team
              </CardTitle>
              <CardDescription>
                Pick a sport and division. Roster size depends on the sport's format.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Sport</Label>
                <Select value={sportId} onValueChange={(v) => { setSportId(v); setDivision(""); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a sport…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sports.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {selectedSport && divisions.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Division</Label>
                  <div className="flex flex-wrap gap-2">
                    {divisions.map((d) => (
                      <Button
                        key={d}
                        type="button"
                        size="sm"
                        variant={(division || divisions[0]) === d ? "default" : "secondary"}
                        onClick={() => setDivision(d)}
                      >
                        {DIVISION_LABEL[d] || d}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {selectedSport && (
                <p className="text-xs text-muted-foreground">
                  {entryFormat === "team"
                    ? `Squad entry — ${limits.min}–${limits.max} players.`
                    : `${entryFormat === "singles" ? "Singles" : "Doubles"} entry — ${limits.max} player${limits.max > 1 ? "s" : ""}.`}
                </p>
              )}

              <div className="space-y-1.5">
                <Label>Team name</Label>
                <Input value={teamName} onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Baybay Warriors" />
              </div>

              <Button onClick={createTeam} disabled={busy || !sportId || !teamName.trim()}>
                {busy ? "Creating…" : "Create team"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-amber-500" />
                My teams <span className="font-normal text-sm text-muted-foreground">({teams.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {teams.length === 0 ? (
                <p className="text-muted-foreground text-sm">No teams registered yet this season.</p>
              ) : (
                <div className="space-y-2">
                  {teams.map((t) => (
                    <div key={t._id} className="rounded-lg border px-3 py-2.5 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.teamName}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.sport?.name}
                          {t.division && t.division !== "open" ? ` · ${DIVISION_LABEL[t.division] || t.division}` : ""}
                          {" · "}{t.playerCount} player{t.playerCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Badge
                        className={t.submittedAt
                          ? "bg-green-500/15 text-green-600 dark:text-green-400"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}
                      >
                        {t.submittedAt ? "Submitted" : "Draft"}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => setOpenTeam(t)}>
                        {t.submittedAt ? "View roster" : "Edit roster"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {openTeam && (
            <RosterEditor team={openTeam} sports={sports}
              onClose={() => { setOpenTeam(null); load(); }} />
          )}
        </div>
      )}
    </AdminLayout>
  );
}
