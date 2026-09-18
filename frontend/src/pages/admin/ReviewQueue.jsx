import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, FileText, ShieldCheck, X } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { superAdminMenu } from "../../components/menus";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";

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

function Lightbox({ src, onClose }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[90vw] p-2 bg-black/90 border-0">
        <img src={src} alt="" className="max-h-[85vh] w-full object-contain rounded" />
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

function PlayerModal({ player, teamId, onClose, onApprove, onReject, busy }) {
  const p = player;

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
              {p.flagReason && <span className="text-xs text-muted-foreground">{p.flagReason}</span>}
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X /></Button>
        </div>

        {/* Body — photo and documents shown TOGETHER, not behind separate tabs,
            since the whole point of this screen is comparing the player's face
            against their submitted ID. The photo column stays sticky so it's
            still visible while scrolling through several documents. */}
        <div className="px-6 py-5 min-h-[18rem] overflow-y-auto scrollbar-thin flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-6">
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
          <p className="text-xs text-muted-foreground">
            Approving also marks this player's pending documents as approved.
            Rejecting removes the player and their files, and reopens the roster.
          </p>
          {p.eligibilityStatus !== "eligible" && (
            <div className="flex gap-2 shrink-0">
              <Button onClick={() => onApprove(teamId, p._id)} disabled={busy}
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
    } catch (e) {
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadQueue(); }, []);

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

  const allEligible = players.length > 0 && players.every((p) => p.eligibilityStatus === "eligible");

  return (
    <AdminLayout title="Review Queue" menu={superAdminMenu} enableDarkMode>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : teams.length === 0 ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Nothing to review</CardTitle>
            <CardDescription>
              No submitted teams are awaiting review in the current season. Teams appear here once a
              Barangay Admin submits their roster.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {teams.map((t) => (
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
                              {p.flagReason && <p className="text-xs text-muted-foreground mt-0.5">{p.flagReason}</p>}
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
