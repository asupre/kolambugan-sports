import { useEffect, useState } from "react";
import { Building2, Check, Info, Pencil, Plus, Search, Trash2, Trophy, X } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import InfoHint from "../../components/InfoHint";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";

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
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

// A small toggle button used for divisions and score sheet columns. Reads as "on" at a glance
// (tint + tick) without the visual weight of a checkbox list.
function Chip({ on, onClick, children, title, disabled, className }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition disabled:opacity-50",
        on ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className
      )}>
      <span className={cn("flex size-3.5 items-center justify-center rounded-[4px] border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
        {on && <Check className="size-3" strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

// A titled block inside the game editor.
function Section({ title, hint, children }) {
  return (
    <section>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// The rules that apply to each TYPE, in plain words — a reference card, not settings.
function RulesByType() {
  const blocks = [
    ["Sports", "Basketball, volleyball, badminton, pickleball…",
      "Scored by team while the game runs (basketball +1 / +2 / +3, the others +1), in quarters or sets — the higher total wins. Nothing is credited to a player live. After the match the organizer fills in the score sheet for each player."],
    ["Esports", "Mobile Legends, Call of Duty Mobile…",
      "Round-robin groups, then a Top 8 or Top 16 knockout you pick under Registration (Top 8 = 1 team per barangay, Top 16 = up to 2). Played as a best-of series; the organizer taps who won each game. After the match the score sheet asks for the role each player played (Carry, Support…) and, if you tick them, kills, deaths and assists."],
    ["Board games", "Chess…",
      "One player per side, played as a best-of series; the organizer taps who won each game. There is no player form unless you tick a column on its score sheet."],
  ];
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {blocks.map(([title, examples, text]) => (
        <div key={title} className="rounded-lg border bg-muted/30 p-3">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mb-2 text-[11px] text-muted-foreground">{examples}</p>
          <p className="text-xs">{text}</p>
        </div>
      ))}
    </div>
  );
}

// One game's editor. Everything you change here (divisions, entry format, scoring rules, score
// sheet ticks) is saved together with ONE button; the type and your own score sheet columns apply
// immediately because they change what the rest of the form offers.
function SportEditor({ sport, onSaved, onRemoved, onError }) {
  const confirm = useConfirm();
  const savedDivisions = sport.divisions?.length ? sport.divisions : ["open"];
  const [divisions, setDivisions] = useState(savedDivisions);
  const [format, setFormat] = useState(sport.entryFormat || "team");
  // Every esport (and any round-robin game) picks its knockout here, BEFORE registration:
  // it decides how many teams each barangay may enter (Top 8 = 1, Top 16 = 2). The server
  // sends knockoutSize only for those games (null for double-elimination).
  const isRoundRobin = sport.knockoutSize != null;
  const savedKo = sport.knockoutSize || 16;
  const [koSize, setKoSize] = useState(savedKo);
  useEffect(() => { setKoSize(sport.knockoutSize || 16); }, [sport.knockoutSize]);
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
  const rulesDirty = !gamesWon && JSON.stringify(rulesForm) !== JSON.stringify(effForm);
  const hasSavedRules = !!(sport.pointValues?.length || sport.periodLabel || sport.periodOptions?.length);

  const configDirty =
    JSON.stringify([...divisions].sort()) !== JSON.stringify([...savedDivisions].sort()) ||
    format !== sport.entryFormat ||
    (isRoundRobin && koSize !== savedKo);
  const dirty = configDirty || sheetDirty || rulesDirty;

  const touch = () => setSaved("");
  function toggleDivision(value) {
    touch();
    if (value === "open") { setDivisions(["open"]); return; }
    const next = divisions.filter((d) => d !== "open");
    setDivisions(next.includes(value) ? next.filter((d) => d !== value) : [...next, value]);
  }
  const setRule = (k) => (e) => { touch(); setRulesForm({ ...rulesForm, [k]: e.target.value }); };

  function discard() {
    setDivisions(savedDivisions);
    setFormat(sport.entryFormat || "team");
    setKoSize(savedKo);
    setSheet(currentSheet);
    setRulesForm(effForm);
    setSaved("");
  }

  // Save everything that changed. Divisions / entry format go first: the server refuses them once
  // teams have registered, and if that fails nothing else should be saved half-way.
  async function saveAll() {
    setBusy(true);
    try {
      let updated = sport;
      if (configDirty) {
        const d = await api(`/api/sports/${sport._id}/config`, {
          method: "PATCH",
          body: JSON.stringify({ divisions, entryFormat: format, ...(isRoundRobin ? { knockoutSize: koSize } : {}) }),
        });
        updated = d.sport;
      }
      const body = {};
      if (sheetDirty) body.scoreSheet = sheet;
      if (rulesDirty) {
        body.pointValues = parseNums(rulesForm.pointValues);
        body.periodLabel = rulesForm.periodLabel;
        body.periodOptions = parseNums(rulesForm.periodOptions);
      }
      if (Object.keys(body).length) {
        const d = await api(`/api/sports/${sport._id}`, { method: "PATCH", body: JSON.stringify(body) });
        updated = d.sport;
      }
      setSaved("Saved");
      onSaved(updated);
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  }

  // Immediate changes: they return the sport with what the form should now offer.
  async function patchSport(body) {
    setBusy(true);
    try {
      const d = await api(`/api/sports/${sport._id}`, { method: "PATCH", body: JSON.stringify(body) });
      onSaved(d.sport);
      return true;
    } catch (e) { onError(e.message); return false; }
    finally { setBusy(false); }
  }
  const changeType = (category) => patchSport({ category });
  const resetRules = () => patchSport({ pointValues: [], periodLabel: "", periodOptions: [] });
  const resetSheet = () => patchSport({ scoreSheet: null });   // back to the built-in default
  // Your own score sheet columns (e.g. "Spikes"); the server ticks a new one for you. Any tick
  // changes you haven't saved yet go first, because the server rebuilds the sheet from what is saved.
  const addColumn = async () => {
    const label = newCol.trim();
    if (!label) return;
    if (sheetDirty && !(await patchSport({ scoreSheet: sheet }))) return;
    if (await patchSport({ customStats: [...customLabels, label] })) setNewCol("");
  };
  const removeColumn = async (label) => {
    if (sheetDirty && !(await patchSport({ scoreSheet: sheet }))) return;
    patchSport({ customStats: customLabels.filter((l) => l !== label) });
  };

  async function rename() {
    if (!name.trim() || name.trim() === sport.name) { setRenaming(false); return; }
    setBusy(true);
    try {
      const d = await api(`/api/sports/${sport._id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim() }) });
      setRenaming(false);
      onSaved(d.sport);
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  }

  // A sport with nothing attached is removed after a plain confirm. One with teams,
  // tournaments or an organizer (in ANY season) opens the "delete with its history" dialog.
  const [history, setHistory] = useState(null);
  async function remove() {
    setBusy(true);
    let h;
    try { h = await api(`/api/sports/${sport._id}/history`); }
    catch (e) { onError(e.message); setBusy(false); return; }
    setBusy(false);
    if (h.teams || h.tournaments || h.organizers.length) { setHistory(h); return; }
    if (!(await confirm(`Remove ${sport.name}?`, { danger: true, confirmLabel: "Remove" }))) return;
    setBusy(true);
    try {
      await api(`/api/sports/${sport._id}`, { method: "DELETE" });
      onRemoved(sport._id);
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="space-y-6">
        {/* Header: name, type, rename / remove */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {renaming ? (
            <div className="flex flex-1 items-center gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs"
                onKeyDown={(e) => { if (e.key === "Enter") rename(); }} autoFocus />
              <Button size="sm" onClick={rename} disabled={busy}>Save</Button>
              <button onClick={() => { setRenaming(false); setName(sport.name); }}
                className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <Trophy className="size-5 text-blue-500" />
              <h3 className="text-lg font-semibold leading-none">{sport.name}</h3>
              <Badge variant="secondary">{TYPE_LABEL[sport.category] || sport.category}</Badge>
              <button onClick={() => setRenaming(true)} title="Rename"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                <Pencil className="size-3.5" />
              </button>
            </div>
          )}
          <button onClick={remove} disabled={busy}
            className="inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50">
            <Trash2 className="size-3.5" /> Remove game
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
          {/* Registration */}
          <Section title="Registration" hint="Set before registration opens — teams are built against these.">
            <Label className="mb-2">Divisions</Label>
            <div className="flex flex-wrap gap-2">
              {DIVISIONS.map((d) => (
                <Chip key={d.value} on={divisions.includes(d.value)} title={d.hint}
                  onClick={() => toggleDivision(d.value)}>{d.label}</Chip>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Each division runs its own bracket. “Open” is one bracket for everyone.</p>

            <Label className="mb-2 mt-5">Entry format</Label>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map((f) => (
                <button key={f.value} type="button" aria-pressed={format === f.value}
                  onClick={() => { touch(); setFormat(f.value); }}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition",
                    format === f.value ? "border-primary bg-primary/10" : "hover:bg-accent"
                  )}>
                  <span className="block text-sm font-medium">{f.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {sport.category === "esports" && f.esportsHint ? f.esportsHint : f.hint}
                  </span>
                </button>
              ))}
            </div>

            {isRoundRobin && (
              <>
                <Label className="mb-2 mt-5">Knockout size</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { n: 8, hint: "1 team per barangay" },
                    { n: 16, hint: "Up to 2 teams per barangay" },
                  ].map(({ n, hint }) => (
                    <button key={n} type="button" aria-pressed={koSize === n}
                      onClick={() => { touch(); setKoSize(n); }}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left transition",
                        koSize === n ? "border-primary bg-primary/10" : "hover:bg-accent"
                      )}>
                      <span className="block text-sm font-medium">Top {n}</span>
                      <span className="block text-[11px] text-muted-foreground">{hint}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  8 groups play round-robin, then the Top {koSize} go to the knockout. Barangay Admins see
                  this limit when they register. Can't switch to Top 8 while a barangay has two teams.
                </p>
              </>
            )}
          </Section>

          {/* Scoring */}
          <Section title="Scoring" hint="How the live score works.">
            <Label className="mb-2">Type</Label>
            <Select value={sport.category} onValueChange={changeType} disabled={busy}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Decides how it is scored and which score sheet columns are on offer. Applies right away.
            </p>

            {gamesWon ? (
              <p className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                Scored by <span className="font-medium text-foreground">games won</span>: the organizer taps who won
                each game, as a best-of series. There are no points or periods to set for this game.
              </p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Point values</Label>
                    <Input value={rulesForm.pointValues} onChange={setRule("pointValues")} placeholder="1, 2, 3" />
                    <p className="text-[11px] text-muted-foreground">One tap button each</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Period name</Label>
                    <Input value={rulesForm.periodLabel} onChange={setRule("periodLabel")} placeholder="quarter, set" />
                    <p className="text-[11px] text-muted-foreground">What one period is called</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Period counts</Label>
                    <Input value={rulesForm.periodOptions} onChange={setRule("periodOptions")} placeholder="1, 3, 5" />
                    <p className="text-[11px] text-muted-foreground">From 1, 2, 3, 4, 5 or 7</p>
                  </div>
                </div>
                {hasSavedRules && (
                  <button onClick={resetRules} disabled={busy}
                    className="mt-2 text-xs text-muted-foreground hover:text-foreground">Use the default scoring rules</button>
                )}
              </>
            )}
          </Section>
        </div>

        {/* Score sheet */}
        <Section title="After-match score sheet"
          hint="What the organizer fills in for each player once a match is finished. Tick the columns you want; tick none for no player form.">
          <div className="flex flex-wrap gap-2">
            {sheetOptions.map((o) => (
              <Chip key={o.key} on={sheet.includes(o.key)}
                onClick={() => { touch(); setSheet(sheet.includes(o.key) ? sheet.filter((k) => k !== o.key) : [...sheet, o.key]); }}>
                {o.label}
                {o.custom && (
                  <span role="button" tabIndex={0} title="Remove this column"
                    onClick={(e) => { e.stopPropagation(); removeColumn(o.label); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); removeColumn(o.label); } }}
                    className="-mr-1 rounded p-0.5 hover:bg-destructive/10 hover:text-destructive">
                    <X className="size-3" />
                  </span>
                )}
              </Chip>
            ))}
            {sheetOptions.length === 0 && <p className="text-xs text-muted-foreground">This type has no built-in columns — add your own below.</p>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input value={newCol} maxLength={24} className="h-8 w-full sm:w-64"
              onChange={(e) => setNewCol(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColumn(); } }}
              placeholder='Add your own, e.g. "Spikes"' />
            <Button size="sm" variant="secondary" onClick={addColumn} disabled={busy || !newCol.trim()}>
              <Plus className="size-3.5" /> Add column
            </Button>
            {!sport.sheetIsDefault && (
              <button onClick={resetSheet} disabled={busy}
                className="text-xs text-muted-foreground hover:text-foreground">Use the default columns</button>
            )}
          </div>
        </Section>

        {/* One save for the whole game */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className={cn("text-xs", dirty ? "text-amber-600 dark:text-amber-400" : saved ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
            {dirty ? "You have unsaved changes." : saved ? "All changes saved." : "No changes."}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={discard} disabled={busy || !dirty}>Discard</Button>
            <Button onClick={saveAll} disabled={busy || !dirty || divisions.length === 0}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </CardContent>
      <PurgeSportDialog sport={sport} history={history} onClose={() => setHistory(null)}
        onDone={() => { setHistory(null); onRemoved(sport._id); }} />
    </Card>
  );
}

// "Delete with its history": lists what will be erased (every season) and needs the
// sport's name typed, because nothing here can be brought back.
function PurgeSportDialog({ sport, history, onClose, onDone }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setTyped(""); setError(""); }, [history]);

  async function run() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/sports/${sport._id}/purge`, {
        method: "POST", body: JSON.stringify({ confirm: typed.trim() }), timeoutMs: 120000,
      });
      onDone();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const h = history;
  return (
    <Dialog open={!!h} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete {sport.name} and all its history?</DialogTitle>
          <DialogDescription>This erases it from every season, not just this one. It can't be undone.</DialogDescription>
        </DialogHeader>
        {h && (
          <div className="space-y-4">
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              <li>{h.teams} team{h.teams === 1 ? "" : "s"}{h.currentSeasonTeams ? ` (${h.currentSeasonTeams} in the current season)` : ""}</li>
              <li>{h.players} player record{h.players === 1 ? "" : "s"} with their documents and photos</li>
              <li>{h.tournaments} tournament{h.tournaments === 1 ? "" : "s"} and {h.matches} match{h.matches === 1 ? "" : "es"} with player stats</li>
              {h.organizers.length > 0 && <li>Organizer account: {h.organizers.join(", ")}</li>}
            </ul>
            <p className="text-xs text-muted-foreground">
              Players who also play another sport keep their record. The Champions archive isn't touched.
            </p>
            {h.liveMatches > 0 && (
              <p className="text-sm text-destructive">{h.liveMatches} match(es) are being scored right now. End or cancel them first.</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="purge-confirm">Type <span className="font-semibold">{sport.name}</span> to confirm</Label>
              <Input id="purge-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={run}
            disabled={busy || !h || h.liveMatches > 0 || typed.trim() !== sport.name}>
            {busy ? "Deleting…" : "Delete everything"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddSport({ onAdded, onCancel, onError }) {
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
      onAdded(d.sport, d.message);
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card className="border-l-4 border-l-emerald-500">
      <CardHeader>
        <CardTitle>Add a game</CardTitle>
        <CardDescription>
          Give it a name and a type. You'll set its divisions, entry format and score sheet on the next screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sepak Takraw" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Draw format</Label>
            {/* Esports are always round-robin + a Top 8 / Top 16 knockout. */}
            <Select value={category === "esports" ? "round_robin" : tournamentFormat}
              onValueChange={setTournamentFormat} disabled={category === "esports"}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="double_elimination">Double-elimination groups</SelectItem>
                <SelectItem value="round_robin">Round-robin groups</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {category === "physical" ? (
          <Section title="Scoring rules" hint="How the live score works: the organizer taps these point values for the team that scored.">
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
                <Label>Period counts</Label>
                <Input value={rules.periodOptions} onChange={(e) => setRules({ ...rules, periodOptions: e.target.value })} placeholder="1, 3, 5" />
              </div>
            </div>
          </Section>
        ) : (
          <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            Scored by <span className="font-medium text-foreground">games won</span> — the organizer taps who won each game. Nothing to set.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          A new game also needs an organizer account — use Provision all on the Accounts page.
        </p>
        <div className="flex gap-2">
          <Button onClick={add} disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add game"}</Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
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
  const [query, setQuery] = useState("");

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
  const shown = rows.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4 text-amber-500" /> Barangays
          <span className="text-sm font-normal text-muted-foreground">
            {rows.length} total · {allowed} allow cross-barangay
          </span>
        </CardTitle>
        <CardDescription>
          <InfoHint summary="Tick a barangay to let its teams field players from any barangay — for ones too small to field a roster alone.">
            <p>An unticked barangay's teams may only field its own residents.</p>
            <p className="mt-1.5">Changing a tick re-checks every player straight away.</p>
          </InfoHint>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="relative mb-3 max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a barangay" className="h-8 pl-8" />
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((b) => (
                <div key={b._id}
                  className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", b.allowsCrossBarangay && "border-amber-500/40 bg-amber-500/5")}>
                  <Checkbox
                    checked={!!b.allowsCrossBarangay}
                    disabled={busyId === b._id}
                    onCheckedChange={() => toggleCross(b)}
                    title="Allows cross-barangay players"
                  />

                  {editingId === b._id ? (
                    <>
                      <Input value={draft} onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") rename(b); if (e.key === "Escape") setEditingId(null); }}
                        className="h-7 min-w-0 flex-1" autoFocus />
                      <Button size="sm" className="h-7" onClick={() => rename(b)} disabled={busyId === b._id}>Save</Button>
                      <button onClick={() => setEditingId(null)} title="Cancel"
                        className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm">{b.name}</span>
                      {b.hasLogo && <span className="shrink-0 text-[10px] text-muted-foreground">logo</span>}
                      <button onClick={() => { setEditingId(b._id); setDraft(b.name); }} title="Rename"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <Pencil className="size-3.5" />
                      </button>
                      <button onClick={() => remove(b)} disabled={busyId === b._id} title="Remove"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {shown.length === 0 && <p className="text-sm text-muted-foreground">No barangay matches “{query}”.</p>}
            </div>

            {adding ? (
              <div className="mt-4 flex items-center gap-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) add(); }}
                  placeholder="Barangay name" className="max-w-xs" autoFocus />
                <Button onClick={add} disabled={busyId === "new" || !newName.trim()}>Add</Button>
                <button onClick={() => { setAdding(false); setNewName(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)}
                className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <Plus className="size-3.5" /> Add a barangay
              </button>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              A new barangay needs an admin account — use Provision all on the Accounts page.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Simple underlined tabs (there is no Tabs primitive in components/ui).
function TabBar({ value, onChange, tabs }) {
  return (
    <div className="flex gap-1 border-b">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition",
            value === t.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}>
          {t.label}
          {t.count != null && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export default function SportConfig() {
  const showError = useErrorDialog();
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("games");
  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showTypes, setShowTypes] = useState(false);

  async function load() {
    try {
      const d = await api("/api/sports");
      setSports(d.sports || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // The selected game falls back to the first one if it was removed (or none is chosen yet).
  const selected = sports.find((s) => s._id === selectedId) || sports[0] || null;

  return (
    <AdminLayout title="League Setup" menu={superAdminMenu} enableDarkMode>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">League Setup</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Divisions decide how many tournaments a game runs, and the entry format decides how many players a
            barangay registers. Set them <span className="font-medium text-foreground">before registration opens</span> —
            once teams sign up, changing them would invalidate rosters built against the old settings.
          </p>
        </div>

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

        <TabBar value={tab} onChange={setTab}
          tabs={[{ value: "games", label: "Games", count: loading ? null : sports.length }, { value: "barangays", label: "Barangays" }]} />

        {tab === "barangays" ? (
          <BarangayCard onError={showError} onNotice={setNotice} />
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pick a game; the editor below is for that one game. */}
            <div className="flex flex-wrap items-center gap-2">
              {sports.map((s) => (
                <button key={s._id} onClick={() => { setSelectedId(s._id); setAdding(false); }}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition",
                    !adding && selected?._id === s._id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  )}>
                  {s.name}
                </button>
              ))}
              <button onClick={() => setAdding(true)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-dashed px-3.5 py-1.5 text-sm transition",
                  adding ? "border-primary text-foreground" : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                )}>
                <Plus className="size-3.5" /> Add a game
              </button>
              <button onClick={() => setShowTypes(!showTypes)}
                className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Info className="size-3.5" /> How each type is scored
              </button>
            </div>

            {showTypes && <RulesByType />}

            {adding ? (
              <AddSport
                onCancel={() => setAdding(false)}
                onError={showError}
                onAdded={(sport, message) => {
                  setNotice(message);
                  setSports((prev) => [...prev, sport].sort((a, b) => a.name.localeCompare(b.name)));
                  setSelectedId(sport._id);
                  setAdding(false);
                }}
              />
            ) : selected ? (
              <SportEditor
                key={selected._id}
                sport={selected}
                onSaved={(updated) => setSports((prev) => prev.map((x) => (x._id === updated._id ? updated : x)))}
                onRemoved={(id) => setSports((prev) => prev.filter((x) => x._id !== id))}
                onError={showError}
              />
            ) : (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
                No games yet. Use “Add a game” to create the first one.
              </CardContent></Card>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
