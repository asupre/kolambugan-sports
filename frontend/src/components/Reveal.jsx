import { createContext, useContext, useState } from "react";
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
//  - a RevealItem that mounts AFTER its group has already revealed (a search or
//    filter removed some cards and then brought them back) must animate ON ITS
//    OWN. Items only inherit "visible" from their group, and the group fires
//    once — so a late-mounted item used to inherit "hidden" and stay at
//    opacity 0 forever (rendered, taking up space, clickable, invisible). See
//    RevealGroup/RevealItem below;
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

// Whether the surrounding RevealGroup has already scrolled into view and played
// its reveal. Items read it once, when they mount.
const RevealedContext = createContext(false);

// A card grid whose RevealItem children arrive one after another
// (staggerChildren 0.08s) instead of all at once. The group itself triggers
// once, when it scrolls into view — and remembers that it has, so items added
// later know not to wait for a trigger that will never come again.
export function RevealGroup({ children, stagger = 0.08, className }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <motion.div
      className={className}
      variants={groupVariants(stagger)}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      onViewportEnter={() => setRevealed(true)}
    >
      <RevealedContext.Provider value={revealed}>{children}</RevealedContext.Provider>
    </motion.div>
  );
}

// A card inside a RevealGroup. Renders as a wrapper div — put the grid-cell
// styling (borders, background) on `className`, and the real content inside.
//
// If the group has already revealed by the time this item mounts, the group's
// one-shot trigger is spent, so the item plays its own fade-in instead of
// inheriting "hidden" and waiting for a signal that never arrives. (Motion reads
// `initial`/`animate` at mount, so later changes to the context don't replay
// anything for items that were already there.)
export function RevealItem({ children, y = 24, className }) {
  const groupRevealed = useContext(RevealedContext);
  return (
    <motion.div
      className={className}
      variants={itemVariants(y)}
      {...(groupRevealed ? { initial: "hidden", animate: "visible" } : {})}
    >
      {children}
    </motion.div>
  );
}
