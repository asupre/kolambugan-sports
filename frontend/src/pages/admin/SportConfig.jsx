import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { Button, Card } from "../../components/ui";
import { superAdminMenu } from "../../components/menus";

const DIVISIONS = [
  { value: "open", label: "Open", hint: "One bracket, everyone together" },
  { value: "boys", label: "Boys" },
  { value: "girls", label: "Girls" },
  { value: "under17", label: "Under 17" },
  { value: "under30", label: "Under 30" },
];

const FORMATS = [
  { value: "team", label: "Team", hint: "10–15 players" },
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

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const label = "block text-slate-600 text-xs font-medium mb-1";

// Comma-separated numbers in a text box: "1, 2, 3". Simpler than a tag editor
// and these are set once at installation, not fiddled with.
const parseNums = (s) =>
  String(s).split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);

function SportCard({ sport, onSaved, onRemoved, onError }) {
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
    if (!window.confirm(`Remove ${sport.name}? This only works if nothing references it.`)) return;
    setBusy(true);
    try {
      await api(`/api/sports/${sport._id}`, { method: "DELETE" });
      onRemoved(sport._id);
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  }

  const set = (k) => (e) => { setRules({ ...rules, [k]: e.target.value }); setSaved(""); };

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        {renaming ? (
          <div className="flex items-center gap-2 flex-1">
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} max-w-xs`} />
            <button onClick={rename} disabled={busy}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
              Save
            </button>
            <button onClick={() => { setRenaming(false); setName(sport.name); }}
              className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        ) : (
          <div className="flex items-baseline gap-3">
            <h3 className="text-slate-800 font-semibold">{sport.name}</h3>
            <button onClick={() => setRenaming(true)} className="text-xs text-slate-400 hover:text-slate-600">
              Rename
            </button>
          </div>
        )}
        {saved && <span className="text-green-600 text-xs">{saved}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className={label}>Divisions</label>
          <div className="space-y-1">
            {DIVISIONS.map((d) => (
              <label key={d.value} className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={divisions.includes(d.value)}
                  onChange={() => toggleDivision(d.value)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="min-w-0">
                  <span className="text-slate-700 text-sm">{d.label}</span>
                  {d.hint && <span className="block text-slate-400 text-xs">{d.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={label}>Entry format</label>
          <div className="space-y-1">
            {FORMATS.map((f) => (
              <label key={f.value} className="flex items-start gap-2.5 cursor-pointer">
                <input type="radio" name={`format-${sport._id}`} checked={format === f.value}
                  onChange={() => { setFormat(f.value); setSaved(""); }}
                  className="mt-0.5 border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="min-w-0">
                  <span className="text-slate-700 text-sm">{f.label}</span>
                  <span className="block text-slate-400 text-xs">{f.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={saveConfig} disabled={busy || !configDirty || divisions.length === 0}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <button onClick={() => setAdvanced(!advanced)}
          className="text-xs text-slate-500 hover:text-slate-700">
          {advanced ? "Hide" : "Show"} scoring &amp; draw rules
        </button>
        <button onClick={remove} disabled={busy}
          className="text-xs text-red-600 hover:underline ml-auto">
          Remove
        </button>
      </div>

      {advanced && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <p className="text-slate-500 text-xs mb-4">
            Leave a field blank to use the built-in default for this sport. These are
            set once when a sport is added and rarely change after.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Draw format</label>
              <select value={rules.tournamentFormat} onChange={set("tournamentFormat")} className={input}>
                <option value="double_elimination">Groups with double-elimination</option>
                <option value="round_robin">Groups with round-robin</option>
              </select>
            </div>

            <div>
              <label className={label}>Scoring</label>
              <select value={rules.scoringMode} onChange={set("scoringMode")} className={input}>
                <option value="">Default for this sport</option>
                {SCORING_MODES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <p className="text-slate-400 text-xs mt-1">
                {SCORING_MODES.find((s) => s.value === rules.scoringMode)?.hint || "\u00A0"}
              </p>
            </div>

            <div>
              <label className={label}>Point values</label>
              <input value={rules.pointValues} onChange={set("pointValues")}
                placeholder="1, 2, 3" className={input} />
              <p className="text-slate-400 text-xs mt-1">What one scoring tap can add.</p>
            </div>

            <div>
              <label className={label}>Period name</label>
              <input value={rules.periodLabel} onChange={set("periodLabel")}
                placeholder="quarter, set, game" className={input} />
            </div>

            <div>
              <label className={label}>Period counts allowed</label>
              <input value={rules.periodOptions} onChange={set("periodOptions")}
                placeholder="1, 3, 5" className={input} />
              <p className="text-slate-400 text-xs mt-1">What the organizer may pick at the start.</p>
            </div>

            <div>
              <label className={label}>Players on court</label>
              <input type="number" value={rules.onCourt} onChange={set("onCourt")}
                placeholder="blank = whole roster" className={input} />
            </div>

            <div className="sm:col-span-2">
              <label className={label}>Stats recorded</label>
              <div className="flex gap-4">
                {STAT_TYPES.map((s) => (
                  <label key={s.value} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={rules.statTypes.includes(s.value)}
                      onChange={() => {
                        setSaved("");
                        setRules({
                          ...rules,
                          statTypes: rules.statTypes.includes(s.value)
                            ? rules.statTypes.filter((x) => x !== s.value)
                            : [...rules.statTypes, s.value],
                        });
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-slate-700 text-sm">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={label}>Teams per barangay</label>
              <input type="number" value={rules.teamsPerBarangay} onChange={set("teamsPerBarangay")}
                placeholder="1" className={input} />
            </div>

            <div>
              <label className={label}>Groups in the draw</label>
              <input type="number" value={rules.numGroups} onChange={set("numGroups")}
                placeholder="4, or 8 for round-robin" className={input} />
            </div>

            <div>
              <label className={label}>Knockout size</label>
              <input type="number" value={rules.knockoutSize} onChange={set("knockoutSize")}
                placeholder="8 or 16" className={input} />
              <p className="text-slate-400 text-xs mt-1">
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
        className="w-full py-3 rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm hover:border-slate-400 hover:text-slate-700">
        + Add a sport
      </button>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="text-slate-800 font-semibold mb-3">Add a sport</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={label}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sepak Takraw" className={input} autoFocus />
        </div>
        <div>
          <label className={label}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
            <option value="physical">Physical</option>
            <option value="esports">Esports</option>
          </select>
        </div>
        <div>
          <label className={label}>Draw format</label>
          <select value={tournamentFormat} onChange={(e) => setTournamentFormat(e.target.value)} className={input}>
            <option value="double_elimination">Double-elimination groups</option>
            <option value="round_robin">Round-robin groups</option>
          </select>
        </div>
      </div>
      <p className="text-slate-400 text-xs mt-3">
        Set its divisions, scoring and draw rules after adding. A new sport also needs
        an organizer account — use Provision all on the Accounts page.
      </p>
      <div className="flex gap-2 mt-4">
        <Button onClick={add} disabled={busy || !name.trim()}>
          {busy ? "Adding…" : "Add sport"}
        </Button>
        <Button variant="secondary" onClick={() => { setOpen(false); setName(""); }}>Cancel</Button>
      </div>
    </Card>
  );
}

// Barangays and their cross-barangay permission in one place — both are facts
// about a barangay, and splitting them across two cards made no sense.
function BarangayCard({ onError }) {
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
    if (!window.confirm(`Remove ${b.name}? This only works if nothing references it.`)) return;
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
    <Card className="p-5">
      <h2 className="text-slate-800 font-semibold mb-1">Barangays</h2>
      <p className="text-slate-500 text-sm mb-4">
        {rows.length} barangays · {allowed} allow cross-barangay play. A checked
        barangay's residents may play for another barangay's team without being
        flagged during verification — intended for barangays that can't field a
        full roster alone.
      </p>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            {rows.map((b) => (
              <div key={b._id} className="flex items-center gap-3 px-3 py-2">
                <label className="flex items-center gap-2.5 cursor-pointer shrink-0" title="Allows cross-barangay">
                  <input type="checkbox" checked={!!b.allowsCrossBarangay}
                    disabled={busyId === b._id} onChange={() => toggleCross(b)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                </label>

                {editingId === b._id ? (
                  <>
                    <input value={draft} onChange={(e) => setDraft(e.target.value)}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" autoFocus />
                    <button onClick={() => rename(b)} disabled={busyId === b._id}
                      className="text-xs font-medium px-2.5 py-1 rounded bg-indigo-600 text-white">Save</button>
                    <button onClick={() => setEditingId(null)}
                      className="text-xs text-slate-500">Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-slate-700 text-sm truncate">{b.name}</span>
                    {b.hasLogo && <span className="text-slate-400 text-xs shrink-0">logo</span>}
                    <button onClick={() => { setEditingId(b._id); setDraft(b.name); }}
                      className="text-xs text-slate-400 hover:text-slate-600 shrink-0">Rename</button>
                    <button onClick={() => remove(b)} disabled={busyId === b._id}
                      className="text-xs text-red-600 hover:underline shrink-0">Remove</button>
                  </>
                )}
              </div>
            ))}
          </div>

          {adding ? (
            <div className="flex items-center gap-2 mt-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Barangay name" className={`${input} max-w-xs`} autoFocus />
              <Button onClick={add} disabled={busyId === "new" || !newName.trim()}>Add</Button>
              <button onClick={() => { setAdding(false); setNewName(""); }}
                className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="mt-3 text-sm text-indigo-600 hover:underline">+ Add a barangay</button>
          )}

          <p className="text-slate-400 text-xs mt-3">
            A new barangay needs an admin account — use Provision all on the Accounts page.
          </p>
        </>
      )}
    </Card>
  );
}

export default function SportConfig() {
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
    <AdminLayout title="League Setup" menu={superAdminMenu}>
      <div className="max-w-4xl space-y-5">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        {notice && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
            <p className="text-green-700 text-sm">{notice}</p>
          </div>
        )}

        <Card className="p-5">
          <h2 className="text-slate-800 font-semibold mb-1">How the league is set up</h2>
          <p className="text-slate-500 text-sm">
            Divisions decide how many tournaments a sport runs; the entry format decides
            how many players a barangay registers. Set these{" "}
            <span className="font-medium">before registration opens</span> — once teams
            sign up, changing them would invalidate rosters built against the old
            settings.
          </p>
        </Card>

        <BarangayCard onError={setError} />

        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <>
            {sports.map((s) => (
              <SportCard
                key={s._id}
                sport={s}
                onSaved={(updated) => {
                  setError("");
                  setSports((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
                }}
                onRemoved={(id) => {
                  setError("");
                  setSports((prev) => prev.filter((x) => x._id !== id));
                }}
                onError={setError}
              />
            ))}
            <AddSport
              onAdded={(sport, message) => {
                setError("");
                setNotice(message);
                setSports((prev) => [...prev, sport].sort((a, b) => a.name.localeCompare(b.name)));
              }}
              onError={setError}
            />
          </>
        )}
      </div>
    </AdminLayout>
  );
}