import { motion } from "motion/react";

// Scroll-reveal for the PUBLIC pages (Sep 2026, Motion — import from
// "motion/react", not framer-motion). A section fades in and up once as it
// scrolls into view and then never moves again.
//
// Rules this file exists to enforce (the public site polls for live data):
//  - `once: true` everywhere, so a poll / re-render never replays a reveal;
//  - only STATIC content goes inside — never a live score strip, the LIVE NOW
//    counter, or an in-progress match card (they update mid-match);
//  - list items inside a RevealGroup must be keyed by their stable id, never
//    by array index, so a poll that reorders/extends the list doesn't remount
//    (and therefore re-animate) the cards that were already there;
//  - the reveals ALWAYS play, even when the OS has animations turned off
//    (Super Admin decision, Sep 2026 — otherwise a Windows machine with
//    "Show animations" off saw a static site and thought it was broken). To
//    honour prefers-reduced-motion again, wrap the app in
//    <MotionConfig reducedMotion="user"> or re-add useReducedMotion();
//  - deliberately no hover effects and no springs — one soft ease-out.

const EASE = [0.22, 1, 0.36, 1];
const VIEWPORT = { once: true, margin: "-80px" };

// One block: fade in + up 24px when it enters the viewport. `delay` is in
// SECONDS (Motion's unit).
export default function Reveal({ children, delay = 0, y = 24, className }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

const groupVariants = (stagger) => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger } },
});

const itemVariants = (y) => ({
  hidden: { opacity: 0, y },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
});

// A card grid whose RevealItem children arrive one after another
// (staggerChildren 0.08s) instead of all at once. The group itself triggers
// once, when it scrolls into view.
export function RevealGroup({ children, stagger = 0.08, className }) {
  return (
    <motion.div
      className={className}
      variants={groupVariants(stagger)}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
    >
      {children}
    </motion.div>
  );
}

// A card inside a RevealGroup. Renders as a wrapper div — put the grid-cell
// styling (borders, background) on `className`, and the real content inside.
export function RevealItem({ children, y = 24, className }) {
  return (
    <motion.div className={className} variants={itemVariants(y)}>
      {children}
    </motion.div>
  );
}
