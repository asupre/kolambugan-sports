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

// "1, 2, 3" typed into a box -> [1, 2, 3]. (Blank -> [], which the server reads as "use the default".)
const parseNums = (s) =>
  String(s).split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);
const rulesToForm = (r = {}) => ({
  pointValues: (r.pointValues || []).join(", "),
  periodLabel: r.periodLabel || "",
  periodOptions: (r.periodOptions || []).join(", "),
});

// Every sport has a TYPE. It decides how the game is scored live and which score sheet columns
// are on offer. (Stored as Sport.category; "physical" is the value for a sport.)
const TYPES = [
  { value: "physical", label: "Sport" },
  { value: "esports", label: "Esports" },
  { value: "board", label: "Board game" },
];

// The rules that apply to each TYPE, in plain words — a reference card, not settings.
function RulesByType() {
  const blocks = [
    ["Sports", "Basketball, volleyball, badminton, pickleball, billiards…",
      "Scored by team while the game runs (basketball +1 / +2 / +3, the others +1), in quarters or sets — the higher total wins. Nothing is credited to a player live. After the match the organizer fills in the score sheet for each player."],
    ["Esports", "Mobile Legends, Call of Duty Mobile…",
      "Played as a best-of series; the organizer taps who won each game. After the match the score sheet asks for the role each player played (Carry, Support…) and, if you tick them, kills, deaths and assists."],
    ["Board games", "Chess…",
      "One player per side, played as a best-of series; the organizer taps who won each game. There is no player form unless you tick a column on its score sheet."],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rules by type</CardTitle>
        <CardDescription>
          How each type of game is scored. Set a game's type on its card below; you choose what its
          after-match score sheet asks for there too.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {blocks.map(([title, examples, text]) => (
          <div key={title} className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mb-2 text-[11px] text-muted-foreground">{examples}</p>
            <p className="text-xs">{text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// A plain-language summary of how one sport is scored — shown for EVERY sport, including the
// ones with nothing to edit, so the rules can be read in one place. Comes from the server's
// effective rules (built-in defaults plus anything saved for the sport).
function RulesSummary({ sport }) {
  const r = sport.rules;
  if (!r) return null;
  const list = (a) => a.join(", ");
  const word = r.periodLabel || "period";

  const rows = [
    ["Live scoring",
      r.scoringMode === "final"
        ? "The organizer taps which team won each game; the team with more games won takes the match."
        : `By team — the organizer taps ${r.pointValues.map((v) => `+${v}`).join(" / ")} for the team that scored. Nothing is credited to a player while the game runs.`],
    r.scoringMode === "final" ? null : ["Periods", `Played in ${word}s — the organizer picks ${list(r.periodOptions)} at the start. The higher total score wins; a tie adds a deciding ${word}.`],
    ["After the match",
      r.sheet?.length
        ? `Score sheet: ${list(r.sheet.map((k) => (r.statLabels?.[k]?.label || k).toLowerCase()))}${r.roles?.length ? ` (roles: ${list(r.roles)})` : ""}, plus the MVP.`
        : "No player form — the result is the record."],
  ].filter(Boolean);

  return (
    <dl className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-2">
          <dt className="font-medium text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SportCard({ sport, onSaved, onRemoved, onError }) {
  const confirm = useConfirm();
  const [divisions, setDivisions] = useState(sport.divisions?.length ? sport.divisions : ["open"]);
  const [format, setFormat] = useState(sport.entryFormat || "team");
  const [advanced, setAdvanced] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(sport.name);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  // The after-match score sheet: which columns the organizer fills in per player.
  const currentSheet = sport.rules?.sheet || [];
  const [sheet, setSheet] = useState(currentSheet);
  useEffect(() => { setSheet(sport.rules?.sheet || []); }, [currentSheet.join(","), sport.category]);
  const sheetDirty = [...sheet].sort().join(",") !== [...currentSheet].sort().join(",");
  const sheetOptions = sport.sheetOptions || [];
  const customLabels = sheetOptions.filter((o) => o.custom).map((o) => o.label);
  const [newCol, setNewCol] = useState("");

  // Scoring rules (sports that score by points). Starts from what is IN EFFECT now — the built-in
  // values for a seeded sport — so nothing looks blank; saving stores them explicitly.
  const gamesWon = sport.rules?.scoringMode === "final";
  const effForm = rulesToForm(sport.rules);
  const [rulesForm, setRulesForm] = useState(effForm);
  useEffect(() => { setRulesForm(rulesToForm(sport.rules)); }, [JSON.stringify(effForm)]);
  const rulesDirty = JSON.stringify(rulesForm) !== JSON.stringify(effForm);
  const hasSavedRules = !!(sport.pointValues?.length || sport.periodLabel || sport.periodOptions?.length);
  const setRule = (k) => (e) => { setSaved(""); setRulesForm({ ...rulesForm, [k]: e.target.value }); };

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

  async function patchSport(body) {
    setBusy(true);
    try {
      const d = await api(`/api/sports/${sport._id}`, { method: "PATCH", body: JSON.stringify(body) });
      setSaved("Saved");
      onSaved(d.sport);
      return true;
    } catch (e) { onError(e.message); return false; }
    finally { setBusy(false); }
  }
  const saveRules = () => patchSport({
    pointValues: parseNums(rulesForm.pointValues),
    periodLabel: rulesForm.periodLabel,
    periodOptions: parseNums(rulesForm.periodOptions),
  });
  const resetRules = () => patchSport({ pointValues: [], periodLabel: "", periodOptions: [] });
  // Your own score sheet columns (e.g. "Spikes"). The server ticks a new one for you.
  const addColumn = async () => {
    const label = newCol.trim();
    if (!label) return;
    if (await patchSport({ customStats: [...customLabels, label] })) setNewCol("");
  };
  const removeColumn = (label) => patchSport({ customStats: customLabels.filter((l) => l !== label) });
  const saveSheet = () => patchSport({ scoreSheet: sheet });
  const resetSheet = () => patchSport({ scoreSheet: null });   // back to the built-in default
  const changeType = (category) => patchSport({ category });

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

        <div className="grid grid-cols-1 gap-6 border-t pt-4 sm:grid-cols-[14rem_1fr]">
          <div>
            <Label className="mb-2">Type</Label>
            <Select value={sport.category} onValueChange={changeType} disabled={busy}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Decides how it is scored and which score sheet columns are on offer.
            </p>
          </div>

          <div>
            <Label className="mb-1">After-match score sheet</Label>
            <p className="mb-2.5 text-xs text-muted-foreground">
              What the organizer fills in for each player once a match is finished. Tick the columns
              you want; tick none for no player form.
            </p>
            <div className="flex flex-wrap gap-2">
              {sheetOptions.map((o) => {
                const on = sheet.includes(o.key);
                return (
                  <label key={o.key}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition ${on ? "border-primary bg-primary/10" : "hover:bg-accent"}`}>
                    <Checkbox checked={on}
                      onCheckedChange={() => { setSaved(""); setSheet(on ? sheet.filter((k) => k !== o.key) : [...sheet, o.key]); }} />
                    {o.label}
                    {o.custom && (
                      <button type="button" title="Remove this column" disabled={busy}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeColumn(o.label); }}
                        className="-mr-0.5 text-base leading-none text-muted-foreground hover:text-destructive">×</button>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Input value={newCol} maxLength={24} className="h-8 max-w-xs"
                onChange={(e) => setNewCol(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColumn(); } }}
                placeholder='Add your own, e.g. "Spikes"' />
              <Button size="sm" variant="secondary" onClick={addColumn} disabled={busy || !newCol.trim()}>Add column</Button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" onClick={saveSheet} disabled={busy || !sheetDirty}>Save score sheet</Button>
              {!sport.sheetIsDefault && (
                <button onClick={resetSheet} disabled={busy}
                  className="text-xs text-muted-foreground hover:text-foreground">Use the default</button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <Label className="mb-1">Scoring rules</Label>
          {gamesWon ? (
            <p className="text-xs text-muted-foreground">
              Scored by games won: the organizer taps who won each game, as a best-of series. There
              are no points or periods to set for this game.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                How the live score works: the organizer taps these point values for the team that
                scored, in as many periods as they choose at the start.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Point values</Label>
                  <Input value={rulesForm.pointValues} onChange={setRule("pointValues")} placeholder="1, 2, 3" />
                  <p className="text-xs text-muted-foreground">One tap button for each. Basketball: 1, 2, 3.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Period name</Label>
                  <Input value={rulesForm.periodLabel} onChange={setRule("periodLabel")} placeholder="quarter, set, half" />
                  <p className="text-xs text-muted-foreground">What one period is called.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Period counts allowed</Label>
                  <Input value={rulesForm.periodOptions} onChange={setRule("periodOptions")} placeholder="1, 3, 5" />
                  <p className="text-xs text-muted-foreground">Choose from 1, 2, 3, 4, 5 or 7.</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button size="sm" onClick={saveRules} disabled={busy || !rulesDirty}>Save scoring rules</Button>
                {hasSavedRules && (
                  <button onClick={resetRules} disabled={busy}
                    className="text-xs text-muted-foreground hover:text-foreground">Use the defaults</button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={saveConfig} disabled={busy || !configDirty || divisions.length === 0}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <button onClick={() => setAdvanced(!advanced)}
            className="text-xs text-muted-foreground hover:text-foreground">
            {advanced ? "Hide" : "Show"} scoring rules
          </button>
          <button onClick={remove} disabled={busy}
            className="text-xs text-destructive hover:underline ml-auto">
            Remove
          </button>
        </div>

        {advanced && (
          <div className="pt-4 border-t">
            <RulesSummary sport={sport} />
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
  // Scoring rules for a new sport that scores by points. Sensible starting values so it works at once.
  const [rules, setRules] = useState({ pointValues: "1", periodLabel: "", periodOptions: "1, 3, 5" });
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const d = await api("/api/sports", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(), category, tournamentFormat,
          // Only a sport scores by points; an esport or board game records games won.
          ...(category === "physical" ? {
            pointValues: parseNums(rules.pointValues),
            periodLabel: rules.periodLabel,
            periodOptions: parseNums(rules.periodOptions),
          } : {}),
        }),
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
            <Label>Type</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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
        {category === "physical" ? (
          <div className="mt-4 border-t pt-4">
            <Label className="mb-1">Scoring rules</Label>
            <p className="mb-3 text-xs text-muted-foreground">
              How the live score works: the organizer taps these point values for the team that scored.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Point values</Label>
                <Input value={rules.pointValues} onChange={(e) => setRules({ ...rules, pointValues: e.target.value })} placeholder="1, 2, 3" />
              </div>
              <div className="space-y-1.5">
                <Label>Period name</Label>
                <Input value={rules.periodLabel} onChange={(e) => setRules({ ...rules, periodLabel: e.target.value })} placeholder="quarter, set, half" />
              </div>
              <div className="space-y-1.5">
                <Label>Period counts allowed</Label>
                <Input value={rules.periodOptions} onChange={(e) => setRules({ ...rules, periodOptions: e.target.value })} placeholder="1, 3, 5" />
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Scored by games won — the organizer taps who won each game. Nothing to set.
          </p>
        )}
        <p className="text-muted-foreground text-xs mt-3">
          Set its divisions, entry format and score sheet after adding. A new sport also needs
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
          barangay's teams may field players from ANY barangay (checked or not) —
          intended for barangays too small to field a full roster alone. An
          unchecked barangay's teams may only field its own residents.
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

        <RulesByType />

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
