import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  FileWarning,
  KeyRound,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  TriangleAlert,
  UserPlus,
  Users2,
} from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { SeasonTracker } from "../../components/SeasonStatus";
import { Empty, StatTile } from "../../components/DashboardBits";
import { divisionLabel } from "../../lib/dashboardFormat";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Carousel, CarouselContent, CarouselItem, useCarousel } from "../../components/ui/carousel";
import { Progress } from "../../components/ui/progress";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";

const STAGE_LABEL = { group_stage: "Group stage", elimination: "Knockout", completed: "Completed" };

// Color on the ICON only (soft tint in a square) — never a border or the number
// itself; see the note in CLAUDE.md on why the dashboard avoids colored borders.
const TONE = {
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  slate: "bg-muted text-muted-foreground",
};

// What the Super Admin should do, in order of importance. Only real items appear —
// an empty list is a good thing and says so. Each row links to where it's fixed.
function buildAttention(s) {
  if (!s) return [];
  const items = [];
  const add = (tone, Icon, text, to, cta) => items.push({ tone, Icon, text, to, cta });
  const status = s.season?.status;

  if (!s.season) {
    add("red", CalendarClock, "No season has been created yet.", "/admin/season", "Create a season");
    return items;
  }
  if (s.referenceList?.count === 0) {
    add("red", FileWarning, "No reference list is uploaded, so nobody can be checked automatically.", "/admin/reference", "Upload list");
  }
  if (s.accounts?.missingBarangayAdmins > 0) {
    const n = s.accounts.missingBarangayAdmins;
    add("amber", UserPlus, `${n} barangay${n === 1 ? " has" : "s have"} no admin account.`, "/admin/accounts", "Provision accounts");
  }
  if (s.accounts?.missingOrganizers > 0) {
    const n = s.accounts.missingOrganizers;
    add("amber", UserPlus, `${n} sport${n === 1 ? " has" : "s have"} no organizer account.`, "/admin/accounts", "Provision accounts");
  }
  if (s.teamsByState?.review > 0) {
    const n = s.teamsByState.review;
    add("blue", ClipboardCheck, `${n} team${n === 1 ? " is" : "s are"} waiting for your review.`, "/admin/review", "Open Review Queue");
  }
  if (s.playersToReview > 0) {
    const n = s.playersToReview;
    add("amber", ShieldAlert, `${n} player${n === 1 ? " is" : "s are"} flagged or missing a document.`, "/admin/review", "Review players");
  }
  if (status === "verification" || status === "ongoing") {
    const undrawn = (s.sportsProgress || []).flatMap((sp) => sp.divisions.filter((d) => d.verifiedTeams > 0 && !d.tournament).map((d) => `${sp.name} ${divisionLabel(d.division)}`.trim()));
    if (undrawn.length) {
      add("amber", Trophy, `${undrawn.length} sport division${undrawn.length === 1 ? " has" : "s have"} verified teams but no bracket yet (${undrawn.slice(0, 3).join(", ")}${undrawn.length > 3 ? "…" : ""}).`, "/admin/tournaments", "Generate brackets");
    }
  }
  if (status === "ongoing") {
    if (s.matches?.overdue > 0) {
      const n = s.matches.overdue;
      add("red", CalendarClock, `${n} match${n === 1 ? " was" : "es were"} dated for a past day but never played.`, "/admin/tournaments", "Open Tournaments");
    }
    if (s.matches?.undated > 0) {
      const n = s.matches.undated;
      add("amber", CalendarClock, `${n} ready match${n === 1 ? " has" : "es have"} no date yet.`, "/admin/tournaments", "Set dates");
    }
  }
  if (status === "verification" && s.teamsByState?.review === 0 && s.teamsByState?.draft === 0 && s.teamsByState?.verified > 0) {
    add("blue", CircleCheck, "Every team is verified. You can generate brackets and move the season on.", "/admin/season", "Manage season");
  }
  if (s.accounts?.tempPassword > 0) {
    const n = s.accounts.tempPassword;
    add("slate", KeyRound, `${n} account${n === 1 ? " is" : "s are"} still on a temporary password.`, "/admin/accounts", "View accounts");
  }
  return items;
}

function CarouselNav() {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();
  return (
    <div className="flex gap-1 shrink-0">
      <Button size="icon-sm" variant="outline" onClick={scrollPrev} disabled={!canScrollPrev}>
        <ChevronLeft />
      </Button>
      <Button size="icon-sm" variant="outline" onClick={scrollNext} disabled={!canScrollNext}>
        <ChevronRight />
      </Button>
    </div>
  );
}

const timeOf = (d) =>
  new Date(d).toLocaleTimeString([], { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

function GameSlide({ m }) {
  const live = m.status === "ongoing";
  const done = m.status === "completed" || m.status === "forfeited";
  return (
    <div className="rounded-lg border p-4 h-full flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary">{m.sport}</Badge>
        {live ? (
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium">
            <Circle className="size-2 fill-current" /> Live
          </span>
        ) : done ? (
          <span className="text-muted-foreground text-xs font-medium">Final</span>
        ) : (
          <span className="text-muted-foreground text-xs">{timeOf(m.schedule)}</span>
        )}
      </div>

      <p className="font-medium text-sm break-words">
        {m.teamA} <span className="text-muted-foreground font-normal">vs</span> {m.teamB}
      </p>

      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Users2 className="size-4 shrink-0" />
        {m.players} player{m.players === 1 ? "" : "s"} playing
      </div>

      {m.venue && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-auto">
          <MapPin className="size-3 shrink-0" /> {m.venue}
        </p>
      )}
    </div>
  );
}

// One stacked bar split into segments (draft / under review / verified).
function StackedBar({ parts }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return <div className="h-2 rounded-full bg-muted" />;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-muted">
      {parts.filter((p) => p.value > 0).map((p) => (
        <div key={p.label} className={p.cls} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${p.value}`} />
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api("/api/stats/dashboard")
        .then((d) => { if (alive) setStats(d); })
        .catch(() => { if (alive) setStats(null); })
        .finally(() => { if (alive) setLoading(false); });
    load();
    const timer = setInterval(load, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const s = stats;
  const todayMatches = s?.todayMatches || [];
  const attention = buildAttention(s);
  const ts = s?.teamsByState;
  const bp = s?.barangayProgress;
  const m = s?.matches;
  const players = s?.players;

  return (
    <AdminLayout title="Dashboard" menu={superAdminMenu} enableDarkMode>
      <div className="space-y-5">
        {/* Where the season is, and what moves it along */}
        <Card>
          <CardContent>
            {loading ? (
              <Skeleton className="h-28 w-full" />
            ) : s?.season ? (
              <div className="space-y-3">
                <SeasonTracker status={s.season.status} name={s.season.name} role="super_admin" />
                <Button size="sm" variant="outline" onClick={() => navigate("/admin/season")}>
                  Manage season <ArrowRight />
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No season has been created yet.</p>
                <Button size="sm" onClick={() => navigate("/admin/season")}>Create a season <ArrowRight /></Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* What needs doing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {loading || attention.length === 0
                ? <CircleCheck className="size-4 text-green-600 dark:text-green-400" />
                : <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />}
              Needs your attention
              {!loading && attention.length > 0 && (
                <span className="font-normal text-sm text-muted-foreground">({attention.length})</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing needs your attention right now.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {attention.map((a, i) => (
                  <div key={i} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", TONE[a.tone])}>
                        <a.Icon className="size-4" />
                      </span>
                      <p className="text-sm">{a.text}</p>
                    </div>
                    <Button size="sm" variant="outline" className="self-start sm:self-auto" onClick={() => navigate(a.to)}>
                      {a.cta} <ArrowRight />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* The four numbers that actually move */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile loading={loading} label="Teams verified" value={ts ? `${ts.verified}/${s.teams}` : ""} sub={ts ? `${ts.review} under review · ${ts.draft} draft` : ""} Icon={ShieldCheck} tone="green" />
          <StatTile loading={loading} label="Players eligible" value={players ? `${players.eligible}/${players.total}` : ""} sub="roster entries" Icon={Users2} tone="blue" />
          <StatTile loading={loading} label="Barangays cleared" value={bp ? `${bp.cleared}/${bp.total}` : ""} sub="verified in every sport" Icon={Building2} tone="violet" />
          <StatTile loading={loading} label="Matches played" value={m ? `${m.completed}/${m.total}` : ""} sub={m ? `${m.live} live now` : ""} Icon={Trophy} tone="amber" />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left: where registration stands, then today's games */}
          <div className="space-y-5 min-w-0">
          {/* Registration */}
          <Card>
            <CardHeader>
              <CardTitle>Registration</CardTitle>
              <CardDescription>How far teams and barangays have got.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : !s?.season ? (
                <Empty>No season yet.</Empty>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Teams · {s.teams} registered</p>
                    <StackedBar parts={[
                      { label: "Verified", value: ts.verified, cls: "bg-green-500" },
                      { label: "Under review", value: ts.review, cls: "bg-blue-500" },
                      { label: "Draft", value: ts.draft, cls: "bg-amber-400" },
                    ]} />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span><span className="mr-1 inline-block size-2 rounded-full bg-green-500" />{ts.verified} verified</span>
                      <span><span className="mr-1 inline-block size-2 rounded-full bg-blue-500" />{ts.review} under review</span>
                      <span><span className="mr-1 inline-block size-2 rounded-full bg-amber-400" />{ts.draft} draft</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Barangays · {bp.total} in the league</p>
                    <StackedBar parts={[
                      { label: "Cleared", value: bp.cleared, cls: "bg-green-500" },
                      { label: "In progress", value: bp.inProgress, cls: "bg-blue-500" },
                    ]} />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span><span className="mr-1 inline-block size-2 rounded-full bg-green-500" />{bp.cleared} cleared</span>
                      <span><span className="mr-1 inline-block size-2 rounded-full bg-blue-500" />{bp.inProgress} in progress</span>
                      <span><span className="mr-1 inline-block size-2 rounded-full bg-muted-foreground/40" />{bp.notStarted} not started</span>
                    </div>
                    {bp.notStarted > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Not started:</span>{" "}
                        {bp.notStartedNames.join(", ")}
                        {bp.notStarted > bp.notStartedNames.length ? ` and ${bp.notStarted - bp.notStartedNames.length} more` : ""}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Today's games */}
          <Card>
            <CardHeader>
              <CardTitle>
                Today's games
                {!loading && <span className="font-normal text-sm text-muted-foreground ml-1.5">({todayMatches.length})</span>}
              </CardTitle>
              <CardDescription>Player headcount across the league today.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-40 w-full rounded-lg" />
              ) : todayMatches.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing scheduled for today.</p>
              ) : (
                <Carousel opts={{ align: "start" }}>
                  <div className="flex justify-end mb-2">
                    <CarouselNav />
                  </div>
                  <CarouselContent>
                    {todayMatches.map((g) => (
                      <CarouselItem key={g.id} className="sm:basis-1/2">
                        <GameSlide m={g} />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                </Carousel>
              )}
            </CardContent>
          </Card>
          </div>

          {/* Competition */}
          <Card>
            <CardHeader>
              <CardTitle>Competition</CardTitle>
              <CardDescription>Verified teams and bracket progress, by sport.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : !s?.sportsProgress?.length ? (
                <Empty>No sports configured yet.</Empty>
              ) : (
                <div className="divide-y rounded-lg border">
                  {s.sportsProgress.map((sp) => (
                    <div key={sp.id} className="space-y-1.5 px-3 py-2.5">
                      <p className="text-sm font-medium">{sp.name}</p>
                      {sp.divisions.map((d) => {
                        const pct = d.tournament?.total ? Math.round((d.tournament.completed / d.tournament.total) * 100) : 0;
                        return (
                          <div key={d.division} className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[6.5rem_1fr]">
                            <span className="text-muted-foreground">{divisionLabel(d.division) || "Open"}</span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                                <span>{d.verifiedTeams} verified team{d.verifiedTeams === 1 ? "" : "s"}</span>
                                <span className="text-muted-foreground">
                                  {d.tournament
                                    ? `${STAGE_LABEL[d.tournament.stage] || d.tournament.stage} · ${d.tournament.completed}/${d.tournament.total}`
                                    : "No bracket yet"}
                                </span>
                              </div>
                              {d.tournament && <Progress className="mt-1" value={pct} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* The counts that rarely change, kept small */}
        {!loading && s && (
          <p className="text-xs text-muted-foreground">
            {s.barangays} barangays · {s.sports} sports · {s.accounts?.barangayAdmins} barangay admins ·{" "}
            {s.accounts?.organizers} organizers
            {s.referenceList ? ` · ${s.referenceList.count.toLocaleString()} residents on the reference list` : ""}
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
