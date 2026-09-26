import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Skeleton } from "./ui/skeleton";
import { cn } from "../lib/utils";

// Shared by the Super Admin's Review Queue and the Barangay Admin's
// Verification Status page — both need to fetch a private, auth-gated
// residency document (GridFS, never a plain public <img src>) and let the
// viewer actually zoom in on it. Kept in one place so the pinch-zoom
// perf work (Sep 2026 — see CHANGES.md) only ever needs fixing once.

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
const EASE = "transform 200ms cubic-bezier(0.2, 0.7, 0.3, 1)";

// A zoomable full-screen image. Used for residency documents (a phone photo of an
// ID — "fit to screen" isn't enough to read small print) and for the instruction
// guide's screenshots. Mouse wheel / trackpad pinch, +/- buttons, double-click,
// drag-to-pan, and two-finger pinch on touch. Zoom is anchored to the pointer (or
// the pinch midpoint), so the spot under your finger stays put.
//
// Optional gallery mode: pass `onPrev` / `onNext` (plus `position`, e.g. "2 / 5",
// and a `caption`) for arrow buttons, the left/right keys and, when not zoomed in,
// a sideways swipe. Changing `src` resets the zoom.
//
// Perf (Sep 2026): the live zoom/pan lives in a ref and is written straight to the
// image's style (`apply()`), never through React state on every wheel tick or
// touchmove, which is what used to read as laggy. React state only holds the zoom
// level for the % label and the buttons.
export function Lightbox({ src, alt = "", caption, position, onClose, onPrev, onNext }) {
  const [scale, setScale] = useState(1);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const boxRef = useRef(null);
  const imgRef = useRef(null);
  const drag = useRef(null); // mouse or one-finger pan / swipe
  const pinch = useRef(null);
  const wheelRef = useRef(null);

  function apply(s, x, y, animate) {
    s = clampScale(s);
    const box = boxRef.current;
    if (s === MIN_SCALE || !box) { x = 0; y = 0; }
    else {
      // Keep the image on screen: pan at most as far as the zoom overflows the box.
      const mx = (box.clientWidth * (s - 1)) / 2;
      const my = (box.clientHeight * (s - 1)) / 2;
      x = Math.max(-mx, Math.min(mx, x));
      y = Math.max(-my, Math.min(my, y));
    }
    view.current = { s, x, y };
    const img = imgRef.current;
    if (img) {
      img.style.transition = animate ? EASE : "none";
      img.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    }
    return s;
  }
  const set = (s, x, y, animate = true) => setScale(apply(s, x, y, animate));

  // A point relative to the box's centre (the transform origin).
  function local(clientX, clientY) {
    const r = boxRef.current.getBoundingClientRect();
    return { px: clientX - r.left - r.width / 2, py: clientY - r.top - r.height / 2 };
  }
  // Zoom to `next`, keeping the content under (px, py) where it is.
  function zoomAt(next, px = 0, py = 0, animate = true) {
    const { s, x, y } = view.current;
    const n = clampScale(next);
    set(n, px - (n * (px - x)) / s, py - (n * (py - y)) / s, animate);
  }

  // New image: back to fit-to-screen.
  useEffect(() => { set(1, 0, 0, false); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  // The wheel needs a non-passive listener so it can stop the page scrolling.
  function attachBox(node) {
    if (boxRef.current && wheelRef.current) boxRef.current.removeEventListener("wheel", wheelRef.current);
    boxRef.current = node;
    if (!node) return;
    wheelRef.current = (e) => {
      e.preventDefault();
      // ctrlKey = a trackpad pinch: small, frequent deltas, followed 1:1 with no easing.
      const smooth = e.ctrlKey || Math.abs(e.deltaY) < 40;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
      const { px, py } = local(e.clientX, e.clientY);
      zoomAt(view.current.s * factor, px, py, !smooth);
    };
    node.addEventListener("wheel", wheelRef.current, { passive: false });
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      else if (e.key === "ArrowRight" && onNext) onNext();
      else if (e.key === "+" || e.key === "=") zoomAt(view.current.s * 1.5);
      else if (e.key === "-") zoomAt(view.current.s / 1.5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function handleDoubleClick(e) {
    if (view.current.s > MIN_SCALE) return set(1, 0, 0);
    const { px, py } = local(e.clientX, e.clientY);
    zoomAt(2.5, px, py);
  }

  // Mouse drag-to-pan (touch has its own handlers so a pan and a pinch don't
  // fight over the same state).
  function handlePointerDown(e) {
    if (e.pointerType === "touch" || view.current.s <= MIN_SCALE) return;
    const { x, y } = view.current;
    drag.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e) {
    const d = drag.current;
    if (e.pointerType === "touch" || !d) return;
    apply(view.current.s, d.origX + e.clientX - d.startX, d.origY + e.clientY - d.startY, false);
  }
  function handlePointerUp(e) {
    if (e.pointerType !== "touch") drag.current = null;
  }

  const dist = ([a, b]) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const mid = ([a, b]) => local((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);

  function handleTouchStart(e) {
    const { s, x, y } = view.current;
    if (e.touches.length === 2) {
      const m = mid(e.touches);
      // The content point under the pinch midpoint, in unscaled coordinates.
      pinch.current = { d0: dist(e.touches), s0: s, qx: (m.px - x) / s, qy: (m.py - y) / s };
      drag.current = null;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      drag.current = { startX: t.clientX, startY: t.clientY, origX: x, origY: y, swipe: s <= MIN_SCALE };
    }
  }
  function handleTouchMove(e) {
    if (e.touches.length === 2 && pinch.current) {
      const p = pinch.current;
      const m = mid(e.touches);
      const s = clampScale(p.s0 * (dist(e.touches) / p.d0));
      apply(s, m.px - s * p.qx, m.py - s * p.qy, false);
    } else if (e.touches.length === 1 && drag.current && !drag.current.swipe) {
      const t = e.touches[0];
      const d = drag.current;
      apply(view.current.s, d.origX + t.clientX - d.startX, d.origY + t.clientY - d.startY, false);
    }
  }
  function handleTouchEnd(e) {
    if (pinch.current && e.touches.length < 2) {
      pinch.current = null;
      set(view.current.s, view.current.x, view.current.y);
      if (e.touches.length === 1) {
        // One finger lifted off a pinch; the other keeps panning from here.
        const t = e.touches[0];
        drag.current = { startX: t.clientX, startY: t.clientY, origX: view.current.x, origY: view.current.y };
      }
      return;
    }
    const d = drag.current;
    if (e.touches.length === 0 && d) {
      const t = e.changedTouches[0];
      const dx = t.clientX - d.startX;
      if (d.swipe && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(t.clientY - d.startY)) {
        if (dx < 0 && onNext) onNext();
        if (dx > 0 && onPrev) onPrev();
      }
      drag.current = null;
    }
  }

  const white = "text-white hover:bg-white/10 hover:text-white";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-[90vw] p-2 bg-black/90 border-0"
        // Focus the image, not the first button (a focus ring on the Previous arrow).
        onOpenAutoFocus={(e) => { e.preventDefault(); boxRef.current?.focus(); }}>
        <DialogTitle className="sr-only">{caption || alt || "Image"}</DialogTitle>
        <div
          ref={attachBox}
          tabIndex={-1}
          className={cn("h-[85vh] w-full overflow-hidden rounded touch-none outline-none", scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            draggable={false}
            decoding="async"
            className="h-full w-full object-contain select-none will-change-transform"
          />
        </div>

        {(caption || position) && (
          <div className="pointer-events-none absolute top-3 left-3 right-14 flex">
            <span className="rounded-md bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
              {position && <span className="tabular-nums text-white/70">{position}</span>}
              {position && caption && " · "}
              {caption}
            </span>
          </div>
        )}

        {onPrev && (
          <Button type="button" variant="ghost" size="icon" aria-label="Previous image" onClick={onPrev}
            className={cn("absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60", white)}>
            <ChevronLeft />
          </Button>
        )}
        {onNext && (
          <Button type="button" variant="ghost" size="icon" aria-label="Next image" onClick={onNext}
            className={cn("absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60", white)}>
            <ChevronRight />
          </Button>
        )}

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1.5">
          <Button type="button" variant="ghost" size="icon-sm" className={white} aria-label="Zoom out"
            onClick={() => zoomAt(view.current.s / 1.5)} disabled={scale <= MIN_SCALE}>
            <Minus />
          </Button>
          <span className="w-12 text-center text-xs text-white tabular-nums">{Math.round(scale * 100)}%</span>
          <Button type="button" variant="ghost" size="icon-sm" className={white} aria-label="Zoom in"
            onClick={() => zoomAt(view.current.s * 1.5)} disabled={scale >= MAX_SCALE}>
            <Plus />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" className={white} aria-label="Reset zoom"
            onClick={() => set(1, 0, 0)} disabled={scale === MIN_SCALE}>
            <RotateCcw />
          </Button>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close"
          className={cn("absolute top-3 right-3", white)}>
          <X />
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// Fetches a private document (auth header, never a plain <img src>) and shows
// it — an image opens the zoomable Lightbox on click, anything else (a PDF)
// is a plain "open in a new tab" link. Just the media itself; the caller
// supplies its own label/status header around this.
export function DocumentFrame({ fetchUrl, large, skeletonClassName = "h-32 w-full" }) {
  const [url, setUrl] = useState(null);
  const [type, setType] = useState("");
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let revoked = null;
    setUrl(null);
    setErr("");
    (async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(fetchUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Could not load document.");
        const blob = await res.blob();
        revoked = URL.createObjectURL(blob);
        setType(blob.type);
        setUrl(revoked);
      } catch (e) {
        setErr(e.message);
      }
    })();
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [fetchUrl]);

  return (
    <>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {!url && !err && <Skeleton className={skeletonClassName} />}
      {url && (
        <>
          {type.startsWith("image/") ? (
            <>
              <img src={url} alt="" onClick={() => setZoom(true)} decoding="async"
                className={cn("cursor-zoom-in rounded border", large ? "max-h-[26rem] w-full object-contain" : "max-h-48")} />
              {zoom && <Lightbox src={url} onClose={() => setZoom(false)} />}
            </>
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
              Open file in a new tab
            </a>
          )}
        </>
      )}
    </>
  );
}
