import { useEffect, useState } from "react";
import { CalendarClock, Circle, Inbox, ListChecks, MapPin, Radio } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { brgyMenu } from "../../components/menus";
import { api } from "../../api";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";
import { hasTime } from "../../lib/dashboardFormat";

function MatchRowSkeleton() {
  return (
    <div className="rounded-lg border px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-10" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-3 w-6" />
        <Skeleton className="h-4 flex-1" />
      </div>
    </div>
  );
}

const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls",
  under15: "Under 15", under30: "Under 30",
};

// Only show a time when one was actually chosen (see hasTime: date-only schedules are
// midnight Manila/UTC and must not render as a made-up "12:00 AM").

const dateOf = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, {
    timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric",
  }) : "Date to be confirmed";

const timeOf = (d) =>
  d && hasTime(d)
    ? new Date(d).toLocaleTimeString([], { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })
    : null;

const context = (m) =>
  [m.sport, DIVISION_LABEL[m.division] || m.division, m.group ? `Group ${m.group}` : null, m.roundLabel]
    .filter(Boolean).join(" · ");

function MatchRow({ m, myTeamIds }) {
  const mine = (t) => t && myTeamIds.has(String(t.id));
  const done = ["completed", "forfeited"].includes(m.status);
  const live = m.status === "ongoing";
  const won = done && m.winner && myTeamIds.has(String(m.winner));

  const Side = ({ team, score }) => (
    <div className={cn("flex items-center gap-2 min-w-0", !mine(team) && "text-muted-foreground")}>
      <span className={cn("truncate text-sm", mine(team) && "font-medium text-foreground")}>
        {team?.name || "TBD"}
      </span>
      {(done || live) && (
        <span className="text-sm font-semibold tabular-nums shrink-0">{score}</span>
      )}
    </div>
  );

  return (
    <div className="rounded-lg border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-xs text-muted-foreground truncate">{context(m)}</span>
        {live ? (
          <span className="flex items-center gap-1 text-red-600 text-xs font-semibold shrink-0">
            <Circle className="size-2 fill-current" /> LIVE
          </span>
        ) : done ? (
          <Badge className={cn("shrink-0", won ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-red-500/15 text-red-600 dark:text-red-400")}>
            {won ? "Won" : "Lost"}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground shrink-0">{timeOf(m.schedule) || "Time TBD"}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0"><Side team={m.teamA} score={m.scoreA} /></div>
        <span className="text-xs text-muted-foreground shrink-0">vs</span>
        <div className="flex-1 min-w-0"><Side team={m.teamB} score={m.scoreB} /></div>
      </div>

      {m.venue && !done && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
          <MapPin className="size-3" /> {m.venue}
        </p>
      )}
    </div>
  );
}

export default function BrgyMatches() {
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        // Match data is public, so there's no barangay-scoped endpoint to build —
        // /teams/mine says which teams are ours, and we filter the public feed.
        const [mine, pub] = await Promise.all([
          api("/api/teams/mine"),
          api("/api/public/matches"),
        ]);
        if (!alive) return;
        setTeams(mine.teams || []);
        setMatches(pub.matches || []);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 20000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const myTeamIds = new Set(teams.map((t) => String(t._id)));
  const ours = matches.filter(
    (m) => myTeamIds.has(String(m.teamA?.id)) || myTeamIds.has(String(m.teamB?.id))
  );

  const live = ours.filter((m) => m.status === "ongoing");
  const upcoming = ours.filter((m) => m.status === "scheduled");
  const done = ours.filter((m) => m.status === "completed" || m.status === "forfeited").reverse();

  // Upcoming groups by date; undated fixtures fall into their own bucket at the end.
  const byDate = {};
  upcoming.forEach((m) => { (byDate[dateOf(m.schedule)] = byDate[dateOf(m.schedule)] || []).push(m); });
  const dateKeys = Object.keys(byDate).sort((a, b) =>
    a === "Date to be confirmed" ? 1 : b === "Date to be confirmed" ? -1 : 0
  );

  const wins = done.filter((m) => m.winner && myTeamIds.has(String(m.winner))).length;

  return (
    <AdminLayout title="Matches" menu={brgyMenu} enableDarkMode
      subtitle="Your barangay's games: when and where, live scores and results.">
      {loading ? (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-3.5 w-full" />
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="space-y-2">
              <MatchRowSkeleton />
              <MatchRowSkeleton />
              <MatchRowSkeleton />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle>Your barangay's matches</CardTitle>
              <CardDescription>
                Every match involving one of your teams this season. Scores are entered
                courtside by the organizer and appear here as they're played.
              </CardDescription>
            </CardHeader>
            {done.length > 0 && (
              <CardContent>
                <p className="text-sm">
                  {wins} won · {done.length - wins} lost · {upcoming.length} still to play
                </p>
              </CardContent>
            )}
          </Card>

          {ours.length === 0 && (
            <Card>
              <CardContent className="flex items-center gap-3 text-muted-foreground text-sm">
                <Inbox className="size-5 shrink-0" />
                No matches yet. Fixtures appear once your teams are verified and the
                SK Federation has drawn the tournament.
              </CardContent>
            </Card>
          )}

          {live.length > 0 && (
            <Card className="border-l-4 border-l-red-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="size-4 text-red-500" />
                  Playing now <span className="font-normal text-sm text-muted-foreground">({live.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {live.map((m) => <MatchRow key={m.id} m={m} myTeamIds={myTeamIds} />)}
              </CardContent>
            </Card>
          )}

          {upcoming.length > 0 && (
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-blue-500" />
                  Upcoming <span className="font-normal text-sm text-muted-foreground">({upcoming.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {dateKeys.map((date) => (
                  <div key={date}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">{date}</p>
                    <div className="space-y-2">
                      {byDate[date].map((m) => <MatchRow key={m.id} m={m} myTeamIds={myTeamIds} />)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {done.length > 0 && (
            <Card className="border-l-4 border-l-green-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="size-4 text-green-500" />
                  Results <span className="font-normal text-sm text-muted-foreground">({done.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {done.map((m) => <MatchRow key={m.id} m={m} myTeamIds={myTeamIds} />)}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
