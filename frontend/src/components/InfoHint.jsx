import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";

// A one-sentence summary that's always visible, plus a small "Details" trigger
// that reveals the full explanation in a popover — for a CardDescription/paragraph
// that used to sit on the page permanently as 3-4 sentences. Keep the summary to
// one real sentence; put the rest (mechanics, edge cases, "why") in children.
// Not for safety-critical warnings right before a destructive action — those stay
// fully visible; see AdvanceDialog in Season.jsx for that pattern instead.
export default function InfoHint({ summary, children, className, label = "Details" }) {
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-1", className)}>
      <span>{summary}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 translate-y-0.5 items-center gap-0.5 text-xs font-medium text-primary hover:underline"
          >
            <Info className="size-3" /> {label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-w-[85vw] text-xs leading-relaxed text-foreground" align="start">
          {children}
        </PopoverContent>
      </Popover>
    </span>
  );
}
