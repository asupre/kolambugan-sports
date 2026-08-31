import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { Button, Card } from "../../components/ui";
import { superAdminMenu } from "../../components/menus";

const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls",
  under17: "Under 17", under30: "Under 30",
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
    if (m.status !== "completed" || !m.winner) return;
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
      !m.nextMatchWin && m.status === "completed" && m.winner
  );
  if (!final) return null;
  const side = [final.teamA, final.teamB].find((t) => t && String(t.id) === String(final.winner));
  return side?.name || null;
}

function TournamentTable({ s }) {
  return (
    <Card className="p-5 print-block print-plain mb-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h3 className="text-slate-800 font-semibold">
          {s.sport}
          <span className="text-slate-400 font-normal text-sm ml-2">
            {DIVISION_LABEL[s.division] || s.division}
          </span>
        </h3>
        <span className="text-slate-400 text-xs">{s.played} of {s.total} matches played</span>
      </div>

      <p className="text-sm mb-3">
        {s.champion ? (
          <>
            <span className="text-slate-500">Champion: </span>
            <span className="text-slate-800 font-medium">{s.champion}</span>
          </>
        ) : (
          <span className="text-slate-400">Not yet decided — tournament in progress.</span>
        )}
      </p>

      {s.rows.length === 0 ? (
        <p className="text-slate-500 text-sm">No teams yet.</p>
      ) : (
        <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-3 py-2 font-medium w-10">#</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium text-center w-14">P</th>
              <th className="px-3 py-2 font-medium text-center w-14">W</th>
              <th className="px-3 py-2 font-medium text-center w-14">L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {s.rows.map((row, i) => (
              <tr key={row.id} className="text-slate-700">
                <td className="px-3 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2 text-center tabular-nums text-slate-500">{row.played}</td>
                <td className="px-3 py-2 text-center tabular-nums font-semibold">{row.wins}</td>
                <td className="px-3 py-2 text-center tabular-nums text-slate-500">{row.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
              played: matches.filter((m) => m.status === "completed").length,
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
    <AdminLayout title="Reports" menu={superAdminMenu}>
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
          .print-block { break-inside: avoid; page-break-inside: avoid; }
          .print-plain { border: none !important; box-shadow: none !important; padding: 0 !important; }
        }
      `}</style>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="max-w-4xl space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 no-print">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <Card className="p-5 no-print">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="text-slate-800 font-semibold mb-1">Season records</h2>
                <p className="text-slate-500 text-sm">
                  Every registered team, ranked by wins across the whole tournament —
                  group stage and knockout combined. This is a record of results, not the
                  competition standing: the bracket decides the title, so the champion is
                  named above each table. Printing produces every sport, not just the one
                  on screen.
                </p>
              </div>
              <Button onClick={() => window.print()}>Print / Save as PDF</Button>
            </div>
          </Card>

          {/* Printed header — paper only. */}
          <div className="hidden print-only mb-4">
            <h1 className="text-xl font-semibold">Inter-Barangay Sports League — Season Records</h1>
            <p className="text-sm text-slate-600">
              {season?.name || "Current season"} · Municipality of Kolambugan · Printed {printedOn}
            </p>
          </div>

          {sections.length === 0 ? (
            <Card className="p-5">
              <p className="text-slate-500 text-sm">
                No tournaments have been generated this season yet.
              </p>
            </Card>
          ) : (
            <>
              <div className="flex gap-4 overflow-x-auto border-b border-slate-200 no-print">
                {sports.map((s) => (
                  <button key={s} onClick={() => setSport(s)}
                    className={`px-1 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                      sport === s
                        ? "text-indigo-700 border-indigo-600"
                        : "text-slate-500 border-transparent hover:text-slate-700"
                    }`}>
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