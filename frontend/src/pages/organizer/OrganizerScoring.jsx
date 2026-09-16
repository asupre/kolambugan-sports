import { useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, Circle, ListChecks, Radio, Undo2, X } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
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

const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls",
  under17: "U17", under30: "U30",
};

const BRACKET_LABEL = {
  winners: "Winners bracket",
  losers: "Losers bracket",
  final: "Grand final",
  third: "Third place",
  ko_third: "Third place",
};

const STAT_LABEL = { foul: "Foul", rebound: "Rebound", assist: "Assist" };

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

// A date-only schedule is stored as midnight UTC, which would render as 8:00 AM
// in Manila — a time nobody set.
const timeOf = (d) => {
  if (!d) return null;
  const x = new Date(d);
  if (x.getUTCHours() === 0 && x.getUTCMinutes() === 0) return null;
  return x.toLocaleTimeString([], { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
};

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

// One card per player, with every action on the card itself. The previous screen
// needed two taps — select a player, then a value — which is where mis-taps came
// from, and it could fail with "pick a player first" in the middle of a game.
// Score/stat buttons stay solid and oversized on purpose: these are the actual
// tap targets at courtside, not status indicators — legibility beats restraint here.
function PlayerCard({ player, stat, pointValues, statTypes, busy, onScore, onStat }) {
  const s = stat || { points: 0, fouls: 0, rebounds: 0, assists: 0 };
  const line = [
    `${s.points} pts`,
    s.rebounds ? `${s.rebounds} reb` : null,
    s.assists ? `${s.assists} ast` : null,
    s.fouls ? `${s.fouls} f` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Card className="px-3 py-2.5 gap-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-sm truncate">
          <span className="text-muted-foreground text-xs mr-1.5">{player.jerseyNumber ?? "—"}</span>
          {player.lastName}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">{line}</span>
      </div>

      <div className="flex gap-1.5 mb-1.5">
        {pointValues.map((v) => (
          <button key={v} onClick={() => onScore(player._id, v)} disabled={busy}
            className="flex-1 h-10 rounded-lg bg-green-600 text-white text-[15px] font-semibold hover:bg-green-700 disabled:opacity-40">
            +{v}
          </button>
        ))}
      </div>

      {statTypes.length > 0 && (
        <div className="flex gap-1.5">
          {statTypes.map((t) => (
            <button key={t} onClick={() => onStat(player._id, t)} disabled={busy}
              className="flex-1 h-8 rounded-lg border text-muted-foreground text-xs hover:bg-accent disabled:opacity-40">
              {STAT_LABEL[t] || t}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function ScoringView({ matchId, onBack }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ending, setEnding] = useState(false);
  const [mvp, setMvp] = useState(null);
  const [periods, setPeriods] = useState(1);
  const [side, setSide] = useState("A");
  const [onCourt, setOnCourt] = useState({ A: [], B: [] });
  const [subbing, setSubbing] = useState(false);
  const [forfeiting, setForfeiting] = useState(false);

  async function load() {
    try {
      const d = await api(`/api/organizer/matches/${matchId}`);
      setData(d);
      // Default the on-court five to the lowest jersey numbers. It's a display
      // filter only — nothing about who played is stored.
      setOnCourt((prev) => {
        if (prev.A.length || prev.B.length) return prev;
        const pick = (roster) => [...roster]
          .sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999))
          .slice(0, d.onCourt || roster.length)
          .map((p) => String(p._id));
        return { A: pick(d.rosterA || []), B: pick(d.rosterB || []) };
      });
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [matchId]);

  async function call(path, body) {
    setBusy(true); setError("");
    try {
      await api(`/api/organizer/matches/${matchId}/${path}`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      });
      await load();
    } catch (e) {
      // The start route returns 409 when the match is dated for another day.
      // Dates are guidance, not a lock — confirm and proceed.
      if (path === "start" && /scheduled for/i.test(e.message)) {
        if (window.confirm(e.message)) {
          try {
            await api(`/api/organizer/matches/${matchId}/start`, {
              method: "POST",
              body: JSON.stringify({ ...(body || {}), confirmOffSchedule: true }),
            });
            await load();
          } catch (e2) { setError(e2.message); }
        }
      } else {
        setError(e.message);
      }
    } finally { setBusy(false); }
  }

  if (!data) {
    return (
      <div className="max-w-4xl space-y-3">
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
  const mode = data.scoringMode;
  const finalMode = mode === "final";
  const rally = mode === "rally";
  const live = m.status === "ongoing";
  const finished = m.status === "completed";
  const forfeited = m.status === "forfeited";
  const tied = (m.liveScoreA || 0) === (m.liveScoreB || 0);
  const allPeriodsDone = (m.games?.length || 0) >= (m.bestOf || 1) && !tied;
  const canEnd = finalMode ? !tied : allPeriodsDone;
  const desc = describeMatch(m);
  const stat = (id) => data.statByPlayer?.[String(id)] || { points: 0, fouls: 0, rebounds: 0, assists: 0 };

  const roster = side === "A" ? (data.rosterA || []) : (data.rosterB || []);
  const courtIds = onCourt[side] || [];
  const limit = data.onCourt || roster.length;
  const court = roster.filter((p) => courtIds.includes(String(p._id)));
  const bench = roster.filter((p) => !courtIds.includes(String(p._id)));
  const teamName = side === "A" ? m.teamA?.teamName : m.teamB?.teamName;

  function toggleCourt(id) {
    setOnCourt((prev) => {
      const cur = prev[side] || [];
      if (cur.includes(id)) return { ...prev, [side]: cur.filter((x) => x !== id) };
      if (cur.length >= limit) return prev;
      return { ...prev, [side]: [...cur, id] };
    });
  }

  const allPlayers = [
    ...(data.rosterA || []).map((p) => ({ ...p, side: "A" })),
    ...(data.rosterB || []).map((p) => ({ ...p, side: "B" })),
  ];
  const topScorer = allPlayers
    .map((p) => ({ p, pts: stat(p._id).points }))
    .sort((x, y) => y.pts - x.pts)[0];

  async function openEnd() {
    if (finalMode && (m.games?.length || 0) < (m.bestOf || 1)) await call("end-period");
    setMvp(topScorer?.pts > 0 ? String(topScorer.p._id) : null);
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
            {live && !finalMode
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

      {live && (
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
            onClick={() => {
              const scored = (m.games?.length || 0) > 0 || (m.liveScoreA || 0) > 0 || (m.liveScoreB || 0) > 0;
              const msg = scored
                ? `Cancel this match? The score (${m.liveScoreA}–${m.liveScoreB}) and everything recorded will be discarded.`
                : "Cancel this match and return it to not-started?";
              if (window.confirm(msg)) call("cancel");
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
    <div className="max-w-4xl">
      <button onClick={onBack} className="flex items-center gap-1 text-muted-foreground text-sm mb-3 hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All matches
      </button>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-muted-foreground text-xs">
          {data.sport}
          {data.division && data.division !== "open" ? ` ${DIVISION_LABEL[data.division] || data.division}` : ""}
          {" · "}{desc.stage}
        </span>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!live && !finished && !forfeited && (
        <Card className="p-4 mb-4 gap-0">
          {finalMode ? (
            <p className="text-muted-foreground text-sm mb-3">
              Record the winner of each game as it finishes. The team with more games won takes the match.
            </p>
          ) : (
            <>
              <p className="text-sm font-medium mb-1">How many {data.periodLabel || "period"}s?</p>
              <p className="text-muted-foreground text-xs mb-3">
                All of them are played, and the winner is the higher total score.
              </p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {(data.periodOptions || [1, 3, 5, 7]).map((n) => (
                  <button key={n} type="button" onClick={() => setPeriods(n)}
                    className={cn(
                      "py-3 rounded-lg text-lg font-semibold transition",
                      periods === n ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    )}>
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}
          <button onClick={() => call("start", { periods: finalMode ? 1 : periods })} disabled={busy}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50">
            {busy ? "Starting…" : "Start match"}
          </button>

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
                      onClick={() => {
                        if (window.confirm(`Record ${name} as forfeiting? The other team wins 1–0.`)) {
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
          {finalMode ? (
            live && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => call("score", { side: "A", points: 1 })} disabled={busy}
                  className="py-6 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50">
                  {m.teamA?.teamName} won a game
                </button>
                <button onClick={() => call("score", { side: "B", points: 1 })} disabled={busy}
                  className="py-6 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50">
                  {m.teamB?.teamName} won a game
                </button>
              </div>
            )
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                {["A", "B"].map((s) => (
                  <button key={s} onClick={() => setSide(s)}
                    className={cn(
                      "flex-1 py-2.5 rounded-lg text-sm font-medium transition",
                      side === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    )}>
                    {s === "A" ? m.teamA?.teamName : m.teamB?.teamName}
                  </button>
                ))}
              </div>

              {live && (
                <>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-muted-foreground text-xs">On court · {court.length} of {limit}</p>
                    <button onClick={() => setSubbing(!subbing)}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg border text-muted-foreground hover:bg-accent">
                      {subbing ? "Done" : "Substitute"}
                    </button>
                  </div>

                  {subbing ? (
                    <Card className="p-3 mb-3 gap-0">
                      <p className="text-muted-foreground text-xs mb-2">
                        Tap to move a player on or off court. This only changes which cards are
                        shown — it isn't recorded.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {roster.map((p) => {
                          const on = courtIds.includes(String(p._id));
                          return (
                            <button key={p._id} onClick={() => toggleCourt(String(p._id))}
                              className={cn(
                                "px-2 py-1.5 rounded-lg text-xs text-left truncate transition",
                                on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                              )}>
                              <span className="opacity-70 mr-1">{p.jerseyNumber ?? "—"}</span>
                              {p.lastName}
                            </button>
                          );
                        })}
                      </div>
                    </Card>
                  ) : (
                    <>
                      <div className="grid gap-2">
                        {court.map((p) => (
                          <PlayerCard
                            key={p._id}
                            player={p}
                            stat={stat(p._id)}
                            pointValues={data.pointValues || [1]}
                            statTypes={data.statTypes || []}
                            busy={busy}
                            onScore={(id, v) => call("score", { side, points: v, playerId: id })}
                            onStat={(id, t) => call("stat", { playerId: id, type: t })}
                          />
                        ))}
                        {court.length === 0 && (
                          <p className="text-muted-foreground text-sm">Nobody on court — tap Substitute.</p>
                        )}
                      </div>

                      {rally && (
                        <button onClick={() => call("score", { side, points: 1 })} disabled={busy}
                          className="w-full mt-2 py-3 rounded-xl border border-green-500/30 text-green-700 dark:text-green-400 bg-green-500/10 text-sm font-medium hover:bg-green-500/15 disabled:opacity-40">
                          +1 {teamName} — opponent error
                        </button>
                      )}

                      {bench.length > 0 && (
                        <p className="text-muted-foreground text-xs mt-3">
                          Bench: {bench.map((p) => p.lastName).join(" · ")}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {tied && (m.games?.length || 0) >= (m.bestOf || 1) && !finalMode && (
            <p className="text-amber-600 dark:text-amber-400 text-sm text-center mt-3">
              Scores are level — play a deciding {data.periodLabel || "period"}.
            </p>
          )}
        </div>

        <Scoreboard />
      </div>

      <Dialog open={ending} onOpenChange={setEnding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End match</DialogTitle>
            <DialogDescription>
              Final score {m.liveScoreA}–{m.liveScoreB}. The winner advances automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>MVP</Label>
            <Select value={mvp || "none"} onValueChange={(v) => setMvp(v === "none" ? null : v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No MVP</SelectItem>
                {allPlayers.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.lastName}, {p.firstName} ({stat(p._id).points} pts)
                    {topScorer?.p._id === p._id ? " — top scorer" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <button onClick={() => setEnding(false)}
              className="flex-1 py-2.5 rounded-lg border text-muted-foreground text-sm">Cancel</button>
            <button
              onClick={async () => { await call("end", mvp ? { mvpPlayerId: mvp } : {}); setEnding(false); }}
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

function ListSkeleton() {
  return (
    <div className="max-w-2xl space-y-6">
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
      <AdminLayout title="Matches" menu={organizerMenu} enableDarkMode>
        <ListSkeleton />
      </AdminLayout>
    );
  }

  const matches = feed?.matches || [];
  const manilaDay = (d) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(d));
  const isToday = (d) => !!d && manilaDay(d) === manilaDay(new Date());

  const live = matches.filter((m) => m.status === "ongoing");
  const scheduled = matches.filter((m) => m.status === "scheduled");
  const today = scheduled.filter((m) => isToday(m.schedule));
  const upcoming = scheduled.filter((m) => !isToday(m.schedule));
  const done = matches.filter((m) => m.status === "completed" || m.status === "forfeited");

  const grouped = {};
  upcoming.forEach((m) => { (grouped[dateOf(m.schedule)] = grouped[dateOf(m.schedule)] || []).push(m); });
  const byDate = Object.entries(grouped).sort((a, b) =>
    a[0] === "No date set" ? 1 : b[0] === "No date set" ? -1 : 0
  );

  if (openId) {
    return (
      <AdminLayout title={feed.sport} menu={organizerMenu} enableDarkMode>
        <ScoringView matchId={openId} onBack={() => { setOpenId(null); load(); }} />
      </AdminLayout>
    );
  }

  const Row = ({ m, showDate }) => {
    const ready = m.teamA && m.teamB;
    const d = describeMatch(m, matches);
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
          {d.group && <Badge className={TONE_BADGE[d.tone] || TONE_BADGE.accent}>{d.group}</Badge>}
          <span className="text-muted-foreground text-xs">
            {feed?.sport}
            {m.division && m.division !== "open" ? ` ${DIVISION_LABEL[m.division] || m.division}` : ""}
            {" · "}{d.stage}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Crest team={m.teamA} size={28} />
            <span className={cn("text-sm truncate", ready ? "font-medium" : "text-muted-foreground")}>
              {m.teamA?.teamName || "TBD"}
            </span>
            <span className="text-muted-foreground text-xs shrink-0">vs</span>
            <Crest team={m.teamB} size={28} />
            <span className={cn("text-sm truncate", ready ? "font-medium" : "text-muted-foreground")}>
              {m.teamB?.teamName || "TBD"}
            </span>
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
            {[showDate ? dateOf(m.schedule) : null, time, m.venue, d.note].filter(Boolean).join(" · ")}
          </p>
        )}
      </button>
    );
  };

  return (
    <AdminLayout title={feed.sport || "Matches"} menu={organizerMenu} enableDarkMode>
      <div className="max-w-2xl space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {live.length > 0 && (
          <section>
            <h2 className="flex items-center gap-1.5 font-semibold text-sm mb-2">
              <Radio className="size-4 text-red-500" /> Playing now
            </h2>
            <div className="space-y-2">{live.map((m) => <Row key={m._id} m={m} />)}</div>
          </section>
        )}

        {today.length > 0 && (
          <section>
            <h2 className="flex items-center gap-1.5 font-semibold text-sm mb-2">
              <CalendarClock className="size-4 text-blue-500" />
              Today <span className="text-muted-foreground font-normal">({today.length})</span>
            </h2>
            <div className="space-y-2">{today.map((m) => <Row key={m._id} m={m} />)}</div>
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

        {upcoming.length === 0 && today.length === 0 && live.length === 0 && (
          <p className="text-muted-foreground text-sm">Nothing scheduled.</p>
        )}

        {done.length > 0 && (
          <section>
            <h2 className="flex items-center gap-1.5 font-semibold text-sm mb-2">
              <ListChecks className="size-4 text-green-500" />
              Completed <span className="text-muted-foreground font-normal">({done.length})</span>
            </h2>
            <div className="space-y-2">{done.map((m) => <Row key={m._id} m={m} />)}</div>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
