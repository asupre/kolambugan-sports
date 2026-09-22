import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Search, Trash2, TriangleAlert, UserPlus, Wand2 } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
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
const ROLES = ["super_admin", "barangay_admin", "organizer"];

function AddAccountForm({ onCreated }) {
  const [role, setRole] = useState("organizer");
  const [username, setUsername] = useState("");
  const [barangays, setBarangays] = useState([]);
  const [sports, setSports] = useState([]);
  const [barangayId, setBarangayId] = useState("");
  const [assignedSportId, setAssignedSportId] = useState("");
  const [busy, setBusy] = useState(false);
  // Shown inside the dialog, right above the button — a page-level banner would
  // sit behind the dialog's overlay where nobody would see it.
  const [error, setError] = useState("");

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
    setError("");
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
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ROLES.map((r) => (
          <Button
            key={r}
            type="button"
            size="sm"
            variant={role === r ? "default" : "secondary"}
            onClick={() => { setRole(r); setError(""); }}
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
        placeholder={role === "super_admin" ? "Username (e.g. lydo_head_2)" : "Username (optional)"}
      />

      {role !== "super_admin" && (
        <p className="text-xs text-muted-foreground -mt-1">Leave the username blank to have one generated.</p>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

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

// Same column template for the header and every row, so they line up from `sm`
// up; on a phone the columns collapse into a two-line card instead of a table
// that scrolls sideways (which hid the Reset/Delete buttons off-screen).
// The last column is a fixed width, not `auto` — auto is sized per grid, so the
// header and each row would disagree and the headers wouldn't line up.
const ROW_GRID = "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_7.5rem_11rem]";

function AccountRow({ a, resetting, onReset, onDelete, currentUserId }) {
  const assigned = a.barangay?.name || a.assignedSport?.name || "";
  const isSelf = String(a._id) === String(currentUserId);
  return (
    <div className={cn("grid gap-y-2 px-3 py-2.5 sm:items-center sm:gap-x-3", ROW_GRID)}>
      {/* Name and what it's assigned to share a line on a phone (three lines per
          row made a 26-row list enormous); their own columns from `sm` up. */}
      <div className="flex items-baseline gap-2 min-w-0 sm:contents">
        <p className="font-medium truncate">{a.username}</p>
        <p className={cn("text-sm text-muted-foreground truncate", !assigned && "hidden sm:block")}>
          {assigned || "—"}
        </p>
      </div>
      {/* Status + actions share a line on a phone; `contents` hands them back to
          the grid as their own columns from `sm` up. */}
      <div className="flex items-center justify-between gap-2 sm:contents">
        <div className="sm:text-center">
          <Badge className={cn(
            a.mustChangePassword
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-green-500/15 text-green-600 dark:text-green-400"
          )}>
            {a.mustChangePassword ? "Needs change" : "Set"}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 sm:justify-end">
          {/* A Super Admin's password is theirs to manage now (change password /
              recovery code from their own profile) — no peer reset button, see
              routes/accounts.js. */}
          {a.role !== "super_admin" && (
            <Button size="sm" variant="outline" onClick={() => onReset(a)} disabled={resetting}>
              <KeyRound /> {resetting ? "…" : "Reset password"}
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="destructive"
            aria-label={`Delete ${a.username}`}
            title={isSelf ? "You can't delete your own account" : "Delete account"}
            disabled={isSelf}
            onClick={() => onDelete(a)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Accounts() {
  const showError = useErrorDialog();
  const confirm = useConfirm();
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Fresh temp passwords to reveal ONCE, keyed however we got them.
  const [reveals, setReveals] = useState([]); // [{ username, tempPassword }]
  const [resettingId, setResettingId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | a role | needs_change

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
      await confirm(data.message, { alertOnly: true });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(acc) {
    if (!(await confirm(`Reset the password for ${acc.username}? Their current password will stop working.`, { confirmLabel: "Reset" }))) return;
    setResettingId(acc._id);
    try {
      const data = await api(`/api/accounts/${acc._id}/reset-password`, { method: "POST" });
      setReveals((prev) => [
        { username: data.username, tempPassword: data.tempPassword },
        ...prev.filter((r) => r.username !== data.username),
      ]);
      await load();
    } catch (e) {
      showError(e.message);
    } finally {
      setResettingId(null);
    }
  }

  async function deleteAccount(acc) {
    if (!(await confirm(`Delete ${acc.username}? This can't be undone.`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api(`/api/accounts/${acc._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      showError(e.message); // e.g. "has scored matches and can't be deleted"
    }
  }

  const needsChange = accounts.filter((a) => a.mustChangePassword).length;
  const countFor = (f) =>
    f === "all" ? accounts.length
    : f === "needs_change" ? needsChange
    : accounts.filter((a) => a.role === f).length;

  // Search matches the username or what the account is assigned to.
  const q = query.trim().toLowerCase();
  const passes = (a) => {
    const text = `${a.username} ${a.barangay?.name || ""} ${a.assignedSport?.name || ""}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (filter === "all") return true;
    if (filter === "needs_change") return a.mustChangePassword;
    return a.role === filter;
  };
  const shown = accounts.filter(passes);

  // Group accounts by role for display.
  const grouped = { super_admin: [], barangay_admin: [], organizer: [] };
  shown.forEach((a) => { (grouped[a.role] = grouped[a.role] || []).push(a); });

  const FILTERS = [
    { key: "all", label: "All" },
    ...ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] })),
    { key: "needs_change", label: "Needs password change" },
  ];

  return (
    <AdminLayout title="Accounts" menu={superAdminMenu} enableDarkMode>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Header: what there is, and the two things you can do about it. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-2xl font-semibold leading-tight">
                {accounts.length} <span className="text-base font-normal text-muted-foreground">accounts</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {needsChange > 0
                  ? `${needsChange} still on a temporary password`
                  : "Everyone has set their own password"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setAddOpen(true)}>
                <UserPlus /> Add account
              </Button>
              <Button onClick={provisionAll} disabled={busy}>
                <Wand2 /> {busy ? "Provisioning…" : "Provision all"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground max-w-prose -mt-2">
            <span className="font-medium text-foreground">Provision all</span> creates any missing barangay
            admin (one per barangay) and organizer (one per sport) account with a random temporary password.
            It's safe to run any time — anything that already has an account is skipped.
          </p>

          {/* One-time password reveals */}
          {reveals.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="flex items-center gap-1.5 font-semibold text-sm text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="size-4 shrink-0" />
                    New passwords — copy now, they won't be shown again
                  </h3>
                  <button
                    onClick={() => setReveals([])}
                    className="shrink-0 text-amber-700 dark:text-amber-400 text-xs hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="space-y-1.5">
                  {reveals.map((r) => (
                    <div key={r.username} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm bg-card rounded-lg border border-amber-500/30 px-3 py-2">
                      <span className="font-medium flex-1 min-w-[8rem] truncate">
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

          {/* Find someone: search, and narrow by role or by who hasn't set a password yet. */}
          <div className="space-y-2.5">
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search username, barangay or sport…"
                className="pl-8"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <Button
                  key={f.key}
                  type="button"
                  size="sm"
                  variant={filter === f.key ? "default" : "secondary"}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                  <span className={cn("tabular-nums text-xs", filter === f.key ? "opacity-80" : "text-muted-foreground")}>
                    {countFor(f.key)}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {/* Account lists by role */}
          {shown.length === 0 && (
            <p className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              No accounts match{q ? ` "${query.trim()}"` : " this filter"}.
            </p>
          )}
          {ROLES.map((role) => {
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
                  <div className="rounded-lg border overflow-hidden">
                    <div className={cn("hidden sm:grid gap-x-3 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground", ROW_GRID)}>
                      <span>Username</span>
                      <span>Assigned to</span>
                      <span className="text-center">Password</span>
                      <span className="text-right">Actions</span>
                    </div>
                    <div className="divide-y">
                      {list.map((a) => (
                        <AccountRow
                          key={a._id}
                          a={a}
                          resetting={resettingId === a._id}
                          onReset={resetPassword}
                          onDelete={deleteAccount}
                          currentUserId={currentUser?.id}
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add a single account — for anything outside the standard set, like a
          second super admin. Barangay admins and organizers are still limited to
          one per barangay / sport (the server enforces it). */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add an account</DialogTitle>
            <DialogDescription>
              For anything outside the standard set — like a second super admin. Barangay admins and
              organizers are limited to one per barangay / sport.
            </DialogDescription>
          </DialogHeader>
          <AddAccountForm
            onCreated={(data) => {
              setReveals((prev) => [
                { username: data.account.username, tempPassword: data.tempPassword },
                ...prev,
              ]);
              setAddOpen(false);
              load();
            }}
          />
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
