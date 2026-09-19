import { useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { INSTRUCTION_STEPS, ROLE_LABEL } from "../lib/instructionContent";
import { cn } from "../lib/utils";

// Text + icon, not a screenshot (Sep 2026 — see instructionContent.js for
// why): a big soft-tinted icon standing in for what a screenshot used to
// show. An icon can't go stale the way a screenshot of a page that keeps
// getting redesigned does.
function StepIcon({ icon: Icon }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-lg border bg-muted/40">
      <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/10">
        <Icon className="size-10 text-primary" strokeWidth={1.6} />
      </div>
    </div>
  );
}

// First-login orientation, shown once automatically right after a forced
// password change (see ChangePassword.jsx) and reopenable any time from the
// "?" button in AdminLayout's header. No backend flag needed: tying it to
// the password-change flow already covers every freshly-provisioned account
// exactly once, and the header button covers "show it again."
export default function InstructionModal({ role, onClose }) {
  const [step, setStep] = useState(0);
  const steps = INSTRUCTION_STEPS[role] || [];
  if (steps.length === 0) return null;

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-xl! p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
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

        <div className="space-y-4 px-6 py-5">
          <StepIcon icon={current.icon} />
          <div>
            <h2 className="text-lg font-semibold">{current.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{current.description}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 w-6 rounded-full transition", i === step ? "bg-primary" : "bg-muted")}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
