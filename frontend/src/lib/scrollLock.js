import { useEffect } from "react";

// Page scroll lock while a dialog / sheet / phone menu is open (Oct 2026 bug: with the
// non-modal dialogs, the page behind a popup still scrolled). Deliberately cheap, unlike
// Radix's modal mode (which also aria-hides the page and sets pointer-events on <body>,
// see components/ui/dialog.jsx): one overflow:hidden on <html>, with the scrollbar's width
// put back as padding so the page doesn't jump sideways. Counted, so a dialog opened over
// another keeps the lock until the last one closes.
//
// The public site scrolls through Lenis, which drives window.scrollTo itself and would
// ignore overflow:hidden; PublicLayout registers its instance here so it can be paused.

let locks = 0;
let saved = null;
let lenis = null;

export function registerLenis(instance) {
  lenis = instance;
  if (lenis && locks > 0) lenis.stop();
}

function lock() {
  locks += 1;
  if (locks > 1) return;
  const html = document.documentElement;
  const gap = window.innerWidth - html.clientWidth;
  saved = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
  html.style.overflow = "hidden";
  if (gap > 0) html.style.paddingRight = `${gap}px`;
  lenis?.stop();
}

function unlock() {
  locks = Math.max(0, locks - 1);
  if (locks > 0 || !saved) return;
  const html = document.documentElement;
  html.style.overflow = saved.overflow;
  html.style.paddingRight = saved.paddingRight;
  saved = null;
  lenis?.start();
}

export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    lock();
    return unlock;
  }, [active]);
}

// For Radix content: render it INSIDE <Dialog.Content>, which only mounts while open
// (our DialogContent wrapper itself renders even when the dialog is closed).
export function ScrollLock() {
  useScrollLock(true);
  return null;
}
