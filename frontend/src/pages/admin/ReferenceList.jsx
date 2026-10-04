import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleCheck, CircleX, ClipboardList, Search, Sparkles, TriangleAlert, UploadCloud } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import InfoHint from "../../components/InfoHint";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useSeason } from "../../lib/season";

// Infinity = "All": one page, every row. The table is virtualized (see the
// useVirtualizer call below), so this stays smooth on the full ~17k list.
const PAGE_SIZES = [25, 50, 100, 200, 500, 1000, Infinity];
const sizeLabel = (n) => (n === Infinity ? "All" : String(n));
const DIVISION_TEXT = { boys: "Boys", girls: "Girls", under15: "Under 15", under30: "Under 30" };
// "Basketball (Under 15)" — "open" divisions add nothing, so they're left off.
const gameLabel = (g) =>
  g.sport ? `${g.sport}${g.division && DIVISION_TEXT[g.division] ? ` (${DIVISION_TEXT[g.division]})` : ""}` : null;
// One line listing the distinct games in `entries` (each is one team the resident is on).
function GamesLine({ entries }) {
  const games = [...new Set(entries.map(gameLabel).filter(Boolean))];
  if (!games.length) return null;
  return (
    <p className="text-xs">
      <span className="text-muted-foreground">Games: </span>
      <span className="font-medium">{games.join(", ")}</span>
    </p>
  );
}
// A resident on several teams for ONE barangay is normal (a player may play as
// many games as they like for the barangay they're on); grouping by barangay
// lets a row flag only the real conflict — the same person on more than one
// barangay's roster, which the roster routes now refuse.
function groupByBarangay(entries) {
  const groups = new Map();
  for (const m of entries) {
    const k = m.barangay || "?";
    if (!groups.has(k)) groups.set(k, { barangay: m.barangay, entries: [] });
    groups.get(k).entries.push(m);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    first: g.entries[0],
    flagged: g.entries.some((e) => e.status === "flagged"),
  }));
}
// Same tolerance as norm() in the backend's prescreen service.
const normName = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");

// Row/card tint per kind of connection to a roster.
const TONE_ROW = {
  eligible: "bg-green-500/10 outline outline-1 -outline-offset-1 outline-green-500/40",
  flagged: "bg-red-500/10 outline outline-1 -outline-offset-1 outline-red-500/40",
  multi: "bg-amber-500/10 outline outline-1 -outline-offset-1 outline-amber-500/40",
  minor: "bg-purple-500/10 outline outline-1 -outline-offset-1 outline-purple-500/40",
  nearmiss: "bg-orange-500/10 outline outline-1 -outline-offset-1 outline-orange-500/40",
};
const TONE_CARD = {
  eligible: "border-green-500/40 bg-green-500/10",
  flagged: "border-red-500/40 bg-red-500/10",
  multi: "border-amber-500/40 bg-amber-500/10",
  minor: "border-purple-500/40 bg-purple-500/10",
  nearmiss: "border-orange-500/40 bg-orange-500/10",
};

// `matches` is computed live on every load (see GET /api/reference-list) by
// re-running the same decision the automated pre-screen uses against every
// current player — so this lights up for ANY resident who's actually connected
// to a player right now, search or no search, no matter when that player was
// originally screened. It's an ARRAY (one entry per team), grouped by barangay
// so a person on several teams for one barangay isn't shown as a conflict.
function analyzeRow(r) {
  const matches = r.matches || [];
  const matchGroups = groupByBarangay(matches);
  const minorMatches = r.minorMatches || [];
  const nearMisses = r.nearMisses || [];
  const rowTone =
    matches.length > 0
      ? matchGroups.length > 1
        ? "multi"
        : matchGroups[0].flagged
        ? "flagged"
        : "eligible"
      : nearMisses.length > 0
      ? "nearmiss"
      : minorMatches.length > 0
      ? "minor"
      : null;
  return { rowTone, matchGroups, minorMatches, nearMisses };
}

function MatchInfo({ info }) {
  const { rowTone, matchGroups, minorMatches, nearMisses } = info;
  return (
    <>
                              {rowTone === "multi" && (
                                <p className="text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                                  On {matchGroups.length} barangays' rosters: a player may only play for one
                                </p>
                              )}
                              {matchGroups.map((g, i) => {
                                const m = g.first;
                                const isMismatch = g.flagged;
                                // Not a normal list match — the Super Admin approved this
                                // 15-and-under player by hand (document review), so this row was
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
                                    <p className="text-muted-foreground text-xs break-words md:truncate">
                                      {m.playerName}{g.barangay ? ` · plays for ${g.barangay}` : ""}
                                    </p>
                                    <GamesLine entries={g.entries} />
                                  </div>
                                );
                              })}
                              {/* Same name, but the middle initial and/or birthdate disagree.
                                  For an adult that's why they were flagged "not on the list";
                                  for a minor (`m.minor`) it doesn't change their status — always
                                  needs_document either way — it's still worth surfacing the same
                                  way so a mistyped middle name/birthdate on a minor's roster
                                  entry doesn't look identical to a clean same-name hint. */}
                              {nearMisses.map((m, i) => (
                                <div key={`near-${i}`} className="min-w-0">
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                                    <TriangleAlert className="size-3.5 shrink-0" />
                                    Same name, details differ
                                  </span>
                                  <p className="text-muted-foreground text-xs break-words md:truncate">
                                    {m.playerName}{m.barangay ? ` · plays for ${m.barangay}` : ""}
                                    {m.minor ? " · 15 or under, needs a document either way" : ""}
                                  </p>
                                  <GamesLine entries={[m]} />
                                  {m.differs.middle && (
                                    <p className="text-xs">
                                      <span className="text-muted-foreground">Middle: </span>
                                      <span className="text-orange-600 dark:text-orange-400 font-medium">{m.differs.middle.roster || "none"}</span>
                                      <span className="text-muted-foreground"> on roster vs </span>
                                      <span className="font-medium">{m.differs.middle.list || "none"}</span>
                                      <span className="text-muted-foreground"> on list</span>
                                    </p>
                                  )}
                                  {m.differs.birthdate && (
                                    <p className="text-xs">
                                      <span className="text-muted-foreground">Birthdate: </span>
                                      <span className="text-orange-600 dark:text-orange-400 font-medium">
                                        {m.differs.birthdate.roster ? new Date(m.differs.birthdate.roster).toLocaleDateString() : "none"}
                                      </span>
                                      <span className="text-muted-foreground"> on roster vs </span>
                                      <span className="font-medium">
                                        {m.differs.birthdate.list ? new Date(m.differs.birthdate.list).toLocaleDateString() : "none"}
                                      </span>
                                      <span className="text-muted-foreground"> on list</span>
                                    </p>
                                  )}
                                </div>
                              ))}
                              {/* 15 and under: never an official match (the voters' list starts
                                  at 16), so this is shown separately and clearly labeled as
                                  a hint, not a verdict — the player's own status stays
                                  needs_document either way; this just helps judge the
                                  uploaded document against whether the family shows up in
                                  the barangay's own records at all. */}
                              {minorMatches.map((m, i) => (
                                <div key={`minor-${i}`} className="min-w-0">
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400">
                                    <Sparkles className="size-3.5 shrink-0" />
                                    Same name, 15 or under{m.sameBarangay ? " · same barangay" : ""}
                                  </span>
                                  <p className="text-muted-foreground text-xs break-words md:truncate">
                                    {m.playerName}{m.barangay ? ` · plays for ${m.barangay}` : ""} · needs a document regardless, informational only
                                  </p>
                                  <GamesLine entries={[m]} />
                                </div>
                              ))}
    </>
  );
}

export default function ReferenceList() {
  // The list can be replaced only BEFORE verification starts. From verification until the season
  // ends, the Super Admin's verdicts are being made against it, and replacing it re-screens every
  // player (the server refuses too). The list itself stays fully viewable.
  const { season } = useSeason();
  const listLocked = !!season && !["setup", "registration_open"].includes(season.status);
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

  // Two layouts share one data pipeline. Desktop (md+): a table in a
  // fixed-height scroll box, virtualized against that box. Phone: stacked cards
  // that scroll with the PAGE (window-virtualized). A small scroll box inside a
  // scrolling page traps a finger — dragging the table scrolls the box, not the
  // page — and seven columns don't fit a phone anyway. Only one layout is
  // mounted at a time; `enabled` switches the other virtualizer off.
  // Windowing keeps the DOM small whatever the page size (rows vary in height —
  // a matched resident stacks several lines — so each is measured).
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const listRef = useRef(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const virtualizer = useVirtualizer({
    count: visibleRecords.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 37,
    overscan: 15,
    enabled: isDesktop,
  });
  const virtualRows = virtualizer.getVirtualItems();
  // The rows above/below the window are stood in for by two spacer rows so the
  // scrollbar still reflects the real length.
  const padTop = virtualRows.length ? virtualRows[0].start : 0;
  const padBottom = virtualRows.length
    ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  const winVirtualizer = useWindowVirtualizer({
    count: visibleRecords.length,
    estimateSize: () => 132,
    overscan: 6,
    scrollMargin,
    enabled: !isDesktop,
  });
  const winRows = winVirtualizer.getVirtualItems();

  // The list's distance from the top of the page moves as the cards above it
  // change (upload result, banners), so keep the window virtualizer's offset in sync.
  // Runs after every render on purpose (anything above can shift the list) — it
  // only sets state when the offset really moved, so it can't loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (isDesktop || !listRef.current) return;
    const top = listRef.current.getBoundingClientRect().top + window.scrollY;
    setScrollMargin((prev) => (Math.abs(prev - top) > 1 ? top : prev));
  });

  // Changing page / page size / search starts the desktop table back at its top.
  useEffect(() => {
    if (isDesktop) tableScrollRef.current?.scrollTo({ top: 0 });
  }, [currentPage, pageSize, deferredSearch, isDesktop]);
  // On a phone, paging brings the top of the list back into view. Not on a
  // search: the box being typed in is just above the list, and jumping the page
  // on every keystroke would fight the keyboard.
  const firstPhoneScroll = useRef(true);
  useEffect(() => {
    if (isDesktop) return;
    if (firstPhoneScroll.current) { firstPhoneScroll.current = false; return; }
    listRef.current?.scrollIntoView({ block: "start" });
  }, [currentPage, pageSize, isDesktop]);

  // Arriving from a "View in Reference List" link: once the list loads, bring
  // the results into view. Desktop needs two scrolls — the PAGE down past the
  // status/upload cards to the table, then the TABLE to the first matched row;
  // on a phone the window virtualizer's scrollToIndex does both at once. Both go
  // through a virtualizer since that row may not be in the DOM. A player who
  // isn't on the list at all (flagged as a possible Dayo) has no matched row —
  // the page scroll still lands on the (empty or same-name) results.
  useEffect(() => {
    if (!cameFromLink.current || scrolledToMatch.current || records.length === 0) return;
    const idx = visibleRecords.findIndex((r) => r.matches?.length || r.minorMatches?.length || r.nearMisses?.length);
    if (isDesktop) {
      const el = tableScrollRef.current;
      if (!el) return;
      scrolledToMatch.current = true;
      if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "center" });
      // Next frame, so the table has its real height before the page centres on it.
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    } else {
      const el = listRef.current;
      if (!el) return;
      scrolledToMatch.current = true;
      // Next frame, so the list's page offset (scrollMargin) has been measured.
      requestAnimationFrame(() => {
        if (idx >= 0) winVirtualizer.scrollToIndex(idx, { align: "center" });
        else el.scrollIntoView({ block: "start" });
      });
    }
  }, [records, visibleRecords, virtualizer, winVirtualizer, isDesktop]);

  async function handleUpload() {
    if (!file || listLocked) return;
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
    <AdminLayout title="Reference List" menu={superAdminMenu} enableDarkMode pictureBackground
      subtitle="The residents every player is checked against. Upload this season's list or search it.">
      <div className="space-y-6">
        {/* Current status */}
        <Card>
          <CardContent className="space-y-1">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ClipboardList className="size-4" /> Current reference list
            </p>
            {loading ? (
              <Skeleton className="h-9 w-56" />
            ) : !status || status.count === 0 ? (
              <p className="text-[17px] font-semibold">No reference list uploaded for the current season yet.</p>
            ) : (
              <p className="text-[15px] text-muted-foreground">
                <span className="mr-1.5 text-[32px] font-semibold leading-none tabular-nums text-foreground">{status.count.toLocaleString()}</span>
                resident records loaded{status.season ? ` for ${status.season}` : ""}.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Upload */}
        <Card>
          <CardHeader>
            <CardTitle>Upload a new list</CardTitle>
            <CardDescription>
              <InfoHint summary="Upload a CSV of eligible residents. This replaces the current list for this season.">
                <p>Columns can be named flexibly (first/middle/last name, birthdate, barangay).</p>
                <p className="mt-1.5"><span className="font-medium text-foreground">Middle name and birthdate are
                now required for a match</span>. A row missing either can never confirm a player as eligible,
                so include them if you have them.</p>
              </InfoHint>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {listLocked && (
              <Alert className="border-amber-500/30 bg-amber-500/5">
                <TriangleAlert className="text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-foreground">
                  <p className="font-medium">
                    <InfoHint summary="The list is locked. It can't be replaced until the season ends." label="Why">
                      <p>The Review Queue is judging players against this list, and a new one would re-check
                      everyone (the season is "{season.status.replace(/_/g, " ")}").</p>
                      <p className="mt-1.5">You can still search and view it below. Upload a new list before
                      verification, or when the next season begins.</p>
                    </InfoHint>
                  </p>
                </AlertDescription>
              </Alert>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              disabled={listLocked}
              onChange={(e) => setFile(e.target.files[0] || null)}
              className="block w-full text-sm text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-medium hover:file:bg-primary/15 cursor-pointer"
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
                      birthdate. Those residents can never auto-clear a player (name alone isn't enough
                      anymore), so an adult who only matches such a row is flagged as a possible Dayo until the Super Admin reviews them by hand.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Button onClick={handleUpload} disabled={!file || uploading || listLocked}>
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
                Search a resident by name or barangay. Colors show how a resident connects to a
                roster: <span className="text-green-600 dark:text-green-400 font-medium">green</span> matched,{" "}
                <span className="text-red-600 dark:text-red-400 font-medium">red</span> mismatch,{" "}
                <span className="text-orange-600 dark:text-orange-400 font-medium">orange</span> same name but
                middle initial/birthdate differ, <span className="text-purple-600 dark:text-purple-400 font-medium">purple</span>{" "}
                same-name hint for a player 15 or under whose details actually agree.
              </CardDescription>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none hover:text-foreground">How matching works</summary>
                <p className="mt-1.5">
                  A player matches a row only when the name, middle initial AND birthdate all agree. A
                  blank middle name or birthdate means that row can never confirm a match on its own.
                  Players 15 and under can never be officially matched (the list starts at 16) and always
                  still need a document, but a same-name row is still checked the same way: if the middle
                  initial or birthdate disagrees, it shows orange just like an adult near-miss so a typo or a
                  genuinely different person isn't mistaken for a clean hint; if the details actually agree,
                  it shows purple instead. Jersey numbers aren't tracked here; those live on the player's
                  roster entry.
                </p>
              </details>
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
                    (the same name check the screening uses).
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setExactName(null)}>Show all residents</Button>
                </div>
              )}
              {searchIsNoiseOnly ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Jersey numbers aren't on the reference list. Try a name instead.
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

              {isDesktop ? (
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
                            ? "No one on the reference list has this exact name. This player isn't on the list."
                            : "No residents match your search."}
                        </td>
                      </tr>
                    ) : (
                      <>
                      {padTop > 0 && <tr aria-hidden style={{ height: padTop }}><td colSpan={7} /></tr>}
                      {virtualRows.map((vr) => {
                        const r = visibleRecords[vr.index];
                        const info = analyzeRow(r);
                        return (
                          <tr
                            key={r._id}
                            data-index={vr.index}
                            ref={virtualizer.measureElement}
                            className={cn("border-b", info.rowTone && TONE_ROW[info.rowTone])}
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
                              <MatchInfo info={info} />
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
              ) : (
                // Phone: one card per resident, listing with the page itself.
                <div ref={listRef}>
                  {visibleRecords.length === 0 ? (
                    <p className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground">
                      {exactName
                        ? "No one on the reference list has this exact name. This player isn't on the list."
                        : "No residents match your search."}
                    </p>
                  ) : (
                    <div className="relative w-full" style={{ height: winVirtualizer.getTotalSize() }}>
                      {winRows.map((vr) => {
                        const r = visibleRecords[vr.index];
                        const info = analyzeRow(r);
                        return (
                          <div
                            key={r._id}
                            data-index={vr.index}
                            ref={winVirtualizer.measureElement}
                            className="absolute left-0 top-0 w-full pb-2"
                            style={{ transform: `translateY(${vr.start - winVirtualizer.options.scrollMargin}px)` }}
                          >
                            <div className={cn("rounded-lg border p-3 text-sm", info.rowTone && TONE_CARD[info.rowTone])}>
                              <div className="flex items-start gap-3">
                                <span className="w-10 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                                  {masterNumber.get(r._id)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium break-words">
                                    {r.lastName}, {r.firstName}{r.middleName ? ` ${r.middleName}` : ""}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {r.birthdate ? new Date(r.birthdate).toLocaleDateString() : "No birthdate"}
                                    {r.barangay ? ` · ${r.barangay}` : ""}
                                  </p>
                                  {info.rowTone && (
                                    <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                                      <MatchInfo info={info} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

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
