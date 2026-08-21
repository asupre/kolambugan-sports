import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";

const superAdminMenu = [
  { label: "Dashboard", path: "/admin", icon: "▦" },
  { label: "Season", path: "/admin/season", icon: "◷" },
  { label: "Reference List", path: "/admin/reference", icon: "☑" },
  { label: "Review Queue", path: "/admin/review", icon: "⚑" },
  { label: "Tournaments", path: "/admin/tournaments", icon: "⛃" },
  { label: "Accounts", path: "/admin/accounts", icon: "☺" },
];

const DOC_LABEL = {
  birth_certificate: "Birth Certificate",
  voters_id: "Voter's ID",
  barangay_clearance: "Barangay Clearance",
  parental_consent: "Parental Consent",
};

// Documents are super-admin-only, so a plain <img src> can't fetch them (no auth
// header). We fetch with the token and turn the response into a blob URL.
function DocumentView({ doc }) {
  const [url, setUrl] = useState(null);
  const [type, setType] = useState("");
  const [err, setErr] = useState("");

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
      {url && type.startsWith("image/") && (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="" className="max-h-48 rounded border border-slate-200" />
        </a>
      )}
      {url && type === "application/pdf" && (
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
          Open PDF in a new tab
        </a>
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

export default function ReviewQueue() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openTeam, setOpenTeam] = useState(null);   // teamId currently expanded
  const [players, setPlayers] = useState([]);        // players of the open team
  const [playersLoading, setPlayersLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

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
                          <div key={p._id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-slate-50 last:border-0">
                                                        <div className="min-w-0 flex gap-3">
                              {p.photo ? (
                                <img src={`/api/teams/players/${p._id}/photo`} alt=""
                                  className="h-12 w-12 rounded-full object-cover bg-slate-100 shrink-0" />
                              ) : (
                                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs shrink-0">
                                  {p.lastName?.[0]}{p.firstName?.[0]}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-slate-700 text-sm">{p.lastName}, {p.firstName}</span>
                                  <StatusPill status={p.eligibilityStatus} />
                                </div>
                                {p.flagReason && (
                                  <p className="text-xs text-slate-500 mt-0.5">{p.flagReason}</p>
                                )}
                                {p.documents?.length > 0 && (
                                  <div className="mt-2 space-y-2 max-w-xs">
                                    {p.documents.map((d) => <DocumentView key={d._id} doc={d} />)}
                                  </div>
                                )}
                                {p.eligibilityStatus === "needs_document" && !p.documents?.length && (
                                  <p className="text-xs text-amber-600 mt-0.5">No document uploaded yet.</p>
                                )}
                              </div>
                            </div>
                            {p.eligibilityStatus !== "eligible" && (
                              <div className="flex gap-2 shrink-0">
                                <button
                                  onClick={() => approve(t.teamId, p._id)}
                                  disabled={busy}
                                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => reject(t.teamId, p._id)}
                                  disabled={busy}
                                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
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
    </AdminLayout>
  );
}