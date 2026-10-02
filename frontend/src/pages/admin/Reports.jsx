import { useEffect, useState } from "react";
import { Printer, Trophy } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";

const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls",
  under15: "Under 15", under30: "Under 30",
};

// Win/loss across EVERY completed match in a tournament — group stage and
// knockout together. This is a record of results, not a competition standing:
// the bracket decides the champion, and a team can finish high here without
// winning, so the champion is named separately above each table.
function rankTeams(matches) {
  const rows = {};
  const see = (t) => {
    if (!t) return null;
    const id = String(t.id);
    rows[id] = rows[id] || { id, name: t.name, wins: 0, losses: 0, played: 0 };
    return rows[id];
  };

  matches.forEach((m) => {
    const a = see(m.teamA), b = see(m.teamB);
    if (!["completed", "forfeited"].includes(m.status) || !m.winner) return;
    [a, b].forEach((row) => {
      if (!row) return;
      row.played += 1;
      if (row.id === String(m.winner)) row.wins += 1;
      else row.losses += 1;
    });
  });

  return Object.values(rows).sort(
    (x, y) => y.wins - x.wins || x.losses - y.losses || x.name.localeCompare(y.name)
  );
}

function championOf(matches) {
  // The final is the knockout match with no group and no onward pointer.
  const final = matches.find(
    (m) => !m.group && !(m.bracket || "").includes("third") &&
      !m.nextMatchWin && ["completed", "forfeited"].includes(m.status) && m.winner
  );
  if (!final) return null;
  const side = [final.teamA, final.teamB].find((t) => t && String(t.id) === String(final.winner));
  return side?.name || null;
}

function TournamentTable({ s }) {
  return (
    <Card className="print-block print-plain mb-6">
      <CardHeader>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <CardTitle>
            {s.sport}
            <span className="font-normal text-sm text-muted-foreground ml-2">
              {DIVISION_LABEL[s.division] || s.division}
            </span>
          </CardTitle>
          <span className="text-muted-foreground text-xs">{s.played} of {s.total} matches played</span>
        </div>
        <CardDescription>
          {s.champion ? (
            <span className="flex items-center gap-1.5 text-foreground">
              <Trophy className="size-3.5 text-amber-500" />
              Champion: <span className="font-medium">{s.champion}</span>
            </span>
          ) : (
            "Not yet decided: tournament in progress."
          )}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {s.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No teams yet.</p>
        ) : (
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-medium w-10">#</th>
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium text-center w-14">P</th>
                <th className="px-3 py-2 font-medium text-center w-14">W</th>
                <th className="px-3 py-2 font-medium text-center w-14">L</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {s.rows.map((row, i) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{row.played}</td>
                  <td className="px-3 py-2 text-center tabular-nums font-semibold">{row.wins}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{row.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const [sections, setSections] = useState([]);
  const [season, setSeason] = useState(null);
  const [sport, setSport] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [overview, list] = await Promise.all([
          api("/api/public/overview"),
          api("/api/public/tournaments"),
        ]);
        if (!alive) return;
        setSeason(overview.season);

        const tournaments = list.tournaments || [];
        const loaded = await Promise.all(
          tournaments.map(async (t) => {
            const d = await api(`/api/public/bracket?tournament=${t.id}`).catch(() => null);
            const matches = d?.matches || [];
            return {
              ...t,
              rows: rankTeams(matches),
              champion: championOf(matches),
              played: matches.filter((m) => ["completed", "forfeited"].includes(m.status)).length,
              total: matches.length,
            };
          })
        );
        if (!alive) return;

        loaded.sort((a, b) =>
          a.sport.localeCompare(b.sport) || String(a.division).localeCompare(String(b.division))
        );
        setSections(loaded);
        setSport(loaded[0]?.sport || "");
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const sports = [...new Set(sections.map((s) => s.sport))].sort();
  const shown = sections.filter((s) => s.sport === sport);

  const printedOn = new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <AdminLayout title="Reports" menu={superAdminMenu} enableDarkMode>
      {/* Tabs are for reading. The printout is the WHOLE season — a records
          report handed to the SK Federation shouldn't depend on which tab
          happened to be open. */}
      <style>{`
        @media print {
          @page { margin: 14mm; }
          body { background: #fff; }
          .no-print { display: none !important; }
          .screen-only { display: none !important; }
          .print-only { display: block !important; }
          /* A whole table must NOT be "avoid break": one taller than what's left of
             the page got pushed to the next, leaving page 1 blank under the title.
             Tables break between rows; the heading stays with the first rows and
             the column header repeats on each page. */
          .print-block { display: block !important; break-inside: auto; overflow: visible !important; }
          .print-block [data-slot="card-header"] { break-after: avoid; page-break-after: avoid; }
          .print-block thead { display: table-header-group; }
          .print-block tr { break-inside: avoid; page-break-inside: avoid; }
          .print-plain { border: none !important; box-shadow: none !important; padding: 0 !important; }
        }
      `}</style>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <Alert variant="destructive" className="no-print">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card className="no-print">
            <CardContent className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="font-semibold mb-1">Season records</h2>
                <p className="text-muted-foreground text-sm">
                  Every registered team, ranked by wins across the whole tournament:
                  group stage and knockout combined. This is a record of results, not the
                  competition standing: the bracket decides the title, so the champion is
                  named above each table. Printing produces every sport, not just the one
                  on screen.
                </p>
              </div>
              <Button onClick={() => window.print()}>
                <Printer /> Print / Save as PDF
              </Button>
            </CardContent>
          </Card>

          {/* Printed header — paper only. */}
          <div className="hidden print-only mb-4">
            <h1 className="text-xl font-semibold">Inter-Barangay Sports League: Season Records</h1>
            <p className="text-sm text-muted-foreground">
              {season?.name || "Current season"} · Municipality of Kolambugan · Printed {printedOn}
            </p>
          </div>

          {sections.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground text-sm">
                No tournaments have been generated this season yet.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex gap-4 overflow-x-auto scrollbar-thin border-b no-print">
                {sports.map((s) => (
                  <button key={s} onClick={() => setSport(s)}
                    className={cn(
                      "px-1 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition",
                      sport === s ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
                    )}>
                    {s}
                  </button>
                ))}
              </div>

              {/* On screen: the selected sport. */}
              <div className="screen-only">
                {shown.map((s) => <TournamentTable key={s.id} s={s} />)}
              </div>

              {/* On paper: everything, grouped by sport. */}
              <div className="hidden print-only">
                {sports.map((name) => (
                  <div key={name} className="mb-2">
                    {sections.filter((s) => s.sport === name).map((s) => (
                      <TournamentTable key={s.id} s={s} />
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
