import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, ListTodo, Plus, Settings2 } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
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

const STAGES = [
  { key: "setup", label: "Setup", next: "Open Registration" },
  { key: "registration_open", label: "Registration Open", next: "Move to Verification" },
  { key: "verification", label: "Verification", next: "Start Season" },
  { key: "ongoing", label: "Ongoing", next: "Close & Archive Season" },
  { key: "completed", label: "Completed", next: null },
];

const DIVISION_LABEL = { open: "Open", boys: "Boys", girls: "Girls", under17: "U17", under30: "U30" };
const FORMAT_LABEL = { team: "Team", doubles: "Doubles", singles: "Singles" };

function StageTimeline({ current }) {
  const currentIndex = STAGES.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {STAGES.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <Badge className={
              active ? "bg-primary text-primary-foreground"
              : done ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground"
            }>
              {s.label}
            </Badge>
            {i < STAGES.length - 1 && <ArrowRight className="size-3.5 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
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
    <Card className="border-l-4 border-l-amber-500">
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
              <div key={s._id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="font-medium w-32 shrink-0 truncate">{s.name}</span>
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
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api("/api/seasons/current");
      setSeason(data.season);
    } catch {
      setSeason(null);
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
      const data = await api("/api/seasons", { method: "POST", body: JSON.stringify({ name }) });
      setSeason(data.season);
      setModalOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!season) return;
    // Opening registration freezes sport configuration, so make it a deliberate
    // step rather than something you discover afterwards.
    if (season.status === "setup") {
      const ok = window.confirm(
        "Opening registration locks each sport's divisions and entry format — " +
        "barangays will build rosters against them. Are they set up correctly?"
      );
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/seasons/${season._id}/advance`, { method: "POST" });
      setSeason(data.season);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const currentStage = season ? STAGES.find((s) => s.key === season.status) : null;

  return (
    <AdminLayout title="Season" menu={superAdminMenu} enableDarkMode>
      {loading ? (
        <div className="max-w-2xl space-y-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : !season ? (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No active season</CardTitle>
            <CardDescription>Create a season to begin the cycle.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => { setError(""); setModalOpen(true); }}>
              <Plus /> Create Season
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 max-w-2xl">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="space-y-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <p className="text-muted-foreground text-sm flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" /> Current season
                  </p>
                  <h2 className="text-xl font-semibold">{season.name}</h2>
                </div>
                <Badge className="bg-primary/15 text-primary">
                  {currentStage?.label || season.status}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-2 flex items-center gap-1.5">
                  <ListTodo className="size-3.5" /> Lifecycle
                </p>
                <StageTimeline current={season.status} />
              </div>
            </CardContent>
          </Card>

          {season.status === "setup" && <SportSetupSummary />}

          <Card>
            <CardHeader>
              <CardTitle>Advance the season</CardTitle>
            </CardHeader>
            <CardContent>
              {currentStage?.next ? (
                <>
                  <p className="text-muted-foreground text-sm mb-4">
                    Next step: <span className="font-medium text-foreground">{currentStage.next}</span>.
                    This cannot be undone.
                  </p>
                  {error && <p className="text-destructive text-sm mb-3">{error}</p>}
                  <Button onClick={advance} disabled={busy}>
                    {busy ? "Working…" : currentStage.next}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm mb-4">
                    This season is <span className="font-medium text-foreground">completed</span> and archived. Start a
                    new one to begin the next cycle.
                  </p>
                  <Button onClick={() => { setError(""); setModalOpen(true); }}>
                    <Plus /> Create New Season
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <CreateSeasonModal open={modalOpen} onClose={() => setModalOpen(false)}
        onCreate={createSeason} busy={busy} error={error} />
    </AdminLayout>
  );
}
