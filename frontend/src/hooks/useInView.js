import { useEffect, useRef, useState } from "react";

// Scroll-triggered reveal, the motion.dev style: an element is invisible
// until it scrolls into view, then animates in ONCE (never again on scroll
// back up/down — a page that keeps replaying its own entrance animation
// reads as gimmicky, not polished). `rootMargin`'s negative bottom value
// triggers the reveal a little before the element's bottom edge would
// otherwise hit the viewport, so it doesn't feel late.
export function useInView({ threshold = 0.15, rootMargin = "0px 0px -80px 0px" } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respecting prefers-reduced-motion means skipping the ANIMATION, not
    // the content — show it immediately instead of leaving it stuck at
    // opacity-0 for anyone who can't see a transition play.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return [ref, inView];
}
