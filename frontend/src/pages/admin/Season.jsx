import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, CircleCheck, Info, Plus, Settings2, TriangleAlert } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { SeasonBadge, SeasonTracker } from "../../components/SeasonStatus";
import { SEASON_STAGES } from "../../lib/season";
import { CONSEQUENCES, NEXT_LABEL, buildReadiness } from "../../lib/seasonReadiness";
import { fmtDate } from "../../lib/dashboardFormat";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";

const DIVISION_LABEL = { open: "Open", boys: "Boys", girls: "Girls", under15: "U15", under30: "U30" };
const FORMAT_LABEL = { team: "Team", doubles: "Doubles", singles: "Singles" };

// The stage after `status`, or null when the season is finished.
const nextStageOf = (status) => {
  const i = SEASON_STAGES.findIndex((s) => s.key === status);
  return i >= 0 && i < SEASON_STAGES.length - 1 ? SEASON_STAGES[i + 1] : null;
};

const READY_ICON = {
  ok: { Icon: CircleCheck, cls: "text-green-600 dark:text-green-400" },
  warn: { Icon: TriangleAlert, cls: "text-amber-600 dark:text-amber-400" },
  info: { Icon: Info, cls: "text-muted-foreground" },
};

// One line of the "ready to move on?" checklist — green when done, amber when it
// isn't, muted for information — with a shortcut to where it's fixed.
function ReadinessRow({ item, onGo }) {
  const { Icon, cls } = READY_ICON[item.state];
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className={cn("mt-0.5 size-4 shrink-0", cls)} />
        <p className="text-sm">{item.text}</p>
      </div>
      {item.to && (
        <Button size="sm" variant="outline" className="self-start sm:self-auto" onClick={() => onGo(item.to)}>
          {item.cta} <ArrowRight />
        </Button>
      )}
    </div>
  );
}

// The deliberate last step: what changes, anything unfinished, and an explicit
// "move on anyway" when there are warnings. Advancing is irreversible and the
// backend doesn't stop a premature one, so this is where it's made a real decision.
function AdvanceDialog({ open, onClose, status, warnings, onConfirm, busy, error }) {
  const next = nextStageOf(status);
  if (!next) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{NEXT_LABEL[status]}?</DialogTitle>
          <DialogDescription>
            The season moves to <span className="font-medium text-foreground">{next.label}</span>. This can't be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">What changes</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {(CONSEQUENCES[status] || []).map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>

          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                <TriangleAlert className="size-4" /> Not finished yet
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {warnings.map((w) => <li key={w.text}>{w.text}</li>)}
              </ul>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : warnings.length > 0 ? "Move on anyway" : NEXT_LABEL[status]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateSeasonModal({ open, onClose, onCreate, busy, error }) {
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a season</DialogTitle>
          <DialogDescription>It will start in the Setup stage.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="season-name">Season name</Label>
          <Input
            id="season-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 2026 Season"
            autoFocus
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate(name.trim())} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// What each sport is set to run. Shown during Setup because the settings are
// frozen once teams register — this is the last comfortable moment to check them.
function SportSetupSummary() {
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/sports")
      .then((d) => setSports(d.sports || []))
      .catch(() => setSports([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="size-4 text-amber-500" /> Sport setup
          </CardTitle>
          <Link to="/admin/config" className="text-primary text-sm font-medium hover:underline">
            Change
          </Link>
        </div>
        <CardDescription>
          Check these before opening registration. Once barangays start registering,
          divisions and entry formats are locked — rosters get built against them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border divide-y">
          {sports.map((s) => {
            const divisions = s.divisions?.length ? s.divisions : ["open"];
            return (
              <div key={s._id} className="flex flex-col gap-1.5 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3">
                <span className="font-medium sm:w-32 sm:shrink-0 truncate">{s.name}</span>
                <div className="flex-1 min-w-0 flex flex-wrap gap-1">
                  {divisions.map((d) => (
                    <Badge key={d} variant="secondary">{DIVISION_LABEL[d] || d}</Badge>
                  ))}
                </div>
                <span className="text-muted-foreground text-xs shrink-0">
                  {FORMAT_LABEL[s.entryFormat] || s.entryFormat || "—"}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Season() {
  const navigate = useNavigate();
  const [season, setSeason] = useState(null);
  const [stats, setStats] = useState(null);       // the dashboard payload — the readiness checks read it
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);

  async function load() {
    try {
      const [cur, st, hist] = await Promise.all([
        api("/api/seasons/current").catch(() => ({ season: null })),
        api("/api/stats/dashboard").catch(() => null),
        api("/api/seasons").catch(() => ({ seasons: [] })),
      ]);
      setSeason(cur.season);
      setStats(st);
      setHistory(hist.seasons || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createSeason(name) {
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/seasons", { method: "POST", body: JSON.stringify({ name }) });
      setCreateOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!season) return;
    const next = nextStageOf(season.status);
    if (!next) return;
    setBusy(true);
    setError("");
    try {
      // expectedNext: the backend refuses if another screen already advanced the
      // season, so a stale page can't skip a stage by double-advancing.
      await api(`/api/seasons/${season._id}/advance`, { method: "POST", body: JSON.stringify({ expectedNext: next.key }) });
      setAdvanceOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const next = season ? nextStageOf(season.status) : null;
  const readiness = season ? buildReadiness(season.status, stats) : [];
  const warnings = readiness.filter((r) => r.state === "warn");

  return (
    <AdminLayout title="Season" menu={superAdminMenu} enableDarkMode>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : !season ? (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No active season</CardTitle>
            <CardDescription>Create a season to begin the cycle.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => { setError(""); setCreateOpen(true); }}>
              <Plus /> Create Season
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Which season, where it is in its life, and what that stage means */}
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarClock className="size-3.5" /> Current season
                  </p>
                  <h2 className="text-xl font-semibold break-words">{season.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    Opened {fmtDate(season.openedAt)}
                    {season.closedAt ? ` · Closed ${fmtDate(season.closedAt)}` : ""}
                  </p>
                </div>
                <SeasonBadge status={season.status} />
              </div>
              <SeasonTracker status={season.status} role="super_admin" />
            </CardContent>
          </Card>

          {/* The decision: is it ready, and what will moving on do */}
          {next ? (
            <Card>
              <CardHeader>
                <CardTitle>Ready to move on?</CardTitle>
                <CardDescription>
                  Moving on can't be undone. Only registration is tied to the season stage — review,
                  brackets and scoring aren't — so nothing else will stop a premature move. This checklist is the safety net.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {readiness.length > 0 ? (
                  <div className="divide-y rounded-lg border">
                    {readiness.map((r, i) => <ReadinessRow key={i} item={r} onGo={navigate} />)}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Couldn't load the checklist — you can still move on.</p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => { setError(""); setAdvanceOpen(true); }}>
                    {NEXT_LABEL[season.status]} <ArrowRight />
                  </Button>
                  {warnings.length > 0 ? (
                    <span className="text-sm text-amber-700 dark:text-amber-400">
                      {warnings.length} thing{warnings.length === 1 ? " isn't" : "s aren't"} finished yet.
                    </span>
                  ) : readiness.length > 0 ? (
                    <span className="text-sm text-green-700 dark:text-green-400">Everything looks ready.</span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Season complete</CardTitle>
                <CardDescription>
                  This season is <span className="font-medium text-foreground">completed</span> and archived
                  {season.closedAt ? ` (closed ${fmtDate(season.closedAt)})` : ""}. Start a new one to begin the next cycle.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => { setError(""); setCreateOpen(true); }}>
                  <Plus /> Create New Season
                </Button>
              </CardContent>
            </Card>
          )}

          {season.status === "setup" && <SportSetupSummary />}

          {/* Past and present seasons */}
          {history.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Season history</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y rounded-lg border">
                  {history.map((h) => (
                    <div key={h._id} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium break-words">
                          {h.name}
                          {String(h._id) === String(season._id) && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">current</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(h.openedAt)} → {h.closedAt ? fmtDate(h.closedAt) : "ongoing"}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground sm:text-right">
                        {h.teams} team{h.teams === 1 ? "" : "s"} · {h.verifiedTeams} verified
                      </p>
                      <SeasonBadge status={h.status} className="self-start sm:self-auto" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <AdvanceDialog
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        status={season?.status}
        warnings={warnings}
        onConfirm={advance}
        busy={busy}
        error={error}
      />
      <CreateSeasonModal open={createOpen} onClose={() => setCreateOpen(false)}
        onCreate={createSeason} busy={busy} error={error} />
    </AdminLayout>
  );
}
