import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { SEASON_STAGES } from "../../lib/season";
import { divisionLabel } from "../../lib/dashboardFormat";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";

// Super Admin dashboard, "calm" look (Oct 2026 PREVIEW). Modeled on a reference the Super
// Admin liked: warm off-white page, one big title + a plain subtitle, sections headed like
// "Animals 29,713 species", thin-bordered cards with no shadows or icon blobs, numbers as
// plain text joined with " · ", and a muted green accent used sparingly. Colour only
// carries meaning (small dots: red = overdue / live, amber = to do). Tokens: `.calm` in
// index.css. Data and the attention rules are unchanged from the previous dashboard.

const STAGE_LABEL = { group_stage: "Group stage", elimination: "Knockout", completed: "Completed" };
// How the subtitle describes the season stage ("… is underway.").
const STAGE_PHRASE = {
  setup: "is being set up",
  registration_open: "is open for registration",
  verification: "is in verification",
  ongoing: "is underway",
  completed: "is complete",
};
const fmt = (n) => (n ?? 0).toLocaleString();

// What the Super Admin should do, in order of importance. Only real items appear;
// an empty list is a good thing and says so. Each row links to where it's fixed.
function buildAttention(s) {
  if (!s) return [];
  const items = [];
  const add = (tone, text, to, cta) => items.push({ tone, text, to, cta });
  const status = s.season?.status;

  if (!s.season) {
    add("red", "No season has been created yet.", "/admin/season", "Create a season");
    return items;
  }
  if (s.referenceList?.count === 0) {
    add("red", "No reference list is uploaded, so nobody can be checked automatically.", "/admin/reference", "Upload list");
  }
  if (s.accounts?.missingBarangayAdmins > 0) {
    const n = s.accounts.missingBarangayAdmins;
    add("amber", `${n} barangay${n === 1 ? " has" : "s have"} no admin account.`, "/admin/accounts", "Provision accounts");
  }
  if (s.accounts?.missingOrganizers > 0) {
    const n = s.accounts.missingOrganizers;
    add("amber", `${n} sport${n === 1 ? " has" : "s have"} no organizer account.`, "/admin/accounts", "Provision accounts");
  }
  if (s.teamsByState?.review > 0) {
    const n = s.teamsByState.review;
    add("accent", `${n} team${n === 1 ? " is" : "s are"} waiting for your review.`, "/admin/review", "Open Review Queue");
  }
  if (s.playersToReview > 0) {
    const n = s.playersToReview;
    add("amber", `${n} player${n === 1 ? " is" : "s are"} flagged or missing a document.`, "/admin/review", "Review players");
  }
  if (status === "verification" || status === "ongoing") {
    const undrawn = (s.sportsProgress || []).flatMap((sp) => sp.divisions.filter((d) => d.verifiedTeams > 0 && !d.tournament).map((d) => `${sp.name} ${divisionLabel(d.division)}`.trim()));
    if (undrawn.length) {
      add("amber", `${undrawn.length} sport division${undrawn.length === 1 ? " has" : "s have"} verified teams but no bracket yet (${undrawn.slice(0, 3).join(", ")}${undrawn.length > 3 ? "…" : ""}).`, "/admin/tournaments", "Generate brackets");
    }
  }
  if (status === "ongoing") {
    if (s.matches?.overdue > 0) {
      const n = s.matches.overdue;
      add("red", `${n} match${n === 1 ? " was" : "es were"} dated for a past day but never played.`, "/admin/tournaments", "Open Tournaments");
    }
    if (s.matches?.undated > 0) {
      const n = s.matches.undated;
      add("amber", `${n} ready match${n === 1 ? " has" : "es have"} no date yet.`, "/admin/tournaments", "Set dates");
    }
  }
  if (status === "verification" && s.teamsByState?.review === 0 && s.teamsByState?.draft === 0 && s.teamsByState?.verified > 0) {
    add("accent", "Every team is verified. You can generate brackets and move the season on.", "/admin/season", "Manage season");
  }
  if (s.accounts?.tempPassword > 0) {
    const n = s.accounts.tempPassword;
    add("faint", `${n} account${n === 1 ? " is" : "s are"} still on a temporary password.`, "/admin/accounts", "View accounts");
  }
  return items;
}

const DOT = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  accent: "bg-[var(--calm-accent)]",
  faint: "bg-[var(--calm-faint)]",
};

const timeOf = (d) =>
  new Date(d).toLocaleTimeString([], { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

// ── Small building blocks ────────────────────────────────────────────────────

function Section({ title, count, children, className }) {
  return (
    <section className={cn("mt-10", className)}>
      <div className="mb-3 flex items-baseline gap-2.5">
        <h2 className="text-[21px] font-semibold tracking-tight">{title}</h2>
        {count != null && <span className="text-[14px] text-[var(--calm-muted)]">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function CalmCard({ children, onClick, className }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "block w-full rounded-xl border border-[var(--calm-border)] bg-[var(--calm-card)] p-4 text-left",
        // A <button> centres its content vertically; cards in a row must read top-down.
        onClick && "flex flex-col justify-start transition-colors hover:bg-[var(--calm-card-hover)] focus-visible:outline-2 focus-visible:outline-[var(--calm-accent)]",
        className
      )}
    >
      {children}
    </Tag>
  );
}

function GoLink({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[14px] font-medium text-[var(--calm-accent)] transition-colors hover:bg-[var(--calm-accent-soft)]"
    >
      {children} <ArrowRight className="size-3.5" />
    </button>
  );
}

function Bone({ className }) {
  return <div className={cn("animate-pulse rounded-lg bg-[var(--calm-track)]", className)} />;
}

// A thin bar split into parts. Shades of the one accent, never a rainbow.
function Bar({ parts }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-[var(--calm-track)]">
      {total > 0 && parts.filter((p) => p.value > 0).map((p) => (
        <div key={p.label} className={p.cls} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${p.value}`} />
      ))}
    </div>
  );
}

function SeasonSteps({ status }) {
  const at = SEASON_STAGES.findIndex((s) => s.key === status);
  return (
    <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {SEASON_STAGES.map((st, i) => {
        const done = i < at;
        const now = i === at;
        return (
          <li key={st.key} className="min-w-0">
            <div className={cn("h-1 rounded-full", done || now ? "bg-[var(--calm-accent)]" : "bg-[var(--calm-track)]")} />
            <p className={cn(
              "mt-2 truncate text-[12px] sm:text-[14px]",
              now ? "font-semibold text-[var(--calm-ink)]" : done ? "text-[var(--calm-muted)]" : "text-[var(--calm-faint)]"
            )}>
              {st.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api("/api/stats/dashboard")
        .then((d) => { if (alive) setStats(d); })
        .catch(() => { if (alive) setStats(null); })
        .finally(() => { if (alive) setLoading(false); });
    load();
    const timer = setInterval(load, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const s = stats;
  const todayMatches = s?.todayMatches || [];
  const attention = buildAttention(s);
  const ts = s?.teamsByState;
  const bp = s?.barangayProgress;
  const m = s?.matches;
  const players = s?.players;

  const tiles = [
    { label: "Teams verified", value: ts && `${fmt(ts.verified)} of ${fmt(s.teams)}`, meta: ts && `${fmt(ts.review)} under review · ${fmt(ts.draft)} draft`, to: "/admin/review" },
    { label: "Players eligible", value: players && `${fmt(players.eligible)} of ${fmt(players.total)}`, meta: "roster entries", to: "/admin/review" },
    { label: "Barangays cleared", value: bp && `${fmt(bp.cleared)} of ${fmt(bp.total)}`, meta: "verified in every sport", to: "/admin/review" },
    { label: "Matches played", value: m && `${fmt(m.completed)} of ${fmt(m.total)}`, meta: m && `${fmt(m.live)} live now`, to: "/admin/tournaments" },
  ];

  return (
    <AdminLayout
      title="Dashboard"
      menu={superAdminMenu}
      enableDarkMode
      subtitle={loading ? " " : s?.season
        ? `${s.season.name} ${STAGE_PHRASE[s.season.status] || "is running"}. Here is what needs doing and how the league is going.`
        : "No season yet. Create one to open registration."}
      actions={
        <Button variant="outline" onClick={() => navigate("/admin/season")}>
          {s?.season ? "Manage season" : "Create a season"}
        </Button>
      }
    >
      {/* The page header and centred column come from AdminLayout (calm look). */}
      <div className="calm">
        <div>
          {/* Season progress */}
          <div>
            {loading ? <Bone className="h-10" /> : s?.season && <SeasonSteps status={s.season.status} />}
          </div>

          {/* Needs your attention */}
          <Section title="Needs your attention" count={!loading && attention.length ? `${attention.length} ${attention.length === 1 ? "item" : "items"}` : null}>
            {loading ? (
              <Bone className="h-28" />
            ) : attention.length === 0 ? (
              <CalmCard className="flex items-center gap-3">
                <span className="size-2 shrink-0 rounded-full bg-[var(--calm-accent)]" />
                <span className="text-[15px] text-[var(--calm-muted)]">Nothing needs your attention right now.</span>
              </CalmCard>
            ) : (
              <div className="divide-y divide-[var(--calm-border)] overflow-hidden rounded-xl border border-[var(--calm-border)] bg-[var(--calm-card)]">
                {attention.map((a, i) => (
                  <div key={i} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", DOT[a.tone])} />
                      <p className="text-[15px] leading-snug">{a.text}</p>
                    </div>
                    <div className="pl-5 sm:pl-0">
                      <GoLink onClick={() => navigate(a.to)}>{a.cta}</GoLink>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* At a glance */}
          <Section title="At a glance" count={s?.season ? "this season" : null}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tiles.map((t) => (
                loading ? <Bone key={t.label} className="h-[104px]" /> : (
                  <CalmCard key={t.label} onClick={() => navigate(t.to)}>
                    <p className="text-[15px] font-medium text-[var(--calm-muted)]">{t.label}</p>
                    <p className="mt-1 text-[26px] font-semibold leading-tight tracking-tight tabular-nums">{t.value || "0"}</p>
                    <p className="mt-1 text-[14px] text-[var(--calm-muted)]">{t.meta || " "}</p>
                  </CalmCard>
                )
              ))}
            </div>
          </Section>

          {/* Registration */}
          <Section title="Registration" count={!loading && s?.season ? `${fmt(s.teams)} teams · ${fmt(bp?.total)} barangays` : null}>
            {loading ? (
              <div className="grid gap-3 md:grid-cols-2"><Bone className="h-32" /><Bone className="h-32" /></div>
            ) : !s?.season ? (
              <p className="text-[15px] text-[var(--calm-muted)]">No season yet.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <CalmCard>
                  <p className="text-[17px] font-semibold">Teams</p>
                  <p className="text-[14px] italic text-[var(--calm-muted)]">{fmt(s.teams)} registered</p>
                  <Bar parts={[
                    { label: "Verified", value: ts.verified, cls: "bg-[var(--calm-accent)]" },
                    { label: "Under review", value: ts.review, cls: "bg-[var(--calm-accent)]/45" },
                    { label: "Draft", value: ts.draft, cls: "bg-[var(--calm-faint)]/50" },
                  ]} />
                  <p className="mt-3 text-[15px]">
                    {fmt(ts.verified)} verified <span className="text-[var(--calm-faint)]">·</span> {fmt(ts.review)} under review{" "}
                    <span className="text-[var(--calm-faint)]">·</span> {fmt(ts.draft)} draft
                  </p>
                </CalmCard>
                <CalmCard>
                  <p className="text-[17px] font-semibold">Barangays</p>
                  <p className="text-[14px] italic text-[var(--calm-muted)]">{fmt(bp.total)} in the league</p>
                  <Bar parts={[
                    { label: "Cleared", value: bp.cleared, cls: "bg-[var(--calm-accent)]" },
                    { label: "In progress", value: bp.inProgress, cls: "bg-[var(--calm-accent)]/45" },
                  ]} />
                  <p className="mt-3 text-[15px]">
                    {fmt(bp.cleared)} cleared <span className="text-[var(--calm-faint)]">·</span> {fmt(bp.inProgress)} in progress{" "}
                    <span className="text-[var(--calm-faint)]">·</span> {fmt(bp.notStarted)} not started
                  </p>
                  {bp.notStarted > 0 && (
                    <p className="mt-1.5 text-[14px] text-[var(--calm-muted)]">
                      Not started: {bp.notStartedNames.join(", ")}
                      {bp.notStarted > bp.notStartedNames.length ? ` and ${bp.notStarted - bp.notStartedNames.length} more` : ""}
                    </p>
                  )}
                </CalmCard>
              </div>
            )}
          </Section>

          {/* Today's games */}
          <Section title="Today's games" count={!loading ? `${todayMatches.length} ${todayMatches.length === 1 ? "game" : "games"}` : null}>
            {loading ? (
              <Bone className="h-32" />
            ) : todayMatches.length === 0 ? (
              <p className="text-[15px] text-[var(--calm-muted)]">Nothing scheduled for today.</p>
            ) : (
              <div className="divide-y divide-[var(--calm-border)] overflow-hidden rounded-xl border border-[var(--calm-border)] bg-[var(--calm-card)]">
                {todayMatches.map((g) => {
                  const live = g.status === "ongoing";
                  const done = g.status === "completed" || g.status === "forfeited";
                  return (
                    <div key={g.id} className="grid grid-cols-[4.5rem_1fr] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[5.5rem_1fr_auto]">
                      <span className="text-[15px] font-medium tabular-nums">
                        {live ? (
                          <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
                            <span className="size-1.5 rounded-full bg-current" /> Live
                          </span>
                        ) : done ? <span className="text-[var(--calm-muted)]">Final</span> : timeOf(g.schedule)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium">
                          {g.teamA} <span className="font-normal text-[var(--calm-faint)]">vs</span> {g.teamB}
                        </p>
                        <p className="truncate text-[13px] text-[var(--calm-muted)]">
                          {[g.sport, g.venue].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="col-start-2 text-[13px] text-[var(--calm-muted)] sm:col-start-auto sm:text-right">
                        {fmt(g.players)} player{g.players === 1 ? "" : "s"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Competition */}
          <Section title="Competition" count={!loading && s?.sportsProgress?.length ? `${s.sportsProgress.length} sports` : null}>
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Bone className="h-36" /><Bone className="h-36" /><Bone className="h-36" /></div>
            ) : !s?.sportsProgress?.length ? (
              <p className="text-[15px] text-[var(--calm-muted)]">No sports configured yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {s.sportsProgress.map((sp) => (
                  <CalmCard key={sp.id} onClick={() => navigate(`/admin/tournaments/${sp.id}`)}>
                    <p className="text-[17px] font-semibold">{sp.name}</p>
                    <div className="mt-2 space-y-2.5">
                      {sp.divisions.map((d) => {
                        const t = d.tournament;
                        const pct = t?.total ? Math.round((t.completed / t.total) * 100) : 0;
                        return (
                          <div key={d.division}>
                            <p className="text-[14px] italic text-[var(--calm-muted)]">{divisionLabel(d.division) || "Open"}</p>
                            <p className="text-[15px]">
                              {fmt(d.verifiedTeams)} team{d.verifiedTeams === 1 ? "" : "s"}{" "}
                              <span className="text-[var(--calm-faint)]">·</span>{" "}
                              {t ? `${STAGE_LABEL[t.stage] || t.stage}, ${fmt(t.completed)} of ${fmt(t.total)} played` : <span className="text-[var(--calm-muted)]">no bracket yet</span>}
                            </p>
                            {t && (
                              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--calm-track)]">
                                <div className="h-full rounded-full bg-[var(--calm-accent)]" style={{ width: `${pct}%` }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CalmCard>
                ))}
              </div>
            )}
          </Section>

          {/* The counts that rarely change, kept small */}
          {!loading && s && (
            <p className="mt-10 border-t border-[var(--calm-border)] pt-4 text-[13px] text-[var(--calm-faint)]">
              {fmt(s.barangays)} barangays · {fmt(s.sports)} sports · {fmt(s.accounts?.barangayAdmins)} barangay admins ·{" "}
              {fmt(s.accounts?.organizers)} organizers
              {s.referenceList ? ` · ${fmt(s.referenceList.count)} residents on the reference list` : ""}
            </p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
