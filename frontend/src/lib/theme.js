// Scoped to whichever AdminLayout instance opts in (enableDarkMode prop) —
// Super Admin/Organizer never read this, so a saved "dark" preference from a
// Barangay Admin session can't leak a half-dark shell onto their own pages,
// which still use hardcoded light colors, not theme tokens.
const KEY = "brgy-theme";

export function getStoredTheme() {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function storeTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore — private browsing / storage disabled
  }
}
