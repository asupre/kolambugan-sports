// Super Admin notifications bell (Nov 2026): answers to the league terms and conditions. The red count
// is how many barangays answered since the bell was last opened (red = at least one declined,
// which also closes that barangay's registration). Opening it lists Declined / Accepted /
// Waiting, and marks everything seen (POST /api/terms/seen). "Ask again" clears a barangay's
// answer so its admin gets the pop-up again (POST /api/terms/:id/reset).
import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react";
import { api } from "../api";
import { useConfirm } from "./ConfirmDialog";
import { useErrorDialog } from "./ErrorDialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { cn } from "../lib/utils";

const when = (d) => (d ? new Date(d).toLocaleString("en-PH", {
  timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}) : "");

function Row({ b, onReset, busy }) {
  const tone = b.status === "declined" ? "text-red-600 dark:text-red-400"
    : b.status === "accepted" ? "text-green-700 dark:text-green-400" : "text-muted-foreground";
  const Icon = b.status === "declined" ? XCircle : b.status === "accepted" ? CheckCircle2 : Clock;
  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", b.status && !b.seen && "bg-primary/5")}>
      <Icon className={cn("mt-0.5 size-[18px] shrink-0", tone)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-medium">{b.name}</span>
          {b.status && !b.seen && <Badge className="bg-primary/15 text-primary">New</Badge>}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {b.status === "declined" && <>Declined{b.byName ? ` by ${b.byName}` : ""} · {when(b.at)} · registration closed</>}
          {b.status === "accepted" && <>Accepted{b.byName ? ` by ${b.byName}` : ""} · {when(b.at)}</>}
          {!b.status && (b.hasAdmin ? "Hasn't answered yet (asked at their next login)" : "No barangay admin account yet")}
        </p>
      </div>
      {b.status && (
        <Button size="sm" variant="outline" className="shrink-0" disabled={busy} onClick={() => onReset(b)}
          title="Clear the answer so the barangay admin is asked again">
          <RotateCcw className="size-3.5" /> Ask again
        </Button>
      )}
    </li>
  );
}

function Group({ title, rows, ...rest }) {
  if (!rows.length) return null;
  return (
    <section>
      <h3 className="px-4 pb-1 pt-4 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title} · {rows.length}
      </h3>
      <ul className="divide-y">{rows.map((b) => <Row key={b._id} b={b} {...rest} />)}</ul>
    </section>
  );
}

export default function TermsNotifications({ className }) {
  const confirm = useConfirm();
  const showError = useErrorDialog();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);   // the list as it was when opened (keeps "New" tags)
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try { const d = await api("/api/terms"); setData(d); return d; } catch { return null; }
  }
  useEffect(() => { load(); }, []);

  async function openPanel() {
    setOpen(true);
    const d = (await load()) || data;
    setRows(d?.barangays || []);
    if (d?.unseen) {
      api("/api/terms/seen", { method: "POST" }).then(() => setData((x) => x && { ...x, unseen: 0, unseenDeclined: 0 })).catch(() => {});
    }
  }

  async function reset(b) {
    const ok = await confirm(`Ask ${b.name} again? Their answer is cleared and the terms pop up for their barangay admin at the next page load. Registration stays closed until they accept.`,
      { title: "Ask again?", confirmLabel: "Ask again" });
    if (!ok) return;
    setBusyId(b._id);
    try {
      await api(`/api/terms/${b._id}/reset`, { method: "POST" });
      setRows((prev) => prev.map((x) => (x._id === b._id ? { ...x, status: null, byName: null, at: null, seen: false } : x)));
      load();
    } catch (e) { showError(e.message); }
    finally { setBusyId(null); }
  }

  const count = data?.unseen || 0;
  const declined = rows.filter((b) => b.status === "declined");
  const accepted = rows.filter((b) => b.status === "accepted");
  const waiting = rows.filter((b) => !b.status);

  return (
    <>
      <button onClick={openPanel} aria-label={count ? `Notifications, ${count} new` : "Notifications"} title="Notifications"
        className={cn("relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-accent-foreground", className)}>
        <Bell className="size-4" />
        {count > 0 && (
          <span className={cn("absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold leading-none text-white",
            data?.unseenDeclined ? "bg-red-600" : "bg-primary")}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="border-b px-4 py-4 pr-12">
            <DialogTitle className="text-[17px]">Terms and conditions</DialogTitle>
            <DialogDescription className="mt-1 text-[13px]">
              Every barangay must accept the league terms before registering. A barangay that declined
              can't register teams or players until you ask again and it accepts.
            </DialogDescription>
          </div>
          <div className="scrollbar-thin overflow-y-auto overscroll-contain pb-3">
            {!rows.length ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No barangays yet.</p>
            ) : (
              <>
                <Group title="Declined" rows={declined} onReset={reset} busy={!!busyId} />
                <Group title="Accepted" rows={accepted} onReset={reset} busy={!!busyId} />
                <Group title="Waiting for an answer" rows={waiting} onReset={reset} busy={!!busyId} />
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
