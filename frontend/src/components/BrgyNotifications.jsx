// Barangay Admin notifications bell (Nov 2026): season updates (new season, registration open,
// verification, tournament started, completed, moved back), written by the server whenever the
// Super Admin changes the season (backend/src/lib/notify.js). The count is what's new since the
// bell was last opened; opening it marks everything read (POST /api/notifications/seen).
// Tapping a notification goes to the page it's about.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CalendarClock, ChevronRight } from "lucide-react";
import { api } from "../api";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { cn } from "../lib/utils";

const when = (d) => new Date(d).toLocaleString("en-PH", {
  timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
});

// Same colours as the season stage pill.
const STAGE_TONE = {
  setup: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  registration_open: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  verification: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ongoing: "bg-green-500/15 text-green-700 dark:text-green-400",
  completed: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

export default function BrgyNotifications({ className }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);   // as they were when opened (keeps the "New" marks)

  async function load() {
    try { const d = await api("/api/notifications"); setData(d); return d; } catch { return null; }
  }
  useEffect(() => { load(); }, []);

  async function openPanel() {
    setOpen(true);
    const d = (await load()) || data;
    setRows(d?.notifications || []);
    if (d?.unread) {
      api("/api/notifications/seen", { method: "POST" }).then(() => setData((x) => x && { ...x, unread: 0 })).catch(() => {});
    }
  }

  function go(n) {
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  const count = data?.unread || 0;
  return (
    <>
      <button onClick={openPanel} aria-label={count ? `Notifications, ${count} new` : "Notifications"} title="Notifications"
        className={cn("relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-accent-foreground", className)}>
        <Bell className="size-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-none text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="border-b px-4 py-4 pr-12">
            <DialogTitle className="text-[17px]">Notifications</DialogTitle>
            <DialogDescription className="mt-1 text-[13px]">
              Season updates from the SK Federation: registration, verification, games and more.
            </DialogDescription>
          </div>
          <div className="scrollbar-thin overflow-y-auto overscroll-contain">
            {!rows.length ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                <CalendarClock className="size-6" />
                No updates yet. You'll be notified here when the season moves on.
              </div>
            ) : (
              <ul className="divide-y">
                {rows.map((n) => (
                  <li key={n._id}>
                    <button onClick={() => go(n)}
                      className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-accent/60", n.unread && "bg-primary/5")}>
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.unread ? "bg-red-600" : "bg-transparent")} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[15px] font-medium">{n.title}</span>
                          {n.unread && (
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STAGE_TONE[n.stage] || "bg-primary/15 text-primary")}>New</span>
                          )}
                        </span>
                        {n.body && <span className="mt-0.5 block text-[14px] text-muted-foreground">{n.body}</span>}
                        <span className="mt-1 block text-[12px] text-muted-foreground">{when(n.at)}</span>
                      </span>
                      {n.link && <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
