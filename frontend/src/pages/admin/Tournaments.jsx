import { memo, useCallback, useEffect, useState, useRef, useLayoutEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Trash2, Trophy, Zap } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { DateTimePicker, TimeSelect } from "../../components/DateTimePicker";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
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
import MvpBadge from "../../components/MvpBadge";
import { cn } from "../../lib/utils";
import { useSeason, SEASON_STAGES } from "../../lib/season";

const DIVISION_LABEL = { open: "Open", boys: "Boys", girls: "Girls", under15: "U15", under30: "U30" };

// Glass panels (Oct 2026): each group / the knockout sits in its own frosted
// panel over soft colour glows, so the groups read as separate blocks. One hue
// per group letter tells them apart at a glance. Blur is lg-only and only on
// these few panels, never on the match boxes inside (phone GPU cost).
const GROUP_HUE = {
  A: "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-blue-500/30",
  B: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30",
  C: "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/30",
  D: "bg-violet-500/15 text-violet-600 dark:text-violet-400 ring-violet-500/30",
  E: "bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-rose-500/30",
  F: "bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-sky-500/30",
  G: "bg-orange-500/15 text-orange-600 dark:text-orange-400 ring-orange-500/30",
  H: "bg-teal-500/15 text-teal-600 dark:text-teal-400 ring-teal-500/30",
};

// Glass needs colour behind it: radial gradients (no blur filters) under the panels.
function GlassStage({ children, className }) {
  return (
    <div className={cn("relative isolate", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute -inset-2 -z-10 rounded-3xl opacity-80 dark:opacity-60"
        style={{ background:
          "radial-gradient(40% 50% at 8% 0%, rgba(59,130,246,.22), transparent 70%)," +
          "radial-gradient(35% 45% at 95% 30%, rgba(14,165,233,.18), transparent 70%)," +
          "radial-gradient(40% 40% at 40% 100%, rgba(250,204,21,.14), transparent 70%)" }} />
      {children}
    </div>
  );
}

function GlassPanel({ letter, title, subtitle, children, className }) {
  return (
    <section className={cn(
      "min-w-0 rounded-2xl border border-white/70 dark:border-white/[0.12] bg-white/55 dark:bg-white/[0.05] lg:backdrop-blur-xl",
      "shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_10px_30px_-14px_rgba(15,23,42,.35)]",
      "dark:shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_10px_30px_-14px_rgba(0,0,0,.6)]",
      "p-3 sm:p-5", className)}>
      <header className="flex items-center gap-3 mb-4 pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl font-bold ring-1",
          GROUP_HUE[letter] || "bg-primary/15 text-primary ring-primary/30")}>
          {letter || <Trophy className="size-4" />}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="text-muted-foreground text-xs mt-0.5">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

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
    <GlassStage className="grid gap-4 md:grid-cols-2">
      {Object.entries(groups).filter(([name]) => name !== "-").map(([groupName, table]) => (
        <GlassPanel key={groupName} letter={groupName} title={`Group ${groupName}`}
          subtitle={`${table.length} team${table.length === 1 ? "" : "s"}`}>
          <div className="overflow-x-auto scrollbar-thin rounded-lg border bg-card/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/70 text-muted-foreground text-left">
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
        </GlassPanel>
      ))}
    </GlassStage>
  );
}

function MatchesView({ tournamentId }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  // Same as the Schedule section: one collapsible card per round, a fully
  // played round starts closed so it doesn't bury the rounds still to play.
  const [openRounds, setOpenRounds] = useState({});

  useEffect(() => {
    let alive = true;
    api(`/api/tournaments/${tournamentId}/matches`)
      .then((d) => { if (alive) setMatches((d.matches || []).filter((m) => m.bracket === "group")); })
      .catch(() => { if (alive) setMatches([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tournamentId]);


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
  const rounds = [...new Set(group.map((m) => m.round))].sort((a, b) => a - b);
  const sections = [
    ...rounds.map((r) => ({ key: `r-${r}`, label: `Round ${r}`, list: group.filter((m) => m.round === r) })),
    ...(playoff.length > 0 ? [{ key: "playoff", label: "Tiebreaker playoff", list: playoff }] : []),
  ];

  const Row = ({ m }) => {
    const done = ["completed", "forfeited"].includes(m.status);
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
        <span className="w-16 shrink-0 flex justify-end">
          {done && m.mvp && <MvpBadge mvp={m.mvp} tone="admin" />}
        </span>
      </div>
    );
  };

  return (
    <div className="mt-6">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="font-medium text-sm">Group matches</h3>
        <span className="text-muted-foreground text-xs">
          scored by the organizer · {group.filter((m) => ["completed", "forfeited"].includes(m.status)).length}/{group.length} played
        </span>
      </div>
      <div className="space-y-3">
        {sections.map(({ key, label, list }) => {
          const played = list.filter((m) => ["completed", "forfeited"].includes(m.status)).length;
          const allPlayed = played === list.length;
          const open = openRounds[key] ?? !allPlayed;
          return (
            <Card key={key} className="p-0 gap-0 overflow-hidden">
              <button onClick={() => setOpenRounds({ ...openRounds, [key]: !open })}
                aria-expanded={open}
                className={cn("flex items-center gap-2 w-full text-left bg-muted/60 px-4 py-3 hover:bg-muted", open && "border-b")}>
                {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                <h4 className="font-medium text-sm">{label}</h4>
                <span className="text-muted-foreground text-xs">
                  {list.length} match{list.length === 1 ? "" : "es"} · {allPlayed ? "all played" : `${played}/${list.length} played`}
                </span>
              </button>
              {open && <div className="space-y-2 p-3">{list.map((m) => <Row key={m._id} m={m} />)}</div>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time. toISOString() would
// convert to UTC and shift the clock by 8 hours.
// "6-7" / "4": how many teams each group gets when n teams are spread over g groups.
function groupSizes(n, g) {
  const lo = Math.floor(n / g), hi = Math.ceil(n / g);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

function asInput(d) {
  if (!d) return "";
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

// The league's venues, and which one each sport plays at (Super Admin, Oct 31 2026).
// A match with no venue saved yet starts on its sport's venue.
const VENUES = ["KCC Gym", "Munisipyo 2nd Floor", "Volleyball Court", "Badminton Court", "Poblacion Brgy Hall", "Billiards Area"];
const VENUE_BY_SPORT = {
  basketball: "KCC Gym",
  pickleball: "KCC Gym",
  "mobile legends": "Munisipyo 2nd Floor",
  volleyball: "Volleyball Court",
  badminton: "Badminton Court",
  chess: "Poblacion Brgy Hall",
  billiards: "Billiards Area",
};
const NO_VENUE = "__none";
const venueForSport = (name) => VENUE_BY_SPORT[(name || "").trim().toLowerCase()] || "";

// One match's date / venue / Save. Its unsaved values live HERE, not in the
// section: kept in the section, every keystroke re-rendered every row and its
// date picker (measured 160-450ms per letter on a 150-match Mobile Legends
// group stage, 4x CPU throttle).
// "HH:mm" one hour after a "YYYY-MM-DDTHH:mm" start, capped at 11:59 PM (a game ends the same day).
function hourAfter(start) {
  const [h, mm] = start.slice(11, 16).split(":").map(Number);
  const t = Math.min(h * 60 + mm + 60, 23 * 60 + 59);
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}

const ScheduleRow = memo(function ScheduleRow({ m, busy, onSave, defaultVenue, ended }) {
  const savedSchedule = asInput(m.schedule);
  const savedEnd = m.scheduleEnd ? asInput(m.scheduleEnd).slice(11, 16) : "";
  const savedVenue = m.venue || "";
  const startVenue = savedVenue || defaultVenue;
  const [schedule, setSchedule] = useState(savedSchedule);
  const [endTime, setEndTime] = useState(savedEnd);
  const [venue, setVenue] = useState(startVenue);
  const done = m.status === "completed" || m.status === "forfeited";
  // Start + END time (Nov 2026): two games of a sport can't overlap. "T00:00" = a date with no time.
  const hasTime = !!schedule && !schedule.endsWith("T00:00");
  function changeStart(v) {
    setSchedule(v);
    const timed = !!v && !v.endsWith("T00:00");
    if (!timed) setEndTime("");
    else if (!endTime || endTime <= v.slice(11, 16)) setEndTime(hourAfter(v));   // suggest one hour
  }
  const endBad = hasTime && (!endTime || endTime <= schedule.slice(11, 16));
  // The sport's venue filled in on its own isn't an edit; it's saved with the date.
  const dirty = schedule !== savedSchedule || (hasTime && endTime !== savedEnd) || venue !== startVenue;
  // A venue typed in before the dropdown existed stays selectable.
  const options = savedVenue && !VENUES.includes(savedVenue) ? [...VENUES, savedVenue] : VENUES;

  return (
    <div className={cn("px-4 py-2.5", done && "bg-muted/30")}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted-foreground text-xs w-16 shrink-0">
          {m.group ? `Grp ${m.group}` : m.bracket}
        </span>
        <span className="flex-1 min-w-0 sm:min-w-[12rem] truncate text-sm">
          {m.teamA?.teamName || "TBD"}
          <span className="text-muted-foreground"> vs </span>
          {m.teamB?.teamName || "TBD"}
        </span>

        {done || ended ? (
          <span className="text-muted-foreground text-xs">
            {m.status === "forfeited" ? "forfeited" : done ? "played" : "not played"}
          </span>
        ) : (
          <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto xl:flex-nowrap">
            <DateTimePicker value={schedule} onChange={changeStart} className="sm:shrink-0" />
            {hasTime && (
              <div className={cn("flex w-full items-center gap-2 sm:w-72", endBad && "[&_select]:border-red-500")} title="When the game is expected to end">
                <span className="shrink-0 text-xs text-muted-foreground">Ends</span>
                <TimeSelect time={endTime} onChange={setEndTime} />
              </div>
            )}
            <Select value={venue || NO_VENUE} onValueChange={(v) => setVenue(v === NO_VENUE ? "" : v)}>
              <SelectTrigger className="text-xs flex-1 min-w-0 sm:flex-none sm:w-44" aria-label="Venue">
                <SelectValue placeholder="Venue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VENUE}>No venue</SelectItem>
                {options.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => onSave(m, schedule, venue, hasTime ? `${schedule.slice(0, 10)}T${endTime}` : null)}
              disabled={busy || !dirty || endBad} title={endBad ? "The end time must be after the start time" : undefined} className="shrink-0">
              Save
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});

function ScheduleSection({ tournamentId, sportName, ended }) {
  const showError = useErrorDialog();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openRounds, setOpenRounds] = useState({});

  async function load() {
    setLoading(true);
    try {
      const data = await api(`/api/tournaments/${tournamentId}/matches`);
      setMatches(data.matches || []);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tournamentId]);

  // Saved explicitly rather than on every keystroke — typing a venue would
  // otherwise fire a request per character. The row owns its unsaved values
  // (see ScheduleRow) and hands them over here.
  async function saveOne(m, schedule, venue, scheduleEnd) {
    setBusy(true);
    try {
      await api(`/api/tournaments/matches/${m._id}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({ schedule: schedule || null, scheduleEnd: scheduleEnd || null, venue }),
      });
      await load();
    } catch (e) { showError(e.message); }
    finally { setBusy(false); }
  }
  // Stable across renders, so the memoised rows don't all re-render.
  const saveRef = useRef(saveOne);
  useLayoutEffect(() => { saveRef.current = saveOne; });
  const onSave = useCallback((...args) => saveRef.current(...args), []);

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
        Dates are guidance, not a lock. An organizer can still start an undated match,
        or one being played on a different day. Times are Philippine time.
        Set each match's date, start and end time, and venue on its own row. Two games of
        this sport (any group or division) can't overlap at the same venue; at different venues
        they can, and one may start when the other ends.
      </p>

      {loading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : matches.length === 0 ? (
        <p className="text-muted-foreground text-sm">No matches to schedule yet.</p>
      ) : (
        <div className="space-y-6">
          {sections.map((key) => {
            const inRound = matches.filter((m) => keyOf(m) === key);

            // A round where everything has been played is history — collapse it so
            // it doesn't bury the rounds still needing dates.
            const played = inRound.filter((m) => ["completed", "forfeited"].includes(m.status)).length;
            const allPlayed = played === inRound.length;
            const open = openRounds[key] ?? !allPlayed;
            return (
              <Card key={key} className="p-0 gap-0 overflow-hidden">
                <div className="bg-muted/60 px-4 py-3 border-b">
                  <button onClick={() => setOpenRounds({ ...openRounds, [key]: !open })}
                    className="flex items-baseline gap-2 w-full text-left">
                    {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                    <h4 className="font-medium text-sm">{roundLabel(inRound[0])}</h4>
                    <span className="text-muted-foreground text-xs">
                      {inRound.length} match{inRound.length === 1 ? "" : "es"} ·{" "}
                      {allPlayed ? "all played" : `${inRound.filter((m) => m.schedule).length} dated`}
                    </span>
                  </button>
                </div>
                {open && (
                  <div className="divide-y">
                    {inRound.map((m) => (
                      // Keyed on the saved values too: after a save reloads the list,
                      // a changed row remounts and starts from the new values.
                      <ScheduleRow key={`${m._id}|${m.schedule || ""}|${m.venue || ""}`}
                        m={m} busy={busy} onSave={onSave} defaultVenue={venueForSport(sportName)} ended={ended} />
                    ))}
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

// The knockout DRAW (Nov 2026, panelist: "teams should pull out the names of their opponent").
// The barangays draw lots in person; the Super Admin places each qualifier in the slot the draw
// gave it. Slot order = bracket order: Match 1 and Match 2 winners meet next, and so on. Two
// teams from the same group may meet in round 1 (the draw decides), but it's flagged here.
function roundOneName(n, i) {
  if (n === 4) return `Semifinal ${i + 1}`;
  if (n === 8) return `Quarterfinal ${i + 1}`;
  return `Round of ${n} · Match ${i + 1}`;
}

function DrawDialog({ qualifiers, busy, onClose, onSave }) {
  const n = qualifiers.length;
  const [slots, setSlots] = useState(() => Array(n).fill(""));
  const [error, setError] = useState("");
  const confirm = useConfirm();
  const byId = Object.fromEntries(qualifiers.map((q) => [q.id, q]));
  const perGroup = qualifiers.reduce((c, q) => ({ ...c, [q.group]: (c[q.group] || 0) + 1 }), {});
  const label = (q) => (perGroup[q.group] > 1
    ? `Group ${q.group} · ${q.tag.slice(q.group.length) === "1" ? "1st" : "2nd"}`
    : `Group ${q.group}`);

  const used = new Set(slots.filter(Boolean));
  const unplaced = qualifiers.filter((q) => !used.has(q.id));
  const pairs = Array.from({ length: n / 2 }, (_, i) => [slots[i * 2], slots[i * 2 + 1]]);
  const rematches = pairs
    .map(([a, b], i) => (a && b && byId[a].group === byId[b].group ? { i, group: byId[a].group } : null))
    .filter(Boolean);
  const set = (i, id) => { setError(""); setSlots((s) => s.map((v, k) => (k === i ? id : v))); };

  async function save() {
    const ok = await confirm(
      "Save this draw? The knockout bracket is built from it and the pairings can't be changed afterwards " +
      "(only by deleting the tournament).",
      { confirmLabel: "Save the draw" }
    );
    if (!ok) return;
    try {
      await onSave(slots);
    } catch (e) {
      setError(e.message);
    }
  }

  const slot = (i) => (
    <div key={i} className="flex items-center gap-1.5 min-w-0">
      <Select value={slots[i] || ""} onValueChange={(v) => set(i, v)}>
        <SelectTrigger className="flex-1 min-w-0" aria-label={`Slot ${i + 1}`}>
          <SelectValue placeholder="Pick the drawn team" />
        </SelectTrigger>
        <SelectContent position="popper">
          {qualifiers.map((q) => (
            <SelectItem key={q.id} value={q.id} disabled={used.has(q.id) && slots[i] !== q.id}>
              <span className="truncate">{q.name}</span>
              <span className="text-muted-foreground text-xs">{label(q)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {slots[i] && (
        <Button type="button" size="sm" variant="ghost" onClick={() => set(i, "")} aria-label="Clear this slot">
          ✕
        </Button>
      )}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Knockout draw · Top {n}</DialogTitle>
          <DialogDescription>
            Place each team where the barangays' draw put it. The winners of Match 1 and Match 2 meet in the
            next round, then Match 3 and 4, and so on.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-3">
          {pairs.map((_, i) => {
            const clash = rematches.find((r) => r.i === i);
            return (
              <div key={i} className={cn("rounded-lg border p-3", clash && "border-amber-500/60 bg-amber-500/5")}>
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold">{roundOneName(n, i)}</span>
                  {clash && (
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      Both from Group {clash.group}
                    </span>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  {slot(i * 2)}
                  <span className="text-muted-foreground text-xs font-semibold text-center">VS</span>
                  {slot(i * 2 + 1)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2 pt-2 text-sm">
          {unplaced.length > 0 ? (
            <p className="text-muted-foreground">
              Still to place ({unplaced.length}): {unplaced.map((q) => q.name).join(", ")}
            </p>
          ) : (
            <p className="text-green-600 dark:text-green-400">Every team is placed.</p>
          )}
          {rematches.length > 0 && (
            <p className="text-amber-600 dark:text-amber-400">
              {rematches.length === 1 ? "One first-round match is" : `${rematches.length} first-round matches are`} between
              teams from the same group. That's allowed if the draw came out that way; check it before saving.
            </p>
          )}
          {error && (
            <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || unplaced.length > 0}>
            {busy ? "Saving…" : "Save the draw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TournamentDetail({ tournamentId, sportName, stage, isML, onBracketGenerated, ended }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [qualification, setQualification] = useState(null);  // ML tiebreaker UI
  const [readiness, setReadiness] = useState(null);          // who actually qualified
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The public bracket endpoint is the single source of truth for who has
  // qualified: it accounts for tiebreaker playoffs (ML) and for upper/lower
  // bracket winners (physical sports). Table POSITION is not enough — a playoff
  // can send a team through from below the cutoff line.
  const confirm = useConfirm();

  async function fetchReadiness() {
    const d = await api(`/api/public/bracket?tournament=${tournamentId}`);
    const groups = [...new Set((d.matches || []).filter((m) => m.group).map((m) => m.group))];
    const qual = d.qualification || {};
    const seeds = d.qualifiers || {};
    const nameOf = {};
    (d.matches || []).forEach((m) => [m.teamA, m.teamB].forEach((t) => { if (t) nameOf[String(t.id)] = t.name; }));
    const tagOf = (id, g, i) => ({ id: String(id), name: nameOf[String(id)] || "?", group: g, tag: `${g}${i}` });

    if (isML) {
      const contested = groups.filter((g) => (qual[g]?.contested || []).length > 0);
      const ids = groups.flatMap((g) => qual[g]?.clear || []);
      const advance = d.tournament?.advancePerGroup || 1;
      const qualifiers = groups.flatMap((g) => (qual[g]?.clear || []).map((id, i) => tagOf(id, g, i + 1)));
      return {
        groups, contested, ids, qualifiers,
        ready: contested.length === 0 && ids.length === groups.length * advance,
        expected: groups.length * advance,
      };
    }
    const short = groups.filter((g) => (seeds[g] || []).length < 2);
    const ids = groups.flatMap((g) => (seeds[g] || []).map((s) => s.teamId));
    const qualifiers = groups.flatMap((g) => (seeds[g] || []).map((s) => tagOf(s.teamId, g, s.seed)));
    return {
      groups, contested: [], ids, short, qualifiers,
      ready: short.length === 0 && groups.length > 0,
      expected: groups.length * 2,
    };
  }

  async function loadReadiness() {
    try {
      setReadiness(await fetchReadiness());
    } catch {
      setReadiness(null);
    }
  }

  // Testing aid: plays every ready match with a random result, then draws the
  // tiebreakers / knockout when they're due, and keeps going to the champion.
  // Uses the same routes as the buttons below, one step at a time.
  async function autoplayAll() {
    const ok = await confirm(
      "Fill every unplayed match in this tournament with a random result, all the way to the champion? " +
      "This is for testing. Results show on the public site and can't be undone (delete the tournament to start over).",
      { confirmLabel: "Auto-play" }
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    let played = 0;
    let koDrawn = stage === "elimination" || stage === "completed";
    try {
      for (let step = 0; step < 8; step++) {
        const r = await api(`/api/tournaments/${tournamentId}/autoplay`, { method: "POST" });
        played += r.played;
        if (r.stage === "completed") break;
        if (koDrawn) { if (r.played === 0) break; continue; }

        const rd = await fetchReadiness();
        if (isML && !rd.ready) {
          const q = await api(`/api/tournaments/${tournamentId}/qualification`);
          const needsTie = Object.values(q.groups || {}).some((g) => g.needsTiebreaker);
          if (needsTie) { await api(`/api/tournaments/${tournamentId}/tiebreakers`, { method: "POST" }); continue; }
        }
        if (!rd.ready) { if (r.played === 0) break; continue; }

        // Testing only: a random placement stands in for the barangays' draw.
        const slots = [...rd.ids].sort(() => Math.random() - 0.5);
        await api(`/api/tournaments/${tournamentId}/${isML ? "bracket" : "de-bracket"}`, { method: "POST", body: JSON.stringify({ slots }) });
        koDrawn = true;
      }
      await confirm(`Auto-play finished: ${played} match${played === 1 ? "" : "es"} played.`, { alertOnly: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setRefreshKey((k) => k + 1);
      onBracketGenerated && onBracketGenerated();
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

  // The knockout is DRAWN by the barangays in person (Nov 2026, panelist's suggestion); the Super
  // Admin places each qualifier where the draw put it (DrawDialog). The server checks the placement.
  const [drawOpen, setDrawOpen] = useState(false);
  async function saveDraw(slots) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/tournaments/${tournamentId}/${isML ? "bracket" : "de-bracket"}`, {
        method: "POST",
        body: JSON.stringify({ slots }),
      });
      setDrawOpen(false);
      onBracketGenerated && onBracketGenerated();
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
      {stage !== "completed" && !ended && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <span className="text-muted-foreground text-xs">Testing: skip the organizers</span>
          <Button size="sm" variant="outline" onClick={autoplayAll} disabled={busy}>
            <Zap /> {busy ? "Playing…" : "Auto-play to the champion"}
          </Button>
        </div>
      )}
      {stage === "elimination" || stage === "completed" ? (
        <BracketView tournamentId={tournamentId} key={`k-${refreshKey}`} />
      ) : (
        <>
          {isML ? (
            <>
              <StandingsView tournamentId={tournamentId} key={`s-${refreshKey}`} />
              <MatchesView tournamentId={tournamentId} key={`m-${refreshKey}`}
                onScored={() => setRefreshKey((k) => k + 1)} />
            </>
          ) : (
            <BracketView tournamentId={tournamentId} key={`b-${refreshKey}`} />
          )}

          {!ended && (isML ? groupsComplete : readiness) && (
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
                    {readiness.ids.length} teams qualified. Hold the draw with the barangays, then place each
                    team where the draw put it.
                  </p>
                  <ErrorBox />
                  <Button onClick={() => setDrawOpen(true)} disabled={busy}>
                    Enter the knockout draw ({readiness.ids.length} teams)
                  </Button>
                  {drawOpen && (
                    <DrawDialog qualifiers={readiness.qualifiers || []} busy={busy}
                      onClose={() => setDrawOpen(false)} onSave={saveDraw} />
                  )}
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
      <ScheduleSection tournamentId={tournamentId} sportName={sportName} ended={ended} />
    </div>
  );
}

// Read-only. Scoring belongs to the organizer's courtside screen — an admin
// entering a score here would bypass PlayerMatchStats and the period record.
// Kept as a plain <div ref={innerRef}> (not a shadcn Card) — BracketTree
// measures this exact DOM node with getBoundingClientRect() to draw the SVG
// connector wires, and Card doesn't forward refs.
function MatchBox({ m, innerRef }) {
  const done = ["completed", "forfeited"].includes(m.status);
  const live = m.status === "ongoing";
  const winnerId = String(m.seriesWinner?._id || m.seriesWinner || "");
  const aId = String(m.teamA?._id || m.teamA || "");
  const bId = String(m.teamB?._id || m.teamB || "");
  const aWin = done && winnerId === aId;
  const bWin = done && winnerId === bId;

  const total = (side) => (m.games || []).reduce((n, g) => n + (g[side] || 0), 0);
  const aScore = m.liveScoreA || total("scoreA");
  const bScore = m.liveScoreB || total("scoreB");

  // A forfeit is recorded 1–0; the tag on the no-show team says why.
  const forfeit = m.status === "forfeited";
  // Finished match: winner's row green, loser's row red.
  const decided = done && !!winnerId;
  const Side = ({ name, score, won }) => {
    const lost = decided && !won && !!name;
    return (
    <div className={cn("flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2",
      decided && won && "bg-green-500/10 shadow-[inset_3px_0_0_var(--color-green-500)]",
      lost && "bg-red-500/10 shadow-[inset_3px_0_0_var(--color-red-500)]")}>
      <span className={cn("flex-1 min-w-0 truncate",
        won ? "font-semibold" : lost ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
        {name || "TBD"}
      </span>
      {forfeit && !won && (
        <span className="shrink-0 rounded px-1 sm:px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-red-500/15 text-red-600 dark:text-red-400">
          Forfeited
        </span>
      )}
      {(done || live) && (
        <span className={cn("font-medium w-6 text-center tabular-nums",
          won && decided && "text-green-600 dark:text-green-400", lost && "text-red-600 dark:text-red-400")}>
          {score}
        </span>
      )}
    </div>
    );
  };

  return (
    <div ref={innerRef}
      className={cn("border rounded-lg overflow-hidden text-[13px] sm:text-sm w-42 sm:w-56 shrink-0 bg-card", live ? "border-red-500/40" : "border-border")}>
      <Side name={m.teamA?.teamName} score={aScore} won={aWin} />
      <div className="border-t" />
      <Side name={m.teamB?.teamName} score={bScore} won={bWin} />
      {/* The organizer's MVP pick: hover / tap for the player. */}
      {done && m.mvp && (
        <div className="flex items-center px-2.5 sm:px-3 py-1 border-t">
          <MvpBadge mvp={m.mvp} tone="admin" />
        </div>
      )}
      {live && (
        <div className="px-2.5 sm:px-3 py-0.5 sm:py-1 bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-semibold">
          ● LIVE
        </div>
      )}
    </div>
  );
}

// The last match of a bracket has nothing to its right, so the tree just stops
// and nobody can see what winning it earned. This card says so.
// Medal icon for a finished place (files in public/medals). Greyed until decided.
function PlaceIcon({ src, done }) {
  return (
    <img src={src} alt="" aria-hidden="true" loading="lazy" decoding="async"
      className={cn("size-7 sm:size-8 shrink-0 object-contain", !done && "opacity-30 grayscale")} />
  );
}

// Bronze for the 3rd-place card; everything else keeps the green "decided" look.
const CARD_TONE = {
  green: { box: "border-green-500/40 bg-green-500/5", text: "text-green-600 dark:text-green-400" },
  bronze: { box: "border-[#CD7F32]/50 bg-[#CD7F32]/10", text: "text-[#A0522D] dark:text-[#E0975A]" },
};

function WinnerCard({ match, label, sublabel, bothQualify, icon, tone = "green" }) {
  const done = match && ["completed", "forfeited"].includes(match.status) && match.seriesWinner;
  const winnerId = done ? String(match.seriesWinner._id || match.seriesWinner) : null;
  const sides = [match?.teamA, match?.teamB];
  const winner = done ? sides.find((t) => t && String(t._id) === winnerId) : null;
  const loser = done ? sides.find((t) => t && String(t._id) !== winnerId) : null;
  const c = CARD_TONE[tone];

  return (
    <div className={cn(
      "w-42 sm:w-52 shrink-0 rounded-lg border px-2.5 sm:px-3 py-2 sm:py-2.5 flex items-center gap-2.5",
      done ? c.box : "border-dashed bg-card"
    )}>
      {icon && <PlaceIcon src={icon} done={!!done} />}
      <div className="min-w-0 flex-1">
      <p className={cn("text-[10px] uppercase tracking-wide", done ? c.text : "text-muted-foreground")}>
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
    </div>
  );
}

// The Grand Final's loser finishes 2nd. Its own box, hung under the final.
function SecondPlaceCard({ match }) {
  const done = match && ["completed", "forfeited"].includes(match.status) && match.seriesWinner;
  const winnerId = done ? String(match.seriesWinner._id || match.seriesWinner) : null;
  const loser = done ? [match.teamA, match.teamB].find((t) => t && String(t._id) !== winnerId) : null;
  return (
    <div className={cn(
      "w-42 sm:w-56 shrink-0 rounded-lg border px-2.5 sm:px-3 py-2 sm:py-2.5 flex items-center gap-2.5",
      done ? "border-slate-400/50 bg-slate-500/5" : "border-dashed bg-card"
    )}>
      <PlaceIcon src="/medals/2nd-place.png" done={!!done} />
      <div className="min-w-0 flex-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">2nd place</p>
      <p className={cn("text-sm mt-0.5 truncate", done ? "font-medium" : "text-muted-foreground")}>
        {loser?.teamName || "TBD"}
      </p>
      </div>
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
function BracketTree({ title, matches, labelFor, winner, runnerUp }) {
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
        // done: the match this wire leaves has a result, so the winner has travelled it.
        ws.push({ d: `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`, done: ["completed", "forfeited"].includes(m.status) });
      });
      setWires(ws);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [matches]);

  if (matches.length === 0) return null;
  const grandFinal = runnerUp ? finalOf(matches) : null;

  return (
    <div className="mb-6">
      {title && <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-2">{title}</p>}
      <div ref={dragRef} className="overflow-x-auto scrollbar-thin pb-4 cursor-grab">
        <div ref={stageRef} className={cn("relative flex gap-5 sm:gap-10 min-w-min", grandFinal && rounds.length < 3 && "pb-24")}>
          <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible", pointerEvents: "none" }}>
            {/* Played wires glow in the brand green (Oct 2026), the rest stay plain. */}
            {wires.filter((w) => !w.done).map((w, i) => <path key={"p" + i} d={w.d} className="stroke-border" strokeWidth="2" fill="none" />)}
            {wires.filter((w) => w.done).map((w, i) => (
              <path key={"g" + i} d={w.d} className="stroke-primary" strokeWidth="2.5" fill="none" strokeLinejoin="round"
                style={{ filter: "drop-shadow(0 0 4px color-mix(in oklab, var(--primary) 75%, transparent)) drop-shadow(0 0 9px color-mix(in oklab, var(--primary) 40%, transparent))" }} />
            ))}
          </svg>
          {rounds.map((r, i) => (
            <div key={r} className="relative z-10 flex flex-col">
              <p className="text-muted-foreground text-xs font-medium mb-2 whitespace-nowrap">{labelFor(r, i, rounds.length)}</p>
              <div className="flex-1 flex flex-col justify-around gap-2 sm:gap-3">
                {matches.filter((m) => m.round === r).map((m) =>
                  grandFinal && m._id === grandFinal._id ? (
                    // Absolutely placed so the final keeps its centred spot and the wires don't move.
                    <div key={m._id} className="relative">
                      <MatchBox m={m}
                        innerRef={(el) => (boxRefs.current[m._id] = el)} />
                      <div className="absolute left-0 top-full mt-3">
                        <SecondPlaceCard match={m} />
                      </div>
                    </div>
                  ) : (
                    <MatchBox key={m._id} m={m}
                      innerRef={(el) => (boxRefs.current[m._id] = el)} />
                  )
                )}
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
    <GlassStage className="space-y-5">
      {koMain.length > 0 && (
        <GlassPanel title="Knockout" subtitle="Single elimination · winners advance, semifinal losers play for 3rd">
          <BracketTree matches={koMain} labelFor={koLabel}
            winner={{ match: finalOf(koMain), label: "Champion", sublabel: null, icon: "/medals/trophy.png" }} runnerUp />
          {koThird && (
            <div>
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-2">Third place</p>
              <div className="flex items-center gap-5 sm:gap-10 overflow-x-auto scrollbar-thin pb-2">
                <MatchBox m={koThird} innerRef={() => {}} />
                <WinnerCard match={koThird} label="Third place" sublabel={null}
                  icon="/medals/3rd-place.png" tone="bronze" />
              </div>
            </div>
          )}
        </GlassPanel>
      )}

      {groups.map((g) => {
        const w = grouped.filter((m) => m.group === g && m.bracket === "winners");
        const l = grouped.filter((m) => m.group === g && m.bracket === "losers");
        // A round-robin group has no winners/losers tree to draw here.
        if (w.length === 0 && l.length === 0) return null;
        return (
          <GlassPanel key={g} letter={g} title={`Group ${g}`} subtitle="Double elimination · top 2 qualify">
            <BracketTree title="Winners" matches={w} labelFor={(r) => `Round ${r}`}
              winner={w.length > 0 ? {
                match: finalOf(w),
                label: "Winner",
                sublabel: l.length === 0 ? "Both teams qualify" : "Qualifies as seed 1",
                bothQualify: l.length === 0,
              } : null} />
            <BracketTree title="Losers" matches={l} labelFor={(r, i) => `Round ${i + 1}`}
              winner={l.length > 0 ? {
                match: finalOf(l),
                label: "Winner",
                sublabel: "Qualifies as seed 2",
              } : null} />
          </GlassPanel>
        );
      })}
    </GlassStage>
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
      `permanently. Its teams are not deleted, they just become free (and, if orphaned themselves, ` +
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
          Left behind by a deleted season. This is why their teams can't be deleted below
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
        `Deleted ${deleted} of ${inDivision.length} team(s). ${failed} couldn't be removed, ` +
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
          These teams' season was deleted without them, so they're left over pointing at nothing.
          That's what's blocking this sport (or its barangay) from being deleted. Delete one that's
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
  // The draw is chosen per game in League Setup (Nov 2026): format, number of groups, knockout.
  // The server sends what is in effect as `draw` (lib/sportRules.js drawOf).
  const draw = selectedSport?.draw || null;

  const divisions = selectedSport?.divisions?.length ? selectedSport.divisions : ["open"];
  const activeDivision = divisions.includes(division) ? division : divisions[0];

  // A sport can run several tournaments in one season — one per division. Match
  // on BOTH, or basketball u30 sits unreachable behind u17.
  const currentTournament = tournaments.find(
    (t) =>
      t.sport && (t.sport._id === selectedSport?._id || t.sport === selectedSport?._id) &&
      (t.division || "open") === activeDivision
  );

  // Generating needs an ONGOING season (the server refuses otherwise).
  const { season } = useSeason();
  const canGenerate = season?.status === "ongoing";

  // Verified teams in this division this season, for the draw preview before Generate.
  const [verifiedCount, setVerifiedCount] = useState(null);
  useEffect(() => {
    if (!selectedSport?._id || !season?._id) return;
    let alive = true;
    setVerifiedCount(null);
    api(`/api/teams?sportId=${selectedSport._id}`)
      .then((d) => {
        if (!alive) return;
        const list = (d.teams || []).filter((t) => String(t.season?._id || t.season) === String(season._id)
          && t.status === "verified" && (t.division || "open") === activeDivision);
        setVerifiedCount(list.length);
      })
      .catch(() => { if (alive) setVerifiedCount(null); });
    return () => { alive = false; };
  }, [selectedSport?._id, season?._id, activeDivision, tournaments.length]);
  const tooFew = draw && verifiedCount != null && verifiedCount < draw.minTeams;
  const seasonLabel = SEASON_STAGES.find((st) => st.key === season?.status)?.label;

  async function generate() {
    if (!selectedSport) return;
    setBusy(true);
    setError("");
    try {
      const body = { sportId: selectedSport._id, division: activeDivision };
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
      completedCount = (d.matches || []).filter((m) => ["completed", "forfeited"].includes(m.status)).length;
    } catch { /* best-effort — fall back to the generic message below */ }

    const ok = await confirm(
      completedCount > 0
        ? `Delete this ${selectedSport.name} tournament? ${completedCount} match(es) have ALREADY BEEN ` +
          `PLAYED with real scores. Those results, every player stat, and the whole bracket are discarded ` +
          `permanently. Teams themselves are not deleted.`
        : `Delete this ${selectedSport.name} tournament? Every match, score, and player stat in it is ` +
          `discarded permanently. Teams themselves are not deleted. They're free to enter a new tournament.`,
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
    <AdminLayout title={selectedSport?.name || "Tournaments"} menu={superAdminMenu} enableDarkMode
      subtitle="Brackets, standings and the match schedule for this sport.">
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
                    verified teams.
                  </p>

                  {/* The draw comes from League Setup (Nov 2026): format, groups, knockout. */}
                  {draw && (
                    <div className="mb-4 rounded-xl border p-4 space-y-1.5">
                      <p className="text-sm">
                        <span className="font-semibold">
                          {draw.format === "round_robin" ? "Round-robin groups" : "Double elimination in groups"}
                        </span>
                        {" · "}{draw.groups} groups{" · "}Top {draw.knockout} knockout
                        {draw.format === "round_robin" && ` (${draw.advancePerGroup} from each group)`}
                      </p>
                      {verifiedCount != null && (
                        tooFew ? (
                          <p className="text-sm text-amber-600 dark:text-amber-400">
                            {verifiedCount} verified team{verifiedCount === 1 ? "" : "s"}. This draw needs at least {draw.minTeams}
                            {" "}({draw.format === "round_robin" ? draw.advancePerGroup + 1 : 3} per group). Pick fewer groups in League Setup, or verify more teams.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {verifiedCount} verified teams → {draw.groups} groups of {groupSizes(verifiedCount, draw.groups)} → Top {draw.knockout}
                          </p>
                        )
                      )}
                      <p className="text-muted-foreground text-xs">
                        Change the draw format or the number of groups in{" "}
                        <Link to="/admin/config" className="underline underline-offset-2">League Setup</Link>.
                      </p>
                    </div>
                  )}

                  {season && !canGenerate && (
                    <Alert className="mb-4">
                      <AlertDescription>
                        Tournaments can be generated once the season is Ongoing (it is in{" "}
                        {seasonLabel || season.status} now). Finish verification, then move the season on from the{" "}
                        <Link to="/admin/season" className="underline underline-offset-2">Season page</Link>.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button onClick={generate} disabled={busy || !canGenerate || tooFew}>
                    {busy ? "Generating…" : `Generate ${selectedSport.name} Tournament`}
                  </Button>
                </div>
              ) : (
                <TournamentDetail
                  key={currentTournament._id}
                  tournamentId={currentTournament._id}
                  stage={currentTournament.stage}
                  isML={currentTournament.format === "round_robin"}
                  sportName={selectedSport.name}
                  ended={season?.status === "completed"}
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
