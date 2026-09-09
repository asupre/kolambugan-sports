import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { organizerMenu } from "../../components/menus";

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

const STAT_LABEL = { foul: "Foul", rebound: "Rebound", assist: "Assist" };

// The organizer picks a match out of a list at courtside, often in a hurry.
// Raw enum values ("winners · round 101 · group A") are database fields, not
// something a game official should have to decode.
function describeMatch(m, all = []) {
  if (m.isTiebreaker) {
    return {
      group: m.group ? `Group ${m.group}` : null,
      stage: m.round >= 101 ? "Tiebreaker decider" : "Tiebreaker playoff",
      note: "Winner takes the last qualifying spot",
      tone: "warn",
    };
  }

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
      : inRound ? `Round of ${inRound * 2}` : "Knockout";
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

// A date-only schedule is stored as midnight UTC, which would render as 8:00 AM
// in Manila — a time nobody set.
const timeOf = (d) => {
  if (!d) return null;
  const x = new Date(d);
  if (x.getUTCHours() === 0 && x.getUTCMinutes() === 0) return null;
  return x.toLocaleTimeString([], { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
};

const dateOf = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, {
    timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric",
  }) : "No date set";

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

// One card per player, with every action on the card itself. The previous screen
// needed two taps — select a player, then a value — which is where mis-taps came
// from, and it could fail with "pick a player first" in the middle of a game.
function PlayerCard({ player, stat, pointValues, statTypes, busy, onScore, onStat }) {
  const s = stat || { points: 0, fouls: 0, rebounds: 0, assists: 0 };
  const line = [
    `${s.points} pts`,
    s.rebounds ? `${s.rebounds} reb` : null,
    s.assists ? `${s.assists} ast` : null,
    s.fouls ? `${s.fouls} f` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-sm text-slate-800 truncate">
          <span className="text-slate-400 text-xs mr-1.5">{player.jerseyNumber ?? "—"}</span>
          {player.lastName}
        </span>
        <span className="text-xs text-slate-500 shrink-0">{line}</span>
      </div>

      <div className="flex gap-1.5 mb-1.5">
        {pointValues.map((v) => (
          <button key={v} onClick={() => onScore(player._id, v)} disabled={busy}
            className="flex-1 h-10 rounded-lg bg-green-600 text-white text-[15px] font-semibold hover:bg-green-700 disabled:opacity-40">
            +{v}
          </button>
        ))}
      </div>

      {statTypes.length > 0 && (
        <div className="flex gap-1.5">
          {statTypes.map((t) => (
            <button key={t} onClick={() => onStat(player._id, t)} disabled={busy}
              className="flex-1 h-8 rounded-lg border border-slate-300 text-slate-600 text-xs hover:bg-slate-50 disabled:opacity-40">
              {STAT_LABEL[t] || t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoringView({ matchId, onBack }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ending, setEnding] = useState(false);
  const [mvp, setMvp] = useState(null);
  const [periods, setPeriods] = useState(1);
  const [side, setSide] = useState("A");
  const [onCourt, setOnCourt] = useState({ A: [], B: [] });
  const [subbing, setSubbing] = useState(false);
    const [forfeiting, setForfeiting] = useState(false);

  async function load() {
    try {
      const d = await api(`/api/organizer/matches/${matchId}`);
      setData(d);
      // Default the on-court five to the lowest jersey numbers. It's a display
      // filter only — nothing about who played is stored.
      setOnCourt((prev) => {
        if (prev.A.length || prev.B.length) return prev;
        const pick = (roster) => [...roster]
          .sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999))
          .slice(0, d.onCourt || roster.length)
          .map((p) => String(p._id));
        return { A: pick(d.rosterA || []), B: pick(d.rosterB || []) };
      });
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
      // The start route returns 409 when the match is dated for another day.
      // Dates are guidance, not a lock — confirm and proceed.
      if (path === "start" && /scheduled for/i.test(e.message)) {
        if (window.confirm(e.message)) {
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
    } finally { setBusy(false); }
  }

  if (!data) return <p className="text-slate-500">Loading match…</p>;

  const m = data.match;
  const mode = data.scoringMode;
  const finalMode = mode === "final";
  const rally = mode === "rally";
  const live = m.status === "ongoing";
  const finished = m.status === "completed";
    const forfeited = m.status === "forfeited";
  const tied = (m.liveScoreA || 0) === (m.liveScoreB || 0);
  const allPeriodsDone = (m.games?.length || 0) >= (m.bestOf || 1) && !tied;
  const canEnd = finalMode ? !tied : allPeriodsDone;
  const desc = describeMatch(m);
  const stat = (id) => data.statByPlayer?.[String(id)] || { points: 0, fouls: 0, rebounds: 0, assists: 0 };

  const roster = side === "A" ? (data.rosterA || []) : (data.rosterB || []);
  const courtIds = onCourt[side] || [];
  const limit = data.onCourt || roster.length;
  const court = roster.filter((p) => courtIds.includes(String(p._id)));
  const bench = roster.filter((p) => !courtIds.includes(String(p._id)));
  const teamName = side === "A" ? m.teamA?.teamName : m.teamB?.teamName;

  function toggleCourt(id) {
    setOnCourt((prev) => {
      const cur = prev[side] || [];
      if (cur.includes(id)) return { ...prev, [side]: cur.filter((x) => x !== id) };
      if (cur.length >= limit) return prev;
      return { ...prev, [side]: [...cur, id] };
    });
  }

  const allPlayers = [
    ...(data.rosterA || []).map((p) => ({ ...p, side: "A" })),
    ...(data.rosterB || []).map((p) => ({ ...p, side: "B" })),
  ];
  const topScorer = allPlayers
    .map((p) => ({ p, pts: stat(p._id).points }))
    .sort((x, y) => y.pts - x.pts)[0];

  async function openEnd() {
    if (finalMode && (m.games?.length || 0) < (m.bestOf || 1)) await call("end-period");
    setMvp(topScorer?.pts > 0 ? String(topScorer.p._id) : null);
    setEnding(true);
  }

  const Scoreboard = () => (
    <div className="w-full lg:w-56 shrink-0 space-y-2">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          {desc.group && (
            <span className={`text-[11px] px-2 py-0.5 rounded ${
              desc.tone === "warn" ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"
            }`}>{desc.group}</span>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">
            {live && !finalMode
              ? `${(data.periodLabel || "period").replace(/^./, (c) => c.toUpperCase())} ${Math.min((m.games?.length || 0) + 1, m.bestOf || 1)} of ${m.bestOf || 1}`
                            : forfeited ? "Forfeit" : finished ? "Final" : "Not started"}
          </span>
        </div>

        <div className="text-center">
          <p className="text-slate-500 text-[13px] truncate">{m.teamA?.teamName}</p>
          <p className="text-3xl font-semibold tabular-nums text-slate-900">{m.liveScoreA}</p>
        </div>
        <div className="text-center pt-3 mt-3 border-t border-slate-100">
          <p className="text-slate-500 text-[13px] truncate">{m.teamB?.teamName}</p>
          <p className="text-3xl font-semibold tabular-nums text-slate-900">{m.liveScoreB}</p>
        </div>

        {(m.games || []).length > 0 && (
          <p className="text-center text-slate-400 text-[11px] mt-3 tabular-nums">
            {(m.games || []).map((g) => `${g.scoreA}-${g.scoreB}`).join(" · ")}
          </p>
        )}
      </div>

      {live && (
        <>
          {m.lastAction?.label && (
            <button onClick={() => call("undo")} disabled={busy}
              className="w-full h-9 rounded-lg border border-slate-300 text-slate-600 text-[13px] hover:bg-slate-50 disabled:opacity-40">
              ↺ Undo {m.lastAction.label}
            </button>
          )}
          {!finalMode && (
            <button onClick={() => call("end-period")}
              disabled={busy || (m.games?.length || 0) >= (m.bestOf || 1)}
              className="w-full h-9 rounded-lg bg-slate-800 text-white text-[13px] font-medium hover:bg-slate-700 disabled:opacity-40">
              End this {data.periodLabel || "period"}
            </button>
          )}
          <button onClick={openEnd} disabled={busy || !canEnd}
            className="w-full h-9 rounded-lg bg-red-600 text-white text-[13px] font-medium hover:bg-red-700 disabled:opacity-40">
            End match
          </button>
          <button
            onClick={() => {
              const scored = (m.games?.length || 0) > 0 || (m.liveScoreA || 0) > 0 || (m.liveScoreB || 0) > 0;
              const msg = scored
                ? `Cancel this match? The score (${m.liveScoreA}–${m.liveScoreB}) and everything recorded will be discarded.`
                : "Cancel this match and return it to not-started?";
              if (window.confirm(msg)) call("cancel");
            }}
            disabled={busy}
            className="w-full h-9 rounded-lg border border-red-200 text-red-600 text-[13px] hover:bg-red-50 disabled:opacity-40">
            Cancel match
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl">
      <button onClick={onBack} className="text-slate-500 text-sm mb-3 hover:text-slate-700">← All matches</button>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-slate-500 text-xs">
          {data.sport}
          {data.division && data.division !== "open" ? ` ${DIVISION_LABEL[data.division] || data.division}` : ""}
          {" · "}{desc.stage}
        </span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

     {!live && !finished && !forfeited && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 mb-4">
          {finalMode ? (
            <p className="text-slate-500 text-sm mb-3">
              Record the winner of each game as it finishes. The team with more games won takes the match.
            </p>
          ) : (
            <>
              <p className="text-slate-700 text-sm font-medium mb-1">How many {data.periodLabel || "period"}s?</p>
              <p className="text-slate-400 text-xs mb-3">
                All of them are played, and the winner is the higher total score.
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
            className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {busy ? "Starting…" : "Start match"}
          </button>

          {!forfeiting ? (
            <button onClick={() => setForfeiting(true)}
              className="w-full mt-2 py-2.5 rounded-xl border border-amber-300 text-amber-700 text-sm hover:bg-amber-50">
              A team didn't show up
            </button>
          ) : (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-slate-700 text-sm font-medium mb-1">Which team forfeited?</p>
              <p className="text-slate-400 text-xs mb-3">
                Recorded 1–0 to the team that showed up, marked as a forfeit. The winner
                advances as normal.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {["A", "B"].map((s) => {
                  const name = s === "A" ? m.teamA?.teamName : m.teamB?.teamName;
                  return (
                    <button key={s} disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Record ${name} as forfeiting? The other team wins 1–0.`)) {
                          call("forfeit", { forfeitingSide: s });
                        }
                      }}
                      className="py-3 rounded-lg border border-amber-300 text-amber-800 bg-amber-50 text-sm font-medium hover:bg-amber-100 disabled:opacity-50">
                      {name}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setForfeiting(false)}
                className="w-full mt-2 py-2 text-slate-500 text-xs hover:text-slate-700">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          {finalMode ? (
            live && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => call("score", { side: "A", points: 1 })} disabled={busy}
                  className="py-6 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50">
                  {m.teamA?.teamName} won a game
                </button>
                <button onClick={() => call("score", { side: "B", points: 1 })} disabled={busy}
                  className="py-6 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50">
                  {m.teamB?.teamName} won a game
                </button>
              </div>
            )
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                {["A", "B"].map((s) => (
                  <button key={s} onClick={() => setSide(s)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
                      side === s ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}>
                    {s === "A" ? m.teamA?.teamName : m.teamB?.teamName}
                  </button>
                ))}
              </div>

              {live && (
                <>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-slate-400 text-xs">On court · {court.length} of {limit}</p>
                    <button onClick={() => setSubbing(!subbing)}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
                      {subbing ? "Done" : "Substitute"}
                    </button>
                  </div>

                  {subbing ? (
                    <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
                      <p className="text-slate-500 text-xs mb-2">
                        Tap to move a player on or off court. This only changes which cards are
                        shown — it isn't recorded.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {roster.map((p) => {
                          const on = courtIds.includes(String(p._id));
                          return (
                            <button key={p._id} onClick={() => toggleCourt(String(p._id))}
                              className={`px-2 py-1.5 rounded-lg text-xs text-left truncate transition ${
                                on ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}>
                              <span className="opacity-70 mr-1">{p.jerseyNumber ?? "—"}</span>
                              {p.lastName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-2">
                        {court.map((p) => (
                          <PlayerCard
                            key={p._id}
                            player={p}
                            stat={stat(p._id)}
                            pointValues={data.pointValues || [1]}
                            statTypes={data.statTypes || []}
                            busy={busy}
                            onScore={(id, v) => call("score", { side, points: v, playerId: id })}
                            onStat={(id, t) => call("stat", { playerId: id, type: t })}
                          />
                        ))}
                        {court.length === 0 && (
                          <p className="text-slate-400 text-sm">Nobody on court — tap Substitute.</p>
                        )}
                      </div>

                      {rally && (
                        <button onClick={() => call("score", { side, points: 1 })} disabled={busy}
                          className="w-full mt-2 py-3 rounded-xl border border-green-300 text-green-700 bg-green-50 text-sm font-medium hover:bg-green-100 disabled:opacity-40">
                          +1 {teamName} — opponent error
                        </button>
                      )}

                      {bench.length > 0 && (
                        <p className="text-slate-400 text-xs mt-3">
                          Bench: {bench.map((p) => p.lastName).join(" · ")}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {tied && (m.games?.length || 0) >= (m.bestOf || 1) && !finalMode && (
            <p className="text-amber-600 text-sm text-center mt-3">
              Scores are level — play a deciding {data.periodLabel || "period"}.
            </p>
          )}
        </div>

        <Scoreboard />
      </div>

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
      setFeed(await api("/api/organizer/matches"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return <AdminLayout title="Matches" menu={organizerMenu}><p className="text-slate-500">Loading…</p></AdminLayout>;
  }

  const matches = feed?.matches || [];
  const manilaDay = (d) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(d));
  const isToday = (d) => !!d && manilaDay(d) === manilaDay(new Date());

  const live = matches.filter((m) => m.status === "ongoing");
  const scheduled = matches.filter((m) => m.status === "scheduled");
  const today = scheduled.filter((m) => isToday(m.schedule));
  const upcoming = scheduled.filter((m) => !isToday(m.schedule));
    const done = matches.filter((m) => m.status === "completed" || m.status === "forfeited");

  const grouped = {};
  upcoming.forEach((m) => { (grouped[dateOf(m.schedule)] = grouped[dateOf(m.schedule)] || []).push(m); });
  const byDate = Object.entries(grouped).sort((a, b) =>
    a[0] === "No date set" ? 1 : b[0] === "No date set" ? -1 : 0
  );

  if (openId) {
    return (
      <AdminLayout title={feed.sport} menu={organizerMenu}>
        <ScoringView matchId={openId} onBack={() => { setOpenId(null); load(); }} />
      </AdminLayout>
    );
  }

  const Row = ({ m, showDate }) => {
    const ready = m.teamA && m.teamB;
    const d = describeMatch(m, matches);
    const time = timeOf(m.schedule);
    const isLive = m.status === "ongoing";
        const isDone = m.status === "completed" || m.status === "forfeited";

    const accent = isLive ? "border-l-4 border-l-red-500"
      : ready && !isDone ? "border-l-4 border-l-indigo-500"
      : "border-l-4 border-l-slate-200";

    const tag = d.tone === "warn" ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800";

    return (
      <button onClick={() => ready && setOpenId(m._id)} disabled={!ready}
        className={`w-full text-left rounded-xl border ${accent} p-4 transition ${
          ready && !isDone
            ? "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
            : "border-slate-100 bg-slate-50"
        } ${!ready ? "cursor-not-allowed" : ""}`}>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {d.group && <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${tag}`}>{d.group}</span>}
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

          {isLive ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-800 whitespace-nowrap shrink-0">
              ● LIVE {m.liveScoreA}–{m.liveScoreB}
            </span>
          ) : isDone ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 whitespace-nowrap shrink-0">
                            {m.status === "forfeited" ? "Forfeit " : ""}{m.liveScoreA}–{m.liveScoreB}
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
            <h2 className="text-slate-700 font-semibold text-sm mb-2">Playing now</h2>
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
                  <div className="space-y-2">{list.map((m) => <Row key={m._id} m={m} />)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {upcoming.length === 0 && today.length === 0 && live.length === 0 && (
          <p className="text-slate-400 text-sm">Nothing scheduled.</p>
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