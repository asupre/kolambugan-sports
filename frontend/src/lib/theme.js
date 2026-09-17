// Name predates the Super Admin/Organizer rollout — this key is now shared
// across all three admin roles (every AdminLayout instance that passes
// enableDarkMode), not just Barangay Admin.
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
