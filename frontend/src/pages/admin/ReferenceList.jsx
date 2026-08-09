import { useEffect, useState, useRef } from "react";
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


export default function ReferenceList() {
  const [status, setStatus] = useState(null);   // { count, season }
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);    // upload result
  const fileInputRef = useRef(null);
  const [records, setRecords] = useState([]);

async function loadStatus() {
    setLoading(true);
    try {
      const data = await api("/api/reference-list/status");
      setStatus(data);
      const list = await api("/api/reference-list");
      setRecords(list.records || []);
    } catch (e) {
      setStatus(null);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStatus(); }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      // File uploads use FormData (multipart), NOT JSON — so we can't use the
      // api() helper here. We build FormData and attach the token manually.
      const token = localStorage.getItem("token");
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/reference-list", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }, // NOTE: no Content-Type — the browser sets it for FormData
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Upload failed.");
      } else {
        setResult(data);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        loadStatus(); // refresh the count
      }
    } catch (e) {
      setError("Could not reach the server.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <AdminLayout title="Reference List" menu={superAdminMenu}>
      <div className="max-w-5xl space-y-6">
        {/* Current status */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-slate-800 font-semibold mb-1">Current reference list</h2>
          {loading ? (
            <p className="text-slate-500 text-sm">Loading…</p>
          ) : !status || status.count === 0 ? (
            <p className="text-slate-500 text-sm">
              No reference list uploaded for the current season yet.
            </p>
          ) : (
            <p className="text-slate-600 text-sm">
              <span className="text-2xl font-semibold text-slate-900">{status.count}</span> resident
              records loaded{status.season ? ` for ${status.season}` : ""}.
            </p>
          )}
        </div>

        {/* Upload */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-slate-800 font-semibold mb-1">Upload a new list</h2>
          <p className="text-slate-500 text-sm mb-4">
            Upload a CSV of eligible residents. This <span className="font-medium">replaces</span> the
            current list for this season. Columns can be named flexibly (first/last name, birthdate,
            barangay).
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files[0] || null)}
            className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-medium hover:file:bg-indigo-100 cursor-pointer mb-4"
          />

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-4">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {result && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 mb-4 text-sm text-green-700">
              <p className="font-medium">Uploaded successfully.</p>
              <p>{result.inserted} records loaded.</p>
              {result.skippedRows?.length > 0 && (
                <p className="text-green-600">
                  {result.skippedRows.length} row(s) skipped (missing a name).
                </p>
              )}
              <p className="text-green-600 text-xs mt-1">
                Birthdates: {result.hasBirthdates ? "yes" : "no"} · Barangays:{" "}
                {result.hasBarangays ? "yes" : "no"}
              </p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-5 py-2.5 hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {uploading ? "Uploading…" : "Upload & Replace List"}
          </button>
        </div>
        {/* The list itself */}
        {records.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-slate-800 font-semibold mb-3">Loaded residents</h2>
            <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-medium">Last name</th>
                    <th className="px-3 py-2 font-medium">First name</th>
                    <th className="px-3 py-2 font-medium">Barangay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r._id} className="text-slate-700">
                      <td className="px-3 py-2">{r.lastName}</td>
                      <td className="px-3 py-2">{r.firstName}</td>
                      <td className="px-3 py-2 text-slate-500">{r.barangay || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}