# Kolambugan Inter-Barangay Sports League — logo files

Concept A, "Bay Crest." Sunrise disc over Mount Bucas with Panguil Bay below; the disc
carries ball seams. The ring has 26 gold ticks, one per barangay.

## Which file to use

| Use | File |
|---|---|
| Public site header, light background | `ksl-lockup-horizontal.svg` |
| Public site header, dark background | `ksl-lockup-horizontal-dark.svg` |
| Crest on its own (documents, tarpaulin, certificates) | `ksl-crest.svg` |
| Crest on a dark page | `ksl-crest-reversed.svg` |
| Photocopy, fax, single-colour print | `ksl-crest-mono-dark.svg` |
| Over a photo | `ksl-crest-mono-white.svg` |
| Small sizes — favicon, app icon, avatar | `ksl-mark-simple.svg` (no text) |
| Centred title block (title page, poster) | `ksl-lockup-stacked.svg` |

PNGs of each are included for anything that can't take SVG (Word, PowerPoint,
Facebook, tarpaulin printers). `favicon.ico` bundles 16, 32 and 48 px;
`favicon-180.png` is the iOS home-screen icon.

## Colours

| Name | Hex | Use |
|---|---|---|
| Bay Navy | `#0C3550` | Crest field, wordmark |
| Deep Navy | `#082334` | Dark backgrounds |
| League Gold | `#D9A441` | Ring, ticks, sun |
| Sea Teal | `#2E7F8C` | Water, subtitle |
| Ivory | `#F4F0E6` | Mountain, light background |

## Type

- Wordmark: **Anton** (Google Fonts)
- Subtitle and crest text: **Barlow Condensed**, SemiBold and Bold

All text in these files is converted to outlines, so nothing breaks on a
computer without the fonts. To set new text in the same style, install both
from Google Fonts.

## Rules

- Keep clear space around the crest equal to the height of the EST. 2026 ribbon.
- Below about 48 px, switch to `ksl-mark-simple` — the arc text becomes unreadable.
- Don't stretch, recolour outside the palette, add a drop shadow, or place the
  full-colour crest on a busy photo (use the white version).

## In the system

- Favicon: `favicon.ico` and `favicon-180.png` in the frontend `public/` folder.
- Admin sidebar and login: `ksl-mark-simple.svg`.
- Public site header: `ksl-lockup-horizontal-dark.svg`.
- The League slot in Site Images: `ksl-crest-1024.png`.
- This is the league logo, separate from the per-barangay logos the barangay
  admins upload.
