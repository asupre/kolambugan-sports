import { useEffect, useState } from "react";
import { Building2, CalendarClock, ShieldAlert, Users2 } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
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

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/stats/dashboard")
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

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
