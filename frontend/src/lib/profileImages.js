import { useSyncExternalStore } from "react";

// One cache-busting version per account picture ("photo" = avatar, "banner" = Dashboard banner),
// shared by every <img> that shows it (Oct 2026 bug: a new banner only showed after a manual
// refresh). The URL never changed (?rev=0 on each page), so the browser kept serving the old
// picture from memory. Now Profile bumps the version the moment an upload / removal succeeds,
// every mounted picture re-renders with the new URL at once, and the version is kept in
// localStorage so the next page (and the next visit) asks for the new file too.

const EVENT = "profile-image-rev";
const key = (kind, userId) => `img-rev:${kind}:${userId ?? "anon"}`;

function read(kind, userId) {
  try { return localStorage.getItem(key(kind, userId)) || "0"; } catch { return "0"; }
}

export function bumpImageRev(kind, userId) {
  try { localStorage.setItem(key(kind, userId), String(Date.now())); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);   // another tab changed it
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useImageRev(kind, userId) {
  return useSyncExternalStore(subscribe, () => read(kind, userId));
}
