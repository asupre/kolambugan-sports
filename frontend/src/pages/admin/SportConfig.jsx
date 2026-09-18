import { useEffect, useState } from "react";
import { Building2, Plus, Trophy } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";

const DIVISIONS = [
  { value: "open", label: "Open", hint: "One bracket, everyone together" },
  { value: "boys", label: "Boys" },
  { value: "girls", label: "Girls" },
  { value: "under15", label: "Under 15" },
  { value: "under30", label: "Under 30" },
];

const FORMATS = [
  { value: "team", label: "Team", hint: "10–15 players", esportsHint: "6 players (5 + 1 sub)" },
  { value: "doubles", label: "Doubles", hint: "2 players" },
  { value: "singles", label: "Singles", hint: "1 player" },
];

const SCORING_MODES = [
  { value: "player", label: "Per player", hint: "Every point belongs to a player — basketball" },
  { value: "rally", label: "Rally", hint: "Player points plus a team button for opponent errors" },
  { value: "final", label: "Games won", hint: "No player scoring — the organizer records who won each game" },
];

const STAT_TYPES = [
  { value: "foul", label: "Fouls" },
  { value: "rebound", label: "Rebounds" },
  { value: "assist", label: "Assists" },
];

// Comma-separated numbers in a text box: "1, 2, 3". Simpler than a tag editor
// and these are set once at installation, not fiddled with.
const parseNums = (s) =>
  String(s).split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);

function SportCard({ sport, onSaved, onRemoved, onError }) {
  const confirm = useConfirm();
  const [divisions, setDivisions] = useState(sport.divisions?.length ? sport.divisions : ["open"]);
  const [format, setFormat] = useState(sport.entryFormat || "team");
  const [advanced, setAdvanced] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(sport.name);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  // Blank means "use the built-in default for this sport", which is how the
  // seven seeded sports keep working without being configured.
  const [rules, setRules] = useState({
    tournamentFormat: sport.tournamentFormat || "double_elimination",
    scoringMode: sport.scoringMode || "",
    pointValues: (sport.pointValues || []).join(", "),
    periodLabel: sport.periodLabel || "",
    periodOptions: (sport.periodOptions || []).join(", "),
    statTypes: sport.statTypes || [],
    onCourt: sport.onCourt ?? "",
    teamsPerBarangay: sport.teamsPerBarangay ?? "",
    numGroups: sport.numGroups ?? "",
    knockoutSize: sport.knockoutSize ?? "",
  });

  const configDirty =
    JSON.stringify([...divisions].sort()) !== JSON.stringify([...(sport.divisions || [])].sort()) ||
    format !== sport.entryFormat;

  function toggleDivision(value) {
    setSaved("");
    if (value === "open") { setDivisions(["open"]); return; }
    const next = divisions.filter((d) => d !== "open");
    setDivisions(next.includes(value) ? next.filter((d) => d !== value) : [...next, value]);
  }

  async function saveConfig() {
    setBusy(true);
    try {
      const d = await api(`/api/sports/${sport._id}/config`, {
        method: "PATCH",
        body: JSON.stringify({ divisions, entryFormat: format }),
      });
      setSaved("Saved");
      onSaved(d.sport);
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  }

  async function saveRules() {
    setBusy(true);
    try {
      const d = await api(`/api/sports/${sport._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          tournamentFormat: rules.tournamentFormat,
          scoringMode: rules.scoringMode || null,
          pointValues: parseNums(rules.pointValues),
          periodLabel: rules.periodLabel || null,
          periodOptions: parseNums(rules.periodOptions),
          statTypes: rules.statTypes,
          onCourt: rules.onCourt === "" ? null : Number(rules.onCourt),
          teamsPerBarangay: rules.teamsPerBarangay === "" ? null : Number(rules.teamsPerBarangay),
          numGroups: rules.numGroups === "" ? null : Number(rules.numGroups),
          knockoutSize: rules.knockoutSize === "" ? null : Number(rules.knockoutSize),
        }),
      });
      setSaved("Saved");
      onSaved(d.sport);
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  }

  async function rename() {
    if (!name.trim() || name.trim() === sport.name) { setRenaming(false); return; }
    setBusy(true);
    try {
      const d = await api(`/api/sports/${sport._id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      setRenaming(false);
      onSaved(d.sport);
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!(await confirm(`Remove ${sport.name}? This only works if nothing references it.`, { danger: true, confirmLabel: "Remove" }))) return;
    setBusy(true);
    try {
      await api(`/api/sports/${sport._id}`, { method: "DELETE" });
      onRemoved(sport._id);
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  }

  const set = (k) => (e) => { setRules({ ...rules, [k]: e.target.value }); setSaved(""); };

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          {renaming ? (
            <div className="flex items-center gap-2 flex-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
              <Button size="sm" onClick={rename} disabled={busy}>Save</Button>
              <button onClick={() => { setRenaming(false); setName(sport.name); }}
                className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          ) : (
            <div className="flex items-baseline gap-3">
              <h3 className="font-semibold flex items-center gap-1.5">
                <Trophy className="size-4 text-blue-500" /> {sport.name}
              </h3>
              <button onClick={() => setRenaming(true)} className="text-xs text-muted-foreground hover:text-foreground">
                Rename
              </button>
            </div>
          )}
          {saved && <span className="text-green-600 dark:text-green-400 text-xs">{saved}</span>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <Label className="mb-2">Divisions</Label>
            <div className="space-y-2">
              {DIVISIONS.map((d) => (
                <label key={d.value} className="flex items-start gap-2.5 cursor-pointer">
                  <Checkbox
                    checked={divisions.includes(d.value)}
                    onCheckedChange={() => toggleDivision(d.value)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="text-sm">{d.label}</span>
                    {d.hint && <span className="block text-muted-foreground text-xs">{d.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2">Entry format</Label>
            <RadioGroup value={format} onValueChange={(v) => { setFormat(v); setSaved(""); }}>
              {FORMATS.map((f) => (
                <label key={f.value} className="flex items-start gap-2.5 cursor-pointer">
                  <RadioGroupItem value={f.value} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="text-sm">{f.label}</span>
                    <span className="block text-muted-foreground text-xs">
                      {sport.category === "esports" && f.esportsHint ? f.esportsHint : f.hint}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={saveConfig} disabled={busy || !configDirty || divisions.length === 0}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <button onClick={() => setAdvanced(!advanced)}
            className="text-xs text-muted-foreground hover:text-foreground">
            {advanced ? "Hide" : "Show"} scoring &amp; draw rules
          </button>
          <button onClick={remove} disabled={busy}
            className="text-xs text-destructive hover:underline ml-auto">
            Remove
          </button>
        </div>

        {advanced && (
          <div className="pt-4 border-t">
            <p className="text-muted-foreground text-xs mb-4">
              Leave a field blank to use the built-in default for this sport. These are
              set once when a sport is added and rarely change after.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Draw format</Label>
                <Select value={rules.tournamentFormat} onValueChange={(v) => { setRules({ ...rules, tournamentFormat: v }); setSaved(""); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="double_elimination">Groups with double-elimination</SelectItem>
                    <SelectItem value="round_robin">Groups with round-robin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Scoring</Label>
                <Select value={rules.scoringMode || "default"} onValueChange={(v) => { setRules({ ...rules, scoringMode: v === "default" ? "" : v }); setSaved(""); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default for this sport</SelectItem>
                    {SCORING_MODES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  {SCORING_MODES.find((s) => s.value === rules.scoringMode)?.hint || " "}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Point values</Label>
                <Input value={rules.pointValues} onChange={set("pointValues")} placeholder="1, 2, 3" />
                <p className="text-muted-foreground text-xs">What one scoring tap can add.</p>
              </div>

              <div className="space-y-1.5">
                <Label>Period name</Label>
                <Input value={rules.periodLabel} onChange={set("periodLabel")} placeholder="quarter, set, game" />
              </div>

              <div className="space-y-1.5">
                <Label>Period counts allowed</Label>
                <Input value={rules.periodOptions} onChange={set("periodOptions")} placeholder="1, 3, 5" />
                <p className="text-muted-foreground text-xs">What the organizer may pick at the start.</p>
              </div>

              <div className="space-y-1.5">
                <Label>Players on court</Label>
                <Input type="number" value={rules.onCourt} onChange={set("onCourt")} placeholder="blank = whole roster" />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label>Stats recorded</Label>
                <div className="flex gap-4">
                  {STAT_TYPES.map((s) => (
                    <label key={s.value} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={rules.statTypes.includes(s.value)}
                        onCheckedChange={() => {
                          setSaved("");
                          setRules({
                            ...rules,
                            statTypes: rules.statTypes.includes(s.value)
                              ? rules.statTypes.filter((x) => x !== s.value)
                              : [...rules.statTypes, s.value],
                          });
                        }}
                      />
                      <span className="text-sm">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Teams per barangay</Label>
                <Input type="number" value={rules.teamsPerBarangay} onChange={set("teamsPerBarangay")} placeholder="1" />
              </div>

              <div className="space-y-1.5">
                <Label>Groups in the draw</Label>
                <Input type="number" value={rules.numGroups} onChange={set("numGroups")} placeholder="4, or 8 for round-robin" />
              </div>

              <div className="space-y-1.5">
                <Label>Knockout size</Label>
                <Input type="number" value={rules.knockoutSize} onChange={set("knockoutSize")} placeholder="8 or 16" />
                <p className="text-muted-foreground text-xs">
                  Must divide evenly by the number of groups.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <Button onClick={saveRules} disabled={busy}>
                {busy ? "Saving…" : "Save rules"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddSport({ onAdded, onError }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("physical");
  const [tournamentFormat, setTournamentFormat] = useState("double_elimination");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const d = await api("/api/sports", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), category, tournamentFormat }),
      });
      setName(""); setOpen(false);
      onAdded(d.sport, d.message);
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full py-3 rounded-xl border border-dashed text-muted-foreground text-sm hover:border-foreground/30 hover:text-foreground flex items-center justify-center gap-1.5">
        <Plus className="size-4" /> Add a sport
      </button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a sport</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sepak Takraw" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="physical">Physical</SelectItem>
                <SelectItem value="esports">Esports</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Draw format</Label>
            <Select value={tournamentFormat} onValueChange={setTournamentFormat}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="double_elimination">Double-elimination groups</SelectItem>
                <SelectItem value="round_robin">Round-robin groups</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-muted-foreground text-xs mt-3">
          Set its divisions, scoring and draw rules after adding. A new sport also needs
          an organizer account — use Provision all on the Accounts page.
        </p>
        <div className="flex gap-2 mt-4">
          <Button onClick={add} disabled={busy || !name.trim()}>
            {busy ? "Adding…" : "Add sport"}
          </Button>
          <Button variant="secondary" onClick={() => { setOpen(false); setName(""); }}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Barangays and their cross-barangay permission in one place — both are facts
// about a barangay, and splitting them across two cards made no sense.
function BarangayCard({ onError, onNotice }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  async function load() {
    try {
      const d = await api("/api/barangays");
      setRows(d.barangays || []);
    } catch (e) { onError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function toggleCross(b) {
    setBusyId(b._id);
    try {
      const d = await api(`/api/barangays/${b._id}/cross`, {
        method: "PATCH",
        body: JSON.stringify({ allowsCrossBarangay: !b.allowsCrossBarangay }),
      });
      setRows((prev) => prev.map((x) => (x._id === b._id ? { ...x, allowsCrossBarangay: d.barangay.allowsCrossBarangay } : x)));
      // Changing this can flip player eligibility in either direction without
      // touching any player — surface it when it actually did something,
      // so it's not a silent change the Review Queue quietly disagrees with.
      if (onNotice && /re-screened/.test(d.message || "")) onNotice(d.message);
    } catch (e) { onError(e.message); }
    finally { setBusyId(null); }
  }

  async function rename(b) {
    if (!draft.trim() || draft.trim() === b.name) { setEditingId(null); return; }
    setBusyId(b._id);
    try {
      const d = await api(`/api/barangays/${b._id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: draft.trim() }),
      });
      setRows((prev) => prev.map((x) => (x._id === b._id ? { ...x, name: d.barangay.name } : x)));
      setEditingId(null);
    } catch (e) { onError(e.message); }
    finally { setBusyId(null); }
  }

  async function remove(b) {
    if (!(await confirm(`Remove ${b.name}? This only works if nothing references it.`, { danger: true, confirmLabel: "Remove" }))) return;
    setBusyId(b._id);
    try {
      await api(`/api/barangays/${b._id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((x) => x._id !== b._id));
    } catch (e) { onError(e.message); }
    finally { setBusyId(null); }
  }

  async function add() {
    setBusyId("new");
    try {
      const d = await api("/api/barangays", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() }),
      });
      setRows((prev) => [...prev, d.barangay].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName(""); setAdding(false);
    } catch (e) { onError(e.message); }
    finally { setBusyId(null); }
  }

  const allowed = rows.filter((b) => b.allowsCrossBarangay).length;

  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4 text-amber-500" /> Barangays
        </CardTitle>
        <CardDescription>
          {rows.length} barangays · {allowed} allow cross-barangay play. A checked
          barangay's residents may play for another barangay's team without being
          flagged during verification — intended for barangays that can't field a
          full roster alone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="rounded-lg border divide-y">
              {rows.map((b) => (
                <div key={b._id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    checked={!!b.allowsCrossBarangay}
                    disabled={busyId === b._id}
                    onCheckedChange={() => toggleCross(b)}
                    title="Allows cross-barangay"
                  />

                  {editingId === b._id ? (
                    <>
                      <Input value={draft} onChange={(e) => setDraft(e.target.value)}
                        className="flex-1 h-7" autoFocus />
                      <Button size="sm" onClick={() => rename(b)} disabled={busyId === b._id}>Save</Button>
                      <button onClick={() => setEditingId(null)}
                        className="text-xs text-muted-foreground">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm truncate">{b.name}</span>
                      {b.hasLogo && <span className="text-muted-foreground text-xs shrink-0">logo</span>}
                      <button onClick={() => { setEditingId(b._id); setDraft(b.name); }}
                        className="text-xs text-muted-foreground hover:text-foreground shrink-0">Rename</button>
                      <button onClick={() => remove(b)} disabled={busyId === b._id}
                        className="text-xs text-destructive hover:underline shrink-0">Remove</button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {adding ? (
              <div className="flex items-center gap-2 mt-3">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Barangay name" className="max-w-xs" autoFocus />
                <Button onClick={add} disabled={busyId === "new" || !newName.trim()}>Add</Button>
                <button onClick={() => { setAdding(false); setNewName(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)}
                className="mt-3 text-sm text-primary hover:underline">+ Add a barangay</button>
            )}

            <p className="text-muted-foreground text-xs mt-3">
              A new barangay needs an admin account — use Provision all on the Accounts page.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SportConfig() {
  const showError = useErrorDialog();
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const d = await api("/api/sports");
      setSports(d.sports || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout title="League Setup" menu={superAdminMenu} enableDarkMode>
      <div className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert className="border-green-500/30 bg-green-500/5">
            <AlertDescription className="text-green-700 dark:text-green-400">{notice}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>How the league is set up</CardTitle>
            <CardDescription>
              Divisions decide how many tournaments a sport runs; the entry format decides
              how many players a barangay registers. Set these{" "}
              <span className="font-medium text-foreground">before registration opens</span> — once teams
              sign up, changing them would invalidate rosters built against the old
              settings.
            </CardDescription>
          </CardHeader>
        </Card>

        <BarangayCard onError={showError} onNotice={setNotice} />

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : (
          <>
            {sports.map((s) => (
              <SportCard
                key={s._id}
                sport={s}
                onSaved={(updated) => {
                  setSports((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
                }}
                onRemoved={(id) => {
                  setSports((prev) => prev.filter((x) => x._id !== id));
                }}
                onError={showError}
              />
            ))}
            <AddSport
              onAdded={(sport, message) => {
                setNotice(message);
                setSports((prev) => [...prev, sport].sort((a, b) => a.name.localeCompare(b.name)));
              }}
              onError={showError}
            />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
