import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";

const superAdminMenu = [
  { label: "Dashboard", path: "/admin", icon: "▦" },
  { label: "Season", path: "/admin/season", icon: "◷" },
  { label: "Reference List", path: "/admin/reference", icon: "☑" },
  { label: "Review Queue", path: "/admin/review", icon: "⚑" },
  { label: "Tournaments", path: "/admin/tournaments", icon: "⛃" },
   { label: "Champions", path: "/admin/champions", icon: "★" },
   { label: "Site Images", path: "/admin/site-images", icon: "▣" },
  { label: "Accounts", path: "/admin/accounts", icon: "☺" },
];

const DOC_LABEL = {
  birth_certificate: "Birth Certificate",
  voters_id: "Voter's ID",
  barangay_clearance: "Barangay Clearance",
  parental_consent: "Parental Consent",
};

function Lightbox({ src, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <img src={src} alt="" className="max-h-full max-w-full object-contain rounded" onClick={(e) => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-5 text-white text-3xl leading-none">×</button>
    </div>
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
    <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-medium text-slate-600">{DOC_LABEL[doc.docType] || doc.docType}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          doc.verifyStatus === "approved" ? "bg-green-100 text-green-700"
          : doc.verifyStatus === "rejected" ? "bg-red-100 text-red-700"
          : "bg-slate-200 text-slate-600"
        }`}>{doc.verifyStatus}</span>
      </div>
                        {err && <p className="text-xs text-red-600">{err}</p>}
      {!url && !err && <p className="text-xs text-slate-400">Loading…</p>}
      {url && (
        <>
          {type.startsWith("image/") ? (
            <>
              <img src={url} alt="" onClick={() => setZoom(true)}
                className={`cursor-zoom-in ${large ? "max-h-[26rem] w-full object-contain rounded border border-slate-200" : "max-h-48 rounded border border-slate-200"}`} />
              {zoom && <Lightbox src={url} onClose={() => setZoom(false)} />}
            </>
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
              Open file in a new tab
            </a>
          )}
        </>
      )}
    </div>
  );
}
// Colored pill for a player's eligibility status.
function StatusPill({ status }) {
  const styles = {
    eligible: "bg-green-50 text-green-700",
    flagged: "bg-amber-50 text-amber-700",
    needs_document: "bg-blue-50 text-blue-700",
    pending: "bg-slate-100 text-slate-500",
  };
  const label = {
    eligible: "Eligible",
    flagged: "Flagged",
    needs_document: "Needs document",
    pending: "Pending",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
      {label[status] || status}
    </span>
  );
}

function PlayerModal({ player, teamId, onClose, onApprove, onReject, busy }) {
  const [tab, setTab] = useState("info");
  const p = player;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
         onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-slate-900 font-semibold text-lg">{p.lastName}, {p.firstName} {p.middleName || ""}</h2>
            <div className="flex items-center gap-2 mt-1">
              <StatusPill status={p.eligibilityStatus} />
              {p.flagReason && <span className="text-xs text-slate-500">{p.flagReason}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3">
          {[["info", "Information"], ["docs", `Documents${p.documents?.length ? ` (${p.documents.length})` : ""}`]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                tab === k ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-5 min-h-[18rem]">
          {tab === "info" ? (
            <div className="flex flex-col sm:flex-row gap-6">
              <dl className="flex-1 space-y-3 text-sm order-2 sm:order-1">
                <Field label="Full name" value={`${p.firstName} ${p.middleName || ""} ${p.lastName}`.replace(/\s+/g, " ")} />
                <Field label="Birthdate" value={p.birthdate ? new Date(p.birthdate).toLocaleDateString() : "—"} />
                <Field label="Age" value={p.age ?? "—"} />
                <Field label="Address" value={p.address || "—"} />
                <Field label="Jersey number" value={p.jerseyNumber ?? "—"} />
                <Field label="Eligibility" value={p.eligibilityStatus?.replace("_", " ")} />
                {p.flagReason && <Field label="Flag reason" value={p.flagReason} />}
              </dl>

              <div className="order-1 sm:order-2 shrink-0">
                {p.photo ? (
                  <img src={`/api/teams/players/${p._id}/photo`} alt=""
                    className="w-48 h-48 rounded-xl object-cover bg-slate-100 border border-slate-200" />
                ) : (
                  <div className="w-48 h-48 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-sm">
                    No photo
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!p.documents?.length ? (
                <p className="text-slate-500 text-sm">
                  No documents uploaded. The Barangay Admin submits these from their
                  Document Submission page.
                </p>
              ) : (
                p.documents.map((d) => <DocumentView key={d._id} doc={d} large />)
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-500">
            Approving also marks this player's pending documents as approved.
            Rejecting removes the player and their files, and reopens the roster.
          </p>
          {p.eligibilityStatus !== "eligible" && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => onApprove(teamId, p._id)} disabled={busy}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                Approve
              </button>
              <button onClick={() => onReject(teamId, p._id)} disabled={busy}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-slate-400 text-xs">{label}</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  );
}

export default function ReviewQueue() {
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
    setBusy(true); setMsg("");
    try {
      await api(`/api/review/teams/${teamId}/players/${playerId}/approve`, { method: "POST" });
      await refreshOpenTeam();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function reject(teamId, playerId) {
    if (!window.confirm("Reject and remove this player? The roster will reopen for the barangay to add a replacement.")) return;
    setBusy(true); setMsg("");
    try {
      const data = await api(`/api/review/teams/${teamId}/players/${playerId}/reject`, { method: "POST" });
      setMsg(data.message || "Player rejected.");
      await refreshOpenTeam();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function verify(teamId) {
    setBusy(true); setMsg("");
    try {
      const data = await api(`/api/review/teams/${teamId}/verify`, { method: "POST" });
      setMsg(data.message || "Team verified.");
      await refreshOpenTeam();
    } catch (e) { setMsg(e.message); } // backend blocks if not all eligible — shows here
    finally { setBusy(false); }
  }

  const allEligible = players.length > 0 && players.every((p) => p.eligibilityStatus === "eligible");

  return (
    <AdminLayout title="Review Queue" menu={superAdminMenu}>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : teams.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-xl">
          <h2 className="text-slate-800 font-semibold mb-1">Nothing to review</h2>
          <p className="text-slate-500 text-sm">
            No submitted teams are awaiting review in the current season. Teams appear here once a
            Barangay Admin submits their roster.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-w-5xl">
          {teams.map((t) => (
            <div key={t.teamId} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              {/* Team header row — click to expand */}
              <button
                onClick={() => openTeamDetail(t.teamId)}
                className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 hover:bg-slate-50 transition text-left"
              >
                <div>
                  <p className="font-semibold text-slate-800">{t.teamName}</p>
                  <p className="text-slate-500 text-sm">{t.barangay} · {t.sport} · {t.playerCount} players</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {t.tally.flagged > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium whitespace-nowrap">{t.tally.flagged} flagged</span>}
                  {t.tally.needs_document > 0 && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium whitespace-nowrap">{t.tally.needs_document} need doc</span>}
                  {t.tally.eligible > 0 && <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium whitespace-nowrap">{t.tally.eligible} eligible</span>}
                  <span className="text-slate-400 hidden sm:inline">{openTeam === t.teamId ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Expanded player list */}
              {openTeam === t.teamId && (
                <div className="border-t border-slate-100 px-5 py-4">
                  {playersLoading ? (
                    <p className="text-slate-500 text-sm">Loading players…</p>
                  ) : (
                    <>
                      {msg && <p className="text-sm text-slate-600 mb-3 bg-slate-50 rounded px-3 py-2">{msg}</p>}
                      <div className="space-y-2">
                        {players.map((p) => (
                                                    <button
                            key={p._id}
                            onClick={() => setModalPlayer(p)}
                            className="w-full flex items-center gap-3 py-2 border-b border-slate-50 last:border-0 text-left hover:bg-slate-50 rounded-lg px-2 transition"
                          >
                            {p.photo ? (
                              <img src={`/api/teams/players/${p._id}/photo`} alt=""
                                className="h-10 w-10 rounded-full object-cover bg-slate-100 shrink-0" />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs shrink-0">
                                {p.lastName?.[0]}{p.firstName?.[0]}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-slate-700 text-sm">{p.lastName}, {p.firstName}</span>
                                <StatusPill status={p.eligibilityStatus} />
                                {p.documents?.length > 0 && (
                                  <span className="text-xs text-slate-400">{p.documents.length} doc{p.documents.length > 1 ? "s" : ""}</span>
                                )}
                              </div>
                              {p.flagReason && <p className="text-xs text-slate-500 mt-0.5">{p.flagReason}</p>}
                            </div>
                            <span className="text-slate-300 text-xs shrink-0">View →</span>
                          </button>
                        ))}
                      </div>

                      {/* Verify team */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <p className="text-xs text-slate-500">
                          {allEligible ? "All players eligible — ready to verify." : "Resolve all flagged / needs-document players to verify."}
                        </p>
                        <button
                          onClick={() => verify(t.teamId)}
                          disabled={busy || !allEligible}
                          className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                        >
                          Verify Team
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
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