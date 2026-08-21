import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { Button, Card } from "../../components/ui";

const brgyMenu = [
  { label: "My Teams", path: "/brgy", icon: "⛃" },
  { label: "Documents", path: "/brgy/documents", icon: "🗎" },
];

const ROSTER_LIMITS = {
  team: { min: 10, max: 15 },
  singles: { min: 1, max: 1 },
  doubles: { min: 2, max: 2 },
};

const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls",
  under17: "Under 17", under30: "Under 30",
};
function RosterEditor({ team, sports, onClose }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ firstName: "", middleName: "", lastName: "", birthdate: "", address: "", jerseyNumber: "" });

  const sport = sports.find((s) => s._id === (team.sport?._id || team.sport));
  const entryFormat = sport?.entryFormat || "team";
  const limits = ROSTER_LIMITS[entryFormat] || ROSTER_LIMITS.team;
  const locked = !!team.submittedAt;

  async function load() {
    setLoading(true);
    try {
      const data = await api(`/api/teams/${team._id}/players`);
      setPlayers(data.players || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [team._id]);

  async function addPlayer() {
    setBusy(true); setError("");
    try {
      await api(`/api/teams/${team._id}/players`, {
        method: "POST",
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          middleName: form.middleName.trim() || undefined,
          lastName: form.lastName.trim(),
          birthdate: form.birthdate,
          address: form.address.trim() || undefined,
          jerseyNumber: form.jerseyNumber !== "" ? Number(form.jerseyNumber) : undefined,
        }),
      });
      setForm({ firstName: "", middleName: "", lastName: "", birthdate: "", address: "", jerseyNumber: "" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePlayer(playerId) {
    setError("");
    try {
      await api(`/api/teams/${team._id}/players/${playerId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitRoster() {
    if (!window.confirm(`Submit this roster? It will be locked and screened for residency.`)) return;
    setBusy(true); setError("");
    try {
      const res = await api(`/api/teams/${team._id}/submit`, { method: "POST" });
      alert(`Roster submitted. ${res.screening ? "Residency pre-screen has run — check Verification Status." : ""}`);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

    const [uploadingId, setUploadingId] = useState(null);

  async function uploadPhoto(playerId, file) {
    if (!file) return;
    setUploadingId(playerId); setError("");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/teams/${team._id}/players/${playerId}/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },   // no Content-Type — browser sets the boundary
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploadingId(null);
    }
  }

  const canSubmit = !locked && players.length >= limits.min && players.length <= limits.max;

    return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <Card className="p-5 w-full max-w-2xl my-auto">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-slate-800 font-semibold">{team.teamName}</h2>
          <p className="text-slate-500 text-sm">
            {sport?.name}
            {team.division && team.division !== "open" ? ` · ${DIVISION_LABEL[team.division] || team.division}` : ""}
            {" · "}{players.length}/{limits.max} player{limits.max === 1 ? "" : "s"}
            {locked ? " · submitted (locked)" : ""}
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 text-sm hover:text-slate-600">Close</button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading roster…</p>
      ) : (
        <>
                  <p className="text-slate-400 text-xs mb-2">
            Player photos: close-up headshot, face clearly visible, plain background if possible.
            JPEG or PNG, max 3&nbsp;MB. Photos appear on the public team roster.
          </p>  
          {/* Player list */}
          <div className="space-y-1.5 mb-4">
            {players.length === 0 && <p className="text-slate-500 text-sm">No players yet.</p>}
            {players.map((p) => (
              <div key={p._id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                                {p.photo ? (
                  <img
                    src={`/api/teams/players/${p._id}/photo`}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover bg-slate-100 shrink-0"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs shrink-0">
                    {p.lastName?.[0]}{p.firstName?.[0]}
                  </div>
                )}
                {!locked && (
                  <label className="text-xs text-indigo-600 hover:underline cursor-pointer shrink-0">
                    {uploadingId === p._id ? "…" : p.photo ? "Change" : "Photo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => { uploadPhoto(p._id, e.target.files[0]); e.target.value = ""; }}
                    />
                  </label>
                )}
                <span className="text-slate-400 text-xs w-8">{p.jerseyNumber ?? "—"}</span>
                <span className="flex-1 min-w-0 truncate text-slate-700">
                  {p.lastName}, {p.firstName} {p.middleName || ""}
                </span>
                <span className="text-slate-400 text-xs">{p.age}</span>
                {p.eligibilityStatus && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.eligibilityStatus === "eligible" ? "bg-green-100 text-green-700"
                    : p.eligibilityStatus === "flagged" ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                  }`}>
                    {p.eligibilityStatus.replace("_", " ")}
                  </span>
                )}
                {!locked && (
                  <button
                    onClick={() => removePlayer(p._id)}
                    className="text-xs font-medium px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add player */}
          {!locked && players.length < limits.max && (
            <div className="border-t border-slate-200 pt-4 mb-4">
              <h3 className="text-slate-700 font-medium text-sm mb-2">Add a player</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <input placeholder="First name" value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input placeholder="Last name" value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input placeholder="Middle name (optional)" value={form.middleName}
                  onChange={(e) => setForm({ ...form, middleName: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input type="date" value={form.birthdate}
                  onChange={(e) => setForm({ ...form, birthdate: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input placeholder="Address (optional)" value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input type="number" placeholder="Jersey # (optional)" value={form.jerseyNumber}
                  onChange={(e) => setForm({ ...form, jerseyNumber: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <Button onClick={addPlayer} disabled={busy || !form.firstName.trim() || !form.lastName.trim() || !form.birthdate}>
                {busy ? "Adding…" : "Add player"}
              </Button>
            </div>
          )}

          {/* Submit */}
          {!locked && (
            <div className="border-t border-slate-200 pt-4">
              <p className="text-slate-500 text-sm mb-2">
                {canSubmit
                  ? "Roster is ready to submit. Once submitted it's locked and screened."
                  : `Need ${limits.min}–${limits.max} players to submit (currently ${players.length}).`}
              </p>
              <Button onClick={submitRoster} disabled={!canSubmit || busy}>
                {busy ? "Submitting…" : "Submit roster"}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
    </div>
  );
}
export default function BrgyDashboard() {
  const [sports, setSports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openTeam, setOpenTeam] = useState(null);   // team being edited

  // create-team form
  const [sportId, setSportId] = useState("");
  const [division, setDivision] = useState("");
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        api("/api/sports"),
        api("/api/teams/mine"),
      ]);
      setSports(s.sports || []);
      setTeams(t.teams || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selectedSport = sports.find((s) => s._id === sportId);
  const divisions = selectedSport?.divisions || ["open"];
  const entryFormat = selectedSport?.entryFormat || "team";
  const limits = ROSTER_LIMITS[entryFormat] || ROSTER_LIMITS.team;

  async function createTeam() {
    setBusy(true); setError("");
    try {
      await api("/api/teams", {
        method: "POST",
        body: JSON.stringify({
          teamName: teamName.trim(),
          sportId,
          division: division || divisions[0],
        }),
      });
      setTeamName(""); setSportId(""); setDivision("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout title="Team Registration" menu={brgyMenu}>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="max-w-4xl space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Register a team */}
          <Card className="p-5">
            <h2 className="text-slate-800 font-semibold mb-1">Register a team</h2>
            <p className="text-slate-500 text-sm mb-4">
              Pick a sport and division. Roster size depends on the sport's format.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-700 text-sm font-medium mb-1.5">Sport</label>
                <select
                  value={sportId}
                  onChange={(e) => { setSportId(e.target.value); setDivision(""); }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select a sport…</option>
                  {sports.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {selectedSport && divisions.length > 1 && (
                <div>
                  <label className="block text-slate-700 text-sm font-medium mb-1.5">Division</label>
                  <div className="flex flex-wrap gap-2">
                    {divisions.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDivision(d)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          (division || divisions[0]) === d
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {DIVISION_LABEL[d] || d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedSport && (
                <p className="text-slate-400 text-xs">
                  {entryFormat === "team"
                    ? `Squad entry — ${limits.min}–${limits.max} players.`
                    : `${entryFormat === "singles" ? "Singles" : "Doubles"} entry — ${limits.max} player${limits.max > 1 ? "s" : ""}.`}
                </p>
              )}

              <div>
                <label className="block text-slate-700 text-sm font-medium mb-1.5">Team name</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Baybay Warriors"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <Button onClick={createTeam} disabled={busy || !sportId || !teamName.trim()}>
                {busy ? "Creating…" : "Create team"}
              </Button>
            </div>
          </Card>

          {/* Existing teams */}
          <Card className="p-5">
            <h2 className="text-slate-800 font-semibold mb-3">
              My teams <span className="text-slate-400 font-normal text-sm">({teams.length})</span>
            </h2>
            {teams.length === 0 ? (
              <p className="text-slate-500 text-sm">No teams registered yet this season.</p>
            ) : (
              <div className="space-y-2">
                {teams.map((t) => (
                  <div key={t._id} className="border border-slate-200 rounded-lg px-3 py-2.5 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 font-medium text-sm truncate">{t.teamName}</p>
                      <p className="text-slate-500 text-xs">
                        {t.sport?.name}
                        {t.division && t.division !== "open" ? ` · ${DIVISION_LABEL[t.division] || t.division}` : ""}
                        {" · "}{t.playerCount} player{t.playerCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      t.submittedAt ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {t.submittedAt ? "Submitted" : "Draft"}
                    </span>
                    <button
                      onClick={() => setOpenTeam(t)}
                      className="text-xs font-medium px-3 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                    >
                      {t.submittedAt ? "View roster" : "Edit roster"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {openTeam && (
            <RosterEditor
              team={openTeam}
              sports={sports}
              onClose={() => { setOpenTeam(null); load(); }}
            />
          )}
        </div>
      )}
    </AdminLayout>
  );
}