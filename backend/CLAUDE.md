# CLAUDE.md — updates from Aug 9 session

Paste these into your live `CLAUDE.md`, replacing the noted sections.
Everything else in the file stays as-is.

---

## REPLACE the "Tournament format (CONFIRMED by stakeholder)" section with:

## Tournament format (CONFIRMED by stakeholder)

TWO different formats depending on sport:

**Physical sports (6): DOUBLE ELIMINATION. — IN SCOPE, being built.**
- Straight to a double-elimination bracket from the verified teams
  (no group stage for physical sports).
- A team is eliminated after LOSING 2 games (double elimination: a
  winners bracket and a losers bracket; one loss drops you to losers,
  a second loss eliminates you).
- Bracket team count is NOT fixed at 8 — depends on how many teams
  register (one team per barangay per division). Generator must handle
  arbitrary N (byes + losers-bracket wiring). This is the hard part
  still to build.
- Ties for advancement broken by a PLAYOFF match between tied teams
  (NOT point difference) — system DETECTS the tie, organizer schedules
  the tiebreaker. (Tiebreaker logic already built for the ML group stage
  and reusable.)

**Mobile Legends (1): GROUP ROUND ROBIN → SINGLE-ELIMINATION BIG 8 + 3RD PLACE.**
(BUILT AND TESTED end-to-end this session.)
- Phase 1: random group draw (A/B/C/D), round robin within each group,
  every pairing once, best-of-1. Top N per group advance (default top 2).
- Phase 2: the 8 qualifiers play a SINGLE-ELIMINATION bracket
  (NOT double-elimination) + a 3rd-place match:
  - Quarterfinals: BO3 (4 matches) — losers eliminated.
  - Semifinals: BO3 (2 matches) — winners → Grand Final,
    LOSERS → 3rd-place match.
  - Grand Final: BO5.
  - 3rd-place match: BO3 (the two semifinal losers).
- ML is OPEN division (mixed gender), and a barangay MAY field 2 teams.

**Advancement is SCORE-DRIVEN, never organizer-chosen (integrity):**
- Bracket skeleton generated + LOCKED at draw time; routing predetermined
  (nextMatchWin / nextMatchLose on each match). Organizer enters only the
  score; system derives the winner and routes both teams automatically.
- All results public + audit trail (who entered each score, when).

---

## REPLACE the "Double elimination OUT OF SCOPE" note (in section 5) with:

- **Tournament formats (CONFIRMED + BUILT):**
  - Mobile Legends: group round-robin → single-elim Big 8 + 3rd place.
    Built and tested this session (the earlier "round robin only" note
    was incomplete; the earlier "double elimination" label for ML was
    WRONG — ML is single-elim in the knockout phase).
  - Physical sports (6): DOUBLE ELIMINATION — now IN SCOPE and being
    built next (supersedes the earlier "out of scope / single-elim
    fallback" note; the stakeholder confirmed double-elim is required).
  - Per-match best_of stored on each match (games[] + series_winner).
    ML: QF/SF BO3, Final BO5, 3rd-place BO3. Physical: per-round best-of
    to confirm with SK.

---

## ADD a new subsection under section 5 (Core domain decisions):

- **Divisions (boys / girls) — NEW, to build with physical double-elim.**
  Some sports (e.g. volleyball, basketball) run SEPARATE boys' and girls'
  competitions: separate brackets, separate champions, boys only ever
  play boys and girls only play girls. Modeled with a lightweight
  `division` field on each team: `'boys' | 'girls' | 'open'`.
  - `open` = no gender split (Mobile Legends, and any sport that isn't
    divided) — all teams go into ONE bracket regardless of gender.
  - `boys` / `girls` = generator SORTS teams by division first, then
    builds one bracket per division. A "Volleyball" sport becomes two
    tournaments: "Volleyball — Boys" and "Volleyball — Girls".
  - "2 teams per barangay" already exists (built for ML). For divided
    sports, that becomes one boys team + one girls team per barangay.
  - PENDING from SK: the per-sport rules table — for each of the 7 sports:
    divided (boys/girls) or open? teams per barangay? team-based or
    individual? best-of per round? (Jerico is getting this from the SK.)
    Build divisions + physical double-elim together once the table is in.

---

## APPEND to section 7 (PENDING / NEXT):

7. **Tournament section — remaining:**
   - Build physical-sports DOUBLE ELIMINATION generator (arbitrary N,
     byes, losers-bracket wiring). Hardest remaining algorithm.
   - Build DIVISIONS (boys/girls) — `division` field + per-division
     bracket generation + registration picks division for divided sports.
   - BLOCKED ON: SK per-sport rules table (divided/open, teams-per-brgy,
     team/individual, best-of). Jerico gathering this.
   - Physical double-elim bracket DISPLAY (frontend) — reuse the ML
     BracketView (winners/losers/final sections already coded).
8. **Other admin sections not built:** Accounts (generate/reset temp
   passwords — needs GET /api/accounts?role= and POST reset routes);
   document upload + Super Admin inspection (GridFS — build WITH the
   barangay roster page since uploads originate there); champions archive
   write on season complete.
9. **Other role frontends not started:** Barangay Admin (roster form
   mirroring ENTRY FORM 2 + document upload); Organizer scoring screen
   (per-player points/fouls, MVP, courtside tap targets — the PRIMARY
   scoring UI; Super Admin scoring on the tournament page was for testing
   + is a legit override); Public Viewer (dark R7 theme, reuses bracket
   display styled dark).
10. **UI polish:** currently hand-rolled Tailwind with a small shared
    component set (src/components/ui.jsx: Button/Card/Input/Label/Pill).
    shadcn/ui adoption DEFERRED to a single restyle pass near the end
    (low risk — copies files in; only care = merge Tailwind config to
    keep brand colors + set @ path alias).

---

## ADD a new section: dev-only scripts + this session's backend changes

## Dev-only scripts (DELETE before deployment — never run on real data)

All in `backend/src/config/`. They write DIRECTLY to the DB, bypassing
app rules (season-state guards, etc.), so they can create states the
real app forbids (e.g. a team in a completed season). Test tooling only.
- `seedTestTeams.js` — 8 verified Mobile Legends teams (…Esports) in the
  latest season, for tournament testing.
- `seedReviewTest.js` — one "Review Test Team" (basketball, pending) with
  8 eligible + 1 flagged + 1 needs_document, each with a flagReason, for
  review-queue testing.
- `showOrReset.js` — resets sk_federation password + mustChangePassword
  flag without wiping data (edit the true/false line, run).
- `clearTournaments.js` — wipes ALL tournaments + matches (nuclear reset
  when a bracket gets into a bad/partial state).

## Backend changes this session (frontend build + ML tournament)

- `models/Player.js` — added `flagReason: String` (human-readable reason
  a player was flagged/needs-document; written by the pre-screen).
- `services/prescreen.js` — now RECORDS flagReason (was computed then
  discarded): under-15 → parental consent; not-on-list → residency doc;
  cross-barangay-not-whitelisted → "Listed under X, not Y…".
- `models/Match.js` — `bracket` enum now includes `'third'`
  (['winners','losers','final','group','third']) for the ML 3rd-place
  match. (Missing this crashed bracket generation silently.)
- `routes/stats.js` (NEW) — GET /api/stats/dashboard (season, teams,
  playersToReview, barangays) for the admin dashboard.
- `routes/referenceList.js` — added GET /api/reference-list (returns the
  current season's records so the UI can display the loaded list).
- `routes/tournament.js`:
  - POST /:id/bracket now BRANCHES on sport: Mobile Legends → single-elim
    (QF/SF/Final + third, routes semi losers to third); else →
    double-elim (winners/losers/final).
  - GET /:id/bracket read filter must include 'third' in the $in list
    (['winners','losers','final','third']) — otherwise the 3rd-place
    match is created but never returned to the UI. (This was the final
    bug in the ML bracket saga.)
  - Note: current double-elim branch is still hardcoded for 8 teams —
    the arbitrary-N generator is the pending build.

## Recurring gotcha (two-terminal rule)

Server runs in ONE terminal (npm run dev), left untouched. Run seeds /
resets / PowerShell API tests in a SEPARATE terminal. Symptoms:
"Cannot find module" = wrong folder (backend scripts run from backend/).
"Unable to connect" = server not running OR you typed into the server's
terminal. Schema enum changes need a FULL server restart (Ctrl+C +
npm run dev), not just nodemon reload. Empty $tid in PowerShell shows as
tournaments//… (double slash) — re-fetch the id.
