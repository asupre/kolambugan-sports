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

- Roster size depends on the sport's **entry format**, and for `team` also on the
  sport's **category** (see Divisions below):
  - `team`, physical (`category: 'physical'`) → **10–15 players** (basketball,
    volleyball)
  - `team`, esports (`category: 'esports'`) → **exactly 6** (Mobile Legends: 5
    starters + 1 substitute). A barangay's two ML entries (e.g. Mukas 1, Mukas
    2) therefore cap at 12 players combined — enforced per-team, not as a
    separate barangay-total headcount check. **The same athlete can't be
    rostered on BOTH teams, though** (fixed Sep 2026 — was a real bug, nothing
    stopped it before): `siblingTeamRosterIndex()` in `routes/team.js` blocks
    add/import/correct whenever the name (case/whitespace-tolerant) +
    birthdate matches a player already on another of the barangay's teams in
    the SAME sport this season. Scoped to same-barangay-same-sport only —
    one athlete playing multiple DIFFERENT sports is the confirmed,
    intentional many-to-many design below and is untouched.
  - `doubles` → **exactly 2** (pickleball always; badminton when the season runs doubles)
  - `singles` → **exactly 1** (billiards, chess; badminton when the season runs singles)
  Enforced on add-player and on submit (`ROSTER_LIMITS` / `getRosterLimits()` in
  routes/team.js).
- **Bulk CSV import** (Sep 2026): `POST /api/teams/:id/players/import` lets a
  Barangay Admin upload a CSV instead of adding players one at a time — a
  coach's spreadsheet or a prior season's export. Tolerant column mapping
  (`canonicalPlayerKey` in routes/team.js) — first/last/middle name, birthdate,
  jersey number, various header spellings (an address column is IGNORED — every
  imported player gets the barangay name, see the address rule below). Same rules as a single
  add: draft-only, capped at the roster's max; rows over the cap or missing a
  required field are skipped and reported back (row number + reason), not
  silently dropped. UI: an "Import CSV" button beside "Add a player" in the
  roster editor (`RosterEditor` in `BrgyDashboard.jsx`).
- New players / under 15: require **parental consent + supporting documents**.
- Player fields collected: full name, birthdate (age derived), **photo**, address,
  jersey number. On the manual "Add a player" form (`POST /api/teams/:id/players`),
  **every field is required EXCEPT jersey number** — first/middle/last name,
  birthdate, address (Sep 2026; middle name/address used to be optional, and
  jersey number was briefly required, then made optional again the same month).
  Enforced both in the form (Add button stays disabled until the required ones
  are filled) and in the route (400 if any is missing; a jersey number, if
  given, must be numeric). The
  bulk CSV import (`/players/import`) deliberately still tolerates a missing
  middle name/jersey number — CSV data is often incomplete. The
  "Correct this player" edit route tolerates a missing middle name/jersey
  number, but the address rules below apply to it too.
- **Player address = the team's own barangay name, and nothing else**
  (Super Admin decision, Sep 2026 — the player plays for that barangay, so it
  stands in as their address). `checkAddress()` in `routes/team.js` enforces
  it on add and on "Correct this player" (400 unless the address equals the
  team's barangay name, case/whitespace-tolerant, optional "Brgy."/"Barangay"
  prefix; the STORED value is always the canonical name). The forms prefill it
  (`barangayName` comes from `GET /api/teams/mine`) and flag anything else.
  **CSV import ignores the file's address column** and stamps every imported
  player with the barangay name. Players saved earlier with a free-text
  address are left as-is until they're next edited. This REVERSES an earlier
  free-text rule (below); it does not change screening — address still plays
  no part in it. The old note, kept for the reasoning: addresses were free text — NOT required to mention the team's own
  barangay (tried and reverted, Sep 2026 — see CHANGES.md). A whitelisted
  small/remote barangay's TEAM (Small Banisilon, Matampay, Bubong,
  Pantaon, Inudaran, San Roque, Palao, Sto. Niño, Sucodan, Lumbac) legitimately
  fields players from OTHER barangays, whose real address is their own
  home barangay — enforcing "address must contain the registering team's
  barangay" would have made that address wrong by definition for exactly the
  players the cross-barangay exception exists for. **Address plays NO part in
  the residency cross-reference either way** (see `services/prescreen.js` —
  that only ever compares the reference list's own recorded barangay against
  the team's barangay); it's just stored, private, descriptive data.
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
- **Cross-barangay recruiting is allowed ONLY for TEAMS of designated
  small/remote barangays** (a whitelist, because those barangays are too
  small to field their own teams). **Direction matters — corrected Sep
  2026:** the `allowsCrossBarangay` checkbox is read from the TEAM's
  barangay, NOT the player's home barangay (the code used to check the
  player's home barangay — exactly backwards). A CHECKED barangay's team may
  field a resident of ANY barangay, checked or unchecked; an UNCHECKED
  barangay's team may field ONLY its own residents (anything else is
  `flagged`: "Listed under X, not Y — Y doesn't allow cross-barangay
  players"). Confirmed list (as validated by the stakeholder —
  `allowsCrossBarangay` is now editable per barangay from League Setup, so
  the live database may have since diverged from this list):
  Small Banisilon, Matampay, Bubong, Pantaon, Inudaran, San Roque,
  Palao, Sto. Niño, Sucodan, Lumbac.
  Teams from the larger barangays field their OWN barangay's residents.
  (`allowsCrossBarangay` boolean on the barangays collection, editable via
  League Setup at `/admin/config`.) **Toggling it re-screens the whole
  season immediately** (`rescreenSeason()` in `services/prescreen.js`,
  Sep 2026) — flipping this flag can change the eligibility of every
  non-native player on that barangay's teams, in either direction, without
  any player's own name/birthdate changing, so nothing else would ever
  trigger a re-check for them. Wired into
  both `PATCH /api/barangays/:id/cross` and the general
  `PATCH /api/barangays/:id`. Same safeguard as a player correction: if
  this reopens a non-eligible player on an already-verified team, that
  team flips back to `pending`. **After deploying the Sep 2026 direction
  fix, statuses saved under the old logic are stale until a re-screen runs**
  (toggle any barangay's checkbox off/on, or call `rescreenSeason`).
  Kolambugan residency with a Valid ID, Voter's Certification, or Birth
  Certificate. New players / those under 15 also need PARENTAL CONSENT
  plus supporting documents.
- **Uploading a NEW reference list also re-screens the whole season
  immediately** (fixed Sep 2026 — was a real bug: `POST
  /api/reference-list` used to just `deleteMany`+`insertMany` and stop,
  leaving every already-screened `Player` stale against the OLD list
  until something else happened to touch them). Replacing the list is at
  least as consequential as the `allowsCrossBarangay` toggle above — it
  can move any player's eligibility either direction without the player
  changing at all — so it calls the same `rescreenSeason()`. The upload
  response reports how many players changed and how many verified teams
  reopened, same shape as the cross-barangay toggle.
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
  2. **An adult (15+) NOT found on the list is `flagged` as a possible Dayo**
     (Super Admin decision, Sep 2026 — was `needs_document`), with a
     `flagReason` saying so. **A flagged player can never be approved** (see
     step 3): the way through is the Barangay Admin correcting a misspelled
     name (auto re-screen) or the reference list being updated — otherwise the
     Super Admin rejects them. A document doesn't change that (the upload is
     still offered on the **Document Submission** page but can't lead to an
     approval for a flagged player). **Under-15s are unchanged**: they can never be on the list, so they stay
     `needs_document` and need documents + parental consent. Documents are the
     EXCEPTION, not required for everyone.
  3. **Super Admin reviews in the Review Queue** — sees the player's photo and
     the uploaded document inline (zoomable — wheel/pinch/+/- to zoom, drag to
     pan once zoomed, Sep 2026) — and gives the official verdict (approve /
     reject). Reject removes the player and REOPENS the roster. **Approve is
     blocked for a `needs_document` player with no document uploaded** (Sep
     2026, both the route and the button) — that status means there's no
     reference-list match at all, so a submitted document is the only
     possible evidence. **A `flagged` player CANNOT be approved — of either
     kind** (Sep 2026, route 409 + button disabled): a cross-barangay violation
     (the team's barangay doesn't allow cross-barangay players — reject, or
     allow cross-barangay for that barangay in League Setup, which re-screens
     the season and clears the flag) or "not on the list / possible Dayo"
     (correct a misspelled name, or reject). The kind is the `code` on
     `decideFromCandidates`' result, decided live via `decidePlayer()` and
     returned as `flagBlock` — never parsed from the reason text. A stale
     `flagged` whose live decision is no longer flagged isn't blocked.
     Approving also **clears `flagReason`** (fixed Sep 2026 — it used to be
     left stale, so an approved player could still show the old "needs
     document"/flag warning in the UI).
  4. Verify locks the team (`status: 'verified'`); only verified teams enter
     tournaments. **Once verified, a Barangay Admin can NOT edit its players'
     details** (Sep 2026 — `PATCH .../players/:playerId` 409s; photos stay
     editable). The way back is the Super Admin's **"Reopen for corrections"**
     in the Review Queue (`POST /api/review/teams/:teamId/reopen` → `pending`,
     only during the `verification` season state, blocked once the team is in any match): the team becomes editable again
     and is re-verified afterwards. The Super Admin has no per-player edit UI.
     **A later correction can un-verify it** (fixed Sep 2026 — this now only
     applies to a Super Admin API correction, since the Barangay Admin is
     locked out once verified):
     the "correct this player" PATCH re-screens on a name/middle
     name/birthdate change (`identityChanged` in `routes/team.js` — a
     middle-name-only edit was missing from this check until Sep 2026 and
     silently kept the player's stale status; fixed once middle initial
     became a required match field, not just a tie-break), and if that
     comes back non-eligible on an already-verified team,
     `team.status` flips back to `pending` so it reappears in the Review
     Queue — `submittedAt` is untouched, so the roster stays locked either
     way. Before this fix, a verified team could sit with a flagged player
     invisible to the Review Queue (which only lists `status: 'pending'`)
     while `/api/stats/dashboard`'s count (raw, off `Player`, no team-status
     filter) correctly disagreed with it — the tell that surfaced the bug.
  5. (PENDING) Approved players written to **verified_residents**, which
     persists across seasons and is checked alongside the reference list.
     NEVER write approvals into the reference list itself.
- **Matching mechanics** (`services/prescreen.js`): a player matches a
  reference row on exact `lastName`+`firstName` (case/whitespace-tolerant —
  "Dela  Cruz" and "dela cruz" are the same — verified against real rows:
  lower/UPPER case, extra spaces, and an initial-only middle name all still
  match; accents and punctuation are NOT normalized, so "Niño" vs "Nino" or
  "Ma. Luisa" vs "Ma Luisa" count as different names), **AND, since Sep 2026, middle
  initial + birthdate must ALSO both agree** — no longer just a tie-break
  used when more than one row shared the name. `sameMiddleInitial()`
  compares only the first letter (case-insensitive), so a reference row's
  full "Miguel" still matches a roster's abbreviated "M." A row (on either
  side) missing its middle name or birthdate can never confirm a match —
  excluded, not assumed, same as a spelling difference is treated as NOT
  FOUND (→ `flagged` for an adult, `needs_document` for a minor), never fuzzy-matched — deliberate, so two
  different people with similar names can't cross-match. Multiple
  candidates sharing a name but disagreeing on barangay is possible; only
  `candidates[0]`'s barangay is used for the eligible/flagged decision once
  narrowed. **`ReferenceList` now has a `middleName` field** (not
  `required: true` — the source list may not always carry one), and the
  CSV upload's `canonicalKey()` recognizes a middle name/initial column.
  **Consequence hit immediately on the real dev data**: the existing
  17k-row reference list has birthdates on every row but a middle name on
  NONE of them (uploaded before this existed) — until the Super Admin
  re-uploads a CSV that actually includes middle names, literally nothing
  on the list can confirm a match, and any re-screen flips previously
  `eligible` players to `flagged` (possible Dayo) across the board. This is
  the intended, correct effect of the stricter rule, not a bug — but it
  means the feature isn't USEFUL yet without a re-upload.
- **Reference List page — numbering, paging, virtualization, exact-name link**
  (Sep 2026, `ReferenceList.jsx`): a `#` column shows each resident's number in
  the FULL list (as the server sorts it), unchanged by search or paging. A "Rows
  per page" selector (25/50/100/200/500/1000/All, default 50) plus Prev/Next
  replaced the old hard 200-row cap. The table is **virtualized**
  (`@tanstack/react-virtual`, a frontend dependency): only rows near the scroll
  viewport are in the DOM, with two spacer rows for the rest, so "All" on the
  ~17k list doesn't lag. The Review Queue's "View in Reference List" link now
  passes `?last=&first=` and the page shows ONLY rows with that exact name
  (same case/whitespace-tolerant comparison as screening) with a "Show all
  residents" button — it used to prefill the loose word search, which drops
  all-number words and substring-matches, so a player NOT on the list landed on
  other people sharing a last name. Typing in the search box leaves that mode.
  The link also scrolls the PAGE to the results, then the table to the match
  (through the virtualizer's `scrollToIndex`).
- **Reference List page — informational highlight for under-15 same-name
  rows** (Sep 2026): `decideFromCandidates` deliberately never matches a
  player under 15 to a reference row (the list starts at 15), so a minor's
  official status is always `needs_document` regardless of a same-name row.
  `GET /api/reference-list` now ALSO surfaces a same-name hit for a minor as
  a separate, clearly-labeled **purple "informational only"** row highlight
  (not green/red, and never counted as a real match) — helps the Super
  Admin judge a submitted document against whether the family shows up in
  the barangay's own records at all. Once that player is approved, the same
  row is promoted into the real match set (`status: 'approved_minor'`,
  labeled "Approved · document review", normal green) — the highlight
  changes to reflect that the case is resolved, instead of staying purple
  forever.
- **Performance (fixed Sep 2026):** roster-submit screening
  (`prescreenTeam`) fetches the season's whole reference list ONCE and
  reuses it across every player on the roster — correct tradeoff at
  10-15 players. Single-player screening (`prescreenPlayer`, used by
  add-player and "Correct this player") used to do the SAME whole-list
  fetch just to check one player — measured at 600-900ms+ against a
  17k-row list, and the direct cause of "Saving…" appearing stuck. Now
  queries the reference list directly by name via the
  `season+lastName+firstName` index (90-500ms measured, same matching
  behavior verified against real data). `frontend/src/api.js` also
  gained a default 20s request timeout so a genuinely hung request fails
  visibly instead of leaving a button stuck forever.

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
`POST /:id/bracket` (draw time) and `POST /generate` branch on the sport's
`tournamentFormat` field — a field on **Sport**, read via the populated
`tournament.sport`, not on Tournament itself — not on the sport's name.
The earlier hardcoded "Mobile Legends" / 8-team double-elim special case
has been removed, so any sport configured as round-robin in League Setup
takes the same path ML does. `GET /:id/bracket` (what the frontend
actually polls) doesn't branch at all — it just returns whatever was
drawn.

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
**Team model:** `division` (`open` | `boys` | `girls` | `under15` | `under30`)
and `format` (`team` | `singles` | `doubles`).
**Tournament model:** `division` — one tournament per (sport, season, division).

| Sport | Divisions | Entry format | Brackets |
|---|---|---|---|
| Basketball | under15, under30 | team | 2 |
| Volleyball | boys, girls | team | 2 |
| Badminton | boys, girls | **singles OR doubles — Super Admin picks per season** | 2 |
| Pickleball | boys, girls | doubles (always) | 2 |
| Billiards | open | singles (1 player per barangay) | 1 |
| Chess | open | singles | 1 |
| Mobile Legends | open | team (up to 2 teams per barangay) | 1 |

- Basketball's split is by **age**, not gender. Badminton runs **one** format per
  season (not both simultaneously). Pickleball is doubles-only.
- Registration rule: **one team per (barangay, sport, season, division)** — so a
  barangay can enter both under15 and under30. ML still allows 2 teams.
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
SiteImage      key ∈ {hero, league, barangay, about}, file(GridFS id),
               focal ∈ {top, center, bottom} (default center)
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
- Background `#0A1220`; footer `#060C16`; panels `#0F141C`; `PublicLayout`
  borders use `slate-500/15` while panel borders use `#1C2430`; accent gold
  `#F5A524`. (Supersedes the earlier "R7 navy" note — the real R7 site
  turned out to be a full-bleed image + translucent cards, which we did NOT
  adopt.) **Header is `#0A1220/90` with a blur, no border**, sticky at the top
  (Sep 2026). It used to be tuned to blend into a same-coloured Home hero;
  the hero is now a solid `#0C3550` panel, so on Home the header reads as its
  own dark strip above it — that is intentional. **The sticky behaviour was
  actually broken until Sep 2026** (the layout root's `overflow-x-hidden`
  turned it into a scroll container) — now `overflow-x-clip`; don't put
  `overflow-hidden`/`-x-hidden` on any ancestor of a sticky element.
- `PublicLayout`'s content container is `max-w-[1400px]` (Sep 2026 — was
  `max-w-6xl`/1152px, which on any desktop screen wider than that left large
  dead gutters either side of every public page, not just Home).
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
- **Scroll-reveal (Sep 2026, Motion — `npm i motion`, import from
  `"motion/react"`, NOT framer-motion):** `components/Reveal.jsx` exports
  `Reveal` (fade in + up 24px once, `viewport {once:true, margin:"-80px"}`,
  0.5s ease `[0.22,1,0.36,1]`, `delay` in SECONDS, `y` prop), plus
  `RevealGroup`/`RevealItem` (parent `staggerChildren: 0.08`, child variants)
  for card grids. **Always plays — it deliberately IGNORES prefers-reduced-motion** (Super Admin decision, Sep 2026: a Windows PC with "Show animations" off saw a static site and assumed it was broken; to restore, wrap the app in `<MotionConfig reducedMotion="user">`). It
  REPLACED the older CSS `Reveal` in `PublicUI.jsx` (and `hooks/useInView.js`,
  deleted). **Rules because the public pages poll for live data:** `once`
  everywhere; key list items by stable id (`t.id`/`p.id`; the API's field is
  `id`, not `_id`), never index; NEVER wrap live score strips, the LIVE NOW
  tile, or in-progress match cards. Wrapped: Home (two static stat tiles,
  Today, About-league, Kolambugan, Recent results), Standings (each group
  table), Brackets (each PANEL — Knockout + groups — not the round columns:
  the SVG wires are measured from box positions, so the boxes must move
  together with the stage), Teams + Players (card grids, staggered), About
  (every section). NOT wrapped: the hero, Home's LIVE NOW tile + "Live now"
  panel, Matches, Champions, TeamDetail, Players' "Top scorers" list.
  Card grids use per-card borders (`border-r border-b` inside an
  `overflow-hidden` wrapper with `-mr-px -mb-px`), not the old
  `gap-px bg-[#1C2430]` trick — with that, unrevealed cards showed as grey
  blocks. No hover animations, no page transitions, no springs.
- **Sports marquee (Sep 2026, `components/SportsMarquee.jsx`, Home, between
  the Live panel and Today):** one continuous right-to-left strip of sport
  NAMES (Anton, 28px, uppercase, white/70, gold diamond separators, 10%-white
  top/bottom rules, edge fades). Data = `GET /api/sports` (public) —
  never hardcoded; one entry per sport NAME (deduped, so never split by
  division); a failed request or empty list renders nothing. Pure CSS loop
  (`.marquee-track` / `@keyframes marquee-scroll` in `index.css`), NOT Motion:
  the track holds two identical copies (2nd is `aria-hidden`) and slides
  -50%, so the loop point is invisible. If one copy is narrower than the
  screen, each copy repeats the list until it isn't. Speed is constant
  (80px/s), measured from the real rendered width (re-measured when Anton
  loads / on resize), so the loop time scales with the number of sports
  (~34s at 7 sports on a wide screen). Pauses on hover. **Honours
  `prefers-reduced-motion: reduce`** (spec): static centred row, duplicate
  copy + fades hidden — unlike the scroll-reveals, which deliberately ignore
  it. Edge-to-edge via `w-screen ml-[calc(50%-50vw)]` — the technique banned
  for the hero (it clipped TEXT on mobile) is acceptable here because this
  only carries a decorative loop and the layout root clips horizontal overflow (`overflow-x-clip`).
- **Smooth scrolling — Lenis (Sep 2026), PUBLIC layout only.** Initialised in
  `PublicLayout.jsx` (`useLenis`) and nowhere else, so admin/organizer keep
  native scrolling (verified: `/login` and the admin guard redirect have no
  `html.lenis`). `duration: 1.1`, expo ease-out, `smoothWheel: true`,
  `syncTouch: false` (Lenis v1's name for the old `smoothTouch: false` —
  touch keeps NATIVE momentum), `autoRaf: true`. **Not initialised at all under
  `prefers-reduced-motion: reduce`** (spec) — so a PC with Windows "Show
  animations" OFF gets plain native scrolling, exactly like the marquee. Destroyed on unmount
  (removes the `html.lenis` classes; verified it comes back on return).
  It drives the real window scroll (no transforms), so the sticky header,
  IntersectionObserver-based Motion reveals and hash links are untouched —
  no Lenis↔Motion rAF sync was needed (verified: reveals fire after a glide).
  `ScrollToTop` jumps through `lenis.scrollTo(0, {immediate, force})` when
  Lenis is running. Browser back restores the previous scroll position, same as
  without Lenis. No scroll-jacking/snapping/horizontal sections. `lenis.css`
  is imported in the layout (its rules only apply under `html.lenis`).
- **Sticky public header FIXED (Sep 2026, was broken before Lenis):** the
  layout root had `overflow-x-hidden`, which silently makes that div a scroll
  container (`overflow-y` becomes `auto`), so `position: sticky` stuck to the
  div instead of the page and the header scrolled away. Now `overflow-x-clip`
  (clips, creates no scroll container). Don't put `overflow-hidden`/`-x-hidden`
  on any ancestor of a sticky element.
- **Login page (Sep 2026):** the desktop-only left brand panel uses React Bits
  **Gradient Waves** (`components/GradientWaves.jsx`, copied in per React Bits'
  copy-paste model, (c) David Haz, MIT + Commons Clause — keep the header
  comment; needs the `ogl` dependency). Layers: purple gradient (fallback) ->
  waves -> one text scrim. Only mounted at `(min-width: 1024px)` (a merely
  hidden panel would still create the WebGL canvas, so phones never load it),
  `React.lazy` into its own ~15.7 KB gzip chunk, frozen (`speed 0`) under
  `prefers-reduced-motion`. A photo layer was tried and removed (the Super
  Admin deleted `login-bg.jpg`).
- **Teams page — drag-scroll carousel of poster-card crests** (Sep 2026):
  each sport/division group on `/teams` is a horizontally-scrolling row
  (`TeamGroupPanel`/`TeamCard` in `Teams.jsx`), not a wrapping grid —
  click-and-drag panning via the existing `hooks/useDragScroll.js`, plus
  round prev/next arrows (`CarouselArrow`, new in `PublicUI.jsx`) in the
  panel header via a new `actions` prop on `Panel`. The arrows only render
  once a row actually overflows its container. Each `TeamCard` is a
  full-bleed poster tile (`aspect-[3/4]`): the barangay crest fills the
  ENTIRE card via `Crest`'s new `variant="cover"` (`absolute inset-0
  object-cover` — the parent now owns the size/aspect-ratio, unlike the
  default `variant="icon"` used everywhere else), with the team
  name/barangay/format overlaid at the bottom on a dark gradient scrim
  (`from-black/95 via-black/60 to-transparent`) so the bold white name
  stays legible over any photo. `variant="cover"` is used ONLY here —
  every other `Crest` call site is untouched.
- **Public search bar — Motion + compact width** (Sep 2026,
  `SearchInput` in `PublicUI.jsx`, used by Teams and Players): the clear
  (✕) button now fades/scales in via `AnimatePresence`/`motion.button`
  instead of a bare `{value && <button>}` pop, and focus gets a soft gold
  glow (`animate`d `box-shadow`) plus the search icon animating slate →
  gold (`#F5A524`, the site's one accent) — the old focus style was two
  near-identical dark shades, barely visible. Width capped at `max-w-xs`
  (320px); it was `w-full`, stretching the full content width on desktop.
  **Gotcha hit and fixed**: Motion composes `scale`/`x`/`y` into ONE
  `transform`, so the clear button's `scale` animation would have
  silently clobbered a plain Tailwind `-translate-y-1/2` used to center
  it — fixed by giving the button a constant `y: "-50%"` inside every
  Motion animation state instead of the Tailwind class.
- **Review Queue — barangay picker + a real "Cleared" definition** (Sep
  2026): `GET /api/review/queue` now also returns `barangays` (all 26,
  not just ones with a pending team), `totalPending`, `verifiedTeams` and
  `seasonStatus` (for the "Reopen for corrections" card, shown only during
  `verification`). The route runs a fixed handful of BATCHED queries — it used
  to query per team (~1-1.7s at ~34 teams on Atlas, now ~0.4s); keep it batched. The Review Queue
  page (`ReviewQueue.jsx`) shows a row of barangay chips above the team
  list — click one to filter to just that barangay instead of scrolling
  the whole season. A chip shows a red pending-count badge, a green
  "Cleared" badge, or a gray `x/N` progress count. **"Cleared" required a
  correction**: it was first defined as "whatever this barangay submitted
  is fully verified" — true for a barangay with just ONE verified team
  out of a much larger slate, which is misleading. Now `cleared` requires
  a VERIFIED team in every (sport, division) slot the season is actually
  running — `requiredSlots` is computed from `Sport.find({divisions...})`
  per division, deliberately NOT multiplied by `teamsPerBarangay` (that
  field is a per-slot ceiling — Mobile Legends's 2nd team is optional,
  never a requirement). **Red count badge on the sidebar itself**, not
  just inside the page: `AdminLayout.jsx` gained generic `badge` support
  — an item can set `badge: "reviewPending"` (done for Review Queue in
  `menus.js`) and the layout fetches the count once per mount, rendered
  as a red pill (expanded) or a dot on the icon (collapsed rail).
- **Animation accessibility status (Sep 2026, NOT formally audited — no
  screen-reader test):** nothing flashes/strobes, nothing carries essential
  information, all motion is small. Honours `prefers-reduced-motion`: Lenis
  (not initialised), marquee (static row), login waves (frozen), animated
  theme toggle (instant). Does NOT honour it: the Motion scroll-reveals
  (deliberate Super Admin decision), the pulsing LIVE dot, the search bar's
  focus glow/clear-button animation, and Tailwind
  `animate-pulse`/`animate-spin` skeletons/spinners. Known gaps: the marquee
  pauses on hover only (no keyboard/touch pause control — WCAG 2.2.2), the
  login waves run the GPU continuously on desktop. The Super Admin chose to
  leave these as-is pending the mock defense; cheap fixes if a panelist
  objects: `<MotionConfig reducedMotion="user">`, a pause button on the
  marquee, a global `prefers-reduced-motion` rule for CSS animations.
- NEVER use Mobile Legends / Moonton art or any copyrighted game assets.
- Public lineups show **surname, first name, jersey, age, stats, and photo**.
  NO birthdate, NO address, NO documents.
- **Home page hero redesigned bolder (Sep 2026)**, after the user shared
  Instagram references (a basketball-brand landing page, "Bounce") and asked
  whether to move the whole Public Viewer that direction. Decision: no — that
  design is a marketing landing page for one event (huge type, rotated text
  blocks, a handful of sections), not a fit for a live-data site with dense
  tables/brackets/rosters across 7 sports and 26 barangays; borrowed just the
  bold typography and individually-bordered tile style onto the Home hero
  instead of restructuring anything else. `Home.jsx`:
  - (Superseded — see the hero bullet below.) The first bolder version put
    an oversized two-line headline over the `hero` SiteImage with a
    `bg-gradient-to-r` overlay and pulled the hero up under the header with
    `-mt-20`. Both are gone: the hero now sits flush BELOW the nav (`-mt-6`)
    and uses a top-to-bottom scrim.
  - **A true viewport-edge "full-bleed" (`w-screen` + `-50vw` margins) was
    tried and reverted** — on a page this tall, Chromium's `100vw` includes
    the vertical scrollbar's width, so it overshot the real viewport and
    clipped the headline and nav on mobile. Confirmed by an actual
    screenshot, not just a build check — don't reintroduce this technique
    for a full-bleed section anywhere on this site; use a fixed-width
    ancestor-relative margin trick instead (see `-mx-4 lg:-mx-8` on the same
    section, which cancels exactly `<main>`'s own padding).
  - **Hero (Super Admin's spec, Sep 2026 — third revision; supersedes the
    photo-background/`HeroMatchCard` version, the absolutely-positioned
    three-layer version, and the faint `opacity-25 mix-blend-luminosity`
    photo, which was too faint to see).** Layers: (1) the **Site Images
    `hero` slot** at FULL opacity and full colour, `object-cover`,
    full-bleed — rendered with `SiteImage`'s `hideOnFail` prop so an empty
    slot draws nothing and the section's own solid `#0C3550` shows instead;
    upload/crop/focal code is untouched; (2) ONE scrim,
    `linear-gradient(180deg, rgba(8,35,52,.55) 0%, rgba(8,35,52,.30) 45%,
    rgba(8,35,52,.88) 100%)` — nothing else tints the photo, and it is drawn
    even with no photo so the fallback looks the same; (3) content in normal
    flow, bottom-anchored (the scrim is darkest at the bottom): a
    LEFT-aligned two-line Anton headline (line 1 white, line 2 `#D9A441`,
    `leading-[0.82] tracking-tight`, sized `clamp(2.5rem, min(15vw, 28svh),
    14rem)` — "INTER-BARANGAY" is ~5.8em wide in Anton, so 15vw fills ~87% of
    the container at any width), then the copy block `mt-7` (28px) below:
    28px subhead, one line of 15px body at `white/70`, gold `#D9A441` "View
    matches" pill + outlined "Standings". Nothing overlaps the headline —
    the optional `/hero-player.png` cut-out layer was REMOVED (re-add it
    deliberately if a subject PNG is ever supplied). Section is
    `min-h-[calc(100svh - nav)]`, flush under the nav (`-mt-6` cancels
    `<main>`'s py-6), so the stat tiles start below the fold; no fade-ins.
    Anton is loaded via the Google Fonts link in `index.html`. **Upload a
    large hero photo (>= ~1920px wide):** it now renders full-bleed at full
    colour, so a tiny/low-res file (the dev DB's is ~7 KB) looks blurry.
    Header: logo, nav centred at `lg+`, season-name pill at the right.
    Verified with Edge screenshots (1440x800, 1440x600, 600x1000; with and
    without a hero image).
  - The 3-stat row became `StatTile`: individually-bordered cards with an
    inline SVG icon each (no lucide-react on Public — matched the existing
    inline-SVG convention from `SearchInput`), instead of one shared strip
    with no per-item boundary. "Live now" only tints red + shows the pulsing
    `LiveDot` while `counts.liveNow > 0` — same "color means something" rule
    as everywhere else on Public.
  - Footer got a **mobile-only** pass in the same session (`PublicLayout.jsx`):
    text bumped up one step (10-11px read as genuinely small on a phone) and
    the 7-item "Explore" link list — one long stacked column — became a
    2-column `inline-grid` block, centered as a unit. Both collapse back to
    the original compact desktop sizing/layout at `sm:` — desktop is
    unchanged.
  - **Verification note**: this session is what surfaced that `npm run
    build` succeeding proves nothing about layout — two of the fixes above
    were shipped on math/assumptions alone and turned out wrong once
    actually rendered. This sandbox has no project "run"/screenshot skill
    and no Playwright, but DOES have a local Edge/Chrome install:
    `msedge --headless=new --window-size=W,H --screenshot=out.png <url>`
    works for a real rendered check. Gotcha: this headless setup clamps very
    small `--window-size` widths (requests around ≤400 silently render at
    ~492px) — verify true small-phone widths via font-metrics math
    calibrated against a working screenshot, and use an un-clamped
    width (≥600) for anything screenshot-verified directly. Worth running
    `/run-skill-generator` to capture this as a real project skill if visual
    checks keep coming up.

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
  **EXCEPTION: `AdminDashboard.jsx` (Sep 2026, revised Sep 2026)** — the
  colored-left-border pattern was called out as reading like an
  "AI-generated dashboard" (a distinct accent color decorating every static
  number, rather than color marking an actual status) and was removed
  there. Later asked for "some color" back — resolved as icon-only tinting
  (`TONE_ICON` in the file: a soft `bg-{c}-500/10 text-{c}-600` square
  behind each stat's icon, one hue per tile just to tell them apart), never
  a border and never the number itself, which stays plain foreground text
  — a deliberately lighter touch than the left-border pattern below. The
  games carousel still keeps color ONLY for the real "Live" status — "Final"
  is plain muted text, the sport name is a neutral secondary badge, not
  blue. The other nine Super Admin pages plus Barangay Admin/Organizer still
  use the colored-accent pattern above; whether to extend the icon-tint
  treatment everywhere is an open question, not yet decided either way.
- **Dark mode, opt-in, all three roles.** `AdminLayout` takes an
  `enableDarkMode` prop; every page that uses `AdminLayout` now passes it
  (Public Viewer doesn't use `AdminLayout` at all — it's a separate, always-
  dark design, unaffected by this toggle). A header toggle flips
  `document.documentElement`'s `dark` class (not a scoped wrapper div — Radix
  `Dialog`/`Select` portal to `document.body`, outside any local wrapper, so
  a div-scoped approach would leave modals/dropdowns stuck in light mode),
  added on mount and always removed on unmount. Preference persists in
  `localStorage` under `brgy-theme:<userId>` — PER ACCOUNT (Sep 2026), not
  shared: it used to be one `brgy-theme` key for the whole browser, so a
  Super Admin choosing dark made the next Barangay Admin to log in on that
  browser get dark too. The old shared key is ignored. Defaults to light.
  **Animated toggle (Sep 2026):** the ONE shared `components/ThemeToggle.jsx`
  (rendered by `AdminLayout`, so Super Admin / Barangay Admin / Organizer all
  get it — no per-page copy) uses `useModeAnimation` from
  `react-theme-switch-animation` with `ThemeAnimationType.CIRCLE`,
  `duration: 600`: a circular reveal expanding from the button. The hook ONLY
  drives the animation; `AdminLayout`'s `theme` state stays the source of
  truth (passed in as `isDarkMode`, changes come back via `onDarkModeChange`
  → `handleThemeChange` → state + `dark` class + per-user storage). The
  hook's built-in fallbacks are instant swaps: `prefers-reduced-motion:
  reduce`, no `document.startViewTransition` (older Firefox/Safari), no ref —
  all verified (no error, no stuck overlay, `#theme-switch-style` removed).
  Side effect: the hook also writes a global `localStorage.theme` key we
  never read. The old `.theme-transition` colour-fade CSS was removed.
  **The organizer scoring screen opts OUT (`animateTheme={false}` on its
  `AdminLayout`s → instant swap).** A View Transition makes the page
  non-interactive for its ~0.75s: measured mid-match with real mouse taps,
  every score tap landing during the reveal was silently swallowed
  (`::view-transition{pointer-events:none}` did not help), and frames dipped
  to ~29fps in software-rendered headless Edge. A missed point mid-match is
  worse than a missing animation. To re-enable: drop the prop.
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
  free under `enableDarkMode`. `DatePicker` takes two opt-in props, default
  off so match scheduling is unaffected: `captionLayout="dropdown"` (month
  + year select instead of prev/next-only navigation — birthdates can be
  decades back, scheduling dates aren't) and `disableFuture` (blocks
  anything after today). Both are turned on for the birthdate fields only.
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
- **Content fills the width the collapsed rail frees up** (Sep 2026): the
  Dashboard's stat grid already had no max-width cap and simply reflowed
  when the sidebar rail collapsed — every OTHER Super Admin page (Accounts,
  Champions, Reference List, Reports, Review Queue, Season, Site Images,
  League Setup, Tournaments) plus Barangay Admin (Team Registration,
  Matches, Document Submission) and the Organizer scoring screen were
  wrapped in a fixed `max-w-3xl`/`4xl`/`5xl` page container that stayed
  pinned to that width and just left dead space on the right. Dropped those
  wrappers everywhere (kept the genuinely-narrow bits: an empty-state card,
  a lone input). Reference List's residents table separately lagged
  visibly during the collapse animation — it used `table-layout: auto`,
  which rescans every row to compute column widths on every reflow, and the
  200ms collapse transition reflows continuously — switched to
  `table-layout: fixed` with explicit `colgroup` widths, making layout cost
  independent of row count.
- **Bracket trees pan by mouse drag, not just scroll** (Sep 2026): a shared
  `hooks/useDragScroll.js` (click-and-drag panning on a horizontally
  scrollable container, like a map/canvas) wired into both `Tournaments.jsx`'s
  `BracketTree` and the public `Brackets.jsx`'s `BracketSection`. A small
  movement threshold plus a capture-phase click-suppression step stop a
  drag from also firing whatever the pointer lands on (e.g. a match's
  Revert button).
- **Review Queue's player modal rebuilt around evidence comparison** (Sep
  2026): it used to split the player's photo (an "Information" tab) from
  their submitted ID (a separate "Documents" tab), so the Super Admin had
  to flip tabs to compare a face against a document — the literal point of
  this screen. Removed the tabs; photo + trimmed key fields (birthdate,
  age, address, jersey — name and status already show in the header) now
  sit in a sticky left column beside the documents, stacked on the right,
  so both stay visible together while scrolling through however many
  documents a player has. Also: the Approve/Reject buttons were plain
  hand-rolled `<button>`s (a leftover the shadcn pass missed) — now shadcn
  `Button`s with the solid green/red colors kept via `className`, since
  shadcn's own `destructive` variant is a soft/muted style that doesn't fit
  the "these stay vivid on purpose" rule above.
- **Shared `components/ImageCropDialog.jsx` + `lib/imageCrop.js`** (Sep
  2026): extracted Site Images' existing react-easy-crop position-and-zoom
  dialog into one reusable implementation, then rebuilt the Barangay
  Admin's logo uploader around it — a bigger preview with a hover-to-change
  overlay (the image itself is the upload control), a spinner while
  uploading, and a crop/zoom step before saving so every barangay's crest
  actually comes out square regardless of the source photo's shape.
- **Player address is now editable after a player is added** (Sep 2026): it
  was only ever captured on the initial "Add a player" form — the "Correct
  this player" edit form had no address field at all, and the roster list
  never displayed it, so a typo or a skipped address was permanent. The
  backend's `PATCH .../players/:playerId` route already accepted `address`;
  added the missing input to the edit form and a small address line to
  each roster row.
- **Native `window.confirm()`/`alert()` and top-of-page error banners
  replaced app-wide with modals** (Sep 2026): `components/ErrorDialog.jsx`
  (`useErrorDialog()` → `showError(message)`) and `components/ConfirmDialog.jsx`
  (`useConfirm()` → `await confirm(message, opts)`, `opts.alertOnly` for a
  single-button info dialog), both mounted once in `App.jsx`. Two problems
  this fixed: an action's error used to render as a banner at the TOP of the
  page/dialog while the button that triggered it could be scrolled well
  below (a 26-row accounts table, the last of 7 sports in League Setup) —
  now pops a centered modal, visible regardless of scroll position; and
  every native browser confirm/alert looked like an OS popup, not part of
  the app. Applied everywhere an action's error/confirmation was
  structurally far from its own trigger — NOT applied to errors that
  already render immediately next to their trigger (a form's own inline
  error above its Save button), which would just add clicks for no benefit.

**Organizer scoring screen — shadcn/ui, light by default, dark optional (Sep 2026):**
- CORRECTION: this was long documented as permanently "dark navy... the one
  screen where dark is for legibility at arm's length," but the screen was
  never actually built that way — it shipped light-themed (`bg-white`,
  `slate-*`) with no dark mode at all. Resolved by building the dark mode
  the doc always assumed existed (see the Admin pages entry above), rather
  than forcing the screen dark. Big touch targets and tablet/phone-first
  layout are unchanged either way.
- **Player rows redesigned for courtside speed** (Sep 2026): each on-court
  player used to be a 3-line stacked card (a header row, then a full-width
  row of point buttons, then a full-width row of stat buttons) — about
  125px tall, so 5 players (~660px) ran past the fold before every score
  button was reachable without scrolling. Collapsed to a single row (jersey
  chip, name, and every button inline) on tablet/desktop, so the full
  five-player lineup fits and is tappable without scrolling. Below `sm`
  (~640px) it stacks instead — name on top, full-width button bar below —
  because the button group is a fixed-width cluster that can't shrink;
  forcing one row there either clipped the name or pushed buttons
  off-screen.

Everything mobile-first and responsive. Public users are on phones.

---

## Feature priorities (MoSCoW)

**Must:** auto pre-screen verification + Super Admin review queue ✅; roster
submission w/ conditional document upload ✅; bracket generation ✅; real-time
live scoring ✅; public dashboard ✅; account provisioning panel ✅; in-app
first-login instruction modal ✅ (text + icon per step, see
`components/InstructionModal.jsx`).

**Should:** RBAC across all roles ✅ (API + frontend guards, `RequireRole`);
permanent champions archive ✅; password reset from Super Admin panel ✅;
reschedule with audit trail ⬜.

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
  - Cross-barangay recruiting allowed ONLY for TEAMS of a whitelist of small/remote
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
- `DELETE /api/teams/:id` (Sep 2026): originally Super Admin only (orphan
  cleanup); now the owning **Barangay Admin can also delete their own
  team**, gated on `status !== 'verified'` (a verified team is locked into
  tournament generation — undoing that still needs the Super Admin) and the
  same in-any-match guard as the Super Admin path. `BrgyDashboard.jsx` shows
  a delete button per team, hidden once verified.

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
  **Zoomable** (Sep 2026, `Lightbox` in `ReviewQueue.jsx`): mouse wheel,
  double-click, or +/-/reset buttons to zoom (1x–5x), drag/touch-drag to
  pan once zoomed — the old version only fit the image to screen, not
  enough to read small print on a phone-photographed ID.
- **Approve is blocked for a `needs_document` player with no document
  uploaded** (Sep 2026) — enforced in the route (400 if `Document`
  records = 0 for that player) and in the UI (Approve button disabled,
  amber explanation). Scoped to `needs_document` only, since that status
  means no reference-list match exists at all; `flagged` stays
  approvable on judgment, since that's a barangay-rule call, not missing
  paperwork. Approve now also clears `flagReason` (was left stale before,
  so an approved player could still show the old warning text). **The
  `ReasonCallout` component that renders that warning is copy-pasted in
  THREE places** (`ReviewQueue.jsx`, `BrgyDashboard.jsx`, `Documents.jsx`)
  — the `status === 'eligible'` guard was first added only to
  `ReviewQueue.jsx`'s copy and had to be reapplied to the other two after
  a real report of it still showing on the Barangay Admin's own roster
  view (Sep 2026). Not extracted into a shared component yet — a real risk
  if this needs fixing again.

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
- **Delete + cleanup (Sep 2026):** `DELETE /api/tournaments/:id` (removes a
  tournament + its matches + PlayerMatchStats) is now wired to a "Delete
  tournament" button in `Tournaments.jsx` — its confirmation counts completed
  matches first and warns explicitly if real scores would be discarded, since
  the route itself has no such guard. `DELETE /api/teams/:id` (new) cascades a
  team's players/documents/photos, refusing while the team appears in any
  match. Both feed an "Orphaned tournaments" / "Orphaned teams" recovery UI
  (amber cards, `!season` filter, per-item + bulk delete with a shadcn
  `Progress` bar) for teams/tournaments left behind by a season deleted
  directly in the DB — invisible otherwise, since the plain list/generate
  routes are scoped to the current season only. Normal, non-orphaned data is
  unaffected and these cards stay empty/hidden.

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
  (modal) with photo upload and CSV bulk import (Sep 2026), Document
  Submission page.
- Organizer: match list + live scoring screen.
- Public Viewer — COMPLETE, eight pages: Home, Matches, Standings, Brackets,
  Teams, Team detail, Players, Champions, About. `pages/public/PublicLayout.jsx`
  (header, nav, 3-column footer, `<Outlet/>`); shared primitives live in
  `components/PublicUI.jsx` (Crest, PlayerAvatar, Panel, SportTabs,
  SearchInput, SiteImage, DIVISION_LABEL) — `components/ui.jsx` is the LIGHT
  admin set and is not usable on the dark public pages. Polling varies by
  page: 10s on Matches and Home, 15s on Brackets and Standings, 20s on the
  barangay match page.
- **Professional-polish pass** (Sep 2026): every page's bare "Loading…" text
  replaced with shaped skeleton placeholders (`Skeleton`/`PanelSkeleton`/
  `TileGridSkeleton`/`PhotoRowSkeleton`, added to `PublicUI.jsx`) matching
  each page's real layout — Team Detail specifically used to blank its
  whole header (including the back link) while loading; now only the
  roster is skeletoned. Added a genuine pulsing `LiveDot` (Tailwind
  `animate-ping`) to every real "LIVE" indicator (nav badge, scoreboard
  strips, bracket cards) — the one deliberate extra animation, reserved
  strictly for an actual `ongoing` match, consistent with the existing
  "color/motion means something" rule. Also fixed the browser tab: the
  favicon was a generic scaffolding logo and the title was the raw
  `kolambugan-sports` package name — both replaced with the site's actual
  gold "K" mark and a real title (superseded Sep 2026 — see the real-logo-
  assets entry below; the hand-drawn "K" mark this refers to is gone).
  Brackets also picked up the mouse drag-to-pan from the Super Admin
  bracket view (see above).
- **Real logo/favicon assets landed (Sep 2026)**, replacing every
  hand-rolled "K"-in-a-colored-square placeholder app-wide (there were six:
  `AdminLayout`'s sidebar, `Login.jsx` twice — the dark hero panel and the
  mobile header, `LoadingScreen.jsx`, `ChangePassword.jsx`, and the public
  site header in `PublicLayout.jsx`) and the placeholder SVG favicon.
  Concept "Bay Crest" — sunrise disc over Mount Bucas, Panguil Bay below,
  26 gold ring ticks (one per barangay). Assets live in
  `frontend/public/logo/` (full set: crest variants, lockups, the simple
  mark, source README with the palette/usage table) plus three favicon
  files directly in `frontend/public/` (`favicon.ico`, `favicon-48.png`,
  `favicon-180.png` — referenced from `index.html`). Currently wired in:
  `ksl-mark-simple.svg` (the circular badge, self-contained navy
  background — works on light or dark) for every sidebar/login/loading
  mark; `ksl-lockup-horizontal-dark.svg` (mark + wordmark combined) for
  the public header, replacing the old separately-styled "K" square +
  two-line text. The remaining variants (light-background lockup, stacked
  lockup, mono/reversed crests, larger PNGs) aren't wired to a UI spot
  yet — see `frontend/public/logo/README.md` for which file fits which
  use (documents, tarpaulin, dark pages, single-colour print, etc.).
  `ksl-crest-1024.png` was seeded directly into the "league" Site Images
  slot (GridFS, via the same `putFile` the real upload route uses) since
  it was sitting empty — Super Admin can still replace it from the Site
  Images page like any other slot.
- Route guards: `RequireRole` + a 401 handler in `api.js` that clears the
  session and redirects to login.
- Shared `AdminLayout` (generic, takes a `menu` prop), `ui.jsx` components,
  and `components/menus.js` (`superAdminMenu`, `organizerMenu`, `brgyMenu` —
  previously copy-pasted into every page).
- **First-login instruction modal** (`components/InstructionModal.jsx` +
  `lib/instructionContent.js`) — role-specific step-through content (7 steps
  for Super Admin, 4 for Barangay Admin, 5 for Organizer, including a
  Substitute step) shown automatically once, right after a forced password
  change (`ChangePassword.jsx`) — `mustChangePassword` only ever fires once
  per account, so this needed no new backend field to key off. Also
  reopenable any time from a "?" button in `AdminLayout`'s header, shared by
  all three roles, for existing accounts and for evaluators wanting a
  refresher. **Wide two-pane layout with screenshots again (Sep 2026)** —
  the earlier "text + icon only, no screenshots" decision (dropped because
  every UI pass makes them stale) was reversed at the Super Admin's request:
  the modal is now `sm:max-w-5xl`, explanation on the LEFT (title,
  description, shadcn `Separator`s, and a clickable numbered step list) and
  the step's screenshot on the RIGHT, click to enlarge (nested `Dialog`
  lightbox in `StepShot`). Images live in `frontend/public/instructions/`
  named `<role>-<step>.png` (`super-admin-1.png`, `barangay-admin-3.png`,
  `organizer-5.png`… — see that folder's README.md); `instructionContent.js`
  derives each step's `image` path from its position. A missing/failed image
  falls back to the step's icon, so nothing breaks before the files exist.
  Re-capture the affected screenshots after any UI pass on those pages.

## IN PROGRESS / NEXT (priority order)

1. Barangay Admin dashboard (last remaining HIPO module — Match Information
   and Document Submission/verification status are built).
2. `verified_residents` collection (approvals persisting across seasons).
3. ~~Bulk player import.~~ Done (Sep 2026) — CSV upload in the Barangay
   Admin's roster editor, see Tournaments/Roster section below.
4. ~~Tournament delete from the UI.~~ Done (Sep 2026) — see Tournaments below,
   plus a new team-delete route/UI alongside it (there wasn't one before).
5. Super admin password recovery when both super admins are locked out.
6. Delete the now-dead `components/ui.jsx` (Button/Card/Input/Label/Pill) once
   confirmed nothing still imports it — the shadcn/ui pass replaced it
   everywhere. Light animation over the shadcn pages is still an open nice-to-have.
7. Full end-to-end test on a CLEAN database (create season → register →
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
seedTestTeams.js, showOrReset.js, clearTournament.js,
seedTie5Test.js, seed52WithTies.js,
seedVerifiedTeam.js, seedPlayersForTeams.js, **seedSportConfig.js** (the
config UI now exists — this can go), and `wipe.js`, `makeReferenceCsv.js`,
`seedSportTeams.js`, `deleteSeason.js` if/where created. **KEEP `seed.js`
AND `seedData.js`** — `seed.js` imports `seedData.js` for the 26 barangays
and 7 sports a fresh install needs, so deleting one without the other
breaks it. (`seedReviewTest.js` / `seedTiebreakerTest.js`, previously
listed here, no longer exist — already gone.)
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
  `returnDocument: 'after'`. Fixed in `organizer.js`; `siteimage.js`'s
  `PATCH /:key/focal` still uses the old `{ new: true }` and needs the
  same fix.
- **Don't read `games[0]` as the final score.** It is only period 1. The final
  score is `liveScoreA`/`liveScoreB` (they survive completion). Admin-entered
  results still write into `games[0]`, so displays need to handle both.
- **Two `path="*"` routes** in App.jsx = the second is dead code. One catch-all,
  pointing at `/`.
- Frontend paths must match `App.jsx` exactly — a redirect to `/barangay`
  when the route is `/brgy` silently bounces to the login page via the
  catch-all route.
- **A Season document deleted directly in the DB (no in-app delete route
  exists) leaves orphans everywhere that reference it by `season` ObjectId**
  — Teams, Tournaments, AND ReferenceList rows all keep pointing at a season
  id that no longer resolves. Nothing cascades from Season. Hit three times:
  orphaned Teams/Tournaments blocking `DELETE /api/sports/:id` (see the
  Orphaned teams/tournaments entries in CHANGES.md), then a full duplicate
  17k-row ReferenceList copy tagged to a dead season id, doubling that
  collection for no reason. When a season goes missing unexpectedly, check
  all three collections for stale `season` references, not just Teams.