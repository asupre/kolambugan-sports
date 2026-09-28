import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarCheck, CalendarClock, CircleCheck, Radio, TriangleAlert } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { organizerMenu } from "../../components/menus";
import { SeasonTracker } from "../../components/SeasonStatus";
import { Empty, StatTile, VenueLine, WhenBlock } from "../../components/DashboardBits";
import { WHEN_W, dayKey, divisionLabel, fmtDay, fmtTime, hasTime } from "../../lib/dashboardFormat";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Progress } from "../../components/ui/progress";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";

const STAGE_LABEL = { group_stage: "Group stage", elimination: "Knockout", completed: "Completed" };

// "Group A · Round 2" / "Semifinals" — the round name comes from the API (lib/roundLabels.js).
const roundLabel = (m) => [m.group ? `Group ${m.group}` : null, m.roundLabel].filter(Boolean).join(" · ");

function Side({ team, score, showScore, winner }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <p className={cn("text-sm break-words", !team && "italic text-muted-foreground", winner && "font-semibold")}>
        {team?.name || "To be decided"}
      </p>
      {showScore && <span className="shrink-0 text-sm font-semibold tabular-nums">{score}</span>}
    </div>
  );
}

// One match: when, the two teams stacked (like the public scoreboard), and the
// context line. `showScore` for live and finished matches.
function MatchRow({ m, showScore, timeBadge, tone }) {
  const winA = showScore && m.winner && String(m.winner) === String(m.teamA?.id);
  const winB = showScore && m.winner && String(m.winner) === String(m.teamB?.id);
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5", tone)}>
      {timeBadge || <WhenBlock schedule={m.schedule} />}
      <div className="min-w-0 flex-1 space-y-0.5">
        <Side team={m.teamA} score={m.scoreA} showScore={showScore} winner={winA} />
        <Side team={m.teamB} score={m.scoreB} showScore={showScore} winner={winB} />
        <p className="pt-0.5 text-xs text-muted-foreground">
          {[divisionLabel(m.division), roundLabel(m)].filter(Boolean).join(" · ")}
        </p>
        <VenueLine venue={m.venue} />
      </div>
    </div>
  );
}

export default function OrganizerHome() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const d = await api("/api/stats/organizer-dashboard");
        if (alive) { setData(d); setError(""); }
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const c = data?.counts;
  const openScoring = () => navigate("/organizer");

  // Upcoming matches grouped under their day.
  const byDay = [];
  (data?.upcoming || []).forEach((m) => {
    const key = dayKey(m.schedule);
    const last = byDay[byDay.length - 1];
    if (last && last.key === key) last.items.push(m);
    else byDay.push({ key, when: m.schedule, items: [m] });
  });

  const noMatchesYet = !loading && c && c.total === 0;
  // Live matches already have their own card above, so Today lists the rest.
  const todayRest = (data?.today || []).filter((m) => m.status !== "ongoing");

  return (
    <AdminLayout title="Dashboard" menu={organizerMenu} enableDarkMode>
      <div className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent>
            {loading ? (
              <Skeleton className="h-28 w-full" />
            ) : data?.season ? (
              <div className="space-y-3">
                {data.sport && <p className="text-sm">Your sport: <span className="font-semibold">{data.sport}</span></p>}
                <SeasonTracker status={data.season.status} name={data.season.name} role="organizer" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No season has been created yet.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile loading={loading} label="Today" value={c?.today} sub="matches dated today" Icon={CalendarCheck} tone="blue" />
          <StatTile loading={loading} label="Live now" value={c?.live} sub="being played" Icon={Radio} tone="red" />
          <StatTile loading={loading} label="Coming up" value={c?.upcoming} sub="dated for later" Icon={CalendarClock} tone="violet" />
          <StatTile loading={loading} label="Completed" value={c ? `${c.completed}/${c.total}` : ""} sub="matches finished" Icon={CircleCheck} tone="green" />
        </div>

        {noMatchesYet && (
          <Card>
            <CardContent>
              <Empty>
                No {data?.sport || ""} matches yet.{" "}
                {data?.season?.status === "ongoing"
                  ? "The Super Admin hasn't drawn this sport's bracket."
                  : "Brackets are drawn after verification, then dated by the Super Admin."}
              </Empty>
            </CardContent>
          </Card>
        )}

        {/* Needs attention: dated in the past but never played, and matches with no date */}
        {(c?.overdue > 0 || c?.awaitingDate > 0) && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <TriangleAlert className="size-4" /> Needs attention
              </CardTitle>
              <CardDescription>
                {c.overdue > 0 && `${c.overdue} match${c.overdue === 1 ? " was" : "es were"} dated for a past day but never played. `}
                {c.awaitingDate > 0 && `${c.awaitingDate} ready match${c.awaitingDate === 1 ? " has" : "es have"} no date yet — ask the Super Admin to set one.`}
              </CardDescription>
            </CardHeader>
            {data.overdue.length > 0 && (
              <CardContent className="space-y-2">
                {data.overdue.map((m) => <MatchRow key={m.id} m={m} />)}
              </CardContent>
            )}
          </Card>
        )}

        {data?.live?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Radio className="size-4 text-red-500" /> Playing now</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.live.map((m) => (
                <MatchRow key={m.id} m={m} showScore timeBadge={<div className={`${WHEN_W} shrink-0`}><Badge className="bg-red-500/15 text-red-600 dark:text-red-400">Live</Badge></div>} />
              ))}
              <Button size="sm" onClick={openScoring}>Open scoring <ArrowRight /></Button>
            </CardContent>
          </Card>
        )}

        {c?.total > 0 && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Today</CardTitle>
                <CardDescription>
                  {c.today > 0 ? `${c.today} match${c.today === 1 ? "" : "es"} on today's schedule` : "Nothing dated for today."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {todayRest.length > 0 ? (
                  <>
                    {todayRest.map((m) => (
                      <MatchRow
                        key={m.id}
                        m={m}
                        showScore={m.status === "ongoing"}
                        timeBadge={
                          <div className={`${WHEN_W} shrink-0 text-sm font-semibold leading-tight`}>
                            {m.status === "ongoing" ? <Badge className="bg-red-500/15 text-red-600 dark:text-red-400">Live</Badge>
                              : m.schedule && hasTime(m.schedule) ? fmtTime(m.schedule) : "Today"}
                          </div>
                        }
                      />
                    ))}
                    <Button size="sm" onClick={openScoring}>Open scoring <ArrowRight /></Button>
                  </>
                ) : (
                  <Empty>{c.today > 0 ? "Every match dated today is in play — see above." : "No matches today."}</Empty>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Schedule</CardTitle>
                <CardDescription>
                  {c.upcoming > 0 ? `${c.upcoming} dated match${c.upcoming === 1 ? "" : "es"} still to come` : "No upcoming dates set."}
                  {c.notReady > 0 && ` ${c.notReady} more waiting on earlier results.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {byDay.length > 0 ? (
                  byDay.map((g) => (
                    <div key={g.key} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{fmtDay(g.when)}</p>
                      {g.items.map((m) => (
                        <MatchRow
                          key={m.id}
                          m={m}
                          timeBadge={
                            <div className={`${WHEN_W} shrink-0 text-sm font-semibold leading-tight`}>
                              {hasTime(m.schedule) ? fmtTime(m.schedule) : <span className="text-xs font-normal text-muted-foreground">All day</span>}
                            </div>
                          }
                        />
                      ))}
                    </div>
                  ))
                ) : (
                  <Empty>No dated matches ahead.</Empty>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {data?.tournaments?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bracket progress</CardTitle>
              <CardDescription>{c.teams} verified team{c.teams === 1 ? "" : "s"} in {data.sport}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {data.tournaments.map((t) => (
                <div key={t.division} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{divisionLabel(t.division) || "Open"}</p>
                    <p className="text-xs text-muted-foreground">{STAGE_LABEL[t.stage] || t.stage}</p>
                  </div>
                  <Progress value={t.total ? Math.round((t.completed / t.total) * 100) : 0} />
                  <p className="text-xs text-muted-foreground">{t.completed} of {t.total} matches played</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {data?.recent?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recent.map((m) => (
                <MatchRow key={m.id} m={m} showScore timeBadge={<div className={`${WHEN_W} shrink-0 text-xs text-muted-foreground leading-tight`}>{m.status === "forfeited" ? "Forfeit" : "Final"}</div>} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
