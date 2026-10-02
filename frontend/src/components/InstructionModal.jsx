import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Expand, X } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Separator } from "./ui/separator";
import { Lightbox } from "./DocumentViewer";
import { INSTRUCTION_STEPS, ROLE_LABEL } from "../lib/instructionContent";
import { cn } from "../lib/utils";

// Right-hand side of the modal: every screenshot for the step at once, one large
// plus a thumbnail strip of all of them (click a thumbnail to show it large),
// and a click on the large one opens the zoomable Lightbox, which can also step
// through the step's screenshots. A step with no screenshots shows its icon.
function StepShots({ shots, icon: Icon, title }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);

  if (shots.length === 0) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border bg-muted/40 md:aspect-auto md:h-full">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="size-10 text-primary" strokeWidth={1.6} />
        </div>
      </div>
    );
  }

  const shot = shots[index];
  const many = shots.length > 1;
  const go = (d) => setIndex((i) => (i + d + shots.length) % shots.length);

  return (
    <div className="flex w-full flex-col gap-3 md:h-full md:min-h-0">
      {/* The large view. Its box has a fixed size (it fills the pane), so a tall or
          short screenshot never resizes the modal. */}
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="group relative aspect-video w-full cursor-zoom-in overflow-hidden rounded-lg border bg-background shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:aspect-auto md:min-h-0 md:flex-1"
        aria-label={`Zoom in: ${shot.caption}`}
      >
        <img
          key={shot.src}
          src={shot.src}
          alt={shot.caption}
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain animate-in fade-in-0 duration-200"
        />
        <span className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white">
          <Expand className="size-3.5" /> Zoom
        </span>
      </button>

      <p className="min-h-5 text-sm text-muted-foreground">
        {many && <span className="tabular-nums">{index + 1} of {shots.length} · </span>}
        {shot.caption}
      </p>

      {many && (
        <div className="scrollbar-thin -mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 pb-1">
          {shots.map((s, i) => (
            <button
              key={s.src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={s.caption}
              title={s.caption}
              className={cn(
                "relative h-16 w-28 shrink-0 overflow-hidden rounded-md border bg-background outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                i === index ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100"
              )}
            >
              <img src={s.src} alt="" decoding="async" className="h-full w-full object-cover object-top" />
            </button>
          ))}
        </div>
      )}

      {zoom && (
        <Lightbox
          src={shot.src}
          alt={title}
          caption={shot.caption}
          position={many ? `${index + 1} / ${shots.length}` : undefined}
          onPrev={many ? () => go(-1) : undefined}
          onNext={many ? () => go(1) : undefined}
          onClose={() => setZoom(false)}
        />
      )}
    </div>
  );
}

// First-login orientation, shown once automatically right after a forced
// password change (see ChangePassword.jsx) and reopenable any time from the
// "?" button in AdminLayout's header. No backend flag needed: tying it to
// the password-change flow already covers every freshly-provisioned account
// exactly once, and the header button covers "show it again."
//
// Wide two-pane layout: explanation on the left, the step's screenshots on the
// right. The modal has a FIXED height (Sep 2026): it used to size itself to the
// current step, so every Next resized it and, being centred, it jumped up and
// down. Every screenshot for the role is preloaded on open so switching steps
// doesn't flash an empty box either.
export default function InstructionModal({ role, onClose }) {
  const [step, setStep] = useState(0);
  const steps = INSTRUCTION_STEPS[role] || [];

  useEffect(() => {
    steps.forEach((s) => s.shots.forEach(({ src }) => { const img = new Image(); img.src = src; }));
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (steps.length === 0) return null;

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl! md:h-[min(92dvh,760px)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              How this works: {ROLE_LABEL[role] || role}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Step {step + 1} of {steps.length}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        <Separator />

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[2fr_3fr] md:overflow-hidden">
          {/* Left: explanation + step list */}
          <div className="scrollbar-thin flex flex-col gap-4 px-6 py-5 md:min-h-0 md:overflow-y-auto">
            <div>
              <DialogTitle className="text-xl leading-snug font-semibold">{current.title}</DialogTitle>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.description}</p>
            </div>

            {/* On a phone the list would push the screenshots far down; Next/Back do the job. */}
            <Separator className="hidden md:block" />

            <ol className="hidden space-y-0.5 md:block">
              {steps.map((s, i) => (
                <li key={s.title}>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition",
                      i === step
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                        i === step ? "bg-primary text-primary-foreground" : "bg-muted"
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="truncate">{s.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          {/* Right: screenshots. Keyed by step so each step starts on its first shot. */}
          <div className="border-t bg-muted/30 px-6 py-5 md:min-h-0 md:border-t-0 md:border-l">
            <StepShots key={step} shots={current.shots} icon={current.icon} title={current.title} />
          </div>
        </div>

        <Separator />
        <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft /> Back
            </Button>
          )}
          {!last ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Next <ArrowRight />
            </Button>
          ) : (
            <Button onClick={onClose}>Got it, let's go</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
