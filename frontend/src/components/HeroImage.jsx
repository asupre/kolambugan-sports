import { useEffect, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { SiteImage } from "./PublicUI";

// The Home hero's photo (Site Images "hero" slot), with three layers of motion
// (Sep 2026, Motion — import from "motion/react"). Nested on purpose: each
// layer owns ONE transform so they never fight over `scale`/`y`.
//
//   1. entrance  — fades in and settles from a slight zoom once the image has
//                  actually LOADED (not before, or a slow image would just pop
//                  in). Always plays, same policy as the scroll-reveals.
//   2. parallax  — the photo travels ~13% slower than the page as the hero
//                  scrolls out. Honours prefers-reduced-motion.
//   3. drift     — a very slow zoom in and out (one cycle ≈ 44s), the
//                  "documentary still" feel. Honours prefers-reduced-motion —
//                  a continuous loop, same rule as the sports marquee.
//
// Only transforms and opacity are animated (GPU-composited), so it stays smooth
// on a phone. The headline and copy over it are deliberately NOT animated.
//
// Geometry: the parallax layer is 15% taller than the section and starts 15%
// above it; it slides down by 13% of ITS OWN height, so it always covers the
// whole section at every scroll position (no gap at the top). The drift only
// ever scales UP from the centre, so it can never expose an edge either.

const EASE = [0.22, 1, 0.36, 1];

export default function HeroImage({ containerRef }) {
  const reduce = useReducedMotion();
  const [loaded, setLoaded] = useState(false);

  // If the image is slow or never fires onLoad, don't leave the layer at opacity
  // 0 forever (a failed slot unmounts itself via hideOnFail, so this only guards
  // a stalled request).
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "13%"]);

  return (
    <motion.div
      aria-hidden
      className="absolute inset-x-0 -top-[15%] -z-20 h-[115%] will-change-transform"
      style={reduce ? undefined : { y }}
    >
      <motion.div
        className="h-full w-full will-change-transform"
        animate={reduce ? undefined : { scale: [1, 1.08] }}
        transition={reduce ? undefined : { duration: 22, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
      >
        <motion.div
          className="h-full w-full"
          initial={{ opacity: 0, scale: 1.1 }}
          animate={loaded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.1 }}
          transition={{ duration: 1.6, ease: EASE }}
        >
          <SiteImage slot="hero" label="hero banner" hideOnFail className="h-full w-full" onLoad={() => setLoaded(true)} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
