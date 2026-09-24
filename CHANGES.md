## 2026-08 — Session: tiebreaker rebuild, accounts, double-elim group generator

- Tournament ties (ML): replaced the round-robin playoff + random-draw fallback
  with a per-group SINGLE-ELIMINATION tiebreaker (byes, decisive). Deviation from
  the originally-documented round-robin approach.
- Physical-sport structure FINALIZED with stakeholder: 4 groups ->
  double-elimination within each group -> 2 qualifiers per group -> Top 8
  single-elim knockout. Resolves a contradiction in the prior spec (which had said
  "no group stage / one straight double-elim bracket"). Doc updated to match.
- Built + proved the arbitrary-N double-elim group generator (byes,
  losers-bracket wiring, 2 qualifiers). Was flagged the "hardest remaining
  algorithm."
- Accounts: added full provisioning/reset/guarded-delete panel. Security model:
  temp passwords shown once (bcrypt is one-way); delete blocked for accounts with
  match history (protects the enteredBy audit trail) and for the last super admin.
- Billiards: scored per match as a plain win/loss entry (no live per-point
  scoring), inside the same double-elim structure.
- GridFS openUploadStream({ contentType }) is silently ignored by this driver version — store the mimetype in metadata too and read it back with a fallback in sendFile, or files download instead of displaying.
## 2026-08 — Session: live scoring, scheduling, public viewer

- **Organizer live scoring built.** Matches now run scheduled → ongoing →
  completed, scored by the ORGANIZER (not the Super Admin), with advancement
  firing only on End match. PlayerMatchStats is finally written to.
- **Periods** (quarters/sets) stored in `bestOf`. Decision: the score
  ACCUMULATES across periods and the winner is the higher TOTAL — periods are
  structural segments, not independent contests. Each `games[]` entry holds only
  that period's own points so the periods sum to the final score, like a
  scoresheet. (First implementation stored cumulative snapshots, which read as
  wrong; corrected.)
- A TIE at the end extends the match by a deciding period rather than trapping
  the organizer. A tie can never be recorded.
- **Cancel match** added — resets a started match and discards its score,
  periods, and player stats. A completed match cannot be cancelled (its winner
  has already advanced; that needs admin-level correction).
- **Match scheduling** added: per-match and bulk-by-round dates plus a `venue`
  field. Decision: the schedule is a SOFT gate — starting an off-day match warns
  but proceeds, and an undated match is always startable. Rationale: dates are
  organisational, not an integrity control, and a hard block would leave an
  organizer unable to record a game being played in front of them (and would
  break the September evaluation, where nothing is dated).
- **Public Viewer theme changed.** The spec said "R7-inspired dark navy"; the
  actual R7 site turned out to be a full-bleed image with translucent cards,
  which we did not adopt. Final: dark, ESPN/PBA structure — scoreboard strips
  with the leading team bright and the trailing team dimmed, PBA-style fixture
  list with date headers and time+venue. Team's own light-themed prototype
  mockups were reviewed and set aside for the public side.
- **shadcn/ui deferred deliberately** — one conversion pass over all admin pages
  after the features are done, rather than converting twice.
- Verification pre-screen now uses an INDEXED name lookup, so screening time
  stays flat against a 17k-row voters' masterlist instead of scanning it once
  per player.
- Approve/reject now cascade to a player's documents; reject deletes the
  player's documents, photo, and GridFS files rather than orphaning them.
- Barangay LOGOS decided as per-BARANGAY (not per-team) — not yet built.

## Public viewer — COMPLETE (Aug 26 – Sep 12, 2026)

All eight pages built: Home, Matches, Standings, Brackets, Teams, Team detail,
Players, Champions, About. Shared primitives live in
`components/PublicUI.jsx` (Crest, PlayerAvatar, Panel, SportTabs, SearchInput,
SiteImage, DIVISION_LABEL). `components/ui.jsx` is the LIGHT admin set and is
not usable on the dark public pages — that mix-up cost an afternoon.

New public endpoints: `/players` (roster directory by team), `/bracket`
(one tournament's full match tree, sorted by `_id` so the layout's dependence
on creation order survives dating), `/site-image/:key`, `/site-images`.

## Decisions worth defending

**Games played comes from the TEAM, not the player.** `PlayerMatchStats` rows
only exist for players who scored or fouled, so counting rows meant a starter
who didn't score showed 0 games. The system records points and fouls, not
lineups — there is no attendance data. So GP = the team's completed matches,
and every player on the roster shares it. Honest and explainable; the
alternative was a number that silently lied.

**Playoff wins count in the DISPLAYED standings but not in tie detection.**
`groupStandings(shaped, true)` for display, `groupStandings(matches)` for
qualification. The qualification path needs the pre-playoff record, because
that record is what created the tie. If it counted playoff results the tie
would vanish and the system couldn't tell a playoff had been required. The two
numbers answer different questions; they are not an inconsistency.

**Standings sort: wins, then LOSSES, then gameWinDiff.** In a double-elim group
teams play different numbers of matches, and gameWinDiff accumulates — so a
team that played more could out-rank an unbeaten one. Losses before diff fixes
it.

**The admin bracket is READ-ONLY.** Score entry was removed from `MatchesView`
and `MatchBox`. Scoring belongs to the organizer's courtside screen; an admin
entering a score bypassed PlayerMatchStats and the period record. Tiebreaker
matches are labelled "Playoff" / "Playoff decider", never R100/R101.

**MINOR_AGE is 15, not 18.** The SK Chairperson confirmed the list is the SK
voters' list (15–30), not the COMELEC general register. Under-15s route to
`needs_document` without a lookup, since they cannot be on it.

**Substitution is a DISPLAY FILTER.** The organizer picks who is on court
(5 basketball, 6 volleyball) so the scoring screen shows 5 cards instead of 15.
Nothing about who played is stored. Real lineup tracking is Chapter 5 future
work — and it is what would make GP per-player rather than per-team.

**Forfeit is recorded 1–0** with `status: 'forfeited'`, so the result reads
clearly and bracket advancement runs by the same rules as any other match. The
status is what tells everyone why the score looks like that. Available only on
a match that hasn't started; a no-show is known before tip-off.

**Match revert refuses when anything downstream has started.** Unwinding a
chain of matches automatically is how a bracket ends up half-rolled-back. The
admin cancels the downstream match first. Reverting the FINAL is refused
outright — that would reopen a completed tournament. Teams are pulled out of
their next match BY ID, never by position: `placeInto` fills the first empty
slot, so clearing by position would evict whoever else was there.

**Live updates are POLLING, not WebSockets** — 10s on Matches and Home, 15s on
Brackets and Standings, 20s on the barangay match page. Chapter 3 currently
says WebSockets and must be corrected.

## Built since Aug 26

- **Champions archive** — full CRUD with proof photos, own GridFS bucket. All
  fields are free text: a 2019 champion has no Team or Player document to
  reference.
- **Site images** — four editable slots (hero, league, barangay, about) with
  drag-and-zoom cropping via `react-easy-crop`. Crops in the browser and
  uploads only the chosen region.
- **League Setup** (`/admin/config`) — replaces `seedSportConfig.js`. Sports and
  barangays can be added, renamed, and deleted (guarded: anything with history
  stays). Per-sport rules configurable: scoring mode, point values, period
  label and options, stat types, on-court count, teams per barangay, groups,
  knockout size. Each is null by default and falls back to the built-in for the
  seven seeded sports — `rulesFor(sport)` in `organizer.js`.
- **Reports** (`/admin/reports`) — every team ranked by wins across the whole
  tournament, sport tabs on screen, prints every sport. A records table, not a
  standing: the bracket decides the title, so the champion is named separately.
- **Rebounds and assists** for basketball; fouls removed from the rally sports.
  Volleyball gets a team-level +1 for opponent errors, since a rally won on the
  opponent's mistake belongs to nobody.
- **Organizer scoring redesigned** — one tap per action from a player card,
  replacing select-player-then-value. Undo names what it reverses
  (`match.lastAction`, one step deep).
- **Manila timezone** — `config/time.js`. Browser inputs carry no timezone and
  were read as server-local, which is UTC on Render.
- **Barangay logos** — `logo` on Barangay, own bucket, uploaded by the barangay
  admin. `Crest` is the single swap point. A cached `/api/barangays` lookup
  tells it which barangays have one, so crests don't fire 150 404s per page.
- **Route guards** — `RequireRole`, plus a 401 in `api.js` clearing the session
  and redirecting to login.
- **Winner cards** at the end of each bracket, naming what winning it earned
  (seed 1, seed 2, Champion, Third place).
- **Update-player** — corrects a name, birthdate, or jersey after submission.
  Changing the name or birthdate re-screens automatically. Exists because the
  only previous tool was REJECT, which deletes the player, their documents and
  their photo, and reopens the roster — a brutal price for a typo.

## Bugs worth remembering

- **`.populate('sport', 'name')` cost an hour.** `/bracket` branched on
  `sport.tournamentFormat`, which the populate never selected, so it silently
  took the double-elim path every time. If a route reads a field off a
  populated document, that field must be in the select string.
- Half-finished refactors: changing a component's props without changing its
  body renders "TBD" with correct scores beside it. Bit us twice.
- Filename casing — Windows hides a mismatch, Linux won't. Check every
  `require` before deploying.

## 2026-09 — Session: shadcn/ui started on Barangay Admin, Tailwind v4

- **Barangay Admin (`BrgyDashboard.jsx`, `BrgyMatches.jsx`, `Documents.jsx`)
  converted to real shadcn/ui components.** Deliberate exception to the
  "one shadcn pass over all admin pages, after features are done" decision —
  Super Admin stays on the old hand-rolled Tailwind set for now, so there's a
  visual mismatch between the two until the rest catches up. `RosterEditor`
  is now a proper shadcn `Dialog` (focus trap, ESC/overlay-click to close)
  instead of a hand-rolled fixed-overlay div. All other logic/handlers were
  left untouched — this was a presentation-only pass.
- **Tailwind upgraded v3 → v4**, required because shadcn's current CLI only
  generates v4-style output (CSS-variable theme, no `tailwind.config.js`).
  Ran `@tailwindcss/upgrade`, then hand-fixed two things it got wrong for
  our setup: (1) it wrapped `@import 'shadcn/tailwind.css'` in `layer(base)`,
  which crashes v4 with "`@utility` cannot be nested" since that file defines
  utilities — import it unlayered. (2) it never emitted the `@theme inline`
  block mapping `--color-border` etc. to the raw `:root` variables, so
  `@apply border-border` failed with "unknown utility class" — re-ran
  `shadcn init --force` against the now-v4 project to regenerate it correctly.
- This upgrade is global (`src/index.css`), so it also touches Public,
  Organizer, and Super Admin even though their JSX wasn't edited. Deliberately
  did NOT let shadcn's default Geist font apply globally (kept Inter) and set
  `--primary`/`--ring` to the existing indigo rather than shadcn's neutral
  default, specifically so the shared file wouldn't silently reskin pages
  outside this pass. `npm run build` verified clean after every step; Public/
  Organizer were not visually re-checked in a browser this session.
- `brgyMenu` — copied identically into all three Barangay Admin files despite
  `menus.js` existing for exactly this — moved into `menus.js` alongside
  `superAdminMenu`/`organizerMenu` while converting these files anyway.
- **Primary color pass** — `--primary`/`--ring` deepened from plain
  indigo-600 toward a richer indigo-violet (`oklch(0.53 0.26 285)`), then a
  second pass made status badges (eligibility, doc verify, Draft/Submitted,
  Won/Lost) solid/vivid instead of pastel outlines, and gave each Card a
  colored left-border + icon tied to its meaning (blue=info/scheduled,
  green=success/done, amber=needs attention, red=urgent/negative) — the flat
  pastel badges were the main reason the pages read as "bland."
- **Dark mode — Barangay Admin only.** `AdminLayout` takes a new
  `enableDarkMode` prop (only the three Barangay Admin pages pass it); when
  on, a header toggle flips `document.documentElement` between the existing
  `:root`/`.dark` token sets already written by the shadcn init. Deliberately
  toggles the real `<html>` class, not a scoped wrapper div — Radix `Dialog`/
  `Select` render into a portal on `document.body`, outside any local
  wrapper, so a div-scoped approach would leave the roster modal and dropdowns
  stuck in light mode. Scoped to the component's mount lifecycle (added on
  mount, always removed on unmount) specifically so a saved dark preference
  can never leak onto Super Admin/Organizer, which don't pass the prop and
  still render hardcoded light colors — those would show a half-dark shell
  with light content if `.dark` ever reached them. Preference persists in
  `localStorage` under `brgy-theme`, a key namespaced away from the shared
  session so it can't collide with a future Super Admin dark mode.

## 2026-09 — Session: Login redesign, Super Admin shadcn conversion (10/10)

- **Login page redesigned**: split-screen layout (branded gradient panel with
  a scattered generic sport-glyph texture — no team logos or copyrighted art
  — on desktop, collapses on mobile), password visibility toggle, loading
  spinner, and a note about the no-self-service password reset flow. The
  panel's "N barangays / N sports" stats now come from `GET
  /api/public/overview` instead of being hardcoded — the old "26 / 7" had
  already gone stale the moment Call of Duty was added as an 8th sport.
- **Super Admin: full shadcn/ui conversion, all 10 pages** (Dashboard,
  Reference List, Season, Champions, Reports, Site Images, Accounts, Review
  Queue, League Setup, Tournaments) plus dark mode via the same
  `enableDarkMode` mechanism as Barangay Admin/Organizer. This completes the
  shadcn pass across every admin role; `components/ui.jsx` is now dead code.
- **Found and fixed a real bug in `Accounts.jsx`**: `provisionAll()` (bulk-
  creates any missing barangay-admin/organizer account) existed but had no
  button wired to it anywhere — not a styling issue, a missing entry point.
  Confirmed with the user and restored the button. Mattered immediately:
  the newly-added Call of Duty sport had no organizer account and no way to
  bulk-create one.
- **`Tournaments.jsx` (1,013 lines) was the one file that needed real care**
  — `BracketTree`'s SVG connector wires are measured live via
  `getBoundingClientRect()` in a `useLayoutEffect`, not computed from
  hardcoded pixel math, so restyling turned out to be safe. The only actual
  constraint: shadcn's `Card` doesn't forward refs, so `MatchBox` and the
  bracket stage container were kept as plain `<div>`s with the ref wired
  directly, instead of being wrapped in `Card`. No bracket generation,
  advancement, revert, or scheduling logic was touched.
- Harmonized a color inconsistency found along the way: `ReviewQueue.jsx` had
  `needs_document` as blue while every other page used amber for the same
  status. Both now use the shared soft-badge palette.
- Full lint sweep at the end: 86 problems vs. 91 at the start of the
  session — a net improvement. Several pre-existing unused-catch-binding
  warnings (`catch (e)` where `e` was never read) were fixed opportunistically
  while those exact lines were already being touched; no new issues were
  introduced anywhere in this pass.

## 2026-09 — Session: dashboard analytics, shadcn Calendar, bracket scroll fix

- **Dashboard analytics.** `GET /api/stats/dashboard` now also returns
  `sports`, `accounts: { barangayAdmins, organizers }`, and `todayMatches`
  (every match scheduled for "today" in Manila time, across the whole
  league, with each team's roster size summed into a `players` count — "how
  many would play today" reads as a headcount, not a match tally). The
  Dashboard page adds a two-column section below the existing stat row: left
  side is three new stat cards (Sports / Barangay admins / Organizers),
  right side is a `Carousel` of today's games, one per slide, each showing
  sport, matchup, player headcount, live/final/scheduled status, and venue.
- **Native date/time inputs replaced with shadcn Calendar.** Added
  `components/DateTimePicker.jsx` (`DatePicker` and `DateTimePicker`) —
  Popover + Calendar for the date, a themed `Input type="time"` alongside for
  the time. Both read/write the exact same `"YYYY-MM-DD"` /
  `"YYYY-MM-DDTHH:mm"` strings the native inputs produced, so the backend's
  `parseManila()` needed no changes. Wired into `Tournaments.jsx`'s schedule
  section (per-match and bulk-by-round) and `BrgyDashboard.jsx`'s birthdate
  fields. Being built from theme tokens, both go dark automatically under
  `enableDarkMode` — no separate dark styling needed.
- **Bracket horizontal scroll fixed.** Added a `.scrollbar-thin` utility
  (themed via `--border`/`--muted-foreground`, both scrollbar-width and
  `::-webkit-scrollbar`) and applied it to `BracketTree`'s scroll container
  plus every other horizontal/vertical overflow panel in the admin pages
  that still had a bare OS scrollbar.
- Fixed a real bug this surfaced: two shadcn `Select`s (Accounts.jsx,
  Champions.jsx) were passed `value={x || undefined}`, which starts a Select
  uncontrolled and switches it to controlled once something is picked — React
  warns about this for good reason (it can silently drop the first render's
  state in edge cases). Radix's Select supports `""` as the controlled
  "nothing selected" value, so passing the raw state string directly fixed it.

## 2026-09 — Session: today's-games logic fixed, Super Admin sidebar regrouped

- **"Today's games" now carries forward overdue backlog.** The dashboard
  carousel's query only matched `isManilaToday(schedule)`, which correctly
  covers every sport (it was never basketball-only — that read was just this
  season's test data only having games dated today), but silently dropped
  anything scheduled for a PAST day that never got played. A league running
  behind schedule doesn't make those games disappear — they're still today's
  business until someone scores or forfeits them. Now includes any match
  scheduled in the past whose status is still `scheduled`/`ongoing`;
  completed/forfeited ones drop off normally. Verified live: surfaced a
  2-day-old unresolved Mobile Legends match alongside today's Basketball games.
- **Super Admin sidebar regrouped under plain named headers.** Ten items in
  one flat list read as cluttered. `superAdminMenu` in `menus.js` is now an
  array of `{header, items}` groups instead of a flat array — grouped by what
  each screen is FOR: **Overview** (Dashboard), **Season & Verification**
  (Season, Reference List, Review Queue), **Competition** (League Setup,
  Tournaments), **Content** (Champions, Reports, Site Images),
  **Administration** (Accounts). Headers are static labels, not collapse
  toggles. `AdminLayout` still supports the old flat-array shape for
  `organizerMenu`/`brgyMenu`, which don't need headers for 1–3 items. Also
  fixes the actual bug behind "the scroll looks bad when I click
  Tournaments": expanding Tournaments' 8-sport submenu could make the sidebar
  nav scroll, and it had the bare OS scrollbar — now uses the same
  `.scrollbar-thin` utility as everywhere else.
- **Whole-sidebar collapse, corrected.** First pass made the group HEADERS
  the collapse trigger (click a header, its items hide) — wrong read of the
  ask. What was actually wanted: a single toggle that collapses the ENTIRE
  sidebar into an icon-only rail, the pattern from AI chat sidebars (Claude,
  ChatGPT), not per-section accordions. Replaced with a `rail` boolean on
  `AdminLayout` and a dedicated toggle button (`PanelLeftClose`/
  `PanelLeftOpen`) pinned above Sign out, desktop-only (`hidden lg:flex` —
  mobile already has its own overlay open/close via the hamburger, a separate
  concept). Collapsed: sidebar narrows to `lg:w-16`, every label and header
  text disappears, items show icon-only with a native `title` tooltip, and
  groups are separated by a plain divider instead of header text. The
  Tournaments item's per-sport flyout has nowhere to render in a 4rem rail,
  so collapsed it's a direct shortcut to Tournaments (which lands on the
  first sport) rather than trying to expand inline.
- **Season page's oversized empty space fixed.** Its content wrapper was
  `max-w-2xl` while every sibling admin page (Champions, Reports, Accounts,
  Site Images, League Setup) uses `max-w-4xl` — an unexplained outlier that
  read as broken, not intentional, on a normal-width screen. Bumped both
  wrappers (loading skeleton and main content) to match. Audited every other
  admin page's width for the same mismatch — none found; the rest were
  already consistent (`max-w-4xl` for form/settings pages, `max-w-5xl` for
  table/bracket-heavy ones), so nothing else needed changing.

## 2026-09 — Session: sidebar polish round 2, Season actually fixed, time input

- **Rail toggle moved to the top of the sidebar**, right under the logo —
  it had been placed above Sign out at the bottom, which read as buried.
- **Mobile header button is a real icon now**, not the `☰` text character —
  same `PanelLeftOpen` icon the desktop rail toggle uses, for one consistent
  visual language instead of two.
- **Season's space problem, actually fixed this time.** Widening the outer
  container to `max-w-4xl` last round was the wrong lever — the real issue
  was that the "Current season" card's content (a compact title+badge row
  and a left-clustered stage stepper) has no reason to fill a wide card, so
  widening the wrapper just made the empty gutter on the right bigger, not
  smaller. Restructured into a `grid grid-cols-1 lg:grid-cols-2` layout
  instead: the season-status card spans both columns (a stepper reads fine
  compact — that part was never broken), and during the `setup` stage,
  `SportSetupSummary` and "Advance the season" sit side by side in the two
  columns rather than stacked, actually using the row instead of just being
  wider. Outside `setup`, "Advance the season" is the only card left, so it
  spans both columns alone — consistent with how every other page's
  single-card empty/status state looks.
- **Time input redesigned.** The bare native `<input type="time">` next to
  the fully-themed date button looked like an afterthought. Added a leading
  clock icon (matching the date button's calendar icon) and hid the native
  `::-webkit-calendar-picker-indicator` — Chrome's own little clock glyph,
  redundant now and the main source of the mismatched look, since the rest
  of the field's internal segments (hour/minute/AM-PM) can't be restyled by
  CSS in any browser.

## 2026-09 — Session: Dashboard de-AI'd toward a professional look

- **Removed the colored-left-border-on-every-card pattern from
  `AdminDashboard.jsx`.** A distinct accent color per stat tile (blue/green/
  amber/primary) is a recognizable "AI-generated dashboard" tell, not a real
  product pattern — color should mark an actual status, not decorate a
  static number. Stat tiles are now neutral: a muted icon in a plain gray
  square, uppercase label, large number, no border accent, no colored icon.
  Matches the restrained style of Stripe/Linear-type KPI tiles rather than a
  Notion-template feel.
- The "Today's games" carousel keeps color ONLY where it's real status: a
  red "Live" indicator for an ongoing match. "Final" is now plain muted text
  instead of a green badge (finishing isn't an alert worth a color), and the
  sport name is a neutral secondary badge instead of blue (the sport isn't a
  status either).
- Dropped the "Welcome back" card — a generic message pointing at the
  sidebar added visual weight without adding information; a professional
  dashboard should read as data first.
- Scoped to `AdminDashboard.jsx` only. The same colored-accent pattern is
  still on the other nine Super Admin pages (Champions, Reports, Accounts,
  Review Queue, League Setup, Tournaments, Season, Site Images, Reference
  List) and the Barangay Admin / Organizer pages from earlier in this
  session — left alone pending a decision on whether to extend the same
  "professional over decorative" treatment everywhere.

## 2026-09 — Session: full-screen loading on login/logout

- **Added `components/LoadingScreen.jsx`** — a full-screen takeover (K mark
  + spinner + message) for the login/logout transition, which previously
  either showed nothing (logout: instant, jarring, zero feedback since it's
  a synchronous localStorage clear with no API call) or just a small spinner
  inside the submit button (login). Theme-token-based, so it renders dark
  automatically when shown from inside `AdminLayout` with dark mode on.
- **Login**: `handleLogin`'s `loading` state now stays `true` all the way
  through a successful attempt instead of resetting in a `finally` — the
  page early-returns `<LoadingScreen>` while `loading` is true, replacing
  the whole form rather than just disabling the submit button. Only resets
  to `false` on the error paths (bad credentials, unreachable server), which
  reveals the form again with the error shown.
- **Logout** (`AdminLayout.jsx`, shared by all three roles): clicking Sign
  out has no real async work to wait on, so a bare instant swap to the login
  page would read as nothing happened. Added a `loggingOut` state and a
  450ms deliberate pause (`<LoadingScreen message="Signing out…">` shown for
  that window) before the actual `localStorage` clear + navigate — an
  intentional minimum-duration pattern, not a real load, purely so the
  transition reads as deliberate rather than abrupt.

## 2026-09 — Bug: correcting a player on a VERIFIED team stayed verified

- **Reported**: a Barangay Admin corrected a player on an already-submitted
  team; the correction re-screened and came back `needs_document`. The Super
  Admin's Review Queue showed nothing needing review, while the Dashboard's
  "Players to review" stat correctly said 2 — the two numbers disagreed.
- **Root cause**: `PATCH /api/teams/:id/players/:playerId` (the correction
  route) re-screens the player on an identity change (name/birthdate) via
  `prescreenPlayer()`, but never touched `team.status`. `GET
  /api/review/queue` only lists teams with `status: 'pending'`. So a
  correction that un-clears a player on an already-`verified` team leaves
  that team silently `verified` with a flagged/needs-document player on its
  roster — invisible to the one screen that's supposed to catch it, while
  `/api/stats/dashboard` counts flagged players directly off `Player`
  regardless of team status, so the two numbers necessarily disagreed. This
  is exactly the residency-integrity gap the whole verification flow exists
  to prevent, just reachable via the correction path rather than initial
  submission.
- **Fix**: the PATCH route now flips `team.status` from `verified` back to
  `pending` when a re-screen's result isn't `eligible` (`submittedAt` is
  left alone, so the roster itself stays locked — only the review-queue
  visibility changes). Response now includes `teamStatus`, and
  `BrgyDashboard.jsx`'s correction notice tells the Barangay Admin when this
  happened ("...has returned to the Review Queue"), not just the player's
  new status.
- **Data repair**: two teams were already stuck in this state in the
  current dev database — "Mukas 1" and "Mukas 2" (Call of Duty: Mobile),
  each with one `needs_document` player, `verified` since Sep 12. Flipped
  both to `pending` by hand (temporary scripts, run and deleted, not
  committed) to match what the fixed route would have done automatically;
  verified via the live API that they now appear in the Review Queue and
  the Dashboard count still agrees (2). Also live-tested the fix itself end
  to end against a real verified team (forced a re-screen to
  `needs_document`, confirmed the reopen, then restored the team to its
  original state and re-verified it).

## 2026-09 — Session: flexible layout, bracket drag-pan, Review Queue rebuild, Public Viewer polish

- **Flexible width on every Super Admin, Barangay Admin, and Organizer
  page.** The Dashboard's stat grid had no max-width cap and reflowed
  naturally when the sidebar rail collapsed; every other admin page was
  pinned to a fixed `max-w-3xl`/`4xl`/`5xl` wrapper and just left dead
  space on the right. Dropped those wrappers everywhere except the
  genuinely-narrow bits (an empty-state card, a lone input).
- **Reference List's collapse lag fixed.** The residents table used
  `table-layout: auto`, which rescans every row to compute column widths on
  each reflow — and the sidebar-collapse animation reflows continuously for
  200ms, so with hundreds of residents loaded the collapse visibly lagged.
  Switched to `table-layout: fixed` with explicit `colgroup` widths, making
  layout cost independent of row count.
- **Barangay logo uploader redesigned.** Extracted Site Images' existing
  react-easy-crop position-and-zoom dialog into a shared
  `components/ImageCropDialog.jsx` + `lib/imageCrop.js`, then rebuilt the
  logo uploader around it: bigger preview, hover-to-change overlay (the
  image itself is the upload control), spinner while uploading, and a
  crop/zoom step before saving so every barangay's crest actually comes out
  square regardless of the source photo's shape.
- **Organizer scoring: player rows redesigned for courtside speed.** Each
  on-court player used to be a 3-line stacked card (~125px), so 5 players
  ran past the fold before every score button was reachable without
  scrolling. Collapsed to one row (jersey chip, name, every button inline)
  on tablet/desktop; stacks (name on top, buttons below) below `sm` because
  the button group is a fixed-width cluster that can't shrink — forcing one
  row there either clipped the name or pushed buttons off-screen. Also
  fixed the match list's team-name truncation (each side now gets its own
  `min-w-0` slot so a long barangay name on one side doesn't starve the
  other).
- **Dashboard color walked back partway.** The fully-neutral stat tiles
  from the "de-AI'd" pass (see above) were asked to have "some color" back
  — resolved as icon-only tinting (`TONE_ICON`): a soft tint behind each
  stat's icon only, one hue per tile just to tell them apart, while the
  card border and the number itself stay plain. Lighter than the
  colored-left-border pattern still used on the other nine Super Admin
  pages.
- **Bracket trees pan by mouse drag, not just scroll.** Shared
  `hooks/useDragScroll.js` (click-and-drag panning on a horizontally
  scrollable container) wired into both the Super Admin `BracketTree` and
  the public `Brackets.jsx`. A movement threshold plus a capture-phase
  click-suppression step stop a drag from also firing whatever the pointer
  lands on (e.g. a match's Revert button).
- **Review Queue's player modal rebuilt around evidence comparison.** It
  used to split the player's photo (an "Information" tab) from their
  submitted ID (a "Documents" tab) — meaning the Super Admin had to flip
  tabs to compare a face against a document, which is the actual point of
  this screen. Removed the tabs; photo + trimmed fields now sit in a sticky
  left column beside the documents, stacked on the right, both visible
  together while scrolling. Also found and fixed the Approve/Reject buttons
  were plain hand-rolled `<button>`s the shadcn pass had missed — now real
  shadcn `Button`s, colors kept solid via `className` since shadcn's
  `destructive` variant is a soft/muted style that doesn't fit the "these
  stay vivid on purpose" rule.
- **Player address editable after submission.** It was only ever captured
  on the initial "Add a player" form — the "Correct this player" edit form
  had no address field, and the roster list never displayed it, so a typo
  or a skipped address was permanent. Backend already accepted `address` on
  the correction route; added the missing input and a roster-row display.
- **Public Viewer professional-polish pass.** Bare "Loading…" text replaced
  with shaped skeleton placeholders on every page (new `Skeleton`/
  `PanelSkeleton`/`TileGridSkeleton`/`PhotoRowSkeleton` primitives in
  `PublicUI.jsx`) — Team Detail specifically used to blank its whole
  header, including the back link, while loading. Added a genuine pulsing
  `LiveDot` to every real "LIVE" indicator, the one deliberate extra
  animation, reserved strictly for an actual `ongoing` match. Fixed the
  browser tab: favicon was a generic scaffolding logo and the title was the
  raw `kolambugan-sports` package name; both replaced with the site's gold
  "K" mark and a real title.

## 2026-09 — Session: CLAUDE.md accuracy audit + first-login instruction modal

- **Full read-only audit of CLAUDE.md against the actual codebase.** The
  user needs the doc accurate for the thesis's own documentation. Found and
  fixed six real staleness issues: `SiteImage`'s documented fields were
  wrong (`image`/`crop` vs. actual `file`/`focal`); the bracket-generation
  branching claim was misattributed to `GET /:id/bracket` (an unconditional
  read) instead of `POST /:id/bracket`/`POST /generate`; the dev-scripts
  delete-list named two files that don't exist and had two naming typos,
  and didn't mention `seedData.js`, which the one script you're told to
  KEEP (`seed.js`) actually imports; the `findOneAndUpdate({new:true})`
  GOTCHA claimed a fix that wasn't applied to `siteimage.js`; and the
  MoSCoW checklist marked live scoring, the public dashboard, the champions
  archive, and frontend RBAC guards as not done when all four are built and
  documented later in the same file.
- **First-login instruction modal, built.** Promised in the thesis (Chapter
  3, Data Collection) and required for the September evaluation, but never
  built — this was the one MoSCoW checkbox the audit above confirmed was
  genuinely still missing. `components/InstructionModal.jsx` +
  `lib/instructionContent.js`: role-specific step-through content (5 steps
  for Super Admin, 4 each for Barangay Admin/Organizer), written from what
  each role's screens actually do. Triggered automatically once, right
  after a forced password change — `mustChangePassword` only ever fires
  once per account, so this needed no new backend field to key off it.
  Also reopenable any time from a "?" button added to `AdminLayout`'s
  header, shared by all three roles, so it's useful for a refresher and for
  accounts that already changed their password before this shipped.
- **Screenshots are placeholders, deliberately.** There's no browser-
  automation tool available in this environment to capture real screenshots
  of the running app, so each step's `screenshot` path (under
  `public/instructions/`) degrades to a labeled "coming soon" box instead
  of a broken image until the real PNG is dropped in — same pattern as
  `SiteImage`'s existing `onError` fallback. The exact filenames needed are
  listed at the top of `instructionContent.js`. The feature is fully
  functional right now; the screenshots are a content task, not a blocker.

## 2026-09 — Real instruction-modal screenshots added

- **User dropped real screenshots into `public/instructions/`**, with more
  descriptive filenames than the placeholder list and more of them than
  originally planned — Super Admin split into 7 steps instead of 5 (Season
  and Reference List separated; League Setup and Tournaments separated),
  and Organizer gained a 5th step. Rewrote `instructionContent.js` to match
  the actual filenames and step count exactly, and kept the folder's
  `README.md` in sync.
- **Added an Organizer "Substitute" step** (between Start & score and End
  the match) — explains that tapping Substitute swaps which players are
  shown on court and is purely a display filter, nothing about who's in or
  out is recorded. Matches the actual confirmation copy already shown in
  `OrganizerScoring.jsx`'s substitute panel.
- Fixed a filename typo along the way (`organizer-substitue.png` →
  `organizer-substitute.png`).

## 2026-09 — Barangay Admin: birthdate calendar fixed

- **The shared `DatePicker` defaulted to prev/next-month-only navigation**
  (`captionLayout="label"`), fine for scheduling a match a few weeks out
  but painful for a birthdate 10–30 years back — over a hundred clicks to
  reach a birth year. Also nothing blocked picking a future date.
- Added two opt-in props to `DatePicker` (`components/DateTimePicker.jsx`),
  both defaulting to the old behavior so `Tournaments.jsx`'s scheduling
  usage is untouched: `captionLayout="dropdown"` (instant month/year
  selection, react-day-picker's own default range of the last 100 years
  through the end of this year) and `disableFuture` (blocks anything after
  today). Turned both on for the birthdate fields in `BrgyDashboard.jsx`'s
  "Add a player" and "Correct this player" forms only.

## 2026-09 — Basketball division renamed: under17 → under15

- Basketball's younger division is **under15**, not under17 (the "U17"
  label was wrong everywhere it appeared). Renamed the enum value
  (`under17` → `under15`) on the `Team` and `Tournament` models, the
  `ALLOWED_DIVISIONS` list in `routes/reference.js`, `seedSportConfig.js`,
  and every frontend `DIVISION_LABEL` map (Tournaments, Season, Reports,
  BrgyDashboard, BrgyMatches, OrganizerScoring, SportConfig, SportGrid,
  PublicUI). No numeric age-cutoff logic existed anywhere to update — the
  division was only ever a label/enum, never derived from a player's
  computed age.
- No migration script was run for any existing `under17` data in the DB —
  if a season/team/tournament was already created under the old value,
  it needs a manual DB update (or recreate for a fresh dev DB) before this
  will show correctly.

## 2026-09 — Esports (Mobile Legends) roster capped at 6, not 10–15

- Esports team rosters are capped at exactly **6** players (5 starters + 1
  substitute), not the 10–15 range used by physical team sports. A
  barangay's two ML entries (e.g. Mukas 1, Mukas 2) therefore total at
  most 12 players combined — a natural consequence of the 6-per-team cap,
  not a separate barangay-wide check.
- `ROSTER_LIMITS.team` (10–15) previously applied to every `format: 'team'`
  roster regardless of sport, including Mobile Legends. Added
  `ROSTER_LIMITS.esportsTeam` (6–6) and a `getRosterLimits(team)` helper
  that looks up the team's sport `category` (`'esports'` vs `'physical'`)
  before picking a limit — used by both add-player and submit-roster in
  `routes/team.js`. Applies to any current or future sport configured as
  `category: 'esports'`, not just Mobile Legends by name.
- League Setup's per-sport "Team" entry-format hint now reads "6 players
  (5 + 1 sub)" for esports sports instead of the physical-sport "10–15
  players" text.

## 2026-09 — Action-failure errors moved into a centered modal, not a top banner

- Action errors (e.g. "No active season" on Create team) rendered as an
  `<Alert>` banner pinned to the TOP of the page or dialog, while the
  button that triggered them could be far below (a long roster, a 26-row
  accounts table, the last card in League Setup's 7-sport list). The
  banner was effectively invisible unless the user scrolled up afterward.
- Added `components/ErrorDialog.jsx`: an `ErrorDialogProvider` (mounted
  once in `App.jsx`, wrapping the router) plus a `useErrorDialog()` hook
  that returns `showError(message)` — pops a small centered Dialog with
  an OK button, visible regardless of scroll position. Consistent with
  the existing shadcn `Dialog` primitive, no new dependency.
- Applied to every action-triggered catch block that was structurally far
  from its own trigger: `BrgyDashboard.jsx` (create team, and every
  RosterEditor action — add/remove player, submit, photo upload),
  `Documents.jsx` (upload), `OrganizerScoring.jsx` (every scoring-screen
  action — this also fixed a real bug: a failed `load()` left the screen
  stuck on the skeleton forever, since the error state was set but the
  component's early skeleton-return meant it was never actually
  rendered), `SportConfig.jsx` (per-sport save/add/remove, barangay
  cross-play toggle), `SiteImages.jsx` (per-slot upload/remove),
  `Accounts.jsx` (reset password, delete — including the "has scored
  matches and can't be deleted" guard message), `Champions.jsx` (delete),
  and `ReviewQueue.jsx` (approve/reject/verify — worse than a banner
  here, since the player modal that triggers these closes immediately
  after the call regardless of success or failure, so the old inline
  message was left behind a modal that had already closed).
- Deliberately NOT converted: errors that already render immediately
  next to their own trigger with no scroll gap (a Dialog's own inline
  error above its Save button, a small per-row upload error, initial
  page-load failures that show before anything else has rendered,
  `MatchesView`'s revert error which already uses the browser's native
  `alert()`). Converting those too would just be extra clicks for no
  visibility gain.

## 2026-09 — Delete team + delete tournament, wired into the UI

- `DELETE /api/sports/:id` was already guarded against orphaning
  `Team`/`Tournament`/organizer records, but there was no way to actually
  clear those out: no delete route existed for a Team at all (only
  removing one player from a draft roster), and `Tournament`'s delete
  route existed but was never wired to a button anywhere in the
  frontend. Surfaced by a sport (a test "Call of Duty: Mobile" esports
  sport, plus Basketball/Mobile Legends) staying stuck even after
  deleting the season — the season was gone, but the Teams and
  Tournaments that reference the sport directly were untouched by that,
  since nothing cascades from Season.
- Added `DELETE /api/teams/:id` (super admin): refuses if the team still
  appears in any match (delete the tournament first — same guard shape
  as the sport-delete check), otherwise cascades — removes the
  TeamPlayer links, deletes each player's Documents and their GridFS
  files, deletes the player's photo from GridFS, deletes the Player
  itself if it isn't shared with another team (multi-sport players are
  common — CLAUDE.md's players↔teams many-to-many), then the Team.
- Added `GET /api/teams?sportId=` (super admin): every team for a sport,
  from **every** season, not just the current one — deliberately not
  season-scoped, since a leftover team from a deleted season is exactly
  what gets a sport stuck, so the cleanup view needs to see those
  orphans rather than filter them out.
- `DELETE /api/tournaments/:id` (already existed) now also deletes the
  `PlayerMatchStats` for its matches — previously left orphaned,
  pointing at a match id that no longer existed.
- Frontend: `Tournaments.jsx` gets a "Delete tournament" button next to
  the stage badge when one exists, and a new "Orphaned teams" card. Both
  actions confirm and report failures through the modal dialogs below,
  not `window.confirm` or a banner.
- The "Orphaned teams" card is DELIBERATELY scoped to only the literal
  orphan case — a team whose `season` populate comes back null, meaning
  the season document itself is gone. First cut showed every team for
  the sport+division regardless of season, which meant it would still
  be sitting on the page listing perfectly normal, currently-active
  teams once a new season replaced the deleted one — a recovery tool
  that never went away. Filtered to `!t.season` so it's empty (renders
  nothing) once there's no orphan left to clean up; a team on a real
  season, current or a completed-but-still-existing past one, is a
  legitimate record and isn't shown here at all — this is not a general
  "delete any team" tool.
- Deleting a team does NOT delete its barangay's other teams or touch
  the barangay itself. Deleting a tournament does NOT delete its teams
  — they become free to enter a newly generated tournament, which is
  the normal "regenerate" use case this route was originally written
  for.
- Added a "Delete all N" bulk button to the Orphaned teams card header
  (only shown once there's more than one) — surfaced immediately by a
  real case: a 52-team esports test sport where every team hit the
  same-match guard until its tournament was deleted, making 52
  individual clicks the only option. Sends the deletes one at a time
  (still subject to the same per-team match guard as a single delete —
  it does not delete tournaments for you), then reports a partial
  result via the error modal if some were blocked (e.g. run before
  deleting the tournament) rather than silently swallowing failures.

## 2026-09 — Orphaned tournaments were unreachable, so their teams were undeletable

- Deleting a tournament is what unblocks its teams (Orphaned teams' own
  error is literally "still appears in N match(es). Delete the
  tournament first."), but the ONLY way to reach the "Delete tournament"
  button was `Tournaments.jsx`'s `currentTournament`, matched out of
  `GET /api/tournaments` — which is scoped to the CURRENT season only.
  A tournament left behind by a deleted season never appears in that
  list, so `currentTournament` never matches it, so its Delete button
  was never reachable — a real dead end hit immediately: 26 orphaned
  Basketball teams, all blocked, with no tournament visible anywhere to
  delete. Bulk-deleting the teams first (see the entry above) doesn't
  route around this either, since the per-team match guard fires on
  every one of them for the same reason.
- Added `GET /api/tournaments/by-sport?sportId=` (super admin): every
  tournament for a sport, from any season — same shape and same reason
  as `GET /api/teams?sportId=` above. Registered right after the public
  `GET /` (before any `/:id/...` route, per the route-ordering gotcha in
  CLAUDE.md), though as a literal single-segment path it wasn't actually
  at risk of being swallowed.
- Added `OrphanedTournamentsSection` to `Tournaments.jsx`: same shape and
  placement logic as Orphaned teams (amber left border, `!t.season`
  filter, per-item Delete, a bulk "Delete all N" once there's more than
  one), mounted ABOVE Orphaned teams — deleting these first is the
  actual unblocking step, so the page now reads top-to-bottom in the
  order you'd actually use it in.

## 2026-09 — Bulk delete shows progress instead of a static "Deleting…" label

- The bulk "Delete all N" buttons (Orphaned teams, Orphaned tournaments)
  send deletes one request at a time — for 52 teams that's a real,
  visible stretch of time with only a disabled button and no sense of
  how far along it is. Added `components/ui/progress.jsx`, a shadcn
  wrapper over Radix's `Progress` primitive (already available — the app
  depends on the unified `radix-ui` package, which bundles it; no new
  dependency needed).
- Both `removeAll()` functions now track `{ done, total }` in state,
  updated after every request completes (success OR failure — a failed
  delete still counts as "processed" so the bar keeps moving instead of
  stalling on the first blocked item), rendered as a `<Progress>` bar
  plus a "Deleting N of M…" line under the card description while the
  bulk op is running.

## 2026-09 — window.confirm() and alert() replaced app-wide with modals

- Same motivation as the `ErrorDialog` entry above, extended to
  confirmations and info messages: a native `window.confirm()`/`alert()`
  blocks the tab and looks like a browser popup, not part of the app —
  and unlike `ErrorDialog`, this wasn't even about visibility, just
  consistency once one kind of native dialog was gone and the other
  seventeen call sites weren't.
- Added `components/ConfirmDialog.jsx`: a `ConfirmDialogProvider`
  (mounted in `App.jsx` alongside `ErrorDialogProvider`) plus a
  `useConfirm()` hook returning `confirm(message, opts) => Promise<boolean>`
  — the same call shape as `window.confirm()`, so every site just gained
  an `await`. `opts` covers `title`, `confirmLabel`/`cancelLabel`,
  `danger` (red confirm button, for destructive actions), and
  `alertOnly` (hides the Cancel button, single OK button — the
  `alert()` replacement, reusing the same component instead of building
  a second one).
- Converted every `window.confirm()` (17 sites: remove barangay logo,
  submit roster, revert a match — twice, two separate bracket views —,
  simulate-groups' error alert, delete team, delete tournament, cancel
  match, forfeit, the off-schedule "start anyway" confirmation — which
  reuses the backend's error message as the question, an existing
  pattern that now reads through `confirm()` instead of
  `window.confirm()` — remove sport, remove barangay, remove a site
  image, open registration, reject a player, reset password, delete
  account) and every remaining bare `alert()` (roster submitted,
  provision-all's success message) across the frontend. None left.
- One behavior change worth knowing: `reject()` in `ReviewQueue.jsx` is
  called from inside `PlayerModal`, which closes right after
  `await reject(...)` resolves regardless of outcome — so confirming now
  opens a second dialog stacked on top of the player modal before either
  closes. Same nested-dialog shape Radix already handles elsewhere in
  this codebase (e.g. a crop dialog opened from within another dialog).

## 2026-09 — Tournament delete now shows real stakes before deleting

- `DELETE /api/tournaments/:id` has no guard against deleting an
  `ongoing` tournament with real, played matches — it's the same route
  and the same button whether the tournament is a harmless orphan left
  by a deleted season or the live, current-season bracket everyone's
  actively scoring. Raised directly: "once a new season has scores and
  everything, can it be deleted during that?" — answer was no
  *technical* guard exists, only a generic confirm text nobody reads
  closely before clicking through.
- `deleteTournament()` in `Tournaments.jsx` now fetches the tournament's
  matches first and counts how many are `completed` before showing the
  confirmation. Zero completed matches keeps the original generic
  wording; any completed matches switches to an explicit "N match(es)
  have ALREADY BEEN PLAYED with real scores" warning, and the confirm
  button itself is relabeled "Delete N played match(es)" instead of a
  plain "Delete" — the number has to be read to click through. Best-
  effort: if the match count fetch fails, falls back to the generic
  message rather than blocking the whole flow.
- Deliberately NOT applied to `OrphanedTournamentsSection`'s delete —
  those are explicitly the recovery-tool case (season already gone), so
  the generic wording stays there.
- For reference, the other two guards in this cleanup feature set
  predate or were added alongside it: `DELETE /api/teams/:id` refuses
  while the team appears in ANY match (scored or not — see the Delete
  team + delete tournament entry above), and account deletion
  (pre-existing) refuses while the organizer has entered any match
  result. Tournaments were the one gap.

## 2026-09 — Bulk CSV player import for the Barangay Admin roster editor

- Adding players one at a time was the only option even when a
  barangay already had a full list on hand (a coach's spreadsheet, an
  export from a prior season) — flagged directly: "sometimes the brgy
  users or admins already has csv list of players." This was also
  already on the backlog (CLAUDE.md's "Bulk player import").
- Added `POST /api/teams/:id/players/import` (barangay admin, draft
  rosters only — same `submittedAt` gate as adding one player).
  Tolerant header mapping (`canonicalPlayerKey`, same shape as the SK
  Federation's reference-list upload in `referenceList.js`): first/
  last/middle name, birthdate, address, jersey number, several header
  spellings each, case-insensitive. Reuses `csv-parse/sync` (already a
  dependency, no new package) and `getRosterLimits()` so an esports
  team's 6-player cap and a physical team's 10–15 are both respected
  automatically — rows past the roster's remaining capacity, or missing
  a required field, are skipped and reported (`{ row, reason }`) rather
  than silently dropped or failing the whole upload, mirroring how the
  reference-list upload reports `skippedRows`.
- Frontend: an "Import CSV" button next to "Add a player" in
  `RosterEditor` (`BrgyDashboard.jsx`). On completion, shows the result
  through the `ConfirmDialog`'s `alertOnly` mode (added N, plus up to
  10 skipped-row reasons with a "…and N more" tail for longer lists)
  instead of a native `alert()`, consistent with the rest of the app.

## 2026-09 — Barangay Admin still showed "10–15 players" for Mobile Legends

- The esports roster-size fix (6, not 10–15 — see the earlier "Esports
  roster capped at 6" entry) only changed the BACKEND limit and League
  Setup's hint text. `BrgyDashboard.jsx` has its own separate, hardcoded
  `ROSTER_LIMITS` constant (`{ team: {min:10,max:15}, singles, doubles }`)
  used by both the "Register a team" hint ("Squad entry — N–N players")
  and the roster editor's player-count display — it never knew about
  `category: 'esports'` at all, so it kept showing the physical-sport
  10–15 range for Mobile Legends specifically where a barangay would
  actually see it: registering a team and editing its roster.
- Added `rosterLimitsFor(sport)` in `BrgyDashboard.jsx`, mirroring the
  backend's `getRosterLimits()` — `entryFormat === 'team'` AND
  `sport.category === 'esports'` picks the 6–6 limit, everything else
  unchanged. Replaces both direct `ROSTER_LIMITS[entryFormat]` lookups
  (team registration and the roster editor).
- Also fixed the resulting phrasing bug: with min===max===6, the old
  template produced "Squad entry — 6–6 players." Now reads "Squad
  entry — exactly 6 players." when min equals max, and keeps the N–M
  range wording otherwise.

## 2026-09 — Manual "Add a player" form: every field now required

- Middle name, address, and jersey number were optional on the manual
  add-player form — only first name, last name, and birthdate were
  required. Decided to require all six fields (raised directly after
  confirming the residency cross-reference does NOT use a player's
  `address` at all, only the reference list's own `barangay` column —
  so making address required here is a data-completeness decision, not
  something the verification logic needed).
- `frontend/src/pages/brgy/BrgyDashboard.jsx`: dropped the "(optional)"
  placeholders, and the "Add player" button now stays disabled until
  every field has a value (middle name, address non-empty; jersey
  number not `""`).
- `POST /api/teams/:id/players` (backend): now 400s if middle name,
  address, or jersey number is missing, and separately validates the
  jersey number is actually numeric. Enforced server-side, not just in
  the form, since the route is reachable directly.
- Deliberately NOT applied to `POST /api/teams/:id/players/import`
  (CSV bulk import) or the "Correct this player" edit route — CSV data
  is often incomplete by nature, and a correction has to keep working
  on players who were added before this rule existed, some of whom
  will have a blank middle name/address/jersey number on file forever.
  The Player schema itself was NOT changed to `required: true` for this
  reason — validation stays at the single-add route only.

## 2026-09 — Two live debugging sessions on the residency cross-reference

- Walked through why a test player kept coming back "needs_document"
  instead of "flagged" after editing its address. Root cause traced to
  `backend/src/config/makeReferenceCsv.js`'s test-data generator, which
  appends an incrementing counter to every surname to manufacture 17,000
  unique rows from a 60×50 name pool (`` `${pick(LAST)} ${n}` ``) — so
  every reference-list surname is literally `"Dimaporo 8838"`, not
  `"Dimaporo"`. A real player named "Dimaporo" can never exact-match
  that, so every player fails to match by name and lands on
  `needs_document` regardless of anything else — not a bug, just
  synthetic test data structurally incompatible with typed-in names
  unless the number is typed too.
- Second round, after the tester deliberately typed the full synthetic
  surname (`"Dimaporo 8838"`) to force a match: confirmed live in the
  database that the match worked and correctly returned "eligible" —
  that specific reference row's recorded barangay (Mukas) equals the
  team's own barangay (Mukas), so there's no cross-barangay conflict.
  Also confirmed, again, that changing the player's `address` field
  has zero effect either way — `services/prescreen.js` never reads it.
  Identified two other rows in the same test data (`"Dimaporo 4525"` →
  Libertad, `"Dimaporo 16322"` → Austin Heights, neither whitelisted)
  that would correctly flag against a Mukas team, as a way to actually
  exercise that path with the existing synthetic dataset instead of
  needing a hand-built clean reference list.
- Follow-up confirmed the flagged result DID save correctly
  (`eligibilityStatus: "flagged"`, with the exact expected
  `flagReason`) despite the roster editor's Save button appearing stuck
  on "Saving…" — traced to a `MongooseServerSelectionError: Server
  selection timed out after 30000ms` independently hit against the same
  Atlas cluster while diagnosing this, i.e. a transient Atlas replica-set
  hiccup stalling the request, not application logic. Flagged as a real,
  separate UX gap regardless of cause: the save button has no client-side
  timeout, so any hung request leaves it stuck indefinitely with no
  feedback and no automatic recovery — proposed adding one (not yet
  implemented; pending confirmation).

## 2026-09 — A player's address must mention their own barangay

- Barangay admins could type any address at all when registering a
  player — including one that read like a completely different
  barangay — with nothing catching it. Since a player registers under
  ONE specific barangay's team, their address should actually say so.
- Added `addressMatchesBarangay(address, barangayName)` in
  `backend/src/routes/team.js` — a loose substring check (case-
  insensitive; "Purok 5, Mukas, Kolambugan" contains "Mukas"), not an
  exact match, since real addresses vary in format and punctuation.
  Applied to: `POST .../players` (barangay admin, always), the
  "Correct this player" `PATCH` (only when address is actually part of
  the request, and only for barangay_admin — Super Admin corrections
  are exempt, trusted to enter the real address even if it doesn't
  literally contain the barangay name), and `POST .../players/import`
  (a non-matching address skips that CSV row with a reason, same
  skipped-rows shape as everything else that route already skips —
  doesn't fail the whole upload).
- `GET /api/teams/mine` now also `.populate('barangay', 'name')` —
  previously only populated `sport`, so the frontend had no way to know
  its own barangay's name without a second request.
- Frontend (`BrgyDashboard.jsx`): mirrored the same check
  (`addressMatchesBarangay`), used to disable "Add player"/"Save" until
  the address matches, show an inline "Must mention "X"." message, and
  hint the expected format in the address field's placeholder
  (`e.g. Purok 5, {barangayName}`) — client-side is instant feedback
  only; the backend checks above are what actually enforce it.
- Explicitly NOT wired into the residency cross-reference itself
  (`services/prescreen.js`) — that stays exactly as it was, comparing
  only the reference list's own barangay column against the team's
  barangay. This is a separate, purely data-quality rule on the address
  field.

## 2026-09 — Pre-screen performance fix + request timeout (real measured problem)

- Escalated from the debugging sessions above: add/correct-player saves
  were hanging for a long time, sometimes needing a refresh, and — the
  serious part — the SAME cross-barangay scenario intermittently came
  back "eligible" one time and "needs_document" another. Measured
  rather than guessed at the cause; found three real, separate issues.
- **Measured cause of the slowness:** `prescreenPlayer()` (used by both
  add-player and "Correct this player") called the same `buildContext()`
  as the bulk roster-submit screen — loading the ENTIRE season's
  reference list into memory just to check ONE player.
  `ReferenceList.find({season}).lean()` on the real data timed at
  924ms / 540ms / 633ms across three runs, for 17,000 rows fetched and
  scanned in Node — real, measured overhead on every single player
  save, not a one-off blip.
- **Root cause of the inconsistency:** almost certainly a race, not a
  logic bug — the matching decision itself was independently proven
  correct three times earlier in this session. When a save hung, the
  natural reaction was to refresh and retry; refreshing only abandons
  the request on screen, the server keeps processing and still writes
  whatever it computes whenever it finishes. Two overlapping PATCH
  requests on the same player, no locking between them — whichever
  finishes last wins, correct or not. The ~1s reference-list reload was
  exactly the window that made duplicate submissions likely.
- **Data bloat found along the way:** `referencelists` had 34,000
  documents; a full 17,000 of them were tagged to a season id that no
  longer exists in the `seasons` collection at all (the same "deleted
  season left orphans behind" pattern as the orphaned teams/tournaments
  cleaned up earlier — see that entry above). Deleted via a one-off
  script filtering to `season: { $nin: <valid season ids> } }` — 17,000
  rows removed, 17,000 real ones remain. Didn't affect correctness
  (current-season queries were already properly scoped), just cut the
  collection in half.
- **The actual fix** — `backend/src/services/prescreen.js` rewritten:
  - `decideFromCandidates(player, teamBarangay, candidates, brgyByName)`
    replaces the old `decide()` — same decision logic, but takes
    already-fetched candidate rows instead of an internal Map, so both
    screening paths can share it.
  - `prescreenTeam()` (roster submit) UNCHANGED in approach — still
    fetches the season's list once and reuses it across all ~10-15
    players, which is the right tradeoff at that scale.
  - `prescreenPlayer()` (single-player add/correct) now queries the
    reference list directly by name — `ReferenceList.find({ season,
    lastName: looseRegex(...), firstName: looseRegex(...) })` — using
    the existing `season+lastName+firstName` index instead of pulling
    all 17,000 rows over the network into Node. `looseRegex()` is a
    case/whitespace-tolerant anchored regex (`^word1\s+word2$`, `i`
    flag) built to match the exact same tolerance the old in-memory
    `norm()` comparison had, so matching behavior is unchanged —
    verified against the real data: all 4 known cases (Mukas exact
    match, Libertad exact match, a case/whitespace-mangled version of
    the same name, and the known "Dimaporo" no-number miss) returned
    identical results to before, now in 90-500ms instead of 600-900ms+.
- **`frontend/src/api.js` now has a default 20s request timeout**
  (`AbortController`, opt out per call with `{ timeoutMs: 0 }`) — a
  hung request (Atlas hiccup, slow network, anything) now fails with a
  clear "took too long to respond" error instead of leaving a button
  stuck on "Saving…" forever with no way out but a refresh. This is the
  fix for the "had to refresh or click outside the form" symptom, and
  it also shrinks the window for the overlapping-request race described
  above, since a hung request now gives up instead of lingering
  indefinitely waiting to eventually land a stale write.

## 2026-09 — "Correct this player" scrolls itself into view on open

- The edit form renders inline inside the roster list, inside a
  scrollable Dialog — clicking the pencil icon on a player further down
  a long roster opened the form off-screen with no visual cue, so it
  looked like nothing happened until the admin scrolled down manually.
- `EditPlayer` (`BrgyDashboard.jsx`) now calls
  `rootRef.current.scrollIntoView({ behavior: "smooth", block: "center" })`
  in a mount-only `useEffect` — since the component only mounts when its
  player's `editingId` becomes active, mounting IS the "user clicked
  Edit" signal, no extra prop or state needed.

## 2026-09 — Reverted: "address must mention the team's barangay"

- The rule added earlier this session (player address must contain the
  registering team's own barangay name) directly conflicts with the
  cross-barangay whitelist: a resident of a whitelisted small/remote
  barangay (Small Banisilon, Matampay, Bubong, Pantaon, Inudaran, San
  Roque, Palao, Sto. Niño, Sucodan, Lumbac) legitimately plays for a
  DIFFERENT barangay's team, while their real, honest address is their
  own home barangay — not the team's. Enforcing the rule would have
  forced exactly those players to either lie about their address or be
  blocked from registering, which is backwards: the whitelist exists
  specifically so they don't need to.
- Fully reverted: removed `addressMatchesBarangay()` and its three call
  sites in `backend/src/routes/team.js` (`POST .../players`, the
  "Correct this player" `PATCH`, and the CSV import's per-row check),
  the mirrored frontend check and disabled-button conditions in
  `BrgyDashboard.jsx` (`RosterEditor`'s "Add a player" form and
  `EditPlayer`), the `barangayName` prop threaded through for it, and
  the now-unused `GET /api/teams/mine` `.populate('barangay', 'name')`
  that only existed to support this. Address is back to being free
  text with no relationship checked against anything, same as before
  this session touched it.
- Also fixed along the way: the CSV import's error path discarded the
  per-row `skippedRows` reasons whenever EVERY row failed (a fully
  failed import only ever showed the generic "No valid rows to add.").
  This was the actual cause of "why can't I upload CSV" being
  undiagnosable at the time. `importCsv()` now includes the skip
  reasons in the thrown error either way, and `ErrorDialog`'s
  `DialogDescription` gained `whitespace-pre-line` + a scrollable max
  height so a multi-line reason list actually renders as line breaks
  instead of running together, and doesn't overflow the dialog.

## 2026-09 — Toggling a barangay's cross-play flag re-screens instantly

- Raised directly: flag one player in the Review Queue, go flip that
  player's home barangay to `allowsCrossBarangay: true` in League
  Setup, come back to the Review Queue — it still said flagged. The
  only way to fix it was to open that exact player and re-save them,
  which triggers a re-screen as a side effect of the name/birthdate
  change check. Nothing should require a Barangay Admin to notice and
  manually touch a player just because a Super Admin changed a
  barangay-level policy.
- Root cause: `eligibilityStatus` is a snapshot, only ever recomputed
  when a PLAYER's own name/birthdate changes (`prescreenPlayer`) or a
  roster is submitted (`prescreenTeam`). Flipping a barangay's
  `allowsCrossBarangay` can flip a player's correct status in EITHER
  direction — flagged to eligible if now allowed, or eligible to
  flagged if a previously-granted exception is revoked — without that
  player changing at all, so neither existing trigger ever fires for
  them.
- Added `rescreenSeason(seasonId)` to `services/prescreen.js`: fetches
  the season's reference list and the barangay list ONCE (same
  fetch-once-reuse tradeoff as `prescreenTeam`) and re-screens every
  player on every team in that season, only writing the ones whose
  status/reason actually changed. Same verified-team safeguard as a
  player correction: if this makes an already-`verified` team hold a
  non-eligible player, that team flips back to `pending` so it
  reappears in the Review Queue.
- Wired into both `PATCH /api/barangays/:id/cross` (League Setup's
  dedicated toggle) and the general `PATCH /api/barangays/:id`
  (covers `allowsCrossBarangay` if ever sent through that route too) —
  only when the flag's value actually changed, not on every save.
  Response message gains a note like "3 player(s) re-screened. 1
  verified team(s) reopened for review." when something actually
  happened; `BarangayCard` in `SportConfig.jsx` now surfaces that
  through the page's notice banner instead of discarding it silently.
- Verified against real data rather than trusting the logic blind:
  found a live flagged player ("Grace T. Dimaporo 8838", home
  barangay Mukas, registered under Austin Heights — flagged since
  Mukas isn't whitelisted), flipped Mukas's `allowsCrossBarangay` to
  `true` directly, ran `rescreenSeason()`, confirmed the player
  flipped to eligible with no player-side action; reverted the flag,
  ran it again, confirmed it flipped back to flagged with the same
  reason as before.

## 2026-09 — Real logo/favicon assets, replacing every placeholder "K" mark

- The user dropped a finished logo folder ("Bay Crest" concept — sunrise
  disc over Mount Bucas, Panguil Bay below, 26 gold ring ticks for the
  26 barangays) in the repo root and asked for it to be moved/wired into
  the system per its own README.
- Moved `favicon.ico`, `favicon-48.png`, `favicon-180.png` into
  `frontend/public/`; everything else (crest variants, lockups, the
  simple mark, source PNGs, the README) into `frontend/public/logo/`.
  Root `logo/` folder is gone.
- `index.html`: replaced the single placeholder `<link rel="icon"
  href="/favicon.svg">` with the real `favicon.ico` (16/32/48 bundled),
  a PNG fallback, and an `apple-touch-icon`. Deleted the old placeholder
  `public/favicon.svg`.
- Replaced every hand-rolled "K in a colored square" placeholder with
  `ksl-mark-simple.svg` (a self-contained circular badge with its own
  navy background — same on light or dark, no per-theme variant needed):
  `AdminLayout.jsx`'s sidebar, `Login.jsx` (the dark hero panel AND the
  mobile header — two separate spots), `LoadingScreen.jsx`,
  `ChangePassword.jsx`. Found all six occurrences with a repo-wide grep
  for the `>K</span>` pattern rather than assuming — the fourth and
  fifth (`LoadingScreen`, `ChangePassword`) weren't mentioned when this
  started and would've been missed by only checking the "obvious" spots.
- Replaced the public site header's separately-styled "K" square + a
  manually laid out two-line "KOLAMBUGAN SPORTS / INTER-BARANGAY LEAGUE"
  text block with a single `ksl-lockup-horizontal-dark.svg` (mark and
  wordmark combined, already includes both lines) in `PublicLayout.jsx`.
- Seeded the previously-empty "league" Site Images slot with
  `ksl-crest-1024.png`, via the same `putFile()` the real upload route
  uses — checked first that the slot was actually empty (it was) before
  writing, so this couldn't silently clobber a real photo someone had
  already uploaded. Verified it serves correctly via
  `GET /api/public/site-image/league` afterward. Super Admin can still
  replace it from the Site Images page like any other slot — this isn't
  locked in any special way.
- Not yet wired to a specific UI spot: `ksl-lockup-horizontal.svg`
  (light-background variant — Public is always dark, so no current
  caller), `ksl-lockup-stacked.svg` (title page/poster use), the mono/
  reversed crest variants, and the larger PNGs (Word/PowerPoint/tarpaulin
  use per the README) — left in `frontend/public/logo/` for whenever
  a document or print piece needs them.

## 2026-09 — Bigger/animated loading screen, dark-mode transition, reference-list match tracing

- **LoadingScreen bigger + more polished**: logo doubled (h-12 → h-20) with a
  soft pulsing glow ring behind it (`--primary` accent, theme-token based),
  the spinner icon swapped for an indeterminate progress bar sweep
  (`loading-bar` keyframe in `index.css`). Same component, so both
  `Login.jsx`'s "Signing in…" and `AdminLayout.jsx`'s "Signing out…" pick it
  up for free.
- **Dark/light toggle animated**: the header button now cross-fades/rotates
  between `Sun`/`Moon` (`AdminLayout.jsx`) instead of an instant icon swap.
  A global `index.css` rule (`prefers-reduced-motion`-guarded) transitions
  `background-color`/`border-color`/`color`/`fill`/`stroke` at 200ms on any
  element that doesn't already declare its own `transition` utility —
  Tailwind's layer order (`base` < `utilities`) means an element with its
  own `transition-*` class keeps that instead, so this only smooths the
  plain, untouched containers (Cards, tables, the sidebar) that previously
  flashed instantly when `.dark` toggled.
- **Flagged / needs-document reasons now a colored callout, not muted text**:
  `flagReason` used to render as quiet gray text easy to miss next to a
  status badge. Now a bordered amber (needs_document) or red (flagged) box
  with an icon (`AlertTriangle`/`FileWarning`), same color convention as the
  existing status badges. Applied everywhere a player's flagReason already
  showed: Review Queue's player row AND its detail modal, plus the Barangay
  Admin's own roster (`BrgyDashboard.jsx`) and Document Submission page
  (`Documents.jsx`) — the Barangay Admin is the one who has to act on it.
- **Reference List: search bar + proof-of-match tracing** (the point: prove
  the automated pre-screen's decision against the actual source row, not
  just assert it). Went through two designs in the same session — the first
  is worth recording because the reasoning that killed it matters:
  - **First attempt (reverted): a stored `Player.matchedReferenceId` field.**
    Set by `decideFromCandidates` and persisted by all three prescreen entry
    points. Problem, surfaced immediately by the user testing it: an already-
    `eligible` player screened BEFORE this field existed has `null` forever —
    the green highlight would only ever work for players screened after the
    code shipped, and "just re-save every existing player" isn't a real
    answer across 26 barangays. Backfilling would have needed a one-off
    migration script and a live DB write. Reverted the schema field and the
    writes in `prescreen.js`/`review.js` entirely rather than ship that gap.
  - **Shipped instead: live cross-reference, computed on every read.**
    `GET /api/reference-list` now re-runs the exact same `decideFromCandidates`
    decision prescreen.js uses — LIVE, against every player on a team in the
    current season — and tags each returned record with `match: { status,
    playerName, teamName } | null`. Nothing is read from or written to
    `Player`; this works retroactively for every player, screened whenever,
    with nothing to backfill. Exported `decideFromCandidates`, `loadBrgyByName`,
    and `norm` from `prescreen.js` for `referenceList.js` to reuse rather than
    re-implementing the matching rules a second time.
  - Frontend: every row with a `match` is now outlined green (eligible) or
    red (flagged/mismatch) in the residents table, always — not just when
    arriving from somewhere else — with a "Matched"/"Mismatch" chip plus the
    connected player's name and team in a new "Matched player" column. This
    is what actually answers the original ask: search any name, and if that
    person is currently eligible or flagged on a team, the row is already
    colored with no extra step.
  - Review Queue's player modal still offers a shortcut over — "View in
    Reference List →" for eligible players (green alert) and flagged/
    needs_document players (next to the reason) — but it now just navigates
    to `/admin/reference?q=<name>`, which prefills the search box; the page's
    own live cross-reference does the rest. No id, no stored state, nothing
    that can go stale.
  - Also added the search box itself: tokenized (splits on whitespace/
    punctuation) rather than one literal substring, and drops tokens that
    can never match anything in the reference schema — pure numbers (jersey
    numbers) and bare single-letter initials (no middle-name column exists
    here). Without this, typing a roster-style query like "Rivera 3101,
    Antonio S." returned nothing even though Antonio Rivera really is on
    the list, because the old naive search required the WHOLE typed string
    to appear verbatim. Shows an explicit amber hint if the query is only
    unsearchable tokens (e.g. a jersey number alone), instead of silently
    returning zero results.

## 2026-09 — Bug: reference-list match tracing silently dropped one of two players sharing a name

- Found immediately after shipping the live cross-reference above: searching
  "Rivera" showed the resident matched to "Austin Heights 1" as a Mismatch —
  not "Mukas 1", where the real Antonio Rivera is actually eligible.
- Cause: `GET /api/reference-list` built `matchByRefId` as a `Map<refId,
  singleMatch>`. Matching is by NAME ONLY, so a second player anywhere in
  the season who happens to share a name (here: a different "Antonio
  Rivera" registered on Austin Heights 1, whose barangay doesn't agree with
  the reference row, hence flagged) resolves to the exact same reference
  row id as Mukas 1's Antonio. Whichever player the loop reached LAST
  simply overwrote the first one's entry in the map — Mukas 1's genuine
  eligible match was computed correctly and then silently discarded before
  the response was ever sent.
- Fix: `matchByRefId` now maps to an ARRAY (`matches`, not `match`). Every
  player who resolves to a reference row is kept, not just the last one.
  The Reference List table renders each one on its own line under that
  row, with its own Matched/Mismatch color — and when a row has more than
  one, the row itself gets an amber outline and a "N players match this
  name" note, since two different teams' players landing on one reference
  row is worth a Super Admin's attention either way (same person trying to
  play for two barangays, or two unrelated residents who happen to share a
  name and can't be told apart by name-only matching).
- `frontend/src/pages/admin/ReferenceList.jsx`: renamed the field
  accordingly (`r.match` → `r.matches`, array, defaults to `[]`).

## 2026-09 — Reference List page was laggy on every interaction — two real causes, both fixed

- Reported as: typing in the search box or clicking anything on this page
  visibly froze for a moment before catching up. Confirmed directly against
  the database: this season's reference list really does hold 17,000 rows
  (a realistic-scale test list), against only 4 teams / 14 players — so the
  live cross-reference computation added in the two entries above was never
  the bottleneck (14 players is nothing to iterate). The lag was rendering
  and CSS, not the match logic.
- **Cause 1 — up to 17,000 `<tr>` rows mounted in the DOM at once.** The
  table only ever *displayed* ~15 rows at a time (scrolled, `max-h-96`), but
  React was still rendering and reconciling every matching row on every
  keystroke — with no search typed at all, that's the full 17k. Fixed by
  capping rendering to the first 200 results (`RENDER_CAP` in
  `ReferenceList.jsx`) regardless of how many actually match, with a note
  telling the Super Admin to narrow their search when there are more than
  that. The search box was already the intended way to find one person —
  this just stops the page from also trying to render everyone else at the
  same time.
- **Cause 2 — the site-wide dark-mode transition rule from the loading-
  screen/dark-mode session above.** `* { transition-property:
  background-color, border-color, color, fill, stroke; }` was left on
  PERMANENTLY, on every element, to make the theme toggle fade smoothly.
  With thousands of table rows/cells that's thousands of elements carrying
  transition bookkeeping on every render, not just the moment the theme
  actually changes. Rescoped to a `.theme-transition` class that
  `AdminLayout`'s `toggleTheme()` now adds to `<html>` for ~300ms around the
  actual toggle and then removes — same fade, paid for only when it's
  playing, not on every keystroke on every page for the rest of the session.
- Also wrapped the search input's derived filtering in `useDeferredValue`
  (`deferredSearch` in `ReferenceList.jsx`) so the input itself never waits
  on the (now much cheaper, but not free) filter-and-render work — React
  updates what you're typing immediately and lets the table catch up.

## 2026-09 — Public Home page hero + stat tiles redesigned, bolder treatment

- The user shared 3 reference screenshots (an Instagram basketball-brand
  landing page, "Bounce") and asked whether the Public Viewer should move
  toward that look. Assessment: no — that's a marketing landing page for one
  event (huge hero type, rotated text blocks, a handful of sections), not a
  live sports-data site with dense tables/brackets/rosters across 7 sports
  and 26 barangays. Recommended borrowing just the bold hero typography and
  the individually-bordered stat-tile style rather than restructuring
  anything, and mocked up both (Current vs. Redesign, phone width, using the
  site's real dark tokens) as a Design canvas Artifact before touching code.
  User approved the redesign artboard; implemented it as shown.
- `frontend/src/pages/public/Home.jsx`:
  - Hero **no longer uses the `hero` SiteImage slot/background photo** —
    replaced with a solid-panel hero, oversized uppercase two-line headline
    ("INTER-BARANGAY" / "SPORTS LEAGUE" in gold), and a decorative
    sunrise-disc + ring accent (a nod to the real "Bay Crest" logo concept —
    sunrise over Panguil Bay, gold ring ticks — rather than a generic stock
    sports photo). CTA buttons became bold filled/outline pills with an
    arrow icon on the primary one.
  - **KNOWN TRADEOFF, flagged not silently dropped**: the Super Admin's Site
    Images page still lists and lets you upload/crop a "Home banner" for the
    `hero` slot (`backend/src/models/SiteImage.js`'s `SLOTS`) — that upload
    now has nowhere to render. Left the slot itself alone (removing it is a
    separate, deliberate decision); if it's confirmed dead, remove the
    `hero` entry from `SLOTS` and its Site Images UI row next.
  - The 3-stat row (`Stat`) became `StatTile`: three individually-bordered
    cards with an inline SVG icon each, instead of one shared bordered strip
    with no per-item boundary — matches the reference's tile style. The
    "Live now" tile only tints red/gets the pulsing `LiveDot` icon while
    `counts.liveNow > 0`, same "color means something" rule as everywhere
    else on Public — it's a plain neutral tile otherwise.
  - No lucide-react added — Public already uses inline stroke SVGs
    (`SearchInput` in `PublicUI.jsx`), matched that instead of introducing a
    new icon import into the public bundle for 3 icons.
- Verification: `npm run build` clean; started the Vite dev server and
  fetched the transformed `Home.jsx` module directly to confirm it compiles
  with no errors. Could NOT get an actual rendered screenshot in this
  sandbox — no project "run" skill exists yet for this repo, and Playwright/
  chromium-cli isn't installed and couldn't be installed non-interactively
  here. Visual confirmation in a real browser is still the user's to do.
- **Follow-up same session — user feedback: "too much space on the sides,"
  and explicitly said to stop treating the ESPN-structure doc as a hard
  constraint on this page ("we can make our own thing").**
  - Cause of the side-space complaint: `PublicLayout.jsx` centers EVERY
    public page's header/main/footer in `max-w-6xl` (1152px) — on any
    screen wider than that (most desktops), the actual content sits in a
    narrow column with large empty gutters either side. Widened to
    `max-w-[1400px]` (plus `lg:px-8`) in all three spots — this affects
    every public page, not just Home, since they all render inside this
    same `<main>`.
  - Home's hero is now **full-bleed**: `relative left-1/2 right-1/2
    -ml-[50vw] -mr-[50vw] w-screen` breaks its background out of the
    layout's max-width entirely, spanning the full browser width the way a
    real landing-page hero does (the accent circles now actually reach the
    edge instead of stopping at 1152px). An inner wrapper re-applies the
    same `max-w-[1400px] mx-auto` so the TEXT still lines up with the rest
    of the page's content column — only the background bleeds. Safe against
    the classic `100vw`-includes-scrollbar overflow bug because
    `PublicLayout`'s root div already carries `overflow-x-hidden`.
  - Headline size bumped further at wider breakpoints
    (`text-5xl sm:text-7xl lg:text-8xl`, was capped at `sm:text-6xl`) now
    that there's real room to use on desktop; buttons/padding scaled up to
    match at `sm:`.
  - Verified the same way as above: clean build, dev server serves both
    changed modules with no compile errors. Still no real-browser screenshot
    available in this sandbox.
- **Second follow-up, same session — two direct user questions:**
  1. "Why isn't the nav inside that box?" — `PublicLayout.jsx`'s header used
     `bg-[#060C16]` (the documented header/footer shade) with a
     `border-b`, one step darker than the hero's `bg-[#0A1220]` — that
     color step plus the border was the seam making the nav read as a
     separate strip stacked ABOVE the hero, not part of it. Changed the
     header to `bg-[#0A1220]/90 backdrop-blur-sm`, no border — same color as
     the hero, so at the top of Home the logo/nav now visually sits INSIDE
     the hero panel; the semi-transparency + blur keeps it working as a
     sticky header once scrolled past the hero into plain content on any
     page. Footer's `#060C16` untouched — not part of the complaint, and
     unrelated to the hero.
  2. "Why can't I change the picture in Super Admin?" — because the "Home
     banner" (`hero`) slot in Site Images had nothing left rendering it,
     exactly the tradeoff flagged when the hero was redesigned. Rather than
     leave a confusing dead upload control, removed the `hero` entry from
     `backend/src/models/SiteImage.js`'s `SLOTS` — the Site Images admin
     page renders entirely off that list, so "Home banner" simply stops
     being offered there. Any existing `SiteImage` doc with `key: 'hero'` in
     the DB is now harmless orphaned data (not cleaned up — no UI reads it).

## 2026-09 — Bug: full-bleed hero was actually clipping text on mobile

- User feedback: "the UI looks bad." This time actually verified with a real
  rendered screenshot instead of trusting `npm run build` — found a genuine
  bug the build could never have caught (it's layout, not syntax).
- **Root cause**: the hero's `w-screen` + `-ml-[50vw]/-mr-[50vw]` full-bleed
  trick (added two sessions ago) is a well-known CSS footgun — on a page tall
  enough to have a vertical scrollbar, Chromium's `100vw` includes the
  scrollbar's own width, so the breakout computed slightly WIDER than the
  actual visible viewport. Combined with the headline sitting at `text-5xl`
  (48px) — too large for "INTER-BARANGAY" to fit a 390px phone width with
  padding even without that bug (14 caps chars × ~0.635em/char × 48px ≈
  426px, more than the ~350px available) — the result was the headline AND
  the nav bar visibly cut off on the right edge on phone-width screens.
  Confirmed by screenshot, not just math: `INTER-BARANGA` (missing the Y)
  and a cut-off "Titles" nav item.
- **Fix**: dropped the `100vw` breakout entirely — too fragile for how
  little it added. The hero now spans its normal container (already
  1400px — see the container-width fix above) using `-mx-4 lg:-mx-8` to
  cancel exactly the `<main>` padding it sits inside, which is math relative
  to a KNOWN fixed-width ancestor, never the raw viewport, so there's no
  scrollbar-inclusion bug possible. Reads as effectively full-bleed on
  anything but an ultra-wide monitor. Headline size corrected to
  `text-4xl sm:text-6xl lg:text-8xl` (was `text-5xl sm:text-7xl lg:text-8xl`)
  — the mobile base is now sized with real margin instead of exactly at the
  edge of overflowing. Added `break-words` on the headline and `flex-wrap`
  on the button row as belt-and-suspenders.
- **Verification tooling note**: this environment has no project "run"
  skill and no Playwright, but DOES have a local Edge/Chrome install —
  used `msedge --headless=new --window-size=W,H --screenshot=out.png` to
  actually render and inspect the page for the first time this session,
  which is what caught this (a clean `npm run build` cannot catch a CSS
  layout bug). Also discovered this headless Edge enforces a minimum
  internal viewport width somewhere around ~490px regardless of a smaller
  requested `--window-size` — so `--window-size=390,…` silently rendered
  wider than requested. Verified the real 390px case via font-metrics math
  instead (calibrated against a working screenshot at a known width) and
  confirmed the wider case cleanly via an un-clamped ~576px screenshot.
  Worth setting up a real project run/screenshot skill (`/run-skill-generator`)
  if this kind of visual check is going to keep coming up.

## 2026-09 — The "can't change the banner" report was a stale dev server, not code

- Root cause, confirmed by inspecting the actual running process: the
  backend on port 5000 was started as plain `node server.js` (the `npm
  start` command), not `npm run dev` (nodemon) — so it had never reloaded
  ANY backend edit from this entire session, hero-slot removal included.
  Killed the stale process and restarted it with `npm run dev`; confirmed
  via its own log it reconnected to MongoDB and — crucially — that nodemon
  auto-restarted cleanly on the very next backend edit (the slot restore,
  below), so this specific class of "the fix is real but nothing's running
  it" confusion shouldn't recur for this dev setup.
- **The hero photo is back**, by request, restored properly rather than
  reverting the redesign: `SiteImage.js`'s `SLOTS` gets `hero` back, and
  `Home.jsx`'s hero renders it as a full absolute-positioned BACKGROUND
  layer behind the bold headline (not the old fixed-height strip), with a
  `bg-gradient-to-r` overlay — dark on the left where the text sits, lighter
  on the right so the photo actually shows. Falls back to PublicUI's own
  "Sample image" placeholder when nothing's uploaded yet (same as the
  league/barangay slots), which the overlay happens to mostly hide anyway
  since its colors are so close to the page background — looks intentional
  either way, before or after a real photo is uploaded.
- Verified with real screenshots again (not just build) against the user's
  OWN running dev servers (ports 5173/5000) post-restart: hero renders
  correctly with no photo uploaded yet, ring accent visible, no overflow at
  either a phone-ish or desktop width.

## 2026-09 — Hero background now reaches behind the header; footer "gap" was a test artifact, not a bug

- User: "why does the box not fully taking the upper part of the site" — the
  hero's background/photo started right below the header instead of
  reaching the actual top of the page, leaving the nav on its own flat
  strip even though the flat COLORS already matched. Fixed in `Home.jsx`:
  the hero section now has `-mt-20` pulling its background up underneath
  the sticky header (which sits at `z-30` and is ~90% opaque with a blur,
  so it still reads clearly on top), with matching extra top padding so the
  actual headline text stays exactly where it was — only the background
  moved. Sized conservatively (net ~56px of real overlap into the header's
  box after `<main>`'s own top padding eats into the raw 80px) so it can't
  overshoot and peek out above the header at any breakpoint.
- User also asked to fix the footer's mobile "spot," reporting a bad gap
  above it. Investigated with real screenshots at several heights before
  touching anything, given two earlier rounds this session of shipping a
  layout fix on math/assumptions alone that turned out wrong on screenshot.
  **Found no real bug**: a first test screenshot at an artificial 2600px-tall
  window DID show a huge empty gap before the footer — but that's
  `PublicLayout`'s `<main className="flex-1 ...">` inside a
  `min-h-screen flex flex-col` shell doing exactly what it's supposed to (a
  "sticky footer" pattern: stretch to push the footer to the bottom of a
  SHORT page instead of leaving it floating mid-screen). The actual page
  content at 600px width is ~1500px tall — far taller than any real phone
  viewport (typically 650–950px) — so on a real device there's no leftover
  space for `flex-1` to fill and the footer follows the content immediately,
  confirmed by re-testing at 1400px and 1550px window heights (footer sits
  right after "Browse the teams →" with only its normal border/margin, no
  gap). The 2600px test window was an artifact of trying to capture the
  "whole page" in one screenshot, not a realistic viewport — asked the user
  for a screenshot or more specific description rather than ship a change
  for a bug that couldn't be reproduced at any real device size.
  Follow-up: asked which of "gap / cluttered / too small" they meant — they
  picked cluttered + too small (not the gap, confirming it was the test
  artifact). Fixed `PublicLayout.jsx`'s footer for real: mobile-only bumped
  every footer text size up one step (10-11px read as genuinely small held
  at arm's length — headings `text-xs`→`text-sm`, body `text-[11px]`→
  `text-[13px]`, copyright `text-[10px]`→`text-[11px]`, all still collapsing
  back to the original compact sizing at `sm:`) and turned the 7-item
  "Explore" link list — one long stacked column, same height as the whole
  nav, no visual organisation — into a 2-column `inline-grid` block,
  centered as a unit under its heading with each link left-aligned inside
  its own cell. Desktop (`sm:` and up) verified pixel-identical to before.

## 2026-09 — Instruction modal: screenshots out, icon + text in

- User asked to drop screenshots from the first-login "How this works"
  modal in favor of text + icons. Real reasoning, not just preference: those
  screenshots (captured Sep 17) were already partly stale by the time of
  this request — the Review Queue, Barangay Admin roster, and Document
  Submission screens all changed again in THIS session (the colored
  flag-reason callouts) — and every future UI pass will keep doing the same
  thing. An icon can't go stale.
- `frontend/src/lib/instructionContent.js`: every step's `screenshot: "..."`
  path replaced with an `icon` (a lucide-react component reference) —
  `LayoutDashboard`/`CalendarRange`/`ClipboardList`/`UserCheck`/`Settings2`/
  `Trophy`/`KeyRound` for Super Admin, `Building2`/`UserPlus`/
  `ClipboardList`/`Send` for Barangay Admin, `Radio`/`ListChecks`/`Play`/
  `Repeat`/`Flag` for Organizer — picked per step's actual content, not
  generic.
- `frontend/src/components/InstructionModal.jsx`: `StepImage` (the
  `<img>` + "screenshot coming soon" placeholder fallback) replaced with
  `StepIcon` — the icon shown large (size-10) in a soft `bg-primary/10`
  rounded box, same visual language as the icon-tint treatment already used
  on the Super Admin Dashboard's stat tiles.
- Deleted `frontend/public/instructions/` entirely (17 tracked files: 16
  PNGs + its README) via `git rm` — nothing references that path anymore.
- Also removed 3 untracked reference `.jpg` files the user had dropped in
  the repo root (Instagram screenshots used earlier this session to discuss
  the Home hero redesign) — served their purpose, never part of the app.

## 2026-09 — Header: bigger logo, quieter/smaller desktop nav, animated hover underline

- User shared one more reference image (same "Bounce" site) pointing at its
  header specifically: a big bold logo with a small, understated nav sitting
  directly on the hero, with a hover "motion" feel. `PublicLayout.jsx`:
  - Logo bumped `h-9` → `h-11` (both mobile and desktop share the same
    `<img>`, so both got bigger).
  - Desktop nav (`sm:flex`) sized down `text-[15px]` → `text-[13px]`, gap
    tightened `gap-7` → `gap-6` — was reading too heavy next to the now-
    bigger logo; the logo should carry the visual weight, not the nav.
  - Each desktop link now animates its own underline in from the left on
    hover (`scale-x-0` → `scale-x-100`, 300ms eased) instead of an instant
    color/border flip shared via one static `linkClass` string — the
    "motion" touch asked for. Active state keeps the same idea, just starts
    fully grown. Did NOT add the `motion`/`framer-motion` package for this —
    a plain CSS transform transition reads the same for a single hover
    effect and keeps Public's bundle free of a new dependency; mobile's
    icon nav (touch, no real hover) still uses the original shared
    `linkClass`, untouched.
  - Verified with real screenshots (mobile + desktop) — logo/nav proportions
    and no overflow confirmed; the hover animation itself isn't something a
    static screenshot can prove, but it's a standard, low-risk Tailwind
    `group-hover` + `transform` pattern, not the viewport-unit kind of trick
    that broke things earlier this session.

## 2026-09 — Scroll-reveal animation (motion.dev-style), Home page

- User clarified the earlier "motion style" hover request further: wanted
  the scroll-triggered fade/slide-in reveal animation style seen on
  motion.dev specifically, applied to the page in general.
- Deliberately did NOT add the `motion` (formerly Framer Motion) package —
  a single scroll-reveal effect doesn't need a ~35-50kb animation library
  when an `IntersectionObserver` + a CSS transition gets the same visual
  result, and Public's bundle has stayed dependency-light on purpose all
  session (inline SVGs instead of lucide-react, no new libraries for the
  nav hover animation either).
  - New `frontend/src/hooks/useInView.js` — a small reusable hook (matches
    the existing `hooks/useDragScroll.js` pattern): observes an element,
    flips `inView` true once it scrolls into the viewport, then disconnects
    (animates ONCE, never replays on scroll back up/down — a page that
    keeps re-triggering its own entrance animation reads as gimmicky).
    Respects `prefers-reduced-motion` by skipping straight to visible
    instead of leaving content stuck at `opacity-0` for anyone who can't
    see a transition play.
  - New `Reveal` component in `PublicUI.jsx`: wraps any section, fades +
    slides it up 8 (`translate-y-8` → `translate-y-0`) over 700ms once
    `useInView` fires. Takes a `delay` (ms) prop for staggering a row of
    siblings.
  - Wired into `Home.jsx`'s below-the-fold sections: the 3 stat tiles
    cascade in with a 100ms stagger between each, then Live/Today panels,
    "About the league," "Kolambugan," and "Recent results" each reveal as
    they're scrolled to. The hero itself is NOT wrapped — it's above the
    fold and already visible on load, so there's nothing to "reveal" on
    scroll for it.
  - Verified: clean build, and a full-page-height screenshot confirms the
    wrapped sections render at their correct final layout/opacity (not
    stuck invisible) — a static screenshot can't demonstrate the scroll-
    triggered transition itself, only that the pattern doesn't break
    anything at rest.
## Sep 2026 — Cross-barangay flag direction fixed (bug)

- **Bug:** `allowsCrossBarangay` (League Setup checkbox) was being read off
  the PLAYER's home barangay in `decideFromCandidates()`
  (`services/prescreen.js`) — so a checked barangay's *residents* could play
  for other barangays, while a checked barangay's *own team* got no extra
  freedom. That is the opposite of the intended rule.
- **Correct rule (Super Admin):** the flag is read from the TEAM's barangay. A
  checked barangay's team may field players from ANY barangay (checked or
  unchecked); an unchecked barangay's team may field only its own
  residents. Anything else is `flagged` with the reason "Listed under X, not
  Y — Y doesn't allow cross-barangay players".
- **Changed:** `services/prescreen.js` (decision + removed the now-unused
  `loadBrgyByName` plumbing), `routes/referenceList.js` (the team's barangay
  is now populated with `allowsCrossBarangay` — it previously selected only
  `name`, which would have made the Reference List page's live cross-check
  see the flag as undefined), League Setup's description text, and the
  comments on the Barangay model / cross route.
- **Verified:** 6 unit cases on `decideFromCandidates` (own barangay, outsider
  on an unchecked team, checked team taking players from unchecked AND
  checked barangays, checked team's own resident, and an unchecked team +
  player from a checked home barangay — which used to pass and now flags).
- **Follow-up needed:** players screened BEFORE this fix carry stale
  statuses until a re-screen runs (toggle any barangay's checkbox off/on, or
  run `rescreenSeason`). Not run automatically — it can reopen verified teams.

## 2026-09 — Instruction modal: wide two-pane layout, screenshots back (reverses the entry above)

- Super Admin asked for the modal to be wider: explanation on the LEFT (with
  shadcn `Separator`s), the step's screenshot on the RIGHT, click to enlarge.
  This reverses "screenshots out, icon + text in" — the stale-screenshot risk
  is still real, so the icon stays as the fallback and the README says to
  re-capture after UI passes.
- `InstructionModal.jsx` rebuilt: `sm:max-w-5xl`, left = title + description +
  `Separator`s + a clickable numbered step list; right = `StepShot` (image
  button that opens a nested `Dialog` lightbox, "Click to enlarge" hint).
  Stacks and scrolls on narrow screens. A missing/failed image falls back to
  the step's icon, so nothing breaks before the files exist.
- `instructionContent.js`: each step now derives `image` =
  `/instructions/<role>-<step>.png` (`super-admin-1..7`, `barangay-admin-1..4`,
  `organizer-1..5`). Re-added `frontend/public/instructions/` with a README
  listing the expected filenames — **the PNGs themselves still need to be
  captured and dropped in.**

## 2026-09 — Bug: dark/light mode applied to every account in the browser

- **Bug:** the theme preference lived under ONE `localStorage` key
  (`brgy-theme`), so a Super Admin choosing dark made the next Barangay
  Admin / Organizer to log in on that browser get dark too.
- **Fix:** the key is now `brgy-theme:<userId>` (`lib/theme.js`;
  `AdminLayout.jsx` passes `user.id`). The old shared key is ignored — every
  account starts on light once. Still browser-local (a second device starts on
  light).

## 2026-09 — Public Home: hero rebuilt (several passes), header re-laid-out

Driven by the Super Admin's sketch (`bugo ka.png`), a reference page
(`public ui.jpg`, "Bounce") and then explicit written specs. Final state:
- **Header** (`PublicLayout.jsx`): logo left, nav centred at `lg+` (wraps to
  its own row below `lg`; phones keep the icon nav), season name as a bordered
  pill on the right.
- **Hero** (`Home.jsx`): the Site Images `hero` slot at full opacity/colour
  under ONE gradient scrim; a left-aligned two-line **Anton** headline
  (white / `#D9A441`, `leading-[0.82]`, `clamp()`-sized on width AND height so
  it can't outgrow short screens); copy block 28px below in normal flow
  (subhead, one line of body, gold "View matches" pill + outlined
  "Standings"); solid `#0C3550` + the same scrim when no hero image is set.
  Sits flush below the nav; the stat tiles start below the fold. Intermediate
  versions tried and dropped: photo at 25% + luminosity blend (too faint), an
  absolutely-positioned cut-out layer over the headline (removed — needs a
  transparent player PNG that doesn't exist), a live-match `HeroMatchCard`.
- `SiteImage` (`PublicUI.jsx`) gained an opt-in `hideOnFail` prop (renders
  nothing instead of the dashed "Sample image" box). Upload/crop/focal code
  untouched. Anton added to the Google Fonts link in `index.html`.
- Heads-up: the hero photo now renders full-bleed at full colour, so a tiny
  file (the dev DB's is ~7 KB) looks blurry — upload >= ~1920px wide.
- The "no viewport-edge full-bleed" rule is unchanged for the hero (it
  clipped text on mobile); the new marquee is the one exception.

## 2026-09 — Scroll-reveal moved to Motion (`components/Reveal.jsx`)

- `npm i motion`; imported from `"motion/react"`. New `Reveal` (fade + up 24px
  once, `margin: "-80px"`, 0.5s ease `[0.22,1,0.36,1]`, `delay` in seconds,
  `y` prop) plus `RevealGroup`/`RevealItem` (`staggerChildren: 0.08`).
  REPLACED the old CSS `Reveal` in `PublicUI.jsx` and deleted
  `hooks/useInView.js`.
- Wrapped: Home (two static stat tiles, Today, About/Kolambugan sections,
  Recent results), Standings (each group table), Brackets (each PANEL),
  Teams + Players (staggered card grids), About (all sections).
- **Deliberately NOT wrapped** (poll every 10-15s / update mid-match): the
  hero, Home's LIVE NOW tile and "Live now" panel, Matches, Champions,
  Team detail, Players' "Top scorers". Items are keyed by stable `id`
  (this API's field is `id`, not `_id`), `once: true` everywhere.
- Deviations from the request: Brackets animates whole panels, not round
  columns (the SVG connector wires are measured from box positions — moving
  columns separately would offset them 24px permanently); no "champions
  strip" exists on Home; no static match-card grid exists (match cards are
  the live strips), so only team and player cards are staggered.
- Card grids switched from `gap-px bg-[#1C2430]` to per-card borders inside
  an `overflow-hidden` wrapper — otherwise unrevealed cards showed as grey
  blocks.
- **Always plays, ignores `prefers-reduced-motion`** (Super Admin decision:
  a Windows PC with "Show animations" off saw a static site and assumed it was
  broken). To restore: `<MotionConfig reducedMotion="user">`.

## 2026-09 — Public Home: sports marquee (`components/SportsMarquee.jsx`)

- Continuous right-to-left strip of sport NAMES between the Live panel and
  Today. Data from `GET /api/sports` (public) — never hardcoded, one entry per
  sport name (deduped; never split by division), renders nothing on
  failure/empty. Pure CSS loop (`.marquee-track` in `index.css`), two identical
  copies (2nd `aria-hidden`) sliding -50%; each copy repeats the list if it's
  narrower than the screen. Constant 80px/s measured from the real width
  (re-measured on font load/resize) so loop time scales with the sport count
  (~34s at 7 sports on a wide screen). Pauses on hover; edge fades; Anton 28px.
- Honours `prefers-reduced-motion: reduce` per spec (static centred row) —
  unlike the scroll-reveals above.
- Deviation: the request said "the same list the sport tabs use"; the tabs
  are built from this season's tournaments, which would miss a sport with no
  tournament yet. `/api/sports` satisfies "added/deleted in League Setup
  appears/disappears" directly, so that is what it uses.

## 2026-09 — Lenis smooth scrolling (public layout only) + sticky header bug

- `npm i lenis`. Initialised in `PublicLayout.jsx` (`useLenis`) only — admin
  and organizer pages keep native scrolling. `duration: 1.1`, expo ease-out,
  `smoothWheel`, `syncTouch: false` (Lenis v1's name for the old
  `smoothTouch: false`; touch keeps native momentum), `autoRaf`. Skipped
  entirely under `prefers-reduced-motion: reduce`; destroyed on unmount.
  `ScrollToTop` goes through `lenis.scrollTo(0, {immediate, force})` when it's
  running. No Lenis<->Motion sync was needed (reveals verified to still fire).
- **Bug found while verifying (pre-existing, not caused by Lenis): the sticky
  public header never actually stuck.** The layout root's `overflow-x-hidden`
  makes it a scroll container (`overflow-y: auto`), so `position: sticky`
  attached to that div. Fixed with `overflow-x-clip`.
- Verified via headless Edge over CDP: wheel glide 661 -> 933 -> 999 -> 1013px;
  header `top` stays 0 after scrolling (Lenis on and off); no horizontal
  overflow; nav click lands at the top; Back restores the previous position
  (same as without Lenis); `/login` and the admin redirect have no
  `html.lenis`; Lenis is destroyed on leaving the public layout.
- Not verifiable headless: real touch behaviour and a physical mouse wheel.

## 2026-09 — Thesis true-up note: cross-barangay direction

- The verification rule was documented (and implemented) as "residents of a
  small/remote barangay may play for ANOTHER barangay's team". The intended
  rule is the reverse direction: a CHECKED barangay's TEAM may field players
  from ANY barangay; an UNCHECKED barangay's team only its own residents. Code
  fixed (see "Cross-barangay flag direction fixed" above) — the thesis text
  and the HIPO/meeting-notes wording should be trued up to say "teams of
  small/remote barangays may recruit from any barangay".

## 2026-09 — Animated admin theme toggle (circular reveal), one shared component

- `npm i react-theme-switch-animation`. New `components/ThemeToggle.jsx`
  (the ONLY toggle; rendered by `AdminLayout` for all three admin roles) uses
  `useModeAnimation({ animationType: CIRCLE, duration: 600 })` with the ref on
  the button, so the reveal expands from wherever it sits. Sun/moon icons,
  the `dark` class on `<html>` and the per-user localStorage persistence are
  unchanged; the hook only drives the animation — `AdminLayout`'s `theme`
  state is passed in as `isDarkMode` and stays the source of truth
  (`handleThemeChange` replaces `toggleTheme`). Public pages: untouched, no
  toggle, no colour changes.
- Removed the `.theme-transition` colour-fade CSS + its 300ms class toggling
  (superseded by the reveal; the fallbacks are meant to be instant).
- The hook also writes a global `localStorage.theme` key (unavoidable, never
  read by us).
- **Verified** in headless Edge over CDP with the real UI and a MOCKED API
  (no DB writes): reduced-motion -> no view transition, instant, no error;
  `document.startViewTransition` undefined -> instant, no error, no leftover
  `#theme-switch-style`; Super Admin and Barangay Admin pages -> one toggle,
  reveal plays, toggles back, state + storage correct.
- **Finding that changed the request:** with the organizer scoring screen open
  mid-match (mocked ongoing basketball match), the reveal DOES interfere with
  score entry — a View Transition makes the page non-interactive for ~0.75s
  and every real mouse tap landing in that window was swallowed (3 of 3),
  while taps after it registered. `::view-transition{pointer-events:none}`
  didn't fix it. Frames also dipped (~29fps avg, 7 frames >33ms, in
  software-rendered headless Edge — real-GPU numbers not measured). So the
  organizer scoring screen opts out: `AdminLayout` got an `animateTheme` prop
  (default true); `OrganizerScoring` passes `animateTheme={false}`, and the
  toggle there swaps instantly (re-verified: 4 of 4 taps registered, score
  34 -> 38, no view transition). Drop the prop to re-enable the animation.

## 2026-09 — Login page: photo behind the left brand panel

- Super Admin supplied `login-bg.jpg` (1366x768: basketball + football on the
  left, arena in the middle, esports on the right). Moved to
  `frontend/public/login-bg.jpg` and used as the background of `Login.jsx`'s
  desktop-only left panel with `object-cover object-left`, so only the LEFT
  side of the image (the basketball/football action) shows in the half-width
  panel; the arena/esports half is cropped off. One gradient scrim
  (`rgba(20,8,48,.55 -> .25 -> .88)`) keeps the white text legible. The old
  purple gradient stays underneath as the fallback if the file is missing
  (`onError` hides the `<img>`).
- Removed the scattered lucide sport-glyph backdrop (`SportsBackdrop`,
  `SPORT_GLYPHS`) and the two blurred colour blobs — the photo replaces them —
  plus the 9 icon imports only they used.
- Phones are unchanged (the panel is `hidden lg:flex`; they keep the logo mark).
- File is ~600 KB; fine for a login page, but re-compress it if load time on
  slow connections matters.

## 2026-09 — Login: React Bits "Gradient Waves" background (layered under the photo)

- Super Admin asked for React Bits' Gradient Waves on the login. Added
  `components/GradientWaves.jsx` (copied from React Bits per its copy-paste
  model, (c) 2026 David Haz, MIT + Commons Clause — allowed inside an
  application; attribution header kept; its one-rule `.css` file was inlined).
  New dependency: `ogl` (WebGL2 shader; the component pauses itself when
  off-screen or the tab is hidden).
- `Login.jsx` left brand panel, bottom to top: purple gradient (fallback) ->
  GradientWaves -> the photo (`login-bg.jpg`, left side via `object-left`,
  `mix-blend-screen` at 50%) -> one text-legibility scrim. Tuned palette
  (deep violet horizon/wave, `#8b5cff` crest, `fogDepth 60`, `amplitude 3`) so
  the waves read as dunes and the white text stays legible; brighter/warmer
  palettes were tried and rejected (washed out the text / off-brand).
- **Desktop only, and actually absent on phones:** the panel is `hidden
  lg:flex`, but a hidden element would still mount the WebGL canvas, so the
  waves are only rendered when `(min-width: 1024px)` matches (verified: 0
  canvases at 600px). Lazy-loaded (`React.lazy`) into its own ~15.7 KB gzip
  chunk, so `ogl` never touches the main bundle.
- `prefers-reduced-motion: reduce` -> `speed 0` (a frozen frame, not blank).
- Honest side effect: under the waves the photo is now only a faint texture
  (players barely visible). If the waves are the keeper, the photo layer can be
  deleted (saves a ~600 KB download); if the photo should be prominent, raise
  its opacity.

## 2026-09 — Login: photo removed, waves only (supersedes the two login entries above)

- Super Admin deleted `login-bg.jpg` ("we don't need it"). Removed the photo
  `<img>` layer from `Login.jsx`, so the panel is now: purple gradient
  (fallback) -> GradientWaves -> the text scrim. No request for a missing file,
  and ~600 KB less to download. The earlier "photo behind the left panel" and
  "waves layered under the photo" entries describe intermediate states.

## 2026-09 — Animation accessibility review (no code change)

- Reviewed every animation added this session for accessibility impact.
  Nothing flashes; all motion is small and non-essential. Honours
  `prefers-reduced-motion`: Lenis, marquee, login waves, theme-toggle reveal.
  Does not: Motion scroll-reveals (deliberate), pulsing LIVE dot, Tailwind
  skeleton/spinner animations.
- Known gaps, deliberately left for now (Super Admin: "see what the panel says
  at the mock defense"): marquee has hover-pause only (WCAG 2.2.2 wants a
  keyboard/touch-reachable pause), login waves keep the GPU busy on desktop.
  Fixes are listed in CLAUDE.md if they're wanted later. No formal audit or
  screen-reader test was done.

## 2026-09 — Barangay Admin can now delete their own team

- `DELETE /api/teams/:id` was Super-Admin-only (built for the orphan-cleanup
  tools — see the "Delete team + delete tournament" entry above). Opened it
  to the owning Barangay Admin as well, for their own team, scoped to
  `team.status !== 'verified'` — once a team is verified it's locked into
  tournament generation, so undoing that still needs the Super Admin.
  Reuses the exact same cascade (TeamPlayer links, each player's Documents +
  GridFS files, photo, the Player record itself if not shared with another
  team) and the same in-any-match guard as the existing Super Admin path.
- `BrgyDashboard.jsx`: a red trash-icon button next to "Edit roster"/"View
  roster" on each team row in "My teams," hidden once that team is
  verified. Confirms through the shared `ConfirmDialog` (`danger: true`),
  same pattern as every other destructive action in the admin UI, and
  reports failures (e.g. the team is already in a match) through
  `ErrorDialog`.

## 2026-09 — Review Queue: real zoom on a document, not just a bigger view

- Reported: clicking a submitted document (e.g. Parental Consent) in the
  Review Queue's player modal opened `Lightbox`, but that was only ever
  "fit to screen" (`max-h-[85vh] object-contain`) — no actual zoom, so a
  phone photo of a small-print ID/certificate was still unreadable.
- `Lightbox` (`ReviewQueue.jsx`) now supports real zoom + pan: mouse wheel
  to zoom (centered increments of 0.4, clamped 1x–5x), double-click to
  toggle between fit and 2.5x, +/-/reset buttons in a floating control bar
  (also the only way to zoom on a touch device with no wheel), and
  drag-to-pan once zoomed in (pointer events, so mouse drag and
  single-finger touch drag both work). Panning resets when zoom returns to
  1x. Added an explicit close (X) button since the dialog previously had
  none at all — the old version relied on ESC/click-outside only, easy to
  miss on a near-fullscreen black overlay.
- Scoped to the image-document case only (`DocumentView`'s existing
  `type.startsWith("image/")` branch) — a non-image document still opens
  in a new tab via the browser's own PDF viewer, unchanged.

## 2026-09 — Reference List: informational highlight for under-15 same-name rows

- Requested: while reviewing a `needs_document` player under 15 (they route
  straight there with no reference-list lookup, since the list starts at
  15 — see `decideFromCandidates`'s `MINOR_AGE` check), the Super Admin
  wanted a way to see whether that child's name shows up in the reference
  list anyway, as a hint toward whether the family is really from the
  municipality versus elsewhere, while judging the uploaded document.
- Deliberately did NOT touch `decideFromCandidates` — that early return for
  under-15 players is the confirmed rule (a voters' list can't contain a
  minor, so nothing should ever count as an official match for one) and
  drives the player's real `eligibilityStatus`. Instead, `GET
  /api/reference-list` (`referenceList.js`) now also builds a second,
  parallel map for players under 15 who have NO official match: a plain
  name lookup against the same in-memory reference index, tagged
  `minorMatches` on each affected row with `{ playerName, teamName,
  sameBarangay }`. Exported `ageFrom` from `prescreen.js` (alongside the
  already-exported `decideFromCandidates`/`norm`/`MINOR_AGE`) to compute
  this without duplicating the age math.
- `ReferenceList.jsx`: rows with a `minorMatches` entry (and no real
  `matches`) get a distinct **purple** highlight — separate from green
  (eligible), red (flagged), and amber (multiple players share the name) —
  with a "Same name, under 15 · same barangay" label and explicit copy that
  the player still needs a document regardless; this is a hint, not a
  verdict. The Review Queue's existing "View in Reference List →" link
  (unchanged) already carries the player's name over as `?q=`, so it lands
  on and scrolls to this same highlighted row for a `needs_document`+minor
  player exactly like it does for an older player's real match.

## 2026-09 — Approving a needs-document player now actually clears the warning

- Reported: after clicking Approve in the Review Queue on a `needs_document`
  player, the badge flipped to "Eligible" but the amber/purple reason text
  underneath ("Under 15 — needs parental consent and documents", or the
  purple reference-list hint) stayed put — looked like the approval hadn't
  really taken effect.
- **Root cause**: `POST /api/review/teams/:teamId/players/:playerId/approve`
  only ever set `eligibilityStatus: 'eligible'`, never clearing
  `flagReason` — unlike the automated pre-screen paths
  (`prescreenTeam`/`prescreenPlayer`/`rescreenSeason`), which always write
  `reason: ''` alongside `status: 'eligible'`. `ReasonCallout` in
  `ReviewQueue.jsx` only checked `if (!reason) return null` — it never
  checked `status`, so a stale non-empty reason kept rendering. Fixed both
  sides: the approve route now also `$set`s `flagReason: ''`, and
  `ReasonCallout` additionally bails when `status === 'eligible'`, so it
  can't happen again even against already-stale data.
- **Reference List highlight now changes on approval too.** The purple
  "informational, under 15" highlight added in the previous session was
  keyed purely on the player's age/name, with no regard for whether they'd
  since been approved — so it stayed purple forever once shown.
  `GET /api/reference-list` now checks the minor's CURRENT
  `eligibilityStatus`: still `needs_document`/`flagged`/`pending` keeps the
  purple informational-only row as before, but once the Super Admin
  approves them, that same-name row is promoted into the real `matches` map
  with a new `status: 'approved_minor'` — turning the row the normal green
  "matched" color, labeled "Approved · document review" instead of
  "Matched" (to keep it honest that this came from a document, not an
  automatic list hit), so the reference list visibly reflects that the
  case is resolved.

## 2026-09 — Review Queue: can't approve a needs_document player with no document

- Requested: block approving a `needs_document` player who hasn't actually
  had a document uploaded — previously Approve worked regardless, so a
  Super Admin could click through and mark someone eligible with nothing
  to base it on.
- Scoped deliberately to `needs_document` only, not every non-eligible
  status: that status means there's NO reference-list match at all, so a
  submitted document is the only possible evidence for an approval.
  `flagged` (cross-barangay) is a different kind of case — the issue is the
  barangay rule, not missing paperwork — so it's untouched and still
  approvable on judgment alone, same as before.
- Backend (`POST /api/review/teams/:teamId/players/:playerId/approve`):
  when the player's current `eligibilityStatus` is `needs_document`, counts
  their `Document` records first and 400s with an explicit message if
  there are none. This is the real enforcement — reachable directly, not
  just from the UI.
- Frontend (`ReviewQueue.jsx`'s `PlayerModal`): Approve is disabled (with a
  `title` tooltip) and the helper text under the action row switches to an
  amber "No document uploaded yet — Approve is disabled until the
  Barangay Admin submits one" whenever `eligibilityStatus === "needs_document"`
  and `documents` is empty, so the block is visible before a click rather
  than only surfacing as an error after one.

## 2026-09 — Same stale-flagReason bug, but in two more places

- **Reported**: an already-approved player on Mukas's Basketball U15 team
  still showed the "Under 15 — needs parental consent and documents"
  warning on the Barangay Admin's own roster view, despite being eligible.
- **Root cause**: `ReasonCallout` — the component that renders that amber
  warning — is defined **three times** in this codebase, once per page
  that needed it (`ReviewQueue.jsx`, `BrgyDashboard.jsx`, `Documents.jsx`),
  copy-pasted rather than shared. The previous session's fix (clearing
  `flagReason` on approve, plus a `status === "eligible"` guard so stale
  data can't render even if it slips through) was only ever applied to
  `ReviewQueue.jsx`'s copy — the other two were never touched, so
  `BrgyDashboard.jsx` and `Documents.jsx` kept rendering a leftover reason
  for any player approved before that fix shipped.
- Added the same `if (!reason || status === "eligible") return null;` guard
  to both remaining copies.
- **Data repair**: queried the live DB directly and found exactly one
  affected player in the whole database — Alfredo Salazar (Mukas
  Basketball U15), approved before the fix with a stale flagReason still
  on file. Cleared it by hand (temporary script, run and deleted, not
  committed) rather than leaving it to the frontend guard alone, since
  `Player.flagReason` shouldn't carry incorrect data regardless of which
  page is looking at it. Verified via the live DB that no other player is
  in this state.
- Not extracted into a shared component in this pass — noted here as a
  real "copy-pasted in three places" risk for next time one of them needs
  a fix like this again.

## 2026-09 — Public Teams page: drag-scroll carousel of big crest cards

- Requested: turn the Teams page's per-sport/division team list into
  bigger boxes, laid out as a carousel that can be grabbed and dragged, or
  scrolled with next/prev controls.
- `Teams.jsx`: each sport/division group is now a horizontally-scrolling
  row (`TeamGroupPanel`) instead of a wrapping grid. Reuses the existing
  `hooks/useDragScroll.js` (already proven on the Super Admin and public
  Brackets bracket trees) for click-and-drag panning, plus native touch
  scroll. Added round prev/next arrow buttons (`CarouselArrow`, new in
  `PublicUI.jsx`, same inline-SVG convention as `SearchInput` — no
  lucide-react on Public) rendered in the panel header via a new `actions`
  prop on `Panel`; they track scroll position via a `scroll`/`resize`
  listener and disable themselves at either end, and the pair only renders
  at all once the row actually overflows (`scrollWidth > clientWidth`) —
  a 1-2 team group just shows the boxes with nothing to scroll.
- `TeamCard`: bigger box (`w-44 sm:w-48`, `snap-start` for scroll-snap),
  the barangay crest as a full-bleed cover image at the top (see below),
  team name/barangay/format below.
- **Crest got a `variant="cover"` mode** (`PublicUI.jsx`): the barangay
  logo now fills the full width of its container at a 1:1 ratio
  (`w-full aspect-square object-cover`) instead of sitting as a small
  fixed-size icon — asked for directly after the first version showed the
  crest as a small padded square floating inside the big box, which
  didn't read as "fitted." Default `variant="icon"` (the original
  fixed-`size`-px behavior) is untouched, so every other `Crest` call site
  (header, scoreboards, standings, brackets, team lists elsewhere) is
  unaffected — only `Teams.jsx`'s new cards opt into `cover`.
- **Verification note**: a plain `msedge --headless=new --screenshot`
  capture (even with `--virtual-time-budget=15000`) rendered the cards as
  a big BLANK box with a phantom vertical scrollbar — looked like a real
  layout bug. Turned out to be a false signal: Motion's `whileInView`
  (IntersectionObserver-driven) never fires within that capture mode, so
  every card stayed at its `opacity:0` pre-reveal state while still
  occupying full layout height, and CSS's forced-`overflow-y` rule (only
  `overflow-x` was set) then showed a vertical scrollbar for a box that
  was never meant to scroll vertically at all. Confirmed via a small
  throwaway Chrome DevTools Protocol script (`Page.navigate` + a real
  `setTimeout` wall-clock wait, not virtual time) that in an actually-timed
  render `scrollHeight === clientHeight` (no bogus vertical overflow) and
  every card reaches `opacity:1`. **Takeaway for next time**: don't trust
  a `--virtual-time-budget` screenshot of anything using Motion's
  `whileInView` — it can show a false "blank/broken" state; verify with a
  real wall-clock-timed capture (CDP with an actual `setTimeout`, or just
  ask the user to look) instead.

## 2026-09 — Review Queue: pick a barangay instead of scrolling every team

- Requested: the Review Queue's flat list of every submitted team in the
  season made the Super Admin scroll through everything to find one
  barangay's teams. Wanted a way to pick a barangay first, a "cleared"
  indicator once that barangay's teams are all verified, and a red
  count badge — both on the Review Queue itself and wherever it's
  reached from — showing how many teams still need a verdict.
- `GET /api/review/queue` (`backend/src/routes/review.js`) now also
  returns `barangays` (every barangay in the DB — not just ones with a
  pending team, so the picker always lists all of them — each tagged
  `{ pendingTeams, verifiedTeams, cleared }`, computed from this
  season's SUBMITTED teams only, same `submittedAt != null` gate the
  queue itself uses) and `totalPending` (season-wide count, for the
  sidebar badge). Each team in the existing `teams` array also gained
  `barangayId` so the frontend can filter by it reliably (name alone
  isn't a safe key — barangay names aren't guaranteed unique the way an
  id is).
- `ReviewQueue.jsx`: a new "Barangays" card up top renders one pill per
  barangay (`BarangayChip`) plus an "All barangays" pill — click one to
  filter the list below to just that barangay's pending teams. A pill
  shows a red count badge if it has teams needing a verdict, a green
  "Cleared" badge (with a checkmark) if every team it submitted is
  already verified, or nothing if it hasn't submitted anything yet this
  season. Selecting a barangay with nothing pending shows a specific
  message — "cleared" (already all verified) vs. "hasn't submitted any
  teams yet" — instead of the generic empty state, which only applies to
  the true season-wide zero case now.
- **Red badge on the sidebar itself**, not just inside the page: added
  generic `badge` support to `AdminLayout.jsx` — an item can set
  `badge: "reviewPending"` (done for Review Queue in `menus.js`) and the
  layout fetches `/api/review/queue` once per mount (i.e. on every
  admin-page navigation, so it stays fresh without a poll interval) and
  renders the `totalPending` count as a red pill after the label
  (expanded sidebar) or a small red dot on the icon (collapsed rail).
  Scoped so only menus that actually declare the badge trigger the
  fetch — Barangay Admin/Organizer layouts never call
  `/api/review/queue` (which is super-admin-only anyway).
- **Verification**: logged in via a real login (`POST /api/auth/login`,
  a `lydo_head` dev account) through a scripted Chrome DevTools Protocol
  session (seeded `localStorage` with the returned token, same as the
  app does) rather than a plain headless screenshot, since this page is
  behind auth — confirmed the sidebar badge count, the per-barangay red/
  green pills, and that clicking a barangay ("Mukas") actually filters
  the list and shows its correct "cleared" message.
- **Process note**: the first pass through this edit was run through
  `prettier` to fix indentation from a nested nested-JSX edit, which
  reformatted both touched files wholesale (631/158 changed lines)
  even though this project has no prettier config and doesn't use that
  style anywhere else — a needlessly noisy diff. Reverted both files to
  their last-committed content and reapplied the same logical changes
  by hand, matching the codebase's existing formatting. Don't run a
  whole-file formatter on a codebase that doesn't already use one —
  fix indentation by hand for just the lines actually touched.

## 2026-09 — "Cleared" was true for one verified team out of a full slate

- **Reported**: Matampay showed a green "Cleared" barangay chip in the
  Review Queue after having exactly ONE team verified, when the season
  actually runs far more sport/division slots than that (the user's own
  reference point, Austin Heights, had submitted around 10-11).
- **Root cause**: `cleared` was `stats.verified > 0 && stats.pending === 0`
  — true the moment WHATEVER a barangay happened to submit was fully
  verified, regardless of how much of the season it actually covered. A
  barangay that only ever submitted one Chess team read exactly the same
  as one that submitted a full slate.
- **Fix**: `GET /api/review/queue` (`backend/src/routes/review.js`) now
  computes `requiredSlots` — one slot per (sport, division) the season is
  actually running, from `Sport.find({ divisions: ... })` — deliberately
  NOT multiplied by `teamsPerBarangay`, since that field is a per-slot
  CEILING (Mobile Legends's second team is optional, "MAY field 2 teams"),
  never a requirement; one team completes a slot regardless of how many
  more it could hold. Per barangay, `completedSlots` counts the DISTINCT
  `sport|division` pairs it has a VERIFIED team in (a `Set`, so two
  verified ML teams in the same division still only count once).
  `cleared` is now `pending === 0 && completedSlots >= requiredSlots`.
- Also exposed `completedSlots`/`requiredSlots` on each barangay so the
  frontend isn't limited to a binary badge: `BarangayChip`
  (`ReviewQueue.jsx`) now shows a muted `x/N` count for a barangay that's
  partway there with nothing currently pending (Matampay's case — was
  previously invisible, neither red nor green), reserving green
  "Cleared" for the real thing. The barangay-detail empty state gained a
  matching third message for this case, distinct from "cleared" and
  "hasn't submitted anything yet."
- **Verified live**: after the fix, Matampay's chip reads "1/10" (gray,
  not green) and Mukas — which actually does have a verified team in
  every slot — still correctly reads "Cleared". `requiredSlots` came out
  to 10 in the current dev season, not a hardcoded 11; it's read from
  whatever sports/divisions are actually configured, so it tracks League
  Setup changes automatically rather than needing to be kept in sync by
  hand.

## 2026-09 — Teams carousel cards redone as full-bleed poster tiles

- Reported: the crest still didn't read as "fitted" in the big carousel
  boxes from the previous session — it only filled the TOP portion of the
  card, with the team name sitting separately below in its own padded
  area. Asked to make the logo actually fit the card and to highlight
  the name text.
- Redesigned `TeamCard` (`Teams.jsx`) as a full-bleed poster tile: the
  crest now fills the ENTIRE card (`aspect-[3/4]`), with the team name,
  barangay, and format pill overlaid at the BOTTOM on a dark gradient
  scrim (`bg-gradient-to-t from-black/95 via-black/60 to-transparent`)
  instead of living in a separate area below the image — the scrim is
  what "highlights" the text: bold white name, legible over any photo
  regardless of how bright or busy it is.
- `Crest`'s `variant="cover"` contract changed to match: it now fills
  its parent COMPLETELY (`absolute inset-0 object-cover`) instead of
  being its own `w-full aspect-square` block — the parent (the card) now
  owns the size/aspect-ratio and must be `relative`, and other content
  (the scrim + text) sits on top of it in the same stacking context.
  Only consumer is `Teams.jsx`'s `TeamCard`, so this didn't touch
  anything else using `Crest`'s default `variant="icon"`.
- Verified with a real (non-headless-artifact) screenshot — logos fill
  edge to edge, names read clearly over both a busy photo (Austin
  Heights) and a mostly-dark one (Mukas).

## 2026-09 — Public search bar: Motion focus glow + compact width

- Requested: animate the shared `SearchInput` (`PublicUI.jsx`, used by
  Teams and Players) with Motion, and separately, make it a compact box
  rather than the full-width bar it was stretching to.
- The clear (✕) button used to be a bare `{value && <button>}` — it just
  popped in and out with no transition. Now wrapped in
  `AnimatePresence`/`motion.button` (fade + scale, 0.15s). One real bug
  caught before it shipped: Motion composes `scale`/`x`/`y` into a single
  `transform`, so animating `scale` on an element vertically centered via
  Tailwind's `-translate-y-1/2` would have silently clobbered that
  centering. Fixed by giving the button its own constant `y: "-50%"` in
  every animation state (never itself animating) instead of the Tailwind
  translate class, so Motion composes it together with the scale
  correctly.
- Added a focus state: the search icon animates from slate to the site's
  one gold accent (`#F5A524`, `currentColor` via an animated `color`),
  and a soft gold glow (`animate`d `box-shadow`) appears around the
  input — the previous focus style was `border-[#1C2430]` to
  `border-[#2A3441]`, barely a visible shade apart. Reuses the same gold
  that already marks "active"/"live" everywhere else on Public (nav
  underline, live dot), rather than inventing a new color for this one
  state.
- **Width**: added `max-w-xs` (20rem/320px) to the wrapper — it was
  `w-full`, stretching to the full content width on desktop (over 1300px
  on the widest pages), which read as an oversized bar for what's just a
  short name/barangay query. Caps on all screen sizes; still shrinks
  fine on mobile since 320px roughly matches a small phone's viewport
  anyway.
- Verified live: typing "muk" filters the Teams list down to Mukas's
  entries with the clear button animating in, confirming the shared
  component still behaves correctly on top of the new animation/width.

## 2026-09 — Bug: the same player could be rostered on two of a barangay's teams

- **Reported**: for esports, a barangay can field 2 teams (Mobile
  Legends), and nothing stopped the same real player from being typed
  into BOTH rosters — team 1 already submitted, and its players could
  still be re-entered on team 2, letting one athlete effectively play for
  both of a barangay's entries in the same sport.
- **Root cause**: `POST /api/teams/:id/players` always `Player.create()`s
  a brand-new record — there was no check at all against players already
  on the barangay's OTHER teams. Two forms, typed independently, just
  become two separate `Player` documents with no link between them.
- **Fix** (`backend/src/routes/team.js`): added `siblingTeamRosterIndex(team)`
  — for the SAME barangay + sport + season, finds every OTHER team and
  indexes their players by `playerKey()` (name, case/whitespace-tolerant
  via `norm()` from `prescreen.js`, + birthdate — same identity-matching
  convention the residency cross-reference already uses, so two different
  people who happen to share a name aren't wrongly conflated). Wired into
  all three player-entry points:
  - `POST /:id/players` (manual add) — 409s before creating the `Player`.
  - `POST /:id/players/import` (CSV bulk) — the offending row is skipped
    and reported (`{row, reason}`), same shape as every other skip
    reason; the index is also updated as rows are accepted, so two rows
    in the SAME csv naming the same player are caught too, not just ones
    that clash with an already-saved sibling team.
  - `PATCH /:id/players/:playerId` ("Correct this player") — a rename
    that turns a player into a name+birthdate match for someone on
    another team is blocked the same way; only runs the check when the
    identity fields actually changed.
  - Deliberately NOT applied across different SPORTS or divisions — one
    athlete legitimately playing multiple sports this season is the
    confirmed, intentional many-to-many design (`players↔teams`); this
    only blocks the same barangay + same sport case.
- No frontend changes needed — both the manual add form and the CSV
  import already surface backend error/skip messages through the
  existing `ErrorDialog`/skipped-rows UI.
- **Verified against live data**: the HTTP route itself needs a real
  `barangay_admin` login (blocked by the 15-minute login rate limiter
  after repeated test attempts), so verified the underlying query logic
  directly against the real dev DB instead (temporary script, run and
  deleted, not committed) — confirmed a real player already on Matampay 1
  (Mobile Legends, submitted) is correctly BLOCKED from being re-added to
  Matampay 2 (draft, same barangay+sport), while a genuinely new name is
  correctly ALLOWED.
- Also double-checked the "esports only" report itself directly against
  the exact same query logic, cross-division (Austin Heights Basketball
  U15 vs U30, same barangay+sport, different divisions — `siblingTeamRosterIndex`
  doesn't filter by division at all) — confirmed the sibling-team lookup
  correctly finds a U30 team as a "sibling" when checking U15's context and
  vice versa, so the guard was never actually esports-specific. User
  retested and agreed — no code change was needed for that part.

## 2026-09 — Reference-list matching now REQUIRES middle initial + birthdate

- Requested: name-only matching (with birthdate only ever breaking a tie
  among same-name candidates) isn't accurate enough for a municipality this
  size — common surnames collide. Matching should require middle initial
  AND birthdate to agree, not just help disambiguate.
- **`ReferenceList` model** (`backend/src/models/ReferenceList.js`) gained
  a `middleName` field — NOT `required: true` at the schema level (the
  source list, still the SK Federation's own export today, may not always
  carry one, and a snapshot-replace upload shouldn't hard-fail over a
  missing column), but the matching logic below now treats a row missing
  it the same as a row missing `birthdate` always effectively did: it can
  never confirm a match on its own.
- **`decideFromCandidates`** (`backend/src/services/prescreen.js`): the
  candidate-narrowing step used to only apply a birthdate filter when MORE
  THAN ONE row shared the exact name (a tie-break), and never looked at
  middle name at all. Now EVERY candidate must have BOTH birthdate
  (exact day, `sameDay()`, already existed) AND middle initial
  (`sameMiddleInitial()`, new — compares just the first letter,
  case-insensitive, so a reference row's "Miguel" and a roster's "M."
  still match) agree with the player's own, before it's considered a
  candidate at all. Either side missing either field is excluded, not
  assumed — same "never guess, treat as NOT FOUND" principle the existing
  no-fuzzy-name-matching rule already used.
- **CSV upload** (`backend/src/routes/referenceList.js`): `canonicalKey()`
  now recognizes a middle name/initial column (`middle`, `mname`, `mi`,
  `middleinitial`, …). The upload response gained `hasMiddleNames` and
  `missingForMatch` (rows missing middle name and/or birthdate) so the
  Super Admin sees the gap immediately instead of discovering it later as
  an unexplained wave of `needs_document` results.
- **Reference List page** (`frontend/src/pages/admin/ReferenceList.jsx`):
  added a "Middle" column to the residents table; updated the upload result
  banner to show middle-name coverage and warn on `missingForMatch`; search
  now also matches against `middleName` (a single-letter token like "M" is
  no longer dropped as noise — it used to be, back when middle initials
  never existed anywhere in this data at all); updated the stale "no jersey
  numbers or middle initials" copy in two places.
- **⚠️ Real, immediate consequence on the live dev data, worth knowing
  before this ships anywhere real**: verified directly against the current
  17,000-row dev reference list — 100% have a birthdate, **0% have a
  middle name** (uploaded before this feature existed). Re-ran the new
  logic against 5 currently-`eligible` players: all 5 flipped to
  `needs_document`, because the reference ROW they'd have matched has no
  middle name to compare against — never mind that the player's own record
  does. **This isn't a bug — it's the direct, correct consequence of
  "require middle initial to be more accurate."** But it means NOTHING
  currently on the list can confirm a match until the Super Admin
  re-uploads a CSV that actually includes a middle-name column. Until
  then, expect a re-screen (editing a barangay's cross-play flag,
  correcting a player, etc.) to move previously-`eligible` players back to
  `needs_document` across the board.

## 2026-09 — Reference List: birthdate was never actually shown in the table

- **Asked**: why doesn't the Reference List table show birthdate?
- **Answer**: it never has — the table has always been Last name / First
  name / Barangay / Matched player, even though `birthdate` was already a
  real field on every record (`GET /api/reference-list` was already
  returning it; nothing was hidden server-side, the column was just never
  added to the table). Same gap the Middle column filled a moment ago,
  just not caught in that same pass.
- Added a **Birthdate** column between Middle and Barangay
  (`r.birthdate ? new Date(r.birthdate).toLocaleDateString() : "—"`),
  `colgroup`/`colSpan` updated for the 6th column. Verified live — every
  row in the current 17,000-row list shows a real date (matches the
  earlier finding that this list is 100% birthdates / 0% middle names).

## 2026-09 — Bug: uploading a new reference list didn't re-screen anyone

- **Reported**: a Mukas Badminton player still showed a `needs_document`
  warning on the roster even though the Reference List page showed them
  as fully matched.
- **Root cause**: between the last two sessions, the reference list was
  actually already replaced with a new CSV that includes middle names
  (checked live: went from 0/17,000 rows with a middle name to
  17,000/17,000). But `POST /api/reference-list` (the upload route) only
  ever did `deleteMany` + `insertMany` — it never re-ran anyone's
  screening. So this player's `Player.eligibilityStatus` was still
  whatever it was decided to be against the OLD list (when nothing could
  match, since that list had no middle names at all) — needs_document,
  and stuck there. The Reference List page itself was never wrong: its
  "matches" column is computed LIVE on every load (`decideFromCandidates`
  re-run fresh, not read from a stored field), so it correctly showed
  "Matched" against the NEW list the moment it was uploaded. The
  inconsistency was real: one view live, one view stale.
- **Fix**: `POST /api/reference-list` now calls `rescreenSeason()` right
  after replacing the list — same helper, same response shape
  (`{screened, changed, reopened}`), as the existing `allowsCrossBarangay`
  toggle in `reference.js`, which already re-screens for exactly this
  reason ("can move a player's eligibility in either direction without
  the player changing at all"). Replacing the WHOLE reference list is at
  least as consequential as flipping one barangay's flag — arguably more,
  since it can move every player in the season, not just one barangay's.
  The upload result message now reports how many players were
  re-screened and how many verified teams reopened, same wording the
  cross-barangay toggle already uses.
- **Data repair**: ran `rescreenSeason()` once by hand against the
  current live season (temporary script, run and deleted, not committed)
  to fix everyone already stuck stale from the list swap that already
  happened before this fix existed — **22 players changed status, 3
  verified teams reopened for review**. Confirmed the reported player
  (Manuel Abdullah, Mukas Badminton) now correctly reads `eligible` with
  no `flagReason`.

## 2026-09-20 — Bug: editing a wrong middle name never re-screened the player

- **Reported**: testing a Matampay player (Balindong 11214, Mark), editing
  the middle name to something wrong left the status at `eligible`; after
  the reference-list re-upload above, the same thing — a wrong middle
  name saved as `eligible` instead of flipping to `needs_document`.
- **Root cause**: `PATCH /api/teams/:id/players/:playerId`'s
  `identityChanged` check (the thing that decides whether to re-run
  `prescreenPlayer`) only compared `firstName`/`lastName`/`birthdate`. It
  predates the Sep 2026 change that made middle initial a REQUIRED part of
  a match (`sameMiddleInitial()` in `prescreen.js`) — before that, middle
  name was only ever a tie-break, so it made sense for it to not trigger a
  re-screen on its own. Once middle initial became load-bearing, this
  should have been updated too and wasn't: saving a middle-name-only edit
  updated `player.middleName` in the DB but never called `prescreenPlayer`,
  so `eligibilityStatus` just kept whatever value it already had.
- **Fix**: `middleName` added to `identityChanged` in
  `routes/team.js` (captured in `before` alongside first/last/birthdate).
  A middle-name edit now re-screens exactly like a name/birthdate edit
  does, including reopening an already-verified team if it comes back
  non-eligible.
- **Investigation on the real Matampay data turned up a separate, unrelated
  finding**: three duplicate `Player` records all named "Mark ... Balindong
  11214" existed on the same team (jerseys 1, 22, 23) — leftover test data,
  not a matching bug. Only jersey 1 (middle "S.") actually matches the
  reference list's one row for that name (middle "S."); jerseys 22 and 23
  both have middle "D." in the DB and correctly do NOT match. Jersey 23 was
  still showing stale `eligible` from before this fix existed — same class
  of staleness as the reference-list bug above, just triggered by a
  middle-name-only edit instead of a whole-list upload.
- **Data repair**: ran `rescreenSeason()` once by hand against the current
  live season (temporary script, run and deleted, not committed) to clear
  every status left stale by this bug — **181 players screened, 6 changed
  status, 0 verified teams reopened**. Jersey 23 above now correctly reads
  `needs_document` with the mismatched-middle-initial `flagReason`; jersey
  22 had already self-corrected to `eligible` before this ran, since its
  middle name was fixed live through the roster editor (which now
  re-screens on that field per the fix above).

## 2026-09 — Reference List paging/row numbers; address required on correction

- **Reference List page**: added a `#` column (numbered by position in the
  filtered list, so page 2 continues from page 1), a "Rows per page" selector
  (25/50/100/200/500/1000/All, default 50) and Prev/Next paging. Replaces the old hard
  200-row cap, which gave no way to see rows past 200 except by searching.
- **Address now required on "Correct this player"** (form + `PATCH
  /api/teams/:id/players/:playerId` returns 400 on an empty address). The Add
  form already required it. Deviation from the earlier note that a correction
  tolerates a missing address: a player added before the rule existed must now
  get an address filled in the next time they're edited. Bulk CSV import still
  tolerates a missing address (unchanged).
- Address still plays NO part in residency screening — not adding an
  "address must mention the team's barangay" flag (tried and reverted, see
  CLAUDE.md: it would wrongly flag the cross-barangay players the whitelist exists for).
- **Reference List lag on 1000 / All fixed** by virtualizing the table
  (`@tanstack/react-virtual`, new frontend dependency): only rows in/near the
  scroll viewport are in the DOM, with two spacer rows standing in for the rest,
  so "All" on the full ~17k list costs the same as 25 rows. The
  "View in Reference List" auto-scroll now goes through the virtualizer
  (`scrollToIndex`) since the target row may not be mounted.
- **`#` is now the resident's number in the FULL list**, not their position in
  the search results — searching shows each person's real master-list number
  (supersedes the earlier "numbered by position in the filtered list").

## 2026-09 — Not on the list = flagged (Dayo); address = barangay name

- **Adult (15+) not found on the reference list is now `flagged`** ("possible
  Dayo"), not `needs_document` (`decideFromCandidates` in `services/prescreen.js`).
  Documents stay OPTIONAL: upload is still offered and the Super Admin can approve
  or reject a flagged player with or without one. Under-15s are unchanged
  (`needs_document`, consent + documents) — they can't be on a 15+ list.
  Deviation from the July 20 meeting notes ("verification is document-based"),
  chosen by the Super Admin — worth confirming with the SK Federation and true up
  in the thesis. **Statuses already saved are stale until a re-screen runs**
  (upload a reference list or toggle a barangay's cross-barangay checkbox). With
  the current dev list having no middle names, a re-screen flags every adult.
- **Player address must be the team's barangay name** (add, correct; the forms
  prefill it and warn otherwise). CSV import ignores its address column and sets
  the barangay name. Supersedes the "address is free text" decision above and
  the earlier note in this file; address still plays no part in screening, so a
  cross-barangay player's home barangay is no longer recorded anywhere.
- **"View in Reference List" (Review Queue) now scrolls the page to the data.**
  The Reference List page used to scroll only INSIDE the table (and only when a
  matched row existed), so the page stayed at the top under the status/upload
  cards and the click looked like nothing happened. Now the page scrolls the
  results into view, then the table centres on the matched row. A player not on
  the list (flagged as a possible Dayo) has no matched row, but the page still
  lands on the results.

## 2026-09 — Verified teams: player details locked (photos still editable)

- Once a team is `verified`, the Barangay Admin can no longer edit its players'
  details: `PATCH /api/teams/:id/players/:playerId` returns 409 for a
  barangay_admin on a verified team, and the roster editor hides the edit
  (pencil) button and shows a "verified — details locked, photos still editable"
  notice. Reason: an edit re-runs the residency screen and could flip an
  already-verified team back to pending. Photo upload/delete are separate routes
  and are unchanged. **The Super Admin can still correct a player** (the existing
  re-screen + reopen-to-pending safeguard still applies to that path). Add/remove
  were already locked by submission.
- **Super Admin "Reopen for corrections"** (fixes a dead end in the lock above:
  the message told the Barangay Admin to "contact the Super Admin", but the Super
  Admin has no player list to edit from, and the Review Queue only listed pending
  teams). New `POST /api/review/teams/:teamId/reopen` sets a verified team back to
  `pending` (blocked once the team is in any match — delete the tournament
  first). `GET /api/review/queue` now also returns `verifiedTeams`; the Review
  Queue shows a "Verified teams" card for the picked barangay with a Reopen
  button. Reopened, the team is editable by its Barangay Admin again and lands
  back in the queue to be re-verified. Lock/verify messages reworded to "ask the
  Super Admin to reopen the team".
- **Reopen is limited to the `verification` season state** (Super Admin decision):
  `POST /api/review/teams/:teamId/reopen` returns 409 in any other state, the
  queue response carries `seasonStatus`, and the "Verified teams" card is hidden
  outside verification. Once the season is `ongoing`, verified teams are final.
  (Verify/approve/reject are still ungated — unchanged.)

## 2026-09 — Jersey number optional again

- Jersey number is no longer required on "Add a player" (form + `POST
  /api/teams/:id/players`); if one is given it must still be numeric. Placeholder
  reads "Jersey # (optional)" on add and correct. Player model, CSV import and the
  correct route already treated it as optional.

## 2026-09 — Review Queue load time

- `GET /api/review/queue` looped over every team doing its own roster query
  (+ populate, + a count per verified team). Rewritten as a fixed handful of
  batched queries grouped in memory. Measured against the dev Atlas DB with 5
  pending + 29 verified teams: ~0.9-1.7s -> ~0.4s. Response verified identical
  to the old code for `teams`, `barangays`, `totalPending`. The remaining ~0.4s
  is the Atlas round trips (season -> teams/barangays/sports -> links -> players).

## 2026-09 — Cross-barangay flag can't be approved

- A `flagged` player whose flag is the cross-barangay rule ("Listed under X, not
  Y — Y doesn't allow cross-barangay players") can no longer be approved in the
  Review Queue: the Approve button is disabled with an explanation, and `POST
  /api/review/teams/:teamId/players/:playerId/approve` returns 409. The way out is
  to reject the player, or tick "allow cross-barangay" for that barangay in League
  Setup (which re-screens the season and clears the flag on its own).
  The "not on the list / possible Dayo" flag is unchanged and stays approvable.
- `decideFromCandidates` now returns a `code` (`minor` / `not_on_list` /
  `cross_barangay`) so this doesn't depend on the reason text, and a new
  `decidePlayer()` in `services/prescreen.js` re-runs the decision for one player
  without saving. `GET /api/review/teams/:teamId` adds `crossBarangayBlocked` to
  each flagged player, computed LIVE (works for flags saved before this existed).
  No model change, no restart needed beyond the normal reload.

## 2026-09 — "View in Reference List" matches the exact name

- The Review Queue link used to prefill a loose word search ("Lastname Firstname").
  That search drops all-number words (meant for jersey numbers) and matches on
  substrings, so a player NOT on the list landed on other people sharing a last
  name or containing the first name ("Balindong 11, Jose" -> "Balindong 524,
  Josefina"; the dev data's surnames carry numbers, which the search discarded).
  The link now passes `?last=&first=` and the page shows only rows whose name is
  exactly that player's (same case/whitespace-tolerant comparison as screening),
  with a "Show all residents" button. A player not on the list shows "No one on the
  reference list has this exact name". Typing in the search box leaves that mode.
  The normal search box is unchanged (still drops number-only words).

## 2026-09 — Flagged Dayo can't be approved either

- Approve is now disabled for EVERY flagged player, not just the cross-barangay
  kind: "not found on the reference list (possible Dayo)" joins it (button
  disabled with a message; `POST .../approve` returns 409). Supersedes the
  earlier "Dayo flag stays approvable, documents optional". The way through is the
  Barangay Admin correcting a misspelled name (auto re-screen) or a reference-list
  update; otherwise the Super Admin rejects the player. A stale flag that a live
  re-run no longer flags isn't blocked. `GET /api/review/teams/:teamId` now returns
  `flagBlock` (`cross_barangay` | `not_on_list` | null) instead of
  `crossBarangayBlocked`. The Dayo reason text no longer invites a document upload.
- Not changed: the Barangay Admin's document upload is still offered for flagged
  players even though it can no longer lead to an approval.

## 2026-09 — Reference List shows WHY a same-name row didn't match

- Case: roster "Balindong 524, Jose D., b. 1976-04-26" vs the list's only "Balindong
  524, Jose N., b. 1995-01-08 (Sucodan)". The name matches, but middle initial and
  birthdate don't, so the player is correctly flagged "not on the list" — yet the
  Reference List page showed that row with no hint why, which looked like a bug.
- `GET /api/reference-list` now returns `nearMisses` per row: adults flagged
  `not_on_list` who share the row's name, with `differs.middle` / `differs.birthdate`
  (roster value vs list value, null when that field agrees). The page highlights
  such rows orange ("Same name, details differ") and lists which details disagree.
  `sameDay` / `sameMiddleInitial` are now exported from `services/prescreen.js`.
- Deliberately Super Admin only (that route is): it puts the list's real
  birthdate/middle name next to the roster's. It is NOT added to `flagReason`,
  which a Barangay Admin sees — that would let them read a resident's data off the
  list or probe it by trial and error.

## 2026-09 — One barangay per player; games shown on the Reference List

- **A player can only play for ONE barangay per season.** Once an athlete is on
  barangay A's roster, no other barangay can roster them — even one that allows
  cross-barangay (e.g. Matampay fields a Mukas resident: they can play any number
  of sports for Matampay, never for Mukas or anyone else). New
  `otherBarangayHolder()` in `routes/team.js`, matched by name + birthdate
  (case/whitespace-tolerant). Add player -> 409 naming the barangay/sport; CSV
  import -> the row is skipped and reported; "Correct this player" -> 409 if a
  rename would land on someone already on another barangay. Same-barangay
  multi-sport is unchanged (allowed); the same-sport sibling-team rule (Mukas 1 /
  Mukas 2) is unchanged. Dev data checked first: no existing player on two
  barangays. `looseRegex` is now exported from `services/prescreen.js`.
- **Reference List shows the games.** `GET /api/reference-list` match entries now
  carry `sport`, `division`, `barangay`; each matched resident shows "plays for
  <barangay>" and "Games: ...". Matches are grouped by barangay, so a person on
  several teams for one barangay is no longer shown as a conflict (the amber
  "multiple players" state now means >1 BARANGAY). Also moved a misplaced
  comment in that file.

## 2026-09 — Phone layout pass: Barangay Admin rows + Reference List

Found by rendering the pages in headless Edge at 360/390px against a mock API
(the harness lives outside the repo) instead of guessing from the code.

- **Reference List** (`ReferenceList.jsx`): on a phone it was a seven-column table
  squeezed to ~40px per column (names cut to "S…", headers overlapping) inside a
  small scroll box that trapped the finger — dragging the table scrolled the box,
  not the page (the "drag table" problem). Now `md+` keeps the table; below `md`
  each resident is a CARD that scrolls with the PAGE (window-virtualized,
  `useWindowVirtualizer`), so "All" is still fast on ~17k rows and there is no inner
  scroll box. Both layouts share `analyzeRow()` / `MatchInfo`, so the match, games,
  near-miss and under-15 blocks can't drift apart; only one layout is mounted at a
  time (`useMediaQuery`, the other virtualizer is `enabled: false`). Phone paging
  scrolls the list top into view; typing in search deliberately does NOT. The
  "View in Reference List" auto-scroll works in both. The long intro text is now
  two lines plus a "How matching works" disclosure.
- **Barangay Admin** (`BrgyDashboard.jsx`): "My teams" rows stack on a phone (name
  gets the full row; status badge + buttons sit below) — at 360px the name was
  cut to "M…". Roster player rows reworked: name wraps instead of truncating, with
  edit/remove pinned top-right and jersey, age, status and photo link on a wrapping
  line beneath. Same markup at every width (checked at 360, 390 and 1100).
  Barangay Matches and Document Submission were already fine on a phone.
- **Bug fixed in passing:** `normName` in `ReferenceList.jsx` (added for the
  exact-name link) had lost a backslash — `/s+/g` instead of `/\s+/g` — so it turned
  runs of the letter "s" into spaces instead of collapsing whitespace. Equal names
  still compared equal (both sides got the same treatment) but different names
  could collide. Fixed.
- Not changed: lint reports the same 5 errors / 2 warnings on `BrgyDashboard.jsx`
  as the committed version (pre-existing, e.g. `setState` in effects).

## 2026-09 — Accounts page rework; softer light theme for all admin pages

- **Softer light theme** (`index.css` `:root` tokens; dark mode untouched): the admin
  light theme was pure white page + pure white cards + near-black text, separated
  only by thin borders, which glared. Now a soft cool-gray page
  (`--background` oklch .94), off-white cards/popovers (.978), gentler text
  (`--foreground` .2) and slightly darker borders/inputs/muted so cards still read as
  cards. The admin header moved from `bg-background` to `bg-card` so the header and
  sidebar sit on the card tone and the page reads as the darker layer. Applies to all
  three roles (they share the tokens); Public is unaffected (it uses explicit colors,
  not tokens). `ChangePassword.jsx` and the dead `components/ui.jsx` still hardcode
  white — left alone.
- **Accounts** (`Accounts.jsx`): on a phone the table was 608px wide on a 390px screen
  and the Reset password / Delete buttons were off-screen, reachable only by dragging
  sideways. Now: a header ("35 accounts · 22 still on a temporary password") with
  "Add account" and "Provision all" buttons; "Add account" moved from a full-width card
  into a dialog (its error now shows inside the dialog, since a page banner would sit
  behind the overlay); search (username / barangay / sport) plus filter chips with counts
  (All, each role, Needs password change); rows are a grid that lines up under a header on
  desktop and a two-line card on a phone (name + assignment, then status + actions), with
  Delete as an icon button. Same actions, same API; the password-reveal card is unchanged
  but wraps on a phone.
- Checked by rendering at 390 and 1280px (mock API, headless Edge), including search and
  the Add dialog. Lint: the one remaining error is the `useEffect(() => { load(); }, [])`
  pattern the file already had.

## 2026-09 — Dashboards for Barangay Admin and Organizer; season indicator

- **New "Dashboard" tab for both roles**, and it's now where they land after login
  (`/brgy/dashboard`, `/organizer/dashboard`; `Login`, `ChangePassword` and
  `RequireRole`'s wrong-role redirect all updated). `/brgy` (My Teams) and
  `/organizer` (scoring) keep their paths.
- **Season indicator** (`SeasonStatus.jsx`, `lib/season.js`): a coloured pill in the
  admin header ("● Registration open"), plus a slim bar under the header on phones,
  for `barangay_admin` and `organizer` on EVERY page (reads the public
  `GET /api/seasons/current`). The dashboards also show a five-step tracker
  (Setup → Registration → Verification → Ongoing → Completed) with a plain-language
  sentence of what the stage means for that role. `AdminLayout` takes
  `seasonStrip={false}` — the courtside scoring screen uses it, since the strip costs
  ~36px of a phone's height.
- **Barangay Admin dashboard** (`BrgyHome.jsx`, `GET /api/stats/brgy-dashboard`):
  players Registered / Verified / Under review / Drafts, a "needs attention" callout
  linking to Verification Status, a per-team state list with "N of M sport & division
  entries verified", and live / upcoming matches with the win-loss record. Players are
  counted as ATHLETES (name + birthdate), once each, by their most advanced team, so
  verified + under review + drafts = registered — a person on three teams isn't counted
  three times. Polls every 30s.
- **Organizer dashboard** (`OrganizerHome.jsx`, `GET /api/stats/organizer-dashboard`):
  Today / Live now / Coming up / Completed tiles; "Needs attention" (dated for a past
  day but never played, and ready matches with no date); Playing now; Today; the
  dated schedule grouped by Manila day; bracket progress per division; recent results;
  an empty state that says why there are no matches yet. Buckets use Manila days
  (server runs UTC). Polls every 30s.
- Both endpoints are a fixed handful of batched queries (~0.3s on the dev Atlas DB).
  Checked against the real data (Mukas: 60 players all verified; Matampay: 59 =
  49 verified + 10 under review, the 10 flagged players) and, since the dev season has no
  matches yet, against stubbed fixtures for the match bucketing. Layouts verified at
  390 and 1280px in every season stage.
- Helpers live in `lib/season.js` and `lib/dashboardFormat.js` (not the component
  files) so fast refresh keeps working. Not done: the first-login instruction modal
  doesn't mention the new tab yet.

## 2026-09 — Bug: /teams cards invisible after clearing the search

- **Symptom:** search "Mukas" on `/teams`, clear it, and the other cards in every
  section that had a Mukas team came back at opacity 0 — rendered, taking up space,
  clickable, invisible. A vertical scrollbar also appeared inside those sections.
- **Root cause** (reproduced in headless Edge before changing anything; 6 of 14 cards
  stuck): `RevealGroup` fires its `whileInView="visible"` once (`once: true`), and
  `RevealItem` only declares variants, inheriting "visible" from that trigger. A
  section that still had a match stayed mounted (same `sport||division` key), so its
  group was already spent; the cards filtered out unmounted, and on clear they
  remounted as NEW children of a spent group — inheriting `initial="hidden"` with no
  trigger left to reveal them. The matching card never unmounted, so it stayed
  visible. Sections with no match at all unmounted whole, so their group fired again
  and those cards were fine. The same fault affects any RevealGroup whose list is
  filtered or reordered (Players' card grid too).
- **Fix** (`Reveal.jsx`): `RevealGroup` records that it has revealed
  (`onViewportEnter`) and tells its items via context; a `RevealItem` that mounts into
  an already-revealed group plays its own fade-in (`initial="hidden" animate="visible"`)
  instead of waiting for a trigger that won't come. First-load staggered reveal is
  unchanged (verified: switching the sport tab still fades cards in).
- **Scrollbar:** the carousel row was `overflow-x-auto`, which forces `overflow-y` to
  `auto`; the reveal's 24px downward offset exceeds the row's 20px bottom padding, so
  stuck (and mid-animation) cards created 4px of vertical overflow -> a scrollbar. The
  row is now `overflow-x-auto overflow-y-hidden`. Measured: no vertical scrollbar drawn
  in any row, mid-fade included.
- **Counts:** the per-section count already followed the filter (Badminton 3 -> 1 -> 3
  measured). The page subtitle was season-wide and didn't; while a search is active it
  now reads `5 of 14 teams match "Mukas"`.
- Tested: search / clear x4 (incl. a no-match term) -> 14/14 cards visible each time.

## 2026-09 — Hero banner animation; Home blank under reduced motion (existing bug, fixed)

- **Hero photo animated** (`components/HeroImage.jsx`, used by `Home.jsx`; the headline
  and copy are NOT animated): (1) entrance — fades in and settles from a slight zoom
  once the image has actually loaded (2.5s fallback so a stalled request can't leave
  it invisible); always plays, like the scroll-reveals. (2) scroll parallax — the photo
  travels ~13% slower than the page. (3) slow drift — a gentle zoom in/out, one cycle
  ~44s. Parallax and drift honour `prefers-reduced-motion`. Transform/opacity only. The
  parallax layer is 15% taller than the hero and starts 15% above it, so it always
  covers the section (verified at scroll 0 and 500px); the drift only scales UP so it
  can't expose an edge. `SiteImage` gained an optional `onLoad` prop.
- **Bug found while testing this, not caused by it:** with the OS "reduce motion" /
  "Show animations off" setting the ENTIRE Home page rendered blank (React #185,
  maximum update depth). Cause: `SportsMarquee` re-measures itself to decide how many
  copies of the list it needs; under reduced motion the row is a static WRAPPING block
  (index.css), whose measured width is capped at the container, so `ceil(W / (W /
  reps))` came out one higher than `reps` (floating point) on every pass — forever.
  Fixed: under reduced motion it stays at one copy and doesn't measure, and the copy
  count is capped (`MAX_REPS` = 12) as a backstop. Confirmed by bisection (Home still
  crashed with the hero removed) and by re-testing both motion settings.

## 2026-09 — Super Admin dashboard rework

- **Before:** seven count tiles (season, teams, players to review, barangays, sports,
  barangay admins, organizers) and a today's-games carousel. Most numbers never change,
  and nothing said what to DO.
- **Now** (`AdminDashboard.jsx`): (1) the season stage tracker with Super-Admin-specific
  guidance and a "Manage season" button; (2) **Needs your attention** — a prioritised
  to-do list that only shows real items, each linking to where it's fixed: no season, no
  reference list, barangays/sports without an account, teams awaiting review, flagged /
  missing-document players, sport divisions with verified teams but NO BRACKET (verification
  and ongoing only), matches dated in the past but never played, ready matches with no date,
  "everything verified — move the season on" (verification, when nothing is pending or
  draft), and accounts still on a temporary password; an empty list says so; (3) four tiles
  that actually move: teams verified, players eligible (roster entries), barangays cleared,
  matches played; (4) **Registration**: the team pipeline (verified / under review / draft)
  as a stacked bar, barangay participation (cleared / in progress / not started) and who
  hasn't started; (5) **Competition**: each sport's divisions with verified-team counts and
  bracket stage + progress, or "No bracket yet"; (6) today's games (carousel kept; two per
  row); the rarely-changing counts shrink to a footer line. Polls every 30s.
- **Backend** (`GET /api/stats/dashboard`): backward compatible (old fields unchanged) plus
  `teamsByState`, `players`, `barangayProgress`, `referenceList`, `sportsProgress`,
  `matches` and extra `accounts` counts. Two independent query batches merged into one:
  ~0.42s warm on the dev Atlas DB (Team names for today's games now come from the teams
  already loaded, not a populate).
- Verified on the real data (36 teams: 34 verified / 1 review / 1 draft; 172 of 182 roster
  entries eligible; 2 of 26 barangays cleared; 23 accounts on temporary passwords) and
  rendered at 390 and 1280px in registration, ongoing and all-clear states.
- Shared: `SeasonStatus.jsx`'s guidance gained a `super_admin` set; `StatTile` numbers are
  `text-xl` on phones so "172/182" fits.

## 2026-09 — Bug: phone menu showed only icons

- **Symptom:** opening the admin menu on a phone showed a full-width panel with icons only
  — no labels, no "Sign out" text — so users couldn't tell where to go.
- **Cause** (reproduced first): the icon-only "rail" is a DESKTOP collapse (its toggle is
  `hidden lg:flex`), but `AdminLayout` drew the menu items from the raw `rail` state without
  checking width. Collapse the sidebar at desktop width, then narrow the window / rotate a
  tablet / open on a smaller screen, and the phone-style overlay opened at 256px wide with
  every label hidden.
- **Fix:** the user's collapse choice is now `railPref`; the effective `rail` is
  `railPref && isDesktop` (new `lib/useMediaQuery.js`, `min-width: 1024px`), so below `lg`
  the menu ALWAYS shows labels, and the preference is remembered for when the screen is wide
  again. Desktop collapse is unchanged (64px rail). Also added an explicit **X close button**
  to the phone menu (it used to close only by tapping the dimmed page). The Reference List
  now imports the shared hook instead of its own copy.
- Verified by re-running the exact reproduction (collapse at 1280 -> 390 -> open menu):
  Dashboard / My Teams / Verification Status / Matches + Sign out + close button; and at
  1280 the collapsed rail is still 64px and icon-only.

## 2026-09 — Season page rework

- **Before:** a season name + badge, a row of stage badges, and one "Advance" button with
  "This cannot be undone." — no readiness information, a confirmation only when leaving
  Setup, and the backend's stale-screen guard (`expectedNext`) was never sent.
- **Now** (`Season.jsx`): (1) header with the season name, opened/closed dates and the
  same stage stepper the dashboards use, with the Super Admin's guidance for the stage;
  (2) **"Ready to move on?"** — a checklist for the SPECIFIC next step, built from the
  dashboard payload (`lib/seasonReadiness.js`): Setup -> Registration (reference list
  loaded, every barangay/sport has an account); Registration -> Verification (barangays
  that haven't registered, draft rosters); Verification -> Ongoing (teams under review,
  flagged players, divisions with verified teams but no bracket, undated matches);
  Ongoing -> Completed (unplayed matches, live matches, unfinished brackets). Each item is
  green / amber / info with a shortcut to where it's fixed; (3) the advance button opens a
  dialog listing **what changes** and anything unfinished, with an explicit "Move on
  anyway" — soft, not a hard block; (4) the advance now sends `expectedNext` so a stale
  screen (another admin already moved the season) is refused and the message shows in the
  dialog; (5) **season history** (name, dates, teams / verified, stage) via new
  `GET /api/seasons` (Super Admin; team counts from one grouped query).
- **Honest text:** the "what changes" copy only claims what the backend enforces. Checked:
  the stage gates ONLY registration (create team, add/remove player, import, submit — all
  `registration_open`) and "reopen a verified team" (`verification`). The Review Queue,
  bracket generation and scoring are NOT tied to the stage, so the page says so — the
  checklist is the only safety net against a premature advance.
- Tested in the browser at 390 and 1280px across Setup / Registration / Verification /
  Completed, including the advance dialog, a normal advance (lands on the next stage), and
  the stale-screen guard (second advance refused with the backend's message). The history
  route was run on the real data (1 season, 36 teams, 34 verified).

## 2026-09 — Dark / light mode on phones

Measured first (headless Edge at 390px, a dark-mode user): at first parse the page was the
LIGHT theme (class `""`, light-grey body), `color-scheme` was `normal` even in dark mode, and
there was no `theme-color`. Fixed:
- **No bright flash:** `index.html` runs a tiny script before the app loads that applies the
  saved theme (admin routes only). Verified: at DOMContentLoaded a dark user now has
  `class="dark"`, a dark body and `color-scheme: dark`. The public site (always dark) is
  painted dark from the first frame too, and the inline style is cleaned up on navigation.
- **`color-scheme`** is now `light` on `:root` and `dark` on `.dark`, so the browser's OWN UI —
  scrollbars, date pickers, `<select>` popups, the on-screen keyboard, autofill — matches.
- **`<meta name="theme-color">`** (new `lib/themeChrome.js`): the phone's address/status bar
  matches the header — light `#f7f8fa`, dark `#171717`, public `#0A1220` — and updates when the
  toggle is used.
- **First visit follows the phone's own setting** (`prefers-color-scheme`) instead of always
  light; a saved choice always wins. Was: "defaults to light". `index.html` holds a copy of this
  rule (keep in step with `lib/theme.js`).
- **Touch screens get an instant theme swap.** The circular reveal is a full-screen View
  Transition (smooth with a mouse, but it stutters on modest phones and makes the page ignore
  taps for ~0.75s); it now only plays for `(hover: hover) and (pointer: fine)`. The organizer
  scoring screen was already opted out.
- Light-only leftovers fixed in the roster editor (the pale-green "Player updated" notice and two
  amber notes had no dark variant).
- Not changed: dark mode's look — checked on the roster dialog and the Super Admin / Organizer
  dashboards at 390px and it was already fine.

## 2026-09 — Organizer Matches: list, the moment of starting, live scoring; date-only times

Found by rendering the organizer screens at 390px against a mock API.
- **The start moment** (`OrganizerScoring.jsx`): the pre-start card gave no hint of the matchup
  (team names only appeared as small tabs). Now a match header shows crests, names,
  division/stage, date, time and venue in every state; team sports get a **Starting lineup**
  step (both teams' on-court players, "5 of 5 on court", tap to change) before Start — it used
  to be possible only after starting; the Start button is big and says what it will do
  ("Start match · 4 quarters"); after starting, a green "Match started · Quarter 1 of 4"
  message shows, the page scrolls to the top and the phone vibrates briefly (also 15ms on a
  score / undo tap; a no-op where unsupported, e.g. iOS Safari).
- **Bug fixed — a one-quarter basketball game by default:** the period count defaulted to `1`,
  which basketball doesn't even offer (its only option is 4), so an organizer who just tapped
  Start began a ONE-quarter match. The default now comes from the sport's own options (3 if
  offered, else the first).
- **Live scoring on a phone:** the scoreboard panel sat BELOW the player list (~660px down), so
  mid-game the score and Undo were out of sight. A slim **sticky bar** (LIVE, score, "Quarter 2
  of 4", Undo) now stays at the top on phones while a match is live (`lg:hidden`; desktop keeps
  the side panel). Verified: 0-0 -> 4-0 after two baskets, still pinned after scrolling 650px.
- **Match list:** To play / Completed tabs (finished matches used to pile up at the bottom), a
  division filter when there is more than one (basketball runs U15 and U30 side by side — the
  round counting for "Semifinal" etc. still uses the unfiltered list), an **Overdue** section
  for matches dated for a past day that never started, today's matches sorted by time with a
  "Next up" tag, the kick-off time leading the row (it was a tiny line at the bottom), and the
  two teams STACKED so names aren't cut to "Mukas… vs Bayba…".
- **Bug fixed — a made-up "12:00 AM":** a date-only schedule is stored as midnight MANILA
  (`parseManila`; older data: midnight UTC). The time helpers only recognised midnight UTC, so
  every date-only match showed "12:00 AM". `hasTime` (`lib/dashboardFormat.js`) now treats both
  as "no time", and BrgyMatches and the PUBLIC Matches page use it instead of their own copy;
  the organizer's `timeOf` got the same fix.
- Not changed: scoring rules, the backend organizer routes, undo semantics.


## 2026-09 — Session: Top 8 = one team per barangay (ML), Standings advance count, League Setup trimmed

- League Setup: the "scoring & draw rules" panel now shows only the fields that apply to the
  sport. "Games won" scoring (chess, billiards, Mobile Legends) hides point values, period name
  and counts, players on court and stats; groups and knockout size show only for a round-robin
  draw. Hidden fields keep their saved value. The server sends `defaultScoringMode` with each
  sport so a blank "Scoring" resolves to the right layout. The built-in rule tables moved from
  `routes/organizer.js` into `lib/sportRules.js` (shared with `reference.js`).
- Mobile Legends: generating a Top 8 knockout is refused (409) if a barangay has two verified
  teams (remove the extra, or pick Top 16). Registration is not capped by the knockout size.
- Public Standings: round-robin caption and provisional highlight now use the tournament's
  real advancePerGroup (Top 8 = 1) instead of a hardcoded 2.
- Review Queue: viewable at any season stage, but approve / reject / verify now work only in the
  `verification` stage (server: 409 via `requireVerificationStage` in `routes/review.js`; page:
  "View only" notice, disabled Approve/Reject/Verify, note in the player dialog). Reopen was
  already `verification`-only. Deviation from "review is not tied to the season stage".
- Scoring redesign (Sep 2026, Super Admin request). Live scoring is by TEAM only: +1/+2/+3 for a
  team in basketball, +1 elsewhere; the per-player buttons, on-court lineup / substitute UI,
  starting-lineup step, live foul/rebound/assist buttons and the MVP pick at End match are gone
  (`/stat` and `/mvp-suggestion` routes removed; `/score` and `/undo` are team-only). A
  **Player stats form** appears once a match is completed (`PUT /api/organizer/matches/:id/stats`):
  basketball = points, assists, fouls, rebounds; volleyball / badminton / pickleball = points;
  billiards / chess = none; esports = a ROLE per player (Mobile Legends: Carry, Fighter, Mage,
  Jungler, Support; Call of Duty Mobile: Slayer, Objective, Anchor, Support, Flex; other esports:
  Carry, Tank, Support, Flex). The form also picks the MVP. `PlayerMatchStats` gained `role`
  (needs a full server restart). League Setup's rules panel is down to point values, period
  name and period counts (points sports only). Rule tables live in `backend/src/lib/sportRules.js`.
  Also fixed: the organizer routes only populated the sport's `name`, so saved point values and
  period settings were never applied. First-login organizer instructions rewritten to match.
- League Setup: "Show scoring rules" now appears on EVERY sport and starts with a read-only summary
  of how that sport is scored (live scoring, periods, the after-match player form). The editable
  fields (point values, period name, period counts) still show only for points sports.
- League Setup: the editable scoring fields (point values, period name, period counts) were
  removed. "Show scoring rules" is now a read-only text summary on every sport.
- League Setup (Sep 2026): each sport now has a **Type** (Sport / Esports / Board game — new
  `Sport.category` value `board`) and an **After-match score sheet** the Super Admin picks
  (`Sport.scoreSheet`): e.g. basketball = points, fouls, rebounds, blocks, assists; esports =
  kills, deaths, assists, role. The organizer's post-match form shows exactly those columns.
  Columns beyond the original four (points / assists / rebounds / fouls) are stored under
  `PlayerMatchStats.extra` and are not shown on the public pages yet. New "Rules by type" card
  at the top of League Setup. The fixed per-sport lists in `lib/sportRules.js` are now only the
  defaults used until a sheet is picked.
- League Setup (Sep 2026, later): scoring rules are editable again — point values, period name and
  period counts on each points-scoring sport's card and on "Add a sport" (validated on the server;
  blank = built-in default) — because a newly added game otherwise had no way to set them. And the
  Super Admin can add their OWN score sheet columns per sport ("Spikes" for volleyball…); the server
  derives a safe key, ticks it on the sheet, and its values are stored under `PlayerMatchStats.extra`.
- League Setup UI reworked (Sep 2026): Games / Barangays tabs, one game edited at a time via a row of
  game pills, grouped Registration / Scoring / Score sheet sections, division and column toggle chips,
  entry-format cards, a single "Save changes" per game (was three Save buttons per card), a barangay
  search with a 3-column grid, and a redundant "Show scoring rules" summary removed. No behaviour or
  API changes. Checked by rendering at 1440px, 390px and in dark mode.
- Reference list (Sep 2026): re-uploading it used to send approved under-15 players back to "needs
  document" (`rescreenSeason` recalculated every player, and an under-15 always calculates to needs
  document), reopening verified teams. Approved under-15s are now left alone by a re-screen. And the
  list can no longer be replaced from verification until the season ends (server 409 + disabled
  upload with an explanation); it can be uploaded in setup / registration only.

## 2026-09 — Session: minor-age cutoff made inclusive; division age caps enforced

- **Minor-age cutoff corrected to inclusive** (Super Admin decision): `MINOR_AGE` (15) in
  `services/prescreen.js` was `age < 15`, so a 15-year-old was screened as an adult against the
  reference list (and could land `flagged`/possible-Dayo with no path to approval if the SK
  Federation's list didn't happen to carry them — the actual voters' list is still not in hand).
  Changed to `age <= 15` everywhere the cutoff is checked: `decideFromCandidates`,
  `rescreenSeason`'s skip-guard, and `referenceList.js`'s `isMinor` flag (the informational
  purple-highlight logic). A 15-year-old now routes to `needs_document` (parental consent +
  document) like a younger player, instead of reference-list screening. Frontend copy updated to
  say "15 and under" instead of "under 15" everywhere this boundary is described
  (`BrgyDashboard.jsx`, `Documents.jsx`, `instructionContent.js`, `ReferenceList.jsx`).
  **Deviation from the previously stakeholder-confirmed wording** ("SK voters' list, ages 15–30")
  — worth re-confirming with Hon. Reserva since the list, once obtained, does start at 15.
- **Basketball's `under15`/`under30` divisions are now enforced age caps, not just labels**
  (Super Admin decision: "15 under" means 15-and-under, not 14-and-under; "30 under" means
  30-and-under, not unlimited up to 100). Previously nothing in the code checked a rostered
  player's age against their team's division at all. New `checkDivisionAge()` /
  `DIVISION_AGE_LIMIT` (`under15: 15`, `under30: 30`) in `routes/team.js`, wired into add-player
  (`POST /:id/players`), CSV import (`POST /:id/players/import` — over-limit rows are skipped
  and reported like any other bad row), and "Correct this player"
  (`PATCH /:id/players/:playerId`, only when the birthdate changes). Only `under15`/`under30`
  carry a limit; `open`/`boys`/`girls` are gender/skill divisions and stay unrestricted. Mirrored
  client-side in `BrgyDashboard.jsx`'s add-player form (amber warning + disabled Add button) for
  the same UX pattern as the existing address/minor-age hints; the "Correct this player" form
  relies on the backend's error message (same as its other cross-checks). Also added a backstop
  at `POST /:id/submit`: since the per-player check only runs at add/import/correct time, a
  player added before this fix existed (or by any other path) could otherwise reach submission
  and be screened for residency only, never for the division's age cap — submit now re-checks
  every rostered player against `DIVISION_AGE_LIMIT` and 400s naming whoever is over, before
  locking the roster.

## 2026-09 — Session: document delete, Super Admin profile panel + recovery code

- **Delete a wrongly-uploaded document** (Documents.jsx / "Verification Status"):
  `DELETE /api/teams/:id/players/:playerId/documents/:docId` (barangay_admin, own team) removes
  the GridFS file + `Document` record. Blocked once the document is already `approved`/`rejected`
  (the verdict is on record — ask the Super Admin to reopen the team) or the team is verified and
  locked. A trash-icon button now sits on each `pending` document row, behind a confirm dialog.
- **Super Admin profile panel + account-recovery code.** New right-side `Sheet` component
  (`components/ui/sheet.jsx`, modeled on the existing `dialog.jsx`, no new dependency — uses the
  project's existing `radix-ui` package) opened from the header avatar/username in `AdminLayout`
  (all three roles). `ProfilePanel.jsx`: a "Change password" form for everyone (reuses
  `POST /api/auth/change-password`), plus a Super-Admin-only "Account recovery" section that
  generates a backup code (`POST /api/auth/recovery-code`, requires the current password) —
  `generateRecoveryCode()` in `config/password.js` makes an `XXXX-XXXX-XXXX-XXXX` code from an
  unambiguous charset (no 0/O/1/I/L). The code is shown **exactly once**, in that response — only
  its bcrypt hash is ever stored (`User.recoveryCodeHash`/`recoveryCodeSetAt`, new fields, full
  server restart needed). Regenerating replaces the old code; every Super Admin's code is
  independent (per-account field), so resetting one never touches another's.
  On the login page, a new "Forgot your password?" button opens `ForgotPasswordDialog`
  (`Login.jsx`) — username + recovery code + new password, posted to
  `POST /api/auth/forgot-password` (PUBLIC, no token; rate-limited tighter than login itself,
  5 attempts/15min). Server-scoped to `role: 'super_admin'` accounts with a code set; a wrong
  username, wrong role, or wrong code all return the same generic "Invalid username or recovery
  code," same reasoning as login's own generic error. **One-time use**: a successful reset clears
  `recoveryCodeHash`, so a leaked/observed code can't be replayed — the admin generates a fresh
  code from the profile panel after logging back in. This is the "Super admin password recovery
  when both super admins are locked out" item that was on the pending list — the two Super Admin
  accounts have no one above them to reset a forgotten password the way a Barangay Admin/Organizer
  does via the Accounts panel.
- **Fixed same session, right after landing:** `SheetContent` had no scroll handling — on a
  shorter screen, the profile panel's content (avatar + change-password form + recovery section)
  could overflow past the visible panel with nothing to scroll it into view, which is exactly why
  a just-generated recovery code was reported as invisible. Restructured so the close (X) button
  stays pinned to the panel frame while only the body scrolls (`overflow-y-auto` on an inner wrapper,
  not the outer `Sheet.Content` itself — putting it there would have scrolled the close button away
  too).
- **Accounts panel: Super Admin passwords are no longer peer-resettable** (Sep 2026). A Super
  Admin now manages their own password entirely (change-password + recovery code from their own
  profile) — `POST /api/accounts/:id/reset-password` 409s when the target is `role: 'super_admin'`,
  and the "Reset password" button no longer renders for a super_admin row in `Accounts.jsx`. Removes
  a trust gap where one Super Admin could silently hand the other a new temp password, bypassing
  the account-recovery system entirely.
- **An account can't delete itself** (Sep 2026): `DELETE /api/accounts/:id` 409s when the target
  id is the caller's own (`req.user.id`) — e.g. `sk_federation` can delete `lydo_head`, but never
  itself, even mid-session while signed in. The Delete button is disabled on your own row in
  `Accounts.jsx` with a tooltip explaining why. Stacks with the existing "can't delete the last
  super admin" guard, which still matters if there's ever only one Super Admin account again.
- **Profile picture** (Sep 2026): `User.photo` (new field, GridFS id in the existing `photos`
  bucket — same bucket player headshots use, needs a full server restart). `AvatarUpload` in
  `ProfilePanel.jsx` reuses the Barangay Admin logo uploader's pattern (`ImageCropDialog`,
  hover-to-change, round crop) — `POST`/`DELETE /api/auth/profile/photo` (self only), served back
  publicly via `GET /api/auth/users/:id/photo` (no auth — a staff avatar isn't sensitive the way a
  residency document is, same reasoning as public player photos). `AdminLayout`'s header avatar
  (`HeaderAvatar`, all three roles) now shows the real photo when one's set, falling back to
  initials on a 404, and refreshes right after the profile panel closes so a just-uploaded photo
  shows up without a page reload.

## 2026-09 — Session: Review Queue — verified teams viewable any time

- **Verified teams were only visible during the `verification` stage, and only once a barangay was
  picked** (the "Verified teams" card existed purely to offer "Reopen for corrections"). Reported:
  "show verified teams of each barangay in the review queue... but can still see players and check
  if its in the reference list." The underlying API already supported this —
  `GET /api/review/teams/:teamId` never filtered by status — the gate was purely in `ReviewQueue.jsx`.
  Fixed: the card now shows for "All barangays" too and at every season stage; each verified team
  expands into its roster (reused `openTeamDetail`/`players` state from the pending list, and
  extracted a shared `PlayerRow` component so the row markup isn't duplicated a third time).
  Clicking a player opens the same `PlayerModal` used for pending teams, now passed an explicit
  `teamVerified` flag: it hides Approve/Reject and shows "This team is verified and locked —
  nothing here can be edited. Reopen the team above to make corrections," instead of just
  happening to have no buttons because every player on a verified team is already `eligible`. The
  "View in Reference List" link (`MatchCallout`) works unchanged, so a verified player's match can
  still be checked. Only the Reopen button itself stays gated to the `verification` stage
  (disabled + tooltip outside it — the backend still enforces the same 409).

## 2026-09 — Session: pre-deployment cleanup — dev-only scripts, routes, and the auto-score button

- `ui-polish` merged into `main` (fast-forward, 17 commits, no divergence) and pushed — `main` now
  matches what's about to be deployed.
- **Removed every dev-only script listed in CLAUDE.md's deploy checklist**: `seedTestTeams.js`,
  `showOrReset.js`, `clearTournament.js`, `seedTie5Test.js`, `seed52WithTies.js`,
  `seedVerifiedTeam.js`, `seedPlayersForTeams.js`, `seedSportConfig.js`, `wipe.js`,
  `makeReferenceCsv.js`, `seedSportTeams.js` — confirmed first that none were `require()`'d
  anywhere in the running app (they were only ever run manually via `node src/config/x.js`).
  Kept `seed.js` + `seedData.js` (the fresh-install seed, 26 barangays + 7 sports).
- **Removed the "Dev: Auto-score all group matches" button** (Super Admin request — it wrote
  fabricated results straight to `Match` documents, deterministic but fake, purely to skip manual
  scoring while testing group-stage advancement). Deleted `POST /api/tournaments/:id/simulate-groups`
  and the temp `POST /api/tournaments/:id/test-de` from `routes/tournament.js` (the real
  `generateGroupDoubleElim()` they both exercised is still used by the actual `/generate` route,
  untouched), and `simulateGroups()` + the button itself from `Tournaments.jsx`, along with the
  now-unused `Zap` icon import and a `showError` declaration that had no other caller in that
  component.
- Checked `dev-setup.ps1` (holds a password) — exists locally, already gitignored, never committed.
  Nothing to clean up there.
- Full backend syntax check (`node -c` on every file) and a clean frontend production build after
  all of the above; no other code referenced the removed files/routes.

## 2026-09 — Session: instruction-modal photo galleries; admin brand color violet → blue

- **Instruction modal: a step can now show multiple screenshots**, not just one. Filenames changed
  from `<role>-<step>.png` to `<role>-<step>-<n>.png` (n starts at 1, must be contiguous — the modal
  probes `-1`, `-2`, `-3`… and stops at the first gap). `StepShot` in `InstructionModal.jsx` preloads
  each candidate with a bare `Image()` (so there's never a flash of a broken-image icon while it
  figures out how many shots a step has), then renders whatever it found as a small gallery —
  hover arrows + dot indicators when there's more than one, a plain image when there's exactly one,
  the step's icon when there are none. The enlarge/zoom view steps through multiple images too.
  Folder's still empty locally — nothing changes visually until screenshots are actually dropped in
  following the new naming pattern (see `frontend/public/instructions/README.md`, also updated).
- **Admin brand color changed from violet to blue** (Super Admin: "most of the colors of our system
  is violet on the buttons and others"). The whole admin UI's accent runs through two CSS custom
  properties in `index.css` — `--primary` and `--ring` (plus `--sidebar-primary`/`--sidebar-ring`,
  which mirror them) — so every shadcn `Button`, focus ring, and sidebar highlight across all three
  roles updates from one change: hue shifted from 285 (indigo-violet) to 258 (Tailwind's
  blue-600/blue-500 family) in both light and dark mode, 8 values total, lightness/chroma left alone
  so nothing else about the palette's weight changed. Also fixed `pages/ChangePassword.jsx`, which
  had hardcoded raw `indigo-*` Tailwind classes instead of the token (a pre-login page the shadcn
  pass missed) — now `blue-*`. Deliberately NOT touched: `DashboardBits.jsx`'s `violet` stat-tile
  tone (one of seven hues used just to tell tiles apart, not the brand color) and
  `ReferenceList.jsx`'s `purple` (the "informational only" under-15 same-name highlight — a status
  meaning, not decoration). Public Viewer is a separate dark design with its own gold accent and was
  never on these tokens, so it's unaffected either way. Verified by building a production preview
  and screenshotting the login page with headless Edge — button, focus ring, and the login panel's
  gradient all confirmed blue, not just inferred from the CSS.

## 2026-09-22 — Session: bug fix — under30 basketball had no age floor

- **Bug**: `checkDivisionAge()`/`DIVISION_AGE_LIMIT` in `routes/team.js` only enforced an upper
  bound per division (under15 <= 15, under30 <= 30). A player of any age, including one who
  clearly belongs on an under15 roster, could be added to an under30 team — the two divisions
  overlapped instead of being a clean age split. Found by the Super Admin manually testing the
  under30 roster form.
- **Fix**: added a floor of 16 for `under30` (`DIVISION_AGE_MIN = { under30: 16 }`), so under15
  is 0-15 and under30 is 16-30 with no overlap. Enforced everywhere the cap already was: add-player,
  CSV import (row skipped + reported), "Correct this player" (birthdate edits), and the
  `POST /:id/submit` backstop (re-checks every rostered player). Mirrored on the frontend
  (`BrgyDashboard.jsx`'s add-player form disables Add + shows a hint below age 16 for an under30
  team, same treatment as the existing over-the-cap hint). under15 is unaffected — it still has no
  floor, only the existing 15-and-under ceiling.
- Header profile trigger: split the username `<span>` out of the avatar `<button>` in
  `AdminLayout.jsx` — hovering/clicking the account name next to the avatar used to also open the
  Profile panel; now only the avatar circle itself is the click/hover target.
- **Super Admin peer password-reset revised**: a Super Admin's account can now be reset by a peer
  ONLY until they've changed their own password for the first time (`mustChangePassword` flips to
  `false`) — not permanently blocked as it was before. Covers the actual gap: a peer provisions a
  new Super Admin account and needs to pass the temp password along (or it gets lost before that
  Super Admin's first login), and there was previously no way to regenerate it since the reset
  route always 409'd for `role: 'super_admin'`. Once that Super Admin has set their own password,
  the peer-reset route 409s again, same as before — the password becomes theirs alone (profile
  panel change-password / recovery code). `routes/accounts.js`'s reset route now checks
  `mustChangePassword` instead of blanket-blocking the role; `Accounts.jsx`'s reset button mirrors
  it — enabled up to that point, then disabled with an explanatory tooltip.

## 2026-09-23 — Session: admin UI polish — collapsible explanations, mobile perf, pinch-zoom

- **New `components/InfoHint.jsx`**: a one-sentence summary that's always visible plus a small
  "Details"/"Why" trigger that pops the full explanation (built on the existing shadcn `Popover`).
  Replaces several 3-4 sentence `CardDescription`/`AlertDescription` paragraphs that used to sit on
  the page permanently — Super Admin feedback was "too much text information in all of our admins."
  Applied to: Review Queue's Barangays and Verified-teams cards, Reference List's CSV-upload
  description and its "list is locked" alert, League Setup's cross-barangay card, Site Images'
  intro card, and Season's sport-setup summary and "Ready to move on?" card. Deliberately NOT
  applied to safety-critical warnings sitting right before a destructive/irreversible action (e.g.
  the season-advance confirmation dialog, the orphaned-tournament/team delete cards) — those stay
  fully visible; only the "why" mechanism gets tucked behind a link where one existed. Many
  `CardDescription`s across these same 9 pages were already a single short sentence and were left
  untouched — the point was cutting genuine paragraphs, not converting everything on principle.
- **Review Queue barangay chips, mobile**: the 26-barangay + "All" chip row used to `flex-wrap`,
  turning into several packed rows on a phone. Now `overflow-x-auto` (single swipeable row) below
  `sm:`, wraps normally from `sm:` up where there's room. `BarangayChip` gained `shrink-0` so chips
  don't compress inside the scroll container.
- **Review Queue document `Lightbox`: real pinch-to-zoom.** It only supported mouse wheel, +/-
  buttons, and double-click — no two-finger pinch, so a Super Admin reviewing a phone-photographed
  ID on their own phone had to reach for the on-screen +/- buttons. Added `onTouchStart/Move/End`
  handling: two touches pinch (distance-ratio scaling, anchored to the pinch midpoint so it zooms
  toward where the fingers are, not the image center), one touch pans once zoomed in. Mouse-only
  pointer handlers now check `pointerType !== "touch"` so the two gesture paths don't fight over the
  same drag state. `touch-none` on the container already blocked the browser's own
  pinch-zoom/scroll, so no `preventDefault()` needed in the touch handlers.
- **Profile panel mobile lag.** Opening `ProfilePanel.jsx` fired its `GET /api/auth/profile` fetch
  (which flips `AvatarUpload`'s `hasPhoto` and loads a new avatar image) at the same instant the
  Sheet's ~200ms slide-in CSS transition started — on lower-power phones the fetch/re-render/image
  decode competed with the animation for the same frame budget and read as stutter. Deferred the
  fetch by 220ms (after the transition settles) and added `decoding="async"` to the profile and
  header avatar `<img>`s so image decode doesn't block the main thread either. Not independently
  re-measured on a real device this session — reasoned from the mechanism (fetch/render firing
  exactly on animation start is the one thing that differs from every other Dialog/Sheet in the
  app, which don't fetch+re-render on open), worth confirming Sep evaluation-week if it's still felt.
- **Admin header made sticky (Sep 2026).** `AdminLayout.jsx`'s `<header>` (menu toggle, help,
  theme toggle, season badge, profile avatar) wasn't positioned at all — this layout scrolls the
  whole page rather than a constrained `main`, so the header simply scrolled away with everything
  else, and reaching the collapse/profile/theme controls again meant scrolling all the way back up.
  Super Admin: "can we make the top float so they don't need to scroll back up." Now
  `sticky top-0 z-10` — pinned on both mobile and desktop (the same gap existed on desktop, just
  less noticed since the sidebar nav stays put there). `z-10` keeps it under the mobile sidebar
  drawer (`z-30`) and its backdrop (`z-20`), so opening the phone menu still covers the header
  instead of leaving its buttons tappable underneath.
- **Reference List near-miss (orange) detection extended to minors.** Found via the Super Admin
  deliberately testing it: mistyped a 15-and-under player's (Ali Navarro, Basketball U15, Baybay)
  middle name against the reference list, expecting the orange "same name, details differ"
  highlight — only got the purple informational one. Root cause: `routes/referenceList.js`'s
  `isMinor` branch pushed every same-name candidate straight to `minorMatchByRefId` (purple)
  unconditionally and `continue`d past the near-miss computation below entirely, so a minor's
  middle-name/birthdate agreement was never actually checked — only adults ever reached the
  `nearMissByRefId` (orange) logic. **Fix:** the `isMinor` branch now runs the same
  `sameMiddleInitial`/`sameDay` comparison used for adults per candidate; a disagreement pushes to
  `nearMissByRefId` (orange, tagged `minor: true`, same `differs` breakdown as an adult near-miss)
  instead of the purple map — a minor's official status is still always `needs_document` either
  way (never matched/flagged), this only changes what's *shown*, not the decision. `analyzeRow()`'s
  tone priority in `ReferenceList.jsx` flipped so `nearmiss` outranks `minor` (a real discrepancy is
  more actionable than a plain same-name hint). The near-miss caption appends "15 or under, needs a
  document either way" when `m.minor` so it's not read as an adult flag. Updated the page's color
  legend and "How matching works" text to describe the orange/purple split accurately (previously
  implied orange was adults-only).
- **Near-miss detection carried into the Review Queue too** (same session, follow-up ask: "for now
  its still '15 or under — needs parental consent and documents', it should be updated as what is
  changed"). The Review Queue's player modal only ever showed the static generic reason — it never
  told the Super Admin a same-name candidate existed at all, let alone which field disagreed.
  **Extracted `nearMissesFor(player, candidates)` into `services/prescreen.js`** (shared by
  Reference List and Review Queue, so the comparison lives in exactly one place instead of two
  copies that can drift — refactored `routes/referenceList.js`'s two near-miss call sites, adult and
  minor, onto it; no behavior change there, same output). `GET /api/review/teams/:teamId`
  (`routes/review.js`) now computes `nearMiss` per player (a targeted indexed lookup, same pattern
  as `decidePlayer`) whenever they're NOT a confirmed match — a `needs_document` minor, or a
  `flagged` adult specifically for `not_on_list` (a `cross_barangay` flag means they WERE found, so
  there's nothing to compare). `ReviewQueue.jsx`: the compact row callout appends "— possible match
  on the list, details differ"; the modal's full-width alert gets a new breakdown section (new
  `NearMissDetail`, same wording/shape as the Reference List page's own near-miss) listing exactly
  which field(s) disagree, roster vs list. Super Admin only, same as the Reference List page's
  near-miss — this is the one place the list's real birthdate is allowed to surface; it must never
  go into `flagReason`, which Barangay Admins also see (unchanged — `flagReason` itself wasn't
  touched, this is purely additive display data).
- **Near-miss given its own louder red+orange treatment (same session).** Super Admin: "highlight
  it as red and orange... superadmin might automatically approve it if its orange same on the
  others" — a near-miss minor was rendering in the exact same plain amber box as any routine
  needs_document case (nothing wrong, just no document yet), so nothing visually flagged it as
  needing a closer look before approving. New `NEAR_MISS_TONE` in `ReviewQueue.jsx` (red border,
  orange tint, red text) now OVERRIDES the status-based amber/red tone on both the row's
  `ReasonCallout` and the modal's `MatchCallout` whenever `nearMiss.length > 0` — same override on
  both, so it already stands out before the modal is even opened. `NearMissDetail`'s roster-vs-list
  values are colored red (roster) vs orange (list) instead of plain text, so which side is which is
  legible at a glance. The action bar's own note (which can be the only thing still visible once
  scrolled down, since the buttons are pinned) gets a matching red caution line when a near-miss
  isn't otherwise a hard block, and **Approve itself turns orange instead of green** for that case —
  deliberately not the "all clear" color — with a title tooltip explaining why. Not a hard block
  (approving a near-miss is still allowed — it's a document-review judgment call, not a rule), just
  impossible to click past without noticing.

## 2026-09-23 — Session: mobile performance — theme toggle, Review Queue modal, pinch-zoom

Super Admin: "lets fix our dark mode light mode its kinda laggy and also when we are using phone to
check the information of the player on the review queue its also laggy same to when we click the
picture and zoom in and out." Three separate root causes, all mobile-CPU/GPU-cost issues rather than
network or backend:

- **Removed `backdrop-blur-xs` from the shared `DialogOverlay`** (`components/ui/dialog.jsx`) —
  `backdrop-filter: blur()` is one of the most GPU-expensive CSS effects on a phone, and EVERY
  `Dialog` in the app uses this one overlay component. Opening the Review Queue's player modal (over
  a page full of rows/photos) paid that cost once; opening the zoom lightbox from inside it — a
  SECOND `Dialog` stacked on top — paid it a second time simultaneously. Replaced with a plain
  `bg-black/30` (no blur) — reads as "definitely a modal" without the compositing cost. Affects every
  dialog site-wide (Player modal, Lightbox, confirm dialogs, Season's create dialog, Site Images'
  crop dialog, etc.) — none of them needed the blur specifically.
- **Dark/light toggle: real root cause wasn't the circular-reveal animation** (already skipped on
  touch — see the Sep 2026 Profile-panel-adjacent theme-toggle work). Flipping the `dark` class
  recomputes every CSS-variable-driven color at once, and hundreds of elements across the admin UI
  carry their OWN Tailwind `transition`/`transition-colors` class for hover states — those don't
  scope to `:hover`, so the exact same transition ALSO plays on this bulk color recompute, meaning
  hundreds of elements cross-fade simultaneously on every toggle, independent of whatever the
  toggle's own animation does. New `.theme-switching, .theme-switching * { transition: none !important; }`
  in `index.css`; `AdminLayout.jsx`'s `handleThemeChange` adds that class to `<html>` right before
  flipping the theme, then removes it two `requestAnimationFrame`s later (long enough for the new
  colors to have actually painted). Normal hover/interaction transitions are unaffected outside that
  one-frame window.
- **Pinch-to-zoom lag — the actual cause of the Sep 2026 pinch-zoom feature itself feeling laggy**:
  `Lightbox` in `ReviewQueue.jsx` was calling `setScale`/`setPos` (React state) on EVERY
  `touchmove` event — a touchmove can fire 60-120x/sec, so every finger movement was a full React
  re-render of the whole Lightbox tree. Rewritten so a `paint(scale, x, y)` helper writes straight to
  the `<img>` element's `style.transform` via a ref during an active gesture (mouse drag, one-finger
  touch pan, OR two-finger pinch — tracked in per-gesture refs, e.g. `pinchRef.current.scale/x/y`),
  with React state (`scale`/`pos`) only committed ONCE, when the gesture ends (`commit()` at
  pointerup/touchend). A `gesturing` boolean (set true for the gesture's duration) replaces the old
  incidental "transition is off because a state update happens to be firing every frame" behavior
  with an explicit one. Fixed a stale-closure bug in the pinch→single-finger-pan handoff along the
  way: reading `pos`/`scale` React state immediately after calling `commit()` in the same function
  call returns the PREVIOUS render's value (state updates aren't synchronous), so the handoff now
  reads the pinch's own just-computed `x`/`y`/`scale` instead. Also added `decoding="async"` to the
  player photo, document thumbnail, and lightbox `<img>`s so decode work doesn't block the main
  thread right as the modal/lightbox opens (same fix already applied to the Profile panel's avatar
  images).

## 2026-09-23 — Session: Barangay Admin can now VIEW their own uploaded documents

Super Admin: "can we also have the brgy admin verification status has a way of seeing their uploaded
documents to see if they will remove it or change it." Before this, a Barangay Admin's Verification
Status page (`pages/brgy/Documents.jsx`) only ever showed a document's TYPE + verify status + a
delete button — never the file itself. The only file-serving route,
`GET /api/teams/documents/:docId/file`, is hard-locked to `super_admin` (residency documents are
private — IDs, birth certs), so a Barangay Admin genuinely could not see what they'd uploaded, only
its filename and status, making "should I delete this and re-upload" a guess.

- **New scoped route**: `GET /api/teams/:id/players/:playerId/documents/:docId/file`
  (`routes/team.js`, `authorize('barangay_admin')` + `loadOwnedTeam` — same ownership check every
  other Barangay Admin roster route uses) serves the SAME GridFS file, but only when the caller owns
  the team the player is on. The existing super-admin-only route is untouched — this is a parallel,
  ownership-scoped path to the same bytes, not a loosening of it.
- **Extracted `components/DocumentViewer.jsx`** (`Lightbox` + `DocumentFrame`) out of
  `ReviewQueue.jsx`, which used to have its own private copies — now BOTH the Super Admin's Review
  Queue and the Barangay Admin's Documents page share the exact same fetch-with-token / blob-URL /
  zoomable-image code (including the Sep 2026 pinch-zoom perf work above), so a future fix to one
  only ever needs making once. `ReviewQueue.jsx`'s `DocumentView` is now just the label/status header
  wrapper around a shared `<DocumentFrame fetchUrl=... />`.
- **`Documents.jsx`**: each document row gets an "eye" View button (available for every document,
  not just `pending` ones — the delete button stays `pending`-only, viewing has no such restriction)
  that opens a `DocumentPreviewDialog` — the same zoomable viewer, pointed at the new scoped route.
  Deliberately lazy: nothing is fetched until the Barangay Admin actually clicks View, unlike the
  Review Queue (which eagerly loads every document for a player, since reviewing IS the point of
  that screen) — a Barangay Admin's document list could span many players/documents, and eagerly
  fetching every thumbnail on page load would risk reintroducing the same "many concurrent
  fetch+decode on open" lag just fixed above.
- **Document row overflow guard (same session, follow-up):** the Super Admin reported not being
  able to see the new View button on mobile/tablet, then retracted it ("my bad we can") — but while
  checking, a real latent bug surfaced in the same row regardless: `Card` clips overflow by default
  (`overflow-hidden` baked into `components/ui/card.jsx`), and the document row's label `<span>` had
  `flex-1` with no `min-w-0`/`truncate`. A long label (e.g. "Parental Consent (15 and under)") on a
  narrow screen would force the row wider than available space, and since flex items default to
  `min-width: auto` (their own content's width), the row wouldn't shrink — it would just overflow
  past the Card's clipped edge, cutting the Eye/Delete buttons off entirely rather than merely
  cramming them. Fixed: `min-w-0 truncate` on the label (so IT shrinks/ellipsizes instead), `shrink-0`
  on the status badge and both buttons (so they never compress). Not confirmed as the exact cause of
  the original report (which the Super Admin said wasn't actually happening), but a real defect
  regardless — worth fixing on its own.

## 2026-09-24 — Session: boys/girls rosters, Review Queue divisions, ML team count, ashy dark mode

- **Boys and girls divisions no longer mix (Super Admin rule).** Found by uploading a
  Badminton Girls CSV into Badminton Boys: it was accepted and ready to submit. Player
  has no gender field, so the barangay's own rosters are the evidence:
  `genderConflictIndex()` in `routes/team.js` blocks add-player (409), CSV import (row
  skipped + reported), "Correct this player" (409) and — as a backstop — submit, whenever
  the athlete (name + birthdate, same identity as `playerKey()`) is already on one of
  THIS barangay's opposite-gender teams this season, in ANY sport. A Badminton Boys player
  can still join Volleyball Boys or an Open team (Billiards, Chess, Mobile Legends); Open
  and the age divisions (under15/under30) are never checked. Limitation: a brand-new
  player's gender is only known once they're on a boys or girls roster, so the first
  roster they join is unchecked. Checked read-only on the dev data: no existing roster
  already breaks the rule; a mock boys team in Mukas correctly saw all 12 of Mukas's
  girls players, and an open team saw none.
- **Review Queue shows each team's division.** A barangay's two Badminton teams (boys
  + girls) looked identical; `GET /api/review/queue` now returns `division` for pending
  and verified teams, shown as a badge beside the name (boys sky, girls pink, others grey).
- **Team registration shows how many teams a sport allows.** Picking a sport shows
  "1 team per barangay — already registered / not registered yet" or "Up to 2 teams per
  barangay — N of 2 registered", and Create is disabled once the limit is reached. For
  Mobile Legends it also explains that a Top 8 knockout takes one team per barangay, so a
  second team only plays if the league picks Top 16. Considered and NOT done: tying the
  ML team limit to a knockout size set in League Setup. The knockout size is picked at
  bracket generation, after registration (an earlier League Setup version was removed),
  and `POST /generate` already refuses Top 8 while a barangay has two verified teams.
- **Profile panel lag on phones (Barangay Admin / Organizer).** Radix auto-focuses the
  first focusable element when the Sheet opens. With no profile photo (most of these
  accounts) that was the "Current password" field, so the phone keyboard opened during
  the slide-in and the viewport resized mid-animation. Super Admin accounts with a photo
  focused the "Remove" button instead, which is why they didn't lag. `ProfilePanel`
  now prevents the auto-focus and focuses the panel itself.
- **Dark mode is ashy grey instead of near-black.** `.dark` tokens in `index.css`
  now use a slightly cool slate grey (page `#24272a`, cards/header `#2e3134`, muted
  `oklch(0.37 …)`). `DARK_CHROME` (`lib/themeChrome.js`) and `index.html`'s pre-React
  theme script were updated to match. Admin only; the Public Viewer is unaffected.
- **Document verification status is colour-coded.** On the Barangay Admin's Document
  Submission page, "pending" was a grey badge on a grey row. Each document row is now
  tinted with a left border (amber = awaiting review, green = approved, red = rejected),
  and the badge reads "Awaiting review" / "Approved" / "Rejected". The Review Queue's
  document header uses the same badge colours.

## 2026-09-24 — Session (cont.): ML knockout size set before registration, light default

- **Mobile Legends' knockout size is now chosen in League Setup BEFORE registration,
  and it sets the team limit** (Super Admin decision; reverses "pick it at generate
  time"). Top 8 = one team per barangay, Top 16 = up to two. Stored on
  `Sport.knockoutSize` (unset = Top 16, the old behaviour, so nothing changes until
  it's set). `knockoutSizeOf()` / `teamsAllowedFor()` in `lib/sportRules.js` are the
  single source: `POST /api/teams` enforces the limit, `GET /api/sports` returns
  `knockoutSize` + `teamsAllowed` for the registration card, and `POST /generate`
  uses the saved size (a `knockoutSize` in the request is now ignored). Saved via
  `PATCH /api/sports/:id/config`, which refuses Top 8 while any barangay already has
  two teams (409, names them) and refuses any change once the season's bracket
  exists. The Tournaments page's Top 8 / Top 16 picker became a read-only line
  linking to League Setup. Replaces the hardcoded "Mobile Legends = 2 teams" and the
  never-edited `teamsPerBarangay`. Checked on dev data: ML unset → Top 16 / 2 teams;
  switching to Top 8 right now would be refused (3 barangays have two ML teams).
- **Admin theme defaults to LIGHT.** With no saved choice it used to follow the
  device's dark setting, so every newly created account opened in dark mode on a
  dark-mode phone/PC. `getStoredTheme()` (`lib/theme.js`) and the pre-React script in
  `index.html` now both default to light; a saved choice still wins.
- **The knockout size / team limit applies to every esport, not only Mobile Legends.**
  Esports are always round-robin now: a `pre('validate')` hook on the Sport model forces
  `round_robin` for `category: 'esports'`, so a newly added esport (e.g. Call of Duty
  Mobile) or a game switched to the esports type gets the Top 8 / Top 16 choice and the
  matching team limit automatically. `isRoundRobinSport()` (round-robin OR esports) is
  used by `knockoutSizeOf()`, bracket generation and the knockout draw, so an esport
  stored as double-elim before the hook still works. League Setup: the draw format is
  locked to round-robin for a new esport; the API refuses double-elim for an esport and
  refuses a type change that would switch the draw once this season has a bracket.
  Checked without saving: a new esport validated as double-elim came out round-robin,
  Top 16, 2 teams; a physical sport stayed double-elim, 1 team.

## 2026-09-24 — Session (cont.): dashboard stat tiles on phones, Discord "Ash" dark theme

- **Dashboard stat numbers no longer get clipped on phones.** Cause: at 360px each
  column of the 2-column grid is 158px; the card's padding leaves 126px, and the icon
  (40px + 12px gap) left the text ~74px. "893/1084" at 20px semibold needs ~100px and
  has no wrap point; the text column's `min-w-0` let it shrink below that, and the
  Card's `overflow-hidden` cut the last digit (showing "893/108"). The sub-labels wrapped
  to 3 lines for the same reason. Fix in the shared `StatTile`: below `sm` the icon
  sits above the text, and the number's font-size is capped by its own box
  (`@container` + `cqi`), so it stays 20/24px and only shrinks for a value too long to
  fit. Checked by rendering a harness in headless Edge at 320 / 360 / 414 / 1024 /
  1440px with values up to "12345/67890": no clipping, no horizontal scroll, sub-labels
  at most 2 lines, desktop layout unchanged. Also fixes the Barangay Admin and
  Organizer dashboards, which use the same tile.
- **Dark mode is now Discord's "Ash" look**: page `#323339`, cards/header/sidebar
  `#393a41`, hover `#43444b`, text `#dbdee1` / `#b5bac1`. The first ashy pass
  (`#24272a` / `#2e3134`) still read as dark mode. Brand blue unchanged; address-bar
  colour updated to `#393a41`.
- **Profile panel slide lag, measured and fixed properly.** The earlier fix (no
  auto-focus on "Current password") only removed the keyboard popup; it still felt
  laggy. Measured on a production build with a mock API in headless Edge (390px, 6x
  CPU throttle), recording long tasks and frame gaps while tapping Profile: opening
  blocked the main thread ~95ms (panel mount + Radix focusing the panel, a forced
  layout of ~185ms per open before that) and then another ~150-190ms (Radix's MODAL
  setup: scroll lock, aria-hiding the page, `pointer-events: none` on `<body>`, each a
  whole-page style recalc), so the slide skipped its first frames. Fix: the profile
  Sheet is now non-modal with a plain backdrop that closes on tap (`lightBackdrop` on
  `SheetContent`), the Sheet body has `overscroll-contain` so dragging the panel
  doesn't scroll the page, and focus moves into the panel after the slide finishes.
  Result: ~60ms blocking at open (from ~250ms), worst frame gap 83-100ms (from
  234-300ms), the same for Barangay Admin, Organizer and Super Admin (Super Admin was
  550-1000ms). Verified: backdrop tap closes, Escape closes, page doesn't scroll on a
  drag, focus lands in the panel. Other dialogs are unchanged (still modal).
- **A deleted or replaced photo kept showing, even after a refresh.** Cause:
  `sendFile()` served every GridFS file with `Cache-Control: public, max-age=86400`,
  while the photo URLs never change when the file does (`/api/auth/users/:id/photo`,
  `/api/teams/players/:id/photo`). After deleting a profile photo, a refresh loaded the
  header avatar from the browser's day-long cache without asking the server. Fix:
  `sendFile` now defaults to `no-cache` plus an `ETag` (the GridFS file id), so the
  browser checks every time and an unchanged photo costs a tiny 304; a deleted one
  returns 404 (initials), and a replaced one downloads fresh. Site images (60s) and logos
  (300s) keep their short caches. The photo URLs got a new query parameter (`?rev=`,
  `?f=<file id>`, `?c=2`) so browsers ignore copies saved under the old rule.
  Checked with a throwaway server against the dev data: 200 + ETag, then 304 for the
  same ETag, 200 for an old ETag.
- **Residency documents were served `public, max-age=86400`.** "public" allows shared
  caches (the hosting layer in front of the API) to keep a copy of an ID or birth
  certificate. Both document routes now send `private, no-store`.
- **Show/hide (eye) button on every password field, plus a "passwords match" hint.**
  New accounts must change their temporary password on first login, and people couldn't
  see what they'd typed. New shared `components/PasswordInput.jsx` (the login page's
  eye button, made reusable) is used on the first-login Change Password page, the
  profile panel (change password, recovery code) and forgot-password. A live
  "Passwords match" / "Passwords don't match yet" line sits under each confirm field.
  Checked at 390px: tapping the eye shows the text, and the hint turns red, then green.
- **My Teams shows what screening found on each submitted roster.** Beside the status
  badge ("Draft" / "Submitted" / now also "Verified"), a submitted team shows "N
  flagged", "N need a document" (tap → Verification Status), "N documents in review"
  (uploaded, waiting for the SK Federation) or "All eligible". `GET /api/teams/mine`
  returns a `screening` tally per team from 3 batched queries (it used to run one
  count query per team). Checked read-only against the dev data (Mukas U15: 10
  documents in review; Matampay U15: 10 need a document), and rendered at 390px and
  1280px (on a phone the badges get their own line, above the buttons).
- **An unchecked barangay could import other barangays' players (fixed).** A Tabigue
  (cross-barangay OFF) admin imported a CSV of Inudaran players into Tabigue's U15 team
  and it was accepted: the import ignored the CSV's address column and stamped every
  row "Tabigue", and residency was only screened on submit (and never for minors,
  who aren't on the list). The rule itself was right and was re-confirmed: only a
  CHECKED barangay may recruit from other barangays. New `crossBarangayBlock()` in
  routes/team.js, for an unchecked team only, refuses on add, CSV import (row skipped
  with the reason) and "Correct this player" when the CSV address names another
  barangay, or an adult is on the reference list under another barangay. Tested on
  the dev data (address matching, a real Inudaran adult blocked from Tabigue but
  allowed on Inudaran) and through the real import route on a throwaway team that
  was deleted afterwards. Gap: a minor with no address given has no home-barangay
  record anywhere.
- **Follow-up: the import also reads a "Barangay" column.** The cross-barangay check only
  looked at a column headed "Address"; a roster with the barangay under "Barangay" /
  "Brgy" / "Home Barangay" slipped through. Tested through the real import route on a
  throwaway team (deleted afterwards): "Inudaran" and "Brgy. Inudaran" rows skipped,
  "Tabigue" added. Players ALREADY imported before the fix stay on the roster; the
  check only stops new entries.
- **A team with a rejected player is reopened for that team only (fixes a dead end).**
  Rejecting a player during verification removed them and said "the roster has been
  reopened", but adding a replacement, importing, removing and resubmitting all needed
  registration to be open. The team also dropped out of the Review Queue, so one
  rejection meant it could never be verified. New `requireRosterWindow` (routes/team.js)
  allows those four during verification only for a team whose status is `rejected` and
  that hasn't resubmitted, in the current season. Resubmitting puts it back to pending
  (with residency screening) and closes the window; every other team stays locked, and
  creating new teams still needs registration open. The Review Queue lists these teams
  under "Waiting for the barangay to resubmit"; My Teams shows "Player rejected: fix and
  resubmit", and the roster editor explains it. Gate tested with 9 cases (allowed only
  for a rejected, not-yet-resubmitted, current-season team during verification).
