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
