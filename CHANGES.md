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