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
- New players / 15 and under: require **parental consent + supporting documents**.
  (`MINOR_AGE` cutoff is inclusive — `age <= 15` — since Sep 2026; see the
  verification rule below.)
- **Basketball's `under15`/`under30` divisions are enforced age caps, not just
  labels** (Sep 2026, Super Admin decision): "15 under" means 15-and-under
  (not 14-and-under), "30 under" means 30-and-under (not unlimited up to
  100). `checkDivisionAge()`/`DIVISION_AGE_LIMIT` (`under15: 15, under30: 30`)
  in `routes/team.js`, checked on add-player, CSV import (over-limit rows
  skipped + reported), "Correct this player" (birthdate changes only), AND
  as a backstop on `POST /:id/submit` (re-checks every rostered player,
  catches one added before this check existed or by any other path — past
  submission a player is only screened for residency, never for the
  division's age cap). **`under30` also has a FLOOR of 16** (bug fix, Sep
  2026 — `DIVISION_AGE_MIN = { under30: 16 }`, same call sites as the ceiling
  above): without it a player young enough for the under15 roster could
  ALSO legally sit on under30, so the two divisions overlapped instead of
  being a clean age split. `under15` has no floor — it's 0-15, `under30` is
  16-30. `open`/`boys`/`girls` are gender/skill divisions and
  carry no age limit.
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
  max 3 MB. **Position-and-zoom before saving (Oct 2 2026)**: picking a photo in the
  roster editor opens the shared `ImageCropDialog` (3:4 portrait, the public
  `PlayerCard` shape; saved as a ≤900px-wide JPEG, so the upload is always small).
  `pendingPhoto` in `RosterEditor` (`BrgyDashboard.jsx`). The standard is enforced by UI guidance + Super Admin review, not
  automatically. Address and birthdate remain PRIVATE — never on public routes.
- One athlete may join **multiple sports** in a season (schedule permitting)
  → players↔teams is many-to-many (TeamPlayer). **But only for ONE barangay**
  (Super Admin rule, Sep 2026): once an athlete is on barangay A's roster this
  season, no OTHER barangay may roster them — even one that allows
  cross-barangay. E.g. Matampay (cross-barangay on) fields a Mukas resident:
  that resident can play for Matampay in as many sports/esports as they like,
  but never for Mukas or any other barangay. `otherBarangayHolder()` in
  `routes/team.js` enforces it on add (409), CSV import (row skipped and
  reported) and "Correct this player" (a rename into someone already on another
  barangay). Identity = name + birthdate (case/whitespace-tolerant, same as
  `playerKey()`), because each team gets its OWN Player record — nothing else
  links two records of the same person. Scoped to the current season; a player
  freed by a reject/delete/reopened team can be rostered elsewhere. Checked
  against the dev data: 181 players, none already on two barangays.
- **Boys and girls divisions don't mix** (Super Admin rule, Sep 2026). Once an
  athlete is on one of the barangay's BOYS teams this season (any sport), they
  may join other boys or open teams only, never a girls team, and vice versa
  (e.g. Badminton Boys → Volleyball Boys or Billiards/Chess/ML Open is fine;
  Pickleball Girls is not). Player has NO gender field, so the barangay's own
  rosters are the evidence: `genderConflictIndex()` in `routes/team.js` blocks
  add (409), CSV import (row skipped + reported), "Correct this player" (409)
  and submit (backstop). Identity = name + birthdate (`playerKey()`). Open and
  the age divisions (under15/under30) are never checked. Limitation: the FIRST
  boys/girls roster a new player joins can't be checked. Found by uploading a
  Badminton Girls CSV into Badminton Boys, which used to be accepted.
- **My Teams shows what screening found on each submitted roster** (Sep 2026,
  `ScreeningBadges` in `BrgyDashboard.jsx`): beside "Submitted" come "N flagged"
  (red), "N need a document" (amber, links to Verification Status), "N documents
  in review" (sky: a `needs_document` player who already has an upload), or "All
  eligible". A verified team just says "Verified" (no warnings); a draft says
  "Draft". The data is `screening` on each team from `GET /api/teams/mine`, a
  batched tally (3 queries for the whole list — keep it batched).
- **Team registration shows the per-sport team limit** (Sep 2026,
  `BrgyDashboard.jsx`): "1 team per barangay — already registered" or "Up to 2
  teams — N of 2 registered" (from `teamsAllowed` on `GET /api/sports`, the
  same `teamsAllowedFor()` that `POST /api/teams` enforces), and Create is
  disabled at the limit. For Mobile Legends the limit follows the knockout
  size set in League Setup (Top 8 = 1, Top 16 = 2 — see Tournament format),
  and the card says which one this season is.
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
  **Re-confirmed by the Super Admin, Sep 24 2026 — don't change the direction.**
  Only a CHECKED barangay's team may recruit from other barangays; an unchecked
  one (e.g. Tabigue) fields only its own residents. ("Both barangays checked" and
  "player's home barangay must be checked" were offered and declined.)
  **Now enforced at ENTRY, not just at submit (Sep 2026 fix).** A Tabigue admin
  imported a CSV of Inudaran players into Tabigue's U15 team and it was accepted:
  the import ignored the CSV's address column (stamping every row "Tabigue"), and
  residency was only screened on submit, and never for minors. `crossBarangayBlock()`
  in `routes/team.js`, for an UNCHECKED team's barangay only, refuses on add
  (409), CSV import (row skipped + reason) and "Correct this player" (409) when
  (1) the CSV row's address OR barangay column ("Barangay", "Brgy", "Home Barangay"…,
  read as evidence only, never stored) names a different barangay (`barangayNamedIn()`:
  accent/punctuation-tolerant, "Sto."/"Sta." = Santo/Santa, longest name wins so
  "Small Banisilon" isn't read as "Banisilon"), or (2) an adult's
  `decidePlayer()` result is `cross_barangay` (on the list under another
  barangay). The stored address is still the team's barangay name. Remaining gap:
  a minor typed in by hand, or imported with no address, has no home-barangay
  record anywhere, so only the documents and "one athlete, one barangay" (if
  they're already on their home roster) catch them. Tested through the real
  import route on a throwaway team: Inudaran-address row skipped with the reason;
  Tabigue-address and no-address rows added.
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
  Certificate. New players / those 15 or under also need PARENTAL CONSENT
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
- **The reference list is LOCKED from verification until the season ends (Sep 2026).** `POST
  /api/reference-list` returns 409 unless the season is `setup` or `registration_open` (the Reference
  List page disables the upload and says why; the list stays viewable/searchable). Reason: replacing
  the list re-screens every player, and once the Review Queue is open the verdicts are being made
  against that list. A new season has its own list, so the next season's setup stage is open again.
- **A re-screen never undoes the approval of a minor (Sep 2026, `rescreenSeason()`).** A player
  15 or under can never be on the list, so re-screening one can only ever produce `needs_document`
  — i.e. it could only wipe the Super Admin's document approval (and reopen a verified team).
  Players who are `eligible` and 15 or under are skipped. This also covers the other caller, the
  cross-barangay toggle (`allowsCrossBarangay`), which is locked only while the season is `ongoing`
  (see "League structure is frozen" below), so it can still run during `verification`. (Reported:
  "U15 players go back to needs document when I re-upload the list".)
- **`MINOR_AGE` cutoff corrected to INCLUSIVE (Sep 2026)** — `services/prescreen.js` used
  `age < 15`, so a 15-year-old was screened as an adult against the reference list (and could be
  `flagged` as a possible Dayo, unapprovable, if not on it). Now `age <= 15`: a 15-year-old routes
  to `needs_document` (parental consent + document) like a younger player, same as everywhere else
  `MINOR_AGE` is checked (`decideFromCandidates`, `rescreenSeason`'s skip-guard,
  `referenceList.js`'s informational-highlight logic). This is now in slight tension with the next
  bullet's "list starts at 15" framing below — the real voters' list, once obtained, may in fact
  carry 15-year-olds; worth re-confirming with Hon. Reserva.
- The **SK voters' list** (ages 15–30 — confirmed by the SK Chairperson; NOT
  the COMELEC general register) can power an automatic pre-check, but it can
  only be obtained through the **LYDO**. **Still EXPECTED, not in hand**
  (Aug 2026). Players 15 or under route straight
  to `needs_document` with no lookup, per the inclusive cutoff above.
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
     reject). Reject removes the player and REOPENS the roster **for that
     team only** (Sep 2026 fix — before, "reopened" was in name only: add /
     import / remove / submit all needed `registration_open`, and the team
     left the Review Queue, so one rejection meant it could never be
     verified). `requireRosterWindow` in `routes/team.js` allows those four
     during `verification` ONLY for a team with `status: 'rejected'` and no
     `submittedAt` in the current season; resubmitting sets it `pending` and
     closes the window. Creating a team still needs `registration_open`. The
     queue lists these teams under "Waiting for the barangay to resubmit"
     (`reopenedTeams`), and My Teams / the roster editor tell the Barangay
     Admin to add a replacement and resubmit. **Approve is
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
  **Games column data**: every match entry (matched, near-miss, under-15 hint)
  carries `sport`, `division` and `barangay` of the team, and the page shows
  "plays for <barangay>" plus "Games: Basketball (Under 15), Chess" so the Super
  Admin sees what a resident plays and for whom. Matches are grouped BY BARANGAY:
  the same person on several teams for one barangay is normal; a row turns amber
  ("On N barangays' rosters") only when more than one barangay rosters them —
  which the rule above now prevents, so it only appears for legacy data.
  **Responsive (Sep 2026)**: `md+` is the table in a scroll box; below `md` each
  resident is a CARD that scrolls with the PAGE (`useWindowVirtualizer`) — a small
  inner scroll box on a phone traps the finger (the "drag table" problem) and seven
  columns don't fit. One layout is mounted at a time (`useMediaQuery`); both share
  `analyzeRow()`/`MatchInfo`, so change those, not two copies. **Verify layout
  by rendering, not by building**: headless Edge driven over the DevTools protocol
  (Node 25 has a global `WebSocket`) with `Emulation.setDeviceMetricsOverride`
  works at any width — unlike `--window-size`, it isn't clamped near 500px — and a
  small mock API can stand in for the backend, so no real login is needed. Git Bash
  rewrites a leading `/path` argument into a Windows path; set `MSYS_NO_PATHCONV=1`.
  **Near misses**: a flagged adult (or, since Sep 2026, a 15-and-under player — see below) who
  shares a NAME with a row (but not middle initial/birthdate) makes that row orange, "Same name,
  details differ", listing which fields disagree (roster vs list) — `nearMisses` on `GET
  /api/reference-list`, computed via the shared `nearMissesFor()` in `services/prescreen.js` (also
  used by the Review Queue's player modal — see the Review Queue near-miss bullet further down).
  Super Admin only, on purpose: it reveals the list's real
  birthdate, so it must NEVER go into `flagReason` (Barangay Admins see that).
- **Reference List page — informational highlight for 15-and-under same-name
  rows** (Sep 2026): `decideFromCandidates` deliberately never matches a
  player 15 or under to a reference row (`MINOR_AGE` cutoff is inclusive, Sep
  2026), so a minor's official status is always `needs_document` regardless
  of a same-name row.
  `GET /api/reference-list` now ALSO surfaces a same-name hit for a minor as
  a separate, clearly-labeled **purple "informational only"** row highlight
  (not green/red, and never counted as a real match) — helps the Super
  Admin judge a submitted document against whether the family shows up in
  the barangay's own records at all. Once that player is approved, the same
  row is promoted into the real match set (`status: 'approved_minor'`,
  labeled "Approved · document review", normal green) — the highlight
  changes to reflect that the case is resolved, instead of staying purple
  forever. **The purple hint only shows when the minor's middle initial and birthdate actually
  agree with that row (Sep 2026 fix)** — found by the Super Admin deliberately mistyping a minor's
  middle name to test detection and getting purple instead of the expected orange. Before this fix
  the `isMinor` branch in `routes/referenceList.js` pushed every same-name candidate to the purple
  map unconditionally and skipped the near-miss check entirely, so a minor's details were never
  actually compared — only an adult could ever produce orange. Now each candidate runs the same
  `sameMiddleInitial`/`sameDay` comparison adults get: disagreement → orange near-miss (tagged
  `minor: true`, caption "15 or under, needs a document either way" so it isn't read as an adult
  flag), agreement → purple as before. Doesn't change the player's actual status (`needs_document`
  either way, per `MINOR_AGE`) — only what the Super Admin sees while reviewing. `analyzeRow()`'s
  row-tone priority in `ReferenceList.jsx` now checks `nearmiss` before `minor`.
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
- ML is OPEN division (mixed gender). **The knockout size is set in League Setup
  BEFORE registration and decides the team limit (Sep 2026, Super Admin decision
  — reverses the earlier "pick it at generate time"):** Top 8 = ONE team per
  barangay, Top 16 = up to TWO (`Sport.knockoutSize`; `knockoutSizeOf()` /
  `teamsAllowedFor()` in `lib/sportRules.js` — unset = Top 16, the old default).
  Applies to any `round_robin` sport; every double-elim sport is 1 team per
  division. Why: Barangay Admins need to know how many teams to register.
  - **Applies to EVERY esport, not just ML (Sep 2026).** Esports are always
    round-robin: a `pre('validate')` hook on the Sport model forces
    `tournamentFormat: 'round_robin'` whenever `category === 'esports'` (a new
    esport, or a game switched to the esports type). `isRoundRobinSport()` in
    `lib/sportRules.js` (round-robin format OR esports) is what
    `knockoutSizeOf()`, `/generate` and the knockout draw check, so an esport
    saved as double-elim before the hook still behaves right. `PATCH
    /api/sports/:id` refuses a non-round-robin format for an esport (400) and a
    type change that would switch the draw once this season has a bracket (409).
    League Setup shows the knockout choice whenever the server sends a
    `knockoutSize` (null = double-elim), and "Add a game" locks the draw format
    to round-robin for esports.
  - Set on the game's Registration section in League Setup, saved through
    `PATCH /api/sports/:id/config` (`knockoutSize`, validated there — it was
    removed from the generic `PATCH /api/sports/:id` list). Switching to Top 8
    is refused (409, naming them) while any barangay already has two teams;
    any change is refused once this season's bracket exists.
  - `POST /api/teams` caps registration with `teamsAllowedFor()` (no longer the
    hardcoded "Mobile Legends = 2"); `GET /api/sports` returns the effective
    `knockoutSize` + `teamsAllowed`, and the Barangay Admin's Register-a-team
    card shows them ("This season is a Top 8 knockout… only one team").
  - `POST /generate` uses the saved size and ignores any `knockoutSize` in the
    request; the Tournaments page shows it read-only with a link to League Setup.
    The "refuse Top 8 if a barangay has two verified teams" check stays as a
    backstop.

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
**Games-won sports (Chess, Billiards, esports) pick a SERIES length at start (Sep 2026):** the
organizer chooses best of 1 / 3 / 5 (`periodOptions`, default [1,3,5], label "game" — see
`rulesFor()`), stored in `bestOf` like a sport's period count. Each "X won a game" tap is one
`games[]` entry; the match ends once a side wins `floor(bestOf/2)+1` (`winsNeeded()` in
`routes/organizer.js`); `end-period` is refused. The bracket's generated `bestOf` is overwritten
at start (Super Admin chose organizer-picked over bracket-fixed).
The choices are editable in League Setup → Scoring → **Series lengths** (odd numbers only — the
server refuses 2 / 4 for a games-won sport, `evenSeries()` in `routes/reference.js`).

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
  [1,3,5]. Per-sport point values: Basketball [1,2,3]; every other sport [1].
- **SCORING IS BY TEAM; PLAYER STATS COME AFTER THE MATCH (Sep 2026 — replaces the per-player
  live scoring, the on-court lineup / substitute UI and live foul/rebound/assist buttons).**
  While a game runs the organizer only taps the team that scored (+1/+2/+3 in basketball, +1
  elsewhere; Mobile Legends, Chess and Billiards keep "X won a game"). When the match is
  `completed` a **Player stats** form appears on the same screen (`StatsForm` in
  `OrganizerScoring.jsx`, saved with `PUT /api/organizer/matches/:id/stats`): one card per
  rostered player, both teams, filled in from the organizer's scoresheet. It also picks the MVP
  (no longer chosen at End match). Re-openable and re-saveable any time by that sport's organizer.
  **It is a MODAL since Oct 1 2026** (`StatsDialog` wraps `StatsForm`): it opens by itself right
  after End match is confirmed, and a "Player stats" card on the finished match (Saved / Not
  entered yet badge, "Fill in" / "Edit player stats" button) reopens it. Inside: title, a
  scrolling middle (players 2 columns from `sm`), Save pinned at the bottom; saving closes it.
  Closing with unsaved edits asks "Close without saving?" first (`dirtyRef`). Tested against a
  mock organizer API with headless Edge at 1280 and 390px.
  **Player points can't exceed the team's score** (Oct 1 2026), per team, for sports scored by
  POINTS only (`scoringMode !== 'final'`; chess / billiards / esports keep their score as games,
  so a "points" column there is not capped). Form: `setPoints` lowers a number that would go over
  to what is left and shows a red `capNote` ("…so only 12 points are left for this player").
  Server: `PUT .../stats` sums each side's points (`sideOf` from TeamPlayer.team) and returns 400
  ("X's players add up to 63 points, but the team scored 62…") — the real guard; the form is
  convenience. Tested: form via the mock (70→62, then 5→0, 15→12 after lowering to 50); route via
  stubbed models (6 cases incl. exact total allowed and chess not capped).
  **Which columns the sheet has is the Super Admin's choice per sport** (League Setup → each sport's
  "After-match score sheet", stored as `Sport.scoreSheet`; absent = the built-in default, empty =
  no player form). The catalog and defaults are in `backend/src/lib/sportRules.js`
  (`STAT_CATALOG`, `SHEET_BY_CATEGORY`, `DEFAULT_SHEET`): a **Sport** can tick points, assists,
  rebounds, fouls, blocks, steals, turnovers, aces, digs; **Esports** kills, deaths, assists and
  **role**; a **Board game** points. Defaults: Basketball = points, assists, fouls, rebounds;
  Volleyball / Badminton / Pickleball = points; Mobile Legends = role; Chess / Billiards = none.
  The `role` column is a pick-list — Mobile Legends: Carry (Gold Lane), Fighter (EXP Lane), Mage
  (Mid Lane), Jungler, Support (Roamer); Call of Duty Mobile: Slayer, Objective (OBJ), Anchor,
  Support, Flex; any other esport: Carry, Tank, Support, Flex. A player row left blank = "didn't
  play" and is stored as NO record. The screen shows player points vs the team score
  ("3 short" / "matches") but never blocks the save. Storage: points / assists / rebounds / fouls
  are real `PlayerMatchStats` columns (the public pages sum only those four); every other column
  goes under `PlayerMatchStats.extra` (not shown publicly yet). A new catalog column = one
  `STAT_CATALOG` entry plus its `SHEET_BY_CATEGORY` type(s); no schema change.
  **The public Team page shows only the sheet's columns** (Sep 2026 fix: it used to always
  add Fouls, so chess/badminton set to Points showed an all-zero Fouls column). `GET
  /api/public/teams/:id` returns `team.statColumns` (the sheet ∩ the four public columns);
  `TeamDetail.jsx` renders from that. Don't hardcode stat columns on public pages. **Every stat cell (GP, PTS, PPG, REB, AST, Fouls) is bright `text-slate-100 font-semibold`** (Oct 1 2026, "it looks so gray" — only PTS used to be bright); headers `text-slate-300`; only jersey # and age stay softer (`slate-400`).
- **Sport TYPE (Sep 2026):** `Sport.category` ∈ physical (a sport) / esports / **board** (a board
  game), set per sport in League Setup. Decides the live scoring default (sport = points; esports
  and board = games won) and which sheet columns are on offer. Existing Chess / Billiards stay
  `physical` in the database until the Super Admin changes their type; their built-in scoring
  mode is games-won either way. League Setup also shows a read-only "Rules by type" card.
- **League Setup scoring rules (Sep 2026):** for a sport that scores by points, each card has a
  "Scoring rules" section — **point values** (one tap button each, e.g. 1, 2, 3), **period name**
  and **period counts allowed** — pre-filled with what is in effect (the built-in values for a seeded
  sport), and the same three fields on "Add a sport" (physical type only; an esport or board game
  is scored by games won and has none). Validated in `scoringFromBody()` (`routes/reference.js`):
  whole numbers 1–20, period counts only from 1, 2, 3, 4, 5, 7 (the start route accepts nothing
  else); an empty value = "use the built-in default" ("Use the defaults" button). Everything else
  (players on court, groups, draw format) is a fixed default — except a round-robin game's
  knockout size (Top 8 / Top 16), which has its own control in Registration and sets teams per barangay;
  `Sport.scoringMode / statTypes / onCourt` are DEAD (nothing reads them). `loadOwnedMatch` populates
  the rule fields — before that only `name` was loaded, so saved values were silently ignored by
  the organizer routes.
- **League Setup layout (Sep 2026, `SportConfig.jsx`):** two tabs — **Games** and **Barangays** (a
  simple `TabBar`; there is no Tabs primitive). Games = a row of game pills + "Add a game", and ONE
  editor (`SportEditor`) for the selected game with three sections — Registration (division chips,
  entry-format cards), Scoring (type, then point values / period name / period counts, or a
  "games won" note) and After-match score sheet (chips + "Add your own") — and ONE "Save changes"
  button. Divisions / entry format are saved first (the server refuses them once teams have
  registered). **Applied immediately, not with Save:** the game's Type and adding / removing a custom
  column, because they change what the rest of the form offers; unsaved sheet ticks are saved first.
  "How each type is scored" is a collapsible reference. The Barangays tab has a search box and a
  3-column grid. It went from ~6,400px of scrolling to ~900px. **Verify layout by rendering:** run a
  mock `/api` on a spare port and your own Vite copy pointed at it (never the running backend on
  5000 / dev server on 5173), then drive headless Edge over the DevTools protocol.
- **Custom score sheet columns (Sep 2026):** the Super Admin can invent a column for one sport —
  e.g. "Spikes" for volleyball — from "Add your own" under the score sheet picker
  (`Sport.customStats: [{key, label}]`, max 12, 24 characters). The server derives the key
  (`x_` + slug, so it can't collide with a built-in column or hold characters Mongo rejects) and ticks
  the new column on the sheet; removing it unticks it. Values are stored under
  `PlayerMatchStats.extra` like every non-original column; the header over the input is the first
  5 letters of the name, upper-cased. Not shown on the public pages.
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
- **A date picked without a time is "no time set"** — stored as midnight MANILA
  (`parseManila`). `hasTime()` in `lib/dashboardFormat.js` treats ONLY midnight Manila as no
  time. **Never treat midnight UTC as "no time"** (fixed Sep 28 2026): it used to, for older
  date-only data, but midnight UTC IS 8:00 AM Manila — so every game really set for 8:00 AM
  showed as TBD on the public site while the admin showed 8:00 AM. (A date-only match left over
  from before `parseManila` now shows "8:00 AM"; re-saving its date fixes it.) Use `hasTime`,
  don't re-derive it — `OrganizerScoring.jsx`'s `timeOf()` had its own copy of the bad rule.
- **Round labels on every match list (Sep 28 2026)**: `roundLabels(matches)` in
  `backend/src/lib/roundLabels.js` returns `roundLabel` ("Round 2", "Winners Round 1" / "Losers
  Round 1" — numbered within that group's bracket, "Round of 16" / "Quarterfinals" / "Semifinals" /
  "Final" by games in the knockout round, "3rd place", "Playoff" / "Playoff decider"). Added to
  `publicMatch()` (/overview, /matches, /bracket) and `/api/stats/organizer-dashboard`; it needs
  the whole tournament's matches, so compute it over the full list, never per match. Shown via
  `matchContext()` (public), Barangay Matches and Organizer home. `FixtureRow`'s context line
  wraps to 2 lines (was truncated — the round, last on the line, got cut on a phone).
- Day comparisons run in Asia/Manila time via `config/time.js` (fixed —
  Render's server-local time is UTC, 8h behind Kolambugan).

**Unavailable team = FORFEIT** (confirmed). No reschedule/re-pair.

**Also recorded per match:** each player's points / fouls / rebounds / assists (basketball) or
role (esports) plus the MVP — entered AFTER the match on the Player stats form
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
Sport          name, category ∈ {physical, esports, board}, tournamentFormat,
               divisions[], entryFormat, pointValues, periodLabel,
               periodOptions  ← editable scoring rules (League Setup); empty =
               built-in default (lib/sportRules.js)
               scoreSheet[]  ← the after-match player form's columns, edited
               in League Setup; absent = built-in default
               customStats[{key,label}]  ← columns the Super Admin added
               knockoutSize ∈ {8,16}|null  ← round-robin sports only, set in
               League Setup; Top 8 = 1 team per barangay, Top 16 = 2
               (scoringMode, statTypes, onCourt, teamsPerBarangay,
               numGroups, `isDivided`: kept on the model, nothing
               edits them — scoringMode/statTypes/onCourt/isDivided are not read)
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
PlayerMatchStats  match, player, points, fouls, rebounds, assists, role,
                  extra{}  ← blocks / steals / kills… (any other sheet column);
                  unique(match, player); written by the organizer on the
                  post-match score sheet (role = esports only)
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

- **Season clean-up (Sep 2026, storage on the 512 MB free Atlas tier)**: Season history
  shows "Clean up" on a COMPLETED season that is no longer the current one (`GET`/`POST
  /api/seasons/:id/cleanup`, sets `Season.cleanedAt`). Removes that season's residency
  documents (GridFS + records) and reference list; player photos only if ticked. Keeps
  teams, rosters, results, stats, champions. Irreversible. Files are what fill the quota
  (dev: 24 documents = 12 MB; all non-file data < 1 MB), so this is the lever — not
  deleting seasons, which still has no route (and would orphan data, see GOTCHAS).
- **Deleting a game (Sep 2026)**: `DELETE /api/sports/:id` still refuses while any
  team / tournament / organizer references it in ANY season. League Setup's "Remove game"
  checks `GET /api/sports/:id/history` first and, if anything is attached, offers
  "Delete with its history" (`POST /api/sports/:id/purge`, body `{confirm: <exact name>}`):
  erases the sport's teams, roster links, players on no other sport's team (+ documents,
  photos), tournaments, matches, PlayerMatchStats, organizer account(s), then the sport.
  Champions untouched (free text). Refused while a CURRENT-season match of it is `ongoing`
  (a past-season match stuck `ongoing` is abandoned and ignored). Irreversible.
- **League structure is frozen while the season is `ongoing`** (Oct 3 2026, Super Admin report:
  Mobile Legends, with results, was purged mid-tournament). `lockedWhileOngoing()` in
  `routes/reference.js` returns 409 on: add a game (`POST /api/sports`), delete a game (`DELETE
  /api/sports/:id` AND `/purge`), add / rename / delete a barangay, and the cross-barangay toggle
  (`/barangays/:id/cross` and `allowsCrossBarangay` on `PATCH /barangays/:id`). Registration and
  verification are finished by then; the toggle re-screens every player and could reopen verified
  teams mid-tournament. League Setup (`SportConfig.jsx`, `useSeason`) shows an amber lock notice
  and disables / hides those controls. Unlocks at `completed` (or a new season). Editing a game's
  scoring rules, score sheet or name, and barangay logos, are NOT locked.
- **Everything a role works in is CURRENT-SEASON scoped** (`getCurrentSeason()`), and a new
  season must look empty to every role. `GET /api/organizer/matches` was missing it until
  Sep 2026 (showed last season's matches after a new season). Any new list of teams /
  tournaments / matches needs a `season` filter; only `/api/tournaments/by-sport` and
  `/api/teams?sportId=` span seasons, on purpose (orphan clean-up).
- **Printing admin pages**: `AdminLayout` hides its sidebar/header/season strip under
  `print:`. Never put `break-inside: avoid` on a whole table/card that can be taller than
  a page — it moves to the next page and leaves a blank one (the Reports page-1 bug).
  Avoid breaks on rows instead.
- **Season page (Sep 2026, reworked)**: header + stepper, a **"Ready to move on?"**
  checklist for the specific next step (`lib/seasonReadiness.js`, fed by the dashboard
  payload), an advance dialog listing "what changes" + unfinished items with "Move on
  anyway" (soft, not a block; sends `expectedNext`), and season history from
  `GET /api/seasons`. **What the season stage really controls** (verified in the
  backend, updated Sep 2026): registration — create team / add-remove player / CSV import / submit
  roster need `registration_open` (exception: during `verification`, a team the Super Admin
  rejected a player from may add/remove/import/resubmit until it resubmits — `requireRosterWindow`)
  — and the Review Queue verdicts (approve / reject / verify) plus
  "reopen a verified team" need `verification` (the queue is VIEW-ONLY at every other stage).
  Bracket generation and scoring are NOT gated by stage, so nothing stops a
  premature advance except that checklist; keep the "what changes" copy to what is
  enforced, and add new readiness rules in `buildReadiness()`.
- **Super Admin dashboard (Sep 2026, reworked)**: season tracker + a **"Needs your
  attention"** to-do list built by `buildAttention()` in `AdminDashboard.jsx` (only real
  items; each links to where it's fixed — add new rules THERE), four moving tiles, a
  Registration card (team pipeline + barangay participation), a Competition card (per sport
  and division: verified teams and bracket progress, flagging divisions with verified teams
  but no bracket), today's games. Data: `GET /api/stats/dashboard` (old fields kept;
  batched queries — keep it that way). Player figures are roster ENTRIES (what screening
  works in); barangay "cleared" = a verified team in every sport/division slot.
- **Barangay Admin + Organizer dashboards and the season indicator (Sep 2026)**:
  both roles land on a Dashboard tab (`/brgy/dashboard`, `/organizer/dashboard`;
  `/brgy` is still My Teams and `/organizer` still the scoring screen). Data comes
  from `GET /api/stats/brgy-dashboard` and `/organizer-dashboard` (batched queries;
  Manila days for the organizer's schedule buckets: today / overdue / upcoming /
  awaiting a date / not ready). Barangay player counts are ATHLETES (name + birthdate)
  counted once by their most advanced team, so verified + under review + drafts =
  registered. The season stage shows as a header pill (plus a phone-only strip, which
  the scoring screen disables with `seasonStrip={false}`) and as a five-step tracker
  with role-specific wording in `SeasonStatus.jsx` — edit `GUIDE` there when a
  stage's meaning changes. `useSeason`/`SEASON_STAGES` are in `lib/season.js`.
- **Dashboard stat tiles never clip their number (Sep 2026, `StatTile` in
  `components/DashboardBits.jsx`, shared by all three dashboards).** On a ~360px
  phone the 2-column grid left ~74px beside the icon; "893/1084" (no wrap point)
  needed ~100px and the Card's `overflow-hidden` cut the last digit. Now below
  `sm` the icon sits ABOVE the text (full tile width for the text), and the
  number's font-size is `min(20/24px, 100cqi / (chars × 0.64))` inside an
  `@container`, so it keeps its normal size and only shrinks for a value that
  wouldn't fit. Rendered at 320/360/414/1024/1440 with values up to
  "12345/67890": nothing clips, sub-labels at most 2 lines, desktop unchanged.
- **Accounts page (Sep 2026)**: header with counts, "Add account" (a dialog) and
  "Provision all", search + filter chips (role, "Needs password change"), and rows that
  are a grid on desktop and a two-line card on a phone — no table that scrolls sideways.
- **No self-registration anywhere.** All accounts are provisioned.
- Super Admin **Accounts panel**: lists all accounts by role with their
  password status; "Provision all" fills any missing barangay-admin /
  organizer accounts; "Add an account" for anything else (e.g. a second
  super admin); per-account "Reset password" (barangay_admin/organizer always;
  super_admin only until they've changed their own password — see below);
  guarded delete.
- **A Super Admin's password can be reset by a peer only up until they change
  it themselves; after that, never — and no account can delete itself (Sep
  2026, revised Sep 2026).** `POST /api/accounts/:id/reset-password` 409s
  when the target is `role: 'super_admin'` AND `mustChangePassword` is
  already `false` (they've logged in and set their own password) — the
  button in `Accounts.jsx` stays enabled/visible up to that point (e.g. right
  after a peer provisions a new Super Admin account, or a temp password gets
  lost before first login) and then renders disabled with an explanatory
  tooltip. `mustChangePassword` defaults `true` on every new account
  (including a freshly-provisioned Super Admin), so a newly created Super
  Admin account is resettable by a peer until its first real login — from
  then on the Super Admin manages their own password entirely (change-password
  / recovery code, both from their own profile panel); a peer resetting it
  after that would silently override a password only the owner chose.
  `DELETE /api/accounts/:id`
  409s when the target is the caller's own account (`req.user.id`) — e.g.
  `sk_federation` can delete `lydo_head` but never itself, even mid-session —
  stacked with the existing "can't delete the last super admin" guard.
- **Temp passwords are shown exactly ONCE**, at creation or reset — bcrypt is
  one-way, so they cannot be retrieved later. The Super Admin copies and
  distributes them (Messenger/text). Copy button copies the password only.
- Passwords are **randomly generated per account** — never a predictable
  pattern. Usernames may be the barangay/sport name (usernames are not secrets).
- **Force password change on first login** (`mustChangePassword`).
- **Every password field has a show/hide eye button (Sep 2026)**:
  `components/PasswordInput.jsx` (`PasswordInput`, same look as the login
  page's own eye button; the eye is out of the tab order) plus
  `PasswordMatchHint`, a live "Passwords match" / "Passwords don't match
  yet" line under each confirm field. Used on the first-login Change
  Password page, the profile panel (change password + recovery code) and
  forgot-password. Use `PasswordInput` for any new password field.
- **Delete is guarded**: refuses if the account has entered any match result
  (would orphan the `enteredBy` audit trail) and refuses to delete the last
  super admin.
- Real security = JWT + RBAC middleware + bcrypt + **rate-limited login**.
  plus frontend route guards (`RequireRole`) — the API also rejects
  unauthorized calls regardless, so there is no gap even if a guard is missed.
- Token expiry is 8h; an expired token now redirects to login — a 401 handler
  in `api.js` clears the session and redirects (previously showed
  "Authentication required" with no redirect).
- **Profile panel + Super Admin account recovery (Sep 2026).** The header
  avatar/username (`AdminLayout.jsx`, all three roles) opens `ProfilePanel.jsx`
  — a right-side `Sheet` (`components/ui/sheet.jsx`, new, modeled on the
  existing `dialog.jsx`) with a "Change password" form (reuses
  `POST /api/auth/change-password`) for everyone, plus a Super-Admin-only
  "Account recovery" section. That section generates a **recovery code**
  (`POST /api/auth/recovery-code`, requires the current password, `super_admin`
  only) — `generateRecoveryCode()` in `config/password.js` makes an
  unambiguous-charset `XXXX-XXXX-XXXX-XXXX` code, shown **exactly once** in the
  response (same "shown once" rule as a temp password); only its bcrypt hash
  is stored (`User.recoveryCodeHash`/`recoveryCodeSetAt`, new fields — needs a
  full server restart the first time). Generating a new code replaces the old
  one; each Super Admin's code is independent. On the login page, "Forgot your
  password?" opens a dialog (`ForgotPasswordDialog` in `Login.jsx`) that posts
  username + recovery code + new password to `POST /api/auth/forgot-password`
  (PUBLIC, no token — this IS the "I can't log in" path; rate-limited tighter
  than login itself, 5/15min). Scoped server-side to `role: 'super_admin'`
  rows with a code set; wrong username/role/code all return the same generic
  "Invalid username or recovery code." **One-time use**: a successful reset
  clears `recoveryCodeHash`, so a leaked code can't be replayed — the admin
  generates a fresh one from the profile panel once back in. Exists because
  the two Super Admin accounts have no one above them to reset a forgotten
  password the way a Barangay Admin/Organizer does (the Super Admin's
  Accounts-panel "Reset password"). **`SheetContent` scrolls its body, not the
  whole frame**: the close (X) button is pinned outside the inner
  `overflow-y-auto` wrapper — a taller-than-viewport panel (e.g. right after
  revealing a recovery code) used to overflow with nothing to scroll it into
  view, which is exactly why a just-generated code went unseen; fixed once,
  applies to every `Sheet` use, not just this panel.
- **Profile panel slide lag — MEASURED and fixed (Sep 2026, took three passes).**
  Measured on a production build with a mock API, headless Edge at 390px and 6x
  CPU throttle, recording long tasks + frame gaps while tapping Profile (scripts
  were in the session scratchpad; recreate the same way if it regresses). Three
  causes, all main-thread work on the frame the slide starts:
  1. **Auto-focus.** Radix focuses inside the Sheet on mount; any `focus()` forced
     a synchronous layout (~185ms). With no photo the target was "Current
     password", which also popped the phone keyboard. `onOpenAutoFocus` now
     cancels it and focuses the panel itself 260ms later (after the slide).
  2. **Modal side effects.** A modal Radix dialog locks scroll, aria-hides the
     page and sets `pointer-events: none` on `<body>` right after mount; each
     forces a whole-page style recalc (~150-190ms follow-up task). The profile
     Sheet is now `modal={false}` with `SheetContent lightBackdrop` (a plain
     backdrop wrapped in `SheetPrimitive.Close`, so a tap closes it; `touch-none`),
     and the Sheet body has `overscroll-contain`, so a drag on the panel doesn't
     scroll the page. Escape still closes it. Verified: backdrop tap closes, page
     doesn't scroll on drag, focus lands inside.
  3. (earlier) the profile fetch is deferred 220ms, see the next bullet.
  Result: blocking at open ~250ms → ~60ms (single task), worst frame gap
  234-300ms → 83-100ms, same for all three roles (Super Admin was 550-1000ms).
  `lightBackdrop` is opt-in, and every other Dialog/Sheet is still modal. If
  another dialog feels laggy on phones, it's likely the same modal cost.
- **Mobile open-lag fix (Sep 2026).** Opening the panel used to fire its `GET /api/auth/profile`
  fetch (which flips `AvatarUpload`'s `hasPhoto` and swaps in a new avatar image) at the exact
  instant the Sheet's ~200ms slide-in transition started — on lower-power phones that fetch/
  re-render/image-decode competed with the CSS animation for the same frame budget and read as
  stutter. The fetch is now deferred 220ms (until the transition settles), and the profile/header
  avatar `<img>`s got `decoding="async"` so decode doesn't block the main thread either.
- **Profile picture, all three roles (Sep 2026).** `User.photo` (GridFS id in
  the `photos` bucket — same bucket player headshots use; new field, needs a
  full server restart). `AvatarUpload` in `ProfilePanel.jsx` reuses the
  Barangay Admin logo uploader's exact pattern (`ImageCropDialog`,
  hover-to-change, crop-before-save) with `cropShape="round"`.
  `POST`/`DELETE /api/auth/profile/photo` (self only) upload/remove it;
  `GET /api/auth/users/:id/photo` serves it back PUBLICLY (no auth — a staff
  avatar isn't sensitive the way a residency document is, same call as public
  player photos). `AdminLayout`'s header avatar (`HeaderAvatar`) shows the
  real photo when set, falls back to initials on a 404, and refreshes right
  after the profile panel closes (a version counter bumped on close) so a
  just-uploaded photo appears without a page reload.

---

## Design system (two looks, one product)

**Public Viewer — DARK, "ESPN structure" (decided Aug 2026):**
- **CURRENT PALETTE = steel-blue navy + YELLOW accent (Oct 1 2026, Super Admin's "new UI
  sample for web" — an esports dashboard). Supersedes the navy/gold hex values in the bullets
  below (kept as history).** Same day, a purple/indigo + violet version (from a "UI color sample")
  shipped first and was rejected as "looks bad" — don't bring it back. Values used across every
  public file: page `#0B1626`, footer `#070F1C`, panel/card `#122036`, bar/chip `#172840`,
  border `#22344F`, strong border `#2E4466`, accent yellow `#FACC15` (hover `#FDE047`, pressed
  `#EAB308`) — yellow BUTTONS carry dark `#0B1626` text, as in the sample. Hero fallback
  `#0E2340`, scrim `rgba(11,22,38,…)`. Also `PUBLIC_CHROME` (`lib/themeChrome.js`), `index.html`'s
  pre-React colour, `.scrollbar-public`. `PublicLayout` paints two faint radial glows (blue top,
  sky right). **Gold `#F5A524` stays ONLY for medal / 1st meaning**: bracket Champion card
  (`CARD_TONE.gold`), Standings 1st (`MEDAL[1]`), Champions "Most titles" #1, Players rank 1,
  Basketball's own colour in `SportGrid`.
- **Match display = VS ROWS, one game per row (Oct 1 2026, Super Admin: "keep the vs UI, I like
  it… 1 row just like the picture… put it in the home page")**. ONE shared component,
  `components/VsMatch.jsx` (`VsMatchRow`, `VsMatchList`), used by `Matches.jsx` (every tab) and
  `Home.jsx` (Live now, Today, Coming up, Recent results) — change it there, not per page.
  Layout: `[crest][angled name banner]  time|score  [banner][crest]`; the banner is a BLUE gradient
  (`#1D4ED8`→`#3B82F6`, slanted toward the centre via `clip-path`) with a light strip under the
  name; the RIGHT strip carries the round, the left strip is a plain bar. **Sport · division sits
  in the CENTRE, above the time / score** (Oct 1 2026, "make it a little bigger to be visible"):
  bold uppercase 13px (11px, two lines on phones), lifted clear of the score (`-mt-2 mb-4`, phones
  `-mt-1 mb-3`); rows are `gap-7 sm:gap-9` apart so a label never reads as the row above's. The Matches competition headings no longer
  repeat the venue ("Billiards · Open · 12 games") — each row shows it under the VS. Upcoming: time in Anton + "VS"
  (Home shows the date there when `showDate`); no time → "TBA". Finished: winner green / loser red
  score, loser banner grey + crest greyscale, green "WON" chip under the winner's crest. Set
  scores sit under the row. NEVER a 2-3 column grid — rows stack, centred, `max-w-5xl`.
  Phones (<sm): crest ABOVE its banner, strip text hidden (a thin bar), names 12px — at 390px the
  side-by-side version broke names mid-word. The same-day clean-card grid and the purple banners
  were both replaced. Home no longer uses `FixtureRow` / `ScoreStrip` (still exported, unused by
  Home/Matches).
- **VS rows show the VENUE under the time / VS, BOLD** (Oct 1 2026, Super Admin: "visible and
  bold"): centre column of `VsMatchRow`, `font-bold text-slate-100`, 11px / 13px, with a yellow
  map-pin icon, 2 lines max.
- **The WHOLE public viewer is GLASSMORPHISM** (Oct 1 2026 — tried on Standings first, then
  applied everywhere). `PublicLayout` renders `GlassBackdrop` ONCE (PublicUI.jsx: three FIXED
  blurred glows — blue, yellow, sky — glass needs colour behind it); `main` and `footer` are
  `relative z-10` above it, the header is `bg-[#0B1626]/70 backdrop-blur-xl`, the footer
  `/85` + blur. `Panel` is glass BY DEFAULT (`glass={false}` = the old solid panel):
  `rounded-2xl`, `bg-white/[0.05]`, `backdrop-blur-xl`, `border-white/[0.12]`, inset top highlight
  + soft shadow; skeletons match. Dividers / inner borders are `border-white/[0.08]` (was
  `#22344F`). Other surfaces: Home stat tiles, Champions cards, Matches tab bar, search input =
  glass WITH blur (few of them). **Repeated small items — bracket match boxes, Players cards,
  DateBar, placeholders — are translucent `bg-white/[0.03-0.05]` WITHOUT their own blur**, on
  purpose: they sit on an already-blurred panel, and dozens of `backdrop-filter`s on one page lag
  a phone (the admin dialog blur was removed for exactly that). Keep that rule for new UI.
- **Screenshotting public pages with scroll reveals**: plain `msedge --screenshot` leaves every
  `Reveal` at opacity 0. Drive Edge over CDP (Node's global `WebSocket`), scroll the page, inject
  `[style*=opacity]{opacity:1!important;transform:none!important}`, then
  `Page.captureScreenshot` with `captureBeyondViewport` + `clip` — don't resize the viewport to
  the page height, the Home hero is `100svh` and grows with it.
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
  time + venue on the LEFT and the two teams stacked with crest slots. This is
  the shared `FixtureRow` + `DateBar` in `PublicUI.jsx` (Sep 2026; before that
  Matches/Home used a one-line "A vs B" row that cut names to "Ku…" on a phone).
  Finished/live games use the shared `ScoreStrip`. Don't write per-page copies.
- **Public text sizes (Sep 2026, "it's kinda small"):** body/team names 15-16px,
  no label under 12px, panel titles 17px, page titles 28px, scores 24px. Tab rows
  are the shared `TabRow` (15px). Keep new public UI at or above these.
  **Exception: the header navs keep their ORIGINAL sizes** (desktop links 13px;
  phone icon bar 22px icons, 9px captions, which truncate slightly at 360px). They
  were enlarged in the same pass and the Super Admin asked for them back as they
  were. Don't resize them again without asking.
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
  — **a RevealItem that mounts after its group has already revealed animates on its
  own** (`RevealGroup` tells items via context): items only inherit "visible" from the
  group's ONE-SHOT trigger, so without this a search that removed and re-added cards left
  them stuck at opacity 0 (Sep 2026 bug; keep it if you touch Reveal.jsx). Any scroll row
  using them should be `overflow-x-auto overflow-y-hidden`, or the 24px offset makes a
  vertical scrollbar
  for card grids. **Always plays — it deliberately IGNORES prefers-reduced-motion** (Super Admin decision, Sep 2026: a Windows PC with "Show animations" off saw a static site and assumed it was broken; to restore, wrap the app in `<MotionConfig reducedMotion="user">`). It
  REPLACED the older CSS `Reveal` in `PublicUI.jsx` (and `hooks/useInView.js`,
  deleted). **Rules because the public pages poll for live data:** `once`
  everywhere; key list items by stable id (`t.id`/`p.id`; the API's field is
  `id`, not `_id`), never index; NEVER wrap live score strips, the LIVE NOW
  tile, or in-progress match cards. Wrapped: Home (two static stat tiles,
  Today, Coming up, About-league, Kolambugan, Recent results), Standings (each group
  table), Brackets (each PANEL — Knockout + groups — not the round columns:
  the SVG wires are measured from box positions, so the boxes must move
  together with the stage), Teams (each row as ONE block; per-card stagger lagged, Sep 2026), Players (each team row as ONE block, like Teams — Oct 2026), About
  (every section). NOT wrapped: the hero, Home's LIVE NOW tile + "Live now"
  panel, Matches, Champions, TeamDetail. (Players' "Top scorers" list was REMOVED Oct 1 2026 — the Players page is rosters only; `/api/public/leaders` is still there but unused.)
  Card grids use per-card borders (`border-r border-b` inside an
  `overflow-hidden` wrapper with `-mr-px -mb-px`), not the old
  `gap-px bg-[#1C2430]` trick — with that, unrevealed cards showed as grey
  blocks. No hover animations, no page transitions, no springs.
- **Hero photo motion (Sep 2026, `components/HeroImage.jsx`)**: the `hero` Site Image
  fades in + settles once LOADED, drifts slowly (zoom in/out ~44s) and parallaxes on
  scroll; the headline/copy stay static. Three nested layers, each owning one transform.
  Drift + parallax honour `prefers-reduced-motion` (the entrance always plays). Keep the
  parallax layer taller than the section (`-top-[15%] h-[115%]`, slides 13%) or a gap opens.
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
  it. **In that mode the JS must NOT re-measure/repeat the list** (fixed Sep
  2026: the wrapping static row made "copies needed" drift to reps+1 forever →
  React #185 → the whole Home page blank for anyone with reduced motion; it
  now stays at 1 copy, and reps are capped at `MAX_REPS`). Edge-to-edge via `w-screen ml-[calc(50%-50vw)]` — the technique banned
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
- **Login page (Sep 2026):** the "Kolambugan Sports" logo + name (and the phone logo) link to `/`, the public Home (Oct 2026). The desktop-only left brand panel uses React Bits
  **Gradient Waves** (`components/GradientWaves.jsx`, copied in per React Bits'
  copy-paste model, (c) David Haz, MIT + Commons Clause — keep the header
  comment; needs the `ogl` dependency). Layers: purple gradient (fallback) ->
  waves -> one text scrim. Only mounted at `(min-width: 1024px)` (a merely
  hidden panel would still create the WebGL canvas, so phones never load it),
  `React.lazy` into its own ~15.7 KB gzip chunk, frozen (`speed 0`) under
  `prefers-reduced-motion`. A photo layer was tried and removed (the Super
  Admin deleted `login-bg.jpg`).
- (Superseded Oct 2 2026 by the Depth Carousel, see the Players/Teams entry below; card styling still applies.) **Teams page — drag-scroll carousel of poster-card crests** (Sep 2026):
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
  every other `Crest` call site is untouched. **Performance (Sep 25 2026, "laggy"
  when the cards pop up):** each row reveals as ONE `Reveal` (never per-card
  `RevealItem`s: 20+ cards animating while their crests decode stuttered), and
  cover crests use `decoding="async"` + `loading="lazy"` with a blank tile (not the
  monogram) while the logo check is pending.
- **Match MVP on the brackets + flip player cards (Oct 3 2026).** The organizer's MVP pick
  (`Match.mvp`, after-match score sheet) now shows on every finished match: a "★ MVP" chip
  (`components/MvpBadge.jsx`, shared) at the bottom of the bracket match card / end of the
  round-robin fixture row, on the public `Brackets.jsx` (`tone="public"`, yellow) and the admin
  `Tournaments.jsx` (`MatchBox` + group match rows, `tone="admin"`, amber). Mouse hover opens a
  small card (photo, #jersey + name, team, that match's points, "Season stats →" to the team page);
  touch = tap. Data: `/api/public/bracket` adds `mvp` per match via `bracketMvps()` in
  `routes/public.js` (2 batched queries for the whole bracket: TeamPlayer for the side,
  PlayerMatchStats for the points); the admin `/:id/matches` and `/:id/bracket` just populate
  `mvp`. `mvpCountMap()` adds `stats.mvps` (times named MVP this season) to `/api/public/players`
  and `/teams/:id`; the Team page has an MVP column. **Player cards FLIP** (`PlayerCard` in
  `Players.jsx`): tap the front card → the back shows games played, points, MVP awards; tap the
  back → `/teams/:id?player=<id>`, which highlights that roster row (yellow bar) and scrolls to it
  (instant, not smooth: Lenis). The carousel still swallows taps on SIDE cards, so only the front
  card flips. The front card lost the "PTS · GP" chip (it's on the back now) and gained a "★ MVP"
  badge when they have one. Icons on public pages are inline SVG (`StarIcon` exported from
  MvpBadge), never lucide. Rendered at 1366 / 390 against a proxy over the real API that injected
  MVPs (the dev DB has none recorded yet).
- **Players AND Teams pages = a DEPTH CAROUSEL per panel** (Oct 2 2026, Super Admin wanted to try
  React Bits' "Depth Carousel"; replaces the drag-scroll rows below). Players: one per team. Teams
  (same day): one per sport + division, `TeamCard` fills the slide, `renderTeam` is module-level
  (stable). Both take their sizes from ONE place, `posterCarouselProps(wide)` in
  `lib/posterCarousel.js`: change it there so the pages stay in step. More than 15 items (`maxDots`)
  shows a "3 / 26" counter instead of dots (26 dots wrapped into 3 rows on a phone).
  `components/DepthCarousel.jsx` is the React
  Bits component adapted: takes `renderItem` (any card, not just images), a small rAF tween instead
  of GSAP (no new dependency), ONLY a horizontal wheel/trackpad swipe moves it (vertical wheel
  scrolls the page, the original hijacked it), a click right after a drag is swallowed, a click on
  a side card brings it to the front (the front card's link works). Front card faces you, the rest
  stack back to the right, darker (`falloff` 0.13). Desktop 270x360 + arrows, NO blur; phones
  (<640px) 250x333 using the full width (`sidePadding={0}`: the shrink-to-fit used to reserve 120px
  for arrows phones don't have, so the card came out 172px), spread 34, no blur, and ARROWS since Oct 3 2026 (Super Admin
  request: `showControls: true` everywhere, 36px, `left-0.5`/`right-0.5`, over the card edges, with
  `sidePadding` still 0 so the front card stays 250px). Dots
  below. Rendered at 1366 and 390px against the production API.
  **Phone performance — measured, keep these rules** (Oct 2 2026, "laggy on mobile"; 390px, 4x CPU
  throttle, touch swipes on a 10-card Basketball row; script `perf.mjs` was in the session
  scratchpad): old 39-49fps with 12-62 frames over 50ms per test → now ~60fps, 0 over 50ms.
  (1) Moving it NEVER re-renders React: dots + `aria-hidden` are written to the DOM (`paintActive`),
  the cards are `useMemo`'d, and `renderItem` must be a STABLE callback (`useCallback` in
  `TeamRow`), or every card re-renders on each swipe. (2) Back cards are darkened by a plain black
  overlay's OPACITY, never `filter: brightness()` or `mix-blend-mode` (both repaint every frame).
  `blur` is a filter: keep it 0 on phones. (3) Off-stage cards are `visibility: hidden` and skipped.
  (4) A drag paints at most once per frame (rAF). Measuring gotcha: with touch emulation on, a
  synthetic mouse click on the sport tab is ignored (you silently measure Badminton's 2-card rows);
  click from page JS and check the subtitle says 520 players.
  **Desktop performance — measured, keep these rules too** (Oct 2 2026, "laggy on desktop, and
  scrolling drops fps"; 1366x900, 4x CPU throttle, wheel-scroll + arrow clicks, `perf-desk.mjs`):
  page scroll went from 22-34fps (freezes up to 1.3s) to ~45-55fps; other public pages do 56-60.
  (5) NO `blur` on desktop either (a blur filter on each moving card was the biggest cost, ~+15fps
  when removed). (6) The carousel panels use `<Panel blur={false}>` (new prop: the glass tint without
  the desktop `backdrop-blur`, i.e. what phones already get); a backdrop blur under moving 3D cards
  cost ~5-10fps on scroll. (7) The darkening overlay gets its own layer (`will-change: opacity`, set
  in `layout()`), or changing its opacity repaints the whole card every frame. (8) Cards are layers
  (`will-change`) only while on stage; off-stage cards drop it. (9) Cards more than visibleCards+3
  from the front get `content-visibility: hidden`: every card sits at the same spot on screen, so
  otherwise the browser loads + decodes ALL of a panel's images at once (26 x 768px barangay logos
  per Teams panel). (10) No big box-shadow on the cards. Measuring gotcha: results swing a lot with
  whatever else the PC is doing (the user's own Chrome) — compare old vs new by ALTERNATING runs in
  the same minutes, never against numbers from earlier.
- (Superseded Oct 2 2026 by the carousel above; card styling still applies.) **Players page = poster cards like Teams, BIGGER** (Oct 1 2026, `Players.jsx`): one drag-scroll
  row per team (`TeamRow`, same arrows/scroll logic as Teams' `TeamGroupPanel`) of `PlayerCard`s —
  `w-52 sm:w-60` (teams are `w-44 sm:w-48`), `aspect-[3/4]`; the headshot fills the card (no photo →
  big Anton initials on a navy gradient), jersey # (yellow Anton) + SURNAME + first name + a
  "15 PTS · 3 GP" chip on a dark bottom scrim. Card links to the team page. **Opens on the FIRST
  sport tab** (it used to force Basketball, skipping Badminton which sits first).
- **Teams cards = Players cards** (Oct 1 2026): `TeamCard` is `w-52 sm:w-60`, SURNAME-style bold
  uppercase name (19px), same scrim as `PlayerCard`. Keep the two in step.
- **Public PERFORMANCE pass (Oct 1 2026) — measured, keep these rules.** Headless Edge over CDP,
  4x CPU throttle, 390px, long tasks (>50ms); scripts `perf.mjs` (scenario tab / idle / scroll) and
  `prof.mjs` (CPU profile of a click) were in the session scratchpad — recreate if it regresses.
  Before → after: Matches sport switch 1.8s freeze, NO skeleton → skeleton in ~0.1s, worst task
  ~0.1s; Matches idle (polling) 4s of freezes per 23s → 0; Home idle → 0; Players scroll 188ms → 0.
  1. **Never build an `Intl.DateTimeFormat` (or call `toLocale*String` with options) per item in
     a list.** Matches' `manilaDay()` did, ~400 matches x several calls = **2.4s of CPU** — the real
     cause of the tab-switch freeze. Formatters are module-level constants now: `MANILA_DAY`
     (Matches), `DATE_LABEL`/`TIME_LABEL` (PublicUI `matchDateLabel`/`matchTime`), `DAY_KEY`/`HM`
     (`lib/dashboardFormat.js` `dayKey`/`hasTime`, shared with the admin dashboards). Same output.
  2. **Polls skip identical data**: Home, Matches, Standings, Brackets keep the last response as
     text (`last` / `lastRef`) and don't `setState` when it's unchanged; a FAILED poll keeps what
     is on screen (it used to blank the page on one dropped request).
  3. `VsMatchRow` is `memo`ed on the match's content (JSON compare) and draws ONE crest
     (`variant="cover"` in a CSS-sized box, `coverText`) — it used to render two and hide one.
  4. Matches: the tab click sets `loading` in the SAME handler (`VsMatchSkeleton` shows next
     frame); days render 2 at a time (`DAYS_STEP`, "Show more days"), 4 games per competition
     before "Show all"; day sections and the long Players / Teams panels use
     `[content-visibility:auto]` (Panel has a `className` prop for it).
  5. `Crest` keeps the resolved logo set (`logoSet`) so crests mounted later render right the
     first time (no monogram flash, no second render per crest).
  6. Glass cost: `GlassBackdrop` is radial gradients (no `blur()` filters); panel / card blur is
     `lg:` only (phones get a slightly stronger tint — over a soft gradient the blur was nearly
     invisible anyway); header blur is light below lg; footer has none.
- **Champions pages (Sep 29 2026)**: public `/champions` is a card grid per year
  (16:9 photo, gold Anton year heading) + a "Most titles" panel (all sports, sticky at
  `lg`); photos open the shared zoomable `Lightbox` in gallery mode across every photo on
  screen. Super Admin Champions: stat tiles, search + sport chips, card grid per year,
  add/edit in a Dialog (photo preview is the upload control), photo → `Lightbox`.
  Card photos use `relative aspect-video` + an `absolute inset-0` img — a plain img
  inside an aspect box grows it to the image's own ratio.
- **Public brackets are compact below `sm`** (Sep 29 2026, `Brackets.jsx`): match /
  winner cards 168px (`w-42`, was 240px), 13px names, 18px crests, 20px column gap.
  Desktop unchanged; wires are measured, so nothing else needed changing.
  **The admin `Tournaments.jsx` tree uses the same phone sizes** (Oct 2 2026): `MatchBox`,
  `WinnerCard`, `SecondPlaceCard` are `w-42` below `sm`, 13px text, 20px column gap,
  `GlassPanel` padding `p-3`. Keep the two brackets in step.
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
  2026): **each team row shows a division badge** (`division` on every
  queue/verified team; boys sky, girls pink, added Sep 2026 because a
  barangay's two Badminton teams looked identical). `GET /api/review/queue` now also returns `barangays` (all 26,
  not just ones with a pending team), `totalPending`, `verifiedTeams` and
  `seasonStatus`. **Verified teams are viewable at ANY season stage (Sep
  2026 correction)** — the "Verified teams" card used to only render once a
  barangay was picked AND the season was in `verification` (so it existed
  purely for "Reopen for corrections"); that made a verified roster
  invisible the rest of the season, with no way to check its players against
  the Reference List. Now shown for "All barangays" too, and each row
  expands (same `openTeamDetail`/`PlayerRow` as the pending list above —
  `GET /api/review/teams/:teamId` already worked for any team status, this
  was purely a frontend gate) into its roster; clicking a player opens the
  same `PlayerModal`, which now takes an explicit `teamVerified` flag to show
  "This team is verified and locked — nothing here can be edited" and hide
  Approve/Reject outright (previously relied on the coincidence that every
  player on a verified team is already `eligible`, which happens to hide the
  buttons anyway, but didn't say WHY). Only the **Reopen** button itself
  stays gated to the `verification` stage (disabled + tooltip outside it —
  the backend enforces the same). The route runs a fixed handful of BATCHED queries — it used
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
- **Barangay chip row, mobile (Sep 2026):** the chip row above wrapped into several packed lines
  on a phone (26 barangays + "All"). Below `sm:` it's now `overflow-x-auto` — one swipeable row —
  and wraps normally from `sm:` up where there's room. `BarangayChip` got `shrink-0` so chips don't
  get squeezed to fit.
- **Collapsible explanations — `components/InfoHint.jsx` (Sep 2026):** a one-sentence summary
  that's always visible, plus a small "Details"/"Why" trigger (shadcn `Popover`) for the full
  explanation — replaces several `CardDescription`/`AlertDescription` paragraphs that used to sit
  on the page permanently across Review Queue, Reference List, League Setup, Site Images, and
  Season (Super Admin: "too much text information in all of our admins"). NOT used for a
  safety-critical warning sitting right before an irreversible action (the season-advance dialog,
  orphaned-tournament/team delete cards) — those stay fully visible; only the "why" mechanism gets
  tucked away where one already existed. Most `CardDescription`s were already a single short
  sentence and were deliberately left alone.
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
  added on mount and always removed on unmount. **The dark theme is Discord-style
  "ASH", not near-black (Sep 2026, Super Admin's reference)**: page
  `#323339`, raised surfaces (cards, header, sidebar, popovers) `#393a41`,
  hover/muted `#43444b`, text `#f2f3f5`, secondary text `#c7ccd3`, borders
  white 10%; brand blue `--primary` unchanged. (A first "ashy" pass at
  `#24272a`/`#2e3134` still read as dark mode.) If `--card` changes, also
  update `DARK_CHROME` in `lib/themeChrome.js` and the dark hex in
  `index.html`'s pre-React script. **Text brightened (Sep 24 2026)**: the first `#dbdee1`/`#b5bac1` text read as blurry/ashy on the grey; now `#f2f3f5` / `#c7ccd3` (hover text white), plus grayscale font smoothing under `.dark` — surfaces unchanged.
  **The light theme is deliberately soft (Sep 2026)** — a cool-gray page
  (`--background`), off-white cards (`--card`), never pure white, because the old
  white-on-white glared: change the tokens in `index.css`, not per-page colors, and put
  chrome (header, sidebar) on the card tone. Preference persists in
  `localStorage` under `brgy-theme:<userId>` — PER ACCOUNT (Sep 2026), not
  shared: it used to be one `brgy-theme` key for the whole browser, so a
  Super Admin choosing dark made the next Barangay Admin to log in on that
  browser get dark too. The old shared key is ignored. **Defaults to LIGHT when nothing is saved** (Sep 2026, Super Admin: newly created accounts kept opening in dark mode) — it used to follow the device's own dark setting. Dark is opt-in from the header toggle.
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
  **The organizer's LIVE scoring view (an open match) opts OUT (`animateTheme={false}` on its
  `AdminLayout` → instant swap); the organizer match list, its loading skeleton and the
  Dashboard animate like the other roles (Sep 2026).** A View Transition makes the page
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
  look is decided and out of scope. `--primary`/`--ring` were originally set
  to a richer indigo-violet (`oklch(0.53 0.26 285)`) so the converted pages
  read as a polish pass, not a re-brand. **Changed to blue (Sep 2026, Super
  Admin request — most of the admin UI read as violet)**: hue shifted from
  285 to 258 (Tailwind's blue-600/blue-500 family), lightness/chroma left
  alone so the palette's weight is unchanged, just the hue — `light --primary:
  oklch(0.53 0.26 258)`, `dark --primary: oklch(0.62 0.24 258)`, same shift
  on `--ring`/`--sidebar-primary`/`--sidebar-ring` in both themes (8 values
  total, all in `index.css`). This is the ONE source of truth for the admin
  brand color — every shadcn `Button`/focus-ring/sidebar-highlight across all
  three roles picks it up automatically via the CSS variable, no per-page
  changes needed. Also fixed `pages/ChangePassword.jsx`, which had hardcoded
  raw `indigo-*` Tailwind classes instead of the token (missed by the shadcn
  pass since it's a pre-login page) — now `blue-*` to match. **Deliberately
  NOT touched**: `components/DashboardBits.jsx`'s `violet` entry in
  `TONE_ICON` (one hue among seven used to visually tell stat tiles apart,
  not the brand color) and `ReferenceList.jsx`'s `purple` (the deliberate
  "informational only" under-15 same-name highlight — a status meaning, like
  green/red/amber, not decoration). Public Viewer is untouched either way —
  separate dark design, gold accent, never used shadcn tokens.
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
  **`DateTimePicker` (Sep 28 2026, "hard to input")**: calendar (month/year
  dropdowns, opens on the chosen date) + ONE time control, hour / minute / AM-PM
  native selects (`TimeSelect`, "--" until set; the Super Admin dropped the
  half-hour slot buttons) + Today / No time / Clear / Done. A Popover on desktop;
  below 640px a centred Dialog with 40px day cells and 16px selects (iOS zooms
  under 16px). "No time" = `T00:00`, same as before (`hasTime`).
  **Schedule rows keep their own unsaved values** (`ScheduleRow`, memo) in
  `Tournaments.jsx` (Sep 28 2026, "laggy"): kept in the section, every keystroke
  re-rendered all rows + pickers — measured 160-450ms per letter on a 150-match ML
  group stage at 4x CPU throttle, now ~60ms. Opening the picker (~550ms throttled)
  is react-day-picker + Radix positioning, the same as the old calendar-only picker.
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
- **Theme plumbing on phones (Sep 2026)**: `index.html` applies the saved theme BEFORE
  React (no bright first frame) — its logic mirrors `lib/theme.js`, keep them in step;
  first visit is LIGHT (Sep 2026 — no longer `prefers-color-scheme`), a saved choice wins. `color-scheme` is set on
  `:root`/`.dark` (native controls follow the theme). `lib/themeChrome.js` owns the
  `theme-color` meta (address-bar colour = the header colour of each theme; change both
  when the tokens change). The circular reveal only runs on a fine pointer — touch gets an
  instant swap. **Regex in `index.html`'s script got its backslashes stripped once — it uses
  no regex on purpose.**
- **The icon rail is DESKTOP-ONLY in effect (Sep 2026 fix)**: `AdminLayout` keeps the
  user's choice as `railPref` and only applies it when `min-width: 1024px` matches
  (`rail = railPref && isDesktop`). Before, collapsing at desktop width then narrowing the
  window/rotating a tablet opened the phone menu with every label hidden. The phone menu also
  has an X close button. Never read `railPref` directly for styling.
- **Sidebar collapse lag FIXED (Oct 3 2026, all three roles share it):** the `<aside>` used to be
  `lg:sticky` inside the flex row, so its 200ms width animation re-laid out and repainted the WHOLE
  page every frame (~14ms layout + ~18ms paint per frame at 4x throttle). It is now `fixed` at every
  width with `[contain:layout]`, and the content column reserves room with `lg:pl-64` / `lg:pl-16`
  that switches in ONE step (no transition). Measured (80-account Accounts page, 4x CPU, headless
  Edge + mock API): ~22 frames with 3 stutters per collapse -> ~31 frames with 1 (the single
  content reflow at the click). Don't put the sidebar back in the flow or transition the padding.
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
- **Sticky header (Sep 2026):** `AdminLayout`'s `<header>` is `sticky top-0` — this layout
  scrolls the whole page (not a constrained `main`), so an unpositioned header just scrolled away
  with everything else, losing access to the menu toggle / help / theme toggle / profile avatar
  without scrolling back up (mobile and desktop both had the gap).
  **z-index scale (Sep 28 2026)** — CSS variables in `index.css`, used as `z-(--z-header)`:
  `--z-sticky` 10 (sticky bits inside a page) < `--z-header` 20 < `--z-sidebar-backdrop` 30 <
  `--z-sidebar` 40 < `--z-overlay` 50 (Dialog, Sheet, Popover, Select — they portal to `<body>`)
  < `--z-toast` 60 < `--z-loading` 100. **`<main>` is `isolate`** (its own stacking context): the
  Season stepper's `relative z-10` circles tied with the old `z-10` header and, being later in the
  DOM, painted over it on scroll. Now nothing inside a page can rise above the header, whatever
  z-index it uses. The organizer's live score bar is therefore `sticky top-16` (just under the
  header; at `top-0 z-20` it used to cover the header). **Sidebar nav** keeps its scroll position
  across pages (`sessionStorage` `admin-nav-scroll` — every page mounts its own `AdminLayout`, so
  it used to jump back to the top and hide a low item like Reports), scrolls the current item
  (`aria-current="page"`) into view, has scroll shadows (`.scroll-shadow-y`), and is `lg:h-dvh`.
  Verified by rendering (mock API, headless Edge): no content over the header on Season /
  Dashboard / Review Queue / League Setup / Tournaments, light + dark, 1280x380 and 390x700; a
  popover forced over the header paints on top.
- **Dark/light toggle mobile perf (Sep 2026):** the circular-reveal View Transition was already
  skipped on touch, but the toggle still felt laggy on a phone — the REAL cause: flipping the `dark`
  class recomputes every CSS-variable color at once, and hundreds of elements carry their own
  Tailwind `transition`/`transition-colors` for hover states, which ALSO plays on that bulk
  recompute (it doesn't scope to `:hover`) — hundreds of elements cross-fading simultaneously.
  `.theme-switching, .theme-switching * { transition: none !important; }` in `index.css`;
  `handleThemeChange` adds that class to `<html>` right before the flip, removes it two
  `requestAnimationFrame`s later. Normal hover transitions are unaffected outside that window.
- **`DialogOverlay` has no `backdrop-blur` (Sep 2026):** `backdrop-filter: blur()` is one of the
  costliest CSS effects on a phone GPU, and it was on the ONE shared overlay every `Dialog` in the
  app uses — opening a dialog over a busy page (e.g. the Review Queue's player modal), or a SECOND
  dialog stacked on a first (the zoom lightbox opened from inside the player modal), paid that cost
  once or twice at once. Now plain `bg-black/30`, no blur — same visual weight, no compositing cost.
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
- **Review Queue near-miss breakdown (Sep 2026):** the player modal used to show only the static
  generic reason (e.g. "15 or under — needs parental consent and documents" / "Not found on the
  reference list…"), with no hint that a same-name candidate existed at all. `nearMissesFor(player,
  candidates)` (`services/prescreen.js`) is the ONE shared comparison — extracted so Reference List
  and Review Queue can't drift apart the way the minor near-miss did (see above). `GET
  /api/review/teams/:teamId` computes `nearMiss` per player (targeted indexed lookup, same pattern
  as `decidePlayer`) whenever they aren't a confirmed match — a `needs_document` minor, or a
  `flagged` adult with `flagBlock === 'not_on_list'` (a `cross_barangay` flag means they WERE found,
  nothing to compare). `ReviewQueue.jsx`: the row's `ReasonCallout` appends "— possible match on the
  list, details differ"; the modal's `MatchCallout` gets a field-by-field breakdown (`NearMissDetail`,
  same wording as the Reference List page's own near-miss). Super Admin only, same carve-out as
  Reference List's near-miss — this is the one place the list's real birthdate is allowed to show;
  `flagReason` itself is untouched and must never carry it (Barangay Admins see `flagReason` too).
  **Louder red+orange tone (Sep 2026 follow-up):** a near-miss minor rendered in the exact same
  plain amber box as any routine needs_document case, so a Super Admin skimming the queue could
  approve it off the uploaded document alone without noticing the name might not be this player.
  `NEAR_MISS_TONE` (red border, orange tint, red text) now OVERRIDES the status tone on both
  `ReasonCallout` and `MatchCallout` whenever `nearMiss.length > 0`; `NearMissDetail`'s roster-vs-list
  values are colored red (roster) vs orange (list); the action bar's caution note goes red and
  **Approve turns orange instead of green** for this case (title tooltip explains why) — not a hard
  block, a near-miss is still a judgment call for the document review, just impossible to miss.
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
- **Organizer Matches — start moment, live bar, list (Sep 2026)**: a match header (crests,
  names, division/stage, date/time/venue) shows in every state (the **Starting lineup** step was
  removed Sep 2026 with per-player scoring); Start is a big labelled button and, once it succeeds,
  a "Match started" message shows, the page scrolls to the top and the phone buzzes (15ms on
  score/undo). **The period count defaults from the sport's own `periodOptions`** (3 if offered,
  else the first) — it used to default to 1, so basketball (only option: 4) started as a
  ONE-quarter game. While LIVE on a phone a **sticky bar** (score, period, Undo) stays at the
  top because the scoreboard panel is below the scoring buttons (`lg:hidden`; desktop keeps the
  side panel). The list has To play / Completed tabs, a division filter, an Overdue section and
  stacked team names. If you touch this screen, re-render it at 390px — that's how these were found.
- **(REMOVED Sep 2026 — live scoring is now by team; see "SCORING IS BY TEAM" above. Kept as
  history.) Player rows redesigned for courtside speed** (Sep 2026): each on-court
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
- **No em dashes ("—") in user-facing sentences** (Super Admin request, Oct 2026): use a
  comma, colon, full stop, parentheses or " · " instead. Comments may use them; a lone "—" as an
  empty-value placeholder is fine.

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
- **Documents stay PRIVATE** — separate GridFS bucket, never a plain `<img src>` (no auth header).
  Served through TWO auth-gated routes, not one: `GET /api/teams/documents/:docId/file` (super-admin
  only, no ownership check needed — Super Admin can see any team's) and, since Sep 2026,
  `GET /api/teams/:id/players/:playerId/documents/:docId/file` (barangay_admin, `loadOwnedTeam`
  ownership check — same file, but only for a document on the caller's own team). Both routes are
  fetched with the token and rendered as a blob URL, shared code in `components/DocumentViewer.jsx`
  (`Lightbox` + `DocumentFrame`) — see the Documents-page bullet further down.
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
  - Residency documents: upload with docType, serve **super-admin (any team) or
    barangay-admin (own team only, since Sep 2026)** — see the "Documents stay
    PRIVATE" bullet above for the two routes.
- Barangay Admin **Document Submission** page (lists players needing docs,
  doc-type picker, upload, shows verify status). **Delete a wrongly-uploaded
  document** (Sep 2026): `DELETE /api/teams/:id/players/:playerId/documents/:docId`
  (barangay_admin, own team) + a trash-icon button on each `pending` document
  row. **Each document row is colour-coded by verify status (Sep 2026)**:
  a tinted row with a left border plus a badge (`VERIFY_ROW`/`VERIFY_BADGE`/
  `VERIFY_LABEL` in `Documents.jsx`): amber "Awaiting review", green
  "Approved", red "Rejected". Pending used to be a grey badge on a grey row.
  The Review Queue's document header uses the same colours. Delete is
  blocked once the SK Federation has already ruled on it (`approved`/
  `rejected` — the verdict is on record; ask the Super Admin to reopen the
  team) or once the team itself is verified and locked.
  **View a document (Sep 2026)**: an "eye" button on EVERY document row (not
  `pending`-gated like delete — viewing has no such restriction) opens a
  zoomable preview (`DocumentPreviewDialog` → shared `DocumentFrame`/
  `Lightbox` from `components/DocumentViewer.jsx`), fetched through the new
  ownership-checked `GET /:id/players/:playerId/documents/:docId/file` route —
  before this, a Barangay Admin could see a document's TYPE and verify status
  but never the file itself, so "should I delete and re-upload this" was a
  guess. Deliberately LAZY (fetches only on click), unlike the Review Queue's
  eager fetch-everything-on-open — this page can list many players/documents
  at once, and eagerly loading every thumbnail would risk the same "many
  concurrent fetch+decode" lag the Review Queue's own modal just got fixed for
  (see the Sep 2026 mobile-perf session in CHANGES.md). **Row overflow guard**:
  the label `<span>` needs `min-w-0 truncate` and the badge/buttons `shrink-0`
  — `Card` clips overflow by default, and without these a long label (e.g.
  "Parental Consent (15 and under)") on a narrow screen pushes the row past
  the Card's clipped edge, cutting the Eye/Delete buttons off entirely rather
  than just cramming them. Keep this pattern for any future button added to
  this row.
- Review Queue shows the player's **photo + uploaded document inline**
  (blob fetch with token) so the Federation can judge with evidence.
  **Zoomable** (Sep 2026, `Lightbox` in `ReviewQueue.jsx`): mouse wheel,
  double-click, or +/-/reset buttons to zoom (1x–5x), drag/touch-drag to
  pan once zoomed — the old version only fit the image to screen, not
  enough to read small print on a phone-photographed ID. **Real two-finger
  pinch-to-zoom added (Sep 2026)** — the original build only had the buttons/wheel/double-click
  above, no actual pinch gesture despite the name; `onTouchStart/Move/End` now handle a two-touch
  pinch (distance-ratio scaling, anchored to the pinch midpoint) and a one-touch pan, kept separate
  from the mouse `onPointerDown/Move/Up` handlers (`pointerType !== "touch"` guard) so the two
  gesture paths don't fight over the same drag state. `touch-none` on the container already blocks
  the browser's own pinch-zoom/scroll, so no `preventDefault()` is needed in the touch handlers.
  **Perf rewrite (Sep 2026, same session as the mobile perf pass above):** the pinch/pan was calling
  `setScale`/`setPos` (React state) on every `touchmove` — up to 60-120 re-renders/sec, reported as
  laggy. Now a `paint(scale, x, y)` helper writes straight to the `<img>`'s `style.transform` via a
  ref during the gesture (live values tracked in the gesture's own ref — `pinchRef.current.scale/x/y`
  etc.), and React state only commits ONCE at pointerup/touchend (`commit()`). A `gesturing` boolean
  replaces the old accidental "transition is off because a state update happens to fire every frame"
  behavior with an explicit one. **Extracted into `components/DocumentViewer.jsx` (Sep 2026)** —
  `Lightbox` (this component) + `DocumentFrame` (the fetch-with-token/blob-URL/skeleton wrapper
  around it) are now shared with the Barangay Admin's Documents page, which needed the exact same
  private-file-fetch-and-zoom capability; `ReviewQueue.jsx`'s own `DocumentView` is now just the
  label/status header wrapper around a `<DocumentFrame>`.
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
  matches greyed out), Today section, start with period count, **team scoring**
  (Sep 2026: +1/+2/+3 for basketball, +1 elsewhere; "X won a game" for chess,
  billiards and esports), undo, per-period banking, end match → bracket
  advancement, cancel/reset — then a **post-match score sheet** (player stats + MVP).
  See "SCORING IS BY TEAM" under Tournament format.
- Writes PlayerMatchStats (Sep 2026: from the post-match score sheet, no longer live per-player taps).
- Tested: advancement verified — winner up, loser into the losers bracket. The
  Sep 2026 team-scoring / score-sheet routes were tested against stubbed models
  (25 checks), not yet through the browser against the live database.

**Scheduling**
- `PATCH /api/tournaments/matches/:matchId/schedule` (date + venue),
  `POST /api/tournaments/:id/schedule-bulk` (by round / group / bracket).
- Super Admin: collapsible Schedule section in the Tournaments page showing
  "(N/M dated)", per-round bulk apply, per-match date field.

**Public API (routes/public.js — unauthenticated, read-only)**
- `/overview` (season, live, today, **upcoming** — next 8 dated games after
  today, added Sep 2026 because Home showed nothing past today — recent, counts;
  one call for the landing page), `/matches?sport=&status=`, `/tournaments`, `/teams?sport=`,
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
  `lib/instructionContent.js`) — role-specific step-through content (9 steps
  for Super Admin — incl. "Champions, Reports & Site Images" and "Your profile &
  recovery code"; 5 for Barangay Admin — incl. "Follow your matches"; 5 for
  Organizer — the last two are
  "End the match" and "Fill in the player stats") shown automatically once, right after a forced password
  change (`ChangePassword.jsx`) — `mustChangePassword` only ever fires once
  per account, so this needed no new backend field to key off. Also
  reopenable any time from a "?" button in `AdminLayout`'s header, shared by
  all three roles, for existing accounts and for evaluators wanting a
  refresher. **Wide two-pane layout with screenshots again (Sep 2026)** —
  the earlier "text + icon only, no screenshots" decision (dropped because
  every UI pass makes them stale) was reversed at the Super Admin's request:
  explanation on the LEFT (title, description, numbered step list — the list is
  hidden on phones) and the step's screenshots on the RIGHT. **Real screenshots
  landed + multi-picture steps (Sep 26 2026):** each step lists its own `shots`
  (`[file, caption]`, any number, in order) in `instructionContent.js`; files
  live in `frontend/public/instructions/{super-admin,barangay-admin,organizer}/`
  (see that folder's README.md — nothing is picked up by filename anymore).
  `StepShots` shows one large + a thumbnail strip of all of them; clicking the
  large one opens the shared zoomable `Lightbox` (`components/DocumentViewer.jsx`)
  in gallery mode (`onPrev`/`onNext`/`caption`/`position`). A step with no shots
  shows its icon (Organizer "Fill in the player stats" has none yet).
  **The modal has a FIXED height** (`h-[92dvh] md:h-[min(92dvh,760px)]`, `sm:max-w-6xl`)
  — it used to size to each step, and being centred it jumped on every Next.
  Measured: identical top/height across all steps at 1366x768 and 390x844. All
  of a role's screenshots are preloaded on open. **`public/` is served
  publicly** — the recovery-code screenshot had its real code painted over;
  never ship a password, code, document or real resident's data in a capture.
  Re-capture the affected screenshots after any UI pass on those pages.
- **Shared `Lightbox` zoom rewritten (Sep 26 2026)**: zoom is anchored to the
  cursor / pinch midpoint (the point under your finger stays put), wheel uses a
  non-passive native listener (React's `onWheel` is passive, so its
  `preventDefault` never worked) with trackpad-pinch (ctrlKey) followed 1:1,
  pan is clamped so the image can't be dragged off screen, and the live
  transform is written to the `<img>` via a ref — React state only holds the %
  label. Gallery mode adds arrows, ←/→ keys and a sideways swipe when not zoomed.
  Same API for the Review Queue / Documents pages (`src`, `onClose`).

## IN PROGRESS / NEXT (priority order)

1. Barangay Admin dashboard (last remaining HIPO module — Match Information
   and Document Submission/verification status are built).
2. `verified_residents` collection (approvals persisting across seasons).
3. ~~Bulk player import.~~ Done (Sep 2026) — CSV upload in the Barangay
   Admin's roster editor, see Tournaments/Roster section below.
4. ~~Tournament delete from the UI.~~ Done (Sep 2026) — see Tournaments below,
   plus a new team-delete route/UI alongside it (there wasn't one before).
5. ~~Super admin password recovery when both super admins are locked out.~~ Done
   (Sep 2026) — per-account recovery code + profile panel; see the Accounts &
   authentication section below.
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

## DEV-ONLY SCRIPTS + ROUTES — DONE (Sep 2026, pre-deployment cleanup)
All removed from `backend/src/config/`: seedTestTeams.js, showOrReset.js,
clearTournament.js, seedTie5Test.js, seed52WithTies.js, seedVerifiedTeam.js,
seedPlayersForTeams.js, seedSportConfig.js, wipe.js, makeReferenceCsv.js,
seedSportTeams.js. Confirmed none were `require()`'d anywhere in the running
app before deleting. **KEPT `seed.js` AND `seedData.js`** — `seed.js`
imports `seedData.js` for the 26 barangays and 7 sports a fresh install
needs, so deleting one without the other breaks it; these are the only
files left in `backend/src/config/` besides `gridfs.js`/`password.js`/`time.js`.
Routes/UI removed: `POST /api/tournaments/:id/simulate-groups`,
`POST /api/tournaments/:id/test-de`, and the amber "Auto-score all group
matches" button + `simulateGroups()` in `Tournaments.jsx` (also dropped the
now-unused `Zap` icon import and a `showError` declaration that had no other
caller in that component).
`dev-setup.ps1` was checked — it exists locally (gitignored) and was never
committed, so nothing to do there.
If a new dev-only script/route gets added later, list it here again and
repeat this pass before the next deploy.

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
- **`sendFile()` caching (Sep 2026).** Default is `no-cache` + an `ETag` (the
  GridFS file id; If-None-Match → 304). It used to be `public, max-age=86400`, and
  because photo URLs don't change when the file does, a deleted/replaced profile
  or player photo kept showing for a day, even after a refresh. Pass a number for
  a short public cache (site images 60, logos 300) and `'private, no-store'` for
  residency documents (they were `public` before, which lets a shared cache keep
  them). Photo `<img>` URLs carry `?rev=` / `?f=<photo file id>` / `?c=2` so
  browsers skip copies cached under the old rule. New file routes: pick a policy
  on purpose, and never use `public` for anything private.
  **A FIXED query (`?c=2`) is not enough for a photo that can be REPLACED** — the
  URL never changes, so the page keeps showing its cached image until a refresh.
  Put the file id in the URL instead. Champions did exactly that (Oct 1 2026: "when
  I change one the user needs to refresh"): `GET /api/champions` now returns
  `photoRev` (the GridFS file id; PATCH uploads a new file on replace) and both
  Champions pages use `?f=<photoRev>`.
- **Mongoose `findOneAndUpdate({ new: true })` is deprecated** — use
  `returnDocument: 'after'`. Fixed in `organizer.js`; `siteimage.js`'s
  `PATCH /:key/focal` still uses the old `{ new: true }` and needs the
  same fix.
- **A match with a result is `completed` OR `forfeited`** (fixed Sep 30 2026). A forfeit
  records 1–0, sets `seriesWinner` and advances the bracket like a played game, but many
  checks tested only `'completed'` — so a group with a forfeit never counted as finished and
  `/de-bracket` refused the Top 8, and brackets hid the 1–0. Use `isFinished()` in
  `routes/tournament.js`; on the frontend `["completed", "forfeited"].includes(m.status)`.
  Brackets (admin + public) tag the no-show team "Forfeited" beside its 0.
  **Public Standings has a Knockout table** (Sep 30 2026, `knockoutStandings()` in
  `routes/public.js`, returned as `knockout` on `/api/public/bracket`): group tables only
  count group matches, so knockout wins, forfeits included, used to show up nowhere (a
  pickleball champion that won the final by forfeit still read 3-1). It lists place
  (1st-4th from the final / 3rd-place match), W/L, and "N forfeit win(s)". **Since Oct 1 2026 it is the SAME size as a group box, centred above the groups** (`lg:w-[calc(50%-0.625rem)] mx-auto` — one grid column of the `gap-5` group grid; full width on phones), with a narrow `#` column: the medal icon alone for 1st-3rd, the number from 4th on. Public Standings' provisional highlight (before a group's
  qualifiers are decided) now only marks teams with at least one win.
  **Double-elim group tables are ordered seed 1, seed 2, then fewest losses, then most wins**
  (Oct 1 2026, `ordered` in `Standings.jsx`): the server sorts by wins first, which is right for
  round-robin but in a double-elim group put a 3-1 / 3-2 losers-bracket team above the unbeaten
  2-0 group winner (Badminton Boys, Group A). Round-robin tables keep the server's wins-first order.
- **Bracket match cards colour the result** (Oct 1 2026): once a match is completed/forfeited the
  winner's row is green (tint + 3px inset bar, green score) and the loser's row red, on the public
  `Brackets.jsx` (`MatchCard` + the round-robin Fixtures list) and the admin `Tournaments.jsx`
  (`MatchBox`). Inset `box-shadow`, not a border, so card widths and the measured wires don't move.
  This replaces the public winner's gold score; gold remains the accent everywhere else.
- **Medal icons + bronze 3rd place** (Oct 1 2026): `frontend/public/medals/` holds `trophy.png`,
  `2nd-place.png`, `3rd-place.png` (supplied by the team). Shown on the Champion card (trophy),
  the 2nd place box and the Third place card in both brackets (`PlaceIcon`, greyed until the
  match is decided), and beside 1st/2nd/3rd in the public Standings knockout table (`MEDAL`).
  The Third place card is BRONZE (`#CD7F32` border/tint, `#E0975A` text on dark, `#A0522D` on
  light) via `WinnerCard`'s `tone="bronze"`; the Champion stays gold (public) / green (admin).
- **Public Matches page redesigned** (Oct 1 2026, "should be presentable and easy to understand",
  `Matches.jsx`): Live / Upcoming / Results TABS with counts (opens on Live when a game is on;
  `?tab=results` etc. opens one directly), then each DAY ("Today · Fri, Oct 2") → each COMPETITION
  ("Billiards · Open · 12 games · Gym Kolambugan", the venue said once when shared) → a GRID of
  match cards (1 / 2 / 3 columns at phone / md / xl), six per competition with "Show all". A card:
  time in gold (or "Time TBA") + "Group A · Winners Round 2", then the two teams. An empty slot
  reads "Awaiting opponent" (dashed crest), not "TBD". Results: winner bold + "WON" tag + green
  score, loser dimmed + red score (same green/red as the brackets). Upcoming also holds "Date to
  be announced" and "Waiting for a result" (past-dated, not played). Its `MatchCard` is local to
  this page; Home still uses the shared `FixtureRow` / `ScoreStrip`. Rendered at 1366px and 600px
  against the production API before shipping.
- **Admin Tournaments groups are GLASS PANELS** (Oct 1 2026, "we can't clearly see the divided
  groups"): `GlassStage` (radial-gradient glows, no blur filter) holds one `GlassPanel` per group
  and one for the Knockout in `Tournaments.jsx` (BracketView + StandingsView), each with a
  group-letter badge coloured from `GROUP_HUE` (A-H). Light + dark aware. Same perf rule as the
  public site: `backdrop-blur` only on these few panels and only at `lg`, never on `MatchBox`.
- **Admin round-robin "Group matches" collapse per ROUND** (Oct 1 2026, `MatchesView` in
  `Tournaments.jsx`): one Card per round + one for the tiebreaker playoff, chevron toggle like the
  Schedule section (`openRounds`); a fully played round starts closed.
- **Revert button removed from the admin Tournaments page** (Oct 1 2026, Super Admin: "not
  necessary now"). Both the bracket `MatchBox` and the round-robin match list lost it. The
  backend `POST /api/tournaments/matches/:id/revert` route is still there, but nothing calls it.
- **Public `TabRow` (sport/division tabs) is scrollable by mouse** (Sep 30 2026): it used
  `scrollbar-none`, so on a PC tabs past the edge (e.g. Chess, Mobile Legends on Brackets)
  were unreachable. Now a thin `.scrollbar-public` bar, ‹ › arrows while it overflows (sm+),
  wheel scrolls it sideways, the selected tab scrolls into view, edge fades only when needed.
- **Organizer match list has a GROUP filter** (Sep 30 2026, `OrganizerScoring.jsx`): chips
  "All groups / Group A… / Knockout" under the division chips, built from the matches in the
  selected division (a group missing from the new division falls back to "All groups").
- **2nd place box under the Grand Final** (Sep 30 2026): `BracketTree`/`BracketSection`'s `runnerUp` prop (admin
  `Tournaments.jsx` + public `Brackets.jsx`, knockout only) hangs a `SecondPlaceCard` (the final's loser)
  absolutely under the final match, so the final stays centred and the wires don't move.
- **Champion prize = amount only, ₱ added automatically** (Sep 30 2026, `lib/peso.js`): the
  admin form has a fixed ₱ prefix, number keypad, live commas; saves `formatPrize()` ("₱15,000").
  Both Champions pages display through `formatPrize`, so older values with no ₱ get one and
  older free text ("₱15,000 + trophy", "Trophy only") is kept as-is. Still a String field.
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