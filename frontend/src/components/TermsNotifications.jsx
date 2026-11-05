// Super Admin notifications bell (Nov 2026): barangays' answers to the league terms and
// conditions. The bell opens a regular dropdown (NotificationBell) listing the answers, newest
// first; the count is answers since it was last opened (red when one is a decline, which also
// closes that barangay's registration). Opening it marks everything seen (POST /api/terms/seen).
// Tapping an answer opens a pop-up with the details and "Ask again" (POST /api/terms/:id/reset:
// clears the answer so the barangay admin gets the terms again). "See all barangays" opens the
// full Declined / Accepted / Waiting list.
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Inbox, RotateCcw, XCircle } from "lucide-react";
import { api } from "../api";
import { useConfirm } from "./ConfirmDialog";
import { useErrorDialog } from "./ErrorDialog";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { NotificationBell, NotificationEmpty, NotificationItem, notifWhen } from "./NotificationBell";
import { cn } from "../lib/utils";

const TONE = {
  declined: "bg-red-500/15 text-red-600 dark:text-red-400",
  accepted: "bg-green-500/15 text-green-700 dark:text-green-400",
  waiting: "bg-muted text-muted-foreground",
};
function StatusIcon({ status, size = "size-8" }) {
  const Icon = status === "declined" ? XCircle : status === "accepted" ? CheckCircle2 : Clock;
  return (
    <span className={cn("flex items-center justify-center rounded-full", size, TONE[status || "waiting"])}>
      <Icon className="size-4" />
    </span>
  );
}

const headline = (b) => (b.status === "declined" ? `${b.name} declined the terms`
  : b.status === "accepted" ? `${b.name} accepted the terms` : `${b.name} hasn't answered yet`);
const explain = (b) => (b.status === "declined"
  ? "Registration is closed for this barangay: it can't create teams, add players or submit rosters until you ask again and it accepts."
  : b.status === "accepted"
    ? "This barangay can register teams and players."
    : b.hasAdmin
      ? "The terms pop up for its barangay admin at the next page load. Registration stays closed until they accept."
      : "This barangay has no admin account yet. Create one with Provision all on the Accounts page.");

export default function TermsNotifications({ className }) {
  const confirm = useConfirm();
  const showError = useErrorDialog();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);        // as they were when opened (keeps the "new" dots)
  const [detail, setDetail] = useState(null);  // one barangay in the pop-up
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { const d = await api("/api/terms"); setData(d); return d; } catch { return null; }
  }
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    return () => clearInterval(timer);
  }, []);

  async function onOpenChange(next) {
    setOpen(next);
    if (!next) return;
    setRows(data?.barangays || []);
    const d = (await load()) || data;
    setRows(d?.barangays || []);
    if (d?.unseen) {
      api("/api/terms/seen", { method: "POST" }).then(() => setData((x) => x && { ...x, unseen: 0, unseenDeclined: 0 })).catch(() => {});
    }
  }

  function showDetail(b) {
    setOpen(false);
    setShowAll(false);
    setDetail(b);
  }

  async function reset(b) {
    const ok = await confirm(`Ask ${b.name} again? Their answer is cleared and the terms pop up for their barangay admin at the next page load. Registration stays closed until they accept.`,
      { title: "Ask again?", confirmLabel: "Ask again" });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/terms/${b._id}/reset`, { method: "POST" });
      const cleared = { ...b, status: null, byName: null, at: null, seen: false };
      setRows((prev) => prev.map((x) => (x._id === b._id ? cleared : x)));
      setDetail(cleared);
      load();
    } catch (e) { showError(e.message); }
    finally { setBusy(false); }
  }

  const answered = rows.filter((b) => b.status).sort((a, b) => new Date(b.at) - new Date(a.at));
  const waiting = rows.filter((b) => !b.status);
  const all = data?.barangays || rows;
  const groups = [
    ["Declined", all.filter((b) => b.status === "declined")],
    ["Accepted", all.filter((b) => b.status === "accepted")],
    ["Waiting for an answer", all.filter((b) => !b.status)],
  ];

  return (
    <>
      <NotificationBell open={open} onOpenChange={onOpenChange} count={data?.unseen || 0} urgent={!!data?.unseenDeclined}
        title="Terms and conditions" className={className}
        footer={
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-muted-foreground">{waiting.length} waiting for an answer</span>
            <button onClick={() => { setOpen(false); setShowAll(true); }} className="font-medium text-primary hover:underline">
              See all barangays
            </button>
          </div>
        }>
        {!answered.length ? (
          <NotificationEmpty icon={<Inbox className="size-6" />}>
            No barangay has answered the terms yet.
          </NotificationEmpty>
        ) : (
          answered.map((b) => (
            <NotificationItem key={b._id} unread={!b.seen} icon={<StatusIcon status={b.status} />}
              title={headline(b)} text={b.status === "declined" ? "Registration is closed for this barangay." : "Registration is open for this barangay."}
              at={`${b.byName ? `${b.byName} · ` : ""}${notifWhen(b.at)}`} onClick={() => showDetail(b)} />
          ))
        )}
      </NotificationBell>

      {/* One barangay's answer */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          {detail && (
            <>
              <div className="flex items-start gap-3 pr-8">
                <StatusIcon status={detail.status} />
                <div className="min-w-0">
                  <DialogTitle className="text-[17px] leading-snug">{headline(detail)}</DialogTitle>
                  {detail.status && (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      {detail.byName ? `By ${detail.byName} · ` : ""}{notifWhen(detail.at)}
                    </p>
                  )}
                </div>
              </div>
              <DialogDescription className="text-[14px] leading-relaxed text-foreground">{explain(detail)}</DialogDescription>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
                {detail.status && (
                  <Button onClick={() => reset(detail)} disabled={busy}>
                    <RotateCcw className="size-3.5" /> Ask again
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Every barangay, grouped by answer */}
      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="border-b px-4 py-4 pr-12">
            <DialogTitle className="text-[17px]">Terms and conditions</DialogTitle>
            <DialogDescription className="mt-1 text-[13px]">
              Every barangay must accept the league terms before registering. Tap a barangay for details.
            </DialogDescription>
          </div>
          <div className="scrollbar-thin overflow-y-auto overscroll-contain pb-3">
            {groups.map(([label, list]) => list.length > 0 && (
              <section key={label}>
                <h3 className="px-4 pb-1 pt-4 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{label} · {list.length}</h3>
                {list.map((b) => (
                  <NotificationItem key={b._id} icon={<StatusIcon status={b.status} />} title={b.name}
                    text={b.status ? `${b.status === "declined" ? "Declined" : "Accepted"}${b.byName ? ` by ${b.byName}` : ""} · ${notifWhen(b.at)}`
                      : b.hasAdmin ? "Hasn't answered yet" : "No barangay admin account yet"}
                    onClick={() => showDetail(b)} />
                ))}
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
