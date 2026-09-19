import { useState } from "react";
import { ArrowLeft, ArrowRight, Expand, X } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Separator } from "./ui/separator";
import { INSTRUCTION_STEPS, ROLE_LABEL } from "../lib/instructionContent";
import { cn } from "../lib/utils";

// Right-hand side of the modal: the step's screenshot, click to enlarge.
// Falls back to the step's icon when the image file isn't in
// frontend/public/instructions/ yet (or fails to load), so a step whose
// screenshot hasn't been dropped in still looks intentional. Keyed by `src`
// at the call site so the failed flag resets when the step changes.
function StepShot({ src, icon: Icon, title }) {
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border bg-muted/40">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="size-10 text-primary" strokeWidth={1.6} />
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border bg-background text-left shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Enlarge screenshot: ${title}`}
      >
        <img
          src={src}
          alt={title}
          onError={() => setFailed(true)}
          className="block max-h-[60vh] w-full object-contain"
        />
        <span className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <Expand className="size-3.5" /> Click to enlarge
        </span>
      </button>

      {/* Nested dialog: Radix layers it above the instruction modal, and
          Esc / outside-click closes only this one. */}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="w-auto max-w-[calc(100%-2rem)] gap-0 p-2 sm:max-w-[95vw]!">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <img src={src} alt={title} className="max-h-[88vh] max-w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

// First-login orientation, shown once automatically right after a forced
// password change (see ChangePassword.jsx) and reopenable any time from the
// "?" button in AdminLayout's header. No backend flag needed: tying it to
// the password-change flow already covers every freshly-provisioned account
// exactly once, and the header button covers "show it again."
//
// Wide two-pane layout (Sep 2026): explanation on the left, the step's
// screenshot on the right.
export default function InstructionModal({ role, onClose }) {
  const [step, setStep] = useState(0);
  const steps = INSTRUCTION_STEPS[role] || [];
  if (steps.length === 0) return null;

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl!"
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              How this works — {ROLE_LABEL[role] || role}
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

        <div className="grid min-h-0 flex-1 auto-rows-max overflow-y-auto md:auto-rows-auto md:grid-cols-[2fr_3fr] md:overflow-hidden">
          {/* Left: explanation + step list */}
          <div className="flex flex-col gap-4 px-6 py-5 md:min-h-0 md:overflow-y-auto">
            <div>
              <DialogTitle className="text-xl leading-snug font-semibold">{current.title}</DialogTitle>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.description}</p>
            </div>

            <Separator />

            <ol className="space-y-0.5">
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

          {/* Right: screenshot */}
          <div className="flex items-center border-t bg-muted/30 px-6 py-5 md:border-t-0 md:border-l">
            <StepShot key={current.image || step} src={current.image} icon={current.icon} title={current.title} />
          </div>
        </div>

        <Separator />
        <div className="flex items-center justify-end gap-2 px-6 py-4">
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
            <Button onClick={onClose}>Got it — let's go</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
