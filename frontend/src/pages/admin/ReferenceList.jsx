import { useEffect, useState, useRef } from "react";
import { CheckCircle2, ClipboardList, UploadCloud } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";

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
    } catch {
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
    } catch {
      setError("Could not reach the server.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <AdminLayout title="Reference List" menu={superAdminMenu} enableDarkMode>
      <div className="max-w-5xl space-y-6">
        {/* Current status */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-4 text-blue-500" /> Current reference list
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-56" />
            ) : !status || status.count === 0 ? (
              <p className="text-muted-foreground text-sm">
                No reference list uploaded for the current season yet.
              </p>
            ) : (
              <p className="text-sm">
                <span className="text-2xl font-semibold">{status.count}</span> resident
                records loaded{status.season ? ` for ${status.season}` : ""}.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Upload */}
        <Card>
          <CardHeader>
            <CardTitle>Upload a new list</CardTitle>
            <CardDescription>
              Upload a CSV of eligible residents. This <span className="font-medium text-foreground">replaces</span> the
              current list for this season. Columns can be named flexibly (first/last name, birthdate,
              barangay).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files[0] || null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-medium hover:file:bg-primary/15 cursor-pointer"
            />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {result && (
              <Alert className="border-green-500/30 bg-green-500/5">
                <CheckCircle2 className="text-green-600 dark:text-green-400" />
                <AlertDescription className="text-foreground">
                  <p className="font-medium">Uploaded successfully.</p>
                  <p>{result.inserted} records loaded.</p>
                  {result.skippedRows?.length > 0 && (
                    <p className="text-muted-foreground">
                      {result.skippedRows.length} row(s) skipped (missing a name).
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs mt-1">
                    Birthdates: {result.hasBirthdates ? "yes" : "no"} · Barangays:{" "}
                    {result.hasBarangays ? "yes" : "no"}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <Button onClick={handleUpload} disabled={!file || uploading}>
              <UploadCloud /> {uploading ? "Uploading…" : "Upload & Replace List"}
            </Button>
          </CardContent>
        </Card>

        {/* The list itself */}
        {records.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Loaded residents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto scrollbar-thin rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground text-left sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-medium">Last name</th>
                      <th className="px-3 py-2 font-medium">First name</th>
                      <th className="px-3 py-2 font-medium">Barangay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {records.map((r) => (
                      <tr key={r._id}>
                        <td className="px-3 py-2">{r.lastName}</td>
                        <td className="px-3 py-2">{r.firstName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.barangay || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
