// The league terms pop-up for every Barangay Admin (Nov 2026). Rendered by AdminLayout for
// the barangay_admin role: it asks the server whether this account still has to answer
// (GET /api/terms/mine) and, if so, opens a dialog that can't be closed without choosing
// Accept or Decline. Decline asks for confirmation first, since only the SK Federation can
// ask again. Two pages: 1 = the terms, 2 = the barangays currently allowed to field players
// from other barangays (League Setup tick), with Accept / Decline. Text: lib/crossTerms.js.
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { api } from "../api";
import { useConfirm } from "./ConfirmDialog";
import { useErrorDialog } from "./ErrorDialog";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { cn } from "../lib/utils";
import {
  CROSS_TERMS, CROSS_TERMS_DECLINE_NOTE, CROSS_TERMS_EVENT, CROSS_TERMS_INTRO, CROSS_TERMS_PAGE2_INTRO, CROSS_TERMS_PAGE2_NOTE, CROSS_TERMS_TITLE,
} from "../lib/crossTerms";

export default function CrossTermsDialog({ onOpenChange }) {
  const confirm = useConfirm();
  const showError = useErrorDialog();
  const [info, setInfo] = useState(null);   // { required, barangayName }
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);   // 1 = the terms, 2 = barangays allowed cross-barangay + answer
  const scrollRef = useRef(null);
  const open = !!info?.required;

  useEffect(() => {
    let alive = true;
    api("/api/terms/mine").then((d) => { if (alive) setInfo(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

  async function answer(accept) {
    if (!accept) {
      const ok = await confirm(CROSS_TERMS_DECLINE_NOTE, {
        title: "Decline the terms?", confirmLabel: "Decline", danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const d = await api("/api/terms/mine", { method: "POST", body: JSON.stringify({ accept }) });
      setInfo({ ...info, required: false, status: d.status });
      window.dispatchEvent(new CustomEvent(CROSS_TERMS_EVENT, { detail: d.status }));
      if (!accept) await confirm(d.message, { alertOnly: true, title: "Terms declined" });
    } catch (e) {
      showError(e.message);
      // Already answered elsewhere (another tab): stop asking.
      if (/already/.test(e.message || "")) setInfo({ ...info, required: false });
    } finally {
      setBusy(false);
    }
  }

  function goTo(p) {
    setPage(p);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  const cross = info?.crossBarangays || [];
  const mine = info?.barangayName;
  const mineAllowed = !!info?.allowsCrossBarangay;
  const block = (e) => e.preventDefault();
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} onPointerDownOutside={block} onEscapeKeyDown={block}
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="border-b px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ScrollText className="size-[18px]" />
            </span>
            <DialogTitle className="min-w-0 flex-1 text-[17px] leading-snug">{CROSS_TERMS_TITLE}</DialogTitle>
            <span className="shrink-0 text-[13px] text-muted-foreground">Page {page} of 2</span>
          </div>
          <DialogDescription className="mt-2 text-[14px]">
            {page === 1
              ? <>{mine ? `Barangay ${mine}. ` : ""}{CROSS_TERMS_INTRO}</>
              : CROSS_TERMS_PAGE2_INTRO}
          </DialogDescription>
        </div>

        <div ref={scrollRef} className="scrollbar-thin overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          {page === 1 ? (
            <ol className="list-decimal space-y-2.5 pl-5 text-[14px] leading-relaxed">
              {CROSS_TERMS.map((t, i) => <li key={i}>{t}</li>)}
            </ol>
          ) : (
            <>
              <p className={cn("rounded-lg px-3 py-2.5 text-[14px]",
                mineAllowed ? "bg-green-500/10 text-green-800 dark:text-green-300" : "bg-muted text-foreground")}>
                {mineAllowed
                  ? `${mine} is on this list, so your teams may field players from other barangays of Kolambugan.`
                  : `${mine || "Your barangay"} is not on this list, so your teams may field only residents of ${mine || "your barangay"}.`}
              </p>
              <h3 className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                Allowed to take players from other barangays · {cross.length}
              </h3>
              {cross.length ? (
                <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {cross.map((name) => (
                    <li key={name} className={cn("flex items-center gap-2 rounded-md border px-3 py-1.5 text-[14px]",
                      name === mine && "border-green-500/40 bg-green-500/5 font-medium")}>
                      <Check className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
                      <span className="min-w-0 truncate">{name}</span>
                      {name === mine && <span className="ml-auto shrink-0 text-[12px] text-green-700 dark:text-green-400">You</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[14px] text-muted-foreground">
                  No barangay is allowed to take players from other barangays this season.
                </p>
              )}
              <p className="mt-3 text-[13px] text-muted-foreground">{CROSS_TERMS_PAGE2_NOTE}</p>
              <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-800 dark:text-amber-300">
                {CROSS_TERMS_DECLINE_NOTE}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          {page === 1 ? (
            <Button onClick={() => goTo(2)}>Next <ChevronRight className="size-4" /></Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => goTo(1)} disabled={busy} className="sm:mr-auto">
                <ChevronLeft className="size-4" /> Back
              </Button>
              <Button variant="outline" onClick={() => answer(false)} disabled={busy}>Decline</Button>
              <Button onClick={() => answer(true)} disabled={busy}>{busy ? "Saving…" : "I accept the terms"}</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
