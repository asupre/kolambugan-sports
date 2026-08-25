import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";

const organizerMenu = [
  { label: "Matches", path: "/organizer", icon: "⛃" },
];


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
      <div className="rounded-2xl bg-slate-900 text-white p-5 mb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0 text-center">
            <p className="text-slate-300 text-sm truncate">{m.teamA?.teamName}</p>
                                    <p className="text-5xl font-bold tabular-nums mt-1">{m.liveScoreA}</p>
          </div>
          <div className="shrink-0 text-center">
            {live && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-500/20 text-red-300">● LIVE</span>}
            {finished && <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">FINAL</span>}
            {!live && !finished && <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">NOT STARTED</span>}
          </div>
          <div className="flex-1 min-w-0 text-center">
            <p className="text-slate-300 text-sm truncate">{m.teamB?.teamName}</p>
                        <p className="text-5xl font-bold tabular-nums mt-1">{m.liveScoreB}</p>
          </div>
        </div>
        {finished && m.mvp && (
          <p className="text-center text-slate-400 text-xs mt-3">MVP: {m.mvp.firstName} {m.mvp.lastName}</p>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3">
        <p className="text-red-600 text-sm">{error}</p></div>}

      {/* Not started */}
            {!live && !finished && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
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
          <button onClick={() => call("start", { periods })} disabled={busy}
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

          {mode === "side" && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => call("score", { side: "A", points: 1 })} disabled={busy}
                className="py-5 rounded-xl bg-green-600 text-white text-lg font-bold hover:bg-green-700 disabled:opacity-50">
                +1 {m.teamA?.teamName}
              </button>
              <button onClick={() => call("score", { side: "B", points: 1 })} disabled={busy}
                className="py-5 rounded-xl bg-green-600 text-white text-lg font-bold hover:bg-green-700 disabled:opacity-50">
                +1 {m.teamB?.teamName}
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

                    {tied && (m.games?.length || 0) >= (m.bestOf || 1) && (
            <p className="text-amber-600 text-sm text-center mb-2">
              Scores are level — play a deciding {data.periodLabel || "period"}.
            </p>
          )}

          <button onClick={() => { setMvp(topScorer?.pts > 0 ? String(topScorer.p._id) : null); setEnding(true); }}
                        disabled={busy || !allPeriodsDone}
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
  const isToday = (d) => {
    if (!d) return false;
    const s = new Date(d), n = new Date();
    return s.getFullYear() === n.getFullYear() && s.getMonth() === n.getMonth() && s.getDate() === n.getDate();
  };
  const live = matches.filter((m) => m.status === "ongoing");
  const scheduled = matches.filter((m) => m.status === "scheduled");
  const today = scheduled.filter((m) => isToday(m.schedule));
  const upcoming = scheduled.filter((m) => !isToday(m.schedule));
  const done = matches.filter((m) => m.status === "completed");

  if (openId) {
    return (
      <AdminLayout title={feed.sport} menu={organizerMenu}>
        <ScoringView matchId={openId} mode={feed.scoringMode}
          onBack={() => { setOpenId(null); load(); }} />
      </AdminLayout>
    );
  }

  const Row = ({ m }) => {
    const ready = m.teamA && m.teamB;
    return (
      <button
        onClick={() => ready && setOpenId(m._id)}
        disabled={!ready}
        className={`w-full text-left rounded-xl border p-4 transition ${
          ready ? "border-slate-200 bg-white hover:border-indigo-300" : "border-slate-100 bg-slate-50 cursor-not-allowed"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={`font-medium ${ready ? "text-slate-800" : "text-slate-400"}`}>
              {m.teamA?.teamName || "TBD"} <span className="text-slate-400">vs</span> {m.teamB?.teamName || "TBD"}
            </p>
                        <p className="text-slate-400 text-xs mt-0.5">
              {m.bracket} · round {m.round}{m.group ? ` · group ${m.group}` : ""}
              {m.schedule ? ` · ${new Date(m.schedule).toLocaleDateString()}` : ""}
            </p>
          </div>
          {m.status === "ongoing" ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600 whitespace-nowrap">
              ● LIVE {m.liveScoreA}–{m.liveScoreB}
            </span>
                    ) : m.status === "completed" ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">
              {m.liveScoreA}–{m.liveScoreB}
            </span>
          ) : !ready ? (
            <span className="text-xs text-slate-400 whitespace-nowrap">waiting</span>
          ) : (
            <span className="text-xs font-medium text-indigo-600 whitespace-nowrap">Start →</span>
          )}
        </div>
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

        <section>
          <h2 className="text-slate-700 font-semibold text-sm mb-2">
            Upcoming <span className="text-slate-400 font-normal">({upcoming.length})</span>
          </h2>
          <div className="space-y-2">
            {upcoming.length === 0 && <p className="text-slate-400 text-sm">Nothing scheduled.</p>}
            {upcoming.map((m) => <Row key={m._id} m={m} />)}
          </div>
        </section>

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