import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { Card } from "../../components/ui";

const brgyMenu = [
  { label: "My Teams", path: "/brgy", icon: "⛃" },
  { label: "Verification Status", path: "/brgy/documents", icon: "🗎" },
  { label: "Matches", path: "/brgy/matches", icon: "◷" },
];

const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls",
  under17: "Under 17", under30: "Under 30",
};

// A date-only schedule is stored as midnight UTC, which renders as 8:00 AM in
// Manila — a time nobody set. Only show a time when one was actually chosen.
const hasTime = (d) => {
  const x = new Date(d);
  return !(x.getUTCHours() === 0 && x.getUTCMinutes() === 0 && x.getUTCSeconds() === 0);
};

const dateOf = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, {
    timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric",
  }) : "Date to be confirmed";

const timeOf = (d) =>
  d && hasTime(d)
    ? new Date(d).toLocaleTimeString([], { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })
    : null;

const context = (m) =>
  [m.sport, DIVISION_LABEL[m.division] || m.division, m.group ? `Group ${m.group}` : null]
    .filter(Boolean).join(" · ");

function MatchRow({ m, myTeamIds }) {
  const mine = (t) => t && myTeamIds.has(String(t.id));
  const done = m.status === "completed";
  const live = m.status === "ongoing";
  const won = done && m.winner && myTeamIds.has(String(m.winner));

  const Side = ({ team, score }) => (
    <div className={`flex items-center gap-2 min-w-0 ${mine(team) ? "" : "text-slate-500"}`}>
      <span className={`truncate text-sm ${mine(team) ? "text-slate-800 font-medium" : ""}`}>
        {team?.name || "TBD"}
      </span>
      {(done || live) && (
        <span className="text-sm font-semibold tabular-nums text-slate-700 shrink-0">{score}</span>
      )}
    </div>
  );

  return (
    <div className="border border-slate-200 rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-slate-400 text-xs truncate">{context(m)}</span>
        {live ? (
          <span className="text-red-600 text-xs font-semibold shrink-0">● LIVE</span>
        ) : done ? (
          <span className={`text-xs font-medium shrink-0 ${won ? "text-green-700" : "text-slate-400"}`}>
            {won ? "Won" : "Lost"}
          </span>
        ) : (
          <span className="text-slate-400 text-xs shrink-0">{timeOf(m.schedule) || "Time TBD"}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0"><Side team={m.teamA} score={m.scoreA} /></div>
        <span className="text-slate-300 text-xs shrink-0">vs</span>
        <div className="flex-1 min-w-0"><Side team={m.teamB} score={m.scoreB} /></div>
      </div>

      {m.venue && !done && (
        <p className="text-slate-400 text-xs mt-1.5">{m.venue}</p>
      )}
    </div>
  );
}

export default function BrgyMatches() {
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        // Match data is public, so there's no barangay-scoped endpoint to build —
        // /teams/mine says which teams are ours, and we filter the public feed.
        const [mine, pub] = await Promise.all([
          api("/api/teams/mine"),
          api("/api/public/matches"),
        ]);
        if (!alive) return;
        setTeams(mine.teams || []);
        setMatches(pub.matches || []);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 20000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const myTeamIds = new Set(teams.map((t) => String(t._id)));
  const ours = matches.filter(
    (m) => myTeamIds.has(String(m.teamA?.id)) || myTeamIds.has(String(m.teamB?.id))
  );

  const live = ours.filter((m) => m.status === "ongoing");
  const upcoming = ours.filter((m) => m.status === "scheduled");
    const done = ours.filter((m) => m.status === "completed" || m.status === "forfeited").reverse();

  // Upcoming groups by date; undated fixtures fall into their own bucket at the end.
  const byDate = {};
  upcoming.forEach((m) => { (byDate[dateOf(m.schedule)] = byDate[dateOf(m.schedule)] || []).push(m); });
  const dateKeys = Object.keys(byDate).sort((a, b) =>
    a === "Date to be confirmed" ? 1 : b === "Date to be confirmed" ? -1 : 0
  );

  const wins = done.filter((m) => m.winner && myTeamIds.has(String(m.winner))).length;

  return (
    <AdminLayout title="Matches" menu={brgyMenu}>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="max-w-3xl space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <Card className="p-5">
            <h2 className="text-slate-800 font-semibold mb-1">Your barangay's matches</h2>
            <p className="text-slate-500 text-sm">
              Every match involving one of your teams this season. Scores are entered
              courtside by the organizer and appear here as they're played.
            </p>
            {done.length > 0 && (
              <p className="text-slate-600 text-sm mt-2">
                {wins} won · {done.length - wins} lost · {upcoming.length} still to play
              </p>
            )}
          </Card>

          {ours.length === 0 && (
            <Card className="p-5">
              <p className="text-slate-500 text-sm">
                No matches yet. Fixtures appear once your teams are verified and the
                SK Federation has drawn the tournament.
              </p>
            </Card>
          )}

          {live.length > 0 && (
            <Card className="p-5">
              <h3 className="text-slate-800 font-semibold mb-3">
                Playing now <span className="text-slate-400 font-normal text-sm">({live.length})</span>
              </h3>
              <div className="space-y-2">
                {live.map((m) => <MatchRow key={m.id} m={m} myTeamIds={myTeamIds} />)}
              </div>
            </Card>
          )}

          {upcoming.length > 0 && (
            <Card className="p-5">
              <h3 className="text-slate-800 font-semibold mb-3">
                Upcoming <span className="text-slate-400 font-normal text-sm">({upcoming.length})</span>
              </h3>
              <div className="space-y-4">
                {dateKeys.map((date) => (
                  <div key={date}>
                    <p className="text-slate-600 text-xs font-semibold mb-1.5">{date}</p>
                    <div className="space-y-2">
                      {byDate[date].map((m) => <MatchRow key={m.id} m={m} myTeamIds={myTeamIds} />)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {done.length > 0 && (
            <Card className="p-5">
              <h3 className="text-slate-800 font-semibold mb-3">
                Results <span className="text-slate-400 font-normal text-sm">({done.length})</span>
              </h3>
              <div className="space-y-2">
                {done.map((m) => <MatchRow key={m.id} m={m} myTeamIds={myTeamIds} />)}
              </div>
            </Card>
          )}
        </div>
      )}
    </AdminLayout>
  );
}