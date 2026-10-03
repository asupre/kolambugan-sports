import { MapPin } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { cn } from "../lib/utils";
import { WHEN_W, fmtDay, fmtTime, hasTime } from "../lib/dashboardFormat";

// Bits shared by the Barangay Admin and Organizer dashboards.

// Color on the ICON ONLY — same rule as the Super Admin dashboard (a colored
// border per tile read as decoration, not status).
const TONE_ICON = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  green: "bg-green-500/10 text-green-600 dark:text-green-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

// The number never clips (Sep 2026 fix). On a ~360px phone the 2-column grid left the
// text beside the icon ~74px, "893/1084" (no wrap point) needed ~100px, and the Card's
// overflow-hidden cut the last digit. Now: below `sm` the icon sits ABOVE the text, so
// the text gets the tile's full width; and the number's font-size is capped by its own
// box (`@container` + cqi units) — normal 20/24px, shrinking only when a long value
// like "1234/5678" wouldn't otherwise fit. 0.64em per character is a safe upper bound
// for Inter semibold tabular digits (the slash is narrower).
function fitFontSize(value) {
  const len = Math.max(String(value ?? "").length, 1);
  return `min(var(--stat-size), calc(100cqi / ${(len * 0.64).toFixed(2)}))`;
}

export function StatTile({ label, value, sub, Icon, tone, loading }) {
  return (
    <Card data-stat-tile>
      <CardContent className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div data-stat-icon className={cn("flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-lg", TONE_ICON[tone] || "bg-muted text-muted-foreground")}>
          <Icon className="size-5" />
        </div>
        <div className="@container w-full min-w-0 sm:flex-1">
          <p data-stat-label className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide leading-tight">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-12" />
          ) : (
            <p
              className="[--stat-size:1.25rem] sm:[--stat-size:1.5rem] font-semibold leading-tight tabular-nums whitespace-nowrap"
              style={{ fontSize: fitFontSize(value) }}
            >
              {value}
            </p>
          )}
          {sub && <p data-stat-sub className="text-muted-foreground text-xs leading-snug">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// The left block of a match row: the day and (if set) the time.
export function WhenBlock({ schedule }) {
  if (!schedule) {
    return <div className={`${WHEN_W} shrink-0 text-xs text-muted-foreground leading-tight`}>Date to be announced</div>;
  }
  return (
    <div className={`${WHEN_W} shrink-0 leading-tight`}>
      <p className="text-sm font-semibold">{fmtDay(schedule).replace(",", "")}</p>
      {hasTime(schedule) && <p className="text-xs text-muted-foreground">{fmtTime(schedule)}</p>}
    </div>
  );
}

export function VenueLine({ venue }) {
  if (!venue) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <MapPin className="size-3 shrink-0" /> <span className="truncate">{venue}</span>
    </p>
  );
}

export function Empty({ children }) {
  return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
