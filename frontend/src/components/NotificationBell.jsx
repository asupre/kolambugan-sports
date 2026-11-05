// The shared notifications bell + dropdown (Nov 2026). Behaves like a regular notification menu:
// the bell opens a small panel under it (Radix Popover), and only tapping one notification opens
// a pop-up with its details (each bell renders its own Dialog for that). Used by
// BrgyNotifications (barangay admin: season updates) and TermsNotifications (Super Admin: terms
// answers). `onOpen` runs as the panel opens (refresh + mark as read).
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";

export function NotificationBell({ open, onOpenChange, count = 0, urgent = false, title, children, footer, className }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button aria-label={count ? `Notifications, ${count} new` : "Notifications"} title="Notifications"
          className={cn("relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground", className)}>
          <Bell className="size-4" />
          {count > 0 && (
            <span className={cn("absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold leading-none text-white",
              urgent ? "bg-red-600" : "bg-primary")}>
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} collisionPadding={12}
        className="w-[min(23rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-[15px] font-semibold">{title}</p>
        </div>
        <div className="scrollbar-thin max-h-[min(26rem,60dvh)] overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="border-t px-4 py-2.5">{footer}</div>}
      </PopoverContent>
    </Popover>
  );
}

// One row in the dropdown. `unread` adds the dot + tint; the row is a button that opens the detail.
export function NotificationItem({ unread, icon, title, text, at, onClick }) {
  return (
    <button onClick={onClick}
      className={cn("flex w-full items-start gap-3 border-b px-4 py-3 text-left transition last:border-0 hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none", unread && "bg-primary/5")}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium leading-snug">{title}</span>
        {text && <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted-foreground">{text}</span>}
        {at && <span className="mt-1 block text-[12px] text-muted-foreground">{at}</span>}
      </span>
      {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-red-600" aria-label="New" />}
    </button>
  );
}

export function NotificationEmpty({ icon, children }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[13px] text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}

export const notifWhen = (d) => (d ? new Date(d).toLocaleString("en-PH", {
  timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}) : "");
