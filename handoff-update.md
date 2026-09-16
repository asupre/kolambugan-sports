# Handoff update — September 2026

Two parts. Part A is new `CHANGES.md` entries — append them. Part B lists
corrections to `CLAUDE.md`, which is stale in ~20 places and is the first thing
Claude Code reads.

---

# PART A — append to CHANGES.md

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

---

# PART B — corrections to CLAUDE.md

Replace or amend these. Line references are approximate.

1. **Header** — "BSCS thesis" should be BS Information Technology. Development
   window is now Jul–Sep 2026.

2. **PlayerMatchStats** — "NOTHING WRITES TO THIS YET" is wrong. The organizer
   writes points, fouls, rebounds and assists. Add `rebounds`, `assists` to
   the model listing.

3. **Match model** — add `lastAction {type, side, player, amount, label}`.

4. **Sport model** — add `scoringMode`, `pointValues`, `periodLabel`,
   `periodOptions`, `statTypes`, `onCourt`, `teamsPerBarangay`, `numGroups`,
   `knockoutSize`. `isDivided` is DEAD — nothing reads it.

5. **Barangay model** — add `logo`.

6. **New models** — `Champion`, `SiteImage`.

7. **GridFS buckets** — now five: `photos`, `documents`, `champions`, `site`,
   `logos`.

8. **Design system** — public background is `#0A1220` (not `#0B1017`); header
   and footer `#060C16`; `PublicLayout` borders use `slate-500/15` while panels
   use `#1C2430`.

9. **"Config UI still to build"** — built. League Setup at `/admin/config`.

10. **"Frontend has no route guards"** — built. `RequireRole` + 401 redirect.

11. **"Public Viewer (IN PROGRESS)"** — complete, eight pages.

12. **Verification whitelist** — `allowsCrossBarangay` is now settable from
    League Setup. The whitelist in CLAUDE.md is the stakeholder's list; what's
    in the database may differ.

13. **MINOR_AGE** — 15, per the SK Chairperson. The list is the SK voters'
    list, not COMELEC.

14. **"NOTE: the day comparison uses server-local time"** — fixed. See
    `config/time.js`.

15. **Forfeit** — built, not pending.

16. **Bracket labels** — ML knockout now uses the same path as any round-robin
    sport; `/bracket` branches on `tournamentFormat`, not on the name "Mobile
    Legends". The hardcoded 8-team double-elim `else` branch has been removed.

17. **Dev scripts to delete** — add `wipe.js`, `makeReferenceCsv.js`,
    `seedSportTeams.js`, `deleteSeason.js` if created. `seedSportConfig.js` can
    go now the config UI exists. KEEP `seed.js` — a fresh install needs the 26
    barangays and 7 sports from somewhere.

18. **Menus** — `components/menus.js` holds `superAdminMenu` and
    `organizerMenu`. They used to be copy-pasted into every page.

19. **Known cosmetic bugs** — the tiebreaker R100 labels and the expired-token
    redirect are both FIXED. Group standings after a tiebreaker now
    deliberately include playoff wins (see Part A).

20. **Still genuinely pending**: instruction modal (promised in Chapter 3's data
    collection procedure — required), shadcn pass, `verified_residents`,
    Barangay Admin dashboard, bulk player import, tournament delete from the
    UI, super admin password recovery when both super admins are locked out.
