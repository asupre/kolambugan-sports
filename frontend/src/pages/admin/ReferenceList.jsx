import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleCheck, CircleX, ClipboardList, Search, Sparkles, UploadCloud } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";

// Infinity = "All": one page, every row. The table is virtualized (see the
// useVirtualizer call below), so this stays smooth on the full ~17k list.
const PAGE_SIZES = [25, 50, 100, 200, 500, 1000, Infinity];
const sizeLabel = (n) => (n === Infinity ? "All" : String(n));
// Same tolerance as norm() in the backend's prescreen service.
const normName = (s) => (s || "").toString().trim().toLowerCase().replace(/s+/g, " ");

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
  // Arriving from the Review Queue's "View in Reference List" link
  // (?last=<lastName>&first=<firstName>): show ONLY rows whose name is exactly
  // that player's — the same case/whitespace-tolerant comparison the
  // screening uses. It used to prefill a loose word search instead, which
  // dropped all-number words and matched on substrings, so a player who is NOT
  // on the list ("Balindong 11, Jose") landed on other people who merely share
  // a last name or contain "jose" ("Balindong 524, Josefina"). Typing in the
  // search box leaves this mode. Read once on mount.
  const [exactName, setExactName] = useState(() => {
    const last = searchParams.get("last"), first = searchParams.get("first");
    return last != null && first != null ? { last, first } : null;
  });
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const cameFromLink = useRef(searchParams.get("q") != null || searchParams.get("last") != null);
  const scrolledToMatch = useRef(false);
  const tableScrollRef = useRef(null);

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

  // Deferred: with up to ~17k rows, re-filtering AND re-rendering the table
  // on every single keystroke was what made typing feel laggy — the input
  // itself would still lag behind if it had to wait for that. React lets the
  // input update immediately (`search`) while deprioritizing the expensive
  // filter/render (`deferredSearch`) until the browser has a spare moment.
  const deferredSearch = useDeferredValue(search);

  // The reference list has firstName/middleName/lastName/barangay (see
  // ReferenceList.js) — no jersey number. Typing a full roster-style entry
  // ("Rivera 3101, Antonio S.") used to zero out every result, because the
  // old search matched the WHOLE typed string as one substring: the jersey
  // number doesn't exist anywhere in the reference data (and middle name
  // didn't either, before middle initial became required for matching —
  // Sep 2026), so nothing could ever contain it verbatim. Tokenize
  // instead, drop tokens that can never match anything here (pure
  // numbers — a jersey number), and require only the remaining words.
  // Single-letter tokens are no longer dropped: "Antonio M" now legitimately
  // matches a stored middle initial.
  const searchTokens = useMemo(
    () => deferredSearch.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    [deferredSearch]
  );
  const meaningfulTokens = useMemo(
    () => searchTokens.filter((t) => !/^\d+$/.test(t)),
    [searchTokens]
  );
  const searchIsNoiseOnly = searchTokens.length > 0 && meaningfulTokens.length === 0;

  // A resident's "#" is their position in the FULL list (as the server sorts
  // it), not in the search results — so searching "Rivera" shows Rivera's real
  // number, the same one you'd see scrolling the unfiltered list.
  const masterNumber = useMemo(() => {
    const m = new Map();
    records.forEach((r, i) => m.set(r._id, i + 1));
    return m;
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (exactName) {
      const l = normName(exactName.last), f = normName(exactName.first);
      return records.filter((r) => normName(r.lastName) === l && normName(r.firstName) === f);
    }
    if (!meaningfulTokens.length) return searchIsNoiseOnly ? [] : records;
    return records.filter((r) => {
      const haystack = `${r.lastName} ${r.firstName} ${r.middleName || ""} ${r.barangay || ""}`.toLowerCase();
      return meaningfulTokens.every((t) => haystack.includes(t));
    });
  }, [records, exactName, meaningfulTokens, searchIsNoiseOnly]);

  // The other half of the lag: rendering every matching row at once, even
  // when that's the full unfiltered list. Paging keeps the DOM small (and
  // this page smooth) no matter how large the underlying list gets — the
  // Super Admin picks how many rows to show per page, then pages through or
  // narrows with search. The "#" column numbers rows by their position in the
  // FILTERED list, so page 2 continues from where page 1 stopped.
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = pageSize === Infinity ? 0 : (currentPage - 1) * pageSize;
  const visibleRecords = filteredRecords.slice(pageStart, pageStart + pageSize);

  // A new search is a new result set — go back to its first page.
  useEffect(() => { setPage(1); }, [deferredSearch]);

  // Windowing: only the rows in (or near) the scroll viewport exist in the
  // DOM, whatever the page size. Paging alone still meant "All" / 1000 put
  // thousands of <tr>s on screen at once, which is what made those choices
  // lag. Row heights vary (a matched row stacks several lines), so each row
  // is measured; the rows above/below the window are stood in for by two
  // spacer rows so the scrollbar still reflects the real length.
  const virtualizer = useVirtualizer({
    count: visibleRecords.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 37,
    overscan: 15,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const padTop = virtualRows.length ? virtualRows[0].start : 0;
  const padBottom = virtualRows.length
    ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  // Changing page / page size / search starts the table back at its top.
  useEffect(() => {
    tableScrollRef.current?.scrollTo({ top: 0 });
  }, [currentPage, pageSize, deferredSearch]);

  // Arriving from a "View in Reference List" link: once the list loads, bring
  // the results into view. Two scrolls, both needed — the PAGE has to scroll
  // down past the status/upload cards to the table (it used to stay parked at
  // the top, so the click looked like it did nothing), and then the TABLE
  // scrolls to the first matched row among the (already name-filtered)
  // results. The second goes through the virtualizer, since that row may not
  // be in the DOM to scrollIntoView. A player who isn't on the list at all
  // (flagged as a possible Dayo) has no matched row — the page scroll still
  // lands on the (empty or same-name) results.
  useEffect(() => {
    if (!cameFromLink.current || scrolledToMatch.current || records.length === 0) return;
    const el = tableScrollRef.current;
    if (!el) return;
    scrolledToMatch.current = true;
    const idx = visibleRecords.findIndex((r) => r.matches?.length || r.minorMatches?.length);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "center" });
    // Next frame, so the table has its real height before the page centres on it.
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [records, visibleRecords, virtualizer]);

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
              current list for this season. Columns can be named flexibly (first/middle/last name, birthdate,
              barangay). <span className="font-medium text-foreground">Middle name and birthdate are now
              required for a match</span> — a row missing either can never confirm a player as eligible,
              so include them if you have them.
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
                    Middle names: {result.hasMiddleNames ? "yes" : "no"} · Birthdates:{" "}
                    {result.hasBirthdates ? "yes" : "no"} · Barangays: {result.hasBarangays ? "yes" : "no"}
                  </p>
                  {result.missingForMatch > 0 && (
                    <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
                      {result.missingForMatch} of {result.inserted} row(s) are missing a middle name and/or
                      birthdate — those residents can never auto-clear a player (name alone isn't enough
                      anymore), so an adult who only matches such a row is flagged as a possible Dayo until the Super Admin reviews them by hand.
                    </p>
                  )}
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
                Search by name or barangay to look up a specific resident's record. Matching a
                player now requires middle initial AND birthdate to agree, not just the name — a
                blank middle name or birthdate here means that row can never confirm a match on
                its own. Jersey numbers still aren't tracked here; those live on the player's
                roster entry instead. A row highlighted{" "}
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
                  onChange={(e) => { setExactName(null); setSearch(e.target.value); }}
                  placeholder="Search by name or barangay…"
                  className="pl-8"
                />
              </div>
              {exactName && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs">
                  <span>
                    Exact name matches for{" "}
                    <span className="font-medium text-foreground">{exactName.last}, {exactName.first}</span>{" "}
                    — the same name check the screening uses.
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setExactName(null)}>Show all residents</Button>
                </div>
              )}
              {searchIsNoiseOnly ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Jersey numbers aren't on the reference list — try a name instead.
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="text-xs text-muted-foreground">
                    {filteredRecords.length === 0
                      ? "No residents to show."
                      : `Showing ${pageStart + 1}–${pageStart + visibleRecords.length} of ${filteredRecords.length}`}
                    {search ? ` (filtered from ${records.length} for "${search}")` : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rows per page</span>
                    <Select value={sizeLabel(pageSize)} onValueChange={(v) => { setPageSize(v === "All" ? Infinity : Number(v)); setPage(1); }}>
                      <SelectTrigger size="sm" className="w-[84px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZES.map((n) => (
                          <SelectItem key={sizeLabel(n)} value={sizeLabel(n)}>{sizeLabel(n)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div ref={tableScrollRef} className="max-h-96 overflow-y-auto scrollbar-thin rounded-lg border">
                {/* table-layout: fixed makes column widths independent of cell
                    content, so a sidebar-collapse reflow doesn't have to rescan
                    every row to recompute them — with hundreds/thousands of
                    residents, auto layout was the source of the collapse lag. */}
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[7%]" />
                    <col className="w-[16%]" />
                    <col className="w-[16%]" />
                    <col className="w-[9%]" />
                    <col className="w-[13%]" />
                    <col className="w-[13%]" />
                    <col className="w-[26%]" />
                  </colgroup>
                  <thead className="bg-muted text-muted-foreground text-left sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Last name</th>
                      <th className="px-3 py-2 font-medium">First name</th>
                      <th className="px-3 py-2 font-medium">Middle</th>
                      <th className="px-3 py-2 font-medium">Birthdate</th>
                      <th className="px-3 py-2 font-medium">Barangay</th>
                      <th className="px-3 py-2 font-medium">Matched player</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecords.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                          {exactName
                            ? "No one on the reference list has this exact name — this player isn't on the list."
                            : "No residents match your search."}
                        </td>
                      </tr>
                    ) : (
                      <>
                      {padTop > 0 && <tr aria-hidden style={{ height: padTop }}><td colSpan={7} /></tr>}
                      {virtualRows.map((vr) => {
                        const r = visibleRecords[vr.index];
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
                            data-index={vr.index}
                            ref={virtualizer.measureElement}
                            className={cn(
                              "border-b",
                              rowTone === "eligible" && "bg-green-500/10 outline outline-1 -outline-offset-1 outline-green-500/40",
                              rowTone === "flagged" && "bg-red-500/10 outline outline-1 -outline-offset-1 outline-red-500/40",
                              rowTone === "multi" && "bg-amber-500/10 outline outline-1 -outline-offset-1 outline-amber-500/40",
                              rowTone === "minor" && "bg-purple-500/10 outline outline-1 -outline-offset-1 outline-purple-500/40"
                            )}
                          >
                            <td className="px-3 py-2 text-muted-foreground tabular-nums">{masterNumber.get(r._id)}</td>
                            <td className="px-3 py-2 truncate">{r.lastName}</td>
                            <td className="px-3 py-2 truncate">{r.firstName}</td>
                            <td className="px-3 py-2 text-muted-foreground truncate">{r.middleName || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground truncate">
                              {r.birthdate ? new Date(r.birthdate).toLocaleDateString() : "—"}
                            </td>
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
                      })}
                      {padBottom > 0 && <tr aria-hidden style={{ height: padBottom }}><td colSpan={7} /></tr>}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-muted-foreground mr-1">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>
                    <ChevronLeft /> Prev
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages}>
                    Next <ChevronRight />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
