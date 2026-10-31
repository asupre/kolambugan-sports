import { useEffect, useState } from "react";
import { Trash2, UserPlus, Users } from "lucide-react";
import { api } from "../../api";
import { useConfirm } from "../../components/ConfirmDialog";
import { useErrorDialog } from "../../components/ErrorDialog";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";

// League Setup → Demo data (Oct 2026). Registering every barangay by hand took hours in the
// mock defense, so two buttons fill the league instead: (1) a team for every barangay in
// every game and division set up here, (2) players on those teams, taken from the uploaded
// reference list (16-30, or 15 and under for Under 15) where it can, verified at once.
// Everything generated is tagged as demo, so "Remove demo data" never touches real teams.
export default function DemoDataCard() {
  const confirm = useConfirm();
  const showError = useErrorDialog();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => api("/api/demo").then(setStatus).catch((e) => showError(e.message));
  useEffect(() => { load(); }, []);

  async function run(key, method, path, question, opts) {
    if (!(await confirm(question, opts))) return;
    setBusy(key); setMsg("");
    try {
      const r = await api(path, { method });
      setMsg(r.message);
      await load();
    } catch (e) { showError(e.message); }
    finally { setBusy(""); }
  }

  if (!status) return <Skeleton className="h-64 w-full rounded-xl" />;
  const off = !!busy || !status.canGenerate;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demo data</CardTitle>
        <CardDescription>
          Fill the league in two clicks for a demo or a test run, instead of every barangay registering by hand.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            Players are taken from this season's reference list (ages 16 to 30; Under 15 teams get its residents aged 15 and under, marked approved), from the
            team's own barangay first. A barangay that allows cross-barangay players then takes residents nobody
            else used. No made-up players: a team the list can't fill is left empty.
            Everything created here is marked as demo,
            so <span className="font-medium">Remove demo data</span> deletes only it, never a real registration.
            {!status.canGenerate && " Generating is only possible before the season is Ongoing."}
            {status.canGenerate && !status.canCreateTeams && " Teams can only be created while registration is open."}
          </AlertDescription>
        </Alert>

        <p className="text-sm text-muted-foreground">
          Now: <span className="font-medium text-foreground">{status.demoTeams}</span> demo teams
          {status.emptyDemoTeams > 0 && <> ({status.emptyDemoTeams} without players)</>},{" "}
          <span className="font-medium text-foreground">{status.demoPlayers}</span> demo players.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-4 space-y-2">
            <p className="font-medium text-sm">1. Create the teams</p>
            <p className="text-xs text-muted-foreground">
              A team for every barangay in every game and division set up in League Setup. A barangay that
              already registered for a slot is skipped. Only while registration is open.
            </p>
            <Button className="w-full" disabled={off || !status.canCreateTeams}
              onClick={() => run("teams", "POST", "/api/demo/teams",
                "Create a demo team for every barangay in every game and division?", { confirmLabel: "Create teams" })}>
              <Users /> {busy === "teams" ? "Creating…" : "Create the teams"}
            </Button>
          </div>
          <div className="rounded-xl border p-4 space-y-2">
            <p className="font-medium text-sm">2. Fill the rosters</p>
            <p className="text-xs text-muted-foreground">
              Players for every demo team with no players yet (12 per team, 6 for esports, 2 for doubles, 1 for
              singles): residents from the reference list aged 16 to 30 (15 and under for Under 15). The teams are verified. Upload the
              reference list first.
            </p>
            <Button className="w-full" disabled={off || status.emptyDemoTeams === 0}
              onClick={() => run("rosters", "POST", "/api/demo/rosters",
                `Fill ${status.emptyDemoTeams} demo team${status.emptyDemoTeams === 1 ? "" : "s"} with players from the reference list and verify them?`,
                { confirmLabel: "Fill rosters" })}>
              <UserPlus /> {busy === "rosters" ? "Filling…" : "Fill the rosters"}
            </Button>
          </div>
        </div>

        {msg && <p className="text-sm bg-muted rounded px-3 py-2">{msg}</p>}

        <div className="border-t pt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground max-w-xl">
            Deletes every demo team and player, plus any tournament that has a demo team in it (its matches and
            player stats too, even for real teams in that tournament). Can't be undone.
          </p>
          <Button variant="outline" disabled={!!busy || (status.demoTeams === 0 && status.demoPlayers === 0)}
            className="text-red-600 border-red-500/30 hover:bg-red-500/10 dark:text-red-400"
            onClick={() => run("remove", "DELETE", "/api/demo",
              "Remove ALL demo data? Demo teams, demo players and every tournament that includes a demo team (with its matches and stats) are deleted. This can't be undone.",
              { danger: true, confirmLabel: "Remove demo data" })}>
            <Trash2 /> {busy === "remove" ? "Removing…" : "Remove demo data"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
