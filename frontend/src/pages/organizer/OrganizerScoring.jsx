import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";


const dateOf = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, {
    timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric",
  }) : "No date set";

const organizerMenu = [
  { label: "Matches", path: "/organizer", icon: "⛃" },
];

const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls",
  under17: "U17", under30: "U30",
};
 
const BRACKET_LABEL = {
  winners: "Winners bracket",
  losers: "Losers bracket",
  final: "Grand final",
  third: "Third place",
  ko_third: "Third place",
};
 
// The organizer picks a match out of a list at courtside, often in a hurry.
// Raw enum values ("winners · round 101 · group A") are database fields, not
// something a game official should have to decode.
function describeMatch(m, all) {
  if (m.isTiebreaker) {
    return {
      group: m.group ? `Group ${m.group}` : null,
      stage: m.round >= 101 ? "Tiebreaker decider" : "Tiebreaker playoff",
      note: "Winner takes the last qualifying spot",
      tone: "warn",
    };
  }
 
  // Knockout matches carry no group. Name the round by how many are left in it,
  // which is stable whether the bracket is a Top 8 or a Top 16.
  if (!m.group) {
    const inRound = all.filter(
      (x) => !x.group && !x.isTiebreaker && x.round === m.round &&
        !String(x.bracket || "").includes("third")
    ).length;
    if (String(m.bracket || "").includes("third")) {
      return { group: null, stage: "Third place", note: null, tone: "plain" };
    }
    const stage = inRound === 1 ? "Final"
      : inRound === 2 ? "Semifinal"
      : inRound === 4 ? "Quarterfinal"
      : `Round of ${inRound * 2}`;
    const note = inRound === 2 ? "Winner reaches the final"
      : inRound === 4 ? "Winner reaches the semifinal"
      : null;
    return { group: null, stage, note, tone: "plain" };
  }
 
  return {
    group: `Group ${m.group}`,
    stage: `${BRACKET_LABEL[m.bracket] || "Group stage"}, Round ${m.round}`,
    note: null,
    tone: "accent",
  };
}
 
const timeOf = (d) => {
  if (!d) return null;
  const x = new Date(d);
  const midnightUtc = x.getUTCHours() === 0 && x.getUTCMinutes() === 0;
  return midnightUtc ? null
    : x.toLocaleTimeString([], { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
};
 
// Barangay crest, falling back to initials while logos are still being uploaded.
function Crest({ team, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const name = team?.teamName || "";
  const id = team?.barangay ? String(team.barangay) : null;
 
  if (id && !failed) {
    return (
      <img src={`/api/barangays/${id}/logo`} alt="" onError={() => setFailed(true)}
        className="rounded-lg object-cover bg-slate-100 shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-lg bg-slate-100 text-slate-400 font-semibold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.32 }}>
      {name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "—"}
    </div>
  );
}



function ScoringView({ matchId, mode, onBack }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(null);      // selected player (player mode)
  const [ending, setEnding] = useState(false);     // MVP picker open
  const [mvp, setMvp] = useState(null);
  const [periods, setPeriods] = useState(1);   // organizer picks at start
  

  async function load() {
    try {
      const d = await api(`/api/organizer/matches/${matchId}`);
      setData(d);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [matchId]);

    async function call(path, body) {
    setBusy(true); setError("");
    try {
      await api(`/api/organizer/matches/${matchId}/${path}`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      });
      await load();
    } catch (e) {
      // The start route returns a 409 when the match is dated for another day.
      // Dates are guidance, not a lock — confirm and proceed.
      if (path === "start" && /scheduled for/i.test(e.message)) {
        if (window.confirm(`${e.message}`)) {
          try {
            await api(`/api/organizer/matches/${matchId}/start`, {
              method: "POST",
              body: JSON.stringify({ ...(body || {}), confirmOffSchedule: true }),
            });
            await load();
          } catch (e2) { setError(e2.message); }
        }
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-slate-500">Loading match…</p>;

  const m = data.match;
  const live = m.status === "ongoing";
  const finished = m.status === "completed";
  const tied = (m.liveScoreA || 0) === (m.liveScoreB || 0);
  const allPeriodsDone = (m.games?.length || 0) >= (m.bestOf || 1) && !tied;
  const stat = (id) => data.statByPlayer?.[String(id)] || { points: 0, fouls: 0 };
  const desc = describeMatch(m, [m]);
    // ML, billiards and chess aren't scored point by point — the organizer records
  // who won each game. One tap = one game won.
  const finalMode = mode === "final";
  const canEnd = finalMode
    ? (m.liveScoreA || 0) !== (m.liveScoreB || 0)
    : allPeriodsDone;

  // In final mode the period is just the series, so bank it automatically
  // rather than making the organizer tap an extra button.
  async function openEnd() {
    if (finalMode && (m.games?.length || 0) < (m.bestOf || 1)) await call("end-period");
    setMvp(topScorer?.pts > 0 ? String(topScorer.p._id) : null);
    setEnding(true);
  }

  // Player mode: tap a player, then a point button. Side mode: point buttons only.
  async function addPoints(side, points) {
    if (mode === "player") {
      if (!picked) { setError("Tap a player first."); return; }
      await call("score", { side: picked.side, points, playerId: picked.id });
    } else {
      await call("score", { side, points });
    }
  }

  const allPlayers = [
    ...data.rosterA.map((p) => ({ ...p, side: "A" })),
    ...data.rosterB.map((p) => ({ ...p, side: "B" })),
  ];
  const topScorer = allPlayers
    .map((p) => ({ p, pts: stat(p._id).points }))
    .sort((x, y) => y.pts - x.pts)[0];

  const Roster = ({ players, side, teamName }) => (
    <div className="flex-1 min-w-0">
      <p className="text-slate-500 text-xs font-medium mb-2 truncate">{teamName}</p>
      <div className="space-y-1.5">
        {players.map((p) => {
          const s = stat(p._id);
          const isPicked = picked?.id === String(p._id);
          return (
            <div key={p._id}
              className={`rounded-lg border p-2.5 ${isPicked ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white"}`}>
              <button
                onClick={() => mode === "player" && live && setPicked({ id: String(p._id), side, name: `${p.firstName} ${p.lastName}` })}
                disabled={mode !== "player" || !live}
                className="w-full text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs w-5">{p.jerseyNumber ?? "—"}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{p.lastName}</span>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{s.points}</span>
                </div>
              </button>
              {live && (
                <div className="flex items-center gap-1 mt-1.5">
                  <button onClick={() => call("foul", { playerId: p._id })} disabled={busy}
                    className="text-[11px] px-2 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                    Foul {s.fouls > 0 ? `(${s.fouls})` : ""}
                  </button>
                  {s.fouls > 0 && (
                    <button onClick={() => call("foul", { playerId: p._id, delta: -1 })} disabled={busy}
                      className="text-[11px] px-2 py-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-50">
                      −
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="text-slate-500 text-sm mb-3 hover:text-slate-700">← All matches</button>

      {/* Scoreboard */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {desc.group && (
              <span className={`text-[11px] px-2 py-0.5 rounded ${
                desc.tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"
              }`}>
                {desc.group}
              </span>
            )}
            <span className="text-slate-500 text-xs">
              {data.sport}
              {data.division && data.division !== "open" ? ` ${DIVISION_LABEL[data.division] || data.division}` : ""}
              {" · "}{desc.stage}
            </span>
          </div>
          <span className="text-slate-400 text-xs">
            {live && !finalMode
              ? `${(data.periodLabel || "period").replace(/^./, (c) => c.toUpperCase())} ${Math.min((m.games?.length || 0) + 1, m.bestOf || 1)} of ${m.bestOf || 1}`
              : finished ? "Final" : "Not started"}
          </span>
        </div>
 
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0 text-center">
            <div className="flex justify-center mb-2"><Crest team={m.teamA} size={40} /></div>
            <p className="text-slate-600 text-sm truncate">{m.teamA?.teamName}</p>
            <p className="text-4xl font-semibold tabular-nums mt-1 text-slate-900">{m.liveScoreA}</p>
          </div>
 
          <div className="shrink-0 text-center">
            {live && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600">Live</span>}
            {finished && <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">Final</span>}
            {!live && !finished && <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">Not started</span>}
            {(m.games || []).length > 0 && (
              <p className="text-slate-400 text-xs mt-2 tabular-nums">
                {(m.games || []).map((g) => `${g.scoreA}-${g.scoreB}`).join(" · ")}
              </p>
            )}
          </div>
 
          <div className="flex-1 min-w-0 text-center">
            <div className="flex justify-center mb-2"><Crest team={m.teamB} size={40} /></div>
            <p className="text-slate-600 text-sm truncate">{m.teamB?.teamName}</p>
            <p className="text-4xl font-semibold tabular-nums mt-1 text-slate-900">{m.liveScoreB}</p>
          </div>
        </div>
 
        {finished && m.mvp && (
          <p className="text-center text-slate-500 text-xs mt-4">
            MVP: {m.mvp.firstName} {m.mvp.lastName}
          </p>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3">
        <p className="text-red-600 text-sm">{error}</p></div>}

      {/* Not started */}
                  {!live && !finished && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {finalMode ? (
            <p className="text-slate-400 text-xs mb-3">
              Record the winner of each game as it finishes. The team with more
              games won takes the match.
            </p>
          ) : (
            <>
              <p className="text-slate-700 text-sm font-medium mb-2">How many {data.periodLabel || "period"}s?</p>
              <p className="text-slate-400 text-xs mb-3">
                Quarters, sets, or games — all of them must be played, and the winner is the higher total score.
              </p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {(data.periodOptions || [1, 3, 5, 7]).map((n) => (
                  <button key={n} type="button" onClick={() => setPeriods(n)}
                    className={`py-3 rounded-lg text-lg font-semibold transition ${
                      periods === n ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}
          <button onClick={() => call("start", { periods: finalMode ? 1 : periods })} disabled={busy}
            className="w-full py-4 rounded-xl bg-indigo-600 text-white font-semibold text-lg hover:bg-indigo-700 disabled:opacity-50">
            {busy ? "Starting…" : "Start match"}
          </button>
        </div>
      )}

      {/* Live controls */}
      {live && (
        <>
                    {mode === "player" && (
                        <div className={`grid gap-2 mb-4 ${(data.pointValues || [1]).length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
              {(data.pointValues || [1]).map((pts) => (
                <button key={pts}
                  onClick={() => addPoints(picked?.side || "A", pts)}
                  disabled={busy || !picked}
                  className="py-5 rounded-xl bg-green-600 text-white text-2xl font-bold hover:bg-green-700 disabled:opacity-40">
                  +{pts}
                </button>
              ))}
            </div>
          )}

                    {(mode === "side" || finalMode) && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => call("score", { side: "A", points: 1 })} disabled={busy}
                className="py-5 rounded-xl bg-green-600 text-white text-lg font-bold hover:bg-green-700 disabled:opacity-50">
                {finalMode ? `${m.teamA?.teamName} won a game` : `+1 ${m.teamA?.teamName}`}
              </button>
              <button onClick={() => call("score", { side: "B", points: 1 })} disabled={busy}
                className="py-5 rounded-xl bg-green-600 text-white text-lg font-bold hover:bg-green-700 disabled:opacity-50">
                {finalMode ? `${m.teamB?.teamName} won a game` : `+1 ${m.teamB?.teamName}`}
              </button>
            </div>
          )}

          {/* Per-team undo — each side has its own, so an organizer can correct
              whichever team was mis-tapped. In player mode it undoes for the
              selected player; in side mode it just takes a point off that team. */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => mode === "player"
                ? (picked?.side === "A" ? addPoints("A", -1) : setError(`Pick a ${m.teamA?.teamName} player to undo.`))
                : call("score", { side: "A", points: -1 })}
              disabled={busy}
              className="py-3 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">
              −1 {m.teamA?.teamName}
            </button>
            <button
              onClick={() => mode === "player"
                ? (picked?.side === "B" ? addPoints("B", -1) : setError(`Pick a ${m.teamB?.teamName} player to undo.`))
                : call("score", { side: "B", points: -1 })}
              disabled={busy}
              className="py-3 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">
              −1 {m.teamB?.teamName}
            </button>
          </div>
                {!finalMode && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 mb-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-slate-600 text-sm">
                {(data.periodLabel || "Period").replace(/^./, (c) => c.toUpperCase())} {Math.min((m.games?.length || 0) + 1, m.bestOf || 1)} of {m.bestOf || 1}
              </span>
              <span className="text-slate-400 text-xs">
                {(m.games || []).map((g) => `${g.scoreA}-${g.scoreB}`).join(" · ") || "none recorded"}
              </span>
            </div>
            <button onClick={() => call("end-period")}
              disabled={busy || (m.games?.length || 0) >= (m.bestOf || 1)}
              className="w-full py-2.5 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-40">
              End this {data.periodLabel || "period"}
            </button>
          </div>
          )}

                    {tied && (m.games?.length || 0) >= (m.bestOf || 1) && (
            <p className="text-amber-600 text-sm text-center mb-2">
              Scores are level — play a deciding {data.periodLabel || "period"}.
            </p>
          )}

                    <button onClick={openEnd}
            disabled={busy || !canEnd}
            className="w-full py-3 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 mb-5">
            End match
          </button>
          
                    <button
            onClick={() => {
              const scored = (m.games?.length || 0) > 0 || (m.liveScoreA || 0) > 0 || (m.liveScoreB || 0) > 0;
              const msg = scored
                ? `Cancel this match? The current score (${m.liveScoreA}–${m.liveScoreB}) and ${m.games?.length || 0} recorded period(s) will be discarded.`
                : "Cancel this match and return it to not-started?";
              if (window.confirm(msg)) call("cancel");
            }}
            disabled={busy}
            className="w-full py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-50 mb-5">
            Cancel match
          </button>
        </>
      )}

      {/* Rosters */}
      <div className="flex gap-3">
        <Roster players={data.rosterA} side="A" teamName={m.teamA?.teamName} />
        <Roster players={data.rosterB} side="B" teamName={m.teamB?.teamName} />
      </div>

      {/* End-match / MVP modal */}
      {ending && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEnding(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">End match</h3>
            <p className="text-slate-500 text-sm mb-3">
              Final score {m.liveScoreA}–{m.liveScoreB}. The winner advances automatically.
            </p>
            <label className="block text-slate-700 text-sm font-medium mb-1.5">MVP</label>
            <select value={mvp || ""} onChange={(e) => setMvp(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4">
              <option value="">No MVP</option>
              {allPlayers.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.lastName}, {p.firstName} ({stat(p._id).points} pts)
                  {topScorer?.p._id === p._id ? " — top scorer" : ""}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setEnding(false)}
                className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 text-sm">Cancel</button>
              <button
                onClick={async () => { await call("end", mvp ? { mvpPlayerId: mvp } : {}); setEnding(false); }}
                disabled={busy}
                className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">
                {busy ? "Ending…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrganizerScoring() {
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await api("/api/organizer/matches");
      setFeed(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <AdminLayout title="Matches" menu={organizerMenu}><p className="text-slate-500">Loading…</p></AdminLayout>;

    const matches = feed?.matches || [];
    // Manila dates, not the tablet's — a device with the wrong timezone shouldn't
  // move a match out of Today on game day.
  const manilaDay = (d) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(d));
  const isToday = (d) => !!d && manilaDay(d) === manilaDay(new Date());
  const live = matches.filter((m) => m.status === "ongoing");
  const scheduled = matches.filter((m) => m.status === "scheduled");
  const today = scheduled.filter((m) => isToday(m.schedule));
  const upcoming = scheduled.filter((m) => !isToday(m.schedule));
  const done = matches.filter((m) => m.status === "completed");
   // Dated days first, undated fixtures last — an organizer looks for a date
  // before anything else on game day.
  const grouped = {};
  upcoming.forEach((m) => { (grouped[dateOf(m.schedule)] = grouped[dateOf(m.schedule)] || []).push(m); });
  const byDate = Object.entries(grouped).sort((a, b) =>
    a[0] === "No date set" ? 1 : b[0] === "No date set" ? -1 : 0
  );

  if (openId) {
    return (
      <AdminLayout title={feed.sport} menu={organizerMenu}>
        <ScoringView matchId={openId} mode={feed.scoringMode}
          onBack={() => { setOpenId(null); load(); }} />
      </AdminLayout>
    );
  }

  const Row = ({ m, showDate }) => {
    const ready = m.teamA && m.teamB;
    const d = describeMatch(m, matches);
    const time = timeOf(m.schedule);
    const live = m.status === "ongoing";
    const done = m.status === "completed";
 
    // A colour per state, carried on the left edge so the eye can find the
    // startable matches without reading every row.
    const accent = live ? "border-l-4 border-l-red-500"
      : done ? "border-l-4 border-l-slate-200"
      : !ready ? "border-l-4 border-l-slate-200"
      : "border-l-4 border-l-indigo-500";
 
    const tag = d.tone === "warn"
      ? "bg-amber-100 text-amber-800"
      : "bg-indigo-100 text-indigo-800";
 
    return (
      <button
        onClick={() => ready && setOpenId(m._id)}
        disabled={!ready}
        className={`w-full text-left rounded-xl border ${accent} p-4 transition ${
          ready && !done
            ? "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
            : "border-slate-100 bg-slate-50"
        } ${!ready ? "cursor-not-allowed" : ""}`}
      >
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {d.group && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${tag}`}>{d.group}</span>
          )}
          <span className="text-slate-500 text-xs">
            {feed?.sport}
            {m.division && m.division !== "open" ? ` ${DIVISION_LABEL[m.division] || m.division}` : ""}
            {" · "}{d.stage}
          </span>
        </div>
 
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Crest team={m.teamA} size={28} />
            <span className={`text-sm truncate ${ready ? "text-slate-800 font-medium" : "text-slate-400"}`}>
              {m.teamA?.teamName || "TBD"}
            </span>
            <span className="text-slate-300 text-xs shrink-0">vs</span>
            <Crest team={m.teamB} size={28} />
            <span className={`text-sm truncate ${ready ? "text-slate-800 font-medium" : "text-slate-400"}`}>
              {m.teamB?.teamName || "TBD"}
            </span>
          </div>
 
          {live ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-800 whitespace-nowrap shrink-0">
              ● LIVE {m.liveScoreA}–{m.liveScoreB}
            </span>
          ) : done ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 whitespace-nowrap shrink-0">
              {m.liveScoreA}–{m.liveScoreB}
            </span>
          ) : !ready ? (
            <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">waiting for a team</span>
          ) : (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-600 text-white whitespace-nowrap shrink-0">
              Start →
            </span>
          )}
        </div>
 
        {(showDate || time || m.venue || d.note) && (
          <p className="text-slate-500 text-xs mt-2">
            {[showDate ? dateOf(m.schedule) : null, time, m.venue, d.note].filter(Boolean).join(" · ")}
          </p>
        )}
      </button>
    );
  };

  return (
    <AdminLayout title={feed.sport || "Matches"} menu={organizerMenu}>
      <div className="max-w-2xl space-y-6">
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {live.length > 0 && (
          <section>
            <h2 className="text-slate-700 font-semibold text-sm mb-2">Live now</h2>
            <div className="space-y-2">{live.map((m) => <Row key={m._id} m={m} />)}</div>
          </section>
        )}
                {today.length > 0 && (
          <section>
            <h2 className="text-slate-700 font-semibold text-sm mb-2">
              Today <span className="text-slate-400 font-normal">({today.length})</span>
            </h2>
            <div className="space-y-2">{today.map((m) => <Row key={m._id} m={m} />)}</div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section>
            <h2 className="text-slate-700 font-semibold text-sm mb-2">
              Upcoming <span className="text-slate-400 font-normal">({upcoming.length})</span>
            </h2>
            <div className="space-y-4">
              {byDate.map(([date, list]) => (
                <div key={date}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-slate-600 text-xs font-semibold">{date}</span>
                    <span className="text-slate-400 text-xs">
                      {list.length} match{list.length === 1 ? "" : "es"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {list.map((m) => <Row key={m._id} m={m} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {done.length > 0 && (
          <section>
            <h2 className="text-slate-700 font-semibold text-sm mb-2">
              Completed <span className="text-slate-400 font-normal">({done.length})</span>
            </h2>
            <div className="space-y-2">{done.map((m) => <Row key={m._id} m={m} />)}</div>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}