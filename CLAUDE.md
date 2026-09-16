# Municipal Sports Portal — Kolambugan

Inter-Barangay Sports League Management System with Automated Residency
Verification and Real-Time Match Analytics for the Municipality of Kolambugan,
Lanao del Norte, Philippines.

Undergraduate BSCS thesis (Lanao School of Science and Technology Inc.).
Final defense: **October 2026**. Development window: **Jul–Sep 2026** —
favor shipping Must-haves over polish. Online evaluation with ~33 real
respondents happens **September 2026**, so the system must be deployed
and stable by early September.

---

## The problem this solves

The SK Federation runs an inter-barangay sports league across 26 barangays and
7 sports. Today everything is manual: paper rosters, no reliable residency
check (outsiders sneak in — locally called the **"Dayo"** problem), whiteboard
score tallying, no public visibility, records lost every season.

---

## Stack

- **MongoDB** (Atlas) — primary database. File storage via **GridFS**.
- **Express.js** — REST API
- **React.js** — frontend
- **Node.js** — server
- **JWT** auth + strict Role-Based Access Control
- Do **not** introduce Supabase, PostgreSQL, or any other datastore.

---

## The four roles

| Role | Who | What they do |
|---|---|---|
| **Super Admin** | SK Federation + Head of LYDO (2) | Uploads reference list, reviews/approves documents, provisions accounts, sets up tournaments, generates brackets |
| **Barangay Admin** | SK Chairperson per barangay (26) | Submits their barangay's team rosters + uploads player photos and residency documents. Does NOT score games. |
| **Organizer** | Game-day official, **one per sport** (7) | Encodes live scores, fouls, match status. Only for their assigned sport. |
| **Public Viewer** | Everyone | Read-only. No login. Live scores, standings, brackets, schedules, team lineups, champions archive. |

---

## Roster & player rules (CONFIRMED)

- Roster size depends on the sport's **entry format** (see Divisions below):
  - `team` → **10–15 players** (basketball, volleyball, Mobile Legends)
  - `doubles` → **exactly 2** (pickleball always; badminton when the season runs doubles)
  - `singles` → **exactly 1** (billiards, chess; badminton when the season runs singles)
  Enforced on add-player and on submit (`ROSTER_LIMITS` in routes/team.js).
- New players / under 15: require **parental consent + supporting documents**.
- Player fields collected: full name, birthdate (age derived), **photo**, address,
  jersey number.
- **Player photos ARE PUBLIC** (changed Aug 2026 — see CHANGES.md). They appear on
  the public team roster so viewers can see who plays for a barangay. Standard:
  **close-up headshot, face clearly visible, plain background**; JPEG/PNG/WebP,
  max 3 MB. The standard is enforced by UI guidance + Super Admin review, not
  automatically. Address and birthdate remain PRIVATE — never on public routes.
- One athlete may join **multiple sports** in a season (schedule permitting)
  → players↔teams is many-to-many (TeamPlayer).
- There is a **registration deadline**; teams cannot freely add players
  mid-tournament (exact deadline handling still open).

## Super Admin = two parties (CONFIRMED)

The Super Admin role is held by BOTH the **SK Federation** and the
**Head of LYDO** (Local Youth Development Office). LYDO handles the
municipality's sports program and is the only body that can obtain the
SK voters' list (ages 15–30 — not the COMELEC general register). Both
accounts are provisioned (`sk_federation`, `lydo_head`).

## CRITICAL: the verification rule (CONFIRMED by stakeholder)

- A **"Dayo"** is a player from **outside the Municipality of Kolambugan**.
  Municipal residents are eligible.
- **Cross-barangay play is allowed ONLY for players from designated
  small/remote barangays** (a whitelist, because those barangays are too
  small to field their own teams). Confirmed list (as validated by the
  stakeholder — `allowsCrossBarangay` is now editable per barangay from
  League Setup, so the live database may have since diverged from this list):
  Small Banisilon, Matampay, Bubong, Pantaon, Inudaran, San Roque,
  Palao, Sto. Niño, Sucodan, Lumbac.
  Players from the larger barangays play for their OWN barangay.
  (`allowsCrossBarangay` boolean on the barangays collection, editable via
  League Setup at `/admin/config`.)
- **Verification is DOCUMENT-based** (confirmed): each player proves
  Kolambugan residency with a Valid ID, Voter's Certification, or Birth
  Certificate. New players / those under 15 also need PARENTAL CONSENT
  plus supporting documents.
- The **SK voters' list** (ages 15–30 — confirmed by the SK Chairperson; NOT
  the COMELEC general register) can power an automatic pre-check, but it can
  only be obtained through the **LYDO**. **Still EXPECTED, not in hand**
  (Aug 2026). Because the list starts at 15, players under 15 route straight
  to `needs_document` with no lookup — they cannot be on it by definition.
  Until then, verification runs on the SK Federation's own
  reference list + uploaded documents + Super Admin review. When the
  voters' list arrives it drops into the SAME reference-list upload (it is
  just another CSV) — no code change anticipated beyond column mapping.
  NOTE: a voters' file is real personal data of real residents. Never commit
  it, never expose it on public routes, use anonymised data for testing.
- Super Admin gives the official verdict; approvals persist in
  verified_residents (never overwrite the reference source).
- The reference list is uploaded by the Super Admin (CSV) and **replaces**
  the previous list (snapshot semantics).
- Verification flow:
  1. Barangay Admin submits roster → system **auto pre-screens** each player
     against the reference list immediately (eligible / needs_document / flagged,
     with `flagReason`).
  2. Players NOT on the list (minors, new players) upload a residency
     document via the Barangay Admin's **Document Submission** page.
     Documents are the EXCEPTION, not required for everyone.
  3. **Super Admin reviews in the Review Queue** — sees the player's photo and
     the uploaded document inline — and gives the official verdict
     (approve / reject). Reject removes the player and REOPENS the roster.
  4. Verify locks the team (`status: 'verified'`); only verified teams enter
     tournaments. **A later correction can un-verify it** (fixed Sep 2026):
     the "correct this player" PATCH re-screens on a name/birthdate change,
     and if that comes back non-eligible on an already-verified team,
     `team.status` flips back to `pending` so it reappears in the Review
     Queue — `submittedAt` is untouched, so the roster stays locked either
     way. Before this fix, a verified team could sit with a flagged player
     invisible to the Review Queue (which only lists `status: 'pending'`)
     while `/api/stats/dashboard`'s count (raw, off `Player`, no team-status
     filter) correctly disagreed with it — the tell that surfaced the bug.
  5. (PENDING) Approved players written to **verified_residents**, which
     persists across seasons and is checked alongside the reference list.
     NEVER write approvals into the reference list itself.

---

## Tournament format (CONFIRMED by stakeholder + BUILT/TESTED as of Aug 2026)

TWO formats, both ending in a single-elimination knockout.

### Mobile Legends: GROUP ROUND-ROBIN → SCALING SINGLE-ELIM + 3RD PLACE
**BUILT AND TESTED end-to-end, including a full 52-team funnel.**
- Phase 1 — Group stage: the Super Admin picks a KNOCKOUT SIZE (Top 8 or
  Top 16), NOT a number of groups. The system ALWAYS makes 8 groups and
  derives how many advance per group:
    - Top 8  → 8 groups, top 1 advances each
    - Top 16 → 8 groups, top 2 advance each
  Teams are distributed as evenly as possible across the 8 groups, so ANY
  registration count works (43, 52, odd numbers): the group stage absorbs
  the uneven numbers and the knockout stays a clean power of 2 (NO byes in
  the knockout, ever). `knockoutSize` (enum [8,16]) on the Tournament model.
  Round-robin within each group, every pairing once, best-of-1.
- Phase 2 — Knockout: SINGLE-ELIMINATION, scales to any power of 2 (8/16/32).
  Round of N → … → Semifinals → Grand Final, plus a 3rd-place match.
  Final = BO5; earlier rounds = BO3; 3rd place = BO3 (the two SF losers).
  `numRounds = log2(N)`; wires `nextMatchWin` so winners advance and SF losers
  route to the 3rd-place match.
- ML is OPEN division (mixed gender); a barangay MAY field 2 teams.

### ML group-stage tiebreakers — DONE (per-group single-elimination)
- A cutoff tie = teams sharing the same (wins, gameWinDiff) that spans a
  group's advance line. Ties are ALWAYS resolved WITHIN a group, never
  across groups (4 tied groups = 4 independent tiebreakers, no shared pool).
- **Per-group SINGLE-ELIMINATION playoff** ("win or go home"), replacing the
  earlier round-robin + random-draw approach. Points decide who is tied;
  WINS decide the tiebreaker. Byes for non-power-of-2 tied counts are assigned
  by a stable hash of the team id (`seedOf`) so they survive reloads — teams are
  equal on points, so the draw is fair.
- Spots filled = group advance count − clearly-qualified teams (usually 1;
  if 2 spots are contested, BOTH finalists advance).
- Tiebreaker matches: `bracket:'group'`, `isTiebreaker:true`, `round 100+`.
  The result route advances them through rounds; qualification reads the
  bracket winner(s). Single-elim always resolves, so `resolvedByDraw` is gone.

### Physical sports (Basketball, Volleyball, Badminton, Pickleball, Billiards):
### 4 GROUPS → DOUBLE-ELIM PER GROUP → TOP 8 KNOCKOUT — **BUILT AND TESTED**
(CONFIRMED by stakeholder: 4 groups, "win 3 → Big 8, lose 2 → out". This
SUPERSEDES the earlier "no group stage / one straight double-elim bracket" note,
which contradicted the meeting notes.)
- Phase 1 — Group stage: verified teams **of one division** are split into 4
  groups (A/B/C/D), as evenly as possible. Minimum 12 verified teams (3 per
  group). Each group runs its OWN DOUBLE-ELIMINATION bracket: one loss drops you
  to the losers bracket, a second loss eliminates you.
- Two qualifiers per group: the UPPER-bracket winner (0 losses, **seed 1**) and
  the LOWER-bracket winner (1 loss, **seed 2**). They do NOT play an in-group
  grand final — both advance. Win-count to qualify FLEXES with group size (byes
  for non-power-of-2 groups); the literal "3 wins" is descriptive, not hardcoded.
- 4 groups × 2 qualifiers = 8 → Phase 2.
- Phase 2 — Knockout ("elimination round"): single-elimination Top 8 + 3rd place,
  with **STANDARD SEEDING** so same-group teams cannot meet before the final and
  the four group winners are spread across the bracket:
  **A1–B2, C1–D2, B1–A2, D1–C2**.
- Billiards is scored per match as a plain win (organizer enters the score,
  winner advances) — no live per-point tapping. It still uses the full bracket.
- Ties for advancement broken by a PLAYOFF match (NOT point difference).

**Key routes / functions (backend/src/routes/tournament.js):**
- `generateGroupDoubleElim(tournamentId, group, orderedIds)` — builds one group's
  upper+lower brackets with byes and win/lose wiring; returns
  `{ matches, upperFinal, lowerFinal }`. Proven by simulation (5000+ random
  playthroughs, N=3..16, always exactly 2 correct qualifiers) and live-tested
  (24 teams → 4 groups → played out → 8 qualifiers → Top 8 → champion + 3rd).
  A 2-team group is a special case: one decider match, both teams qualify.
- `POST /generate` — body `{ sportId, division }`. Physical branch: 4 groups +
  double-elim per group. ML branch: 8 groups + round-robin. One tournament per
  **(sport, season, division)**.
- `GET /:id/de-qualification` — per group, the 2 qualifiers tagged with seed.
- `POST /:id/de-bracket` — reads those 8 and builds the standard-seeded Top 8.
- `GET /:id/qualification` + `POST /:id/tiebreakers` — the ML (round-robin) path.

**BRACKET LABELS (important — they are NOT interchangeable):**
- Group stage: `winners` / `losers` (double-elim), `group` (ML round-robin and
  tiebreakers)
- Finals: `knockout` / `ko_final` / `ko_third` — ML knockout now shares these
  same labels with any round-robin sport, rather than the earlier
  special-cased `winners` / `final` / `third`.
This separation exists because group-stage upper brackets and the Top 8 both used
to be `winners`, which broke match counts and made the two indistinguishable.
`GET /:id/bracket` branches on the tournament's `tournamentFormat` field, not
on the sport's name — the earlier hardcoded "Mobile Legends" / 8-team
double-elim special case has been removed, so any sport configured as
round-robin in League Setup takes the same path ML does.

**Advancement is SCORE-DRIVEN, never organizer-chosen (integrity):**
- The bracket SKELETON is generated and LOCKED at draw time — every slot and
  the routing (`nextMatchWin` / `nextMatchLose`) is predetermined by structure.
- The Organizer enters ONLY the match score. The system derives the winner and
  routes BOTH teams automatically. The Organizer never picks who advances.
- All results appear on the public dashboard + audit trail (`enteredBy`,
  `enteredAt`). Prevents a dishonest organizer from advancing the wrong team.
- The result route advances: `isTiebreaker` matches (winner only), and
  `winners` / `losers` / `final` / `knockout` / `ko_final`. `final` and
  `ko_final` also mark the tournament completed and name the champion.

**Per-match best_of:** 1/3/5/7, default 1. Matches hold a `games[]` array +
`seriesWinner`. ML knockouts use BO3/BO5.

**LIVE SCORING & PERIODS (BUILT Aug 2026):**
- The ORGANIZER scores matches, not the Super Admin. A match runs
  scheduled → (organizer taps Start, choosing the PERIOD COUNT) → ongoing →
  (organizer taps End match) → completed, and only then does advancement fire.
- **Periods** (quarters / sets) are stored in `bestOf`. ALL periods must be
  played before the match can end. The running score ACCUMULATES across periods
  — it never resets — and the winner is the higher TOTAL. Each `games[]` entry
  holds only that period's own points, so the periods sum to the final score
  (a scoresheet, not a running scoreboard).
- Per-sport period options: Basketball [4]; Volleyball/Badminton/Pickleball
  [1,3,5]. Per-sport point values: Basketball [1,2,3]; the rally sports [1].
- A TIE at the end extends the match by one deciding period rather than
  trapping the organizer — a tie can never be recorded.
- **Cancel match** resets a started match to `scheduled` and discards the live
  score, periods, and PlayerMatchStats (for a mis-tap or a voided game). A
  COMPLETED match cannot be cancelled — its winner has already advanced.
- Scoring is blocked once every period is banked; only End match remains.

**MATCH SCHEDULING (BUILT Aug 2026):**
- Super Admin sets dates per match or in BULK BY ROUND, plus a `venue` string,
  from a collapsible Schedule section inside the Tournaments page.
- The organizer's match list surfaces a **Today** section; starting a match
  dated for another day asks for confirmation but PROCEEDS (soft gate).
  Rationale: dates are an organisational aid, not an integrity control — an
  organizer must never be blocked from recording a game being played in front
  of them. A match with NO date is always startable (which also keeps the
  September evaluation usable).
- Day comparisons run in Asia/Manila time via `config/time.js` (fixed —
  Render's server-local time is UTC, 8h behind Kolambugan).

**Unavailable team = FORFEIT** (confirmed). No reschedule/re-pair.

**Also recorded per match:** points, fouls, rebounds, assists, MVP
(PlayerMatchStats).

---

## Divisions & entry formats (BUILT Aug 2026)

Each sport runs **one bracket per division**, and a division's roster size comes
from the sport's **entry format**. Both are per-season settings the Super Admin
configures from **League Setup** (`/admin/config`), which replaced
`src/config/seedSportConfig.js`.

**Sport model:** `divisions: [String]` (which divisions run this season) and
`entryFormat: 'team' | 'singles' | 'doubles'`.
**Team model:** `division` (`open` | `boys` | `girls` | `under17` | `under30`)
and `format` (`team` | `singles` | `doubles`).
**Tournament model:** `division` — one tournament per (sport, season, division).

| Sport | Divisions | Entry format | Brackets |
|---|---|---|---|
| Basketball | under17, under30 | team | 2 |
| Volleyball | boys, girls | team | 2 |
| Badminton | boys, girls | **singles OR doubles — Super Admin picks per season** | 2 |
| Pickleball | boys, girls | doubles (always) | 2 |
| Billiards | open | singles (1 player per barangay) | 1 |
| Chess | open | singles | 1 |
| Mobile Legends | open | team (up to 2 teams per barangay) | 1 |

- Basketball's split is by **age**, not gender. Badminton runs **one** format per
  season (not both simultaneously). Pickleball is doubles-only.
- Registration rule: **one team per (barangay, sport, season, division)** — so a
  barangay can enter both under17 and under30. ML still allows 2 teams.
- A division only becomes a bracket if enough barangays entered it.

---

## Data model (actual Mongoose fields — camelCase)

```
Season         name, status ∈ {setup, registration_open, verification,
               ongoing, completed}, openedBy, openedAt, closedAt
Barangay       name, allowsCrossBarangay, logo(GridFS id)
User           username, passwordHash, role ∈ {super_admin, barangay_admin,
               organizer}, barangay(FK|null), assignedSport(FK|null),
               mustChangePassword
Sport          name, category ∈ {physical, esports}, tournamentFormat,
               divisions[], entryFormat, scoringMode, pointValues,
               periodLabel, periodOptions, statTypes, onCourt,
               teamsPerBarangay, numGroups, knockoutSize  ← per-sport rules
               from League Setup; null by default, falls back to the
               built-in for the seven seeded sports (`isDivided` is DEAD —
               nothing reads it)
Team           teamName, barangay, sport, season, status ∈ {pending, verified,
               rejected}, submittedAt, division, format
Player         firstName, middleName, lastName, birthdate, age, photo(GridFS id),
               address, jerseyNumber, eligibilityStatus ∈ {pending, eligible,
               needs_document, flagged}, flagReason
TeamPlayer     team, player            ← many-to-many, unique(team, player)
Document       player, docType ∈ {birth_certificate, voters_id,
               barangay_clearance, parental_consent}, file(GridFS id),
               verifyStatus ∈ {pending, approved, rejected}, reviewedBy,
               reviewedAt
ReferenceList  (replaced per upload — snapshot semantics)
Tournament     sport, season, division, stage ∈ {group_stage, elimination,
               completed}, format ∈ {double_elimination, round_robin},
               groups[], advancePerGroup, knockoutSize ∈ {8,16}
Match          tournament, bracket ∈ {winners, losers, final, group, third,
               knockout, ko_final, ko_third}, round, group, teamA, teamB,
               organizer, bestOf ∈ {1,2,3,4,5,7}  ← ALSO the PERIOD COUNT,
               games[{gameNumber, scoreA, scoreB, winner}]  ← one entry per
               PERIOD, holding only that period's own points,
               seriesWinner, nextMatchWin, nextMatchLose, isTiebreaker,
               status ∈ {scheduled, ongoing, completed, forfeited},
               schedule, venue, liveScoreA, liveScoreB  ← running totals,
               startedAt, mvp(FK Player), enteredBy, enteredAt,
               lastAction{type, side, player, amount, label}  ← one step of
               undo history, names what it reverses
PlayerMatchStats  match, player, points, fouls, rebounds, assists  ←
                  unique(match, player); written by the organizer
Champion       season/year, sport, division, teamName, playerName,
               proofPhoto(GridFS id)  ← free text, no FK to Team/Player
               (a past champion may predate the Team/Player records)
SiteImage      key ∈ {hero, league, barangay, about}, image(GridFS id), crop
```

GridFS buckets: **`photos`**, **`champions`**, **`site`**, and **`logos`**
(all public) and **`documents`** (super-admin only). Kept separate on purpose
so a bug in one route cannot expose the other.

---

## Accounts & authentication (BUILT)

- **No self-registration anywhere.** All accounts are provisioned.
- Super Admin **Accounts panel**: lists all accounts by role with their
  password status; "Provision all" fills any missing barangay-admin /
  organizer accounts; "Add an account" for anything else (e.g. a second
  super admin); per-account "Reset password"; guarded delete.
- **Temp passwords are shown exactly ONCE**, at creation or reset — bcrypt is
  one-way, so they cannot be retrieved later. The Super Admin copies and
  distributes them (Messenger/text). Copy button copies the password only.
- Passwords are **randomly generated per account** — never a predictable
  pattern. Usernames may be the barangay/sport name (usernames are not secrets).
- **Force password change on first login** (`mustChangePassword`).
- **Delete is guarded**: refuses if the account has entered any match result
  (would orphan the `enteredBy` audit trail) and refuses to delete the last
  super admin.
- Real security = JWT + RBAC middleware + bcrypt + **rate-limited login**.
  plus frontend route guards (`RequireRole`) — the API also rejects
  unauthorized calls regardless, so there is no gap even if a guard is missed.
- Token expiry is 8h; an expired token now redirects to login — a 401 handler
  in `api.js` clears the session and redirects (previously showed
  "Authentication required" with no redirect).

---

## Design system (two looks, one product)

**Public Viewer — DARK, "ESPN structure" (decided Aug 2026):**
- Background `#0A1220`; header and footer `#060C16`; panels `#0F141C`;
  `PublicLayout` borders use `slate-500/15` while panel borders use
  `#1C2430`; accent gold `#F5A524`. (Supersedes the earlier "R7 navy" note —
  the real R7 site turned out to be a full-bleed image + translucent cards,
  which we did NOT adopt.)
- Structure follows ESPN / PBA, not a betting site: panels with a header row
  and thin dividers, no card gaps, no gradients, no emoji, no VS badges.
- **Scoreboard strip** is the core pattern: a context line (sport · division ·
  group · venue), then the two teams STACKED with right-aligned scores. The
  LEADING team stays bright, the trailing team dims — that contrast alone shows
  who is winning. No decoration needed.
- **Schedule** follows PBA's fixture list: a date header bar, then per match the
  time + venue on the LEFT and the two teams stacked with crest slots.
- `Crest` component renders a monogram tile, falling back to the barangay's
  uploaded `logo` where one exists (built) — a cached `/api/barangays` lookup
  tells it which barangays have one, so crests don't fire 150 404s per page.
- Sport tabs are underlined text, not chips.
- Minimal animation. Live pages poll every 10s so scores tick over on their own —
  that is the one "live" effect.
- NEVER use Mobile Legends / Moonton art or any copyrighted game assets.
- Public lineups show **surname, first name, jersey, age, stats, and photo**.
  NO birthdate, NO address, NO documents.

**Admin pages — shadcn/ui pass COMPLETE, all three roles (Sep 2026):**
- Barangay Admin (`BrgyDashboard.jsx`, `BrgyMatches.jsx`, `Documents.jsx`),
  the Organizer scoring screen (`OrganizerScoring.jsx`), and all ten Super
  Admin pages (Dashboard, Reference List, Season, Champions, Reports, Site
  Images, Accounts, Review Queue, League Setup, Tournaments) now use real
  shadcn/ui components (`src/components/ui/*`, the "Nova" preset, neutral
  base) instead of the old hand-rolled `components/ui.jsx` set. Started as a
  Barangay-Admin-only exception to "one pass over everything," then extended
  to Organizer and finally Super Admin in the same session — `components/ui.jsx`
  is no longer used by any admin page. All modals (`RosterEditor`, the
  Organizer's end-match confirmation, Season's create-season dialog, Site
  Images' crop dialog, Review Queue's player detail and lightbox) are now
  shadcn `Dialog`s instead of hand-rolled fixed-overlay divs.
- **`Tournaments.jsx` (1,013 lines) was the highest-risk file** — bracket
  rendering with SVG connector-line math (`BracketTree`). Safe to restyle
  because the wires are measured live via `getBoundingClientRect()` on every
  render, not computed from hardcoded pixel assumptions. The one hard
  constraint: shadcn's `Card` doesn't forward refs, so `MatchBox` and the
  bracket stage container stay plain `<div>`s with the ref attached directly;
  everything else in the file converted normally. No changes to bracket
  generation, advancement, revert, or scheduling logic anywhere in this pass.
- Status badges everywhere use soft/transparent color (`bg-{c}-500/15
  text-{c}-600 dark:text-{c}-400`), not solid fill or pastel outline —
  Cards get a colored left-border + icon tied to meaning (blue=info,
  green=success, amber=needs attention, red=urgent). Actual tap targets that
  are ACTIONS rather than status (Organizer's score buttons and Start/End
  match, Approve/Reject in the Review Queue) stay solid/vivid on purpose —
  they need to read at a glance, unlike a status indicator.
  **EXCEPTION: `AdminDashboard.jsx` (Sep 2026)** — the colored-left-border
  pattern was called out as reading like an "AI-generated dashboard" (a
  distinct accent color decorating every static number, rather than color
  marking an actual status) and was removed there: stat tiles are neutral
  (muted icon in a plain gray square, no border accent), and the games
  carousel keeps color ONLY for the real "Live" status — "Final" is plain
  muted text, the sport name is a neutral secondary badge, not blue. The
  other nine Super Admin pages plus Barangay Admin/Organizer still use the
  colored-accent pattern above; whether to extend the neutral treatment
  everywhere is an open question, not yet decided either way.
- **Dark mode, opt-in, all three roles.** `AdminLayout` takes an
  `enableDarkMode` prop; every page that uses `AdminLayout` now passes it
  (Public Viewer doesn't use `AdminLayout` at all — it's a separate, always-
  dark design, unaffected by this toggle). A header toggle flips
  `document.documentElement`'s `dark` class (not a scoped wrapper div — Radix
  `Dialog`/`Select` portal to `document.body`, outside any local wrapper, so
  a div-scoped approach would leave modals/dropdowns stuck in light mode),
  added on mount and always removed on unmount. Preference persists in
  `localStorage` under `brgy-theme` (name predates the Super Admin rollout;
  shared across all three roles now). Defaults to light everywhere.
- This REQUIRED upgrading the whole project from Tailwind v3 to v4 (shadcn's
  current CLI only targets v4) — `tailwind.config.js` is gone; theme tokens
  now live in `src/index.css` as CSS variables. This is global, so it also
  affects Public even though its JSX wasn't touched; Public still renders off
  explicit utility classes (not shadcn tokens), and a build was verified
  clean after the upgrade.
- shadcn's default font (Geist) was deliberately NOT applied globally — kept
  Inter, since `index.css` is shared by every page including Public, whose
  look is decided and out of scope. `--primary`/`--ring` were set to a
  richer indigo-violet (`oklch(0.53 0.26 285)`, deeper/more saturated than
  plain indigo-600) so the converted pages read as a polish pass, not a
  re-brand.
- `components/ui.jsx` (Button/Card/Input/Label/Pill) is now DEAD — nothing
  imports it. Safe to delete once someone confirms nothing else references it.
- A `.scrollbar-thin` utility class (in `index.css`, themed off `--border`/
  `--muted-foreground`) replaces the bare OS scrollbar on every scrollable
  panel across the admin pages (the bracket tree, long tables, modal bodies).
  Apply it to any new `overflow-x-auto`/`overflow-y-auto` container instead
  of leaving the default scrollbar.
- **Native date/time inputs replaced with shadcn Calendar** (Sep 2026):
  `components/DateTimePicker.jsx` exports `DatePicker` and `DateTimePicker`
  (Popover + Calendar for the date, a themed time input alongside) — used in
  `Tournaments.jsx`'s schedule section and `BrgyDashboard.jsx`'s birthdate
  fields. Both read/write the same `"YYYY-MM-DD"` / `"YYYY-MM-DDTHH:mm"`
  strings the native inputs did, so `config/time.js`'s `parseManila()`
  needed no changes. Built from theme tokens, so it's dark-mode-aware for
  free under `enableDarkMode`.
- **Dashboard analytics** (Sep 2026): `GET /api/stats/dashboard` also
  returns `sports`, `accounts: { barangayAdmins, organizers }`, and
  `todayMatches` (today's matches in Manila time, each carrying both teams'
  summed roster size as `players`, PLUS any past-dated match still
  `scheduled`/`ongoing` — a league running behind schedule doesn't drop those
  from "today's business" until they're resolved). The Super Admin Dashboard
  shows these as a stat column (Sports / Barangay admins / Organizers) beside
  a `Carousel` of today's games.
- **Super Admin sidebar is grouped, not flat** (Sep 2026): `superAdminMenu`
  in `menus.js` is `[{header, items}, ...]` — Overview, Season &
  Verification, Competition, Content, Administration. Headers are plain
  static labels, NOT collapse toggles — `organizerMenu`/`brgyMenu` stay flat
  arrays; `AdminLayout` renders whichever shape it's given
  (`menu[0].header !== undefined` ⇒ grouped).
- **Whole-sidebar collapse** (Sep 2026): `AdminLayout` has a `rail` boolean,
  toggled by an icon-only button (no visible "Collapse" label, just a
  `title` tooltip) inline in the header row beside "Kolambugan Sports" —
  desktop-only (`hidden lg:flex`; on mobile the sidebar is an overlay opened
  from the main header instead, a separate concept). Collapses the ENTIRE
  sidebar to an icon-only `lg:w-16` rail — logo, labels, headers, and group
  dividers hide/simplify, items keep a `title` tooltip; collapsed, the
  toggle button is the only thing left in that row and doubles as the way
  back to expanded. The Tournaments item's per-sport flyout has no room in a
  4rem rail, so collapsed it's a direct link to Tournaments (lands on the
  first sport) instead of expanding inline. The mobile header's own
  open-sidebar button uses the same `PanelLeftOpen` icon (not a `☰` hamburger
  character) for one consistent icon language.
- **Full-screen loading on login/logout** (Sep 2026): `components/
  LoadingScreen.jsx` (K mark + spinner + message, theme-token based — dark
  automatically when shown from inside `AdminLayout` with dark mode on).
  Login's `loading` state now stays `true` through a successful attempt
  (only resets on error) so the whole form is replaced by the loading
  screen, not just the submit button disabled. Logout (`AdminLayout`, shared
  by all three roles) has no real async work — a bare instant swap read as
  nothing happened — so it shows the loading screen for a deliberate 450ms
  before the actual `localStorage` clear + navigate. That delay is
  intentional pacing, not a real load; don't "optimize" it away.

**Organizer scoring screen — shadcn/ui, light by default, dark optional (Sep 2026):**
- CORRECTION: this was long documented as permanently "dark navy... the one
  screen where dark is for legibility at arm's length," but the screen was
  never actually built that way — it shipped light-themed (`bg-white`,
  `slate-*`) with no dark mode at all. Resolved by building the dark mode
  the doc always assumed existed (see the Admin pages entry above), rather
  than forcing the screen dark. Big touch targets and tablet/phone-first
  layout are unchanged either way.

Everything mobile-first and responsive. Public users are on phones.

---

## Feature priorities (MoSCoW)

**Must:** auto pre-screen verification + Super Admin review queue ✅; roster
submission w/ conditional document upload ✅; bracket generation ✅; real-time
live scoring ⬜; public dashboard ⬜; account provisioning panel ✅; in-app
first-login instruction modal ⬜ (promised in the thesis — REQUIRED).

**Should:** RBAC across all roles ✅ (API) / ⬜ (frontend guards); permanent
champions archive ⬜; password reset from Super Admin panel ✅; reschedule with
audit trail ⬜.

**Could:** PDF exports, municipal branding, announcement banners.

**Won't (do not build):** player self-registration, payments, native mobile apps.

## The 7 sports
Basketball, Volleyball, Badminton, Mobile Legends, Billiards, Chess, Pickleball.

## Conventions
- Never commit secrets (.env, gitignored). Never seed real resident names
  into the repo. A `dev-setup.ps1` holding a password must be gitignored.
- Residency documents live in GridFS, served only through authenticated,
  role-checked routes. Player photos are public by decision (Aug 2026).
- Log deviations from the thesis document in CHANGES.md as you build —
  the document gets trued-up in early September.

---
---

# PART II — PROJECT HISTORY, RATIONALE & STATUS
(The spec above says WHAT to build. This part records WHY, what's done,
and what's pending. Team: Jerico Asupre (Programmer), John Mark D. Ababan
(System Analyst), Hanan A. Angnie (Designer), Nasipa M. Balang
(Documentation). BSCS, Lanao School of Science and Technology Inc.
Timeline: started Jan 2026; proposal defense Mar 2026; revisions Apr–Jul;
development Jul–Aug; testing Aug–Sep; ONLINE evaluation Sep (~33
respondents); deployment Sep–Oct; FINAL DEFENSE OCTOBER 2026.)

## 1. Thesis document work (COMPLETED)

- Rebuilt Chapter 3 to match the professor's PPT guide:
  - Added missing top-level **3.1 Requirements Analysis** (gathering,
    identifying, MoSCoW prioritization, documentation, review/validation).
  - Filled Planning gaps: **Scheduling (Gantt), Resource Allocation,
    Communication Plan**.
  - Filled Evaluation gaps: **Research Instrument, Data Collection,
    Validity & Reliability** (expert validation + Cronbach's alpha >= .70
    via pilot test).
  - Fixed stale two-role wording to the four-role model; Design section now
    names all diagrams and states draw.io as the tool.
- **Data Collection rewritten for ONLINE evaluation**: system deployed
  first; per-role accounts; credentials + Google Forms link distributed
  via SK Federation channels; in-app instruction modal orients users
  (modal is now PROMISED in the thesis => required build); anonymous
  responses; monitor response rate, remind via Federation.
- Course name swept to **BSCS / Computer Science** everywhere (the only
  "Information Technology" strings left are journal titles in references
  — correct, do not change).
- Gantt chart finalized (Jan–Oct 2026). Testing overlaps Dev; Evaluation
  AFTER Testing; Ch. 4–5 AFTER Evaluation; Final Defense Oct.
  Files: gantt_final.png / gantt_fixed.xlsx / gantt_final.pdf.
  User must paste PNG over the placeholder in Scheduling section.

## 2. Diagrams

- Delivered as PNG+PDF: **Use-Case** (4 actors), **ERD** (crow's foot),
  **DFD Level 0 (Context)**, **DFD Level 1** (5 processes, 6 stores).
- **HIPO charts: ALL THREE DONE** (Super Admin, Barangay Admin, Organizer) —
  the missing Organizer chart has been drawn.
- HIPO items that do NOT match the built system (fix the charts or the code):
  - Barangay Admin "Team Registration" has no **Select Division** step, but
    division choice is now required (basketball u17/u30, badminton boys/girls…).
  - Barangay Admin "Attach Official Roster File" — no such feature exists.
  - Super Admin "Upload Voters Masterlist" — currently the SK Federation's own
    reference list (voters' list still pending via LYDO).
  - Super Admin "Select Format (Double Elim / Round Robin)" — now automatic,
    derived from the sport, not a choice.
- Old pre-Organizer diagrams (flowchart, ERD, DFDs) still need updating to 4 roles.

## 3. Stakeholder engagement (IN PROGRESS)

- **MEETING DONE (July 20, 2026)** with SK Federation President
  **Hon. Jay Ann Reserva**. She validated the system, will sign the permission
  letter, and will endorse the Sept online evaluation in the group chat.
  Key answers:
  - Verification is DOCUMENT-based (Valid ID / Voter's Certification /
    Birth Cert per player); under-15/new also need parental consent.
  - Cross-barangay play allowed ONLY for a whitelist of small/remote
    barangays. Dayo = outside Kolambugan.
  - Voters' list only via **LYDO**. Need to present the system to LYDO.
  - Physical sports = DOUBLE ELIMINATION (win 3 → Big 8; lose 2 → out),
    **split into groups**. ML = grouped round robin. Ties → playoff match.
  - Roster 10–15 players (team sports). Multi-sport players allowed.
    Registration deadline exists. Collect name/age/birthdate/photo/address.
  - Record fouls, player points, MVP. Unavailable team = forfeit.
  - Super Admin = SK Fed + Head of LYDO.
- Documents prepared: Permission-Letter-FINAL.docx, Interview-Guide.docx,
  TAM-Evaluation-Questionnaire.docx (17 Likert items; needs adviser content
  validation, then becomes a Google Form).
- **NEXT ACTION: separate permission letter for LYDO** to present the system
  and request the voters' list.

## 4. Prototype (COMPLETED, for demo)

- 4-page offline HTML prototype in "PROTOTYPE PROPOSAL" folder with REAL logic
  (CSV parsing, cross-check, localStorage state shared across pages).
- KNOWN STALE RULE: prototype flags by barangay mismatch; real rule is
  municipality-level. Demo disclaimer prepared.
- Never let Claude Code touch the prototype folder.

## 5. Core domain decisions and WHY (the important part)

- **Dayo rule is MUNICIPALITY-level.** Only players from OUTSIDE Kolambugan
  are ineligible. (Corrected mid-project — barangay-level was wrong.)
- **Reference list = SK Federation's own list**, uploaded by Super Admin,
  REPLACES prior list. Voters' list expected via LYDO but not in hand.
- **Verification = automated pre-screen + human verdict.** Defense line:
  "the system automates verification; the Federation's review is governance."
  Documents are the EXCEPTION — only for players not on the list.
  Approvals persist in **verified_residents** (separate collection; NEVER
  write into the reference list, which gets replaced and would erase them).
- **Storing the list in MongoDB is MORE secure** than the current
  Messenger/USB practice (auth-gated, HTTPS, Atlas encryption, audit).
- **Player photos are PUBLIC** (Aug 2026 decision, changed from the original
  "surname + age + jersey + stats only" rule). Rationale: public viewers want
  to see who plays for their barangay, and photos double as identity
  verification for the Federation. Mitigation: a headshot standard (close-up
  face only), and address/birthdate/documents remain private. **This reverses
  a privacy decision originally made with minors in mind — worth confirming
  with Hon. Reserva, and it must be trued up in the thesis document.**
- **Documents stay PRIVATE** — super-admin-only route, separate GridFS bucket.
  A plain `<img src>` cannot fetch them (no auth header), so the Review Queue
  fetches with the token and renders a blob URL.
- **Accounts are provisioned, never self-registered.** Random per-account
  passwords, forced change on first login, shown once, Super Admin reset.
- **Organizer count is dynamic**: one per sport (7). An earlier seed created
  two ML organizers; corrected to one — `assignedSport` is a single sport, and
  provisioning enforces one organizer per sport.
- **Season lifecycle**: ONE season covers all 7 sports.
  setup → registration_open → verification → ongoing → completed.
  Only Super Admin advances state; gates enforced in BACKEND middleware.
- **Physical-sport structure took several passes to pin down.** The spec once
  said "no group stage, one straight double-elim bracket" while the meeting
  notes said "split into groups, win 3 → Big 8." The meeting notes were right.
  Final: 4 groups → double-elim per group → 2 qualifiers each → Top 8.
- **Top 8 uses standard seeding, not a random draw**, so two teams from the
  same group cannot rematch in round 1 and the four group winners don't
  eliminate each other early. Defense line: "group winners are seeded against
  other groups' runners-up."
- **Scope discipline**: MoSCoW governs additions. Stakeholder-requested =>
  add + update doc. "Cool idea while coding" => Future Enhancements (Ch.5).

## 6. Ways of working (agreed)

- **Backend first**, verify in PowerShell, then frontend against the real API.
- Prove risky algorithms in a sandbox simulation BEFORE writing DB code —
  this is how the double-elim generator was validated (5000+ random trials)
  before a single Mongoose call.
- User writes code WITH this chat (wants to understand every line for the
  defense); **Claude Code = bug fixer / frontend scaffolder**, briefed via
  CLAUDE.md (it has NO access to the chat). One page or module at a time;
  review every diff; commit before and after; never let it touch the
  tournament engine or the prototype folder.
- Keep **CHANGES.md** current; true up the thesis in EARLY SEPTEMBER.
- Update CLAUDE.md whenever a decision changes.

## 7. PENDING / NEXT (project level)

1. **LYDO meeting** — present the system, request the voters' list.
2. **HIPO/diagram fixes** listed in section 2; update old diagrams to 4 roles.
3. Adviser validation of TAM questionnaire; build the Google Form.
4. Paste Gantt PNG into the document placeholder; figure numbering.
5. **Confirm the public-photo decision** with Hon. Reserva (minors).
6. September critical path: deploy early Sep (Render/Vercel + Atlas),
   distribute credentials, instruction modal, chase 33/35 responses.

## Open questions (remaining)
- Exact registration-deadline handling (substitutions after the deadline?).
- Whether LYDO grants the COMELEC voters' list, and in what format.
- Whether the SK is comfortable with public player photos (minors).

---
---

# PART III — CURRENT BUILD STATUS (as of Aug 2026)

Repo: one git repo, two folders. `backend/` (Express + MongoDB Atlas;
**server.js at the ROOT, not src/**; port 5000 via `npm run dev`) and
`frontend/` (Vite + React + Tailwind; port 5173; proxy /api → localhost:5000).

## DONE + TESTED

**Auth & accounts**
- JWT login, role routing, forced first-login password change.
- Full Accounts module: provisioning panel, provision-all, add-single account,
  reset password (shown once), guarded delete. Tested end-to-end.

**Season & registration**
- Season lifecycle model + states, create/advance routes, state guards.
- Team creation with **division + format**, one team per
  (barangay, sport, season, division); ML allows 2.
- Roster limits by format: team 10–15, doubles 2, singles 1.
- Add/remove players, submit roster (locks + triggers pre-screen).

**Verification**
- Reference-list CSV upload, auto pre-screen (eligible / needs_document /
  flagged with flagReason), Review Queue (approve / reject / verify).
- Reject removes the player and reopens the roster; verify locks the team.
- **GridFS file storage** (`config/gridfs.js`), two buckets:
  - Player photos: upload (barangay admin, own team), public serve, delete.
  - Residency documents: upload with docType, **super-admin-only** serve.
- Barangay Admin **Document Submission** page (lists players needing docs,
  doc-type picker, upload, shows verify status).
- Review Queue shows the player's **photo + uploaded document inline**
  (blob fetch with token) so the Federation can judge with evidence.

**Tournaments**
- ML: group stage, knockout-size picker, scaling single-elim + 3rd place,
  score-driven advancement, per-group single-elim tiebreaker. Tested to 52 teams.
- Physical sports: `/generate` splits a division's verified teams into 4 groups
  and builds a double-elim per group; `/de-qualification` returns the 8
  qualifiers tagged by group+seed; `/de-bracket` builds the standard-seeded
  Top 8 + 3rd place. **Full pipeline verified end to end** (24 teams →
  4 groups → played out → 8 qualifiers → knockout → champion + 3rd place).
- Distinct bracket labels for group vs knockout (see Tournament format).
- Per-sport division/format config seeded (`seedSportConfig.js`).

**Organizer live scoring (routes/organizer.js + pages/organizer/OrganizerScoring.jsx)**
- Match feed scoped to the organizer's `assignedSport` (shows not-yet-ready
  matches greyed out), Today section, start with period count, per-player
  scoring (basketball 1/2/3, badminton/pickleball +1) or side scoring
  (volleyball), fouls with undo, per-team undo, per-period banking, MVP
  (defaults to top scorer), end match → bracket advancement, cancel/reset.
- Writes PlayerMatchStats (points + fouls) — the model that had sat unused.
- Tested: basketball (player mode), volleyball (side mode), badminton,
  pickleball. Advancement verified — winner up, loser into the losers bracket.

**Scheduling**
- `PATCH /api/tournaments/matches/:matchId/schedule` (date + venue),
  `POST /api/tournaments/:id/schedule-bulk` (by round / group / bracket).
- Super Admin: collapsible Schedule section in the Tournaments page showing
  "(N/M dated)", per-round bulk apply, per-match date field.

**Public API (routes/public.js — unauthenticated, read-only)**
- `/overview` (season, live, today, recent, counts — one call for the landing
  page), `/matches?sport=&status=`, `/tournaments`, `/teams?sport=`,
  `/teams/:id` (public lineup + season stats), `/leaders?sport=&limit=`.
- Player shapes deliberately omit birthdate, address, documents; they return
  `age` and `hasPhoto`.

**Frontend**
- Super Admin: Dashboard, Season, Reference List, Review Queue, Tournaments
  (sport picker, standings, match entry, knockout generation, aligned bracket
  display with connector lines, Schedule section), Accounts.
- Barangay Admin: Team Registration (sport → division → name), roster editor
  (modal) with photo upload, Document Submission page.
- Organizer: match list + live scoring screen.
- Public Viewer — COMPLETE, eight pages: Home, Matches, Standings, Brackets,
  Teams, Team detail, Players, Champions, About. `pages/public/PublicLayout.jsx`
  (header, nav, 3-column footer, `<Outlet/>`); shared primitives live in
  `components/PublicUI.jsx` (Crest, PlayerAvatar, Panel, SportTabs,
  SearchInput, SiteImage, DIVISION_LABEL) — `components/ui.jsx` is the LIGHT
  admin set and is not usable on the dark public pages. Polling varies by
  page: 10s on Matches and Home, 15s on Brackets and Standings, 20s on the
  barangay match page.
- Route guards: `RequireRole` + a 401 handler in `api.js` that clears the
  session and redirects to login.
- Shared `AdminLayout` (generic, takes a `menu` prop), `ui.jsx` components,
  and `components/menus.js` (`superAdminMenu`, `organizerMenu`, `brgyMenu` —
  previously copy-pasted into every page).

## IN PROGRESS / NEXT (priority order)

1. **Instruction modal** — first-login orientation. REQUIRED: promised in
   Chapter 3's data collection procedure and the September evaluation depends
   on it.
2. Barangay Admin dashboard (last remaining HIPO module — Match Information
   and Document Submission/verification status are built).
3. `verified_residents` collection (approvals persisting across seasons).
4. Bulk player import.
5. Tournament delete from the UI.
6. Super admin password recovery when both super admins are locked out.
7. Delete the now-dead `components/ui.jsx` (Button/Card/Input/Label/Pill) once
   confirmed nothing still imports it — the shadcn/ui pass replaced it
   everywhere. Light animation over the shadcn pages is still an open nice-to-have.
8. Full end-to-end test on a CLEAN database (create season → register →
   verify → generate → score → check the public viewer), then deploy
   (Render + Vercel + Atlas) and delete all dev-only code.

## KNOWN COSMETIC BUGS (low priority)
- None outstanding. The R100/R101/R102 tiebreaker labels are fixed (now
  "Playoff" / "Playoff decider"), and the expired-token redirect is fixed
  (see Accounts & authentication). Group standings after a tiebreaker
  deliberately include playoff wins in the DISPLAYED table while excluding
  them from tie detection — intentional, not a bug (see CHANGES.md).

## DEV-ONLY SCRIPTS + ROUTES — DELETE BEFORE DEPLOYMENT
In `backend/src/config/` (these write DIRECTLY to the DB, bypassing app rules):
seedTestTeams.js, seedReviewTest.js, showOrReset.js, clearTournaments.js,
seedTiebreakerTest.js, seedTie5Test.js, seed52WithTies.js,
seedVerifiedTeams.js, seedPlayersForTeams.js, **seedSportConfig.js** (the
config UI now exists — this can go), and `wipe.js`, `makeReferenceCsv.js`,
`seedSportTeams.js`, `deleteSeason.js` if/where created. **KEEP `seed.js`** —
a fresh install needs the 26 barangays and 7 sports from somewhere.
Routes/UI: `POST /api/tournaments/:id/simulate-groups`, the temp
`POST /api/tournaments/:id/test-de`, and the amber "Auto-score all group
matches" button in Tournaments.jsx.
Also gitignore any `dev-setup.ps1` (it holds a password).

## GOTCHAS (bit us repeatedly)
- **Adding or changing a field/enum on a Mongoose model needs a FULL server
  restart** (Ctrl+C + `npm run dev`), not just nodemon reload — otherwise
  strict mode SILENTLY DROPS the value on save. Hit us on isDivided,
  knockoutSize, and the bracket enum.
- `backend/src/routes/tournament.js` has accumulated duplicate lines /
  declarations during long editing sessions. Check for duplicates before
  editing it. (`shuffle` is currently defined twice — module scope and inside
  `/:id/bracket`; harmless shadowing, safe to clean up.)
- **Express route order**: put literal paths (`/needs-documents`,
  `/documents/:docId/file`) BEFORE `/:id/...` routes, or the param route
  swallows them.
- **Two-terminal rule**: server in ONE terminal (untouched); run seeds /
  PowerShell API tests in a SEPARATE terminal. "Cannot find module" = wrong
  folder. "Unable to connect" = server not running (or `$base` is empty
  because the terminal reset — re-run the login block).
- PowerShell 5.1 has **no `-Form` parameter**, so multipart uploads can't be
  tested from it. Test file uploads through the browser UI instead.
- PowerShell arrays: JSON `[...]` pasted from a script won't parse; use
  `@(...)` or pipe through `ConvertFrom-Json`, and wrap with `@()` before
  `ConvertTo-Json` so a single-element array doesn't collapse.
- **GridFS ignores `openUploadStream({ contentType })`** in this driver version —
  the type must ALSO go in `metadata`, and `sendFile` reads it back with a
  fallback. Without it, files DOWNLOAD instead of displaying. Files uploaded
  before this fix are permanently typeless; re-upload them.
- **Mongoose `findOneAndUpdate({ new: true })` is deprecated** — use
  `returnDocument: 'after'`.
- **Don't read `games[0]` as the final score.** It is only period 1. The final
  score is `liveScoreA`/`liveScoreB` (they survive completion). Admin-entered
  results still write into `games[0]`, so displays need to handle both.
- **Two `path="*"` routes** in App.jsx = the second is dead code. One catch-all,
  pointing at `/`.
- Frontend paths must match `App.jsx` exactly — a redirect to `/barangay`
  when the route is `/brgy` silently bounces to the login page via the
  catch-all route.