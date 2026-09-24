// Theme preference is PER ACCOUNT (Sep 2026): the key is suffixed with the
// logged-in user's id, so one person's dark mode doesn't carry over when a
// different account logs in on the same browser (e.g. Super Admin picks dark,
// then a Barangay Admin logs in and should still get the default light).
// The old shared "brgy-theme" key is deliberately ignored — it can't be
// attributed to any one account — so everyone starts on light once.
function keyFor(userId) {
  return `brgy-theme:${userId ?? "anon"}`;
}

// A saved choice wins. With none saved yet (a new account, or first visit on this
// browser) it is LIGHT (Super Admin decision, Sep 2026). It used to follow the
// device's own dark setting, so every newly created account opened in dark mode on
// a dark-mode phone/PC. Dark is opt-in from the header toggle. (index.html has a
// copy of this rule that runs before the app loads — keep them in step.)
export function getStoredTheme(userId) {
  try {
    const saved = localStorage.getItem(keyFor(userId));
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // storage unavailable — use the default
  }
  return "light";
}

export function storeTheme(userId, theme) {
  try {
    localStorage.setItem(keyFor(userId), theme);
  } catch {
    // ignore — private browsing / storage disabled
  }
}
