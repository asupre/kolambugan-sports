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
| **Organizer** | Game-day official, **one per sport** (currently 7; count grows if sports are added) | Encodes live scores (+1/+2/+3), **per-player points and per-player fouls**, match status. Taps the specific player when scoring. Only for their assigned sport. |
| **Public Viewer** | Everyone | Read-only. No login. Live scores, standings, brackets, schedules, team lineups, champions archive. |

---

## Roster & player rules (CONFIRMED)

- Team size: **minimum 10, maximum 15** players.
- Roster entry is **FORM-BASED** (per-player "Add Player" entries in the UI: last/first/middle name, birthday, photo), NOT parsing an uploaded Word file (unreliable, every barangay formats differently). Barangays MAY additionally **attach their official Word roster file** for the record, but the system's data comes from the form. Barangays use WORD not Excel. Enforce on submission.
- New players / under 15: require **parental consent + supporting documents**.
- Player fields collected: last/first/**middle** name, age, birthdate, **photo**, address, jersey number. Fields mirror the barangays' existing Word template "ENTRY FORM 2: TEAM GALLERY" (photo + last/first/middle name + birthday, 15 player slots) — mirroring their form aids adoption. (Still to obtain: ENTRY FORM 1 for the full submission spec.)
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

## Tournament format (CONFIRMED by stakeholder)

TWO different formats depending on sport:

**Physical sports (6): DOUBLE ELIMINATION.**
- Teams are shuffled into groups.
- A team that WINS 3 games qualifies to the "Big 8."
- A team that LOSES 2 games is eliminated (double elimination).
- Ties for a Big-8 slot are broken by a PLAYOFF match between the tied
  teams (NOT by point difference) — the winner advances. The system must
  DETECT the tie and let the organizer schedule the tiebreaker.

**Mobile Legends (1): GROUPED ROUND ROBIN.**
- Random group draw (A/B/C/D). Round robin within each group, every
  pairing exactly once, default best-of-1. Top N per group advance.

**Advancement is SCORE-DRIVEN, never organizer-chosen (integrity):**
- The full bracket SKELETON is generated and LOCKED at draw time — every
  winners/losers-bracket slot and the routing (who drops where, where the
  brackets merge) is predetermined by structure, independent of any admin.
- The Organizer enters ONLY the match score. The system derives the
  winner (score_a vs score_b) and routes BOTH teams automatically to
  their predetermined next slots. The Organizer never picks who advances.
- All results appear on the public dashboard (a falsified score is
  publicly visible) + audit trail (who entered each score, when).
- Rationale: prevents a dishonest organizer from advancing the wrong
  team — the same anti-favoritism principle as residency verification.
- If the double-elim SKELETON GENERATOR proves too costly for the
  Jul–Aug window, fallback = score-driven advancement on a simpler
  single-elim structure for physical sports, with full double-elim
  noted as a Chapter 5 future enhancement. Score-driven advancement
  itself is NON-NEGOTIABLE either way.

**Per-match best_of:** dropdown set by Organizer (1/3/5/7), default 1.
matches hold a games[] array + series_winner. ML knockouts use BO3/5/7.

**Unavailable team = FORFEIT** (confirmed). No reschedule/re-pair; a
no-show forfeits the match. (There is a registration deadline.)

**Also recorded per match (PER-PLAYER):** individual player points and individual player fouls (stored in player_match_stats). This means the Organizer's scoring screen must show the team's player list so the scorer can tap the specific player when adding points or fouls — this is the most important UI to design well (big touch targets, roster visible, minimal taps, tablet/phone-first). **MVP is NOT a built feature:** the Organizer simply sees who has the highest points and declares the MVP manually (a human decision, zero extra build). Tradeoff accepted: per-player scoring is more taps courtside than team-only scoring, but the team judged it essential to the system's usefulness during games.

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
players            _id, first_name, middle_name, last_name, birthdate,
                   age, photo_gridfs_id, address, jersey_number,
                   eligibility_status
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

**Settings scope ("Update League Rules" in Super Admin):** keep NARROW — registration deadline and roster min/max only. Do NOT promise a full configurable rules engine. Anything broader (custom formats, custom point systems) is a Ch.5 future enhancement.

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
- **Tournament format** (from user's ML experience): random group draw
  (A/B/C/D) → round robin per group (each pairing EXACTLY once, all
  BO1) → top N per group ("Big 8") → knockout: A+B pool randomly
  paired, C+D likewise, halves meet at finals; REMATCHES ALLOWED;
  no seeding/constraints. Draw preview → confirm → lock.
  **Per-match best_of dropdown (1/3/5/7)** set by Organizer, default 1
  (ML knockouts use BO3/BO5/BO7). matches hold a games[] array +
  series_winner. **Double elimination OUT OF SCOPE** (a week of work
  for one sport; manual pairing fallback is 8 clicks).
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
2. **Start backend build**: models → auth/provisioning → season state
   machine → rosters/verification → document queue → tournament engine
   → frontend. Nothing coded yet.
3. DONE — all diagrams built (Use-Case, 3 HIPOs, DFD 0/1, ERD, Flowchart, Architecture) and INSERTED into Chapter 3 with captions (Figures 3.2–3.11). Organizer HIPO wording to be updated to per-player points/fouls when convenient.
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
