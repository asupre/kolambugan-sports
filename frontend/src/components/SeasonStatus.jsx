import { Check } from "lucide-react";
import { SEASON_STAGES } from "../lib/season";
import { cn } from "../lib/utils";

// One color per stage — the header pill and the tracker read the same way.
const TONE = {
  setup: { pill: "bg-slate-500/15 text-slate-600 dark:text-slate-300", dot: "bg-slate-400", ring: "border-slate-400 bg-slate-400/15" },
  registration_open: { pill: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dot: "bg-blue-500", ring: "border-blue-500 bg-blue-500/15" },
  verification: { pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dot: "bg-amber-500", ring: "border-amber-500 bg-amber-500/15" },
  ongoing: { pill: "bg-green-500/15 text-green-600 dark:text-green-400", dot: "bg-green-500", ring: "border-green-500 bg-green-500/15" },
  completed: { pill: "bg-slate-500/15 text-slate-600 dark:text-slate-300", dot: "bg-slate-400", ring: "border-slate-400 bg-slate-400/15" },
};

// What the current stage means for the person reading — in plain words, because
// the raw state name ("registration_open") tells a barangay admin nothing about
// what they should be doing right now.
const GUIDE = {
  // The Super Admin drives the season, so this says what to do to move it along.
  super_admin: {
    setup: "Set up the season: upload the reference list, provision accounts, then advance to open registration.",
    registration_open: "Barangays are registering teams. When enough rosters are in, advance to Verification.",
    verification: "Review submitted rosters in the Review Queue. Once every team is verified, generate the brackets and advance to Ongoing.",
    ongoing: "Matches are underway. Keep brackets scheduled and results moving; advance to Completed when the champions are decided.",
    completed: "The season has ended. Results and champions are final.",
  },
  barangay_admin: {
    setup: "The league is still being set up. Registration hasn't opened yet. You'll be able to add teams and players once it does.",
    registration_open: "Registration is open. Add your players, then submit each roster before registration closes. A roster locks once it's submitted.",
    verification: "The SK Federation is verifying rosters. Watch for flagged players and send any documents you're asked for. Verified teams are locked.",
    ongoing: "The league is underway and rosters are final. Follow your matches on the Matches tab.",
    completed: "This season has ended. Final results are in the champions archive.",
  },
  organizer: {
    setup: "The league is being set up. There's nothing to score yet.",
    registration_open: "Barangays are still registering teams. Brackets are drawn after verification, so there's nothing to score yet.",
    verification: "Rosters are being verified. Once the Super Admin draws the brackets, your matches will appear here.",
    ongoing: "Matches are being played. Start each match courtside and record the score. Winners advance automatically.",
    completed: "This season has ended. All results are final.",
  },
};

// A small pill — "● Registration open" — for the admin header.
export function SeasonBadge({ status, name, className }) {
  const stage = SEASON_STAGES.find((s) => s.key === status);
  if (!stage) return null;
  const tone = TONE[status];
  return (
    <span
      title={name ? `${name} — ${stage.short}` : stage.short}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap", tone.pill, className)}
    >
      <span className={cn("size-1.5 rounded-full", tone.dot)} />
      {stage.short}
    </span>
  );
}

// The five stages as a segmented bar with the current one marked, plus what it
// means for this role. Finished stages get a check; upcoming ones stay muted.
export function SeasonTracker({ status, role, name }) {
  const at = SEASON_STAGES.findIndex((s) => s.key === status);
  if (at < 0) return null;
  const stage = SEASON_STAGES[at];
  return (
    <div className="space-y-3">
      {/* The stage itself is shown by the header pill and the highlighted step
          below, so this just names the season (no third copy of the badge). */}
      {name && <p className="text-sm font-semibold">{name}</p>}

      {/* Segmented bar (Oct 2026): one thick segment per stage, solid green up to the current one,
          which is a lighter green with a ring and a "Now" tag. Phones show only the bar, plus the
          "Step N of 5" line below (five labels don't fit). */}
      <ol className="grid grid-cols-5 gap-1.5 sm:gap-2" aria-label="Season stages">
        {SEASON_STAGES.map((s, i) => {
          const done = i < at;
          const current = i === at;
          return (
            <li key={s.key} aria-current={current ? "step" : undefined} className="min-w-0">
              <div
                className={cn(
                  "h-2.5 rounded-full",
                  done && "bg-primary",
                  current && "bg-primary/45 ring-2 ring-primary ring-offset-2 ring-offset-card",
                  !done && !current && "bg-muted"
                )}
              />
              <p className={cn(
                "mt-2.5 hidden items-center gap-1 truncate text-[13px] leading-tight sm:flex",
                current ? "font-semibold text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/60"
              )}>
                {done && <Check className="size-3.5 shrink-0 text-primary" strokeWidth={2.5} />}
                <span className="truncate">{s.label}</span>
              </p>
              {current && (
                <span className="mt-1 hidden w-fit rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary sm:inline-block">
                  Now
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-[13px] font-semibold sm:hidden">
        Step {at + 1} of {SEASON_STAGES.length} · {stage.label}
      </p>

      <p className="text-sm text-muted-foreground">{GUIDE[role]?.[status] || stage.short}</p>
    </div>
  );
}
