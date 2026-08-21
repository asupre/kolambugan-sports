import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { Card } from "../../components/ui";

const brgyMenu = [
  { label: "My Teams", path: "/brgy", icon: "⛃" },
  { label: "Documents", path: "/brgy/documents", icon: "🗎" },
];

const DOC_TYPES = [
  { value: "birth_certificate", label: "Birth Certificate" },
  { value: "voters_id", label: "Voter's ID / Certification" },
  { value: "barangay_clearance", label: "Barangay Clearance" },
  { value: "parental_consent", label: "Parental Consent (under 15)" },
];

export default function Documents() {
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
    if (!type) { setError("Pick a document type first."); return; }
    if (!file) return;
    setUploadingId(p.playerId); setError("");
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
      setError(e.message);
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <AdminLayout title="Document Submission" menu={brgyMenu}>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="max-w-3xl space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <Card className="p-5">
            <h2 className="text-slate-800 font-semibold mb-1">Players needing documents</h2>
            <p className="text-slate-500 text-sm">
              These players weren't matched on the reference list, so they need proof of
              Kolambugan residency. Players under 15 also need parental consent.
              Accepted files: image or PDF, max 8&nbsp;MB. The SK Federation reviews each one.
            </p>
          </Card>

          {players.length === 0 ? (
            <Card className="p-5">
              <p className="text-slate-500 text-sm">
                No players currently need documents. This list fills in after you submit a roster
                and the residency pre-screen runs.
              </p>
            </Card>
          ) : (
            players.map((p) => (
              <Card key={p.playerId} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div className="min-w-0">
                    <p className="text-slate-800 font-medium text-sm">{p.name} <span className="text-slate-400 font-normal">· {p.age}</span></p>
                    <p className="text-slate-500 text-xs">{p.teamName} · {p.sport}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.eligibilityStatus === "flagged" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {p.eligibilityStatus.replace("_", " ")}
                  </span>
                </div>

                {p.flagReason && (
                  <p className="text-slate-500 text-xs mb-2">Reason: {p.flagReason}</p>
                )}

                {/* Already-uploaded documents */}
                {p.documents.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {p.documents.map((d) => (
                      <div key={d._id} className="flex items-center gap-2 text-xs bg-slate-50 rounded px-2 py-1.5">
                        <span className="flex-1 text-slate-600">
                          {DOC_TYPES.find((t) => t.value === d.docType)?.label || d.docType}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full ${
                          d.verifyStatus === "approved" ? "bg-green-100 text-green-700"
                          : d.verifyStatus === "rejected" ? "bg-red-100 text-red-700"
                          : "bg-slate-200 text-slate-600"
                        }`}>
                          {d.verifyStatus}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload */}
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={docType[p.playerId] || ""}
                    onChange={(e) => setDocType({ ...docType, [p.playerId]: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  >
                    <option value="">Document type…</option>
                    {DOC_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>

                  <label className={`text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer ${
                    docType[p.playerId] ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}>
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
              </Card>
            ))
          )}
        </div>
      )}
    </AdminLayout>
  );
}