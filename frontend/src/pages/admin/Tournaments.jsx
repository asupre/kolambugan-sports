import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, RotateCcw, Trash2, Zap } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { DateTimePicker } from "../../components/DateTimePicker";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Progress } from "../../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { useDragScroll } from "../../hooks/useDragScroll";
import { cn } from "../../lib/utils";

const DIVISION_LABEL = { open: "Open", boys: "Boys", girls: "Girls", under15: "U15", under30: "U30" };

function StandingsView({ tournamentId }) {
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api(`/api/tournaments/${tournamentId}/standings`)
      .then((data) => { if (active) setGroups(data.groups || {}); })
      .catch(() => { if (active) setGroups({}); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tournamentId]);

  if (loading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (!groups || Object.keys(groups).length === 0)
    return <p className="text-muted-foreground text-sm">No standings yet.</p>;

  return (
    <div className="space-y-6">
      {Object.entries(groups).filter(([name]) => name !== "-").map(([groupName, table]) => (
        <div key={groupName}>
          <h3 className="font-medium text-sm mb-2">Group {groupName}</h3>
          <div className="overflow-x-auto scrollbar-thin rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 font-medium w-8">#</th>
                  <th className="px-3 py-2 font-medium">Team</th>
                  <th className="px-3 py-2 font-medium text-center">P</th>
                  <th className="px-3 py-2 font-medium text-center">W</th>
                  <th className="px-3 py-2 font-medium text-center">L</th>
                  <th className="px-3 py-2 font-medium text-center">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {table.map((row, i) => (
                  <tr key={row.teamId}>
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{row.teamName}</td>
                    <td className="px-3 py-2 text-center">{row.played}</td>
                    <td className="px-3 py-2 text-center">{row.wins}</td>
                    <td className="px-3 py-2 text-center">{row.losses}</td>
                    <td className="px-3 py-2 text-center font-semibold">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchesView({ tournamentId }) {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api(`/api/tournaments/${tournamentId}/matches`)
      .then((d) => { if (alive) setMatches((d.matches || []).filter((m) => m.bracket === "group")); })
      .catch(() => { if (alive) setMatches([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tournamentId]);

  async function revert(m) {
    const ok = await confirm(
      `Revert ${m.teamA?.teamName} vs ${m.teamB?.teamName}?\n\n` +
      `The score, periods and player stats are discarded, and both teams are pulled ` +
      `back out of the matches they advanced into. The organizer scores it again.`,
      { danger: true, confirmLabel: "Revert" }
    );
    if (!ok) return;
    try {
      await api(`/api/tournaments/matches/${m._id}/revert`, { method: "POST" });
      const d = await api(`/api/tournaments/${tournamentId}/bracket`);
      setMatches(d.matches || []);
    } catch (e) {
      showError(e.message);
    }
  }

  if (loading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (matches.length === 0) return null;

  const scoreOf = (m, side) =>
    (m.games || []).reduce((n, g) => n + (g[side === "A" ? "scoreA" : "scoreB"] || 0), 0);

  // Tiebreaker rounds are numbered from 100 so they sort after the group stage.
  // That's an implementation detail; nobody should read "Round 101".
  const roundLabel = (m) =>
    m.isTiebreaker
      ? (m.round >= 101 ? "Playoff decider" : "Playoff")
      : `R${m.round}`;

  const group = matches.filter((m) => !m.isTiebreaker);
  const playoff = matches.filter((m) => m.isTiebreaker);

  const Row = ({ m }) => {
    const done = m.status === "completed";
    const aWin = done && String(m.seriesWinner) === String(m.teamA?._id || m.teamA);
    return (
      <div className="flex items-center gap-2 flex-wrap rounded-lg border px-3 py-2 text-sm">
        <span className="text-muted-foreground text-xs w-24 shrink-0">
          {m.group ? `Grp ${m.group} · ` : ""}{roundLabel(m)}
        </span>
        <span className={cn("flex-1 min-w-0 text-right truncate", aWin ? "font-semibold" : "text-muted-foreground")}>
          {m.teamA?.teamName || "TBD"}
        </span>
        <span className="px-2 tabular-nums text-muted-foreground w-16 text-center shrink-0">
          {done ? `${scoreOf(m, "A")}–${scoreOf(m, "B")}`
            : m.status === "ongoing" ? "live" : "vs"}
        </span>
        <span className={cn("flex-1 min-w-0 truncate", done && !aWin ? "font-semibold" : "text-muted-foreground")}>
          {m.teamB?.teamName || "TBD"}
        </span>
        {done && (
          <Button size="sm" variant="outline" onClick={() => revert(m)} className="shrink-0">
            <RotateCcw /> Revert
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-6">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="font-medium text-sm">Group matches</h3>
        <span className="text-muted-foreground text-xs">
          scored by the organizer — {group.filter((m) => m.status === "completed").length}/{group.length} played
        </span>
      </div>
      <div className="space-y-2">{group.map((m) => <Row key={m._id} m={m} />)}</div>

      {playoff.length > 0 && (
        <>
          <h3 className="font-medium text-sm mt-5 mb-2">Tiebreaker playoff</h3>
          <div className="space-y-2">{playoff.map((m) => <Row key={m._id} m={m} />)}</div>
        </>
      )}
    </div>
  );
}

function ScheduleSection({ tournamentId }) {
  const showError = useErrorDialog();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({});     // matchId -> { schedule, venue }
  const [bulk, setBulk] = useState({});       // round -> { schedule, venue, group }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openRounds, setOpenRounds] = useState({});

  async function load() {
    setLoading(true);
    try {
      const data = await api(`/api/tournaments/${tournamentId}/matches`);
      setMatches(data.matches || []);
      setEdits({});
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tournamentId]);

  // datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time. toISOString() would
  // convert to UTC and shift the clock by 8 hours.
  const asInput = (d) => {
    if (!d) return "";
    const x = new Date(d);
    const pad = (n) => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
  };

  const valueOf = (m, field) =>
    edits[m._id]?.[field] !== undefined
      ? edits[m._id][field]
      : field === "schedule" ? asInput(m.schedule) : (m.venue || "");

  const isDirty = (m) => {
    const e = edits[m._id];
    if (!e) return false;
    return (e.schedule !== undefined && e.schedule !== asInput(m.schedule))
      || (e.venue !== undefined && e.venue !== (m.venue || ""));
  };

  function edit(matchId, field, value) {
    setEdits((prev) => ({ ...prev, [matchId]: { ...prev[matchId], [field]: value } }));
  }

  // Saved explicitly rather than on every keystroke — typing a venue would
  // otherwise fire a request per character.
  async function saveOne(m) {
    setBusy(true);
    try {
      await api(`/api/tournaments/matches/${m._id}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          schedule: valueOf(m, "schedule") || null,
          venue: valueOf(m, "venue"),
        }),
      });
      await load();
    } catch (e) { showError(e.message); }
    finally { setBusy(false); }
  }

  // Keyed by section, not round number: group round 1 and knockout round 1 are
  // different sections that happen to share a number.
  async function applyRound(key) {
    const b = bulk[key] || {};
    const round = Number(String(key).split("-")[1]);
    if (!b.schedule) { showError("Pick a date and time first."); return; }
    setBusy(true); setMsg("");
    try {
      const body = { schedule: b.schedule, round: Number(round) };
      if (b.group) body.group = b.group;
      if (b.venue) body.venue = b.venue;
      const res = await api(`/api/tournaments/${tournamentId}/schedule-bulk`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMsg(res.message);
      await load();
    } catch (e) { showError(e.message); }
    finally { setBusy(false); }
  }

  // Round numbers restart in the knockout, so group-stage round 1 and the first
  // knockout round collide. Group-stage matches carry a `group`; knockout matches
  // don't — that's what separates them.
  const stageOf = (m) => (m.group ? "group" : "knockout");
  const keyOf = (m) => `${stageOf(m)}-${m.round}`;
  const sections = [...new Set(matches.map(keyOf))].sort((a, b) => {
    const [sa, ra] = a.split("-"); const [sb, rb] = b.split("-");
    if (sa !== sb) return sa === "group" ? -1 : 1;
    return Number(ra) - Number(rb);
  });
  const groups = [...new Set(matches.map((m) => m.group).filter(Boolean))].sort();
  const dated = matches.filter((m) => m.schedule).length;

  const roundLabel = (m) => {
    if (m.isTiebreaker) return m.round >= 101 ? "Playoff decider" : "Playoff";
    if (!m.group) {
      const n = matches.filter((x) => !x.group && x.round === m.round && !(x.bracket || "").includes("third")).length;
      return n === 1 ? "Final" : n === 2 ? "Semifinals" : n === 4 ? "Quarterfinals" : `Round of ${n * 2}`;
    }
    return `Round ${m.round}`;
  };

  return (
    <div className="mt-8 border-t pt-5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="font-semibold">Schedule</h3>
        <span className="text-muted-foreground text-sm">{dated} of {matches.length} dated</span>
      </div>
      <p className="text-muted-foreground text-sm mb-4">
        Dates are guidance, not a lock — an organizer can still start an undated match,
        or one being played on a different day. Times are Philippine time.
      </p>

      {msg && <p className="text-sm bg-muted rounded px-3 py-2 mb-3">{msg}</p>}

      {loading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : matches.length === 0 ? (
        <p className="text-muted-foreground text-sm">No matches to schedule yet.</p>
      ) : (
        <div className="space-y-6">
          {sections.map((key) => {
            const inRound = matches.filter((m) => keyOf(m) === key);
            const b = bulk[key] || {};

            // A round where everything has been played is history — collapse it so
            // it doesn't bury the rounds still needing dates.
            const played = inRound.filter((m) => m.status === "completed").length;
            const allPlayed = played === inRound.length;
            const open = openRounds[key] ?? !allPlayed;
            return (
              <Card key={key} className="p-0 gap-0 overflow-hidden">
                <div className="bg-muted/60 px-4 py-3 border-b">
                  <button onClick={() => setOpenRounds({ ...openRounds, [key]: !open })}
                    className="flex items-baseline gap-2 mb-2 w-full text-left">
                    {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                    <h4 className="font-medium text-sm">{roundLabel(inRound[0])}</h4>
                    <span className="text-muted-foreground text-xs">
                      {inRound.length} match{inRound.length === 1 ? "" : "es"} ·{" "}
                      {allPlayed ? "all played" : `${inRound.filter((m) => m.schedule).length} dated`}
                    </span>
                  </button>
                  {open && (
                    <div className="flex items-end gap-2 flex-wrap">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-normal text-muted-foreground">Date &amp; time</Label>
                        <DateTimePicker value={b.schedule || ""}
                          onChange={(v) => setBulk({ ...bulk, [key]: { ...b, schedule: v } })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-normal text-muted-foreground">Venue</Label>
                        <Input type="text" placeholder="Covered court" value={b.venue || ""}
                          onChange={(e) => setBulk({ ...bulk, [key]: { ...b, venue: e.target.value } })}
                          className="w-44" />
                      </div>
                      {groups.length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-[11px] font-normal text-muted-foreground">Group</Label>
                          <Select value={b.group || "all"} onValueChange={(v) => setBulk({ ...bulk, [key]: { ...b, group: v === "all" ? "" : v } })}>
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All groups</SelectItem>
                              {groups.map((g) => <SelectItem key={g} value={g}>Group {g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <Button size="sm" onClick={() => applyRound(key)} disabled={busy}>
                        Apply to round
                      </Button>
                    </div>
                  )}
                </div>
                {open && (
                  <div className="divide-y">
                    {inRound.map((m) => {
                      const done = m.status === "completed" || m.status === "forfeited";
                      return (
                        <div key={m._id} className={cn("px-4 py-2.5", done && "bg-muted/30")}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-muted-foreground text-xs w-16 shrink-0">
                              {m.group ? `Grp ${m.group}` : m.bracket}
                            </span>
                            <span className="flex-1 min-w-[12rem] truncate text-sm">
                              {m.teamA?.teamName || "TBD"}
                              <span className="text-muted-foreground"> vs </span>
                              {m.teamB?.teamName || "TBD"}
                            </span>

                            {done ? (
                              <span className="text-muted-foreground text-xs">
                                {m.status === "forfeited" ? "forfeited" : "played"}
                              </span>
                            ) : (
                              <>
                                <DateTimePicker value={valueOf(m, "schedule")}
                                  onChange={(v) => edit(m._id, "schedule", v)}
                                  className="shrink-0 w-auto" />
                                <Input type="text" placeholder="Venue" value={valueOf(m, "venue")}
                                  onChange={(e) => edit(m._id, "venue", e.target.value)}
                                  className="text-xs w-36 shrink-0" />
                                <Button size="sm" onClick={() => saveOne(m)} disabled={busy || !isDirty(m)} className="shrink-0">
                                  Save
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TournamentDetail({ tournamentId, stage, isML, onBracketGenerated }) {
  const showError = useErrorDialog();
  const [refreshKey, setRefreshKey] = useState(0);
  const [qualification, setQualification] = useState(null);  // ML tiebreaker UI
  const [readiness, setReadiness] = useState(null);          // who actually qualified
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [simulating, setSimulating] = useState(false);

  async function simulateGroups() {
    setSimulating(true);
    try {
      await api(`/api/tournaments/${tournamentId}/simulate-groups`, { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      showError(e.message);
    } finally {
      setSimulating(false);
    }
  }

  // The public bracket endpoint is the single source of truth for who has
  // qualified: it accounts for tiebreaker playoffs (ML) and for upper/lower
  // bracket winners (physical sports). Table POSITION is not enough — a playoff
  // can send a team through from below the cutoff line.
  async function loadReadiness() {
    try {
      const d = await api(`/api/public/bracket?tournament=${tournamentId}`);
      const groups = [...new Set((d.matches || []).filter((m) => m.group).map((m) => m.group))];
      const qual = d.qualification || {};
      const seeds = d.qualifiers || {};

      if (isML) {
        const contested = groups.filter((g) => (qual[g]?.contested || []).length > 0);
        const ids = groups.flatMap((g) => qual[g]?.clear || []);
        const advance = d.tournament?.advancePerGroup || 1;
        setReadiness({
          groups, contested, ids,
          ready: contested.length === 0 && ids.length === groups.length * advance,
          expected: groups.length * advance,
        });
      } else {
        const short = groups.filter((g) => (seeds[g] || []).length < 2);
        const ids = groups.flatMap((g) => (seeds[g] || []).map((s) => s.teamId));
        setReadiness({
          groups, contested: [], ids, short,
          ready: short.length === 0 && groups.length > 0,
          expected: groups.length * 2,
        });
      }
    } catch {
      setReadiness(null);
    }
  }

  async function loadQualification() {
    try {
      setQualification(await api(`/api/tournaments/${tournamentId}/qualification`));
    } catch {
      setQualification(null);
    }
  }

  useEffect(() => {
    loadReadiness();
    if (isML) loadQualification();
  }, [tournamentId, refreshKey, isML]);

  const groups = qualification?.groups || {};
  const groupList = Object.entries(groups);
  const anyNeedsTiebreaker = groupList.some(([, g]) => g.needsTiebreaker);
  const groupsComplete = groupList.length > 0 && groupList.every(([, g]) => g.complete);

  async function generateBracket() {
    setBusy(true);
    setError("");
    try {
      if (!isML) {
        // The de-bracket route reads the group qualifiers itself, so there's
        // nothing to send — and nothing for the frontend to get wrong.
        await api(`/api/tournaments/${tournamentId}/de-bracket`, { method: "POST" });
      } else {
        if (!readiness?.ready) {
          setError(
            readiness?.contested?.length
              ? `Group ${readiness.contested.join(", ")} still has a tie for the last spot. Play the tiebreaker playoff first.`
              : "Not every group has produced its qualifiers yet."
          );
          return;
        }
        await api(`/api/tournaments/${tournamentId}/bracket`, {
          method: "POST",
          body: JSON.stringify({ teamIds: readiness.ids }),
        });
      }
      onBracketGenerated && onBracketGenerated();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function generateTiebreakers() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/tournaments/${tournamentId}/tiebreakers`, { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const ErrorBox = () => error ? (
    <Alert variant="destructive" className="mb-3">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  return (
    <div>
      {stage === "elimination" || stage === "completed" ? (
        <BracketView tournamentId={tournamentId} />
      ) : (
        <>
          <div className="mb-4">
            <Button
              size="sm"
              variant="outline"
              onClick={simulateGroups}
              disabled={simulating}
              className="border-dashed border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/10"
            >
              <Zap /> {simulating ? "Simulating…" : "Dev: Auto-score all group matches"}
            </Button>
          </div>

          {isML ? (
            <>
              <StandingsView tournamentId={tournamentId} key={`s-${refreshKey}`} />
              <MatchesView tournamentId={tournamentId} key={`m-${refreshKey}`}
                onScored={() => setRefreshKey((k) => k + 1)} />
            </>
          ) : (
            <BracketView tournamentId={tournamentId} key={`b-${refreshKey}`} />
          )}

          {(isML ? groupsComplete : readiness) && (
            <div className="mt-6 pt-6 border-t">
              {isML && anyNeedsTiebreaker && !readiness?.ready ? (
                <>
                  <h3 className="font-semibold mb-1">Tie at the cutoff</h3>
                  <p className="text-amber-600 dark:text-amber-400 text-sm mb-3">
                    Some groups have a tie for the last qualifying spot. Generate a
                    single-elimination playoff among the tied teams to settle it.
                  </p>
                  <ErrorBox />
                  <Button onClick={generateTiebreakers} disabled={busy}>
                    {busy ? "Generating…" : "Generate Tiebreaker Playoff"}
                  </Button>
                </>
              ) : readiness?.ready ? (
                <>
                  <h3 className="font-semibold mb-1">Group stage complete</h3>
                  <p className="text-muted-foreground text-sm mb-3">
                    {readiness.ids.length} teams qualified.
                  </p>
                  <ErrorBox />
                  <Button onClick={generateBracket} disabled={busy}>
                    {busy ? "Generating…" : `Generate Knockout Bracket (${readiness.ids.length} teams)`}
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="font-semibold mb-1">Not ready yet</h3>
                  <p className="text-muted-foreground text-sm">
                    {readiness?.contested?.length
                      ? `Group ${readiness.contested.join(", ")} still has a tie to settle.`
                      : readiness?.short?.length
                        ? `Group ${readiness.short.join(", ")} hasn't produced both qualifiers yet.`
                        : "Finish the group stage first."}
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    {readiness?.ids?.length || 0} of {readiness?.expected || "?"} qualifiers decided.
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}
      <ScheduleSection tournamentId={tournamentId} />
    </div>
  );
}

// Read-only. Scoring belongs to the organizer's courtside screen — an admin
// entering a score here would bypass PlayerMatchStats and the period record.
// Kept as a plain <div ref={innerRef}> (not a shadcn Card) — BracketTree
// measures this exact DOM node with getBoundingClientRect() to draw the SVG
// connector wires, and Card doesn't forward refs.
function MatchBox({ m, innerRef, onRevert }) {
  const done = m.status === "completed";
  const live = m.status === "ongoing";
  const winnerId = String(m.seriesWinner?._id || m.seriesWinner || "");
  const aId = String(m.teamA?._id || m.teamA || "");
  const bId = String(m.teamB?._id || m.teamB || "");
  const aWin = done && winnerId === aId;
  const bWin = done && winnerId === bId;

  const total = (side) => (m.games || []).reduce((n, g) => n + (g[side] || 0), 0);
  const aScore = m.liveScoreA || total("scoreA");
  const bScore = m.liveScoreB || total("scoreB");

  const Side = ({ name, score, won }) => (
    <div className={cn("flex items-center gap-2 px-3 py-2", won && "bg-green-500/10")}>
      <span className={cn("flex-1 min-w-0 truncate", won ? "font-semibold" : "text-muted-foreground")}>
        {name || "TBD"}
      </span>
      {(done || live) && <span className="font-medium w-6 text-center tabular-nums">{score}</span>}
    </div>
  );

  return (
    <div ref={innerRef}
      className={cn("border rounded-lg overflow-hidden text-sm w-56 shrink-0 bg-card", live ? "border-red-500/40" : "border-border")}>
      <Side name={m.teamA?.teamName} score={aScore} won={aWin} />
      <div className="border-t" />
      <Side name={m.teamB?.teamName} score={bScore} won={bWin} />
      {live && (
        <div className="px-3 py-1 bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-semibold">
          ● LIVE
        </div>
      )}
      {done && onRevert && (
        <button onClick={() => onRevert(m)}
          className="w-full px-3 py-1 border-t text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent">
          Revert
        </button>
      )}
    </div>
  );
}

// The last match of a bracket has nothing to its right, so the tree just stops
// and nobody can see what winning it earned. This card says so.
function WinnerCard({ match, label, sublabel, bothQualify }) {
  const done = match && ["completed", "forfeited"].includes(match.status) && match.seriesWinner;
  const winnerId = done ? String(match.seriesWinner._id || match.seriesWinner) : null;
  const sides = [match?.teamA, match?.teamB];
  const winner = done ? sides.find((t) => t && String(t._id) === winnerId) : null;
  const loser = done ? sides.find((t) => t && String(t._id) !== winnerId) : null;

  return (
    <div className={cn(
      "w-52 shrink-0 rounded-lg border px-3 py-2.5",
      done ? "border-green-500/40 bg-green-500/5" : "border-dashed bg-card"
    )}>
      <p className={cn("text-[10px] uppercase tracking-wide", done ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
        {label}
      </p>
      <p className={cn("text-sm mt-0.5 truncate", done ? "font-medium" : "text-muted-foreground")}>
        {winner?.teamName || "TBD"}
      </p>
      {/* A 2-team group plays one match that decides both qualifiers. */}
      {bothQualify && (
        <p className={cn("text-[13px] truncate", done ? "text-muted-foreground" : "text-muted-foreground")}>
          {loser?.teamName || "TBD"}
        </p>
      )}
      {sublabel && <p className="text-[11px] text-muted-foreground mt-1">{sublabel}</p>}
    </div>
  );
}

// The match a bracket ends on: the one no other match in it feeds from.
function finalOf(matches) {
  if (matches.length === 0) return null;
  const targets = new Set(matches.map((m) => m.nextMatchWin && String(m.nextMatchWin._id || m.nextMatchWin)).filter(Boolean));
  return matches.find((m) => !targets.has(String(m._id)) && !m.nextMatchWin)
    || matches.reduce((hi, m) => (!hi || (m.round || 0) > (hi.round || 0) ? m : hi), null);
}

// One tree, with elbows measured from the DOM. The outer stage div keeps
// `relative` positioning (for the absolutely-positioned SVG overlay) and plain
// <div> boxes throughout — every coordinate here comes from a live
// getBoundingClientRect() measurement, not a hardcoded layout assumption, so
// restyling spacing/colors is safe as long as MatchBox keeps forwarding its ref.
function BracketTree({ title, matches, labelFor, onRevert, winner }) {
  const stageRef = useRef(null);
  const dragRef = useDragScroll();
  const boxRefs = useRef({});
  const [wires, setWires] = useState([]);
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  useLayoutEffect(() => {
    function measure() {
      const stage = stageRef.current;
      if (!stage) return;
      const base = stage.getBoundingClientRect();
      const ws = [];
      matches.forEach((m) => {
        const from = boxRefs.current[m._id];
        const toId = m.nextMatchWin && String(m.nextMatchWin._id || m.nextMatchWin);
        const to = toId && boxRefs.current[toId];
        if (!from || !to) return;
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const x1 = a.right - base.left, y1 = a.top - base.top + a.height / 2;
        const x2 = b.left - base.left, y2 = b.top - base.top + b.height / 2;
        const mx = (x1 + x2) / 2;
        ws.push(`M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`);
      });
      setWires(ws);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [matches]);

  if (matches.length === 0) return null;

  return (
    <div className="mb-6">
      {title && <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-2">{title}</p>}
      <div ref={dragRef} className="overflow-x-auto scrollbar-thin pb-4 cursor-grab">
        <div ref={stageRef} className="relative flex gap-10 min-w-min">
          <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible", pointerEvents: "none" }}>
            {wires.map((d, i) => <path key={i} d={d} className="stroke-border" strokeWidth="2" fill="none" />)}
          </svg>
          {rounds.map((r, i) => (
            <div key={r} className="relative z-10 flex flex-col">
              <p className="text-muted-foreground text-xs font-medium mb-2">{labelFor(r, i, rounds.length)}</p>
              <div className="flex-1 flex flex-col justify-around gap-3">
                {matches.filter((m) => m.round === r).map((m) => (
                  <MatchBox key={m._id} m={m} onRevert={onRevert}
                    innerRef={(el) => (boxRefs.current[m._id] = el)} />
                ))}
              </div>
            </div>
          ))}

          {winner && (
            <div className="relative z-10 flex flex-col">
              <p className="text-muted-foreground text-xs font-medium mb-2">&nbsp;</p>
              <div className="flex-1 flex flex-col justify-around">
                <WinnerCard {...winner} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BracketView({ tournamentId }) {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api(`/api/tournaments/${tournamentId}/bracket`)
      .then((d) => { if (alive) setMatches(d.matches || []); })
      .catch(() => { if (alive) setMatches([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tournamentId]);

  async function revert(m) {
    const ok = await confirm(
      `Revert ${m.teamA?.teamName} vs ${m.teamB?.teamName}?\n\n` +
      `The score, periods and player stats are discarded, and both teams are pulled ` +
      `back out of the matches they advanced into. The organizer scores it again.`,
      { danger: true, confirmLabel: "Revert" }
    );
    if (!ok) return;
    try {
      await api(`/api/tournaments/matches/${m._id}/revert`, { method: "POST" });
      const d = await api(`/api/tournaments/${tournamentId}/bracket`);
      setMatches(d.matches || []);
    } catch (e) {
      showError(e.message);
    }
  }

  if (loading) return <Skeleton className="h-56 w-full rounded-xl" />;
  if (matches.length === 0) return <p className="text-muted-foreground text-sm">No bracket yet.</p>;

  // Physical sports run FOUR separate double-elims, one per group. Filtering on
  // bracket alone merges them into a single unreadable tree — the group is what
  // separates them.
  const grouped = matches.filter((m) => m.group);
  const knockout = matches.filter((m) => !m.group);
  const groups = [...new Set(grouped.map((m) => m.group))].sort();

  // Name rounds by how many teams are left, not by position — the third-place
  // match shares the final's round number and throws off counting backwards.
  const koLabel = (r) => {
    const inRound = koMain.filter((m) => m.round === r).length;
    return inRound === 1 ? "Final"
      : inRound === 2 ? "Semifinals"
      : inRound === 4 ? "Quarterfinals"
      : `Round of ${inRound * 2}`;
  };
  const koMain = knockout.filter((m) => !(m.bracket || "").includes("third"));
  const koThird = knockout.find((m) => (m.bracket || "").includes("third"));

  return (
    <div>
      {koMain.length > 0 && (
        <div className="mb-8">
          <h3 className="font-semibold mb-3">Knockout</h3>
          <BracketTree matches={koMain} labelFor={koLabel} onRevert={revert}
            winner={{ match: finalOf(koMain), label: "Champion", sublabel: null }} />
          {koThird && (
            <div>
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-2">Third place</p>
              <div className="flex items-center gap-10">
                <MatchBox m={koThird} innerRef={() => {}} onRevert={revert} />
                <WinnerCard match={koThird} label="Third place" sublabel={null} />
              </div>
            </div>
          )}
        </div>
      )}

      {groups.map((g) => (
        <div key={g} className="mb-8">
          <h3 className="font-semibold mb-3">Group {g}</h3>
          {(() => {
            const w = grouped.filter((m) => m.group === g && m.bracket === "winners");
            const l = grouped.filter((m) => m.group === g && m.bracket === "losers");
            return (
              <>
                <BracketTree title="Winners" onRevert={revert} matches={w} labelFor={(r) => `Round ${r}`}
                  winner={w.length > 0 ? {
                    match: finalOf(w),
                    label: "Winner",
                    sublabel: l.length === 0 ? "Both teams qualify" : "Qualifies as seed 1",
                    bothQualify: l.length === 0,
                  } : null} />
                <BracketTree title="Losers" onRevert={revert} matches={l} labelFor={(r, i) => `Round ${i + 1}`}
                  winner={l.length > 0 ? {
                    match: finalOf(l),
                    label: "Winner",
                    sublabel: "Qualifies as seed 2",
                  } : null} />
              </>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

const TEAM_STATUS_BADGE = {
  verified: "bg-green-500/15 text-green-600 dark:text-green-400",
  rejected: "bg-red-500/15 text-red-600 dark:text-red-400",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

// Orphaned TOURNAMENTS: the plain tournament list (loaded once, scoped to
// the current season) never surfaces one left behind by a deleted season —
// so there was no way to reach its "Delete tournament" button, which is
// also the only thing standing between its teams and being deletable ("still
// appears in N match(es)"). Shown above Orphaned teams since deleting these
// first is the actual unblock step.
function OrphanedTournamentsSection({ sportId, division, onChanged }) {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total } while removeAll runs

  async function load() {
    setLoading(true);
    try {
      const data = await api(`/api/tournaments/by-sport?sportId=${sportId}`);
      setTournaments(data.tournaments || []);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [sportId]);

  const orphaned = tournaments.filter((t) => (t.division || "open") === division && !t.season);

  async function remove(t) {
    const ok = await confirm(
      `Delete this orphaned tournament? Every match, score, and player stat in it is discarded ` +
      `permanently — its teams are not deleted, they just become free (and, if orphaned themselves, ` +
      `deletable).`,
      { danger: true, confirmLabel: "Delete" }
    );
    if (!ok) return;
    setBusyId(t._id);
    try {
      await api(`/api/tournaments/${t._id}`, { method: "DELETE" });
      setTournaments((prev) => prev.filter((x) => x._id !== t._id));
      onChanged && onChanged();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeAll() {
    const ok = await confirm(
      `Delete all ${orphaned.length} orphaned tournament(s) for this sport and division? This can't be undone.`,
      { danger: true, confirmLabel: `Delete all ${orphaned.length}` }
    );
    if (!ok) return;
    setBulkBusy(true);
    const total = orphaned.length;
    setBulkProgress({ done: 0, total });
    let deleted = 0, processed = 0, lastError = "";
    for (const t of orphaned) {
      try {
        await api(`/api/tournaments/${t._id}`, { method: "DELETE" });
        deleted++;
      } catch (e) {
        lastError = e.message;
      }
      processed++;
      setBulkProgress({ done: processed, total });
    }
    await load();
    onChanged && onChanged();
    setBulkBusy(false);
    setBulkProgress(null);
    if (deleted < orphaned.length) {
      showError(`Deleted ${deleted} of ${orphaned.length}. Last error: "${lastError}"`);
    }
  }

  if (loading || orphaned.length === 0) return null;

  return (
    <Card className="mt-6 border-l-4 border-l-amber-500">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Orphaned tournaments ({orphaned.length})</CardTitle>
          {orphaned.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10 shrink-0"
              onClick={removeAll}
              disabled={bulkBusy || busyId !== null}
            >
              <Trash2 /> {bulkBusy ? "Deleting…" : `Delete all ${orphaned.length}`}
            </Button>
          )}
        </div>
        <CardDescription>
          Left behind by a deleted season — this is why their teams can't be deleted below
          ("still appears in N match(es)"). Delete these first.
        </CardDescription>
        {bulkProgress && (
          <div className="space-y-1 pt-1">
            <Progress value={(bulkProgress.done / bulkProgress.total) * 100} />
            <p className="text-muted-foreground text-xs">
              Deleting {bulkProgress.done} of {bulkProgress.total}…
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {orphaned.map((t) => (
          <div key={t._id} className="flex items-center gap-3 rounded-lg border px-3 py-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {t.format === "round_robin" ? "Group stage" : "Elimination"} · {t.stage}
              </p>
              <p className="text-muted-foreground text-xs">season deleted</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10"
              onClick={() => remove(t)}
              disabled={busyId === t._id || bulkBusy}
            >
              <Trash2 /> {busyId === t._id ? "…" : "Delete"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Orphaned teams for a sport+division: ones whose season was deleted out
// from under them (the populate on `season` comes back null), which is
// exactly what leaves a sport stuck — DELETE /api/sports/:id refuses while
// they still exist. A team on a real season (current OR a completed, still-
// existing past one) is a legitimate record, not shown here — this is a
// recovery tool for the orphan case, not general team management, so it
// stays out of the way during normal operation.
function TeamsSection({ sportId, division, onChanged }) {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total } while removeAll runs
  const [open, setOpen] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api(`/api/teams?sportId=${sportId}`);
      setTeams(data.teams || []);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [sportId]);

  // Orphan = the season reference doesn't resolve to a real document anymore.
  const inDivision = teams.filter((t) => (t.division || "open") === division && !t.season);

  async function remove(t) {
    const ok = await confirm(
      `Delete "${t.teamName}"? This permanently removes its roster, and any of its ` +
      `players' documents and photos who aren't on another team. This can't be undone.`,
      { danger: true, confirmLabel: "Delete" }
    );
    if (!ok) return;
    setBusyId(t._id);
    try {
      await api(`/api/teams/${t._id}`, { method: "DELETE" });
      setTeams((prev) => prev.filter((x) => x._id !== t._id));
      onChanged && onChanged();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  // Deletes every orphaned team currently listed, one request at a time —
  // still subject to the same per-team match guard as a single delete, so
  // this reports a partial result rather than assuming they all succeed
  // (e.g. the tournament hasn't been deleted yet, so all of them are blocked).
  async function removeAll() {
    const ok = await confirm(
      `Delete all ${inDivision.length} orphaned team(s) for this sport and division? This permanently ` +
      `removes each roster, and any of their players' documents and photos who aren't on another team. ` +
      `This can't be undone.`,
      { danger: true, confirmLabel: `Delete all ${inDivision.length}` }
    );
    if (!ok) return;
    setBulkBusy(true);
    const total = inDivision.length;
    setBulkProgress({ done: 0, total });
    let deleted = 0, failed = 0, lastError = "";
    for (const t of inDivision) {
      try {
        await api(`/api/teams/${t._id}`, { method: "DELETE" });
        deleted++;
      } catch (e) {
        failed++;
        lastError = e.message;
      }
      setBulkProgress({ done: deleted + failed, total });
    }
    await load();
    onChanged && onChanged();
    setBulkBusy(false);
    setBulkProgress(null);
    if (failed > 0) {
      showError(
        `Deleted ${deleted} of ${inDivision.length} team(s). ${failed} couldn't be removed — ` +
        `for example: "${lastError}"`
      );
    } else {
      await confirm(`Deleted all ${deleted} orphaned team(s).`, { alertOnly: true });
    }
  }

  if (loading || inDivision.length === 0) return null;

  return (
    <Card className="mt-6 border-l-4 border-l-amber-500">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left min-w-0">
            {open ? <ChevronDown className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />}
            <CardTitle className="text-base">Orphaned teams ({inDivision.length})</CardTitle>
          </button>
          {inDivision.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10 shrink-0"
              onClick={removeAll}
              disabled={bulkBusy || busyId !== null}
            >
              <Trash2 /> {bulkBusy ? "Deleting…" : `Delete all ${inDivision.length}`}
            </Button>
          )}
        </div>
        <CardDescription>
          These teams' season was deleted without them, so they're left over pointing at nothing —
          that's what's blocking this sport (or its barangay) from being deleted. Delete one that's
          still in a match by deleting its tournament first.
        </CardDescription>
        {bulkProgress && (
          <div className="space-y-1 pt-1">
            <Progress value={(bulkProgress.done / bulkProgress.total) * 100} />
            <p className="text-muted-foreground text-xs">
              Deleting {bulkProgress.done} of {bulkProgress.total}…
            </p>
          </div>
        )}
      </CardHeader>
      {open && (
        <CardContent className="space-y-2">
          {inDivision.map((t) => (
            <div key={t._id} className="flex items-center gap-3 rounded-lg border px-3 py-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{t.teamName}</p>
                <p className="text-muted-foreground text-xs">
                  {t.barangay?.name || "—"} · {t.playerCount} player{t.playerCount === 1 ? "" : "s"} · season deleted
                </p>
              </div>
              <Badge className={TEAM_STATUS_BADGE[t.status] || TEAM_STATUS_BADGE.pending}>{t.status}</Badge>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10"
                onClick={() => remove(t)}
                disabled={busyId === t._id || bulkBusy}
              >
                <Trash2 /> {busyId === t._id ? "…" : "Delete"}
              </Button>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export default function Tournaments() {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const { sportId } = useParams();
  const navigate = useNavigate();
  const [sports, setSports] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [knockoutSize, setKnockoutSize] = useState(16);
  const [division, setDivision] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const [sportsData, tourneyData] = await Promise.all([
        api("/api/sports"),
        api("/api/tournaments"),
      ]);
      setSports(sportsData.sports || []);
      setTournaments(tourneyData.tournaments || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  // No sport in the URL — send them to the first one rather than showing an
  // empty page. The sidebar is the picker now.
  useEffect(() => {
    if (!sportId && sports.length) navigate(`/admin/tournaments/${sports[0]._id}`, { replace: true });
  }, [sportId, sports, navigate]);

  // Changing sport resets the division, since the divisions differ per sport.
  useEffect(() => { setDivision(""); setError(""); }, [sportId]);

  const selectedSport = sports.find((s) => String(s._id) === String(sportId));
  // Physical sports always run four groups into a Top 8, so there's nothing to
  // choose. Esports pick their knockout size.
  const isEsports = selectedSport?.category === "esports";

  const divisions = selectedSport?.divisions?.length ? selectedSport.divisions : ["open"];
  const activeDivision = divisions.includes(division) ? division : divisions[0];

  // A sport can run several tournaments in one season — one per division. Match
  // on BOTH, or basketball u30 sits unreachable behind u17.
  const currentTournament = tournaments.find(
    (t) =>
      t.sport && (t.sport._id === selectedSport?._id || t.sport === selectedSport?._id) &&
      (t.division || "open") === activeDivision
  );

  async function generate() {
    if (!selectedSport) return;
    setBusy(true);
    setError("");
    try {
      const body = { sportId: selectedSport._id, division: activeDivision };
      if (isEsports) body.knockoutSize = Number(knockoutSize);
      await api("/api/tournaments/generate", { method: "POST", body: JSON.stringify(body) });
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTournament() {
    if (!currentTournament) return;

    // DELETE /api/tournaments/:id has no guard against an ongoing tournament
    // with real, played matches — so the confirmation shows the actual stakes
    // instead of a generic warning nobody reads before clicking through.
    let completedCount = 0;
    try {
      const d = await api(`/api/tournaments/${currentTournament._id}/matches`);
      completedCount = (d.matches || []).filter((m) => m.status === "completed").length;
    } catch { /* best-effort — fall back to the generic message below */ }

    const ok = await confirm(
      completedCount > 0
        ? `Delete this ${selectedSport.name} tournament? ${completedCount} match(es) have ALREADY BEEN ` +
          `PLAYED with real scores — those results, every player stat, and the whole bracket are discarded ` +
          `permanently. Teams themselves are not deleted.`
        : `Delete this ${selectedSport.name} tournament? Every match, score, and player stat in it is ` +
          `discarded permanently. Teams themselves are not deleted — they're free to enter a new tournament.`,
      { danger: true, confirmLabel: completedCount > 0 ? `Delete ${completedCount} played match(es)` : "Delete" }
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/tournaments/${currentTournament._id}`, { method: "DELETE" });
      await loadAll();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout title={selectedSport?.name || "Tournaments"} menu={superAdminMenu} enableDarkMode>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : !selectedSport ? (
        <p className="text-muted-foreground">Pick a sport from the sidebar.</p>
      ) : (
        <div className="space-y-6">
          {divisions.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {divisions.map((d) => (
                <Button
                  key={d}
                  variant={activeDivision === d ? "default" : "secondary"}
                  onClick={() => { setDivision(d); setError(""); }}
                >
                  {DIVISION_LABEL[d] || d}
                </Button>
              ))}
            </div>
          )}

          <Card>
            <CardContent>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <h2 className="font-semibold text-lg">
                  {selectedSport.name}
                  {divisions.length > 1 && (
                    <span className="text-muted-foreground font-normal text-base ml-2">
                      {DIVISION_LABEL[activeDivision] || activeDivision}
                    </span>
                  )}
                </h2>
                {currentTournament && (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/15 text-primary">
                      {currentTournament.format === "round_robin" ? "Group stage" : "Elimination"} · {currentTournament.stage}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10"
                      onClick={deleteTournament}
                      disabled={busy}
                    >
                      <Trash2 /> Delete tournament
                    </Button>
                  </div>
                )}
              </div>

              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {!currentTournament ? (
                <div>
                  <p className="text-muted-foreground text-sm mb-4">
                    No {divisions.length > 1 ? `${DIVISION_LABEL[activeDivision] || activeDivision} ` : ""}
                    tournament generated for {selectedSport.name} yet. Generate one from the
                    verified teams. {isEsports
                      ? "This sport uses a grouped round-robin."
                      : "This sport uses four groups of double-elimination."}
                  </p>

                  {isEsports && (
                    <div className="mb-4 space-y-1.5">
                      <Label>Knockout size</Label>
                      <div className="flex gap-2">
                        {[8, 16].map((n) => (
                          <Button
                            key={n}
                            type="button"
                            variant={Number(knockoutSize) === n ? "default" : "secondary"}
                            onClick={() => setKnockoutSize(n)}
                          >
                            Top {n}
                          </Button>
                        ))}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        The system creates 8 groups and funnels down to the Top {knockoutSize}.
                        Needs at least {knockoutSize} verified teams.
                      </p>
                    </div>
                  )}

                  <Button onClick={generate} disabled={busy}>
                    {busy ? "Generating…" : `Generate ${selectedSport.name} Tournament`}
                  </Button>
                </div>
              ) : (
                <TournamentDetail
                  key={currentTournament._id}
                  tournamentId={currentTournament._id}
                  stage={currentTournament.stage}
                  isML={isEsports}
                  onBracketGenerated={loadAll}
                />
              )}
            </CardContent>
          </Card>

          <OrphanedTournamentsSection sportId={selectedSport._id} division={activeDivision} onChanged={loadAll} />
          <TeamsSection sportId={selectedSport._id} division={activeDivision} onChanged={loadAll} />
        </div>
      )}
    </AdminLayout>
  );
}
