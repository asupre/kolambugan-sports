import { useSyncExternalStore } from "react";

// True while the viewport matches `query` (e.g. "(min-width: 1024px)"), and
// updates when it changes — so a window resized or a tablet rotated mid-session
// is handled, not just the width at first render.
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => true
  );
}
