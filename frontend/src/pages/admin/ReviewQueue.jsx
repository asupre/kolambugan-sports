import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronUp, FileText, FileWarning, ListChecks, RotateCcw, ShieldCheck, X } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { DocumentFrame } from "../../components/DocumentViewer";
import InfoHint from "../../components/InfoHint";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
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
// A near-miss (a same-name reference row that disagrees on middle initial
// and/or birthdate) gets its OWN louder red+orange tone, overriding whatever
// REASON_TONE the status alone would give it — a needs_document minor with a
// near-miss looked exactly like any routine "just needs a document" case in
// plain amber, which is precisely the case a Super Admin skimming the queue
// might approve on the document alone without noticing the name might not
// actually be this player.
const NEAR_MISS_TONE = {
  icon: AlertTriangle,
  box: "border-red-500/50 bg-orange-500/10 text-red-700 dark:text-red-400",
  btn: "border-red-500/50 text-red-700 dark:text-red-400 hover:bg-red-500/10",
};

function ReasonCallout({ status, reason, nearMiss, className }) {
  // Belt-and-suspenders alongside the backend clearing flagReason on approve:
  // an eligible player should never show the old flag/needs-document reason,
  // even against stale data.
  if (!reason || status === "eligible") return null;
  const hasNearMiss = nearMiss && nearMiss.length > 0;
  const tone = hasNearMiss ? NEAR_MISS_TONE : (REASON_TONE[status] || REASON_TONE.needs_document);
  const Icon = tone.icon;
  return (
    <p className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium w-fit", tone.box, className)}>
      <Icon className="size-3.5 shrink-0" />
      {reason}
      {/* A same-name row exists but the middle initial/birthdate disagree —
          see the full breakdown in the player modal instead of repeating it
          here, this row just needs to say a likely match exists at all. */}
      {hasNearMiss && " · possible match on the list, details differ"}
    </p>
  );
}

// Full-width version for the player modal — same reasons as above, plus a
// link over to the Reference List, pre-searched by this player's name. That
// page re-runs the same matching decision LIVE against the current list (see
// referenceList.js), so it works for every player regardless of when they
// were screened — nothing here depends on a stored "matched" id, and nothing
// needs to be re-saved to see the connection.
// Field-by-field breakdown for one near-miss candidate — same shape and same
// wording as the Reference List page's own near-miss rendering, since both
// come from the same backend comparison (`nearMissesFor` in prescreen.js).
function NearMissDetail({ m }) {
  // Red = what the roster says (what the Barangay Admin typed/what's on file
  // for this player); orange = what the reference list's row actually says —
  // same red+orange pairing as the callout box around it, so the two sides
  // being compared are visually distinct instead of both reading as plain text.
  return (
    <div className="text-xs space-y-0.5">
      {m.barangay && <p className="text-muted-foreground">Listed under {m.barangay}.</p>}
      {m.differs.middle && (
        <p>
          <span className="text-muted-foreground">Middle name: </span>
          <span className="font-semibold text-red-600 dark:text-red-400">{m.differs.middle.roster || "none"}</span>
          <span className="text-muted-foreground"> on roster vs </span>
          <span className="font-semibold text-orange-600 dark:text-orange-400">{m.differs.middle.list || "none"}</span>
          <span className="text-muted-foreground"> on the list.</span>
        </p>
      )}
      {m.differs.birthdate && (
        <p>
          <span className="text-muted-foreground">Birthdate: </span>
          <span className="font-semibold text-red-600 dark:text-red-400">{m.differs.birthdate.roster ? new Date(m.differs.birthdate.roster).toLocaleDateString() : "none"}</span>
          <span className="text-muted-foreground"> on roster vs </span>
          <span className="font-semibold text-orange-600 dark:text-orange-400">{m.differs.birthdate.list ? new Date(m.differs.birthdate.list).toLocaleDateString() : "none"}</span>
          <span className="text-muted-foreground"> on the list.</span>
        </p>
      )}
    </div>
  );
}

function MatchCallout({ status, reason, nearMiss, lastName, firstName, navigate }) {
  const viewInReferenceList = () =>
    // last/first as separate params so the Reference List can match the EXACT
    // name (what screening does) instead of guessing from a loose search string.
    navigate(`/admin/reference?last=${encodeURIComponent(lastName || "")}&first=${encodeURIComponent(firstName || "")}`);

  if (status === "eligible") {
    return (
      <Alert className="border-green-500/30 bg-green-500/5">
        <ListChecks className="text-green-600 dark:text-green-400" />
        <AlertDescription className="text-foreground flex items-center justify-between gap-3 flex-wrap">
          <span>Eligible. Open the Reference List to see the exact resident record behind this.</span>
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
  const hasNearMiss = nearMiss && nearMiss.length > 0;
  // Near-miss overrides the status-based tone — same reasoning as
  // ReasonCallout above: a needs_document minor with a near-miss must not
  // read as the routine amber "just needs a document" case.
  const tone = hasNearMiss ? NEAR_MISS_TONE : (REASON_TONE[status] || REASON_TONE.needs_document);
  const Icon = tone.icon;
  return (
    <Alert className={tone.box}>
      <Icon />
      <AlertDescription className="text-inherit space-y-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span>{reason}</span>
          <Button
            size="sm"
            variant="outline"
            className={cn("shrink-0", tone.btn)}
            onClick={viewInReferenceList}
          >
            View in Reference List →
          </Button>
        </div>
        {/* A same-name row exists but the middle initial and/or birthdate
            disagree — shows exactly what's different, instead of leaving the
            generic reason above ("Not found on the list" / "15 or under…")
            looking like a clean miss when it might just be a typo. Same
            comparison and same field breakdown the Reference List page's
            orange near-miss uses (`nearMiss` from GET /review/teams/:teamId). */}
        {hasNearMiss && (
          <div className="space-y-2 border-t border-current/20 pt-2.5">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0" /> Possible match on the list (same name, details differ):
            </p>
            {nearMiss.map((m, i) => <NearMissDetail key={i} m={m} />)}
          </div>
        )}
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

// Which division a team entered — without it, a barangay's two Badminton
// teams (boys + girls) looked identical in the queue (Sep 2026).
const DIVISION_LABEL = { open: "Open", boys: "Boys", girls: "Girls", under15: "Under 15", under30: "Under 30" };
const DIVISION_BADGE = {
  boys: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  girls: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
};
function DivisionBadge({ division }) {
  if (!division || !DIVISION_LABEL[division]) return null;
  return (
    <Badge variant="secondary" className={cn("whitespace-nowrap", DIVISION_BADGE[division])}>
      {DIVISION_LABEL[division]}
    </Badge>
  );
}

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

// Documents are super-admin-only, so a plain <img src> can't fetch them (no auth
// header). Fetching + zoom is shared with the Barangay Admin's own document
// preview (components/DocumentViewer.jsx) — this just adds the label/status
// header around it.
function DocumentView({ doc, large }) {
  return (
    <div className="rounded-lg border p-2 bg-muted/40">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-medium text-muted-foreground">{DOC_LABEL[doc.docType] || doc.docType}</span>
        <Badge className={
          doc.verifyStatus === "approved" ? "border border-green-500/40 bg-green-500/20 text-green-700 dark:text-green-300"
          : doc.verifyStatus === "rejected" ? "border border-red-500/40 bg-red-500/20 text-red-700 dark:text-red-300"
          : "border border-amber-500/40 bg-amber-500/20 text-amber-700 dark:text-amber-300"
        }>{doc.verifyStatus === "pending" ? "Awaiting review" : doc.verifyStatus === "approved" ? "Approved" : doc.verifyStatus === "rejected" ? "Rejected" : doc.verifyStatus}</Badge>
      </div>
      <DocumentFrame fetchUrl={`/api/teams/documents/${doc._id}/file`} large={large} />
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

// One roster row — shared by the pending-team list and the verified-team list,
// which used to duplicate this markup. Always opens the same PlayerModal; the
// modal itself decides what's actionable (a verified team's players are all
// `eligible` by definition, so it naturally shows no Approve/Reject buttons).
function PlayerRow({ p, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2 border-b last:border-0 text-left hover:bg-accent/50 rounded-lg px-2 transition"
    >
      {p.photo ? (
        <img src={`/api/teams/players/${p._id}/photo?f=${p.photo || ""}`} alt="" decoding="async"
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
        <ReasonCallout status={p.eligibilityStatus} reason={p.flagReason} nearMiss={p.nearMiss} className="mt-1" />
      </div>
      <span className="text-muted-foreground text-xs shrink-0">View →</span>
    </button>
  );
}

// One barangay in the picker — name, plus whichever badge applies: a red
// count of teams still needing a verdict, a green "Cleared" once it has a
// VERIFIED team in every sport/division slot this season is running (not
// just that whatever it happened to submit is done — a barangay with one
// verified Chess team and nothing else is NOT cleared), a muted "x/N"
// progress count if it's partway there with nothing currently pending, or
// nothing at all if it hasn't submitted anything yet.
// One barangay in the dropdown: its name and the old chip's colour-coded status pill.
const OPTION_TONE = {
  pending: "bg-red-500 text-white",
  cleared: "bg-green-500/15 text-green-700 dark:text-green-400",
  partial: "bg-muted text-muted-foreground",
  none: "text-muted-foreground",
};
function BarangayOption({ name, tone, label }) {
  return (
    <span className="flex w-full min-w-0 items-center justify-between gap-3">
      <span className="truncate">{name}</span>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none tabular-nums", OPTION_TONE[tone])}>
        {tone === "cleared" && <span aria-hidden="true">✓ </span>}{label}
      </span>
    </span>
  );
}

// Teams as a TABLE (Oct 2026, Super Admin request: the big stacked rows were hard to scan).
// One row per team; the whole row is clickable and opens the roster in a full-width row
// under it (`detail`). Without `onToggle` / `detail` the rows are read-only. On phones the
// Barangay and Sport columns fold into a second line under the team name.
function TeamTable({ teams, openTeam, onToggle, status, detail }) {
  const clickable = !!onToggle;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <table className="w-full text-left">
        <thead className="border-b bg-muted/40 text-[13px] text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Team</th>
            <th className="hidden px-4 py-2.5 font-medium md:table-cell">Barangay</th>
            <th className="hidden px-4 py-2.5 font-medium md:table-cell">Sport</th>
            <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Players</th>
            <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Screening</th>
            {clickable && <th className="w-10 px-2 py-2.5"><span className="sr-only">Open</span></th>}
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => {
            const open = clickable && openTeam === t.teamId;
            return (
              <Fragment key={t.teamId}>
                <tr
                  onClick={clickable ? () => onToggle(t.teamId) : undefined}
                  onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(t.teamId); } } : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-expanded={clickable ? open : undefined}
                  className={cn(
                    "border-b align-middle last:border-0",
                    clickable && "cursor-pointer transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
                    open && "bg-accent/40"
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-medium">{t.teamName}</span>
                      <DivisionBadge division={t.division} />
                    </div>
                    <p className="text-[13px] text-muted-foreground md:hidden">
                      {t.barangay} · {t.sport}{t.playerCount != null ? ` · ${t.playerCount} players` : ""}
                    </p>
                    <div className="mt-2 sm:hidden">{status(t)}</div>
                  </td>
                  <td className="hidden px-4 py-3 text-[15px] md:table-cell">{t.barangay}</td>
                  <td className="hidden px-4 py-3 text-[15px] md:table-cell">{t.sport}</td>
                  <td className="hidden px-4 py-3 text-right text-[15px] tabular-nums sm:table-cell">{t.playerCount ?? ""}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">{status(t)}</td>
                  {clickable && (
                    <td className="px-2 py-3 text-muted-foreground">
                      {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </td>
                  )}
                </tr>
                {open && detail && (
                  <tr className="border-b last:border-0">
                    <td colSpan={6} className="bg-background/60 px-4 py-4 sm:px-5">{detail(t)}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// `locked` = the season isn't at the verification stage yet: everything is viewable,
// but Approve / Reject stay disabled (the server refuses them too).
// `teamVerified` = this player's TEAM is already verified and locked — a stronger,
// different reason than `locked`: it's not that verdicts haven't opened yet, it's
// that this roster is finalized. Buttons are hidden outright rather than disabled
// (every player on a verified team is `eligible` anyway, which already hides them,
// but this makes the reason explicit instead of relying on that coincidence).
function PlayerModal({ player, teamId, onClose, onApprove, onReject, busy, locked, teamVerified }) {
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
  // Since Oct 5 2026 a flagged player WITH a document can be approved (the
  // Super Admin judges the document); only a flagged player with none is blocked.
  const hasDocs = p.documents?.length > 0;
  const flaggedWithDocs = !!p.flagBlock && hasDocs;
  const blockedCrossBarangay = p.flagBlock === "cross_barangay" && !hasDocs;
  const blockedDayo = p.flagBlock === "not_on_list" && !hasDocs;
  const approveBlocked = blockedNoDocument || blockedCrossBarangay || blockedDayo;
  // Not a hard block (a near-miss is a judgment call for the document review,
  // not a rule) but the action bar's own note needs to say so too — the callout
  // above can scroll out of view while the buttons stay pinned at the bottom.
  const hasNearMiss = p.nearMiss && p.nearMiss.length > 0;

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
            nearMiss={p.nearMiss}
            lastName={p.lastName}
            firstName={p.firstName}
            navigate={navigate}
          />
          <div className={cn("grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-6", (p.flagReason || p.eligibilityStatus === "eligible") && "mt-5")}>
            <div className="sm:sticky sm:top-0 space-y-4 self-start">
              {p.photo ? (
                <img src={`/api/teams/players/${p._id}/photo?f=${p.photo || ""}`} alt="" decoding="async"
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
          <p className={cn("text-xs", locked || teamVerified ? "text-muted-foreground font-medium" : blockedCrossBarangay || blockedDayo || flaggedWithDocs ? "text-red-600 dark:text-red-400 font-medium" : blockedNoDocument ? "text-amber-600 dark:text-amber-400 font-medium" : hasNearMiss ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground")}>
            {teamVerified
              ? "This team is verified and locked. Nothing here can be edited. Reopen the team above to make corrections."
              : locked
              ? "View only. Approving and rejecting open once the season moves to the verification stage."
              : blockedCrossBarangay
              ? "This barangay doesn't allow cross-barangay players and there is no document yet, so this player can't be approved. Reject them, allow cross-barangay for this barangay in League Setup, or wait for a document."
              : blockedDayo
              ? "Not on the reference list (possible Dayo) and no document yet, so this player can't be approved. The Barangay Admin can correct a misspelled name or upload a document; otherwise reject them."
              : flaggedWithDocs
              ? "Flagged by screening. Approve only if the document above proves this player may play for this barangay."
              : blockedNoDocument
              ? "No document uploaded yet. Approve is disabled until the Barangay Admin submits one."
              : hasNearMiss
              ? "Check the near-miss details above before approving. A same-name row exists but the middle name or birthdate doesn't match it."
              : "Approving also marks this player's pending documents as approved. Rejecting removes the player and their files, and reopens the roster."}
          </p>
          {!teamVerified && p.eligibilityStatus !== "eligible" && (
            <div className="flex gap-2 shrink-0">
              <Button onClick={() => onApprove(teamId, p._id)} disabled={busy || locked || approveBlocked}
                title={blockedCrossBarangay ? "This barangay doesn't allow cross-barangay players." : blockedDayo ? "Not on the reference list (possible Dayo)." : flaggedWithDocs ? "Flagged by screening: check the document before approving." : blockedNoDocument ? "This player has no document uploaded yet." : hasNearMiss ? "A same-name reference-list row exists but the middle name or birthdate differs. Double-check before approving." : undefined}
                className={cn(
                  "text-white",
                  hasNearMiss || flaggedWithDocs
                    ? "bg-orange-600 hover:bg-orange-700 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-500/40"
                    : "bg-green-600 hover:bg-green-700 focus-visible:ring-green-500/40 dark:focus-visible:ring-green-500/40"
                )}>
                Approve
              </Button>
              <Button onClick={() => onReject(teamId, p._id)} disabled={busy || locked}
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
  const [reopenedTeams, setReopenedTeams] = useState([]); // a player was rejected: waiting to resubmit
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

  // quiet: refresh in place after a verdict (no skeleton, no jump to the top; Oct 2026).
  async function loadQueue({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    try {
      const data = await api("/api/review/queue");
      setTeams(data.teams || []);
      setVerifiedTeams(data.verifiedTeams || []);
      setReopenedTeams(data.reopenedTeams || []);
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
    loadQueue({ quiet: true }); // tallies may have changed
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
      await loadQueue({ quiet: true });
    } catch (e) { showError(e.message); }
    finally { setBusy(false); }
  }

  // Verified teams are viewable ANY time (same "viewing is always open, verdicts
  // aren't" rule as the pending list above) — only the Reopen action itself is
  // restricted to the verification period (the backend enforces that too).
  const visibleReopened = selectedBarangay
    ? reopenedTeams.filter((t) => t.barangayId === selectedBarangay)
    : reopenedTeams;
  const visibleVerified = selectedBarangay
    ? verifiedTeams.filter((t) => t.barangayId === selectedBarangay)
    : verifiedTeams;

  const allEligible = players.length > 0 && players.every((p) => p.eligibilityStatus === "eligible");
  // Anything can be viewed at any time; verdicts only during the verification stage.
  const reviewOpen = seasonStatus === "verification";

  return (
    <AdminLayout title="Review Queue" menu={superAdminMenu} enableDarkMode
      subtitle="Submitted rosters, with each player's photo and documents. Approve, reject, then verify the team.">
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-8">
          {!reviewOpen && (
            <Alert className="border-amber-500/30 bg-amber-500/5">
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                View only. You can look through every team, player and document, but approving,
                rejecting and verifying open once the season moves to the verification stage
                {seasonStatus ? ` (it is currently "${seasonStatus.replace(/_/g, " ")}")` : ""}.
              </AlertDescription>
            </Alert>
          )}

          {/* Barangay picker: one dropdown (26 barangays used to be a wall of chips). Each option
              keeps the old chips' colour code as a pill: red = teams waiting for a verdict,
              green = cleared, grey = partway / nothing yet. "Details" explains the colours. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="order-1 text-[15px] font-medium">Barangay</span>
              <Select value={selectedBarangay ?? "all"} onValueChange={(v) => { setSelectedBarangay(v === "all" ? null : v); setOpenTeam(null); }}>
                <SelectTrigger className="order-3 w-full basis-full sm:order-2 sm:w-80 sm:basis-auto"><SelectValue /></SelectTrigger>
                {/* Always opens BELOW the box (Oct 2026: with collision flipping it often opened upward on a
                    laptop screen); the list shrinks to the room left below and scrolls inside. */}
                <SelectContent position="popper" side="bottom" avoidCollisions={false} className="max-h-[min(20rem,var(--radix-select-content-available-height))]">
                  <SelectItem value="all" className="*:[span]:last:flex-1">
                    <BarangayOption name="All barangays" tone={teams.length > 0 ? "pending" : "none"}
                      label={teams.length > 0 ? `${teams.length} waiting` : "nothing waiting"} />
                  </SelectItem>
                  {barangays.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)} className="*:[span]:last:flex-1">
                      <BarangayOption
                        name={b.name}
                        tone={b.pendingTeams > 0 ? "pending" : b.cleared ? "cleared" : b.completedSlots > 0 ? "partial" : "none"}
                        label={b.pendingTeams > 0
                          ? `${b.pendingTeams} pending`
                          : b.cleared ? "Cleared"
                          : b.completedSlots > 0 ? `${b.completedSlots} of ${b.requiredSlots}` : "nothing yet"}
                      />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <InfoHint summary="" label="Details" className="order-2 ml-auto sm:order-3 sm:ml-0">
                <p><span className="font-medium text-red-600 dark:text-red-400">Red</span>: teams waiting for your verdict.</p>
                <p className="mt-1"><span className="font-medium text-green-600 dark:text-green-400">Green</span>: cleared, a verified team in every sport and division this season.</p>
                <p className="mt-1"><span className="font-medium text-foreground">Grey</span>: partway there (verified slots out of the total) with nothing pending, or nothing submitted yet.</p>
              </InfoHint>
            </div>
            <p className="text-[14px] text-muted-foreground">
              {visibleTeams.length} waiting · {visibleReopened.length} reopened · {visibleVerified.length} verified
            </p>
          </div>

          {/* Waiting for review */}
          <section>
            <div className="mb-3 flex items-baseline gap-2.5">
              <h2 className="text-[21px] font-semibold tracking-tight">Waiting for review</h2>
              <span className="text-[14px] text-muted-foreground">{visibleTeams.length} {visibleTeams.length === 1 ? "team" : "teams"}</span>
            </div>
            {visibleTeams.length === 0 ? (
              <p className="rounded-xl border bg-card px-4 py-4 text-[15px] text-muted-foreground">
                {selectedBarangayInfo
                  ? selectedBarangayInfo.cleared
                    ? `Brgy. ${selectedBarangayInfo.name} is cleared: a verified team in every sport and division this season (${selectedBarangayInfo.completedSlots} of ${selectedBarangayInfo.requiredSlots}).`
                    : selectedBarangayInfo.completedSlots > 0
                      ? `Nothing from Brgy. ${selectedBarangayInfo.name} is waiting. ${selectedBarangayInfo.completedSlots} of ${selectedBarangayInfo.requiredSlots} sport/division slots are verified.`
                      : `Brgy. ${selectedBarangayInfo.name} hasn't submitted any teams yet this season.`
                  : "No submitted teams are waiting. Teams appear here once a Barangay Admin submits their roster."}
              </p>
            ) : (
              <TeamTable
                teams={visibleTeams}
                openTeam={openTeam}
                onToggle={openTeamDetail}
                status={(t) => (
                  <div className="flex flex-wrap gap-1.5">
                    {t.tally.flagged > 0 && <Badge className={cn(STATUS_BADGE.flagged, "whitespace-nowrap")}>{t.tally.flagged} flagged</Badge>}
                    {t.tally.needs_document > 0 && <Badge className={cn(STATUS_BADGE.needs_document, "whitespace-nowrap")}>{t.tally.needs_document} need doc</Badge>}
                    {t.tally.eligible > 0 && <Badge className={cn(STATUS_BADGE.eligible, "whitespace-nowrap")}>{t.tally.eligible} eligible</Badge>}
                  </div>
                )}
                detail={(t) => (
                  playersLoading ? (
                    <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
                  ) : (
                    <>
                      {msg && <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm">{msg}</p>}
                      <div className="space-y-2">
                        {players.map((p) => <PlayerRow key={p._id} p={p} onClick={() => setModalPlayer(p)} />)}
                      </div>
                      <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[14px] text-muted-foreground">
                          {!reviewOpen ? "Verifying opens at the verification stage." : allEligible ? "All players eligible, ready to verify." : "Resolve every flagged / needs-document player to verify."}
                        </p>
                        <Button onClick={() => verify(t.teamId)} disabled={busy || !reviewOpen || !allEligible}>
                          <ShieldCheck /> Verify team
                        </Button>
                      </div>
                    </>
                  )
                )}
              />
            )}
          </section>

          {/* Teams a player was rejected from (Sep 2026): reopened for their barangay
              ONLY, to add a replacement and resubmit. Listed so they aren't forgotten. */}
          {visibleReopened.length > 0 && (
            <section>
              <div className="mb-1 flex items-baseline gap-2.5">
                <h2 className="text-[21px] font-semibold tracking-tight">Waiting for the barangay to resubmit</h2>
                <span className="text-[14px] text-muted-foreground">{visibleReopened.length}</span>
              </div>
              <p className="mb-3 text-[15px] text-muted-foreground">A player was rejected, so these are reopened for their Barangay Admin. They come back above when resubmitted.</p>
              <TeamTable
                teams={visibleReopened}
                status={() => <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 whitespace-nowrap">Reopened</Badge>}
              />
            </section>
          )}

          {/* Verified teams: locked for their Barangay Admin, but always viewable here. */}
          {visibleVerified.length > 0 && (
            <section>
              <div className="mb-1 flex items-baseline gap-2.5">
                <h2 className="text-[21px] font-semibold tracking-tight">Verified teams</h2>
                <span className="text-[14px] text-muted-foreground">{visibleVerified.length} {visibleVerified.length === 1 ? "team" : "teams"}</span>
              </div>
              <p className="mb-3 text-[15px] text-muted-foreground">
                <InfoHint summary="Locked for their Barangay Admin. Click a team to view its roster.">
                  <p>Nothing here can be edited directly. Reopen one (verification stage only) to let the
                  Barangay Admin correct a player; it returns to the queue above and needs verifying again.</p>
                  <p className="mt-1.5">A team already in a tournament can't be reopened. Delete the tournament first.</p>
                </InfoHint>
              </p>
              <TeamTable
                teams={visibleVerified}
                openTeam={openTeam}
                onToggle={openTeamDetail}
                status={() => <Badge className={cn(STATUS_BADGE.eligible, "whitespace-nowrap")}>Verified</Badge>}
                detail={(t) => (
                  <>
                    {msg && <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm">{msg}</p>}
                    {playersLoading ? (
                      <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
                    ) : (
                      <div className="space-y-2">
                        {players.map((p) => <PlayerRow key={p._id} p={p} onClick={() => setModalPlayer(p)} />)}
                      </div>
                    )}
                    <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[14px] text-muted-foreground">
                        {reviewOpen ? "Reopen to let the barangay correct a player." : "Reopening is only allowed during the verification stage."}
                      </p>
                      <Button variant="outline" disabled={busy || !reviewOpen} onClick={() => reopen(t)}>
                        <RotateCcw /> Reopen for corrections
                      </Button>
                    </div>
                  </>
                )}
              />
            </section>
          )}
        </div>
      )}

      {modalPlayer && (
        <PlayerModal
          player={modalPlayer}
          teamId={openTeam}
          busy={busy}
          locked={!reviewOpen}
          teamVerified={verifiedTeams.some((t) => t.teamId === openTeam)}
          onClose={() => setModalPlayer(null)}
          onApprove={async (tid, pid) => { await approve(tid, pid); setModalPlayer(null); }}
          onReject={async (tid, pid) => { await reject(tid, pid); setModalPlayer(null); }}
        />
      )}
    </AdminLayout>
  );
}
