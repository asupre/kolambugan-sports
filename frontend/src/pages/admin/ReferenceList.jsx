import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, CircleCheck, CircleX, ClipboardList, Search, Sparkles, UploadCloud } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";

export default function ReferenceList() {
  const [status, setStatus] = useState(null);   // { count, season }
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);    // upload result
  const fileInputRef = useRef(null);
  const [records, setRecords] = useState([]);
  const [searchParams] = useSearchParams();
  // Prefilled from the Review Queue's "View in Reference List" link
  // (?q=<lastName> <firstName>) — read once on mount, the search box itself
  // owns it from then on.
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const cameFromLink = useRef(searchParams.get("q") != null);
  const scrolledToMatch = useRef(false);
  const rowRefs = useRef({});

  async function loadStatus() {
    setLoading(true);
    try {
      const data = await api("/api/reference-list/status");
      setStatus(data);
      // Each record comes back tagged with `match` (the CURRENT player it
      // connects to, if any) — computed live on the server against every
      // player on a team this season, not stored on the record itself. See
      // GET /api/reference-list.
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

  // Arriving from a "View in Reference List" link: once the list loads,
  // jump straight to the first matched row among the (already name-filtered)
  // results, so the connection is easy to spot in a list that can run into
  // the thousands of rows.
  useEffect(() => {
    if (!cameFromLink.current || scrolledToMatch.current || records.length === 0) return;
    const target = records.find((r) => r.matches?.length || r.minorMatches?.length);
    const el = target && rowRefs.current[target._id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      scrolledToMatch.current = true;
    }
  }, [records]);

  // Deferred: with up to ~17k rows, re-filtering AND re-rendering the table
  // on every single keystroke was what made typing feel laggy — the input
  // itself would still lag behind if it had to wait for that. React lets the
  // input update immediately (`search`) while deprioritizing the expensive
  // filter/render (`deferredSearch`) until the browser has a spare moment.
  const deferredSearch = useDeferredValue(search);

  // The reference list only ever has firstName/lastName/barangay (see
  // ReferenceList.js) — no jersey number, no middle name. Typing a full
  // roster-style entry ("Rivera 3101, Antonio S.") used to zero out every
  // result, because the old search matched the WHOLE typed string as one
  // substring: the jersey number and middle initial don't exist anywhere
  // in the reference data, so nothing could ever contain them verbatim —
  // even for a resident who really is on the list. Tokenize instead, drop
  // tokens that can never match anything here (pure numbers, bare
  // initials), and require only the remaining name/barangay words.
  const searchTokens = useMemo(
    () => deferredSearch.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    [deferredSearch]
  );
  const meaningfulTokens = useMemo(
    () => searchTokens.filter((t) => t.length > 1 && !/^\d+$/.test(t)),
    [searchTokens]
  );
  const searchIsNoiseOnly = searchTokens.length > 0 && meaningfulTokens.length === 0;

  const filteredRecords = useMemo(() => {
    if (!meaningfulTokens.length) return searchIsNoiseOnly ? [] : records;
    return records.filter((r) => {
      const haystack = `${r.lastName} ${r.firstName} ${r.barangay || ""}`.toLowerCase();
      return meaningfulTokens.every((t) => haystack.includes(t));
    });
  }, [records, meaningfulTokens, searchIsNoiseOnly]);

  // The other half of the lag: rendering every matching row at once, even
  // when that's the full unfiltered list. Capping keeps the DOM small (and
  // this page smooth) no matter how large the underlying list gets — the
  // search box is how you narrow it down, not the scrollbar.
  const RENDER_CAP = 200;
  const visibleRecords = filteredRecords.slice(0, RENDER_CAP);
  const truncated = filteredRecords.length > RENDER_CAP;

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
      <div className="space-y-6">
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
              <CardDescription>
                Search by name or barangay to look up a specific resident's record. This
                list only has names and barangays — no jersey numbers or middle initials,
                those live on the player's roster entry instead. A row highlighted{" "}
                <span className="text-purple-600 dark:text-purple-400 font-medium">purple</span>{" "}
                is a same-name hint for a player under 15 — they still need a document
                regardless (the list starts at 15), but a same-name/same-barangay row is
                worth weighing when reviewing that document.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or barangay…"
                  className="pl-8"
                />
              </div>
              {searchIsNoiseOnly ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Jersey numbers and middle initials aren't on the reference list — try just
                  the last name (and first name, if it's a common surname).
                </p>
              ) : search ? (
                <p className="text-xs text-muted-foreground">
                  {filteredRecords.length} of {records.length} residents match "{search}"
                  {truncated ? ` — showing the first ${RENDER_CAP}, narrow your search to see the rest.` : "."}
                </p>
              ) : truncated && (
                <p className="text-xs text-muted-foreground">
                  Showing the first {RENDER_CAP} of {records.length} residents — search by name to find someone specific.
                </p>
              )}

              <div className="max-h-96 overflow-y-auto scrollbar-thin rounded-lg border">
                {/* table-layout: fixed makes column widths independent of cell
                    content, so a sidebar-collapse reflow doesn't have to rescan
                    every row to recompute them — with hundreds/thousands of
                    residents, auto layout was the source of the collapse lag. */}
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[24%]" />
                    <col className="w-[24%]" />
                    <col className="w-[18%]" />
                    <col className="w-[34%]" />
                  </colgroup>
                  <thead className="bg-muted text-muted-foreground text-left sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-medium">Last name</th>
                      <th className="px-3 py-2 font-medium">First name</th>
                      <th className="px-3 py-2 font-medium">Barangay</th>
                      <th className="px-3 py-2 font-medium">Matched player</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleRecords.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                          No residents match your search.
                        </td>
                      </tr>
                    ) : (
                      visibleRecords.map((r) => {
                        // `matches` is computed live on every load (see
                        // GET /api/reference-list) by re-running the same
                        // decision the automated pre-screen uses against
                        // every current player — so this lights up for ANY
                        // resident who's actually connected to a player right
                        // now, search or no search, no matter when that
                        // player was originally screened. It's an ARRAY: name
                        // matching means two different players (or the same
                        // name entered on two different teams) can both land
                        // on this one row — worth showing plainly rather than
                        // picking one and hiding the other, since that's
                        // exactly the kind of conflict this list should catch.
                        const matches = r.matches || [];
                        const minorMatches = r.minorMatches || [];
                        const rowTone =
                          matches.length > 0
                            ? matches.length > 1
                              ? "multi"
                              : matches[0].status === "flagged"
                              ? "flagged"
                              : "eligible"
                            : minorMatches.length > 0
                            ? "minor"
                            : null;
                        return (
                          <tr
                            key={r._id}
                            ref={(el) => { rowRefs.current[r._id] = el; }}
                            className={cn(
                              rowTone === "eligible" && "bg-green-500/10 outline outline-1 -outline-offset-1 outline-green-500/40",
                              rowTone === "flagged" && "bg-red-500/10 outline outline-1 -outline-offset-1 outline-red-500/40",
                              rowTone === "multi" && "bg-amber-500/10 outline outline-1 -outline-offset-1 outline-amber-500/40",
                              rowTone === "minor" && "bg-purple-500/10 outline outline-1 -outline-offset-1 outline-purple-500/40"
                            )}
                          >
                            <td className="px-3 py-2 truncate">{r.lastName}</td>
                            <td className="px-3 py-2 truncate">{r.firstName}</td>
                            <td className="px-3 py-2 text-muted-foreground truncate">{r.barangay || "—"}</td>
                            <td className="px-3 py-2 space-y-1">
                              {rowTone === "multi" && (
                                <p className="text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                                  {matches.length} players match this name
                                </p>
                              )}
                              {matches.map((m, i) => {
                                const isMismatch = m.status === "flagged";
                                // Not a normal list match — the Super Admin approved this
                                // under-15 player by hand (document review), so this row was
                                // just promoted here from the purple informational hint below.
                                const isApprovedMinor = m.status === "approved_minor";
                                return (
                                  <div key={i} className="min-w-0">
                                    <span className={cn(
                                      "inline-flex items-center gap-1 text-xs font-medium",
                                      isMismatch ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                                    )}>
                                      {isMismatch ? <CircleX className="size-3.5 shrink-0" /> : <CircleCheck className="size-3.5 shrink-0" />}
                                      {isMismatch ? "Mismatch" : isApprovedMinor ? "Approved · document review" : "Matched"}
                                    </span>
                                    <p className="text-muted-foreground text-xs truncate">
                                      {m.playerName}{m.teamName ? ` · ${m.teamName}` : ""}
                                    </p>
                                  </div>
                                );
                              })}
                              {/* Under 15: never an official match (the voters' list starts
                                  at 15), so this is shown separately and clearly labeled as
                                  a hint, not a verdict — the player's own status stays
                                  needs_document either way; this just helps judge the
                                  uploaded document against whether the family shows up in
                                  the barangay's own records at all. */}
                              {minorMatches.map((m, i) => (
                                <div key={`minor-${i}`} className="min-w-0">
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400">
                                    <Sparkles className="size-3.5 shrink-0" />
                                    Same name, under 15{m.sameBarangay ? " · same barangay" : ""}
                                  </span>
                                  <p className="text-muted-foreground text-xs truncate">
                                    {m.playerName}{m.teamName ? ` · ${m.teamName}` : ""} — needs a document regardless, informational only
                                  </p>
                                </div>
                              ))}
                            </td>
                          </tr>
                        );
                      })
                    )}
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
