import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Popover as PopoverPrimitive } from "radix-ui";
import { PlayerAvatar } from "./PublicUI";
import { cn } from "../lib/utils";

// The MVP chip on a finished bracket match (Oct 2026). The organizer names the MVP on the
// after-match score sheet; this shows it. Hover (mouse) or tap (touch) opens a small card with
// the player: same idea as InfoHint's "Details" popover, but coloured like the bracket it sits
// on: the public site's yellow accent (`tone="public"`) or the admin's gold (`tone="admin"`).
//
// `mvp` comes in two shapes: the public /bracket one ({ id, firstName, lastName, jerseyNumber,
// hasPhoto, teamId, teamName, points }) and the admin populate ({ _id, firstName, lastName,
// jerseyNumber }). Missing fields are simply not shown.

// Inline SVG, like the rest of the public site (no lucide-react there).
export function StarIcon({ className = "size-3" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`fill-current ${className}`}>
      <path d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95L12 2.5z" />
    </svg>
  );
}

const TONE = {
  public: {
    chip: "border-[#FACC15]/40 bg-[#FACC15]/10 text-[#FACC15] hover:bg-[#FACC15]/20 focus-visible:outline-[#FACC15]/60",
    card: "border border-white/[0.12] bg-[#122036] text-slate-100 shadow-xl shadow-black/40",
    label: "text-[#FACC15]",
    sub: "text-slate-400",
    link: "text-[#FACC15]",
  },
  admin: {
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 focus-visible:outline-amber-500/60",
    card: "border border-border bg-popover text-popover-foreground shadow-md",
    label: "text-amber-700 dark:text-amber-400",
    sub: "text-muted-foreground",
    link: "text-primary",
  },
};

export default function MvpBadge({ mvp, tone = "public", className }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  if (!mvp) return null;

  const t = TONE[tone] || TONE.public;
  const id = mvp.id || mvp._id;
  const name = `${mvp.firstName || ""} ${mvp.lastName || ""}`.trim() || "Unnamed player";

  // Mouse: open on hover, close shortly after leaving the chip AND the card (the gap
  // between them would otherwise close it). Touch has no hover; a tap toggles instead.
  const enter = (e) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = (e) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          onPointerEnter={enter}
          onPointerLeave={leave}
          aria-label={`Match MVP: ${name}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition focus-visible:outline-2",
            t.chip, className
          )}
        >
          <StarIcon /> MVP
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onPointerEnter={enter}
          onPointerLeave={leave}
          // Hover-opened: don't pull focus off the page (and don't pop a phone keyboard).
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn("z-(--z-overlay) w-64 max-w-[85vw] rounded-xl p-3 outline-none", t.card)}
        >
          <div className="flex items-center gap-3">
            {tone === "public" && id && (
              <PlayerAvatar player={{ id, firstName: mvp.firstName, lastName: mvp.lastName, hasPhoto: mvp.hasPhoto }} size={44} />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn("flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide", t.label)}>
                <StarIcon /> Match MVP
              </p>
              <p className="mt-0.5 truncate text-[15px] font-semibold leading-tight">
                {mvp.jerseyNumber != null && mvp.jerseyNumber !== "" && <span className="tabular-nums">#{mvp.jerseyNumber} </span>}
                {name}
              </p>
              {(mvp.teamName || mvp.points != null) && (
                <p className={cn("truncate text-[13px]", t.sub)}>
                  {[mvp.teamName, mvp.points != null ? `${mvp.points} PTS` : null].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
          {tone === "public" && mvp.teamId && (
            <Link
              to={`/teams/${mvp.teamId}?player=${id}`}
              onClick={() => setOpen(false)}
              className={cn("mt-2.5 inline-block text-[13px] font-medium hover:underline", t.link)}
            >
              Season stats →
            </Link>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
