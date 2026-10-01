import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../api";

// Continuous right-to-left strip of sport names for the public Home page.
//
// Data: GET /api/sports (public) — never hardcoded, so a sport added or
// deleted in League Setup appears/disappears on the next load. ONE entry per
// sport NAME (deduped defensively): Basketball once, never split by division.
// A failed request or an empty list renders nothing at all.
//
// Seamless loop: the track holds two identical copies; CSS slides it by -50%
// (see .marquee-track in index.css). The second copy is aria-hidden, so
// screen readers hear each sport once. If one copy is narrower than the
// viewport (3 short names on a wide screen) each copy repeats the list until
// it isn't, otherwise there'd be a gap at the right edge.
//
// Speed: pixels-per-second is constant, so the cycle time scales with how much
// there is to scroll — ~34s per loop at seven sports on a wide screen; three don't race, twelve don't
// crawl. Pure CSS animation (not Motion): it's a constant loop, not a reveal.

const SPEED = 80;          // px per second (7 sports: ~34s per loop on a wide screen, ~17s when one list already fills the screen)
const MIN_SECONDS = 12;
const MAX_SECONDS = 180;
const MAX_REPS = 12;      // upper bound on list copies per half — a backstop, real screens need 1-3

function List({ names, hidden }) {
  return (
    <ul
      aria-hidden={hidden || undefined}
      className={`flex shrink-0 items-center ${hidden ? "marquee-dup" : ""}`}
    >
      {names.map((n) => (
        <li key={n} className="flex items-center whitespace-nowrap">
          <span className="font-['Anton'] text-[28px] uppercase leading-none tracking-wide text-white/70">
            {n}
          </span>
          <span aria-hidden="true" className="mx-8 size-2 shrink-0 rotate-45 bg-[#A855F7]" />
        </li>
      ))}
    </ul>
  );
}

export default function SportsMarquee() {
  const [names, setNames] = useState(null); // null = loading, [] = none/failed
  const [reps, setReps] = useState(1);
  const [duration, setDuration] = useState(30);
  const wrapRef = useRef(null);
  const halfRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api("/api/sports")
      .then((d) => {
        if (!alive) return;
        const unique = [...new Set((d.sports || []).map((s) => (s.name || "").trim()).filter(Boolean))];
        setNames(unique);
      })
      .catch(() => { if (alive) setNames([]); });
    return () => { alive = false; };
  }, []);

  useLayoutEffect(() => {
    if (!names || names.length === 0) return;
    // Under prefers-reduced-motion the row is a static, WRAPPING, centred block
    // (see index.css) — there's no loop to fill, so one copy is all it needs.
    // Measuring it anyway was an infinite loop: a wrapping row never gets wider
    // than the container, so "copies needed" kept coming out one higher than
    // the copies rendered (ceil(W / (W / reps)) drifts to reps + 1 in floating
    // point), React hit its update-depth limit (#185) and the WHOLE Home page
    // rendered blank for anyone with reduced motion / "Show animations" off.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const measure = () => {
      const wrap = wrapRef.current;
      const half = halfRef.current;
      if (!wrap || !half) return;
      if (reduce) { if (reps !== 1) setReps(1); return; }
      const halfWidth = half.getBoundingClientRect().width;
      const oneList = halfWidth / reps;
      if (!oneList) return;
      // Capped as a backstop so a measuring quirk can never become a runaway loop.
      const need = Math.min(MAX_REPS, Math.max(1, Math.ceil(wrap.clientWidth / oneList)));
      if (need !== reps) { setReps(need); return; }
      setDuration(Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, halfWidth / SPEED)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapRef.current);
    document.fonts?.ready.then(measure); // Anton loads late — re-measure once it has
    return () => ro.disconnect();
  }, [names, reps]);

  if (!names || names.length === 0) return null;

  const copies = Array.from({ length: reps });
  return (
    // Edge to edge: escapes <main>'s max-width container. (The w-screen trick
    // is banned for the hero because it clipped TEXT on mobile; here it only
    // carries a decorative loop and the layout root is overflow-x-hidden.)
    <section
      aria-label="Sports in the league"
      className="marquee relative mb-6 ml-[calc(50%-50vw)] w-screen overflow-hidden border-y border-white/10 py-5"
    >
      <div ref={wrapRef}>
        <div
          className="marquee-track flex w-max"
          style={{ "--marquee-duration": `${duration}s` }}
        >
          <div ref={halfRef} className="flex shrink-0">
            {copies.map((_, i) => <List key={i} names={names} hidden={i > 0} />)}
          </div>
          <div aria-hidden="true" className="marquee-dup flex shrink-0">
            {copies.map((_, i) => <List key={i} names={names} hidden />)}
          </div>
        </div>
      </div>

      {/* Names fade in/out at the edges instead of being cut off. */}
      <div className="marquee-fade pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#0E0B2F] to-transparent sm:w-40" />
      <div className="marquee-fade pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0E0B2F] to-transparent sm:w-40" />
    </section>
  );
}
