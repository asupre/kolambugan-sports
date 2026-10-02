import { useEffect, useState } from "react";
import { AlertTriangle, Eye, FileText, FileWarning, Inbox, Trash2, UploadCloud } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { brgyMenu } from "../../components/menus";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { DocumentFrame } from "../../components/DocumentViewer";
import { api } from "../../api";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button, buttonVariants } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { cn } from "../../lib/utils";

const DOC_TYPES = [
  { value: "birth_certificate", label: "Birth Certificate" },
  { value: "voters_id", label: "Voter's ID / Certification" },
  { value: "barangay_clearance", label: "Barangay Clearance" },
  { value: "parental_consent", label: "Parental Consent (15 and under)" },
];

const ELIGIBILITY_BADGE = {
  flagged: "bg-red-500/15 text-red-600 dark:text-red-400",
  needs_document: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const ELIGIBILITY_BORDER = {
  flagged: "border-l-red-500",
  needs_document: "border-l-amber-500",
};

// Verification status of an uploaded document, colour-coded (Sep 2026) —
// "pending" used to be a grey badge on a grey row, readable in neither theme.
// Amber = waiting for the SK Federation, green = approved, red = rejected; the
// whole row picks up the same tint (VERIFY_ROW) so it reads at a glance.
const VERIFY_BADGE = {
  approved: "border border-green-500/40 bg-green-500/20 text-green-700 dark:text-green-300",
  rejected: "border border-red-500/40 bg-red-500/20 text-red-700 dark:text-red-300",
  pending: "border border-amber-500/40 bg-amber-500/20 text-amber-700 dark:text-amber-300",
};
const VERIFY_ROW = {
  approved: "bg-green-500/10 border-l-green-500",
  rejected: "bg-red-500/10 border-l-red-500",
  pending: "bg-amber-500/10 border-l-amber-500",
};
const VERIFY_LABEL = { approved: "Approved", rejected: "Rejected", pending: "Awaiting review" };

// Same treatment as the Super Admin's Review Queue — a colored, bordered
// callout instead of plain muted text, so the reason a document is needed
// is easy to spot rather than blending into the card.
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
    <p className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium w-fit", tone.box)}>
      <Icon className="size-3.5 shrink-0" /> {reason}
    </p>
  );
}

// Lets a Barangay Admin actually SEE what they uploaded — not just its filename
// and status — before deciding whether to delete it (a `pending` one) or upload
// a replacement. Fetches through the ownership-checked
// `/:id/players/:playerId/documents/:docId/file` route (Barangay Admin, own
// team only — the Super Admin's Review Queue uses a different, super-admin-only
// route for the same file). Reuses the same zoomable viewer the Review Queue
// uses (`DocumentFrame`/`Lightbox` in components/DocumentViewer.jsx).
function DocumentPreviewDialog({ p, doc, onClose }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {DOC_TYPES.find((t) => t.value === doc.docType)?.label || doc.docType}
            <Badge className={VERIFY_BADGE[doc.verifyStatus]}>{VERIFY_LABEL[doc.verifyStatus] || doc.verifyStatus}</Badge>
          </DialogTitle>
        </DialogHeader>
        <DocumentFrame
          fetchUrl={`/api/teams/${p.teamId}/players/${p.playerId}/documents/${doc._id}/file`}
          large
        />
      </DialogContent>
    </Dialog>
  );
}

export default function Documents() {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [docType, setDocType] = useState({});     // playerId -> chosen type
  const [uploadingId, setUploadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);   // docId being deleted
  const [previewDoc, setPreviewDoc] = useState(null);   // { p, doc } currently open in the preview dialog

  async function load() {
    setLoading(true);
    try {
      const data = await api("/api/teams/needs-documents");
      setPlayers(data.players || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function upload(p, file) {
    const type = docType[p.playerId];
    if (!type) { showError("Pick a document type first."); return; }
    if (!file) return;
    setUploadingId(p.playerId);
    try {
      const fd = new FormData();
      fd.append("document", file);
      fd.append("docType", type);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/teams/${p.teamId}/players/${p.playerId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      await load();
    } catch (e) {
      showError(e.message);
    } finally {
      setUploadingId(null);
    }
  }

  async function remove(p, doc) {
    if (!(await confirm(`Delete this ${DOC_TYPES.find((t) => t.value === doc.docType)?.label || doc.docType}? This can't be undone.`, { confirmLabel: "Delete", danger: true }))) return;
    setDeletingId(doc._id);
    try {
      await api(`/api/teams/${p.teamId}/players/${p.playerId}/documents/${doc._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      showError(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AdminLayout title="Verification Status" menu={brgyMenu} enableDarkMode>
      {loading ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
            </CardHeader>
          </Card>
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-7 w-40" />
                  <Skeleton className="h-7 w-28" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <FileWarning />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-blue-500" /> Players needing documents
              </CardTitle>
              <CardDescription>
                These players weren't matched on the reference list, so they need proof of
                Kolambugan residency. Players 15 and under also need parental consent.
                Accepted files: image or PDF, max 8&nbsp;MB. The SK Federation reviews each one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                If a name here looks wrong, it may just be a typo. The reference list is
                matched on the exact spelling. Open the player on{" "}
                <span className="font-medium text-foreground">My Teams → View roster → Edit</span> to
                correct it, and the residency check runs again straight away. No document
                needed if the corrected name matches.
              </p>
            </CardContent>
          </Card>

          {players.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-3 text-muted-foreground text-sm">
                <Inbox className="size-5 shrink-0" />
                No players currently need documents. This list fills in after you submit a
                roster and the residency pre-screen runs.
              </CardContent>
            </Card>
          ) : (
            players.map((p) => (
              <Card key={p.playerId} className={cn("border-l-4", ELIGIBILITY_BORDER[p.eligibilityStatus])}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {p.name} <span className="font-normal text-muted-foreground">· {p.age}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{p.teamName} · {p.sport}</p>
                    </div>
                    <Badge className={ELIGIBILITY_BADGE[p.eligibilityStatus]}>
                      {p.eligibilityStatus.replace("_", " ")}
                    </Badge>
                  </div>

                  <ReasonCallout status={p.eligibilityStatus} reason={p.flagReason} />

                  {p.documents.length > 0 && (
                    <div className="space-y-1">
                      {p.documents.map((d) => (
                        <div key={d._id} className={cn("flex items-center gap-2 rounded-md border-l-4 px-2 py-1.5 text-xs", VERIFY_ROW[d.verifyStatus] || "bg-muted")}>
                          {/* min-w-0 + truncate: Card clips overflow, so without this a long
                              label (e.g. "Parental Consent (15 and under)") on a narrow phone
                              pushed the row wider than the screen and the buttons below were
                              clipped off entirely — invisible, not just cramped. */}
                          <span className="flex-1 min-w-0 truncate">
                            {DOC_TYPES.find((t) => t.value === d.docType)?.label || d.docType}
                          </span>
                          <Badge className={cn(VERIFY_BADGE[d.verifyStatus], "shrink-0")}>
                            {VERIFY_LABEL[d.verifyStatus] || d.verifyStatus}
                          </Badge>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="View document"
                            title="View document"
                            className="shrink-0"
                            onClick={() => setPreviewDoc({ p, doc: d })}
                          >
                            <Eye />
                          </Button>
                          {d.verifyStatus === "pending" && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Delete document"
                              className="shrink-0 text-destructive hover:text-destructive"
                              disabled={deletingId === d._id}
                              onClick={() => remove(p, d)}
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={docType[p.playerId] || ""}
                      onValueChange={(v) => setDocType({ ...docType, [p.playerId]: v })}
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Document type…" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <label
                      className={cn(
                        buttonVariants({ variant: docType[p.playerId] ? "default" : "secondary" }),
                        docType[p.playerId] ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                      )}
                    >
                      <UploadCloud />
                      {uploadingId === p.playerId ? "Uploading…" : "Choose file"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        disabled={!docType[p.playerId]}
                        onChange={(e) => { upload(p, e.target.files[0]); e.target.value = ""; }}
                      />
                    </label>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {previewDoc && (
        <DocumentPreviewDialog
          p={previewDoc.p}
          doc={previewDoc.doc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </AdminLayout>
  );
}
