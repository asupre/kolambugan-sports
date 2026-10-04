import { Check } from "lucide-react";
import { SEASON_STAGES } from "../lib/season";
import { cn } from "../lib/utils";

// One color per stage — the header pill and the tracker read the same way.
const TONE = {
  setup: { pill: "bg-slate-500/15 text-slate-600 dark:text-slate-300", dot: "bg-slate-400", ring: "border-slate-400 bg-slate-400/15", glow: "shadow-[0_0_12px_2px_rgba(148,163,184,0.55)]" },
  registration_open: { pill: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dot: "bg-blue-500", ring: "border-blue-500 bg-blue-500/15", glow: "shadow-[0_0_12px_2px_rgba(59,130,246,0.55)]" },
  verification: { pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dot: "bg-amber-500", ring: "border-amber-500 bg-amber-500/15", glow: "shadow-[0_0_12px_2px_rgba(245,158,11,0.6)]" },
  ongoing: { pill: "bg-green-500/15 text-green-600 dark:text-green-400", dot: "bg-green-500", ring: "border-green-500 bg-green-500/15", glow: "shadow-[0_0_12px_2px_rgba(34,197,94,0.6)]" },
  completed: { pill: "bg-slate-500/15 text-slate-600 dark:text-slate-300", dot: "bg-slate-400", ring: "border-slate-400 bg-slate-400/15", glow: "shadow-[0_0_12px_2px_rgba(148,163,184,0.55)]" },
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

// Glow (Oct 2026, "can it be glowy"): finished steps and the line through them glow in the brand
// green; the current step glows in its stage colour (TONE[...].glow). Box-shadows only, no blur filter.
// A BRIGHT green glow (not the dark brand green, which vanished on the Season card's picture).
const GLOW_DOT = "shadow-[0_0_10px_2px_rgba(74,222,128,0.75)]";
const GLOW_LINE = "bg-[#4ADE80] shadow-[0_0_8px_2px_rgba(74,222,128,0.7)]";

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

// The five stages as a row of steps with the current one marked, plus what it
// means for this role. Finished stages get a check; upcoming ones stay muted.
// onPicture: drawn over the Season card's banner picture, so circles get a solid fill and the
// labels / guide line turn white (muted grey text was unreadable on a photo).
export function SeasonTracker({ status, role, name, onPicture = false }) {
  const at = SEASON_STAGES.findIndex((s) => s.key === status);
  if (at < 0) return null;
  const stage = SEASON_STAGES[at];
  return (
    <div className="space-y-3">
      {/* The stage itself is shown by the header pill and the highlighted step
          below, so this just names the season (no third copy of the badge). */}
      {name && <p className="text-sm font-semibold">{name}</p>}

      <ol className="flex items-start" aria-label="Season stages">
        {SEASON_STAGES.map((s, i) => {
          const done = i < at;
          const current = i === at;
          return (
            <li key={s.key} className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
              {/* connector to the previous step */}
              {i > 0 && (
                <span className={cn("absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2", i <= at ? GLOW_LINE : (onPicture ? "bg-white/45" : "bg-border"))} />
              )}
              <span
                aria-current={current ? "step" : undefined}
                className={cn(
                  "relative z-10 flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold",
                  done && cn("border-primary bg-primary text-primary-foreground", GLOW_DOT),
                  current && cn("text-foreground", TONE[status].ring, TONE[status].glow, onPicture && "bg-white text-slate-800"),
                  !done && !current && (onPicture ? "border-white/60 bg-white/90 text-slate-500" : "border-border bg-card text-muted-foreground")
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              {/* Phones: five labels don't fit (they ran together, "RegistrationVerification"), so
                  only the circles show there and one "Step N of 5" line follows the tracker. */}
              <span className={cn("hidden text-xs leading-tight sm:block", onPicture ? (current ? "font-semibold text-white" : "text-white/80") : current ? "font-semibold text-foreground" : "text-muted-foreground",
                onPicture && "[text-shadow:0_1px_6px_rgba(0,0,0,0.5)]")}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={cn("text-[13px] font-semibold sm:hidden", onPicture && "text-white")}>
        Step {at + 1} of {SEASON_STAGES.length} · {stage.label}
      </p>

      <p className={cn("text-sm", onPicture ? "text-white/90 [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]" : "text-muted-foreground")}>{GUIDE[role]?.[status] || stage.short}</p>
    </div>
  );
}
