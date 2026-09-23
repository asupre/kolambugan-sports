import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Skeleton } from "./ui/skeleton";
import { cn } from "../lib/utils";

// Shared by the Super Admin's Review Queue and the Barangay Admin's
// Verification Status page — both need to fetch a private, auth-gated
// residency document (GridFS, never a plain public <img src>) and let the
// viewer actually zoom in on it. Kept in one place so the pinch-zoom
// perf work (Sep 2026 — see CHANGES.md) only ever needs fixing once.

const MIN_SCALE = 1;
const MAX_SCALE = 5;

// A residency document is often a phone photo of an ID/certificate — "fit to
// screen" isn't enough to read small print. Real zoom: mouse wheel, +/-
// buttons, double-click, drag-to-pan, and two-finger pinch on touch.
//
// Perf note (Sep 2026): during an active drag/pinch this does NOT call
// setState on every move — a touchmove can fire 60-120x/sec, and each one
// used to be a full React re-render, which is what read as laggy. `paint()`
// instead writes straight to the image's DOM style via a ref, and the
// gesture's own ref tracks the live value; React state (`scale`/`pos`) is
// only committed once, when the finger/mouse lifts (`commit()`).
export function Lightbox({ src, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [gesturing, setGesturing] = useState(false); // true for the transition's OFF duration only
  const imgRef = useRef(null);
  const dragRef = useRef(null); // mouse pan: { startX, startY, origX, origY, x, y }
  const touchDragRef = useRef(null); // one-finger touch pan: same shape
  const pinchRef = useRef(null); // { startDist, startScale, startMidX, startMidY, origX, origY, scale, x, y }

  function clampScale(s) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  function paint(nextScale, x, y) {
    if (imgRef.current) imgRef.current.style.transform = `translate(${x}px, ${y}px) scale(${nextScale})`;
  }

  function commit(nextScale, x, y) {
    const clamped = clampScale(nextScale);
    const finalX = clamped === MIN_SCALE ? 0 : x;
    const finalY = clamped === MIN_SCALE ? 0 : y;
    setScale(clamped);
    setPos({ x: finalX, y: finalY });
    paint(clamped, finalX, finalY);
  }

  function zoomTo(next) {
    commit(next, pos.x, pos.y);
  }

  function handleWheel(e) {
    e.preventDefault();
    zoomTo(scale + (e.deltaY < 0 ? 0.4 : -0.4));
  }

  function handleDoubleClick() {
    zoomTo(scale > MIN_SCALE ? MIN_SCALE : 2.5);
  }

  // Mouse-only drag-to-pan — touch gets its own handlers below so a
  // single-finger pan and a two-finger pinch don't fight over the same state.
  function handlePointerDown(e) {
    if (e.pointerType === "touch") return;
    if (scale <= MIN_SCALE) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, x: pos.x, y: pos.y };
    setGesturing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (e.pointerType === "touch") return;
    if (!dragRef.current) return;
    const d = dragRef.current;
    d.x = d.origX + (e.clientX - d.startX);
    d.y = d.origY + (e.clientY - d.startY);
    paint(scale, d.x, d.y);
  }

  function handlePointerUp(e) {
    if (e.pointerType === "touch") return;
    if (dragRef.current) {
      commit(scale, dragRef.current.x, dragRef.current.y);
      dragRef.current = null;
      setGesturing(false);
    }
  }

  function touchDist(touches) {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function touchMid(touches) {
    const [a, b] = touches;
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  // Real two-finger pinch-to-zoom, plus a one-finger touch drag once zoomed in
  // — the +/- buttons stay as a fallback, but a residency doc is usually a
  // phone photo of an ID, and pinching to read it is the natural gesture.
  // `touch-none` (below) tells the browser not to handle these itself, so no
  // page-zoom/scroll fights the gesture and preventDefault isn't needed here.
  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      const mid = touchMid(e.touches);
      pinchRef.current = {
        startDist: touchDist(e.touches),
        startScale: scale,
        startMidX: mid.x,
        startMidY: mid.y,
        origX: pos.x,
        origY: pos.y,
        scale, x: pos.x, y: pos.y,
      };
      touchDragRef.current = null;
      setGesturing(true);
    } else if (e.touches.length === 1 && scale > MIN_SCALE) {
      const t = e.touches[0];
      touchDragRef.current = { startX: t.clientX, startY: t.clientY, origX: pos.x, origY: pos.y, x: pos.x, y: pos.y };
      setGesturing(true);
    }
  }

  function handleTouchMove(e) {
    if (e.touches.length === 2 && pinchRef.current) {
      const p = pinchRef.current;
      const mid = touchMid(e.touches);
      p.scale = clampScale(p.startScale * (touchDist(e.touches) / p.startDist));
      p.x = p.origX + (mid.x - p.startMidX);
      p.y = p.origY + (mid.y - p.startMidY);
      paint(p.scale, p.x, p.y);
    } else if (e.touches.length === 1 && touchDragRef.current) {
      const t = e.touches[0];
      const d = touchDragRef.current;
      d.x = d.origX + (t.clientX - d.startX);
      d.y = d.origY + (t.clientY - d.startY);
      paint(scale, d.x, d.y);
    }
  }

  function handleTouchEnd(e) {
    if (e.touches.length < 2 && pinchRef.current) {
      // Read the pinch's own live values, not `pos`/`scale` React state —
      // commit() below only SCHEDULES that state update, it isn't applied
      // synchronously, so `pos` here would still be last render's value.
      const { scale: endScale, x: endX, y: endY } = pinchRef.current;
      commit(endScale, endX, endY);
      pinchRef.current = null;
      if (e.touches.length === 1) {
        // one finger lifted off a pinch, the other keeps panning from where
        // the pinch left off
        const t = e.touches[0];
        touchDragRef.current = { startX: t.clientX, startY: t.clientY, origX: endX, origY: endY, x: endX, y: endY };
        return; // still gesturing — don't clear it below
      }
    }
    if (e.touches.length === 0) {
      if (touchDragRef.current) commit(scale, touchDragRef.current.x, touchDragRef.current.y);
      touchDragRef.current = null;
      setGesturing(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[90vw] p-2 bg-black/90 border-0">
        <div
          className={cn("h-[85vh] w-full overflow-hidden rounded touch-none", scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")}
          onWheel={handleWheel}
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
            alt=""
            draggable={false}
            decoding="async"
            className="h-full w-full object-contain select-none"
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
              transition: gesturing ? "none" : "transform 0.15s ease-out",
            }}
          />
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1.5">
          <Button type="button" variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => zoomTo(scale - 0.5)} disabled={scale <= MIN_SCALE}>
            <Minus />
          </Button>
          <span className="w-12 text-center text-xs text-white tabular-nums">{Math.round(scale * 100)}%</span>
          <Button type="button" variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => zoomTo(scale + 0.5)} disabled={scale >= MAX_SCALE}>
            <Plus />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => zoomTo(1)} disabled={scale === MIN_SCALE}>
            <RotateCcw />
          </Button>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}
          className="absolute top-3 right-3 text-white hover:bg-white/10 hover:text-white">
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
