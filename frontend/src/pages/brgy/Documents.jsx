import { useEffect, useState } from "react";
import { FileText, FileWarning, Inbox, UploadCloud } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { brgyMenu } from "../../components/menus";
import { useErrorDialog } from "../../components/ErrorDialog";
import { api } from "../../api";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { buttonVariants } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
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
  { value: "parental_consent", label: "Parental Consent (under 15)" },
];

const ELIGIBILITY_BADGE = {
  flagged: "bg-red-500/15 text-red-600 dark:text-red-400",
  needs_document: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const ELIGIBILITY_BORDER = {
  flagged: "border-l-red-500",
  needs_document: "border-l-amber-500",
};

const VERIFY_BADGE = {
  approved: "bg-green-500/15 text-green-600 dark:text-green-400",
  rejected: "bg-red-500/15 text-red-600 dark:text-red-400",
  pending: "bg-muted text-muted-foreground",
};

export default function Documents() {
  const showError = useErrorDialog();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [docType, setDocType] = useState({});     // playerId -> chosen type
  const [uploadingId, setUploadingId] = useState(null);

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
                Kolambugan residency. Players under 15 also need parental consent.
                Accepted files: image or PDF, max 8&nbsp;MB. The SK Federation reviews each one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                If a name here looks wrong, it may just be a typo — the reference list is
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

                  {p.flagReason && (
                    <p className="text-xs text-muted-foreground">Reason: {p.flagReason}</p>
                  )}

                  {p.documents.length > 0 && (
                    <div className="space-y-1">
                      {p.documents.map((d) => (
                        <div key={d._id} className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs">
                          <span className="flex-1">
                            {DOC_TYPES.find((t) => t.value === d.docType)?.label || d.docType}
                          </span>
                          <Badge className={VERIFY_BADGE[d.verifyStatus]}>
                            {d.verifyStatus}
                          </Badge>
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
    </AdminLayout>
  );
}
