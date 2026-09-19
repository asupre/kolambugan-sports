// Theme preference is PER ACCOUNT (Sep 2026): the key is suffixed with the
// logged-in user's id, so one person's dark mode doesn't carry over when a
// different account logs in on the same browser (e.g. Super Admin picks dark,
// then a Barangay Admin logs in and should still get the default light).
// The old shared "brgy-theme" key is deliberately ignored — it can't be
// attributed to any one account — so everyone starts on light once.
function keyFor(userId) {
  return `brgy-theme:${userId ?? "anon"}`;
}

export function getStoredTheme(userId) {
  try {
    return localStorage.getItem(keyFor(userId)) === "dark" ? "dark" : "light";
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
