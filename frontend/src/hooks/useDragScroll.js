import { useEffect, useRef } from "react";

// Lets a horizontally-scrollable container be panned by click-and-drag, not
// just the scrollbar/trackpad — the click-and-drag interaction people expect
// from map/canvas UIs, useful here because the bracket trees are wider than
// the viewport. Touch scrolling is native and untouched.
//
// A drag that crosses a small threshold suppresses the click event that
// follows mouseup, so panning across a match card (which may itself be a
// button, e.g. "Revert") doesn't also fire whatever was under the cursor.
export function useDragScroll() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let down = false;
    let dragged = false;
    let startX = 0;
    let startScroll = 0;

    function suppressClick(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;   // primary button only
      down = true;
      dragged = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
    }

    function onMouseMove(e) {
      if (!down) return;
      const delta = e.clientX - startX;
      if (!dragged && Math.abs(delta) > 4) {
        dragged = true;
        el.style.cursor = "grabbing";
        el.style.userSelect = "none";
      }
      if (dragged) {
        el.scrollLeft = startScroll - delta;
        e.preventDefault();
      }
    }

    function onMouseUp() {
      if (!down) return;
      down = false;
      el.style.cursor = "";
      el.style.userSelect = "";
      if (dragged) {
        dragged = false;
        el.addEventListener("click", suppressClick, { capture: true, once: true });
      }
    }

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("click", suppressClick, { capture: true });
    };
  }, []);

  return ref;
}
