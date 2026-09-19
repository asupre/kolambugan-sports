import { Moon, Sun } from "lucide-react";
import { ThemeAnimationType, useModeAnimation } from "react-theme-switch-animation";
import { cn } from "../lib/utils";

// The ONE dark/light toggle for every admin role (Super Admin, Barangay Admin,
// Organizer) — rendered by AdminLayout, so there is no per-page copy. The
// public site is dark-only and has no toggle.
//
// `useModeAnimation` only DRIVES THE ANIMATION here: a circular reveal that
// expands from this button (Sep 2026). AdminLayout's own `theme` state stays
// the source of truth — it's passed in as `isDarkMode`, and the hook reports
// changes back through `onDarkModeChange` (which AdminLayout uses to set state,
// toggle the `dark` class on <html> and persist to localStorage per user).
//
// `animate={false}` opts a page out (the organizer scoring screen — see
// AdminLayout): the toggle still works, it just swaps instantly.
//
// Fallbacks are built into the hook and simply call `onDarkModeChange` with no
// animation: `prefers-reduced-motion: reduce`, a browser without
// `document.startViewTransition` (older Firefox/Safari), or a missing ref. If
// the transition itself throws, the hook swallows it, so the theme still
// switches and no overlay is left behind.
export default function ThemeToggle({ theme, onThemeChange, animate = true }) {
  const { ref, toggleSwitchTheme } = useModeAnimation({
    animationType: ThemeAnimationType.CIRCLE,
    duration: 600,
    isDarkMode: theme === "dark",
    onDarkModeChange: (isDark) => onThemeChange(isDark ? "dark" : "light"),
  });

  return (
    <button
      // With no ref attached the hook takes its built-in instant-swap path, so
      // `animate={false}` needs no special-casing beyond this.
      ref={animate ? ref : undefined}
      onClick={toggleSwitchTheme}
      aria-label="Toggle dark mode"
      className="relative h-8 w-8 rounded-lg overflow-hidden flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition"
    >
      <Sun
        className={cn(
          "absolute size-4 transition-all duration-500 ease-out",
          theme === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        )}
      />
      <Moon
        className={cn(
          "absolute size-4 transition-all duration-500 ease-out",
          theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
        )}
      />
    </button>
  );
}
