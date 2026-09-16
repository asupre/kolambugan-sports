import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Trash2, TriangleAlert, UserPlus, Wand2 } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";

const ROLE_LABEL = {
  super_admin: "Super Admin",
  barangay_admin: "Barangay Admin",
  organizer: "Organizer",
};

function AddAccountForm({ onCreated, onError }) {
  const [role, setRole] = useState("organizer");
  const [username, setUsername] = useState("");
  const [barangays, setBarangays] = useState([]);
  const [sports, setSports] = useState([]);
  const [barangayId, setBarangayId] = useState("");
  const [assignedSportId, setAssignedSportId] = useState("");
  const [busy, setBusy] = useState(false);

  // Load barangay + sport options for the dropdowns.
  useEffect(() => {
    Promise.all([
      api("/api/barangays").catch(() => ({ barangays: [] })),
      api("/api/sports").catch(() => ({ sports: [] })),
    ]).then(([b, s]) => {
      setBarangays(b.barangays || []);
      setSports(s.sports || []);
    });
  }, []);

  async function submit() {
    setBusy(true);
    try {
      const body = { role };
      if (username.trim()) body.username = username.trim();
      if (role === "barangay_admin") body.barangayId = barangayId;
      if (role === "organizer") body.assignedSportId = assignedSportId;
      const data = await api("/api/accounts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCreated(data); // { account, tempPassword }
      setUsername(""); setBarangayId(""); setAssignedSportId("");
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {["super_admin", "barangay_admin", "organizer"].map((r) => (
          <Button
            key={r}
            type="button"
            size="sm"
            variant={role === r ? "default" : "secondary"}
            onClick={() => setRole(r)}
          >
            {ROLE_LABEL[r]}
          </Button>
        ))}
      </div>

      {role === "barangay_admin" && (
        <Select value={barangayId} onValueChange={setBarangayId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a barangay…" />
          </SelectTrigger>
          <SelectContent>
            {barangays.map((b) => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {role === "organizer" && (
        <Select value={assignedSportId} onValueChange={setAssignedSportId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a sport…" />
          </SelectTrigger>
          <SelectContent>
            {sports.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <Input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder={role === "super_admin" ? "Username (e.g. lydo_head_2)" : "Username (optional — auto-generated if blank)"}
      />

      <Button
        onClick={submit}
        disabled={busy || (role === "barangay_admin" && !barangayId) || (role === "organizer" && !assignedSportId) || (role === "super_admin" && !username.trim())}
      >
        <UserPlus /> {busy ? "Creating…" : "Create account"}
      </Button>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Fresh temp passwords to reveal ONCE, keyed however we got them.
  const [reveals, setReveals] = useState([]); // [{ username, tempPassword }]
  const [resettingId, setResettingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api("/api/accounts");
      setAccounts(data.accounts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function provisionAll() {
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/accounts/provision-all", { method: "POST" });
      if (data.created?.length) {
        setReveals(data.created.map((c) => ({ username: c.username, tempPassword: c.tempPassword, label: c.label })));
      }
      alert(data.message);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(acc) {
    if (!window.confirm(`Reset the password for ${acc.username}? Their current password will stop working.`)) return;
    setResettingId(acc._id);
    setError("");
    try {
      const data = await api(`/api/accounts/${acc._id}/reset-password`, { method: "POST" });
      setReveals((prev) => [
        { username: data.username, tempPassword: data.tempPassword },
        ...prev.filter((r) => r.username !== data.username),
      ]);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setResettingId(null);
    }
  }

  async function deleteAccount(acc) {
    if (!window.confirm(`Delete ${acc.username}? This can't be undone.`)) return;
    setError("");
    try {
      await api(`/api/accounts/${acc._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message); // e.g. "has scored matches and can't be deleted"
    }
  }

  // Group accounts by role for display.
  const grouped = { super_admin: [], barangay_admin: [], organizer: [] };
  accounts.forEach((a) => { (grouped[a.role] = grouped[a.role] || []).push(a); });

  return (
    <AdminLayout title="Accounts" menu={superAdminMenu} enableDarkMode>
      {loading ? (
        <div className="max-w-4xl space-y-3">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : (
        <div className="max-w-4xl space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Bulk-fill anything missing */}
          <Card className="border-l-4 border-l-green-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="size-4 text-green-500" /> Provision all
              </CardTitle>
              <CardDescription>
                Creates any missing barangay admin (one per barangay) and organizer (one per
                sport) account with a random temp password. Safe to run any time — anything
                that already has an account is skipped, so adding a new sport or barangay
                only fills in that one gap.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={provisionAll} disabled={busy}>
                <Wand2 /> {busy ? "Provisioning…" : "Provision all"}
              </Button>
            </CardContent>
          </Card>

          {/* Add a single account */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="size-4 text-blue-500" /> Add an account
              </CardTitle>
              <CardDescription>
                For anything outside the standard set — like a second super admin. Barangay admins and
                organizers are limited to one per barangay / sport.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddAccountForm
                onCreated={(data) => {
                  setReveals((prev) => [
                    { username: data.account.username, tempPassword: data.tempPassword },
                    ...prev,
                  ]);
                  load();
                }}
                onError={(msg) => setError(msg)}
              />
            </CardContent>
          </Card>

          {/* One-time password reveals */}
          {reveals.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="flex items-center gap-1.5 font-semibold text-sm text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="size-4" />
                    New passwords — copy now, they won't be shown again
                  </h3>
                  <button
                    onClick={() => setReveals([])}
                    className="text-amber-700 dark:text-amber-400 text-xs hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="space-y-1.5">
                  {reveals.map((r) => (
                    <div key={r.username} className="flex items-center gap-2 text-sm bg-card rounded-lg border border-amber-500/30 px-3 py-2">
                      <span className="font-medium flex-1 truncate">
                        {r.username}{r.label ? <span className="text-muted-foreground"> · {r.label}</span> : null}
                      </span>
                      <code className="font-mono bg-muted rounded px-2 py-0.5">{r.tempPassword}</code>
                      <CopyButton text={r.tempPassword} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Account lists by role */}
          {["super_admin", "barangay_admin", "organizer"].map((role) => {
            const list = grouped[role] || [];
            if (list.length === 0) return null;
            return (
              <Card key={role}>
                <CardHeader>
                  <CardTitle>
                    {ROLE_LABEL[role]}
                    <span className="font-normal text-sm text-muted-foreground ml-2">({list.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto scrollbar-thin rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted text-muted-foreground text-left">
                        <tr>
                          <th className="px-3 py-2 font-medium">Username</th>
                          <th className="px-3 py-2 font-medium">Assigned to</th>
                          <th className="px-3 py-2 font-medium text-center">Password status</th>
                          <th className="px-3 py-2 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {list.map((a) => (
                          <tr key={a._id}>
                            <td className="px-3 py-2 font-medium">{a.username}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {a.barangay?.name || a.assignedSport?.name || "—"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge className={cn(
                                a.mustChangePassword
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : "bg-green-500/15 text-green-600 dark:text-green-400"
                              )}>
                                {a.mustChangePassword ? "Needs change" : "Set"}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="inline-flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => resetPassword(a)}
                                  disabled={resettingId === a._id}
                                >
                                  <KeyRound /> {resettingId === a._id ? "…" : "Reset password"}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => deleteAccount(a)}>
                                  <Trash2 /> Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
