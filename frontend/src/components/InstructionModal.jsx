import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Separator } from "./ui/separator";
import { INSTRUCTION_STEPS, ROLE_LABEL } from "../lib/instructionContent";
import { cn } from "../lib/utils";

const MAX_SHOTS_PER_STEP = 6;

// Probes `${basePath}-1.png`, `-2.png`, … and resolves to however many
// actually load, stopping at the first gap (see instructionContent.js — `n`
// must be contiguous from 1). Preloading with a bare Image() rather than
// rendering <img> tags directly means the gallery never flashes a broken-image
// icon while it figures out how many shots this step actually has.
function useStepImages(basePath) {
  const [images, setImages] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setImages([]);
    if (!basePath) { setReady(true); return; }

    (async () => {
      const found = [];
      for (let i = 1; i <= MAX_SHOTS_PER_STEP; i++) {
        const src = `${basePath}-${i}.png`;
        // Awaited in order (not Promise.all) — a gap in the numbering ends the
        // sequence, so each probe's result decides whether the next one runs.
        const ok = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = src;
        });
        if (cancelled) return;
        if (!ok) break;
        found.push(src);
      }
      if (!cancelled) { setImages(found); setReady(true); }
    })();

    return () => { cancelled = true; };
  }, [basePath]);

  return { images, ready };
}

// Right-hand side of the modal: the step's screenshot(s) — one or several,
// stepped through with arrows/dots — click to enlarge. Falls back to the
// step's icon when no numbered file exists yet in
// frontend/public/instructions/, so a step whose screenshots haven't been
// dropped in still looks intentional.
function StepShot({ basePath, icon: Icon, title }) {
  const { images, ready } = useStepImages(basePath);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);

  // New step (or its images just finished loading) — always start on the first shot.
  useEffect(() => { setIndex(0); }, [basePath, images.length]);

  if (!ready) {
    return <div className="aspect-video w-full rounded-lg border bg-muted/40 animate-pulse" />;
  }

  if (images.length === 0) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border bg-muted/40">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="size-10 text-primary" strokeWidth={1.6} />
        </div>
      </div>
    );
  }

  const multiple = images.length > 1;
  const go = (delta) => setIndex((i) => (i + delta + images.length) % images.length);

  return (
    <>
      <div className="w-full">
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border bg-background text-left shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Enlarge screenshot: ${title}`}
        >
          <img
            src={images[index]}
            alt={`${title}${multiple ? ` (${index + 1} of ${images.length})` : ""}`}
            className="block max-h-[60vh] w-full object-contain"
          />
          <span className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            <Expand className="size-3.5" /> Click to enlarge
          </span>
          {multiple && (
            <>
              <span
                role="button"
                tabIndex={0}
                aria-label="Previous screenshot"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); go(-1); } }}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/80"
              >
                <ChevronLeft className="size-4" />
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label="Next screenshot"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); go(1); } }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/80"
              >
                <ChevronRight className="size-4" />
              </span>
            </>
          )}
        </button>

        {multiple && (
          <div className="mt-2 flex items-center justify-center gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Screenshot ${i + 1} of ${images.length}`}
                onClick={() => setIndex(i)}
                className={cn("size-1.5 rounded-full transition", i === index ? "bg-primary w-4" : "bg-muted-foreground/30")}
              />
            ))}
          </div>
        )}
      </div>

      {/* Nested dialog: Radix layers it above the instruction modal, and
          Esc / outside-click closes only this one. */}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="w-auto max-w-[calc(100%-2rem)] gap-0 p-2 sm:max-w-[95vw]!">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div className="relative">
            <img src={images[index]} alt={title} className="max-h-[88vh] max-w-full rounded-lg object-contain" />
            {multiple && (
              <>
                <Button variant="ghost" size="icon-sm" onClick={() => go(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 text-white hover:bg-black/80 hover:text-white">
                  <ChevronLeft />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => go(1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 text-white hover:bg-black/80 hover:text-white">
                  <ChevronRight />
                </Button>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white">
                  {index + 1} / {images.length}
                </span>
              </>
            )}
          </div>
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
            <StepShot key={current.imageBase || step} basePath={current.imageBase} icon={current.icon} title={current.title} />
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
