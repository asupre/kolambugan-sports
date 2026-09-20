// The colour of the BROWSER'S OWN chrome (a phone's address bar / status bar) —
// the <meta name="theme-color"> tag. Without it the bar stays white or grey over a
// dark app. Values are the header colours (`--card`) of each theme, converted from
// the oklch tokens in index.css; update both together.
export const LIGHT_CHROME = "#f7f8fa";
export const DARK_CHROME = "#171717";
export const PUBLIC_CHROME = "#0A1220";   // the public site is dark-only

export function setThemeColor(color) {
  if (typeof document === "undefined") return;
  let m = document.querySelector('meta[name="theme-color"]');
  if (!m) {
    m = document.createElement("meta");
    m.name = "theme-color";
    document.head.appendChild(m);
  }
  m.content = color;
}
