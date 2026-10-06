import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowLeftRight, CalendarClock, Circle, CircleCheck, ClipboardList, ListChecks, Play, Radio, TriangleAlert, Undo2, X } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { organizerMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";
import { hasTime } from "../../lib/dashboardFormat";

const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls",
  under15: "U15", under30: "U30",
};

const BRACKET_LABEL = {
  winners: "Winners bracket",
  losers: "Losers bracket",
  final: "Grand final",
  third: "Third place",
  ko_third: "Third place",
};


const TONE_BADGE = {
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  accent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

// The organizer picks a match out of a list at courtside, often in a hurry.
// Raw enum values ("winners · round 101 · group A") are database fields, not
// something a game official should have to decode.
function describeMatch(m, all = []) {
  if (m.isTiebreaker) {
    return {
      group: m.group ? `Group ${m.group}` : null,
      stage: m.round >= 101 ? "Tiebreaker decider" : "Tiebreaker playoff",
      note: "Winner takes the last qualifying spot",
      tone: "warn",
    };
  }

  if (!m.group) {
    const inRound = all.filter(
      (x) => !x.group && !x.isTiebreaker && x.round === m.round &&
        !String(x.bracket || "").includes("third")
    ).length;
    if (String(m.bracket || "").includes("third")) {
      return { group: null, stage: "Third place", note: null, tone: "plain" };
    }
    const stage = inRound === 1 ? "Final"
      : inRound === 2 ? "Semifinal"
      : inRound === 4 ? "Quarterfinal"
      : inRound ? `Round of ${inRound * 2}` : "Knockout";
    const note = inRound === 2 ? "Winner reaches the final"
      : inRound === 4 ? "Winner reaches the semifinal"
      : null;
    return { group: null, stage, note, tone: "plain" };
  }

  return {
    group: `Group ${m.group}`,
    stage: `${BRACKET_LABEL[m.bracket] || "Group stage"}, Round ${m.round}`,
    note: null,
    tone: "accent",
  };
}

// A schedule picked as a DATE only has no time of day, and must not show one — see
// hasTime() (the one shared rule; this used to keep its own copy).
const timeOf = (d) =>
  d && hasTime(d)
    ? new Date(d).toLocaleTimeString([], { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })
    : null;

const dateOf = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, {
    timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric",
  }) : "No date set";

function Crest({ team, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const name = team?.teamName || "";
  const id = team?.barangay ? String(team.barangay) : null;

  if (id && !failed) {
    return (
      <img src={`/api/barangays/${id}/logo`} alt="" onError={() => setFailed(true)}
        className="rounded-lg object-cover bg-muted shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-lg bg-muted text-muted-foreground font-semibold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.32 }}>
      {name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "—"}
    </div>
  );
}

// The POST-MATCH score sheet. Live scoring is by team only; a player's stats come from here,
// entered by the organizer once the game is over. Which columns it has is the Super Admin's
// choice per sport in League Setup (points, fouls, rebounds, blocks…, or the role played for
// esports) and arrives as `data.statFields` / `data.roles`. It also picks the MVP. Blank = 0;
// a player left completely blank is recorded as "didn't play".
// Oct 2026: shown in a MODAL (StatsDialog below), not inline under the scoreboard.
// It opens by itself right after End match and can be reopened from the
// "Player stats" card. This component is the modal's content; its state starts
// fresh from the saved stats each time the modal opens.
function StatsForm({ data, matchId, onSaved, onClose, onDirtyChange }) {
  const showError = useErrorDialog();
  const m = data.match;
  const fields = data.statFields || [];
  const roles = data.roles || [];

  const [side, setSide] = useState("A");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [mvp, setMvp] = useState(m.mvp?._id ? String(m.mvp._id) : "none");
  const [rows, setRows] = useState(() => {
    const init = {};
    [...(data.rosterA || []), ...(data.rosterB || [])].forEach((p) => {
      const s = data.statByPlayer?.[String(p._id)] || {};
      init[String(p._id)] = {
        ...Object.fromEntries(fields.map((f) => [f, s[f] || ""])),
        role: s.role || "",
      };
    });
    return init;
  });

  const rosterOf = (s) => [...(s === "A" ? data.rosterA || [] : data.rosterB || [])]
    .sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999));
  const roster = rosterOf(side);
  const teamOf = (s) => (s === "A" ? m.teamA : m.teamB);
  const teamScore = side === "A" ? m.liveScoreA : m.liveScoreB;
  const enteredPoints = roster.reduce((n, p) => n + (Number(rows[String(p._id)]?.points) || 0), 0);
  const diff = teamScore - enteredPoints;

  // Unsaved edits — the modal asks before throwing them away.
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const setField = (id, key, value) => {
    setSavedAt(null);
    setDirty(true);
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  // Player points can't add up to more than the team scored (Oct 2026; the server
  // refuses it too). Only where the team score IS a points total — a games-won
  // sport (chess, billiards, esports) keeps its score as games. A number that
  // would go over is lowered to what is left, with a note saying why.
  const capPoints = data.scoringMode !== "final" && fields.includes("points");
  const [capNote, setCapNote] = useState("");
  const setPoints = (id, raw) => {
    let v = raw.replace(/\D/g, "").slice(0, 3);
    if (capPoints && v !== "") {
      const others = roster.reduce(
        (n, p) => (String(p._id) === id ? n : n + (Number(rows[String(p._id)]?.points) || 0)), 0);
      const left = Math.max(0, (teamScore || 0) - others);
      if (Number(v) > left) {
        v = String(left);
        setCapNote(left === 0
          ? `${teamOf(side)?.teamName} scored ${teamScore || 0} and the other players already have them all, so no points are left for this player.`
          : `${teamOf(side)?.teamName} scored ${teamScore || 0}, so only ${left} point${left === 1 ? " is" : "s are"} left for this player.`);
      } else {
        setCapNote("");
      }
    }
    setField(id, "points", v);
  };

  async function save() {
    setSaving(true);
    try {
      const players = Object.entries(rows).map(([playerId, r]) => ({
        playerId,
        ...Object.fromEntries(fields.map((f) => [f, r[f] === "" ? 0 : Number(r[f])])),
        role: r.role || "",
      }));
      await api(`/api/organizer/matches/${matchId}/stats`, {
        method: "PUT",
        body: JSON.stringify({ players, mvpPlayerId: mvp === "none" ? null : mvp }),
      });
      setSavedAt(new Date());
      setDirty(false);
      onDirtyChange?.(false);
      await onSaved();
      onClose?.();
    } catch (e) { showError(e.message); }
    finally { setSaving(false); }
  }

  const everyone = [
    ...(data.rosterA || []).map((p) => ({ p, team: m.teamA?.teamName })),
    ...(data.rosterB || []).map((p) => ({ p, team: m.teamB?.teamName })),
  ];

  return (
    <>
      <DialogHeader className="border-b px-4 pt-4 pb-3 sm:px-5">
        <DialogTitle className="flex items-center gap-2">
          <ClipboardList className="size-4 text-blue-500" /> Player stats
        </DialogTitle>
        <DialogDescription>
          {fields.length > 0
            ? "Enter each player's totals from your scoresheet. Leave a player blank if they didn't play. You can come back and change these later."
            : "Pick the role each player played. Leave a player as \"No role\" if they didn't play."}
        </DialogDescription>
      </DialogHeader>

      {/* Only this middle part scrolls; the title and Save stay put. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-3 sm:px-5">
      <div className="mb-3 flex gap-2">
        {["A", "B"].map((s) => (
          <button key={s} type="button" onClick={() => { setSide(s); setCapNote(""); }}
            className={cn(
              "flex-1 truncate rounded-lg px-2 py-2.5 text-sm font-medium transition",
              side === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}>
            {teamOf(s)?.teamName}
          </button>
        ))}
      </div>

      {fields.includes("points") && (
        <p className={cn("mb-3 text-xs tabular-nums", diff === 0 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>
          Player points {enteredPoints} · team score {teamScore}
          {diff === 0 ? " · matches" : diff > 0 ? ` — ${diff} short` : ` — ${-diff} over`}
        </p>
      )}
      {capNote && (
        <p role="status" className="-mt-1.5 mb-3 flex items-start gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          <TriangleAlert className="mt-px size-3.5 shrink-0" /> {capNote}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {roster.map((p) => {
          const r = rows[String(p._id)] || {};
          return (
            <div key={p._id} className="rounded-xl border bg-card p-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold tabular-nums">
                  {p.jerseyNumber ?? "—"}
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{p.lastName}, {p.firstName}</p>
              </div>

              {fields.length > 0 && (
                <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(fields.length, 4)}, minmax(0, 1fr))` }}>
                  {fields.map((f) => (
                    <label key={f} className="block">
                      <span className="mb-0.5 block text-center text-[10px] font-medium tracking-wide text-muted-foreground">{data.statLabels?.[f]?.short || f}</span>
                      <input
                        inputMode="numeric" pattern="[0-9]*" value={r[f] ?? ""}
                        onChange={(e) => (f === "points"
                          ? setPoints(String(p._id), e.target.value)
                          : setField(String(p._id), f, e.target.value.replace(/\D/g, "").slice(0, 3)))}
                        placeholder="0"
                        className="h-11 w-full rounded-lg border bg-background text-center text-base font-semibold tabular-nums outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </label>
                  ))}
                </div>
              )}

              {roles.length > 0 && (
                <div className="mt-2">
                  <Select value={r.role || "none"} onValueChange={(v) => setField(String(p._id), "role", v === "none" ? "" : v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No role (didn't play)</SelectItem>
                      {roles.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          );
        })}
        {roster.length === 0 && <p className="text-sm text-muted-foreground">This team has no players on its roster.</p>}
      </div>

      <div className="mt-4 space-y-1.5">
        <p className="text-xs font-medium">MVP</p>
        <Select value={mvp} onValueChange={(v) => { setMvp(v); setSavedAt(null); }}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No MVP</SelectItem>
            {everyone.map(({ p, team }) => (
              <SelectItem key={p._id} value={String(p._id)}>{p.lastName}, {p.firstName} — {team}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      </div>

      <div className="border-t px-4 py-3 sm:px-5">
        <button onClick={save} disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Saving…" : "Save player stats"}
        </button>
        {savedAt && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-green-600 dark:text-green-400">
            <CircleCheck className="size-3.5" /> Saved
          </p>
        )}
      </div>
    </>
  );
}

// The score sheet modal. Closing with unsaved numbers asks first — a stray tap
// outside the sheet must not lose a whole scoresheet.
function StatsDialog({ open, onOpenChange, data, matchId, onSaved }) {
  const confirm = useConfirm();
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((d) => { dirtyRef.current = d; }, []);

  async function requestOpenChange(next) {
    if (!next && dirtyRef.current) {
      const ok = await confirm("Close without saving? The player stats you typed will be lost.", {
        danger: true, confirmLabel: "Discard",
      });
      if (!ok) return;
    }
    if (!next) dirtyRef.current = false;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {open && (
          <StatsForm data={data} matchId={matchId} onSaved={onSaved}
            onClose={() => { dirtyRef.current = false; onOpenChange(false); }}
            onDirtyChange={onDirtyChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const byJersey = (list) => [...list].sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999));
const jerseyOf = (p) => (p.jerseyNumber != null ? `#${p.jerseyNumber}` : "—");

// One tappable player row, used by the lineup and substitution modals.
function PlayerPick({ p, selected, disabled, onClick, tone = "primary" }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-40",
        selected
          ? tone === "out" ? "border-red-500 bg-red-500/10" : "border-primary bg-primary/10"
          : "hover:bg-accent"
      )}>
      <span className={cn(
        "flex h-8 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums",
        selected ? (tone === "out" ? "bg-red-600 text-white" : "bg-primary text-primary-foreground") : "bg-muted"
      )}>
        {jerseyOf(p)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.lastName}, {p.firstName}</span>
      {selected && <CircleCheck className={cn("size-4 shrink-0", tone === "out" ? "text-red-600" : "text-primary")} />}
    </button>
  );
}

// The STARTING LINEUP modal (Oct 2026): after tapping Start, the organizer picks who starts
// for each team (up to the sport's on-court count), then starts the match from here.
function LineupDialog({ open, onOpenChange, data, onStart, busy, startLabel }) {
  const m = data.match;
  const onCourt = data.onCourt;
  const rosterOf = (s) => byJersey((s === "A" ? data.rosterA : data.rosterB) || []);
  // A team whose whole roster fits on court starts with everyone already picked.
  const initial = (s) => {
    const r = rosterOf(s);
    return r.length <= onCourt ? r.map((p) => String(p._id)) : [];
  };
  const [side, setSide] = useState("A");
  const [picked, setPicked] = useState(() => ({ A: initial("A"), B: initial("B") }));
  useEffect(() => {
    if (open) { setSide("A"); setPicked({ A: initial("A"), B: initial("B") }); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setPicked((prev) => {
    const cur = prev[side];
    if (cur.includes(id)) return { ...prev, [side]: cur.filter((x) => x !== id) };
    if (cur.length >= onCourt) return prev;
    return { ...prev, [side]: [...cur, id] };
  });
  const teamOf = (s) => (s === "A" ? m.teamA : m.teamB);
  const full = (s) => picked[s].length === Math.min(onCourt, rosterOf(s).length);
  const ready = ["A", "B"].every((s) => picked[s].length > 0 || rosterOf(s).length === 0);
  const short = ["A", "B"].filter((s) => !full(s));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-4 pt-4 pb-3 sm:px-5">
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="size-4 text-blue-500" /> Starting lineup
          </DialogTitle>
          <DialogDescription>
            Pick the {onCourt} players who start for each team. You can substitute during the game.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-3 sm:px-5">
          <div className="mb-3 flex gap-2">
            {["A", "B"].map((s) => (
              <button key={s} type="button" onClick={() => setSide(s)}
                className={cn(
                  "min-w-0 flex-1 rounded-lg px-2 py-2 text-sm font-medium transition",
                  side === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}>
                <span className="block truncate">{teamOf(s)?.teamName}</span>
                <span className={cn("block text-xs tabular-nums",
                  side === s ? "text-primary-foreground/80" : full(s) ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>
                  {picked[s].length} of {onCourt}
                </span>
              </button>
            ))}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {rosterOf(side).map((p) => {
              const id = String(p._id);
              const sel = picked[side].includes(id);
              return (
                <PlayerPick key={id} p={p} selected={sel}
                  disabled={!sel && picked[side].length >= onCourt}
                  onClick={() => toggle(id)} />
              );
            })}
            {rosterOf(side).length === 0 && <p className="text-sm text-muted-foreground">This team has no players on its roster.</p>}
          </div>
        </div>

        <div className="border-t px-4 py-3 sm:px-5">
          {ready && short.length > 0 && (
            <p className="mb-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              {short.map((s) => teamOf(s)?.teamName).join(" and ")} {short.length === 1 ? "has" : "have"} fewer than {onCourt} picked. You can still start.
            </p>
          )}
          <button disabled={busy || !ready}
            onClick={() => onStart({ lineupA: picked.A, lineupB: picked.B })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Play className="size-4 fill-current" /> {busy ? "Starting…" : startLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// The SUBSTITUTION modal: pick who comes off (on court) and who goes in (bench).
// `presetOut` pre-selects the player whose Sub button was tapped.
function SubDialog({ sub, onClose, data, onSubmit, busy }) {
  const open = !!sub;
  const side = sub?.side || "A";
  const m = data.match;
  const onCourt = data.onCourt || 0;
  const team = side === "A" ? m.teamA : m.teamB;
  const roster = byJersey((side === "A" ? data.rosterA : data.rosterB) || []);
  const lineupIds = ((side === "A" ? m.lineupA : m.lineupB) || []).map(String);
  const court = roster.filter((p) => lineupIds.includes(String(p._id)));
  const bench = roster.filter((p) => !lineupIds.includes(String(p._id)));
  const [outId, setOutId] = useState(null);
  const [inId, setInId] = useState(null);
  useEffect(() => { if (open) { setOutId(sub.presetOut || null); setInId(null); } }, [open, sub]);

  const shortHanded = court.length < onCourt;
  const valid = (outId && inId) || (shortHanded && inId && !outId) || (outId && !inId);
  const label = outId && inId ? "Make substitution" : inId ? "Put on court" : outId ? "Take off court" : "Make substitution";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-4 pt-4 pb-3 sm:px-5">
          <DialogTitle>Substitution · {team?.teamName}</DialogTitle>
          <DialogDescription>
            Tap who comes off, then who goes in.
            {shortHanded ? ` Only ${court.length} of ${onCourt} are on court, so you can also just put a player in.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-3 sm:grid-cols-2 sm:px-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Coming off · on court</p>
            <div className="space-y-1.5">
              {court.map((p) => (
                <PlayerPick key={p._id} p={p} tone="out" selected={outId === String(p._id)}
                  onClick={() => setOutId(outId === String(p._id) ? null : String(p._id))} />
              ))}
              {court.length === 0 && <p className="text-sm text-muted-foreground">Nobody on court.</p>}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">Going in · bench</p>
            <div className="space-y-1.5">
              {bench.map((p) => (
                <PlayerPick key={p._id} p={p} selected={inId === String(p._id)}
                  onClick={() => setInId(inId === String(p._id) ? null : String(p._id))} />
              ))}
              {bench.length === 0 && <p className="text-sm text-muted-foreground">No one on the bench.</p>}
            </div>
          </div>
        </div>
        <div className="border-t px-4 py-3 sm:px-5">
          <button disabled={busy || !valid}
            onClick={() => onSubmit({ side, outId, inId })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <ArrowLeftRight className="size-4" /> {busy ? "Saving…" : label}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Who is on court for each team, with a Sub button (score keeper's view).
function OnCourtCard({ data, onSub }) {
  const m = data.match;
  return (
    <Card className="mb-4 gap-3 p-4">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="size-4 text-blue-500" />
        <h2 className="text-sm font-semibold">On court</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {["A", "B"].map((s) => {
          const team = s === "A" ? m.teamA : m.teamB;
          const ids = ((s === "A" ? m.lineupA : m.lineupB) || []).map(String);
          const court = byJersey(((s === "A" ? data.rosterA : data.rosterB) || []).filter((p) => ids.includes(String(p._id))));
          return (
            <div key={s} className="rounded-xl border p-3">
              <div className="mb-2 flex items-center gap-2">
                <Crest team={team} size={24} />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{team?.teamName}</p>
                <span className={cn("text-xs tabular-nums", court.length < data.onCourt ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                  {court.length}/{data.onCourt}
                </span>
              </div>
              <ul className="mb-2.5 space-y-0.5 text-sm">
                {court.map((p) => (
                  <li key={p._id} className="flex gap-2 truncate">
                    <span className="w-8 shrink-0 tabular-nums text-muted-foreground">{jerseyOf(p)}</span>
                    <span className="truncate">{p.lastName}, {p.firstName}</span>
                  </li>
                ))}
                {court.length === 0 && <li className="text-muted-foreground">Nobody on court.</li>}
              </ul>
              <button onClick={() => onSub({ side: s })}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-secondary text-sm font-semibold text-secondary-foreground hover:bg-secondary/80">
                <ArrowLeftRight className="size-3.5" /> Substitute
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// The three jobs on one live match (Oct 2026). Up to three people open the same match on
// the sport's ONE organizer account: a score keeper (team score, periods, end match) and a
// stats keeper per barangay. Each device picks its job; it is remembered per match on that
// device only (sessionStorage), never on the server.
function JobPicker({ m, job, onChoose }) {
  const jobs = [
    ["score", "Score keeper", "Team score, periods, end match"],
    ["A", `Stats: ${m.teamA?.teamName || "Team A"}`, "Points, fouls… for each player"],
    ["B", `Stats: ${m.teamB?.teamName || "Team B"}`, "Points, fouls… for each player"],
  ];
  return (
    <Card className="mb-4 gap-0 p-4">
      <p className="mb-1 text-sm font-medium">Your job on this match</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Up to three people can work this match at once on this account. Each picks one job.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {jobs.map(([key, label, sub]) => (
          <button key={key} type="button" onClick={() => onChoose(key)}
            className={cn(
              "rounded-xl border px-3 py-3 text-left transition",
              job === key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            )}>
            <span className="block truncate text-sm font-semibold">{label}</span>
            <span className={cn("block text-xs", job === key ? "text-primary-foreground/80" : "text-muted-foreground")}>{sub}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

// A stats keeper's screen: one card per player of THEIR barangay, a button per score-sheet
// column (points use the sport's point values, the rest +1). A tap is saved at once and
// shows on the public team page on its next refresh. Player points are stats only: the
// team score stays the score keeper's.
function StatsKeeperPanel({ team, roster, fields, statLabels, pointValues, statByPlayer, live, onTap, lastTap, onUndo, busy, lineupIds, onSub }) {
  const short = (f) => statLabels?.[f]?.short || f;
  const all = byJersey(roster);
  // With a lineup, only the players on court get stat buttons; the bench is listed below.
  // (A match started before lineups existed has none: everyone shows.)
  const hasLineup = live && Array.isArray(lineupIds) && lineupIds.length > 0;
  const sorted = hasLineup ? all.filter((p) => lineupIds.includes(String(p._id))) : all;
  const bench = hasLineup ? all.filter((p) => !lineupIds.includes(String(p._id))) : [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <Crest team={team} size={32} />
        <p className="min-w-0 flex-1 truncate font-semibold">Player stats · {team?.teamName}</p>
      </div>
      {!live && (
        <Alert>
          <AlertDescription>
            Waiting for the score keeper to start the match. The buttons work once it is live.
          </AlertDescription>
        </Alert>
      )}
      {lastTap && (
        <button onClick={onUndo} disabled={busy}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border text-sm text-muted-foreground hover:bg-accent disabled:opacity-40">
          <Undo2 className="size-3.5" /> Undo {lastTap.label}
        </button>
      )}
      {sorted.length === 0 && <p className="text-sm text-muted-foreground">No players on this roster.</p>}
      {sorted.map((p) => {
        const s = statByPlayer?.[String(p._id)] || {};
        return (
          <Card key={p._id} className="gap-2 p-3">
            <div className="flex items-baseline gap-2">
              <span className="w-8 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                {p.jerseyNumber != null ? `#${p.jerseyNumber}` : ""}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{p.lastName}, {p.firstName}</p>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {fields.map((f) => `${s[f] || 0} ${short(f)}`).join(" · ")}
              </span>
              {hasLineup && onSub && (
                <button onClick={() => onSub({ presetOut: String(p._id) })}
                  className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium text-muted-foreground hover:bg-accent">
                  <ArrowLeftRight className="size-3" /> Sub
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {fields.flatMap((f) => (f === "points" ? pointValues : [1]).map((v) => (
                <button key={`${f}-${v}`} disabled={!live}
                  onClick={() => onTap(p, f, v, `+${v} ${short(f)} ${p.lastName}`)}
                  className={cn(
                    "h-11 min-w-14 flex-1 rounded-lg px-2 text-sm font-bold transition active:scale-95 disabled:opacity-40 disabled:active:scale-100",
                    f === "points" ? "bg-green-600 text-white hover:bg-green-700"
                      : f === "fouls" ? "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-400"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  )}>
                  +{v} {short(f)}
                </button>
              )))}
            </div>
          </Card>
        );
      })}
      {hasLineup && (
        <Card className="gap-2 p-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bench · {bench.length}</p>
            {onSub && (
              <button onClick={() => onSub({})}
                className="flex h-8 items-center gap-1 rounded-md bg-secondary px-2.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80">
                <ArrowLeftRight className="size-3" /> Substitute
              </button>
            )}
          </div>
          {bench.length === 0 && <p className="text-sm text-muted-foreground">No one on the bench.</p>}
          <ul className="space-y-0.5 text-sm">
            {bench.map((p) => (
              <li key={p._id} className="flex gap-2 truncate text-muted-foreground">
                <span className="w-8 shrink-0 tabular-nums">{jerseyOf(p)}</span>
                <span className="truncate">{p.lastName}, {p.firstName}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ScoringView({ matchId, onBack }) {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  // The post-match score sheet modal (opens by itself after End match).
  const [statsOpen, setStatsOpen] = useState(false);
  // null until the organizer taps a choice; the default comes from the sport's own options
  // (below). It used to default to 1 — which basketball doesn't even offer (only 4) — so an
  // organizer who simply tapped Start began a ONE-quarter game.
  const [periodsChoice, setPeriodsChoice] = useState(null);
  const [forfeiting, setForfeiting] = useState(false);
  // Starting lineup modal (opens from Start) and the substitution modal ({ side, presetOut }).
  const [lineupOpen, setLineupOpen] = useState(false);
  const [sub, setSub] = useState(null);
  const [subBusy, setSubBusy] = useState(false);
  // True for a few seconds after Start, so the organizer SEES that the match began
  // (the pre-start card used to just vanish and the scoring buttons appeared).
  const [justStarted, setJustStarted] = useState(false);

  // This device's job on the match (see JobPicker), remembered per match on this device.
  const jobKey = `org-job:${matchId}`;
  const [job, setJob] = useState(() => { try { return sessionStorage.getItem(jobKey) || ""; } catch { return ""; } });
  const chooseJob = (j) => { setJob(j); try { sessionStorage.setItem(jobKey, j); } catch { /* private mode */ } };
  // This device's own stat taps, newest last, so its Undo never takes back someone else's.
  const [statTaps, setStatTaps] = useState([]);
  const [statBusy, setStatBusy] = useState(false);

  // `quiet` = a background refresh: no error popup, and no re-render when nothing changed.
  const lastJson = useRef("");
  async function load(quiet = false) {
    try {
      const d = await api(`/api/organizer/matches/${matchId}`);
      const json = JSON.stringify(d);
      if (json !== lastJson.current) { lastJson.current = json; setData(d); }
    } catch (e) { if (!quiet) showError(e.message); }
  }
  useEffect(() => { load(); }, [matchId]);

  // Live refresh (Oct 2026): the score keeper and the two stats keepers are on different
  // devices, so each screen re-reads the match every 3 seconds while it is not finished.
  const statusRef = useRef(null);
  statusRef.current = data?.match?.status;
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!["scheduled", "ongoing"].includes(statusRef.current)) return;
      load(true);
    }, 3000);
    return () => clearInterval(id);
  }, [matchId]);

  async function tapStat(player, stat, amount, label, isUndo = false) {
    setStatBusy(true);
    try {
      const r = await api(`/api/organizer/matches/${matchId}/player-stat`, {
        method: "POST",
        body: JSON.stringify({ playerId: player._id, stat, amount }),
      });
      setData((d) => {
        if (!d) return d;
        const id = String(player._id);
        return { ...d, statByPlayer: { ...(d.statByPlayer || {}), [id]: { ...(d.statByPlayer?.[id] || {}), [stat]: r.value } } };
      });
      lastJson.current = "";   // the next refresh always applies
      if (isUndo) setStatTaps((t) => t.slice(0, -1));
      else setStatTaps((t) => [...t.slice(-29), { player, stat, amount, label }]);
      buzz(15);
    } catch (e) {
      if (isUndo) setStatTaps((t) => t.slice(0, -1));   // e.g. already back at 0
      showError(e.message);
    } finally { setStatBusy(false); }
  }
  const undoStat = () => {
    const last = statTaps[statTaps.length - 1];
    if (last) tapStat(last.player, last.stat, -last.amount, last.label, true);
  };
  useEffect(() => {
    if (!justStarted) return undefined;
    const t = setTimeout(() => setJustStarted(false), 8000);
    return () => clearTimeout(t);
  }, [justStarted]);

  // A short buzz confirms a tap on a noisy court where you can't hear or always
  // see it register. No-op where the browser has no vibration (iOS Safari).
  const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };
  const afterStart = () => {
    setJustStarted(true);
    buzz(35);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  async function call(path, body) {
    setBusy(true);
    try {
      await api(`/api/organizer/matches/${matchId}/${path}`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      });
      await load();
      if (path === "start") afterStart();
      else if (path === "score" || path === "undo") buzz(15);
      return true;
    } catch (e) {
      // The start route returns 409 when the match is dated for another day.
      // Dates are guidance, not a lock — confirm and proceed.
      if (path === "start" && /scheduled for/i.test(e.message)) {
        if (await confirm(e.message, { confirmLabel: "Start anyway" })) {
          try {
            await api(`/api/organizer/matches/${matchId}/start`, {
              method: "POST",
              body: JSON.stringify({ ...(body || {}), confirmOffSchedule: true }),
            });
            await load();
            afterStart();
            return true;
          } catch (e2) { showError(e2.message); }
        }
      } else {
        showError(e.message);
      }
    } finally { setBusy(false); }
  }

  async function substitute({ side, outId, inId }) {
    setSubBusy(true);
    try {
      await api(`/api/organizer/matches/${matchId}/substitute`, {
        method: "POST",
        body: JSON.stringify({ side, outId, inId }),
      });
      await load();
      buzz(15);
      setSub(null);
    } catch (e) { showError(e.message); }
    finally { setSubBusy(false); }
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          <Skeleton className="h-56 w-full lg:w-56 rounded-xl shrink-0" />
        </div>
      </div>
    );
  }

  const m = data.match;
  const finalMode = data.scoringMode === "final";
  const live = m.status === "ongoing";
  const finished = m.status === "completed";
  const forfeited = m.status === "forfeited";
  const tied = (m.liveScoreA || 0) === (m.liveScoreB || 0);
  const allPeriodsDone = (m.games?.length || 0) >= (m.bestOf || 1) && !tied;
  // Games-won sports play a series of m.bestOf games (picked at start, like a sport's sets) and
  // end as soon as one side has won the majority of it.
  const seriesLength = m.bestOf || 1;
  const winsNeeded = Math.floor(seriesLength / 2) + 1;
  const seriesOver = Math.max(m.liveScoreA || 0, m.liveScoreB || 0) >= winsNeeded;
  const seriesText = seriesLength === 1 ? "One game" : `Best of ${seriesLength} · first to ${winsNeeded}`;
  const canEnd = finalMode ? seriesOver : allPeriodsDone;
  const periodOpts = data.periodOptions || [1, 3, 5, 7];
  const periods = periodsChoice ?? (periodOpts.includes(3) ? 3 : periodOpts[0]);
  const pointValues = data.pointValues || [1];
  const desc = describeMatch(m);
  const periodWord = (data.periodLabel || "period");
  const when = [m.schedule ? dateOf(m.schedule) : null, timeOf(m.schedule), m.venue].filter(Boolean).join(" · ");
  // Sports with a post-match form: a box score (points…) and/or roles for esports.
  const hasStatsForm = (data.statFields?.length || 0) > 0 || (data.roles?.length || 0) > 0;
  // Live player stats need numeric sheet columns; without them there is only one job.
  const statFields = data.statFields || [];
  const hasJobs = statFields.length > 0;
  const myJob = hasJobs ? job : "score";
  const isScorer = myJob === "score";
  const statsSide = myJob === "A" || myJob === "B" ? myJob : null;
  const open = !finished && !forfeited;
  // Team sports with an on-court count pick a starting lineup at Start (when a roster is bigger
  // than the court) and can substitute while live.
  const onCourt = data.onCourt || 0;
  const needsLineup = onCourt > 0 &&
    ((data.rosterA || []).length > onCourt || (data.rosterB || []).length > onCourt);
  const hasLineup = live && onCourt > 0 && ((m.lineupA || []).length > 0 || (m.lineupB || []).length > 0);
  const startLabel = finalMode
    ? (periods === 1 ? `Start match · 1 ${periodWord}` : `Start match · best of ${periods}`)
    : `Start match · ${periods} ${periodWord}${periods === 1 ? "" : "s"}`;

  function openEnd() {
    setEnding(true);
  }

  const Scoreboard = () => (
    <div className="w-full lg:w-56 shrink-0 space-y-2">
      <Card className="p-4 gap-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          {desc.group && (
            <Badge className={TONE_BADGE[desc.tone] || TONE_BADGE.accent}>{desc.group}</Badge>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto">
            {live && finalMode
              ? seriesText
              : live
              ? `${(data.periodLabel || "period").replace(/^./, (c) => c.toUpperCase())} ${Math.min((m.games?.length || 0) + 1, m.bestOf || 1)} of ${m.bestOf || 1}`
              : forfeited ? "Forfeit" : finished ? "Final" : "Not started"}
          </span>
        </div>

        <div className="text-center">
          <p className="text-muted-foreground text-[13px] truncate">{m.teamA?.teamName}</p>
          <p className="text-3xl font-semibold tabular-nums">{m.liveScoreA}</p>
        </div>
        <div className="text-center pt-3 mt-3 border-t">
          <p className="text-muted-foreground text-[13px] truncate">{m.teamB?.teamName}</p>
          <p className="text-3xl font-semibold tabular-nums">{m.liveScoreB}</p>
        </div>

        {(m.games || []).length > 0 && (
          <p className="text-center text-muted-foreground text-[11px] mt-3 tabular-nums">
            {(m.games || []).map((g) => `${g.scoreA}-${g.scoreB}`).join(" · ")}
          </p>
        )}
      </Card>

      {live && isScorer && (
        <>
          {m.lastAction?.label && (
            <button onClick={() => call("undo")} disabled={busy}
              className="w-full h-9 flex items-center justify-center gap-1.5 rounded-lg border text-muted-foreground text-[13px] hover:bg-accent disabled:opacity-40">
              <Undo2 className="size-3.5" /> Undo {m.lastAction.label}
            </button>
          )}
          {!finalMode && (
            <button onClick={() => call("end-period")}
              disabled={busy || (m.games?.length || 0) >= (m.bestOf || 1)}
              className="w-full h-9 rounded-lg bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 disabled:opacity-40">
              End this {data.periodLabel || "period"}
            </button>
          )}
          <button onClick={openEnd} disabled={busy || !canEnd}
            className="w-full h-9 rounded-lg bg-red-600 text-white text-[13px] font-medium hover:bg-red-700 disabled:opacity-40">
            End match
          </button>
          <button
            onClick={async () => {
              const scored = (m.games?.length || 0) > 0 || (m.liveScoreA || 0) > 0 || (m.liveScoreB || 0) > 0;
              const msg = scored
                ? `Cancel this match? The score (${m.liveScoreA}–${m.liveScoreB}) and everything recorded will be discarded.`
                : "Cancel this match and return it to not-started?";
              if (await confirm(msg, { danger: true, confirmLabel: "Cancel match" })) call("cancel");
            }}
            disabled={busy}
            className="w-full h-9 flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 text-[13px] hover:bg-red-500/10 disabled:opacity-40">
            <X className="size-3.5" /> Cancel match
          </button>
        </>
      )}
    </div>
  );

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-muted-foreground text-sm mb-3 hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All matches
      </button>

      {/* Phones: the scoreboard panel is BELOW the scoring buttons, so mid-game the running
          score and Undo were out of sight. This slim bar sticks to the top while live. */}
      {live && (
        <div className="sticky top-16 z-(--z-sticky) -mx-4 mb-3 border-b bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3">
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
              <Circle className="size-2 fill-current" /> LIVE
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-center gap-2.5 tabular-nums">
                <span className="max-w-[28%] truncate text-xs text-muted-foreground">{m.teamA?.teamName}</span>
                <span className="text-2xl font-semibold leading-none">{m.liveScoreA} – {m.liveScoreB}</span>
                <span className="max-w-[28%] truncate text-xs text-muted-foreground">{m.teamB?.teamName}</span>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                {finalMode
                  ? seriesText
                  : `${periodWord.replace(/^./, (c) => c.toUpperCase())} ${Math.min((m.games?.length || 0) + 1, m.bestOf || 1)} of ${m.bestOf || 1}`}
              </p>
            </div>
            {isScorer ? (
              <button onClick={() => call("undo")} disabled={busy || !m.lastAction?.label}
                className="flex h-9 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40">
                <Undo2 className="size-3.5" /> Undo
              </button>
            ) : statsSide && (
              <button onClick={undoStat} disabled={statBusy || !statTaps.length}
                className="flex h-9 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40">
                <Undo2 className="size-3.5" /> Undo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Who is playing, and when/where — shown in every state (the pre-start card used to
          give no hint of the matchup at all; the team names only appeared as small tabs). */}
      <Card className="mb-4 gap-0 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {[data.sport, data.division && data.division !== "open" ? (DIVISION_LABEL[data.division] || data.division) : null, desc.stage].filter(Boolean).join(" · ")}
          </span>
          {live ? (
            <Badge className="shrink-0 gap-1 bg-red-500/15 text-red-600 dark:text-red-400"><Circle className="size-2 fill-current" /> Live</Badge>
          ) : finished ? (
            <Badge className="shrink-0 bg-green-500/15 text-green-600 dark:text-green-400">Final</Badge>
          ) : forfeited ? (
            <Badge className="shrink-0 bg-amber-500/15 text-amber-600 dark:text-amber-400">Forfeit</Badge>
          ) : (
            <Badge className="shrink-0 bg-blue-500/15 text-blue-600 dark:text-blue-400">Ready</Badge>
          )}
        </div>
        <div className="flex items-start gap-2">
          {[m.teamA, m.teamB].map((t, i) => (
            <div key={i} className="contents">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
                <Crest team={t} size={52} />
                <p className="line-clamp-2 text-sm font-semibold leading-tight break-words">{t?.teamName}</p>
              </div>
              {i === 0 && <span className="pt-4 text-xs font-medium text-muted-foreground">vs</span>}
            </div>
          ))}
        </div>
        {when && <p className="mt-3 text-center text-xs text-muted-foreground">{when}</p>}
      </Card>

      {live && justStarted && (
        <Alert className="mb-4 border-green-500/30 bg-green-500/5">
          <CircleCheck className="text-green-600 dark:text-green-400" />
          <AlertDescription className="text-foreground">
            <span className="font-medium">Match started.</span>{" "}
            {finalMode
              ? seriesLength === 1
                ? "Tap the winner when the game finishes."
                : `Tap the winner of each game as it finishes. First to ${winsNeeded} wins the match.`
              : `${periodWord.replace(/^./, (c) => c.toUpperCase())} 1 of ${m.bestOf || 1}. Tap the team that scored; Undo is at the top.`}
          </AlertDescription>
        </Alert>
      )}

      {finished && hasStatsForm && (
        <Alert className="mb-4 border-blue-500/30 bg-blue-500/5">
          <ClipboardList className="text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-foreground">
            <span className="font-medium">Match finished.</span>{" "}
            {(data.statFields?.length || 0) > 0
              ? "Fill in the player stats from your scoresheet."
              : "Pick the role each player played."}
          </AlertDescription>
        </Alert>
      )}

      {hasJobs && open && <JobPicker m={m} job={job} onChoose={chooseJob} />}

      {!live && open && isScorer && (
        <Card className="p-4 mb-4 gap-0">
          <>
              <p className="text-sm font-medium mb-1">
                {finalMode ? `Best of how many ${periodWord}s?` : `How many ${periodWord}s?`}
              </p>
              <p className="text-muted-foreground text-xs mb-3">
                {finalMode
                  ? periods === 1
                    ? `One ${periodWord} decides the match.`
                    : `The first to win ${Math.floor(periods / 2) + 1} takes the match.`
                  : "All of them are played, and the winner is the higher total score."}
              </p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {periodOpts.map((n) => (
                  <button key={n} type="button" onClick={() => setPeriodsChoice(n)}
                    className={cn(
                      "py-3 rounded-lg text-lg font-semibold transition",
                      periods === n ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    )}>
                    {n}
                  </button>
                ))}
              </div>
          </>

          <button onClick={() => (needsLineup ? setLineupOpen(true) : call("start", { periods }))} disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Play className="size-4 fill-current" />
            {busy ? "Starting…" : startLabel}
          </button>
          {needsLineup && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Next, you pick the starting {onCourt} for each team.
            </p>
          )}

          {!forfeiting ? (
            <button onClick={() => setForfeiting(true)}
              className="w-full mt-2 py-2.5 rounded-xl border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm hover:bg-amber-500/10">
              A team didn't show up
            </button>
          ) : (
            <div className="mt-3 pt-3 border-t">
              <p className="text-sm font-medium mb-1">Which team forfeited?</p>
              <p className="text-muted-foreground text-xs mb-3">
                Recorded 1–0 to the team that showed up, marked as a forfeit. The winner
                advances as normal.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {["A", "B"].map((s) => {
                  const name = s === "A" ? m.teamA?.teamName : m.teamB?.teamName;
                  return (
                    <button key={s} disabled={busy}
                      onClick={async () => {
                        if (await confirm(`Record ${name} as forfeiting? The other team wins 1–0.`, { danger: true, confirmLabel: "Record forfeit" })) {
                          call("forfeit", { forfeitingSide: s });
                        }
                      }}
                      className="py-3 rounded-lg border border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10 text-sm font-medium hover:bg-amber-500/15 disabled:opacity-50">
                      {name}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setForfeiting(false)}
                className="w-full mt-2 py-2 text-muted-foreground text-xs hover:text-foreground">
                Cancel
              </button>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          {open && statsSide && (
            <StatsKeeperPanel
              team={statsSide === "A" ? m.teamA : m.teamB}
              roster={(statsSide === "A" ? data.rosterA : data.rosterB) || []}
              fields={statFields}
              statLabels={data.statLabels}
              pointValues={pointValues}
              statByPlayer={data.statByPlayer}
              live={live}
              onTap={tapStat}
              lastTap={statTaps[statTaps.length - 1]}
              onUndo={undoStat}
              busy={statBusy}
              lineupIds={((statsSide === "A" ? m.lineupA : m.lineupB) || []).map(String)}
              onSub={hasLineup ? (o) => setSub({ side: statsSide, ...o }) : null}
            />
          )}
          {hasJobs && open && !myJob && (
            <p className="text-sm text-muted-foreground">Pick your job above to begin.</p>
          )}
          {live && isScorer && (finalMode ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => call("score", { side: "A", points: 1 })} disabled={busy || seriesOver}
                  className="py-6 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50">
                  {m.teamA?.teamName} won a game
                </button>
                <button onClick={() => call("score", { side: "B", points: 1 })} disabled={busy || seriesOver}
                  className="py-6 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50">
                  {m.teamB?.teamName} won a game
                </button>
              </div>
              {seriesOver && (
                <p className="text-green-600 dark:text-green-400 text-sm text-center mt-3">
                  {(m.liveScoreA || 0) > (m.liveScoreB || 0) ? m.teamA?.teamName : m.teamB?.teamName} wins
                  the series {m.liveScoreA || 0}–{m.liveScoreB || 0}. End the match to finish.
                </p>
              )}
            </>
          ) : (
            // Team scoring: one card per team, with a big button per point value. Nothing here
            // is credited to a player — that is the post-match form's job.
            <div className="grid gap-3">
              {["A", "B"].map((s) => {
                const t = s === "A" ? m.teamA : m.teamB;
                const score = s === "A" ? m.liveScoreA : m.liveScoreB;
                return (
                  <Card key={s} className="gap-3 p-4">
                    <div className="flex items-center gap-2.5">
                      <Crest team={t} size={36} />
                      <p className="min-w-0 flex-1 truncate font-semibold">{t?.teamName}</p>
                      <span className="text-2xl font-semibold tabular-nums">{score}</span>
                    </div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${pointValues.length}, minmax(0, 1fr))` }}>
                      {pointValues.map((v) => (
                        <button key={v} onClick={() => call("score", { side: s, points: v })} disabled={busy}
                          className="h-16 rounded-xl bg-green-600 text-xl font-bold text-white transition active:scale-95 hover:bg-green-700 disabled:opacity-40 disabled:active:scale-100">
                          +{v}
                        </button>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          ))}

          {hasLineup && isScorer && (
            <div className="mt-4">
              <OnCourtCard data={data} onSub={(o) => setSub(o)} />
            </div>
          )}

          {/* The score sheet itself is a modal; this card opens it again any time. */}
          {finished && hasStatsForm && (() => {
            const saved = Object.keys(data.statByPlayer || {}).length > 0 || !!m.mvp;
            return (
              <Card className="gap-0 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <ClipboardList className="size-4 text-blue-500" />
                  <h2 className="text-sm font-semibold">Player stats</h2>
                  <Badge className={cn("ml-auto", saved
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400")}>
                    {saved ? "Saved" : "Not entered yet"}
                  </Badge>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  {saved
                    ? "Open the score sheet to check or change the numbers."
                    : (data.statFields?.length || 0) > 0
                    ? "Enter each player's totals from your scoresheet."
                    : "Pick the role each player played."}
                </p>
                <button onClick={() => setStatsOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90">
                  <ClipboardList className="size-4" /> {saved ? "Edit player stats" : "Fill in player stats"}
                </button>
              </Card>
            );
          })()}

          {live && !finalMode && tied && (m.games?.length || 0) >= (m.bestOf || 1) && (
            <p className="text-amber-600 dark:text-amber-400 text-sm text-center mt-3">
              Scores are level. Play a deciding {data.periodLabel || "period"}.
            </p>
          )}
        </div>

        <Scoreboard />
      </div>

      {needsLineup && open && !live && (
        <LineupDialog open={lineupOpen} onOpenChange={setLineupOpen} data={data} busy={busy}
          startLabel={startLabel}
          onStart={async (lineup) => {
            if (await call("start", { periods, ...lineup })) setLineupOpen(false);
          }} />
      )}
      {hasLineup && (
        <SubDialog sub={sub} onClose={() => setSub(null)} data={data} busy={subBusy} onSubmit={substitute} />
      )}

      {finished && hasStatsForm && (
        <StatsDialog open={statsOpen} onOpenChange={setStatsOpen} data={data} matchId={matchId} onSaved={load} />
      )}

      <Dialog open={ending} onOpenChange={setEnding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End match</DialogTitle>
            <DialogDescription>
              Final score {m.liveScoreA}–{m.liveScoreB}. The winner advances automatically.
              {hasStatsForm ? " You'll enter the player stats next." : ""}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <button onClick={() => setEnding(false)}
              className="flex-1 py-2.5 rounded-lg border text-muted-foreground text-sm">Cancel</button>
            <button
              onClick={async () => {
                await call("end", {});
                setEnding(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
                // Straight into the score sheet.
                if (hasStatsForm) setStatsOpen(true);
              }}
              disabled={busy}
              className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
              {busy ? "Ending…" : "Confirm"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Built ONCE — a new Intl.DateTimeFormat per match on every render is slow (Oct 2026 perf pass).
const MANILA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
});

function ListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function OrganizerScoring() {
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("play");          // "play" | "done" — the list got long fast
  const [division, setDivision] = useState("all"); // basketball runs U15 and U30 side by side
  const [group, setGroup] = useState("all");       // "all" | "A".."H" | "ko" (knockout — no group)

  async function load() {
    try {
      setFeed(await api("/api/organizer/matches"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <AdminLayout title="Matches" menu={organizerMenu} enableDarkMode seasonStrip={false}
        subtitle="Pick a match to start scoring it.">
        <ListSkeleton />
      </AdminLayout>
    );
  }

  // `allMatches` (unfiltered) is what describeMatch counts rounds against — filtering by
  // division must not change whether a match reads as "Semifinal" or "Round of 8".
  const allMatches = feed?.matches || [];
  const divisions = [...new Set(allMatches.map((m) => m.division || "open"))];
  const inDivision = division === "all" ? allMatches : allMatches.filter((m) => (m.division || "open") === division);
  // Groups offered follow the division picked, so Boys' groups don't list Girls' ones.
  const groupKey = (m) => m.group || "ko";
  const groups = [...new Set(inDivision.map(groupKey))].sort((a, b) =>
    a === "ko" ? 1 : b === "ko" ? -1 : a.localeCompare(b));
  // A group picked under another division may not exist here — fall back to all.
  const activeGroup = groups.includes(group) ? group : "all";
  const matches = activeGroup === "all" ? inDivision : inDivision.filter((m) => groupKey(m) === activeGroup);
  const manilaDay = (d) => MANILA_DAY.format(new Date(d));
  const todayKey = manilaDay(new Date());
  const isToday = (d) => !!d && manilaDay(d) === todayKey;
  const bySchedule = (a, b) => new Date(a.schedule || 0) - new Date(b.schedule || 0);
  const isReady = (m) => !!(m.teamA && m.teamB);

  const live = matches.filter((m) => m.status === "ongoing");
  const scheduled = matches.filter((m) => m.status === "scheduled");
  // Dated for a day that has passed and never started — worth its own section, not
  // buried among the upcoming dates.
  const overdue = scheduled.filter((m) => isReady(m) && m.schedule && manilaDay(m.schedule) < todayKey).sort(bySchedule);
  const overdueIds = new Set(overdue.map((m) => m._id));
  const today = scheduled.filter((m) => isToday(m.schedule)).sort(bySchedule);
  const upcoming = scheduled.filter((m) => !isToday(m.schedule) && !overdueIds.has(m._id));
  const nextUpId = today.find(isReady)?._id;
  const done = matches.filter((m) => m.status === "completed" || m.status === "forfeited");
  const toPlay = live.length + overdue.length + today.length + upcoming.length;

  const grouped = {};
  upcoming.forEach((m) => { (grouped[dateOf(m.schedule)] = grouped[dateOf(m.schedule)] || []).push(m); });
  const byDate = Object.entries(grouped).sort((a, b) =>
    a[0] === "No date set" ? 1 : b[0] === "No date set" ? -1 : 0
  );

  if (openId) {
    // Instant theme swap here only: a View Transition freezes input ~0.75s and would
    // swallow score taps mid-match. The match list and dashboard animate normally.
    return (
      <AdminLayout title={feed.sport} menu={organizerMenu} enableDarkMode animateTheme={false} seasonStrip={false} pageHeader={false}>
        <ScoringView matchId={openId} onBack={() => { setOpenId(null); load(); }} />
      </AdminLayout>
    );
  }

  const Row = ({ m, showDate, isOverdue, nextUp }) => {
    const ready = m.teamA && m.teamB;
    const d = describeMatch(m, allMatches);
    const time = timeOf(m.schedule);
    const isLive = m.status === "ongoing";
    const isDone = m.status === "completed" || m.status === "forfeited";

    const accent = isLive ? "border-l-4 border-l-red-500"
      : ready && !isDone ? "border-l-4 border-l-blue-500"
      : isDone ? "border-l-4 border-l-green-500"
      : "border-l-4 border-l-border";

    return (
      <button onClick={() => ready && setOpenId(m._id)} disabled={!ready}
        className={cn(
          "w-full text-left rounded-xl border p-4 transition",
          accent,
          ready && !isDone ? "bg-card hover:border-blue-500/40 hover:bg-blue-500/5" : "bg-muted/40",
          !ready && "cursor-not-allowed"
        )}>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {/* The kick-off time leads (it used to be a tiny line at the bottom of the card). */}
          {time && !isLive && !isDone && <span className="text-sm font-semibold tabular-nums">{time}</span>}
          {nextUp && <Badge className="bg-primary text-primary-foreground">Next up</Badge>}
          {isOverdue && (
            <Badge className="gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <TriangleAlert className="size-3" /> Overdue
            </Badge>
          )}
          {d.group && <Badge className={TONE_BADGE[d.tone] || TONE_BADGE.accent}>{d.group}</Badge>}
          <span className="text-muted-foreground text-xs">
            {feed?.sport}
            {m.division && m.division !== "open" ? ` ${DIVISION_LABEL[m.division] || m.division}` : ""}
            {" · "}{d.stage}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          {/* Each team gets its own min-w-0 flex-1 slot so a long barangay name
              on ONE side truncates on its own instead of starving (or being
              starved by) the other side, at any screen width. */}
          {/* The two teams are STACKED (one per line) so each name gets the row's full width —
              side by side on a phone, "Mukas U30 vs Baybay U30" was cut to "Mukas… vs Bayba…". */}
          <div className="min-w-0 flex-1 space-y-1.5">
            {[m.teamA, m.teamB].map((t, i) => (
              <div key={i} className="flex min-w-0 items-center gap-2">
                <Crest team={t} size={28} />
                <span className={cn("min-w-0 truncate text-sm", ready ? "font-medium" : "text-muted-foreground")}>
                  {t?.teamName || "TBD"}
                </span>
              </div>
            ))}
          </div>

          {isLive ? (
            <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 whitespace-nowrap shrink-0 gap-1">
              <Circle className="size-2 fill-current" /> LIVE {m.liveScoreA}–{m.liveScoreB}
            </Badge>
          ) : isDone ? (
            <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 whitespace-nowrap shrink-0">
              {m.status === "forfeited" ? "Forfeit " : ""}{m.liveScoreA}–{m.liveScoreB}
            </Badge>
          ) : !ready ? (
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">waiting for a team</span>
          ) : (
            <Badge className="bg-primary text-primary-foreground whitespace-nowrap shrink-0">
              Start →
            </Badge>
          )}
        </div>

        {(showDate || time || m.venue || d.note) && (
          <p className="text-muted-foreground text-xs mt-2">
            {[showDate || isOverdue ? dateOf(m.schedule) : null, isLive || isDone ? time : null, m.venue, d.note].filter(Boolean).join(" · ")}
          </p>
        )}
      </button>
    );
  };

  return (
    <AdminLayout title={feed.sport || "Matches"} menu={organizerMenu} enableDarkMode seasonStrip={false}
      subtitle="Pick a match to start scoring it. Today's games are first.">
      <div className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* To play / Completed — finished matches used to pile up under everything else. */}
        <div className="flex gap-2">
          {[["play", "To play", toPlay], ["done", "Completed", done.length]].map(([key, label, n]) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn(
                "flex-1 rounded-lg py-2.5 text-sm font-medium transition",
                tab === key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}>
              {label} <span className="tabular-nums opacity-80">({n})</span>
            </button>
          ))}
        </div>

        {divisions.length > 1 && (
          <div className="-mt-3 flex flex-wrap gap-1.5">
            {["all", ...divisions].map((dv) => (
              <button key={dv} onClick={() => setDivision(dv)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  division === dv ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                )}>
                {dv === "all" ? "All divisions" : (DIVISION_LABEL[dv] || dv)}
              </button>
            ))}
          </div>
        )}

        {groups.length > 1 && (
          <div className="-mt-3 flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {["all", ...groups].map((g) => (
              <button key={g} onClick={() => setGroup(g)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
                  activeGroup === g ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                )}>
                {g === "all" ? "All groups" : g === "ko" ? "Knockout" : `Group ${g}`}
              </button>
            ))}
          </div>
        )}

        {tab === "play" && (
          <>
            {live.length > 0 && (
              <section>
                <h2 className="flex items-center gap-1.5 font-semibold text-sm mb-2">
                  <Radio className="size-4 text-red-500" /> Playing now
                </h2>
                <div className="space-y-2">{live.map((m) => <Row key={m._id} m={m} />)}</div>
              </section>
            )}

            {overdue.length > 0 && (
              <section>
                <h2 className="flex items-center gap-1.5 font-semibold text-sm mb-1">
                  <TriangleAlert className="size-4 text-amber-500" />
                  Overdue <span className="text-muted-foreground font-normal">({overdue.length})</span>
                </h2>
                <p className="text-muted-foreground text-xs mb-2">Dated for a day that has passed and never started.</p>
                <div className="space-y-2">{overdue.map((m) => <Row key={m._id} m={m} isOverdue />)}</div>
              </section>
            )}

            {today.length > 0 && (
              <section>
                <h2 className="flex items-center gap-1.5 font-semibold text-sm mb-2">
                  <CalendarClock className="size-4 text-blue-500" />
                  Today <span className="text-muted-foreground font-normal">({today.length})</span>
                </h2>
                <div className="space-y-2">{today.map((m) => <Row key={m._id} m={m} nextUp={m._id === nextUpId} />)}</div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section>
                <h2 className="flex items-center gap-1.5 font-semibold text-sm mb-2">
                  <CalendarClock className="size-4 text-blue-500" />
                  Upcoming <span className="text-muted-foreground font-normal">({upcoming.length})</span>
                </h2>
                <div className="space-y-4">
                  {byDate.map(([date, list]) => (
                    <div key={date}>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-xs font-semibold">{date}</span>
                        <span className="text-muted-foreground text-xs">
                          {list.length} match{list.length === 1 ? "" : "es"}
                        </span>
                      </div>
                      <div className="space-y-2">{list.map((m) => <Row key={m._id} m={m} />)}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {toPlay === 0 && (
              <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                {done.length > 0 ? "Nothing left to play: every match is finished. See Completed." : "Nothing scheduled yet."}
              </p>
            )}
          </>
        )}

        {tab === "done" && (
          done.length > 0 ? (
            <section>
              <h2 className="flex items-center gap-1.5 font-semibold text-sm mb-2">
                <ListChecks className="size-4 text-green-500" />
                Completed <span className="text-muted-foreground font-normal">({done.length})</span>
              </h2>
              <div className="space-y-2">{done.map((m) => <Row key={m._id} m={m} />)}</div>
            </section>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
              No finished matches yet.
            </p>
          )
        )}
      </div>
    </AdminLayout>
  );
}
