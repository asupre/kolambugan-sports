import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CircleCheck, ClipboardList, FileWarning, Hourglass, Users } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { brgyMenu } from "../../components/menus";
import { SeasonTracker } from "../../components/SeasonStatus";
import { Empty, StatTile, VenueLine, WhenBlock } from "../../components/DashboardBits";
import { WHEN_W, divisionLabel } from "../../lib/dashboardFormat";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Progress } from "../../components/ui/progress";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";
import { AgeChart, PlayerStatusChart, ResultsChart, TeamSizeChart } from "../../components/BrgyCharts";

const TEAM_STATE = {
  draft: { label: "Draft", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  review: { label: "Under review", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  verified: { label: "Verified", cls: "bg-green-500/15 text-green-600 dark:text-green-400" },
};

const sportLine = (t) => [t.sport, divisionLabel(t.division)].filter(Boolean).join(" · ");

function MatchRow({ m, live }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
      {live ? (
        <div className={`${WHEN_W} shrink-0`}>
          <Badge className="bg-red-500/15 text-red-600 dark:text-red-400">Live</Badge>
        </div>
      ) : (
        <WhenBlock schedule={m.schedule} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm break-words">
          <span className="font-medium">{m.mine?.name}</span>
          <span className="text-muted-foreground"> vs </span>
          <span className={cn(!m.opponent && "text-muted-foreground italic")}>{m.opponent?.name || "opponent to be decided"}</span>
        </p>
        <p className="text-xs text-muted-foreground">{sportLine(m)}{m.group ? ` · Group ${m.group}` : ""}</p>
        <VenueLine venue={m.venue} />
      </div>
      {live && (
        <p className="shrink-0 text-sm font-semibold tabular-nums">{m.scoreMine} – {m.scoreOpponent}</p>
      )}
    </div>
  );
}

export default function BrgyHome() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const d = await api("/api/stats/brgy-dashboard");
        if (alive) { setData(d); setError(""); }
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    // Light polling so a match going live / a verification landing shows up
    // without a refresh.
    const timer = setInterval(load, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const p = data?.players;
  const m = data?.matches;
  const entries = data?.entries;
  const entryPct = entries?.required ? Math.round((entries.verified / entries.required) * 100) : 0;

  return (
    <AdminLayout title="Dashboard" menu={brgyMenu} enableDarkMode
      subtitle="Your barangay's teams, players and matches this season, at a glance.">
      <div className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Where the season is, and what that means for a barangay */}
        <Card>
          <CardContent>
            {loading ? (
              <Skeleton className="h-28 w-full" />
            ) : data?.season ? (
              <SeasonTracker status={data.season.status} name={data.season.name} role="barangay_admin" />
            ) : (
              <p className="text-sm text-muted-foreground">No season has been created yet.</p>
            )}
          </CardContent>
        </Card>

        {/* The one thing a barangay can act on */}
        {p?.attention > 0 && (
          <Alert className="border-amber-500/30 bg-amber-500/5">
            <FileWarning className="text-amber-600 dark:text-amber-400" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-foreground">
              <span>
                <span className="font-medium">{p.attention} player{p.attention === 1 ? "" : "s"}</span> on your teams
                {p.attention === 1 ? " needs" : " need"} attention: a name to correct or a document to send.
              </span>
              <Button size="sm" variant="outline" onClick={() => navigate("/brgy/documents")}>
                Open Verification Status <ArrowRight />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Players */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile loading={loading} label="Registered" value={p?.registered} sub="players on your teams" Icon={Users} tone="blue" />
          <StatTile loading={loading} label="Verified" value={p?.verified} sub="cleared by the SK Federation" Icon={CircleCheck} tone="green" />
          <StatTile loading={loading} label="Under review" value={p?.review} sub="submitted, awaiting a verdict" Icon={Hourglass} tone="amber" />
          <StatTile loading={loading} label="Drafts" value={p?.draft} sub="rosters not submitted yet" Icon={ClipboardList} tone="violet" />
        </div>
        {!loading && p && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Each player is counted once: someone on several of your teams counts by their most advanced team.
          </p>
        )}

        {/* Charts (Nov 2026): how the barangay's players and teams stand, and how its games went. */}
        <div className="grid gap-5 lg:grid-cols-2 [&>*]:!mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Players by status</CardTitle>
              <CardDescription>Where your players are in verification.</CardDescription>
            </CardHeader>
            <CardContent>{loading ? <Skeleton className="h-24 w-full" /> : <PlayerStatusChart players={p} />}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Players by age</CardTitle>
              <CardDescription>Each player counted once.</CardDescription>
            </CardHeader>
            <CardContent>{loading ? <Skeleton className="h-44 w-full" /> : <AgeChart ages={data?.ages} />}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Players per team</CardTitle>
              <CardDescription>Roster size of each of your teams.</CardDescription>
            </CardHeader>
            <CardContent>{loading ? <Skeleton className="h-32 w-full" /> : <TeamSizeChart teams={data?.teams} sportLine={sportLine} />}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Wins and losses by sport</CardTitle>
              <CardDescription>Finished games this season, forfeits included.</CardDescription>
            </CardHeader>
            <CardContent>{loading ? <Skeleton className="h-32 w-full" /> : <ResultsChart results={data?.results} />}</CardContent>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 [&>*]:!mt-0">
          {/* Teams */}
          <Card>
            <CardHeader>
              <CardTitle>Your teams</CardTitle>
              {!loading && entries && entries.required > 0 && (
                <CardDescription>
                  {entries.verified} of {entries.required} sport &amp; division entries verified
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {entries?.required > 0 && <Progress value={entryPct} />}
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : data?.teams?.length ? (
                <div className="space-y-2">
                  {data.teams.map((t) => (
                    <div key={t.id} className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium break-words">{t.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sportLine(t)} · {t.playerCount} player{t.playerCount === 1 ? "" : "s"}
                          {t.attention > 0 && <span className="text-amber-600 dark:text-amber-400"> · {t.attention} need attention</span>}
                        </p>
                      </div>
                      <Badge className={cn("self-start sm:self-auto", TEAM_STATE[t.state].cls)}>{TEAM_STATE[t.state].label}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>No teams yet. Register one from My Teams.</Empty>
              )}
              <Button variant="outline" size="sm" onClick={() => navigate("/brgy")}>
                Manage teams <ArrowRight />
              </Button>
            </CardContent>
          </Card>

          {/* Matches */}
          <Card>
            <CardHeader>
              <CardTitle>Matches</CardTitle>
              {!loading && m && (
                <CardDescription>
                  {m.played > 0
                    ? `Played ${m.played} · won ${m.wins} · lost ${m.losses}`
                    : "Nothing played yet."}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  {m?.live?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Playing now</p>
                      {m.live.map((x) => <MatchRow key={x.id} m={x} live />)}
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Upcoming{m?.upcomingTotal > 0 ? ` (${m.upcomingTotal})` : ""}
                    </p>
                    {m?.upcoming?.length ? (
                      m.upcoming.map((x) => <MatchRow key={x.id} m={x} />)
                    ) : (
                      <Empty>
                        {data?.season?.status === "ongoing"
                          ? "No matches scheduled for your teams right now."
                          : "No matches yet. They appear once brackets are drawn and scheduled."}
                      </Empty>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate("/brgy/matches")}>
                    All my matches <ArrowRight />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
