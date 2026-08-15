# Municipal Sports Portal — Kolambugan

Inter-Barangay Sports League Management System with Automated Residency
Verification and Real-Time Match Analytics for the Municipality of Kolambugan,
Lanao del Norte, Philippines.

Undergraduate BSCS thesis (Lanao School of Science and Technology Inc.).
Final defense: **October 2026**. Development window: **Jul–Aug 2026** —
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

- **MongoDB** (Atlas) — primary database. Document storage via **GridFS**.
- **Express.js** — REST API
- **React.js** — frontend
- **Node.js** — server
- **JWT** auth + strict Role-Based Access Control
- Do **not** introduce Supabase, PostgreSQL, or any other datastore.

---

## The four roles

| Role | Who | What they do |
|---|---|---|
| **Super Admin** | SK Federation (1) | Uploads reference list, reviews/approves documents, provisions accounts, sets up tournaments, generates schedules/brackets |
| **Barangay Admin** | SK Chairperson per barangay (26) | Submits their barangay's team roster + uploads residency documents for players who need them. Does NOT score games. |
| **Organizer** | Game-day official, **one per sport** (currently 7; count grows if sports are added) | Encodes live scores (+1/+2/+3), fouls, match status. Only for their assigned sport. |
| **Public Viewer** | Everyone | Read-only. No login. Live scores, standings, brackets, schedules, team lineups, champions archive. |

---

## Roster & player rules (CONFIRMED)

- Team size: **minimum 10, maximum 15** players. Enforce on submission.
- New players / under 15: require **parental consent + supporting documents**.
- Player fields collected: full name, age, birthdate, **photo**, address.
  (Photo stored in GridFS. Address is collected but NEVER shown on public
  routes — public lineups remain surname + age + jersey + stats only.)
- One athlete may join **multiple sports** in a season (schedule permitting)
  → players↔teams is many-to-many (see team_players).
- There is a **registration deadline**; teams cannot freely add players
  mid-tournament (confirm exact deadline handling).

## Super Admin = two parties (CONFIRMED)

The Super Admin role is held by BOTH the **SK Federation** and the
**Head of LYDO** (Local Youth Development Office). LYDO handles the
municipality's sports program and is the only body that can obtain the
COMELEC voters' list. Provision Super Admin accounts accordingly.

## CRITICAL: the verification rule (CONFIRMED by stakeholder)

- A **"Dayo"** is a player from **outside the Municipality of Kolambugan**.
  Municipal residents are eligible.
- **Cross-barangay play is allowed ONLY for players from designated
  small/remote barangays** (a whitelist, because those barangays are too
  small to field their own teams). Confirmed list:
  Small Banisilon, Matampay, Bubong, Pantaon, Inudaran, San Roque,
  Palao, Sto. Niño, Sucodan, Lumbac.
  Players from the larger barangays play for their OWN barangay.
  (Store an `allows_cross_barangay` boolean on the barangays collection.)
- **Verification is DOCUMENT-based** (confirmed): each player proves
  Kolambugan residency with a Valid ID, Voter's Certification, or Birth
  Certificate. New players / those under 15 also need PARENTAL CONSENT
  plus supporting documents.
- The COMELEC voters' list can power an automatic pre-check, but it can
  only be obtained through the **LYDO** (Local Youth Development Office),
  who handles the sports program and is the only body that can request
  it from COMELEC. Until/unless obtained, verification runs on uploaded
  documents + Super Admin review.
- Super Admin gives the official verdict; approvals persist in
  verified_residents (never overwrite the reference source).
- The reference list is whatever the SK Federation provides (e.g. last
  tournament's verified player list) — NOT a COMELEC voters' file and NOT
  a civil registry. It is uploaded by the Super Admin (CSV) and **replaces**
  the previous list (snapshot semantics).
- Verification flow:
  1. Barangay Admin uploads roster → system **auto pre-screens** each player
     against the reference list immediately (preliminary status shown to
     the Barangay Admin: eligible / needs document / flagged).
  2. Players NOT on the list (minors, new players) must upload a residency
     document (barangay clearance, voter's ID, birth certificate).
     Documents are the EXCEPTION, not required for everyone.
  3. **Super Admin reviews flagged/document cases and gives the official
     verdict.** Automation assists; the Federation decides.
  4. Approved players are written to a separate **verified_residents**
     collection (player, barangay, document ref, approved_by, approved_at).
     This collection PERSISTS across seasons and is checked alongside the
     reference list. NEVER write approvals into the reference list itself.

---

## Tournament format (CONFIRMED by stakeholder + BUILT/TESTED as of Aug 2026)

TWO different formats depending on sport.

**Mobile Legends (1): GROUP ROUND-ROBIN -> SCALING SINGLE-ELIM + 3RD PLACE.**
(BUILT AND TESTED end-to-end, including a full 52-team funnel.)
- Phase 1 — Group stage: the Super Admin picks a KNOCKOUT SIZE (Top 8 or
  Top 16), NOT a number of groups. The system ALWAYS makes 8 groups and
  derives how many advance per group:
    - Top 8  -> 8 groups, top 1 advances each
    - Top 16 -> 8 groups, top 2 advance each
  Teams are distributed as evenly as possible across the 8 groups, so ANY
  registration count works (43, 52, odd numbers): the group stage absorbs
  the uneven numbers and the knockout stays a clean power of 2 (NO byes in
  the knockout, ever). `knockoutSize` (enum [8,16]) stored on the Tournament
  model. Requires >= knockoutSize verified teams. Round-robin within each
  group, every pairing once, best-of-1.
  (This replaced an older "number of groups" dropdown that could produce
  invalid non-power-of-2 qualifier counts, e.g. 6 groups x top 2 = 12.)
- Phase 2 — Knockout: SINGLE-ELIMINATION, scales to any power of 2 (8/16/32).
  Round of N -> ... -> Semifinals -> Grand Final, plus a 3rd-place match.
  Final = BO5; earlier rounds = BO3; 3rd place = BO3 (the two SF losers).
  Generator computes numRounds = log2(N), builds each round, wires
  nextMatchWin so winners advance and SF losers route to the 3rd-place match.
- ML is OPEN division (mixed gender); a barangay MAY field 2 teams.

**Tiebreakers (ML group stage):**
- A cutoff tie = teams sharing the same (wins, gameWinDiff) that spans a
  group's advance line. Ties are ALWAYS resolved WITHIN a group, never
  across groups (each group advances its own top N; 4 tied groups = 4
  independent tiebreakers, no shared pool).
- CURRENT (built + tested to 52-team scale): round-robin playoff among the
  tied teams; if the playoff itself stays tied, a stable random-draw
  fallback (hash of team id, consistent across reloads, flagged
  `resolvedByDraw`) resolves it. Guarantees resolution.
- DECISION (in progress): REPLACE the round-robin with per-group
  SINGLE-ELIMINATION (decisive "win or go home"), RANDOM byes for
  non-power-of-2 tied counts (fair — teams are equal on points). Points
  decide who is tied; wins decide the tiebreaker. Spots filled = group
  advance count minus clearly-qualified teams (usually 1; both finalists
  advance if 2 spots contested). This is the NEXT build.

**Physical sports (6): DOUBLE ELIMINATION. — IN SCOPE, not yet built for
arbitrary N.**
- Straight to a double-elimination bracket from the verified teams (NO
  group stage for physical sports). Win 3 / lose 2 style: one loss drops
  you to the losers bracket, a second loss eliminates you.
- Bracket team count is NOT fixed at 8 — depends on how many teams register
  (one team per barangay per division). The generator must handle arbitrary
  N (byes + losers-bracket wiring). This is the HARDEST remaining algorithm.
  The current else-branch of POST /:id/bracket is still HARDCODED for 8 teams.
- Ties for advancement broken by a PLAYOFF match (NOT point difference) —
  system detects the tie; organizer schedules the tiebreaker.

**Advancement is SCORE-DRIVEN, never organizer-chosen (integrity):**
- The bracket SKELETON is generated and LOCKED at draw time — every slot and
  the routing (nextMatchWin / nextMatchLose) is predetermined by structure.
- The Organizer enters ONLY the match score. The system derives the winner
  (score_a vs score_b) and routes BOTH teams automatically. The Organizer
  never picks who advances.
- All results appear on the public dashboard + audit trail (who entered each
  score, when). Prevents a dishonest organizer from advancing the wrong team.
- NOTE: the result route currently advances only bracket in
  [winners, losers, final]. Tiebreaker matches use bracket:'group'
  (isTiebreaker:true, round 100+) — the single-elim tiebreaker rebuild must
  handle advancing them through rounds.

**Per-match best_of:** dropdown set by Organizer (1/3/5/7), default 1.
matches hold a games[] array + series_winner. ML knockouts use BO3/5.

**Unavailable team = FORFEIT** (confirmed). No reschedule/re-pair; a
no-show forfeits the match. (There is a registration deadline.)

**Also recorded per match:** fouls, individual player points, MVP.

**Divisions (boys/girls) — partly built.**
Some sports run SEPARATE boys' and girls' brackets (volleyball confirmed
divided; the rest single/open). Modeled with `isDivided` (Boolean) on the
Sport model + a `division` field (boys/girls/open) on Team. PATCH
/api/sports/divisions (super_admin) sets it; surfaced via a modal when the
Super Admin clicks "Open Registration" (global setting, shown at that
moment). STILL PENDING: registration picks division for divided sports
(needs the Barangay frontend); divided bracket generation (two brackets per
divided sport, filtered by division).

## Data model (MongoDB collections)

```
seasons            _id, name ("2026 Season"), status ∈ {setup,
                   registration_open, verification, ongoing, completed},
                   opened_by, opened_at, closed_at
champions_archive  _id, season_id, sport_id, champion_team_id,
                   runner_up_team_id, final_standings_snapshot
barangays          _id, name, allows_cross_barangay (bool)
users              _id, barangay_id(FK, nullable), username, password_hash,
                   role ∈ {super_admin, barangay_admin, organizer},
                   assigned_sport(FK, for organizers), must_change_password
sports             _id, name, category
teams              _id, barangay_id, sport_id, team_name, status
players            _id, first_name, last_name, birthdate, age,
                   photo_gridfs_id, address, eligibility_status
team_players       _id, player_id(FK), team_id(FK)   ← MANY-TO-MANY:
                   one athlete may play multiple sports/teams in a season
                   (confirmed: "depends on his/her schedule")
documents          _id, player_id, doc_type, gridfs_file_id, verify_status,
                   reviewed_by, reviewed_at
reference_list     _id, first_name, last_name, birthdate?, barangay,
                   season, uploaded_by, uploaded_at   ← replaced per upload
verified_residents _id, first_name, last_name, barangay, document_id,
                   approved_by, approved_at           ← persists forever
tournaments        _id, sport_id, season, stage ∈ {round_robin, elimination},
                   groups (e.g. [A,B,C,D]), advance_per_group, format_notes
matches            _id, tournament_id, stage, round, bracket
                   (winners|losers|final, for double-elim), group(nullable),
                   team_a_id, team_b_id, organizer_id,
                   best_of (1|3|5|7, default 1),
                   games: [ {game_no, score_a, score_b, fouls_a, fouls_b,
                             winner} ],
                   series_winner(nullable), mvp_player_id(nullable),
                   next_slot_win(FK match), next_slot_lose(FK match),
                   match_status ∈ {scheduled, ongoing, completed, forfeited},
                   is_tiebreaker(bool), schedule,
                   entered_by, entered_at   ← audit trail
player_match_stats _id, match_id, player_id, points, fouls
```

RESOLVED: one athlete CAN be on teams in multiple sports the same season
(schedule permitting) → players↔teams is the many-to-many team_players
collection above.

---

## Accounts & authentication (decided)

- **No self-registration anywhere.** All accounts are seeded/provisioned.
- Super Admin panel lists all accounts (26 barangay + 7 organizer) with their
  credentials so the Super Admin can distribute them via Messenger/text.
- Initial passwords are **randomly generated per account** — NEVER a
  predictable pattern like the barangay name. Usernames may be the barangay
  name (usernames are not secrets).
- **Force password change on first login** (`must_change_password` flag).
- Super Admin can **reset any account's password** from the panel.
- Login page is a separate, unlinked route (e.g. /admin/login) — there is
  NO login/register button on the public viewer. Treat the hidden route as
  UX, not security: real security = JWT, RBAC middleware, bcrypt, and
  **rate-limiting on the login endpoint**.
- Public routes require no auth token. Private data (documents, player
  personal info beyond surname/age) must never appear on public routes.

---

## Design system (two looks, one product)

**Public Viewer — "R7-inspired" dark sports theme:**
- Deep navy background (#0A1628-ish; brand navy #0E2340, gold #F5A524)
- Solid dark cards (#111C2E) — NO backdrop-blur/glassmorphism (low-end phones)
- Thin colored accent line per card, color-coded BY SPORT
- Display font: Chakra Petch or Orbitron (Google Fonts) for headings/scores;
  Inter for body
- Status pill badges with dot indicators (● LIVE, ● 26 BARANGAYS)
- Minimal animation — at most a subtle transition on live score updates
- NEVER use Mobile Legends / Moonton art or any copyrighted game assets.
  Background: darkened photo of a local venue or a geometric pattern.
- Public lineups show **surname + age + jersey + stats only**. No birthdate,
  no address, no documents.

**Admin pages (Super Admin, Barangay Admin, Organizer) — shadcn/ui style:**
- Clean, light, functional dashboard components (shadcn/ui with Tailwind)
- Organizer's scoring screen is tablet/phone-first (big touch targets)

Everything mobile-first and responsive. Public users are on phones.

---

## Feature priorities (MoSCoW)

**Must:** auto pre-screen verification vs reference list + Super Admin
review/approval queue; roster submission w/ conditional document upload;
round-robin generator + elimination bracket seeding; real-time live scoring;
public dashboard (scores, standings, brackets, schedules, lineups, champions
archive); account provisioning panel; in-app first-login instruction modal
(promised in the thesis — REQUIRED).

**Should:** RBAC across all roles; permanent champions/history archive;
password reset from Super Admin panel; reschedule with audit trail.

**Could:** PDF exports, municipal branding, announcement banners.

**Won't (do not build):** player self-registration, payments, native mobile
apps.

## The 7 sports
Basketball, Volleyball, Badminton, Mobile Legends, Billiards, Chess, Pickleball.

## Conventions
- Never commit secrets (.env, gitignored). Never seed real resident names
  into the repo.
- Residency documents live in GridFS, served only through authenticated,
  role-checked routes.
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
  - Fixed stale two-role wording ("SK Federation and Table Officials")
    to the four-role model; Design section now names all diagrams and
    states draw.io as the tool.
- **Data Collection rewritten for ONLINE evaluation**: system deployed
  first; per-role accounts; credentials + Google Forms link distributed
  via SK Federation channels; in-app instruction modal orients users
  (modal is now PROMISED in the thesis => required build); anonymous
  responses; monitor response rate, remind via Federation.
- Course name swept to **BSCS / Computer Science** everywhere (the only
  "Information Technology" strings left are journal titles in references
  — correct, do not change).
- Gantt chart finalized (Jan–Oct 2026, Thesis 1 blue / Thesis 2 green /
  continuous orange). Logic order enforced: Testing overlaps Dev;
  Evaluation AFTER Testing; Ch. 4–5 AFTER Evaluation (can't write
  results before results exist); Final Defense Oct.
  Files: gantt_final.png / gantt_fixed.xlsx / gantt_final.pdf.
  User must paste PNG over the placeholder in Scheduling section.

## 2. Diagrams (mostly COMPLETED)

- Delivered as PNG+PDF: **Use-Case** (4 actors), **ERD** (crow's foot),
  **DFD Level 0 (Context)**, **DFD Level 1** (5 processes, 6 stores;
  geometrically audited; one line-hop; fixed a store→store violation).
- Old pre-Organizer diagrams from the user (flowchart, 2 HIPOs, ERD,
  DFDs) still need updating to 4 roles. **HIPO now needs a 3rd chart
  (Organizer)** — still PENDING.
- Teaching points covered: use-case include/extend; DFD golden rule
  (every flow touches a process); Level 0 vs Level 1; ERD = logical
  model even though MongoDB is document-based.

## 3. Stakeholder engagement (IN PROGRESS)

- User initially admitted NO real LGU contact despite Ch.3 claims.
  Chose "Path A": make the claims true by actually meeting stakeholders.
- DM'd SK Federation President **Hon. Jay Ann Reserva**; meeting at her
  house, letter dated **July 20, 2026**.
- Delivered for the meeting:
  - **Permission-Letter-FINAL.docx** — user's version (school logo,
    BSCS) + edit for ONLINE evaluation wording. One page. She signs
    "APPROVED/CONFORME"; group + adviser sign; print 2 copies.
  - **Interview-Guide.docx** (5 pp, checkboxes) + a trimmed question
    list; critical asks: what reference list exists; confirm Dayo rule;
    round robin advance-count & tie-breaks; September respondents
    commitment; signature; contact/group-chat access.
  - **TAM-Evaluation-Questionnaire.docx** — consent, role-only ID
    (anonymous), 17 Likert items (Usefulness 6 / Ease of Use 6 /
    Trust & Security 5), comments. Needs adviser content validation
    before September. Will become a Google Form (role dropdown,
    required items, 5→1 scale).
- **MEETING DONE (July 20, 2026). Hon. Reserva validated the system,
  will sign, and will endorse the Sept online evaluation in the group
  chat.** Key answers:
  - Verification is DOCUMENT-based (Valid ID / Voter's Certification /
    Birth Cert per player); under-15/new also need parental consent.
  - Cross-barangay play allowed ONLY for a whitelist of small/remote
    barangays (see verification section). Dayo = outside Kolambugan.
  - Voters' list can only be obtained via **LYDO** (handles sports;
    can request from COMELEC). Need to present the system to LYDO.
  - Physical sports = DOUBLE ELIMINATION (win 3 → Big 8; lose 2 → out).
    Mobile Legends = grouped round robin. Ties → playoff match.
  - Split into groups. Unavailable team = forfeit.
  - Roster 10–15 players. Multi-sport players allowed. Registration
    deadline exists. Collect name/age/birthdate/photo/address.
  - Record fouls, player points, MVP.
  - Super Admin = SK Fed + Head of LYDO.
  - NEW ACTION: prepare a **separate permission letter for LYDO** to
    present the system and request the voters' list.

## 4. Prototype (COMPLETED, for demo)

- 4-page offline HTML prototype in "PROTOTYPE PROPOSAL" folder:
  viewer / brgy-admin / organizer / super-admin + shared.css +
  shared.js + sample-roster-baybay.csv + sample-voters-masterlist.csv.
- REAL logic, not fake: CSV parsing, masterlist upload, cross-check,
  conditional flags, localStorage state shared across pages (score
  tapped in Organizer appears in Public Viewer), Reset demo buttons.
- KNOWN STALE RULE: prototype flags by barangay mismatch; real rule is
  municipality-level. Demo disclaimer prepared.
- User later redesigned/extended it himself (works, his version).
  Claude Design mockups (Kolambugan_Sports_Portal.pptx) reviewed: good,
  3 fixes noted (invented "civil registry 28,545", "address mismatch"
  flag reason, "proof of billing" doc type — none exist in our design).

## 5. Core domain decisions and WHY (the important part)

- **Dayo rule is MUNICIPALITY-level.** Players from any Kolambugan
  barangay may play for any other barangay (allowed, no per-team
  limits). Only players from OUTSIDE Kolambugan are ineligible.
  (Corrected mid-project — earlier barangay-level design was wrong.)
- **Reference list = SK Federation's own list** (e.g. last tournament's
  verified players) — NOT COMELEC, NOT civil registry (unobtainable).
  Uploaded by Super Admin; REPLACES prior list (snapshot semantics).
- **Verification = automated pre-screen + human verdict.** Auto-check
  runs on roster upload (instant preliminary status for the barangay);
  Super Admin gives official verdict. Defense line: "the system
  automates verification; the Federation's review is governance."
  Documents are the EXCEPTION — only for players not on the list
  (minors, new players). Approvals persist in **verified_residents**
  (separate collection; NEVER write into the reference list, which
  gets replaced and would erase approvals; also keeps the official
  list clean + gives audit trail: who approved, when, on what doc).
- **Storing the list in MongoDB is MORE secure** than the current
  Messenger/USB practice (auth-gated, HTTPS, Atlas encryption, audit).
  Never on public routes; never seeded into the repo.
- **Public lineups show surname + age + jersey + stats ONLY.**
  Stakeholder wanted lineups; privacy concern (minors) resolved by
  excluding birthdate/address/documents from public routes.
- **Accounts are provisioned, never self-registered.** 26 barangay +
  7 organizer accounts seeded; listed on Super Admin panel for manual
  distribution (Messenger/text). Random per-account passwords (NOT
  barangay-name patterns — one formula cracks all 26), forced change
  on first login, Super Admin reset button. Hidden /admin/login route
  is UX not security; real security = JWT + RBAC + bcrypt +
  rate-limited login. No login button on the public viewer.
- **Organizer count is dynamic**: one per sport (7 now, grows).
- **Season lifecycle**: ONE season covers all 7 sports.
  setup → registration_open → verification → ongoing → completed.
  Only Super Admin advances state. Gate features in BACKEND middleware;
  always allow login (waiting screen otherwise). completed = read-only
  "aftermath" public view + writes champions_archive (Objective #4).
- **Tournament format** (UPDATED Aug 2026 — see the full "Tournament format"
  section above for the authoritative version):
  - Mobile Legends: group round-robin -> SCALING single-elim knockout
    (Top 8 or Top 16, chosen via a knockout-size picker; always 8 groups)
    + a 3rd-place match. BUILT AND TESTED (incl. a 52-team funnel).
    Per-match best_of dropdown (1/3/5/7); ML knockouts use BO3/BO5.
  - Physical sports (6): DOUBLE ELIMINATION — now IN SCOPE and the next big
    build (arbitrary-N generator with byes + losers-bracket wiring). This
    SUPERSEDES the earlier "double elimination OUT OF SCOPE" note.
  - Group-stage ties resolved WITHIN each group (round-robin playoff +
    random-draw fallback today; per-group single-elim is the next rebuild).
- **Design system is split**: Public Viewer = R7-inspired dark sports
  theme (deep navy bg ~#0A1628, brand #0E2340 + gold #F5A524, solid
  dark cards #111C2E — NO glassmorphism for low-end phones, per-sport
  accent lines, Chakra Petch/Orbitron + Inter, pill badges, minimal
  animation, NEVER Moonton/MLBB art). Admin pages = shadcn/ui style,
  light and functional. Everything mobile-first (in the thesis).
- **Scope discipline**: MoSCoW governs additions. Stakeholder-requested
  => add + update doc. "Cool idea while coding" => Future Enhancements
  list (feeds Ch.5). Won't-haves stay out: self-registration, payments,
  native apps.

## 6. Ways of working (agreed)

- **Backend first**, then frontend against the real API.
- User writes code WITH this chat (wants to understand every line for
  the defense); **Claude Code = bug fixer / frontend scaffolder**,
  briefed via CLAUDE.md (it has NO access to this conversation).
  Feed it CLAUDE.md + mockup images + specific instructions; one page
  or module at a time; never let it touch the demo prototype folder.
- Keep a **CHANGES.md** deviation log during development; true up the
  thesis document in EARLY SEPTEMBER (not October).
- Update CLAUDE.md whenever a decision changes here.

## 7. PENDING / NEXT

1. **LYDO meeting**: present the system to LYDO (they handle sports and
   can obtain the COMELEC voters' list). Bring the separate LYDO letter.
2. **Backend build**: LARGELY DONE (auth, season state machine, rosters,
   verification, review queue, ML tournament engine, dashboard stats).
   See "CURRENT BUILD STATUS" at the end of this file for exactly what's
   done vs pending.
3. **HIPO charts** (3, incl. Organizer) + update old diagrams to 4 roles.
4. Adviser validation of TAM questionnaire; build the Google Form.
5. Paste Gantt PNG into the document placeholder; figure numbering.
6. September critical path: deploy early Sep (Render/Vercel + Atlas),
   distribute credentials, instruction modal, chase 33/35 responses via
   Reserva's group-chat endorsement.

## Open questions (remaining)
- Exact registration-deadline handling (can a team ever substitute an
  injured player after the deadline?).
- Big-8 advance count per group for Mobile Legends round robin.
- Whether LYDO grants the COMELEC voters' list, and in what format
  (decides how much of verification is automated vs document-review).

---
---

# PART III — CURRENT BUILD STATUS (as of Aug 14, 2026)

Team member driving the build: Jerico Asupre (Programmer). Repo is one git
repo with two folders: backend/ (Express + MongoDB Atlas; server.js at the
ROOT, not src/; runs on port 5000 via `npm run dev`) and frontend/ (Vite +
React + Tailwind; port 5173; proxy /api -> localhost:5000). Hand-rolled
Tailwind with a small shared component set (frontend/src/components/ui.jsx:
Button/Card/Input/Label/Pill); shadcn/ui deferred to one restyle pass later.

## DONE + TESTED
- Auth: JWT login, role routing, forced first-login password change, Super
  Admin password reset.
- Season lifecycle: model + states, create/advance routes, state guards.
- Registration/rosters: create team, add/remove players, submit (10-15
  enforced), "2 teams per barangay" (ML), division field on Team.
- Verification: reference-list CSV upload, auto pre-screen (eligible /
  flagged / needs_document) with flagReason, review queue (approve / reject
  / verify), reject reopens roster + verify locks the team.
- Divisions config: isDivided on Sport, PATCH /api/sports/divisions, and the
  division-setup modal on "Open Registration" (Season page).
- Mobile Legends tournament: group stage; knockout-size picker (Top 8/Top 16
  -> always 8 groups); scaling single-elim knockout (8/16/32) + 3rd place;
  score-driven advancement; tiebreaker system (round-robin playoff +
  random-draw fallback), tested to 52-team scale.
- Super Admin frontend: Dashboard, Season, Reference List, Review Queue,
  Tournaments (sport picker, standings, match entry, knockout generation,
  bracket display, tiebreaker button).

## IN PROGRESS / NEXT (priority order)
1. Replace the ML tiebreaker with PER-GROUP SINGLE-ELIMINATION (user's
   decision). Standard single-elim among a group's tied teams; RANDOM byes
   for non-power-of-2 counts; winner takes the spot (both finalists if 2
   spots contested); each group independent. THREE parts: (a) generation
   with byes + nextMatchWin wiring, (b) result route must advance tiebreaker
   matches through rounds (today it only advances winners/losers/final; the
   tiebreaker matches are bracket:'group', isTiebreaker:true, round 100+),
   (c) qualification reads the bracket winner(s).
2. Physical-sports DOUBLE ELIMINATION for arbitrary N (byes + losers-bracket
   wiring). The else-branch of POST /:id/bracket is still hardcoded for 8.
3. Divided bracket generation — volleyball -> two brackets (boys + girls).
4. Barangay Admin frontend (roster form + document upload / GridFS).
5. Organizer scoring screen (per-player points/fouls/MVP — the PRIMARY
   courtside scoring UI; Super Admin scoring on the tournament page was for
   testing + is a legit override).
6. Public Viewer (dark R7 theme, reuse the bracket display styled dark).
7. Accounts section, champions archive (write on season complete), forfeit
   handling, cosmetic bug fixes, polish, deploy.

## KNOWN COSMETIC BUGS (low priority)
- After a tiebreaker runs, the group standings DISPLAY shows combined
  group+playoff points ("8 played, 15 pts"), which makes tied teams look
  unresolved even though qualification is correct. Should show only group
  games, mark qualified teams, and show a "resolved by draw" badge.
- Tiebreaker/playoff matches labeled "R100/R101/R102" (cryptic) — relabel
  "Playoff".
- resolvedByDraw flag is in the qualification output but not shown in the UI.

## DEV-ONLY SCRIPTS + ROUTES — DELETE BEFORE DEPLOYMENT
All in backend/src/config/ (write DIRECTLY to the DB, bypassing app rules):
seedTestTeams.js, seedReviewTest.js, showOrReset.js, clearTournaments.js,
seedTiebreakerTest.js (3-way tie), seedTie5Test.js (5-way tie),
seed52WithTies.js (full 52-team tournament with forced ties in groups A/C).
Also: POST /api/tournaments/:id/simulate-groups (auto-scores all group
matches) + the amber "Auto-score all group matches" dev button in
Tournaments.jsx.

## GOTCHAS (bit us repeatedly)
- Adding a field to a Mongoose model needs a FULL server restart (Ctrl+C +
  npm run dev), not just nodemon reload — otherwise strict mode SILENTLY
  DROPS the field on save ("saved successfully but blank"). Hit us on
  isDivided (Sport) and knockoutSize (Tournament).
- backend/src/routes/tournament.js accumulated corruption from long editing
  (duplicate lines / duplicate const declarations / duplicate routes). Check
  for duplicates before editing it. The qualification route was rewritten
  clean once already to fix this.
- Two-terminal rule: server in ONE terminal (untouched); run seeds / resets
  / PowerShell API tests in a SEPARATE terminal. "Cannot find module" =
  wrong folder (backend scripts run from backend/). "Unable to connect" =
  server not running or you typed into the server's terminal.
- Confirmed sports facts (from LYDO head): Volleyball = 2 divisions
  (boys/girls); all other sports single/open; physical sports =
  double-elimination; ML = open division, up to 2 teams per barangay,
  group round-robin -> single-elim (Top 8 or Top 16) + 3rd place. Sport
  list: Basketball, Volleyball, Badminton, Mobile Legends, Billiards, Chess,
  Pickleball. 26 barangays.
