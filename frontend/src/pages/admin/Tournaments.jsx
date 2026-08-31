import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { Button, Card } from "../../components/ui";
import { superAdminMenu } from "../../components/menus";

const DIVISION_LABEL = { open: "Open", boys: "Boys", girls: "Girls", under17: "U17", under30: "U30" };

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

function MatchesView({ tournamentId }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api(`/api/tournaments/${tournamentId}/matches`)
      .then((d) => { if (alive) setMatches((d.matches || []).filter((m) => m.bracket === "group")); })
      .catch(() => { if (alive) setMatches([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tournamentId]);

    async function revert(m) {
    const ok = window.confirm(
      `Revert ${m.teamA?.teamName} vs ${m.teamB?.teamName}?\n\n` +
      `The score, periods and player stats are discarded, and both teams are pulled ` +
      `back out of the matches they advanced into. The organizer scores it again.`
    );
    if (!ok) return;
    try {
      await api(`/api/tournaments/matches/${m._id}/revert`, { method: "POST" });
      const d = await api(`/api/tournaments/${tournamentId}/bracket`);
      setMatches(d.matches || []);
    } catch (e) {
      alert(e.message);
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">Loading matches…</p>;
  if (matches.length === 0) return null;

  const scoreOf = (m, side) =>
    (m.games || []).reduce((n, g) => n + (g[side === "A" ? "scoreA" : "scoreB"] || 0), 0);

  // Tiebreaker rounds are numbered from 100 so they sort after the group stage.
  // That's an implementation detail; nobody should read "Round 101".
  const roundLabel = (m) =>
    m.isTiebreaker
      ? (m.round >= 101 ? "Playoff decider" : "Playoff")
      : `R${m.round}`;

  const group = matches.filter((m) => !m.isTiebreaker);
  const playoff = matches.filter((m) => m.isTiebreaker);

    

  const Row = ({ m }) => {
    const done = m.status === "completed";
    const aWin = done && String(m.seriesWinner) === String(m.teamA?._id || m.teamA);
    return (
      <div className="flex items-center gap-2 flex-wrap border border-slate-200 rounded-lg px-3 py-2 text-sm">
        <span className="text-slate-400 text-xs w-24 shrink-0">
          {m.group ? `Grp ${m.group} · ` : ""}{roundLabel(m)}
        </span>
        <span className={`flex-1 min-w-0 text-right truncate ${aWin ? "font-semibold text-slate-900" : "text-slate-600"}`}>
          {m.teamA?.teamName || "TBD"}
        </span>
        <span className="px-2 tabular-nums text-slate-500 w-16 text-center shrink-0">
          {done ? `${scoreOf(m, "A")}–${scoreOf(m, "B")}`
            : m.status === "ongoing" ? "live" : "vs"}
            
        </span>
        <span className={`flex-1 min-w-0 truncate ${done && !aWin ? "font-semibold text-slate-900" : "text-slate-600"}`}>
          {m.teamB?.teamName || "TBD"}
        </span>
                      {done && (
          <button onClick={() => revert(m)}
            className="text-[11px] font-medium px-2 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 shrink-0">
            Revert
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-6">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-slate-700 font-medium text-sm">Group matches</h3>
        <span className="text-slate-400 text-xs">
          scored by the organizer — {group.filter((m) => m.status === "completed").length}/{group.length} played
        </span>
      </div>
      <div className="space-y-2">{group.map((m) => <Row key={m._id} m={m} />)}</div>

      {playoff.length > 0 && (
        <>
          <h3 className="text-slate-700 font-medium text-sm mt-5 mb-2">Tiebreaker playoff</h3>
          <div className="space-y-2">{playoff.map((m) => <Row key={m._id} m={m} />)}</div>
        </>
      )}
    </div>
  );
}

function ScheduleSection({ tournamentId }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({});     // matchId -> { schedule, venue }
  const [bulk, setBulk] = useState({});       // round -> { schedule, venue, group }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
    const [openRounds, setOpenRounds] = useState({});

  async function load() {
    setLoading(true);
    try {
      const data = await api(`/api/tournaments/${tournamentId}/matches`);
      setMatches(data.matches || []);
      setEdits({});
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tournamentId]);

  // datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time. toISOString() would
  // convert to UTC and shift the clock by 8 hours.
  const asInput = (d) => {
    if (!d) return "";
    const x = new Date(d);
    const pad = (n) => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
  };

  const valueOf = (m, field) =>
    edits[m._id]?.[field] !== undefined
      ? edits[m._id][field]
      : field === "schedule" ? asInput(m.schedule) : (m.venue || "");

  const isDirty = (m) => {
    const e = edits[m._id];
    if (!e) return false;
    return (e.schedule !== undefined && e.schedule !== asInput(m.schedule))
      || (e.venue !== undefined && e.venue !== (m.venue || ""));
  };

  function edit(matchId, field, value) {
    setEdits((prev) => ({ ...prev, [matchId]: { ...prev[matchId], [field]: value } }));
  }

  // Saved explicitly rather than on every keystroke — typing a venue would
  // otherwise fire a request per character.
  async function saveOne(m) {
    setBusy(true); setMsg("");
    try {
      await api(`/api/tournaments/matches/${m._id}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          schedule: valueOf(m, "schedule") || null,
          venue: valueOf(m, "venue"),
        }),
      });
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function applyRound(round) {
    const b = bulk[round] || {};
    if (!b.schedule) { setMsg("Pick a date and time first."); return; }
    setBusy(true); setMsg("");
    try {
      const body = { schedule: b.schedule, round: Number(round) };
      if (b.group) body.group = b.group;
      if (b.venue) body.venue = b.venue;
      const res = await api(`/api/tournaments/${tournamentId}/schedule-bulk`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMsg(res.message);
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

   // Round numbers restart in the knockout, so group-stage round 1 and the first
  // knockout round collide. Group-stage matches carry a `group`; knockout matches
  // don't — that's what separates them.
  const stageOf = (m) => (m.group ? "group" : "knockout");
  const keyOf = (m) => `${stageOf(m)}-${m.round}`;
  const sections = [...new Set(matches.map(keyOf))].sort((a, b) => {
    const [sa, ra] = a.split("-"); const [sb, rb] = b.split("-");
    if (sa !== sb) return sa === "group" ? -1 : 1;
    return Number(ra) - Number(rb);
  });
  const groups = [...new Set(matches.map((m) => m.group).filter(Boolean))].sort();
  const dated = matches.filter((m) => m.schedule).length;

  const roundLabel = (m) => {
    if (m.isTiebreaker) return m.round >= 101 ? "Playoff decider" : "Playoff";
    if (!m.group) {
      const n = matches.filter((x) => !x.group && x.round === m.round && !(x.bracket || "").includes("third")).length;
      return n === 1 ? "Final" : n === 2 ? "Semifinals" : n === 4 ? "Quarterfinals" : `Round of ${n * 2}`;
    }
    return `Round ${m.round}`;
  };

  const input = "rounded-lg border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <div className="mt-8 border-t border-slate-200 pt-5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="text-slate-800 font-semibold">Schedule</h3>
        <span className="text-slate-400 text-sm">{dated} of {matches.length} dated</span>
      </div>
      <p className="text-slate-500 text-sm mb-4">
        Dates are guidance, not a lock — an organizer can still start an undated match,
        or one being played on a different day. Times are Philippine time.
      </p>

      {msg && <p className="text-sm text-slate-600 bg-slate-50 rounded px-3 py-2 mb-3">{msg}</p>}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading matches…</p>
      ) : matches.length === 0 ? (
        <p className="text-slate-500 text-sm">No matches to schedule yet.</p>
      ) : (
        <div className="space-y-6">
                    {sections.map((key) => {
                        const r = Number(key.split("-")[1]);
            const inRound = matches.filter((m) => keyOf(m) === key);
                                    const b = bulk[key] || {};

                        // A round where everything has been played is history — collapse it so
            // it doesn't bury the rounds still needing dates.
            const played = inRound.filter((m) => m.status === "completed").length;
            const allPlayed = played === inRound.length;
                        const open = openRounds[key] ?? !allPlayed;
            return (
                            <div key={key} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                                                      <button onClick={() => setOpenRounds({ ...openRounds, [key]: !open })}
                    className="flex items-baseline gap-2 mb-2 w-full text-left">
                    <span className="text-slate-400 text-xs">{open ? "▾" : "▸"}</span>
                    <h4 className="text-slate-800 font-medium text-sm">{roundLabel(inRound[0])}</h4>
                    <span className="text-slate-400 text-xs">
                      {inRound.length} match{inRound.length === 1 ? "" : "es"} ·{" "}
                      {allPlayed ? "all played" : `${inRound.filter((m) => m.schedule).length} dated`}
                    </span>
                  </button>
                  {open && (
                  <div className="flex items-end gap-2 flex-wrap">
                  
                    <div>
                      <label className="block text-slate-500 text-[11px] mb-1">Date &amp; time</label>
                                            <input type="datetime-local" value={b.schedule || ""}
                        onChange={(e) => setBulk({ ...bulk, [key]: { ...b, schedule: e.target.value } })}
                        className={input} />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[11px] mb-1">Venue</label>
                                            <input type="text" placeholder="Covered court" value={b.venue || ""}
                        onChange={(e) => setBulk({ ...bulk, [key]: { ...b, venue: e.target.value } })}
                        className={`${input} w-44`} />
                    </div>
                    {groups.length > 0 && (
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-1">Group</label>
                                                <select value={b.group || ""}
                          onChange={(e) => setBulk({ ...bulk, [key]: { ...b, group: e.target.value } })}
                          className={input}>
                          <option value="">All groups</option>
                          {groups.map((g) => <option key={g} value={g}>Group {g}</option>)}
                        </select>
                      </div>
                    )}
                    <button onClick={() => applyRound(r)} disabled={busy}
                      className="text-xs font-medium px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                      Apply to round
                    </button>
                  </div>
                    )}
                </div>
                     {open && (
                <div className="divide-y divide-slate-100">
                  {inRound.map((m) => {
                    const done = m.status === "completed";
                    return (
                      <div key={m._id} className={`px-4 py-2.5 ${done ? "bg-slate-50/60" : ""}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-400 text-xs w-16 shrink-0">
                            {m.group ? `Grp ${m.group}` : m.bracket}
                          </span>
                          <span className="flex-1 min-w-[12rem] truncate text-sm text-slate-700">
                            {m.teamA?.teamName || "TBD"}
                            <span className="text-slate-400"> vs </span>
                            {m.teamB?.teamName || "TBD"}
                          </span>

                          {done ? (
                            <span className="text-slate-400 text-xs">played</span>
                          ) : (
                            <>
                              <input type="datetime-local" value={valueOf(m, "schedule")}
                                onChange={(e) => edit(m._id, "schedule", e.target.value)}
                                className={`${input} text-xs shrink-0`} />
                              <input type="text" placeholder="Venue" value={valueOf(m, "venue")}
                                onChange={(e) => edit(m._id, "venue", e.target.value)}
                                className={`${input} text-xs w-36 shrink-0`} />
                              <button onClick={() => saveOne(m)} disabled={busy || !isDirty(m)}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-30 shrink-0">
                                Save
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                 )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TournamentDetail({ tournamentId, stage, isML, onBracketGenerated }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [qualification, setQualification] = useState(null);  // ML tiebreaker UI
  const [readiness, setReadiness] = useState(null);          // who actually qualified
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

  // The public bracket endpoint is the single source of truth for who has
  // qualified: it accounts for tiebreaker playoffs (ML) and for upper/lower
  // bracket winners (physical sports). Table POSITION is not enough — a playoff
  // can send a team through from below the cutoff line.
  async function loadReadiness() {
    try {
      const d = await api(`/api/public/bracket?tournament=${tournamentId}`);
      const groups = [...new Set((d.matches || []).filter((m) => m.group).map((m) => m.group))];
      const qual = d.qualification || {};
      const seeds = d.qualifiers || {};

      if (isML) {
        const contested = groups.filter((g) => (qual[g]?.contested || []).length > 0);
        const ids = groups.flatMap((g) => qual[g]?.clear || []);
        const advance = d.tournament?.advancePerGroup || 1;
        setReadiness({
          groups, contested, ids,
          ready: contested.length === 0 && ids.length === groups.length * advance,
          expected: groups.length * advance,
        });
      } else {
        const short = groups.filter((g) => (seeds[g] || []).length < 2);
        const ids = groups.flatMap((g) => (seeds[g] || []).map((s) => s.teamId));
        setReadiness({
          groups, contested: [], ids, short,
          ready: short.length === 0 && groups.length > 0,
          expected: groups.length * 2,
        });
      }
    } catch {
      setReadiness(null);
    }
  }

  async function loadQualification() {
    try {
      setQualification(await api(`/api/tournaments/${tournamentId}/qualification`));
    } catch {
      setQualification(null);
    }
  }

  useEffect(() => {
    loadReadiness();
    if (isML) loadQualification();
  }, [tournamentId, refreshKey, isML]);

  const groups = qualification?.groups || {};
  const groupList = Object.entries(groups);
  const anyNeedsTiebreaker = groupList.some(([, g]) => g.needsTiebreaker);
  const groupsComplete = groupList.length > 0 && groupList.every(([, g]) => g.complete);

  async function generateBracket() {
    setBusy(true);
    setError("");
    try {
      if (!isML) {
        // The de-bracket route reads the group qualifiers itself, so there's
        // nothing to send — and nothing for the frontend to get wrong.
        await api(`/api/tournaments/${tournamentId}/de-bracket`, { method: "POST" });
      } else {
        if (!readiness?.ready) {
          setError(
            readiness?.contested?.length
              ? `Group ${readiness.contested.join(", ")} still has a tie for the last spot. Play the tiebreaker playoff first.`
              : "Not every group has produced its qualifiers yet."
          );
          return;
        }
        await api(`/api/tournaments/${tournamentId}/bracket`, {
          method: "POST",
          body: JSON.stringify({ teamIds: readiness.ids }),
        });
      }
      onBracketGenerated && onBracketGenerated();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function generateTiebreakers() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/tournaments/${tournamentId}/tiebreakers`, { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const ErrorBox = () => error ? (
    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3">
      <p className="text-red-600 text-sm">{error}</p>
    </div>
  ) : null;

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

          {isML ? (
            <>
              <StandingsView tournamentId={tournamentId} key={`s-${refreshKey}`} />
              <MatchesView tournamentId={tournamentId} key={`m-${refreshKey}`}
                onScored={() => setRefreshKey((k) => k + 1)} />
            </>
          ) : (
            <BracketView tournamentId={tournamentId} key={`b-${refreshKey}`} />
          )}

          {(isML ? groupsComplete : readiness) && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              {isML && anyNeedsTiebreaker && !readiness?.ready ? (
                <>
                  <h3 className="text-slate-800 font-semibold mb-1">Tie at the cutoff</h3>
                  <p className="text-amber-600 text-sm mb-3">
                    Some groups have a tie for the last qualifying spot. Generate a
                    single-elimination playoff among the tied teams to settle it.
                  </p>
                  <ErrorBox />
                  <Button onClick={generateTiebreakers} disabled={busy}>
                    {busy ? "Generating…" : "Generate Tiebreaker Playoff"}
                  </Button>
                </>
              ) : readiness?.ready ? (
                <>
                  <h3 className="text-slate-800 font-semibold mb-1">Group stage complete</h3>
                  <p className="text-slate-500 text-sm mb-3">
                    {readiness.ids.length} teams qualified.
                  </p>
                  <ErrorBox />
                  <Button onClick={generateBracket} disabled={busy}>
                    {busy ? "Generating…" : `Generate Knockout Bracket (${readiness.ids.length} teams)`}
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-slate-800 font-semibold mb-1">Not ready yet</h3>
                  <p className="text-slate-500 text-sm">
                    {readiness?.contested?.length
                      ? `Group ${readiness.contested.join(", ")} still has a tie to settle.`
                      : readiness?.short?.length
                        ? `Group ${readiness.short.join(", ")} hasn't produced both qualifiers yet.`
                        : "Finish the group stage first."}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    {readiness?.ids?.length || 0} of {readiness?.expected || "?"} qualifiers decided.
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}
      <ScheduleSection tournamentId={tournamentId} />
    </div>
  );
}

// Read-only. Scoring belongs to the organizer's courtside screen — an admin
// entering a score here would bypass PlayerMatchStats and the period record.
function MatchBox({ m, innerRef, onRevert }) {
  const done = m.status === "completed";
  const live = m.status === "ongoing";
  const winnerId = String(m.seriesWinner?._id || m.seriesWinner || "");
  const aId = String(m.teamA?._id || m.teamA || "");
  const bId = String(m.teamB?._id || m.teamB || "");
  const aWin = done && winnerId === aId;
  const bWin = done && winnerId === bId;

  const total = (side) => (m.games || []).reduce((n, g) => n + (g[side] || 0), 0);
  const aScore = m.liveScoreA || total("scoreA");
  const bScore = m.liveScoreB || total("scoreB");

  const Side = ({ name, score, won }) => (
    <div className={`flex items-center gap-2 px-3 py-2 ${won ? "bg-green-50" : ""}`}>
      <span className={`flex-1 min-w-0 truncate ${won ? "font-semibold text-slate-900" : "text-slate-600"}`}>
        {name || "TBD"}
      </span>
      {(done || live) && <span className="text-slate-600 font-medium w-6 text-center tabular-nums">{score}</span>}
      
    </div>
  );

  return (
    <div ref={innerRef}
      className={`border rounded-lg overflow-hidden text-sm w-56 shrink-0 bg-white ${live ? "border-red-300" : "border-slate-200"}`}>
      <Side name={m.teamA?.teamName} score={aScore} won={aWin} />
      <div className="border-t border-slate-100" />
      <Side name={m.teamB?.teamName} score={bScore} won={bWin} />
      {live && <div className="px-3 py-1 bg-red-50 text-red-600 text-[10px] font-semibold">● LIVE</div>}
      {done && onRevert && (
        <button onClick={() => onRevert(m)}
          className="w-full px-3 py-1 border-t border-slate-100 text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-50">
          Revert
        </button>
      )}
    </div>
  );
}

// One tree, with elbows measured from the DOM.
function BracketTree({ title, matches, labelFor, onRevert }) {
  const stageRef = useRef(null);
  const boxRefs = useRef({});
  const [wires, setWires] = useState([]);
    const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
    // Round numbers restart in the knockout, so round 1 of the group stage and the
  // first knockout round collide. Group-stage matches carry a `group`; knockout
  // matches don't — that's what separates them.
  const stageOf = (m) => (m.group ? "group" : "knockout");
  const keyOf = (m) => `${stageOf(m)}-${m.round}`;
  const sections = [...new Set(matches.map(keyOf))].sort((a, b) => {
    const [sa, ra] = a.split("-"); const [sb, rb] = b.split("-");
    if (sa !== sb) return sa === "group" ? -1 : 1;
    return Number(ra) - Number(rb);
  });

  useLayoutEffect(() => {
    function measure() {
      const stage = stageRef.current;
      if (!stage) return;
      const base = stage.getBoundingClientRect();
      const ws = [];
      matches.forEach((m) => {
        const from = boxRefs.current[m._id];
        const toId = m.nextMatchWin && String(m.nextMatchWin._id || m.nextMatchWin);
        const to = toId && boxRefs.current[toId];
        if (!from || !to) return;
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const x1 = a.right - base.left, y1 = a.top - base.top + a.height / 2;
        const x2 = b.left - base.left, y2 = b.top - base.top + b.height / 2;
        const mx = (x1 + x2) / 2;
        ws.push(`M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`);
      });
      setWires(ws);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [matches]);

  if (matches.length === 0) return null;

  return (
    <div className="mb-6">
      {title && <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">{title}</p>}
      <div className="overflow-x-auto pb-2">
        <div ref={stageRef} className="relative flex gap-10 min-w-min">
          <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible", pointerEvents: "none" }}>
            {wires.map((d, i) => <path key={i} d={d} stroke="#cbd5e1" strokeWidth="2" fill="none" />)}
          </svg>
          {rounds.map((r, i) => (
            <div key={r} className="relative z-10 flex flex-col">
              <p className="text-slate-400 text-xs font-medium mb-2">{labelFor(r, i, rounds.length)}</p>
              <div className="flex-1 flex flex-col justify-around gap-3">
                {matches.filter((m) => m.round === r).map((m) => (
                                    <MatchBox key={m._id} m={m} onRevert={onRevert}
                    innerRef={(el) => (boxRefs.current[m._id] = el)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BracketView({ tournamentId }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api(`/api/tournaments/${tournamentId}/bracket`)
      .then((d) => { if (alive) setMatches(d.matches || []); })
      .catch(() => { if (alive) setMatches([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tournamentId]);
    async function revert(m) {
    const ok = window.confirm(
      `Revert ${m.teamA?.teamName} vs ${m.teamB?.teamName}?\n\n` +
      `The score, periods and player stats are discarded, and both teams are pulled ` +
      `back out of the matches they advanced into. The organizer scores it again.`
    );
    if (!ok) return;
    try {
      await api(`/api/tournaments/matches/${m._id}/revert`, { method: "POST" });
      const d = await api(`/api/tournaments/${tournamentId}/bracket`);
      setMatches(d.matches || []);
    } catch (e) {
      alert(e.message);
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">Loading bracket…</p>;
  if (matches.length === 0) return <p className="text-slate-500 text-sm">No bracket yet.</p>;

  // Physical sports run FOUR separate double-elims, one per group. Filtering on
  // bracket alone merges them into a single unreadable tree — the group is what
  // separates them.
  const grouped = matches.filter((m) => m.group);
  const knockout = matches.filter((m) => !m.group);
  const groups = [...new Set(grouped.map((m) => m.group))].sort();

    // Name rounds by how many teams are left, not by position — the third-place
  // match shares the final's round number and throws off counting backwards.
  const koLabel = (r) => {
    const inRound = koMain.filter((m) => m.round === r).length;
    return inRound === 1 ? "Final"
      : inRound === 2 ? "Semifinals"
      : inRound === 4 ? "Quarterfinals"
      : `Round of ${inRound * 2}`;
  };
  const koMain = knockout.filter((m) => !(m.bracket || "").includes("third"));
  const koThird = knockout.find((m) => (m.bracket || "").includes("third"));

    return (
    <div>
      {koMain.length > 0 && (
        <div className="mb-8">
          <h3 className="text-slate-800 font-semibold mb-3">Knockout</h3>
          <BracketTree matches={koMain} labelFor={koLabel} onRevert={revert} />
          {koThird && (
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Third place</p>
              <MatchBox m={koThird} innerRef={() => {}} onRevert={revert} />
            </div>
          )}
        </div>
      )}

      {groups.map((g) => (
        <div key={g} className="mb-8">
          <h3 className="text-slate-800 font-semibold mb-3">Group {g}</h3>
          <BracketTree title="Winners" onRevert={revert}
            matches={grouped.filter((m) => m.group === g && m.bracket === "winners")}
            labelFor={(r) => `Round ${r}`} />
          <BracketTree title="Losers" onRevert={revert}
            matches={grouped.filter((m) => m.group === g && m.bracket === "losers")}
            labelFor={(r) => `Round ${r}`} />
        </div>
      ))}
    </div>
  );
}

export default function Tournaments() {
  const { sportId } = useParams();
  const navigate = useNavigate();
  const [sports, setSports] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [knockoutSize, setKnockoutSize] = useState(16);
  const [division, setDivision] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const [sportsData, tourneyData] = await Promise.all([
        api("/api/sports"),
        api("/api/tournaments"),
      ]);
      setSports(sportsData.sports || []);
      setTournaments(tourneyData.tournaments || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  // No sport in the URL — send them to the first one rather than showing an
  // empty page. The sidebar is the picker now.
  useEffect(() => {
    if (!sportId && sports.length) navigate(`/admin/tournaments/${sports[0]._id}`, { replace: true });
  }, [sportId, sports, navigate]);

  // Changing sport resets the division, since the divisions differ per sport.
  useEffect(() => { setDivision(""); setError(""); }, [sportId]);

  const selectedSport = sports.find((s) => String(s._id) === String(sportId));
  const isMobileLegends = selectedSport?.name === "Mobile Legends";

  const divisions = selectedSport?.divisions?.length ? selectedSport.divisions : ["open"];
  const activeDivision = divisions.includes(division) ? division : divisions[0];

  // A sport can run several tournaments in one season — one per division. Match
  // on BOTH, or basketball u30 sits unreachable behind u17.
  const currentTournament = tournaments.find(
    (t) =>
      t.sport && (t.sport._id === selectedSport?._id || t.sport === selectedSport?._id) &&
      (t.division || "open") === activeDivision
  );

  async function generate() {
    if (!selectedSport) return;
    setBusy(true);
    setError("");
    try {
      const body = { sportId: selectedSport._id, division: activeDivision };
      if (isMobileLegends) body.knockoutSize = Number(knockoutSize);
      await api("/api/tournaments/generate", { method: "POST", body: JSON.stringify(body) });
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout title={selectedSport?.name || "Tournaments"} menu={superAdminMenu}>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : !selectedSport ? (
        <p className="text-slate-500">Pick a sport from the sidebar.</p>
      ) : (
        <div className="max-w-5xl space-y-6">
          {divisions.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {divisions.map((d) => (
                <button
                  key={d}
                  onClick={() => { setDivision(d); setError(""); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    activeDivision === d
                      ? "bg-indigo-600 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {DIVISION_LABEL[d] || d}
                </button>
              ))}
            </div>
          )}

          <Card className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h2 className="text-slate-800 font-semibold text-lg">
                {selectedSport.name}
                {divisions.length > 1 && (
                  <span className="text-slate-400 font-normal text-base ml-2">
                    {DIVISION_LABEL[activeDivision] || activeDivision}
                  </span>
                )}
              </h2>
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
              <div>
                <p className="text-slate-500 text-sm mb-4">
                  No {divisions.length > 1 ? `${DIVISION_LABEL[activeDivision] || activeDivision} ` : ""}
                  tournament generated for {selectedSport.name} yet. Generate one from the
                  verified teams. {isMobileLegends
                    ? "Mobile Legends uses a grouped round-robin."
                    : "This sport uses four groups of double-elimination."}
                </p>

                {isMobileLegends && (
                  <div className="mb-4">
                    <label className="block text-slate-700 text-sm font-medium mb-1.5">Knockout size</label>
                    <div className="flex gap-2">
                      {[8, 16].map((n) => (
                        <button key={n} type="button" onClick={() => setKnockoutSize(n)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            Number(knockoutSize) === n
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}>
                          Top {n}
                        </button>
                      ))}
                    </div>
                    <p className="text-slate-400 text-xs mt-1">
                      The system creates 8 groups and funnels down to the Top {knockoutSize}.
                      Needs at least {knockoutSize} verified teams.
                    </p>
                  </div>
                )}

                <Button onClick={generate} disabled={busy}>
                  {busy ? "Generating…" : `Generate ${selectedSport.name} Tournament`}
                </Button>
              </div>
            ) : (
              <TournamentDetail
                key={currentTournament._id}
                tournamentId={currentTournament._id}
                stage={currentTournament.stage}
                isML={isMobileLegends}
                onBracketGenerated={loadAll}
              />
            )}
          </Card>
        </div>
      )}
    </AdminLayout>
  );
}