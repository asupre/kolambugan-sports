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