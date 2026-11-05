import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, FileWarning, ImageIcon, Loader2, Lock, Pencil, ShieldAlert, Trash2, Upload, UserPlus, Users, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import ImageCropDialog from "../../components/ImageCropDialog";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
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
import { CROSS_TERMS_EVENT } from "../../lib/crossTerms";
import { ageFrom } from "../../lib/age";
import { ROSTER_COLUMNS, SHEET_ACCEPT, downloadTemplate } from "../../lib/sheetTemplate";

const ROSTER_LIMITS = {
  team:        { min: 10, max: 15 },
  esportsTeam: { min: 6,  max: 6  },  // Mobile Legends / esports team sports
  singles:     { min: 1,  max: 1  },
  doubles:     { min: 2,  max: 2  },
};

// Mirrors getRosterLimits() in backend/src/routes/team.js — esports team
// sports (Mobile Legends) cap at 6, not the 10–15 physical-sport range.
function rosterLimitsFor(sport) {
  const entryFormat = sport?.entryFormat || "team";
  if (entryFormat === "team" && sport?.category === "esports") return ROSTER_LIMITS.esportsTeam;
  return ROSTER_LIMITS[entryFormat] || ROSTER_LIMITS.team;
}

const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls",
  under15: "Under 15", under30: "Under 30",
};

// Matches DIVISION_AGE_LIMIT/DIVISION_AGE_MIN in routes/team.js. Under15/Under30
// are age caps (15-and-under, 30-and-under) — every other division is
// gender/skill-based and has no entry here. under30 also has a 16 floor so
// the two divisions don't overlap.
const DIVISION_AGE_LIMIT = { under15: 15, under30: 30 };
const DIVISION_AGE_MIN = { under30: 16 };

const ELIGIBILITY_BADGE = {
  eligible: "bg-green-500/15 text-green-600 dark:text-green-400",
  flagged: "bg-red-500/15 text-red-600 dark:text-red-400",
  needs_document: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

// Same treatment as the Super Admin's Review Queue — a colored, bordered
// callout instead of plain muted text, so the reason a player needs
// attention is easy to spot rather than blending into the row.
const REASON_TONE = {
  flagged: { icon: AlertTriangle, box: "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400" },
  needs_document: { icon: FileWarning, box: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400" },
};
function ReasonCallout({ status, reason }) {
  // An eligible player should never show a leftover flag/needs-document
  // reason, even against stale data (see ReviewQueue.jsx's identical guard).
  if (!reason || status === "eligible") return null;
  const tone = REASON_TONE[status] || REASON_TONE.needs_document;
  const Icon = tone.icon;
  return (
    <p className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium w-fit mt-1.5", tone.box)}>
      <Icon className="size-3.5 shrink-0" /> {reason}
    </p>
  );
}

// Matches MINOR_AGE in the pre-screen service. Inclusive: this age or younger
// can't be on the SK voters' list at all, so documents are needed regardless
// of spelling.
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


// Correcting a player. Deliberately available AFTER submission too — a typo is
// usually only noticed once screening flags it, which happens on submit.
// The address is just the barangay's own name — the player plays for that
// barangay, so it stands in as their address. Mirrors checkAddress() in
// routes/team.js (an optional "Brgy."/"Barangay" prefix is tolerated).
const normAddr = (s) => (s || "").toString().replace(/^\s*(barangay|brgy\.?)\s+/i, "").trim().toLowerCase().replace(/\s+/g, " ");
const isBarangayAddress = (addr, name) => !!name && normAddr(addr) === normAddr(name);

function EditPlayer({ teamId, barangayName, player, onSaved, onCancel }) {
  const rootRef = useRef(null);
  // Scrolls itself into view on mount — this form renders inline in a long,
  // scrollable player list, so clicking "Edit" on a player further down
  // otherwise leaves the form open off-screen with no visual cue.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const [form, setForm] = useState({
    firstName: player.firstName || "",
    middleName: player.middleName || "",
    lastName: player.lastName || "",
    birthdate: player.birthdate ? new Date(player.birthdate).toISOString().slice(0, 10) : "",
    // Prefilled with the barangay name — an older, free-text address would
    // be rejected by the route, so correcting a legacy player just works.
    address: barangayName || player.address || "",
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
          address: form.address.trim(),
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
    <div ref={rootRef} className="rounded-lg border border-primary/20 bg-primary/5 p-3 mt-1.5">
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
          <DatePicker value={form.birthdate} captionLayout="dropdown" disableFuture
            onChange={(v) => setForm({ ...form, birthdate: v })} />
        </div>
        <div className="space-y-1">
          <Input placeholder="Address" value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <p className={`text-xs ${!form.address.trim() || isBarangayAddress(form.address, barangayName) ? "text-muted-foreground" : "text-destructive"}`}>
            Address must be your barangay's name{barangayName ? `: ${barangayName}` : ""}.
          </p>
        </div>
        <Input type="number" placeholder="Jersey # (optional)" value={form.jerseyNumber}
          onChange={(e) => setForm({ ...form, jerseyNumber: e.target.value })} />
      </div>

      {identityChanged && (
        <p className="text-amber-700 dark:text-amber-400 text-xs mb-2">
          Changing the name or birthdate re-runs the residency check for this player.
        </p>
      )}
      {error && <p className="text-destructive text-sm mb-2">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || !form.firstName.trim() || !form.lastName.trim() || !isBarangayAddress(form.address, barangayName)}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// Upload a residency document for one player. Shown for players 15 and under,
// who can never be on the voters' list, and for anyone screening has flagged.
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
      {done && <span className="text-xs text-green-600">Uploaded, awaiting review</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

// The barangay crest, shown on every public page beside this barangay's teams.
// Uploaded here rather than by the federation: 26 barangays, and each one knows
// its own logo.
function LogoCard() {
  const confirm = useConfirm();
  const [barangay, setBarangay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [v, setV] = useState(Date.now());   // cache-buster after a change
  const [pending, setPending] = useState(null);   // file awaiting crop

  const user = JSON.parse(localStorage.getItem("user") || "null");
  const myId = user?.barangay?._id || user?.barangay;

  async function load() {
    try {
      const d = await api("/api/barangays");
      setBarangay((d.barangays || []).find((b) => String(b._id) === String(myId)) || null);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { if (myId) load(); }, [myId]);

  async function uploadBlob(blob) {
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("logo", blob, "logo.jpg");
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/barangays/${myId}/logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      setPending(null);
      setV(Date.now());
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!(await confirm("Remove your barangay logo? A monogram will show instead.", { danger: true, confirmLabel: "Remove" }))) return;
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
          Shown beside your teams everywhere on the public site: match results,
          standings, brackets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-5">
          <label
            className={cn(
              "group relative h-24 w-24 shrink-0 rounded-xl overflow-hidden border bg-muted",
              busy ? "cursor-wait" : "cursor-pointer"
            )}
          >
            {barangay?.hasLogo ? (
              <img
                src={`/api/barangays/${myId}/logo?v=${v}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
                <ImageIcon className="size-5" />
                <span className="text-[11px]">No logo</span>
              </div>
            )}

            {/* Hover-to-change overlay — the image itself is the upload
                control, same pattern as a profile-photo picker. */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Camera className="size-5" />
                  <span className="text-[11px] font-medium">
                    {barangay?.hasLogo ? "Change" : "Upload"}
                  </span>
                </>
              )}
            </div>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files[0];
                if (f) setPending(f);
                e.target.value = "";   // so picking the same file twice still opens the cropper
              }}
            />
          </label>

          <div className="min-w-0 space-y-2">
            <p className="text-muted-foreground text-xs">
              JPEG, PNG or WebP, up to 2&nbsp;MB. You'll be able to position and
              zoom it into a square before it's saved.
            </p>
            {barangay?.hasLogo && (
              <Button
                size="sm"
                variant="outline"
                onClick={remove}
                disabled={busy}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 /> Remove logo
              </Button>
            )}
          </div>
        </div>

        {pending && (
          <ImageCropDialog
            file={pending}
            aspect={1}
            maxWidth={800}
            title="Position the logo"
            description="Drag to move, and use the slider to zoom. What's inside the frame is what appears on the public site."
            onCancel={() => setPending(null)}
            onSave={uploadBlob}
          />
        )}
      </CardContent>
    </Card>
  );
}

// The "Add a player" form, in its own component (Oct 2026, "typing lags in the add player
// form"): its values used to live in RosterEditor, so every keystroke re-rendered the whole
// roster window (up to 15 player rows with photos, badges and buttons, the CSV box, the date
// picker). Now a keystroke re-renders only these fields. Same fields, rules and messages.
function AddPlayerForm({ team, barangayName, onAdded }) {
  const showError = useErrorDialog();
  const blankForm = { firstName: "", middleName: "", lastName: "", birthdate: "", address: barangayName, jerseyNumber: "" };
  const [form, setForm] = useState(blankForm);
  const [adding, setAdding] = useState(false);

  const newAge = ageFrom(form.birthdate);
  const divisionAgeLimit = DIVISION_AGE_LIMIT[team.division];
  const divisionAgeMin = DIVISION_AGE_MIN[team.division];
  const overAgeLimit = divisionAgeLimit != null && newAge !== null && newAge > divisionAgeLimit;
  const underAgeMin = divisionAgeMin != null && newAge !== null && newAge < divisionAgeMin;

  async function addPlayer() {
    setAdding(true);
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
      setForm(blankForm);
      await onAdded();
    } catch (e) {
      showError(e.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <Input placeholder="First name" value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                    <Input placeholder="Last name" value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                    <Input placeholder="Middle name" value={form.middleName}
                      onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
                    <div className="space-y-1">
                      <Label className="text-xs font-normal text-muted-foreground">Birthdate</Label>
                      <DatePicker value={form.birthdate} captionLayout="dropdown" disableFuture
                        onChange={(v) => setForm({ ...form, birthdate: v })} />
                    </div>
                    <div className="space-y-1">
                      <Input placeholder="Address" value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })} />
                      <p className={`text-xs ${!form.address.trim() || isBarangayAddress(form.address, barangayName) ? "text-muted-foreground" : "text-destructive"}`}>
                        Address must be your barangay's name{barangayName ? `: ${barangayName}` : ""}.
                      </p>
                    </div>
                    <Input type="number" placeholder="Jersey # (optional)" value={form.jerseyNumber}
                      onChange={(e) => setForm({ ...form, jerseyNumber: e.target.value })} />
                  </div>

                  {newAge !== null && newAge <= MINOR_AGE && (
                    <p className="text-amber-700 dark:text-amber-400 text-xs mb-2">
                      Age {newAge}: players {MINOR_AGE} and under aren't on the voters' list, so you'll be asked
                      to attach a birth certificate or parental consent once they're added.
                    </p>
                  )}

                  {overAgeLimit && (
                    <p className="text-destructive text-xs mb-2">
                      Age {newAge}: this is a {DIVISION_LABEL[team.division]} team, capped at {divisionAgeLimit} and under.
                    </p>
                  )}

                  {underAgeMin && (
                    <p className="text-destructive text-xs mb-2">
                      Age {newAge}: this is a {DIVISION_LABEL[team.division]} team, {divisionAgeMin} and up.
                    </p>
                  )}

                  <Button onClick={addPlayer}
                    disabled={
                      adding || !form.firstName.trim() || !form.middleName.trim() || !form.lastName.trim() ||
                      !form.birthdate || !isBarangayAddress(form.address, barangayName) || overAgeLimit || underAgeMin
                    }>
                    {adding ? "Adding…" : "Add player"}
                  </Button>
    </>
  );
}

function RosterEditor({ team, sports, onClose }) {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState("");
  const [uploadingId, setUploadingId] = useState(null);
  // A picked photo waits here for the position-and-zoom step: { playerId, file }.
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [importing, setImporting] = useState(false);
  const barangayName = team.barangayName || "";

  const sport =sports.find((s) => s._id === (team.sport?._id || team.sport));
  const entryFormat = sport?.entryFormat || "team";
  const limits = rosterLimitsFor(sport);
  const locked = !!team.submittedAt;
  // Verified by the Super Admin: player details are frozen, photos still editable.
  const verified = team.status === "verified";

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
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

  async function removePlayer(playerId) {
    try {
      await api(`/api/teams/${team._id}/players/${playerId}`, { method: "DELETE" });
      await load({ quiet: true });
    } catch (e) {
      showError(e.message);
    }
  }

  async function submitRoster() {
    if (!(await confirm("Submit this roster? It will be locked and screened for residency.", { confirmLabel: "Submit" }))) return;
    setBusy(true);
    try {
      await api(`/api/teams/${team._id}/submit`, { method: "POST" });
      await confirm("Roster submitted. The residency pre-screen has run. Check each player's status.", { alertOnly: true });
      onClose();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(file) {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/teams/${team._id}/players/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();

      // Even a fully-failed import (every row skipped) carries a skippedRows
      // reason per row — show it instead of just the generic top-line
      // message, or there's no way to tell why without guessing.
      if (!res.ok) {
        if (data.skippedRows?.length) {
          const lines = data.skippedRows.slice(0, 10).map((s) => `Row ${s.row}: ${s.reason}`);
          if (data.skippedRows.length > 10) lines.push(`…and ${data.skippedRows.length - 10} more.`);
          throw new Error(`${data.message || "Import failed."}\n\n${lines.join("\n")}`);
        }
        throw new Error(data.message || "Import failed.");
      }

      await load({ quiet: true });
      if (data.skippedRows?.length) {
        const lines = data.skippedRows.slice(0, 10).map((s) => `Row ${s.row}: ${s.reason}`);
        if (data.skippedRows.length > 10) lines.push(`…and ${data.skippedRows.length - 10} more.`);
        await confirm(`${data.message}\n\n${lines.join("\n")}`, { alertOnly: true, title: "Import complete" });
      } else {
        await confirm(data.message, { alertOnly: true, title: "Import complete" });
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setImporting(false);
    }
  }

  // `blob` is the cropped JPEG from ImageCropDialog.
  async function uploadPhoto(playerId, blob) {
    if (!blob) return;
    setPendingPhoto(null);
    setUploadingId(playerId);
    try {
      const fd = new FormData();
      fd.append("photo", blob, `player-${playerId}.jpg`);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/teams/${team._id}/players/${playerId}/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      await load({ quiet: true });
    } catch (e) {
      showError(e.message);
    } finally {
      setUploadingId(null);
    }
  }

  const canSubmit = !locked && players.length >= limits.min && players.length <= limits.max;
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
          <Alert className="border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400 [&_*]:text-green-700 dark:[&_*]:text-green-400">
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
            {team.status === "rejected" && !locked && (
              <Alert className="border-amber-500/40 bg-amber-500/10">
                <AlertTriangle className="text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-foreground">
                  The SK Federation rejected a player from this team, so it's reopened for you only.
                  Add a replacement if you need one, then submit again. Once you resubmit it locks and
                  goes back for review.
                </AlertDescription>
              </Alert>
            )}
            {verified && (
              <Alert className="border-green-500/30 bg-green-500/5">
                <Lock className="text-green-600 dark:text-green-400" />
                <AlertDescription className="text-foreground">
                  This team is verified, so its player details are locked. You can still change
                  player photos. If something needs correcting during the verification period,
                  ask the Super Admin to reopen the team. It will then come back here as editable.
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">
              Player photos: close-up headshot, face clearly visible, plain background if possible.
              JPEG, PNG or WebP. You can move and zoom the photo before it's saved. Photos appear
              on the public team roster.
            </p>

            {pendingPhoto && (
              <ImageCropDialog
                file={pendingPhoto.file}
                aspect={3 / 4}
                maxWidth={900}
                title="Position the photo"
                description="Drag to move, and use the slider (or pinch / scroll) to zoom in and out. Keep the face centred. This is how it appears on the public roster."
                onCancel={() => setPendingPhoto(null)}
                onSave={(blob) => uploadPhoto(pendingPhoto.playerId, blob)}
              />
            )}

            <div className="space-y-1.5">
              {players.length === 0 && <p className="text-muted-foreground text-sm">No players yet.</p>}
              {players.map((p) => {
                const age = p.age ?? ageFrom(p.birthdate);
                const isMinor = age !== null && age <= MINOR_AGE;
                const needsDoc = isMinor
                  || p.eligibilityStatus === "needs_document"
                  || p.eligibilityStatus === "flagged";

                return (
                  <div key={p._id} className="rounded-lg border px-3 py-2 text-sm">
                    {/* Phone-first: avatar, then the name on its own line (it wraps rather
                        than truncating to "Dela Cruz, Juan Mig…"), with the actions pinned
                        top-right and the small facts — jersey, age, status, photo — on a
                        wrapping line underneath. Same markup at every width. */}
                    <div className="flex items-start gap-3">
                      {p.photo ? (
                        <img src={`/api/teams/players/${p._id}/photo?f=${p.photo}`} alt=""
                          className="h-10 w-10 rounded-full object-cover bg-muted shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs shrink-0">
                          {p.lastName?.[0]}{p.firstName?.[0]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium leading-snug break-words min-w-0">
                            {p.lastName}, {p.firstName} {p.middleName || ""}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!verified && (
                              <Button size="icon-sm" variant="outline" aria-label="Edit player"
                                onClick={() => setEditingId(editingId === p._id ? null : p._id)}>
                                <Pencil />
                              </Button>
                            )}
                            {!locked && (
                              <Button size="icon-sm" variant="destructive" aria-label="Remove player"
                                onClick={() => removePlayer(p._id)}>
                                <Trash2 />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>#{p.jerseyNumber ?? "—"}</span>
                          <span>{age ?? "—"} yrs</span>
                          {p.eligibilityStatus && (
                            <Badge variant="outline" className={cn("whitespace-nowrap", ELIGIBILITY_BADGE[p.eligibilityStatus])}>
                              {p.eligibilityStatus.replace("_", " ")}
                            </Badge>
                          )}
                          <label className="text-primary hover:underline cursor-pointer">
                            {uploadingId === p._id ? "Uploading…" : p.photo ? "Change photo" : "Add photo"}
                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                              onChange={(e) => {
                                const f = e.target.files[0];
                                if (f) setPendingPhoto({ playerId: p._id, file: f });
                                e.target.value = "";   // picking the same file twice still opens the cropper
                              }} />
                          </label>
                        </div>
                      </div>
                    </div>

                    {p.address && (
                      <p className="text-xs text-muted-foreground mt-1.5 truncate">{p.address}</p>
                    )}

                    <ReasonCallout status={p.eligibilityStatus} reason={p.flagReason} />

                    {needsDoc && (
                      <>
                        {isMinor && !p.eligibilityStatus && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
                            <ShieldAlert className="size-3.5 shrink-0" />
                            {MINOR_AGE} or under: too young for the voters' list, so a document is needed.
                          </p>
                        )}
                        <DocumentUpload teamId={team._id} playerId={p._id} onUploaded={load} />
                      </>
                    )}

                    {editingId === p._id && !verified && (
                      <EditPlayer
                        teamId={team._id}
                        barangayName={barangayName}
                        player={p}
                        onCancel={() => setEditingId(null)}
                        onSaved={(res) => {
                          setEditingId(null);
                          const status = res.screening?.status?.replace("_", " ");
                          setNotice(
                            !res.rescreened
                              ? "Player updated."
                              : res.teamStatus === "pending"
                                ? `Updated. Residency re-checked, now "${status}". This team no longer qualifies as verified and has returned to the Review Queue.`
                                : `Updated. Residency re-checked, now "${status}".`
                          );
                          load({ quiet: true });
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
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <h3 className="text-sm font-medium">Add a player</h3>
                    <label className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      importing ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    )}>
                      <Upload /> {importing ? "Importing…" : "Import CSV / Excel"}
                      <input
                        type="file"
                        accept={SHEET_ACCEPT}
                        className="hidden"
                        disabled={importing}
                        onChange={(e) => { importCsv(e.target.files[0]); e.target.value = ""; }}
                      />
                    </label>
                  </div>
                  <p className="text-muted-foreground text-xs mb-3">
                    Already have a list? Upload a CSV or Excel file with the same columns as the
                    SK Federation's reference list: {ROSTER_COLUMNS.join(", ")} (
                    <button type="button" className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => downloadTemplate(ROSTER_COLUMNS, "player-import-template.csv")}>
                      download the template</button>). Last name, first name and birthdate are required;
                    Age can be left blank, it is worked out from the birthdate. Column
                    names don't have to match exactly. Every imported player's address is set to
                    your barangay's name. Rows are added up to the roster's limit;
                    anything invalid or over the limit is skipped and reported.
                  </p>
                  <AddPlayerForm team={team} barangayName={barangayName} onAdded={() => load({ quiet: true })} />
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

// What screening found on a SUBMITTED roster, beside its "Submitted" badge (Sep 2026):
// flagged players, players still missing a document, and documents waiting for the SK
// Federation. Counts come from GET /api/teams/mine (`screening`). The two actionable
// ones link to where they're fixed: flagged → open the roster (correct a misspelled
// name), missing document → the Verification Status page.
function ScreeningBadges({ s }) {
  const navigate = useNavigate();
  if (!s) return null;
  const chips = [];
  if (s.flagged > 0) {
    chips.push(
      <Badge key="f" className="bg-red-500/15 text-red-600 dark:text-red-400 whitespace-nowrap">
        <ShieldAlert className="size-3" /> {s.flagged} flagged
      </Badge>
    );
  }
  if (s.needsDocument > 0) {
    chips.push(
      <button key="n" type="button" onClick={() => navigate("/brgy/documents")} title="Upload the missing documents">
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 whitespace-nowrap hover:bg-amber-500/25">
          <FileWarning className="size-3" /> {s.needsDocument} need{s.needsDocument === 1 ? "s" : ""} a document
        </Badge>
      </button>
    );
  }
  if (s.docInReview > 0) {
    chips.push(
      <Badge key="r" className="bg-sky-500/15 text-sky-700 dark:text-sky-300 whitespace-nowrap">
        {s.docInReview} document{s.docInReview === 1 ? "" : "s"} in review
      </Badge>
    );
  }
  if (!chips.length && s.players > 0 && s.eligible === s.players) {
    chips.push(
      <Badge key="ok" variant="outline" className="text-green-700 dark:text-green-400 whitespace-nowrap">
        All eligible
      </Badge>
    );
  }
  return chips;
}

export default function BrgyDashboard() {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const [sports, setSports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openTeam, setOpenTeam] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [sportId, setSportId] = useState("");
  const [division, setDivision] = useState("");
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);
  // League terms (Nov 2026): every barangay may register only after accepting them
  // (server: lib/crossTerms.js). null = not loaded yet.
  const [terms, setTerms] = useState(null);
  const termsClosed = !!terms && terms.status !== "accepted";

  // `quiet`: refresh the list in place (no skeleton). Closing the roster editor used to
  // reload with the full-page skeleton, so the page flashed and jumped back to the top
  // like a browser refresh (Oct 2026 report). The counts / screening badges still update.
  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
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

  useEffect(() => {
    const refresh = () => api("/api/terms/mine").then(setTerms).catch(() => {});
    refresh();
    window.addEventListener(CROSS_TERMS_EVENT, refresh);
    return () => window.removeEventListener(CROSS_TERMS_EVENT, refresh);
  }, []);

  const selectedSport = sports.find((s) => s._id === sportId);
  const divisions = selectedSport?.divisions?.length ? selectedSport.divisions : ["open"];
  const entryFormat = selectedSport?.entryFormat || "team";
  const limits = rosterLimitsFor(selectedSport);
  // How many teams this barangay may enter for the picked sport + division — from the
  // server (teamsAllowedFor in lib/sportRules.js). For Mobile Legends it follows the
  // knockout size the Super Admin set in League Setup: Top 8 = 1 team, Top 16 = 2.
  // No silent default when there is a choice (Oct 2026): the first division used to be picked
  // for you, so a second "Badminton" registration quietly became Boys.
  const activeDivision = division || (divisions.length === 1 ? divisions[0] : "");
  const maxTeams = selectedSport?.teamsAllowed ?? 1;
  const koSize = selectedSport?.knockoutSize || null;
  const registeredHere = selectedSport
    ? teams.filter((t) => String(t.sport?._id || t.sport) === selectedSport._id && (t.division || "open") === activeDivision).length
    : 0;
  const slotsFull = !!selectedSport && registeredHere >= maxTeams;

  async function createTeam() {
    setBusy(true);
    try {
      await api("/api/teams", {
        method: "POST",
        body: JSON.stringify({
          teamName: teamName.trim(),
          sportId,
          division: activeDivision,
        }),
      });
      setTeamName(""); setSportId(""); setDivision("");
      await load({ quiet: true });
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTeam(team) {
    const ok = await confirm(
      `Delete "${team.teamName}"? This removes the team and every player on its roster (documents and photos included). This cannot be undone.`,
      { danger: true, confirmLabel: "Delete team" }
    );
    if (!ok) return;
    setDeletingId(team._id);
    try {
      await api(`/api/teams/${team._id}`, { method: "DELETE" });
      await load({ quiet: true });
    } catch (e) {
      showError(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AdminLayout title="My Teams" menu={brgyMenu} enableDarkMode
      subtitle="Register a team, build its roster, then submit it to the SK Federation for verification.">
      {loading ? (
        <div className="space-y-6">
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
        <div className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {termsClosed && (
            <Alert className="border-red-500/30 bg-red-500/5">
              <Lock className="size-4 text-red-600 dark:text-red-400" />
              <AlertDescription className="text-red-700 dark:text-red-400">
                {terms.status === "declined"
                  ? "Registration is closed for your barangay because the league terms and conditions were declined. Contact the SK Federation if you want to be asked again."
                  : "Accept the league terms and conditions to register teams and players."}
              </AlertDescription>
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
                        variant={division === d ? "default" : "secondary"}
                        onClick={() => setDivision(d)}
                      >
                        {DIVISION_LABEL[d] || d}
                      </Button>
                    ))}
                  </div>
                  {!division && <p className="text-xs text-muted-foreground">Pick which division this team plays in.</p>}
                </div>
              )}

              {selectedSport && (
                <p className="text-xs text-muted-foreground">
                  {entryFormat === "team"
                    ? limits.min === limits.max
                      ? `Squad entry: exactly ${limits.max} players.`
                      : `Squad entry: ${limits.min}–${limits.max} players.`
                    : `${entryFormat === "singles" ? "Singles" : "Doubles"} entry: ${limits.max} player${limits.max > 1 ? "s" : ""}.`}
                </p>
              )}

              {selectedSport && activeDivision && (
                <div
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs space-y-1",
                    slotsFull
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                  )}
                >
                  <p className="font-medium">
                    {maxTeams === 1
                      ? `1 team per barangay${divisions.length > 1 ? ` in ${DIVISION_LABEL[activeDivision] || activeDivision}` : ""} — ${registeredHere ? "already registered" : "not registered yet"}.`
                      : `Up to ${maxTeams} teams per barangay, ${registeredHere} of ${maxTeams} registered.`}
                  </p>
                  {koSize ? (
                    <p>
                      This season is a Top {koSize} knockout, set by the SK Federation.
                      {maxTeams > 1 ? " One team is enough to join; the second is optional." : " Only one team per barangay can enter."}
                    </p>
                  ) : maxTeams > 1 && (
                    <p>One team is enough to join; the others are optional.</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Team name</Label>
                <Input value={teamName} onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Baybay Warriors" />
              </div>

              <Button onClick={createTeam} disabled={busy || termsClosed || !sportId || !activeDivision || !teamName.trim() || slotsFull}>
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
                    <div key={t._id} className="rounded-lg border px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium break-words sm:truncate">{t.teamName}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.sport?.name}
                          {t.division && t.division !== "open" ? ` · ${DIVISION_LABEL[t.division] || t.division}` : ""}
                          {" · "}{t.playerCount} player{t.playerCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      {/* Below the name on a phone (so the name gets the full row), inline
                          beside it from sm up. */}
                      <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
                        {/* Badges get their own line on a phone, so the buttons stay together below. */}
                        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                        <Badge
                          className={t.status === "verified"
                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                            : t.submittedAt
                              ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                              : t.status === "rejected"
                                ? "bg-red-500/15 text-red-600 dark:text-red-400"
                                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}
                        >
                          {t.status === "verified" ? "Verified"
                            : t.submittedAt ? "Submitted"
                            : t.status === "rejected" ? "Player rejected: fix and resubmit"
                            : "Draft"}
                        </Badge>
                        {t.submittedAt && t.status !== "verified" && <ScreeningBadges s={t.screening} />}
                        </div>
                        <div className="flex items-center gap-2 ml-auto sm:ml-0">
                          <Button size="sm" variant="outline" onClick={() => setOpenTeam(t)}>
                            {t.submittedAt ? "View roster" : "Edit roster"}
                          </Button>
                          {t.status !== "verified" && (
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label="Delete team"
                              className="text-red-600 hover:text-red-600 dark:text-red-400"
                              disabled={deletingId === t._id}
                              onClick={() => deleteTeam(t)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {openTeam && (
            <RosterEditor team={openTeam} sports={sports}
              onClose={() => { setOpenTeam(null); load({ quiet: true }); }} />
          )}
        </div>
      )}
    </AdminLayout>
  );
}
