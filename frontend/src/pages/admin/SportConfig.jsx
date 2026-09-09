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

function SportCard({ sport, onSaved, onError }) {
  const [divisions, setDivisions] = useState(sport.divisions?.length ? sport.divisions : ["open"]);
  const [format, setFormat] = useState(sport.entryFormat || "team");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDivisions(sport.divisions?.length ? sport.divisions : ["open"]);
    setFormat(sport.entryFormat || "team");
  }, [sport]);

  const dirty =
    JSON.stringify([...divisions].sort()) !== JSON.stringify([...(sport.divisions || [])].sort()) ||
    format !== sport.entryFormat;

  function toggle(value) {
    setSaved(false);
    // "Open" means no split, so it can't sit alongside a real division.
    if (value === "open") { setDivisions(["open"]); return; }
    const next = divisions.filter((d) => d !== "open");
    setDivisions(next.includes(value) ? next.filter((d) => d !== value) : [...next, value]);
  }

  async function save() {
    setBusy(true);
    try {
      const d = await api(`/api/sports/${sport._id}/config`, {
        method: "PATCH",
        body: JSON.stringify({ divisions, entryFormat: format }),
      });
      setSaved(true);
      onSaved(d.sport);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="text-slate-800 font-semibold">{sport.name}</h3>
        {saved && !dirty && <span className="text-green-600 text-xs">Saved</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className="block text-slate-600 text-xs font-medium mb-2">Divisions</label>
          <div className="space-y-1.5">
            {DIVISIONS.map((d) => (
              <label key={d.value} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={divisions.includes(d.value)}
                  onChange={() => toggle(d.value)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="min-w-0">
                  <span className="text-slate-700 text-sm">{d.label}</span>
                  {d.hint && <span className="block text-slate-400 text-xs">{d.hint}</span>}
                </span>
              </label>
            ))}
          </div>
          <p className="text-slate-400 text-xs mt-2">
            One tournament runs per division, so a barangay can enter each one separately.
          </p>
        </div>

        <div>
          <label className="block text-slate-600 text-xs font-medium mb-2">Entry format</label>
          <div className="space-y-1.5">
            {FORMATS.map((f) => (
              <label key={f.value} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name={`format-${sport._id}`}
                  checked={format === f.value}
                  onChange={() => { setFormat(f.value); setSaved(false); }}
                  className="mt-0.5 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="min-w-0">
                  <span className="text-slate-700 text-sm">{f.label}</span>
                  <span className="block text-slate-400 text-xs">{f.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-slate-400 text-xs mt-2">
            Sets the roster size a barangay must submit.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={busy || !dirty || divisions.length === 0}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {dirty && <span className="text-slate-400 text-xs">Unsaved changes</span>}
      </div>
    </Card>
  );
}
// Which barangays may lend players to another barangay's team. Small barangays
// often can't field a full roster, so the league allows named exceptions rather
// than a blanket rule.
function CrossBarangayCard({ onError }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const d = await api("/api/barangays");
      setRows(d.barangays || []);
    } catch (e) { onError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function toggle(b) {
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

  const allowed = rows.filter((b) => b.allowsCrossBarangay).length;

  return (
    <Card className="p-5">
      <h2 className="text-slate-800 font-semibold mb-1">Cross-barangay play</h2>
      <p className="text-slate-500 text-sm mb-4">
        A resident of a checked barangay may play for another barangay's team without
        being flagged during residency verification. Intended for barangays that can't
        field a full roster on their own. {allowed} of {rows.length} allowed.
      </p>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {rows.map((b) => (
            <label key={b._id} className="flex items-center gap-2.5 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={!!b.allowsCrossBarangay}
                disabled={busyId === b._id}
                onChange={() => toggle(b)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-slate-700 text-sm">{b.name}</span>
            </label>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function SportConfig() {
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      const d = await api("/api/sports");
      setSports(d.sports || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout title="Sport Setup" menu={superAdminMenu}>
      <div className="max-w-4xl space-y-5">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <Card className="p-5">
          <h2 className="text-slate-800 font-semibold mb-1">How each sport is run this season</h2>
          <p className="text-slate-500 text-sm">
            Divisions decide how many tournaments a sport runs; the entry format
            decides how many players a barangay must register. Set these{" "}
            <span className="font-medium">before registration opens</span> — once
            teams have signed up, changing them would invalidate rosters that were
            built against the old settings.
          </p>
        </Card>
                <CrossBarangayCard onError={setError} />
        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          sports.map((s) => (
            <SportCard
              key={s._id}
              sport={s}
              onSaved={(updated) => {
                setError("");
                setSports((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
              }}
              onError={setError}
            />
          ))
        )}
      </div>
    </AdminLayout>
  );
}