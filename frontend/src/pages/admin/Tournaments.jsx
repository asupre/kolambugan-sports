import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { Button, Card } from "../../components/ui";

const superAdminMenu = [
  { label: "Dashboard", path: "/admin", icon: "▦" },
  { label: "Season", path: "/admin/season", icon: "◷" },
  { label: "Reference List", path: "/admin/reference", icon: "☑" },
  { label: "Review Queue", path: "/admin/review", icon: "⚑" },
  { label: "Tournaments", path: "/admin/tournaments", icon: "⛃" },
  { label: "Accounts", path: "/admin/accounts", icon: "☺" },
];

function StandingsView({ tournamentId }) {
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api(`/api/tournaments/${tournamentId}/standings`)
      .then((data) => { if (active) setGroups(data.groups || {}); })
      .catch(() => { if (active) setGroups({}); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tournamentId]);

  if (loading) return <p className="text-slate-500 text-sm">Loading standings…</p>;
  if (!groups || Object.keys(groups).length === 0)
    return <p className="text-slate-500 text-sm">No standings yet.</p>;

  return (
    <div className="space-y-6">
      {Object.entries(groups).filter(([name]) => name !== "-").map(([groupName, table]) => (
        <div key={groupName}>
          <h3 className="text-slate-700 font-medium text-sm mb-2">Group {groupName}</h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium w-8">#</th>
                  <th className="px-3 py-2 font-medium">Team</th>
                  <th className="px-3 py-2 font-medium text-center">P</th>
                  <th className="px-3 py-2 font-medium text-center">W</th>
                  <th className="px-3 py-2 font-medium text-center">L</th>
                  <th className="px-3 py-2 font-medium text-center">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.map((row, i) => (
                  <tr key={row.teamId} className="text-slate-700">
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{row.teamName}</td>
                    <td className="px-3 py-2 text-center">{row.played}</td>
                    <td className="px-3 py-2 text-center">{row.wins}</td>
                    <td className="px-3 py-2 text-center">{row.losses}</td>
                    <td className="px-3 py-2 text-center font-semibold">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchesView({ tournamentId, onScored }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState({});   // { matchId: { a, b } }
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api(`/api/tournaments/${tournamentId}/matches`);
      // only group-stage matches here
      setMatches((data.matches || []).filter((m) => m.bracket === "group"));
    } catch (e) {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tournamentId]);

  async function submitScore(matchId) {
    const s = scores[matchId];
    if (!s || s.a === "" || s.b === "" || s.a == null || s.b == null) return;
    setBusyId(matchId);
    setError("");
    try {
      await api(`/api/tournaments/matches/${matchId}/result`, {
        method: "POST",
        body: JSON.stringify({ scoreA: Number(s.a), scoreB: Number(s.b) }),
      });
      await load();
      onScored && onScored(); // refresh standings above
    } catch (e) {
      setError(e.message); // e.g. "cannot end in a tie"
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">Loading matches…</p>;
  if (matches.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-slate-700 font-medium text-sm mb-2">Group matches</h3>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
      <div className="space-y-2">
        {matches.map((m) => {
          const done = m.status === "completed";
          const s = scores[m._id] || { a: "", b: "" };
          return (
            <div key={m._id} className="flex items-center gap-2 flex-wrap border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <span className="text-slate-400 text-xs w-14">Grp {m.group} R{m.round}</span>
              <span className="flex-1 min-w-0 text-slate-700 text-right truncate">{m.teamA?.teamName}</span>
              {done ? (
                <span className="font-semibold text-slate-900 px-2">
                  {m.games?.[0]?.scoreA} – {m.games?.[0]?.scoreB}
                </span>
              ) : (
                <>
                  <input
                    type="number" min="0" value={s.a}
                    onChange={(e) => setScores({ ...scores, [m._id]: { ...s, a: e.target.value } })}
                    className="w-12 rounded border border-slate-300 px-2 py-1 text-center"
                  />
                  <span className="text-slate-400">–</span>
                  <input
                    type="number" min="0" value={s.b}
                    onChange={(e) => setScores({ ...scores, [m._id]: { ...s, b: e.target.value } })}
                    className="w-12 rounded border border-slate-300 px-2 py-1 text-center"
                  />
                </>
              )}
              <span className="flex-1 min-w-0 text-slate-700 truncate">{m.teamB?.teamName}</span>
              {!done && (
                <button
                  onClick={() => submitScore(m._id)}
                  disabled={busyId === m._id}
                  className="text-xs font-medium px-3 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busyId === m._id ? "…" : "Save"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function TournamentDetail({ tournamentId, stage, onBracketGenerated }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [qualification, setQualification] = useState(null);
 const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [simulating, setSimulating] = useState(false);

  async function simulateGroups() {
    setSimulating(true);
    try {
      await api(`/api/tournaments/${tournamentId}/simulate-groups`, { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e.message);
    } finally {
      setSimulating(false);
    }
  }

  async function loadQualification() {
    try {
      const data = await api(`/api/tournaments/${tournamentId}/qualification`);
      setQualification(data);
    } catch (e) {
      setQualification(null);
    }
  }

  useEffect(() => { loadQualification(); }, [tournamentId, refreshKey]);

  // Are all groups complete with no unresolved ties?
  const groups = qualification?.groups || {};
  const groupList = Object.entries(groups);
  const allComplete = groupList.length > 0 && groupList.every(([, g]) => g.complete);
  const anyNeedsTiebreaker = groupList.some(([, g]) => g.needsTiebreaker);
  const qualifiedTeams = groupList.flatMap(([, g]) => g.qualified || []);

  async function generateBracket() {
    setBusy(true);
    setError("");
    try {
      // Gather the qualified team IDs. The qualification endpoint returns names;
      // we need IDs, so we read them from the standings.
      const standings = await api(`/api/tournaments/${tournamentId}/standings`);
      const ids = [];
      for (const [groupName, g] of Object.entries(qualification.groups)) {
        const table = standings.groups[groupName] || [];
        const advance = qualification.advancePerGroup || 2;
        table.slice(0, advance).forEach((row) => ids.push(row.teamId));
      }
      await api(`/api/tournaments/${tournamentId}/bracket`, {
        method: "POST",
        body: JSON.stringify({ teamIds: ids }),
      });
      onBracketGenerated && onBracketGenerated();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {stage === "elimination" || stage === "completed" ? (
        <BracketView tournamentId={tournamentId} />
      ) : (
        <>
        <div className="mb-4">
            <button
              onClick={simulateGroups}
              disabled={simulating}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-dashed border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 transition"
            >
              {simulating ? "Simulating…" : "⚡ Dev: Auto-score all group matches"}
            </button>
          </div>
          <StandingsView tournamentId={tournamentId} key={`s-${refreshKey}`} />
          <MatchesView tournamentId={tournamentId} key={`m-${refreshKey}`} onScored={() => setRefreshKey((k) => k + 1)} />
          {allComplete && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <h3 className="text-slate-800 font-semibold mb-1">Group stage complete</h3>
              {anyNeedsTiebreaker ? (
                <p className="text-amber-600 text-sm">
                  Some groups have a tie for the last qualifying spot. Resolve tiebreakers first.
                </p>
              ) : (
                <>
                  <p className="text-slate-500 text-sm mb-3">
                    {qualifiedTeams.length} teams qualified: {qualifiedTeams.join(", ")}.
                  </p>
                  {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3">
                      <p className="text-red-600 text-sm">{error}</p>
                    </div>
                  )}
                  <Button onClick={generateBracket} disabled={busy}>
                    {busy ? "Generating…" : `Generate Knockout Bracket (${qualifiedTeams.length} teams)`}
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BracketView({ tournamentId }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api(`/api/tournaments/${tournamentId}/bracket`);
      setMatches(data.matches || []);
    } catch (e) {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tournamentId]);

  if (loading) return <p className="text-slate-500 text-sm">Loading bracket…</p>;
  if (matches.length === 0) return <p className="text-slate-500 text-sm">No bracket yet.</p>;

  // Group matches by bracket, then by round.
  const sections = [
    { key: "winners", label: "Bracket" },
    { key: "losers", label: "Losers Bracket" },
    { key: "final", label: "Grand Final" },
    { key: "third", label: "3rd Place Match" },
  ];

 function MatchBox({ m, onScored }) {
    const [a, setA] = useState("");
    const [b, setB] = useState("");
    const [busy, setBusy] = useState(false);
    const done = m.status === "completed";
    const ready = m.teamA && m.teamB && !done;
    const winnerId = m.seriesWinner?._id || m.seriesWinner;
    const aName = m.teamA?.teamName || "TBD";
    const bName = m.teamB?.teamName || "TBD";
    const aWin = done && String(winnerId) === String(m.teamA?._id);
    const bWin = done && String(winnerId) === String(m.teamB?._id);
    // Show the actual score entered (stored as a single game with scoreA/scoreB),
    // not a count of games won.
    const g0 = (m.games && m.games[0]) || null;
    const aScore = g0 ? g0.scoreA : 0;
    const bScore = g0 ? g0.scoreB : 0;
    async function save() {
      if (a === "" || b === "") return;
      setBusy(true);
      try {
        await api(`/api/tournaments/matches/${m._id}/result`, {
          method: "POST",
          body: JSON.stringify({ scoreA: Number(a), scoreB: Number(b) }),
        });
        onScored && onScored();
      } catch (e) {
        alert(e.message);
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden text-sm w-56 shrink-0">
        {/* Team A row */}
        <div className={`flex items-center gap-2 px-3 py-2 ${aWin ? "bg-green-50 font-semibold" : ""}`}>
          <span className="truncate text-slate-700 flex-1">{aName}</span>
          {done ? (
            <span className="text-slate-600 font-medium w-6 text-center">{aScore}</span>
          ) : ready ? (
            <input type="number" min="0" value={a} onChange={(e) => setA(e.target.value)}
              className="w-8 rounded border border-slate-300 px-1 py-0.5 text-center text-xs" />
          ) : (
            <span className="w-6" />
          )}
        </div>

        <div className="border-t border-slate-100" />

        {/* Team B row */}
        <div className={`flex items-center gap-2 px-3 py-2 ${bWin ? "bg-green-50 font-semibold" : ""}`}>
          <span className="truncate text-slate-700 flex-1">{bName}</span>
          {done ? (
            <span className="text-slate-600 font-medium w-6 text-center">{bScore}</span>
          ) : ready ? (
            <input type="number" min="0" value={b} onChange={(e) => setB(e.target.value)}
              className="w-8 rounded border border-slate-300 px-1 py-0.5 text-center text-xs" />
          ) : (
            <span className="w-6" />
          )}
        </div>

        {/* Save button row — only when ready to score */}
        {ready && (
          <div className="px-2 py-1.5 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button onClick={save} disabled={busy}
              className="text-xs font-medium px-3 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy ? "…" : "Save"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const secMatches = matches.filter((m) => m.bracket === section.key);
        if (secMatches.length === 0) return null;
        const rounds = [...new Set(secMatches.map((m) => m.round))].sort((a, b) => a - b);
        return (
          <div key={section.key}>
            <h3 className="text-slate-800 font-semibold mb-3">{section.label}</h3>
            <div className="overflow-x-auto">
              <div className="flex gap-6 min-w-min pb-2">
                {rounds.map((r) => (
                  <div key={r} className="flex flex-col gap-3 justify-around">
                    <p className="text-slate-400 text-xs font-medium">Round {r}</p>
                    {secMatches.filter((m) => m.round === r).map((m) => (
                      <MatchBox key={m._id} m={m} onScored={load} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Tournaments() {
  const [sports, setSports] = useState([]);
  const [selectedSport, setSelectedSport] = useState(null);
  const [tournaments, setTournaments] = useState([]);   // existing tournaments this season
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [numGroups, setNumGroups] = useState(4);

  // Load sports + existing tournaments once.
  async function loadAll() {
    setLoading(true);
    try {
      const [sportsData, tourneyData] = await Promise.all([
        api("/api/sports"),
        api("/api/tournaments"),
      ]);
      setSports(sportsData.sports || []);
      setTournaments(tourneyData.tournaments || []);
      if (!selectedSport && sportsData.sports?.length) {
        setSelectedSport(sportsData.sports[0]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  // The tournament (if any) for the currently selected sport.
  const currentTournament = tournaments.find(
    (t) => t.sport && (t.sport._id === selectedSport?._id || t.sport === selectedSport?._id)
  );

  const isMobileLegends = selectedSport?.name === "Mobile Legends";

  async function generate() {
    if (!selectedSport) return;
    setBusy(true);
    setError("");
    try {
      const body = { sportId: selectedSport._id };
      if (isMobileLegends) {
        body.numGroups = Number(numGroups);
        body.advancePerGroup = 2;
      }
      await api("/api/tournaments/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await loadAll(); // refresh to show the new tournament
    } catch (e) {
      setError(e.message); // e.g. "Need at least 2 verified teams"
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout title="Tournaments" menu={superAdminMenu}>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="max-w-5xl space-y-6">
          {/* Sport picker */}
          <Card className="p-5">
            <p className="text-slate-500 text-sm mb-3">Select a sport to manage its tournament</p>
            <div className="flex flex-wrap gap-2">
              {sports.map((s) => (
                <button
                  key={s._id}
                  onClick={() => { setSelectedSport(s); setError(""); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    selectedSport?._id === s._id
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </Card>

          {/* Selected sport's tournament state */}
          {selectedSport && (
            <Card className="p-6">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <h2 className="text-slate-800 font-semibold text-lg">{selectedSport.name}</h2>
                {currentTournament && (
                  <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium">
                    {currentTournament.format === "round_robin" ? "Group stage" : "Elimination"} · {currentTournament.stage}
                  </span>
                )}
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-4">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              {!currentTournament ? (
                // No tournament yet — offer to generate.
                <div>
                  <p className="text-slate-500 text-sm mb-4">
                    No tournament generated for {selectedSport.name} yet. Generate one from the
                    verified teams. {isMobileLegends
                      ? "Mobile Legends uses a grouped round-robin."
                      : "This sport uses double-elimination."}
                  </p>

                  {isMobileLegends && (
                    <div className="mb-4">
                      <label className="block text-slate-700 text-sm font-medium mb-1.5">
                        Number of groups
                      </label>
                      <select
                        value={numGroups}
                        onChange={(e) => setNumGroups(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                      >
                        {[2, 3, 4, 6, 8, 16].map((n) => (
                          <option key={n} value={n}>{n} groups</option>
                        ))}
                      </select>
                      <p className="text-slate-400 text-xs mt-1">Top 2 of each group advance to the knockout.</p>
                    </div>
                  )}

                  <Button onClick={generate} disabled={busy}>
                    {busy ? "Generating…" : `Generate ${selectedSport.name} Tournament`}
                  </Button>
                </div>
              ) : (
                
                <TournamentDetail tournamentId={currentTournament._id} stage={currentTournament.stage} onBracketGenerated={loadAll} />
              
              )}
            </Card>
          )}
        </div>
      )}
    </AdminLayout>
  );
}