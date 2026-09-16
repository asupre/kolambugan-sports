import { useEffect, useState } from "react";
import {
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Circle,
  MapPin,
  ShieldAlert,
  Trophy,
  UserCog,
  Users2,
  Whistle,
} from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Carousel, CarouselContent, CarouselItem, useCarousel } from "../../components/ui/carousel";
import { Skeleton } from "../../components/ui/skeleton";

function StatCard({ label, value, sub, loading, Icon, accent }) {
  return (
    <Card className={`border-l-4 ${accent}`}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-16 mt-1.5" />
          ) : (
            <p className="text-2xl font-semibold mt-1 truncate">{value}</p>
          )}
          {sub && <p className="text-muted-foreground text-xs mt-1">{sub}</p>}
        </div>
        <Icon className="size-5 text-muted-foreground shrink-0" />
      </CardContent>
    </Card>
  );
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
        <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400">{m.sport}</Badge>
        {live ? (
          <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 gap-1">
            <Circle className="size-2 fill-current" /> LIVE
          </Badge>
        ) : done ? (
          <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">Final</Badge>
        ) : (
          <span className="text-muted-foreground text-xs">{timeOf(m.schedule)}</span>
        )}
      </div>

      <p className="font-medium text-sm truncate">
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

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/stats/dashboard")
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const todayMatches = stats?.todayMatches || [];

  return (
    <AdminLayout title="Dashboard" menu={superAdminMenu} enableDarkMode>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Current season"
          value={stats?.season ? stats.season.name : "None"}
          sub={stats?.season ? `Status: ${stats.season.status}` : "No active season"}
          loading={loading}
          Icon={CalendarClock}
          accent="border-l-blue-500"
        />
        <StatCard
          label="Teams registered"
          value={stats?.teams ?? 0}
          loading={loading}
          Icon={Users2}
          accent="border-l-green-500"
        />
        <StatCard
          label="Players to review"
          value={stats?.playersToReview ?? 0}
          sub="Flagged or needs document"
          loading={loading}
          Icon={ShieldAlert}
          accent="border-l-amber-500"
        />
        <StatCard
          label="Barangays"
          value={stats?.barangays ?? 0}
          loading={loading}
          Icon={Building2}
          accent="border-l-primary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="space-y-4">
          <StatCard
            label="Sports"
            value={stats?.sports ?? 0}
            loading={loading}
            Icon={Trophy}
            accent="border-l-blue-500"
          />
          <StatCard
            label="Barangay admins"
            value={stats?.accounts?.barangayAdmins ?? 0}
            loading={loading}
            Icon={UserCog}
            accent="border-l-green-500"
          />
          <StatCard
            label="Organizers"
            value={stats?.accounts?.organizers ?? 0}
            loading={loading}
            Icon={Whistle}
            accent="border-l-amber-500"
          />
        </div>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Circle className="size-3 fill-current text-red-500" />
              Today's games
              {!loading && <span className="font-normal text-sm text-muted-foreground">({todayMatches.length})</span>}
            </CardTitle>
            <CardDescription>How many players are on court across the league today.</CardDescription>
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
                  {todayMatches.map((m) => (
                    <CarouselItem key={m.id}>
                      <GameSlide m={m} />
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>
            Use the sidebar to manage the season, upload the reference list, review players,
            run tournaments, and provision accounts.
          </CardDescription>
        </CardHeader>
      </Card>
    </AdminLayout>
  );
}
