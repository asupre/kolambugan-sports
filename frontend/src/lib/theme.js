// Theme preference is PER ACCOUNT (Sep 2026): the key is suffixed with the
// logged-in user's id, so one person's dark mode doesn't carry over when a
// different account logs in on the same browser (e.g. Super Admin picks dark,
// then a Barangay Admin logs in and should still get the default light).
// The old shared "brgy-theme" key is deliberately ignored — it can't be
// attributed to any one account — so everyone starts on light once.
function keyFor(userId) {
  return `brgy-theme:${userId ?? "anon"}`;
}

// A saved choice wins. With none saved yet (first visit for this account) it follows
// the device's own light/dark setting, so a phone already in dark mode isn't greeted
// with a bright screen. (index.html has a copy of this rule that runs before the app
// loads — keep them in step.)
export function getStoredTheme(userId) {
  try {
    const saved = localStorage.getItem(keyFor(userId));
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // fall through to the device setting
  }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function storeTheme(userId, theme) {
  try {
    localStorage.setItem(keyFor(userId), theme);
  } catch {
    // ignore — private browsing / storage disabled
  }
}
