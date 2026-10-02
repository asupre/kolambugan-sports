/*
  DepthCarousel: adapted from React Bits (https://reactbits.dev, (c) David Haz,
  MIT + Commons Clause). Changes for this site:
  - renders any card content via `renderItem` (not just images);
  - a tiny requestAnimationFrame tween (power3.out) replaces GSAP, so no new
    dependency;
  - only a HORIZONTAL wheel/trackpad swipe moves it, so scrolling the page past
    a stack of carousels is never hijacked;
  - a click right after a drag is swallowed, and a click on a side card only
    brings it to the front (the front card's own link works as normal);
  - dots below the cards instead of over them; arrows in the site's style.
  Phone performance (Oct 2026, measured): moving it never re-renders React —
  the dots and aria-hidden are updated directly, and the cards are memoized —
  and back cards are darkened by a plain black overlay's OPACITY (composited)
  instead of a brightness() filter + mix-blend (repainted every frame). Blur
  is a filter, so keep it 0 on phones.
*/
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const power3Out = (t) => 1 - Math.pow(1 - t, 3);
const DOT_ON = "w-5 bg-[#FACC15]";
const DOT_OFF = "w-[7px] bg-white/30 hover:bg-white/60";

export default function DepthCarousel({
  items = [],
  renderItem,
  getKey = (_, i) => i,
  cardWidth = 240,
  cardHeight = 320,
  radius = 14,
  depth = 220,
  spread = 90,
  tilt = 22,
  tiltDirection = "right",
  perspective = 1400,
  visibleCards = 4,
  falloff = 0.2,
  blur = 4,
  duration = 700,
  loop = true,
  showControls = true,
  showIndicators = true,
  // Room kept beside the stack when shrinking to fit (the arrows need ~120px).
  sidePadding = 120,
  label = "Carousel",
  className = "",
}) {
  const count = items.length;
  const looping = loop && count > 2;

  const rootRef = useRef(null);
  const cardRefs = useRef([]);
  const overlayRefs = useRef([]);
  const dotRefs = useRef([]);
  const posRef = useRef(0);
  const focusRef = useRef(0);
  const rafRef = useRef(0);
  const scaleRef = useRef(1);
  const cfgRef = useRef({});
  const dragRef = useRef(null);
  const justDraggedRef = useRef(false);
  const wheelTimerRef = useRef(null);
  const reducedRef = useRef(false);

  // Only used for the arrows' disabled state when the carousel doesn't loop
  // (1-2 cards); a looping one never re-renders while it moves.
  const [edgeIdx, setEdgeIdx] = useState(0);

  // Latest props for the event handlers / animation loop. Declared before the
  // other effects, so it is current by the time they run.
  useLayoutEffect(() => {
    cfgRef.current = { count, depth, spread, tilt, tiltDirection, visibleCards, falloff, blur, duration, loop: looping, cardWidth, sidePadding };
  });

  // The cards themselves only re-render when the items change.
  const cards = useMemo(() => items.map((it, i) => renderItem(it, i)), [items, renderItem]);

  const layout = useCallback((pos) => {
    const cfg = cfgRef.current;
    const n = cfg.count;
    if (!n) return;
    const dir = cfg.tiltDirection === "left" ? -1 : 1;
    const sc = scaleRef.current;

    for (let i = 0; i < n; i++) {
      const el = cardRefs.current[i];
      if (!el) continue;

      let d = i - pos;
      if (cfg.loop && n > 1) {
        d = ((d % n) + n) % n;
        if (d > n / 2) d -= n;
      }

      const back = Math.max(0, d);
      const shown = Math.abs(d) <= cfg.visibleCards + 0.5;
      let opacity = d < 0 ? Math.max(0, 1 + d) : 1;
      if (!shown) opacity = 0;

      if (opacity <= 0.01) {
        // Off-stage: skip the transform work and drop it from painting.
        if (el.style.visibility !== "hidden") {
          el.style.visibility = "hidden";
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
        }
        continue;
      }

      const tz = -cfg.depth * d;
      const tx = dir * cfg.spread * d;
      const ry = dir * cfg.tilt * clamp(d, 0, 1);

      el.style.visibility = "visible";
      el.style.transform = `translate3d(-50%, -50%, 0) scale(${sc}) translateX(${tx.toFixed(1)}px) translateZ(${tz.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg)`;
      el.style.opacity = opacity.toFixed(3);
      el.style.zIndex = String(Math.round(2000 - d * 20));
      el.style.pointerEvents = opacity > 0.05 ? "auto" : "none";
      if (cfg.blur > 0) {
        const blurPx = Math.min(cfg.blur, (back / Math.max(1, cfg.visibleCards)) * cfg.blur);
        el.style.filter = blurPx > 0.05 ? `blur(${blurPx.toFixed(2)}px)` : "none";
      }

      const ov = overlayRefs.current[i];
      if (ov) ov.style.opacity = clamp(back * cfg.falloff * 1.6, 0, 0.85).toFixed(3);
    }
  }, []);

  // Dots + aria-hidden, written straight to the DOM (no React render).
  const paintActive = useCallback((idx) => {
    dotRefs.current.forEach((dot, i) => {
      if (!dot) return;
      const on = i === idx;
      dot.className = `h-[7px] rounded-full transition-[width,background] duration-200 ${on ? DOT_ON : DOT_OFF}`;
      dot.setAttribute("aria-selected", on ? "true" : "false");
    });
    cardRefs.current.forEach((card, i) => card?.setAttribute("aria-hidden", i === idx ? "false" : "true"));
  }, []);

  const tweenTo = useCallback((target, animate) => {
    cancelAnimationFrame(rafRef.current);
    const cfg = cfgRef.current;
    const from = posRef.current;
    const dur = animate && !reducedRef.current ? cfg.duration : 0;
    const finish = () => {
      const n = cfg.count;
      posRef.current = n > 0 && cfg.loop ? ((target % n) + n) % n : target;
      layout(posRef.current);
    };
    if (dur === 0) return finish();
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      posRef.current = from + (target - from) * power3Out(t);
      layout(posRef.current);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else finish();
    };
    rafRef.current = requestAnimationFrame(step);
  }, [layout]);

  const setFocus = useCallback((rawIndex, animate = true) => {
    const cfg = cfgRef.current;
    const n = cfg.count;
    if (!n) return;
    const idx = cfg.loop ? ((rawIndex % n) + n) % n : clamp(rawIndex, 0, n - 1);
    let delta = idx - posRef.current;
    if (cfg.loop && n > 1) {
      delta = ((delta % n) + n) % n;
      if (delta > n / 2) delta -= n;
    }
    tweenTo(posRef.current + delta, animate);
    if (idx !== focusRef.current) {
      focusRef.current = idx;
      paintActive(idx);
      if (!cfg.loop) setEdgeIdx(idx);
    }
  }, [tweenTo, paintActive]);

  const navigateBy = useCallback((s) => setFocus(focusRef.current + s, true), [setFocus]);

  // Shrink everything to fit narrow containers.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      const cfg = cfgRef.current;
      scaleRef.current = clamp(w / (cfg.cardWidth + Math.abs(cfg.spread) * 2 + cfg.sidePadding), 0.4, 1);
      layout(posRef.current);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [layout]);

  // Horizontal wheel / trackpad swipe only.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const cfg = cfgRef.current;
      if (cfg.count < 2 || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      cancelAnimationFrame(rafRef.current);
      const delta = e.deltaMode === 1 ? e.deltaX * 24 : e.deltaX;
      posRef.current += clamp(delta / (cfg.cardWidth * 0.9), -0.6, 0.6);
      if (!cfg.loop) posRef.current = clamp(posRef.current, -0.3, cfg.count - 0.7);
      layout(posRef.current);
      clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => setFocus(Math.round(posRef.current), true), 130);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      clearTimeout(wheelTimerRef.current);
    };
  }, [layout, setFocus]);

  // Drag: the pointer moves set the position directly, painted once per frame.
  const dragRafRef = useRef(0);
  const onPointerDown = useCallback((e) => {
    if (cfgRef.current.count < 2 || e.button > 0) return;
    cancelAnimationFrame(rafRef.current);
    dragRef.current = { x: e.clientX, startPos: posRef.current, lastX: e.clientX, lastT: performance.now(), v: 0, moved: false, id: e.pointerId };
  }, []);

  const onPointerMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const cfg = cfgRef.current;
    const stepPx = Math.max(cfg.cardWidth * 0.55 * scaleRef.current, 40);
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6) {
      drag.moved = true;
      rootRef.current?.setPointerCapture(drag.id);
    }
    if (!drag.moved) return;
    const now = performance.now();
    drag.v = (e.clientX - drag.lastX) / Math.max(now - drag.lastT, 1);
    drag.lastX = e.clientX;
    drag.lastT = now;
    posRef.current = drag.startPos - dx / stepPx;
    if (!cfg.loop) posRef.current = clamp(posRef.current, -0.3, cfg.count - 0.7);
    if (!dragRafRef.current) {
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = 0;
        layout(posRef.current);
      });
    }
  }, [layout]);

  const onPointerEnd = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (!drag.moved) return;
    cancelAnimationFrame(dragRafRef.current);
    dragRafRef.current = 0;
    justDraggedRef.current = true;
    setTimeout(() => { justDraggedRef.current = false; }, 0);
    const stepPx = Math.max(cfgRef.current.cardWidth * 0.55 * scaleRef.current, 40);
    setFocus(Math.round(posRef.current - (drag.v * 180) / stepPx), true);
  }, [setFocus]);

  const onKeyDown = useCallback((e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); navigateBy(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); navigateBy(1); }
  }, [navigateBy]);

  // Capture phase, so a link inside a side card never fires: the click just
  // brings that card to the front.
  const onCardClickCapture = useCallback((e, i) => {
    if (justDraggedRef.current || i !== focusRef.current) {
      e.preventDefault();
      e.stopPropagation();
      if (!justDraggedRef.current) setFocus(i, true);
    }
  }, [setFocus]);

  useEffect(() => {
    reducedRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useLayoutEffect(() => {
    if (focusRef.current > count - 1) { focusRef.current = 0; posRef.current = 0; }
    paintActive(focusRef.current);
    layout(posRef.current);
  }, [layout, paintActive, depth, spread, tilt, tiltDirection, visibleCards, falloff, blur, cardWidth, cardHeight, radius, count, sidePadding]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    cancelAnimationFrame(dragRafRef.current);
    clearTimeout(wheelTimerRef.current);
  }, []);

  const arrow = "absolute top-1/2 z-[3000] grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[#0B1626]/70 text-slate-100 transition hover:border-[#FACC15]/60 hover:text-[#FACC15] active:scale-95 disabled:opacity-30 disabled:pointer-events-none";
  const atStart = !looping && edgeIdx === 0;
  const atEnd = !looping && edgeIdx === count - 1;

  return (
    <div
      ref={rootRef}
      className={`relative w-full cursor-grab touch-pan-y select-none outline-none active:cursor-grabbing focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-[#FACC15]/60 ${className}`.trim()}
      style={{ perspective: `${perspective}px`, height: cardHeight + (showIndicators && count > 1 ? 56 : 24) }}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    >
      <div className="absolute inset-x-0 top-0 [transform-style:preserve-3d]" style={{ height: cardHeight + 24 }}>
        {items.map((item, i) => (
          <div
            key={getKey(item, i)}
            ref={(el) => { cardRefs.current[i] = el; }}
            className={`absolute left-1/2 top-1/2 overflow-hidden bg-[#0B1626] shadow-[0_24px_48px_-20px_rgba(0,0,0,0.7)] [transform-origin:center] ${blur > 0 ? "[will-change:transform,opacity,filter]" : "[will-change:transform,opacity]"}`}
            style={{ width: cardWidth, height: cardHeight, borderRadius: radius, transform: "translate3d(-50%,-50%,0)" }}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            onClickCapture={(e) => onCardClickCapture(e, i)}
            onDragStart={(e) => e.preventDefault()}
          >
            {cards[i]}
            <span
              ref={(el) => { overlayRefs.current[i] = el; }}
              className="pointer-events-none absolute inset-0 bg-black opacity-0"
            />
          </div>
        ))}
      </div>

      {showControls && count > 1 && (
        <>
          <button type="button" className={`${arrow} left-2 sm:left-4`} aria-label="Previous" disabled={atStart} onClick={() => navigateBy(-1)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className={`${arrow} right-2 sm:right-4`} aria-label="Next" disabled={atEnd} onClick={() => navigateBy(1)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </>
      )}

      {showIndicators && count > 1 && (
        <div className="absolute bottom-2 left-1/2 z-[3000] flex max-w-[90%] -translate-x-1/2 flex-wrap justify-center gap-1.5" role="tablist" aria-label="Slides">
          {items.map((item, i) => (
            <button
              key={getKey(item, i)}
              ref={(el) => { dotRefs.current[i] = el; }}
              type="button"
              role="tab"
              aria-label={`Go to ${i + 1}`}
              className={`h-[7px] rounded-full ${DOT_OFF}`}
              onClick={() => setFocus(i, true)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
