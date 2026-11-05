// Barangay Admin notifications bell (Nov 2026): season updates (new season, registration open,
// verification, tournament started, completed, moved back), written by the server whenever the
// Super Admin changes the season (backend/src/lib/notify.js). The bell opens a regular dropdown
// (NotificationBell); opening it marks everything read (POST /api/notifications/seen). Tapping a
// notification opens a pop-up with the whole message and a button to the page it's about.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, Megaphone } from "lucide-react";
import { api } from "../api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { NotificationBell, NotificationEmpty, NotificationItem, notifWhen } from "./NotificationBell";
import { cn } from "../lib/utils";

// Same colours as the season stage pill.
const STAGE_TONE = {
  setup: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  registration_open: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  verification: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ongoing: "bg-green-500/15 text-green-700 dark:text-green-400",
  completed: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};
const STAGE_LABEL = {
  setup: "Setup", registration_open: "Registration", verification: "Verification", ongoing: "Ongoing", completed: "Completed",
};
const LINK_LABEL = {
  "/brgy": "Open My Teams", "/brgy/documents": "Open Verification Status", "/brgy/matches": "Open Matches", "/brgy/dashboard": "Open Dashboard",
};

export default function BrgyNotifications({ className }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);       // as they were when opened (keeps the "new" dots)
  const [detail, setDetail] = useState(null); // the notification shown in the pop-up

  async function load() {
    try { const d = await api("/api/notifications"); setData(d); return d; } catch { return null; }
  }
  // Re-check every minute while the tab is visible, so an update arrives without reloading.
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    return () => clearInterval(timer);
  }, []);

  async function onOpenChange(next) {
    setOpen(next);
    if (!next) return;
    setRows(data?.notifications || []);
    const d = (await load()) || data;
    setRows(d?.notifications || []);
    if (d?.unread) {
      api("/api/notifications/seen", { method: "POST" }).then(() => setData((x) => x && { ...x, unread: 0 })).catch(() => {});
    }
  }

  function showDetail(n) {
    setOpen(false);
    setDetail(n);
  }

  function go(n) {
    setDetail(null);
    if (n.link) navigate(n.link);
  }

  const icon = (n) => (
    <span className={cn("flex size-8 items-center justify-center rounded-full", STAGE_TONE[n.stage] || "bg-primary/15 text-primary")}>
      <Megaphone className="size-4" />
    </span>
  );

  return (
    <>
      <NotificationBell open={open} onOpenChange={onOpenChange} count={data?.unread || 0} urgent title="Notifications" className={className}>
        {!rows.length ? (
          <NotificationEmpty icon={<CalendarClock className="size-6" />}>
            No updates yet. You'll be notified here when the season moves on.
          </NotificationEmpty>
        ) : (
          rows.map((n) => (
            <NotificationItem key={n._id} unread={n.unread} icon={icon(n)} title={n.title} text={n.body}
              at={notifWhen(n.at)} onClick={() => showDetail(n)} />
          ))
        )}
      </NotificationBell>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          {detail && (
            <>
              <div className="flex items-start gap-3 pr-8">
                {icon(detail)}
                <div className="min-w-0">
                  <DialogTitle className="text-[17px] leading-snug">{detail.title}</DialogTitle>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                    {detail.stage && (
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STAGE_TONE[detail.stage])}>
                        {STAGE_LABEL[detail.stage]}
                      </span>
                    )}
                    {notifWhen(detail.at)}
                  </p>
                </div>
              </div>
              <DialogDescription className="text-[14px] leading-relaxed text-foreground">{detail.body}</DialogDescription>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
                {detail.link && (
                  <Button onClick={() => go(detail)}>{LINK_LABEL[detail.link] || "Open"} <ArrowRight className="size-4" /></Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
