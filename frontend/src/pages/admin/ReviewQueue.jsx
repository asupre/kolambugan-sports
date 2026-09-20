import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileText, FileWarning, ListChecks, Minus, Plus, RotateCcw, ShieldCheck, X } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";

// Icon + tone for a player's flagReason, shared by the row callout and the
// modal's full-width alert — flagged (wrong barangay) reads more urgent
// (red) than needs_document (amber), matching the status badge colors.
const REASON_TONE = {
  flagged: {
    icon: AlertTriangle,
    box: "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400",
    btn: "border-red-500/40 text-red-700 dark:text-red-400 hover:bg-red-500/10",
  },
  needs_document: {
    icon: FileWarning,
    box: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
    btn: "border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10",
  },
};

function ReasonCallout({ status, reason, className }) {
  // Belt-and-suspenders alongside the backend clearing flagReason on approve:
  // an eligible player should never show the old flag/needs-document reason,
  // even against stale data.
  if (!reason || status === "eligible") return null;
  const tone = REASON_TONE[status] || REASON_TONE.needs_document;
  const Icon = tone.icon;
  return (
    <p className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium w-fit", tone.box, className)}>
      <Icon className="size-3.5 shrink-0" /> {reason}
    </p>
  );
}

// Full-width version for the player modal — same reasons as above, plus a
// link over to the Reference List, pre-searched by this player's name. That
// page re-runs the same matching decision LIVE against the current list (see
// referenceList.js), so it works for every player regardless of when they
// were screened — nothing here depends on a stored "matched" id, and nothing
// needs to be re-saved to see the connection.
function MatchCallout({ status, reason, lastName, firstName, navigate }) {
  const viewInReferenceList = () =>
    // last/first as separate params so the Reference List can match the EXACT
    // name (what screening does) instead of guessing from a loose search string.
    navigate(`/admin/reference?last=${encodeURIComponent(lastName || "")}&first=${encodeURIComponent(firstName || "")}`);

  if (status === "eligible") {
    return (
      <Alert className="border-green-500/30 bg-green-500/5">
        <ListChecks className="text-green-600 dark:text-green-400" />
        <AlertDescription className="text-foreground flex items-center justify-between gap-3 flex-wrap">
          <span>Eligible — open the Reference List to see the exact resident record behind this.</span>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-green-500/40 text-green-700 dark:text-green-400 hover:bg-green-500/10"
            onClick={viewInReferenceList}
          >
            View in Reference List →
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!reason) return null;
  const tone = REASON_TONE[status] || REASON_TONE.needs_document;
  const Icon = tone.icon;
  return (
    <Alert className={tone.box}>
      <Icon />
      <AlertDescription className="text-inherit flex items-center justify-between gap-3 flex-wrap">
        <span>{reason}</span>
        <Button
          size="sm"
          variant="outline"
          className={cn("shrink-0", tone.btn)}
          onClick={viewInReferenceList}
        >
          View in Reference List →
        </Button>
      </AlertDescription>
    </Alert>
  );
}

const DOC_LABEL = {
  birth_certificate: "Birth Certificate",
  voters_id: "Voter's ID",
  barangay_clearance: "Barangay Clearance",
  parental_consent: "Parental Consent",
};

const STATUS_BADGE = {
  eligible: "bg-green-500/15 text-green-600 dark:text-green-400",
  flagged: "bg-red-500/15 text-red-600 dark:text-red-400",
  needs_document: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  pending: "bg-muted text-muted-foreground",
};

const STATUS_LABEL = {
  eligible: "Eligible",
  flagged: "Flagged",
  needs_document: "Needs document",
  pending: "Pending",
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;

// A residency document is often a phone photo of an ID/certificate — "fit to
// screen" (the old Lightbox) isn't enough to read small print. This adds
// real zoom: mouse wheel, +/- buttons, double-click, and drag-to-pan once
// zoomed in. Pointer events cover both mouse drag and single-finger touch.
function Lightbox({ src, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null); // { startX, startY, origX, origY } while dragging

  function clampScale(s) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  function zoomTo(next) {
    const clamped = clampScale(next);
    setScale(clamped);
    if (clamped === MIN_SCALE) setPos({ x: 0, y: 0 });
  }

  function handleWheel(e) {
    e.preventDefault();
    zoomTo(scale + (e.deltaY < 0 ? 0.4 : -0.4));
  }

  function handleDoubleClick() {
    zoomTo(scale > MIN_SCALE ? MIN_SCALE : 2.5);
  }

  function handlePointerDown(e) {
    if (scale <= MIN_SCALE) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return;
    const { startX, startY, origX, origY } = dragRef.current;
    setPos({ x: origX + (e.clientX - startX), y: origY + (e.clientY - startY) });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[90vw] p-2 bg-black/90 border-0">
        <div
          className={cn("h-[85vh] w-full overflow-hidden rounded touch-none", scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            className="h-full w-full object-contain select-none"
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
              transition: dragRef.current ? "none" : "transform 0.15s ease-out",
            }}
          />
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1.5">
          <Button type="button" variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => zoomTo(scale - 0.5)} disabled={scale <= MIN_SCALE}>
            <Minus />
          </Button>
          <span className="w-12 text-center text-xs text-white tabular-nums">{Math.round(scale * 100)}%</span>
          <Button type="button" variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => zoomTo(scale + 0.5)} disabled={scale >= MAX_SCALE}>
            <Plus />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => zoomTo(1)} disabled={scale === MIN_SCALE}>
            <RotateCcw />
          </Button>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}
          className="absolute top-3 right-3 text-white hover:bg-white/10 hover:text-white">
          <X />
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// Documents are super-admin-only, so a plain <img src> can't fetch them (no auth
// header). We fetch with the token and turn the response into a blob URL.
function DocumentView({ doc, large }) {
  const [url, setUrl] = useState(null);
  const [type, setType] = useState("");
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let revoked = null;
    (async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/teams/documents/${doc._id}/file`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Could not load document.");
        const blob = await res.blob();
        revoked = URL.createObjectURL(blob);
        setType(blob.type);
        setUrl(revoked);
      } catch (e) {
        setErr(e.message);
      }
    })();
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [doc._id]);

  return (
    <div className="rounded-lg border p-2 bg-muted/40">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-medium text-muted-foreground">{DOC_LABEL[doc.docType] || doc.docType}</span>
        <Badge className={
          doc.verifyStatus === "approved" ? "bg-green-500/15 text-green-600 dark:text-green-400"
          : doc.verifyStatus === "rejected" ? "bg-red-500/15 text-red-600 dark:text-red-400"
          : "bg-muted text-muted-foreground"
        }>{doc.verifyStatus}</Badge>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {!url && !err && <Skeleton className="h-32 w-full" />}
      {url && (
        <>
          {type.startsWith("image/") ? (
            <>
              <img src={url} alt="" onClick={() => setZoom(true)}
                className={cn("cursor-zoom-in rounded border", large ? "max-h-[26rem] w-full object-contain" : "max-h-48")} />
              {zoom && <Lightbox src={url} onClose={() => setZoom(false)} />}
            </>
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
              Open file in a new tab
            </a>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// One barangay in the picker — name, plus whichever badge applies: a red
// count of teams still needing a verdict, a green "Cleared" once it has a
// VERIFIED team in every sport/division slot this season is running (not
// just that whatever it happened to submit is done — a barangay with one
// verified Chess team and nothing else is NOT cleared), a muted "x/N"
// progress count if it's partway there with nothing currently pending, or
// nothing at all if it hasn't submitted anything yet.
function BarangayChip({ label, count, cleared, completedSlots, requiredSlots, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition",
        active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
      )}
    >
      {label}
      {count > 0 ? (
        <span className="min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white">
          {count}
        </span>
      ) : cleared ? (
        <span className="flex items-center gap-0.5 text-[11px] font-medium text-green-600 dark:text-green-400">
          <CheckCircle2 className="size-3.5" /> Cleared
        </span>
      ) : completedSlots > 0 ? (
        <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
          {completedSlots}/{requiredSlots}
        </span>
      ) : null}
    </button>
  );
}

function PlayerModal({ player, teamId, onClose, onApprove, onReject, busy }) {
  const p = player;
  const navigate = useNavigate();
  // needs_document has no reference-list match at all, so a document is the
  // ONLY evidence an approval can rest on — block it until one exists.
  // flagged (cross-barangay) and pending aren't gated the same way: a flag is
  // about the barangay rule, not missing paperwork.
  const blockedNoDocument = p.eligibilityStatus === "needs_document" && !p.documents?.length;
  // A flagged player can't be approved, of either kind: a cross-barangay
  // violation (the team's barangay isn't allowed to field players from another
  // barangay) or not being on the reference list (possible Dayo). The server
  // decides (`flagBlock`, live) and enforces it on the approve route too.
  const blockedCrossBarangay = p.flagBlock === "cross_barangay";
  const blockedDayo = p.flagBlock === "not_on_list";
  const approveBlocked = blockedNoDocument || blockedCrossBarangay || blockedDayo;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-4xl! p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b shrink-0">
          <div>
            <h2 className="font-semibold text-lg">{p.lastName}, {p.firstName} {p.middleName || ""}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={STATUS_BADGE[p.eligibilityStatus] || STATUS_BADGE.pending}>
                {STATUS_LABEL[p.eligibilityStatus] || p.eligibilityStatus}
              </Badge>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X /></Button>
        </div>

        {/* Body — photo and documents shown TOGETHER, not behind separate tabs,
            since the whole point of this screen is comparing the player's face
            against their submitted ID. The photo column stays sticky so it's
            still visible while scrolling through several documents. */}
        <div className="px-6 py-5 min-h-[18rem] overflow-y-auto scrollbar-thin flex-1">
          <MatchCallout
            status={p.eligibilityStatus}
            reason={p.flagReason}
            lastName={p.lastName}
            firstName={p.firstName}
            navigate={navigate}
          />
          <div className={cn("grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-6", (p.flagReason || p.eligibilityStatus === "eligible") && "mt-5")}>
            <div className="sm:sticky sm:top-0 space-y-4 self-start">
              {p.photo ? (
                <img src={`/api/teams/players/${p._id}/photo`} alt=""
                  className="w-full aspect-square rounded-xl object-cover bg-muted border" />
              ) : (
                <div className="w-full aspect-square rounded-xl bg-muted border flex items-center justify-center text-muted-foreground text-sm text-center px-3">
                  No photo
                </div>
              )}

              <dl className="space-y-2.5 text-sm">
                <Field label="Birthdate" value={p.birthdate ? new Date(p.birthdate).toLocaleDateString() : "—"} />
                <Field label="Age" value={p.age ?? "—"} />
                <Field label="Address" value={p.address || "—"} />
                <Field label="Jersey number" value={p.jerseyNumber ?? "—"} />
              </dl>
            </div>

            <div className="space-y-4 min-w-0">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Submitted documents{p.documents?.length ? ` (${p.documents.length})` : ""}
              </p>
              {!p.documents?.length ? (
                <p className="text-muted-foreground text-sm">
                  No documents uploaded. The Barangay Admin submits these from their
                  Document Submission page.
                </p>
              ) : (
                p.documents.map((d) => <DocumentView key={d._id} doc={d} large />)
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t flex items-center justify-between gap-3 flex-wrap shrink-0">
          <p className={cn("text-xs", blockedCrossBarangay || blockedDayo ? "text-red-600 dark:text-red-400 font-medium" : blockedNoDocument ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground")}>
            {blockedCrossBarangay
              ? "This barangay doesn't allow cross-barangay players, so this player can't be approved. Reject them, or allow cross-barangay for this barangay in League Setup."
              : blockedDayo
              ? "Not on the reference list (possible Dayo) — this player can't be approved. If the name is misspelled, the Barangay Admin can correct it and it re-screens; otherwise reject them."
              : blockedNoDocument
              ? "No document uploaded yet — Approve is disabled until the Barangay Admin submits one."
              : "Approving also marks this player's pending documents as approved. Rejecting removes the player and their files, and reopens the roster."}
          </p>
          {p.eligibilityStatus !== "eligible" && (
            <div className="flex gap-2 shrink-0">
              <Button onClick={() => onApprove(teamId, p._id)} disabled={busy || approveBlocked}
                title={blockedCrossBarangay ? "This barangay doesn't allow cross-barangay players." : blockedDayo ? "Not on the reference list (possible Dayo)." : blockedNoDocument ? "This player has no document uploaded yet." : undefined}
                className="bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500/40 dark:focus-visible:ring-green-500/40">
                Approve
              </Button>
              <Button onClick={() => onReject(teamId, p._id)} disabled={busy}
                className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/40 dark:focus-visible:ring-red-500/40">
                Reject
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ReviewQueue() {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const [teams, setTeams] = useState([]);
  const [verifiedTeams, setVerifiedTeams] = useState([]); // for "Reopen for corrections"
  const [seasonStatus, setSeasonStatus] = useState("");
  const [barangays, setBarangays] = useState([]);    // all 26, each with a pending/verified/cleared tally
  const [selectedBarangay, setSelectedBarangay] = useState(null); // null = "All"
  const [loading, setLoading] = useState(true);
  const [openTeam, setOpenTeam] = useState(null);   // teamId currently expanded
  const [players, setPlayers] = useState([]);        // players of the open team
  const [playersLoading, setPlayersLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [modalPlayer, setModalPlayer] = useState(null);

  async function loadQueue() {
    setLoading(true);
    try {
      const data = await api("/api/review/queue");
      setTeams(data.teams || []);
      setVerifiedTeams(data.verifiedTeams || []);
      setSeasonStatus(data.seasonStatus || "");
      setBarangays(data.barangays || []);
    } catch (e) {
      setTeams([]);
      setVerifiedTeams([]);
      setBarangays([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadQueue(); }, []);

  // Picking a barangay narrows the list below instead of making the Super
  // Admin scroll through every submitted team in the season to find one
  // barangay's. "All" (selectedBarangay === null) keeps the old flat view.
  const visibleTeams = selectedBarangay
    ? teams.filter((t) => t.barangayId === selectedBarangay)
    : teams;
  const selectedBarangayInfo = selectedBarangay
    ? barangays.find((b) => String(b.id) === selectedBarangay)
    : null;

  async function openTeamDetail(teamId) {
    if (openTeam === teamId) { setOpenTeam(null); return; } // toggle closed
    setOpenTeam(teamId);
    setPlayersLoading(true);
    setMsg("");
    try {
      const data = await api(`/api/review/teams/${teamId}`);
      setPlayers(data.players || []);
    } catch (e) {
      setPlayers([]);
    } finally {
      setPlayersLoading(false);
    }
  }

  async function refreshOpenTeam() {
    if (!openTeam) return;
    const data = await api(`/api/review/teams/${openTeam}`);
    setPlayers(data.players || []);
    loadQueue(); // tallies may have changed
  }

  async function approve(teamId, playerId) {
    setBusy(true);
    try {
      await api(`/api/review/teams/${teamId}/players/${playerId}/approve`, { method: "POST" });
      await refreshOpenTeam();
    } catch (e) { showError(e.message); }
    finally { setBusy(false); }
  }

  async function reject(teamId, playerId) {
    if (!(await confirm("Reject and remove this player? The roster will reopen for the barangay to add a replacement.", { danger: true, confirmLabel: "Reject" }))) return;
    setBusy(true); setMsg("");
    try {
      const data = await api(`/api/review/teams/${teamId}/players/${playerId}/reject`, { method: "POST" });
      setMsg(data.message || "Player rejected.");
      await refreshOpenTeam();
    } catch (e) { showError(e.message); }
    finally { setBusy(false); }
  }

  async function verify(teamId) {
    setBusy(true); setMsg("");
    try {
      const data = await api(`/api/review/teams/${teamId}/verify`, { method: "POST" });
      setMsg(data.message || "Team verified.");
      await refreshOpenTeam();
    } catch (e) { showError(e.message); } // backend blocks if not all eligible — pops now, not buried off-screen
    finally { setBusy(false); }
  }

  // Undo a verification. A verified team's player details are locked for its
  // Barangay Admin; reopening sends it back to pending so they can correct it,
  // and it lands back in this queue to be verified again. The backend refuses
  // once the team is in a tournament's matches.
  async function reopen(t) {
    if (!(await confirm(
      `Reopen ${t.teamName}? It goes back to the queue as pending and ${t.barangay}'s admin can edit its players again. You'll need to verify it again afterwards.`,
      { confirmLabel: "Reopen" }
    ))) return;
    setBusy(true); setMsg("");
    try {
      const data = await api(`/api/review/teams/${t.teamId}/reopen`, { method: "POST" });
      setMsg(data.message || "Team reopened.");
      await loadQueue();
    } catch (e) { showError(e.message); }
    finally { setBusy(false); }
  }

  // Reopening is only offered during the verification period — once the season
  // is ongoing, verified teams are final (the backend enforces this too).
  const visibleVerified = selectedBarangay && seasonStatus === "verification"
    ? verifiedTeams.filter((t) => t.barangayId === selectedBarangay)
    : [];

  const allEligible = players.length > 0 && players.every((p) => p.eligibilityStatus === "eligible");

  return (
    <AdminLayout title="Review Queue" menu={superAdminMenu} enableDarkMode>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Barangay picker — pick one to work through just its teams instead
              of scrolling every submitted team in the season. */}
          {barangays.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Barangays</CardTitle>
                <CardDescription>
                  Pick a barangay to review just its teams. Red = still needs a verdict, green =
                  cleared (a verified team in every sport/division this season), gray x/N = partway
                  there with nothing currently pending.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <BarangayChip
                  label="All barangays"
                  count={teams.length}
                  active={selectedBarangay === null}
                  onClick={() => setSelectedBarangay(null)}
                />
                {barangays.map((b) => (
                  <BarangayChip
                    key={b.id}
                    label={b.name}
                    count={b.pendingTeams}
                    cleared={b.cleared}
                    completedSlots={b.completedSlots}
                    requiredSlots={b.requiredSlots}
                    active={selectedBarangay === String(b.id)}
                    onClick={() => setSelectedBarangay(String(b.id))}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {visibleTeams.length === 0 ? (
            <Card className="max-w-xl">
              <CardHeader>
                <CardTitle>
                  {selectedBarangayInfo
                    ? selectedBarangayInfo.cleared ? `Brgy. ${selectedBarangayInfo.name} — cleared` : `Brgy. ${selectedBarangayInfo.name} — nothing pending`
                    : "Nothing to review"}
                </CardTitle>
                <CardDescription>
                  {selectedBarangayInfo
                    ? selectedBarangayInfo.cleared
                      ? `Brgy. ${selectedBarangayInfo.name} has a verified team in every sport/division this season (${selectedBarangayInfo.completedSlots}/${selectedBarangayInfo.requiredSlots}).`
                      : selectedBarangayInfo.completedSlots > 0
                        ? `Brgy. ${selectedBarangayInfo.name} has ${selectedBarangayInfo.completedSlots} of ${selectedBarangayInfo.requiredSlots} sport/division slots verified, and nothing currently awaiting review — still short of the rest.`
                        : `Brgy. ${selectedBarangayInfo.name} hasn't submitted any teams yet this season.`
                    : "No submitted teams are awaiting review in the current season. Teams appear here once a Barangay Admin submits their roster."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-3">
              {visibleTeams.map((t) => (
                <Card key={t.teamId} className="overflow-hidden py-0 gap-0">
                  {/* Team header row — click to expand */}
                  <button
                    onClick={() => openTeamDetail(t.teamId)}
                    className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 hover:bg-accent/50 transition text-left"
                  >
                    <div>
                      <p className="font-semibold">{t.teamName}</p>
                      <p className="text-muted-foreground text-sm">{t.barangay} · {t.sport} · {t.playerCount} players</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.tally.flagged > 0 && <Badge className={cn(STATUS_BADGE.flagged, "whitespace-nowrap")}>{t.tally.flagged} flagged</Badge>}
                      {t.tally.needs_document > 0 && <Badge className={cn(STATUS_BADGE.needs_document, "whitespace-nowrap")}>{t.tally.needs_document} need doc</Badge>}
                      {t.tally.eligible > 0 && <Badge className={cn(STATUS_BADGE.eligible, "whitespace-nowrap")}>{t.tally.eligible} eligible</Badge>}
                      {openTeam === t.teamId ? <ChevronUp className="size-4 text-muted-foreground hidden sm:block" /> : <ChevronDown className="size-4 text-muted-foreground hidden sm:block" />}
                    </div>
                  </button>

                  {/* Expanded player list */}
                  {openTeam === t.teamId && (
                    <div className="border-t px-5 py-4">
                      {playersLoading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-12 w-full" />
                          <Skeleton className="h-12 w-full" />
                        </div>
                      ) : (
                        <>
                          {msg && <p className="text-sm mb-3 bg-muted rounded px-3 py-2">{msg}</p>}
                          <div className="space-y-2">
                            {players.map((p) => (
                              <button
                                key={p._id}
                                onClick={() => setModalPlayer(p)}
                                className="w-full flex items-center gap-3 py-2 border-b last:border-0 text-left hover:bg-accent/50 rounded-lg px-2 transition"
                              >
                                {p.photo ? (
                                  <img src={`/api/teams/players/${p._id}/photo`} alt=""
                                    className="h-10 w-10 rounded-full object-cover bg-muted shrink-0" />
                                ) : (
                                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs shrink-0">
                                    {p.lastName?.[0]}{p.firstName?.[0]}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm">{p.lastName}, {p.firstName}</span>
                                    <Badge className={STATUS_BADGE[p.eligibilityStatus] || STATUS_BADGE.pending}>
                                      {STATUS_LABEL[p.eligibilityStatus] || p.eligibilityStatus}
                                    </Badge>
                                    {p.documents?.length > 0 && (
                                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <FileText className="size-3" /> {p.documents.length} doc{p.documents.length > 1 ? "s" : ""}
                                      </span>
                                    )}
                                  </div>
                                  <ReasonCallout status={p.eligibilityStatus} reason={p.flagReason} className="mt-1" />
                                </div>
                                <span className="text-muted-foreground text-xs shrink-0">View →</span>
                              </button>
                            ))}
                          </div>

                          {/* Verify team */}
                          <div className="mt-4 pt-3 border-t flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                              {allEligible ? "All players eligible — ready to verify." : "Resolve all flagged / needs-document players to verify."}
                            </p>
                            <Button onClick={() => verify(t.teamId)} disabled={busy || !allEligible}>
                              <ShieldCheck /> Verify Team
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Verified teams of the picked barangay — verified teams are locked
              for their Barangay Admin, so this is the way back if one needs a
              correction. Only shown once a barangay is picked (all 26 at once
              would be a very long list). */}
          {visibleVerified.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Verified teams</CardTitle>
                <CardDescription>
                  These are locked — their Barangay Admin can only change photos. Reopen one to let
                  them correct a player; it returns to the queue and needs verifying again. A team
                  already in a tournament can't be reopened (delete the tournament first).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {msg && <p className="text-sm bg-muted rounded px-3 py-2">{msg}</p>}
                {visibleVerified.map((t) => (
                  <div key={t.teamId} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.teamName}</p>
                      <p className="text-muted-foreground text-xs truncate">{t.sport} · {t.playerCount} players</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => reopen(t)}>
                      <RotateCcw /> Reopen for corrections
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {modalPlayer && (
        <PlayerModal
          player={modalPlayer}
          teamId={openTeam}
          busy={busy}
          onClose={() => setModalPlayer(null)}
          onApprove={async (tid, pid) => { await approve(tid, pid); setModalPlayer(null); }}
          onReject={async (tid, pid) => { await reject(tid, pid); setModalPlayer(null); }}
        />
      )}
    </AdminLayout>
  );
}
