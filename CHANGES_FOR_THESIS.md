# Changes for the Thesis: Live Player Statistics

Prepared Oct 15 2026 from the code on `main` (HEAD `16bb8ae`) and the git history from the
Sep 29 2026 mock defense onward. Everything below describes what the code does. Anything that
was NOT tested, or is NOT enforced by the server, is stated as such.

The feature landed in two commits:

- `fb703e8` (Oct 5 2026): live per-player stats, three people per match on one Organizer
  account, atomic team-score taps, and the public "Live now" box on the team page.
- `16bb8ae` (Oct 6 2026): starting lineup at Start and substitutions while live. Stat buttons
  are shown only for players on court.

**Updated Oct 15 2026** (committed after this document was first written) with two follow-up
changes:

- **Instant taps.** A score or stat tap shows on the screen at once instead of waiting for the
  server.
- **Shared-account hardening:**
  - Each job is claimed by one device, and the server enforces it.
  - Substitutions, games-won scoring and team-score Undo are atomic.
  - The after-match forms are per team and version-checked.

Sections 3, 4, 6, 7, 8 and 9 describe the code after these changes. Section 9.5 lists which
risks they fixed and what is still a limitation.

---

## 1. Summary

During a live match, an Organizer can now record each player's statistics as they happen, the
same way the team score is recorded. This covers points, fouls, rebounds, assists and any other
number column on that sport's score sheet. Each tap is saved immediately. The public team page
shows a "Live now" box with the current score and that team's per-player stats for the game.
It refreshes every 5 seconds while the game is on.

Up to three people can work one match at the same time. They are all logged in to the sport's
one Organizer account, each on their own device. Each device picks a job:

- **Score keeper**: the team score, periods, End match and Cancel match.
- **Stats: <Team A>**: per-player stats for team A.
- **Stats: <Team B>**: per-player stats for team B.

Player points are statistics only. They do **not** change the team score, which stays the
score keeper's job.

For team sports with a court size (Basketball 5, Volleyball 6, esports 5), the score keeper
picks a starting lineup when starting the match. Substitutions can be made while it is live.
Stats keepers only get stat buttons for players currently on court.

After the match, the existing "Player stats" form still opens. It is now pre-filled with the
live taps, so the organizer can check and correct them against the paper scoresheet. The MVP
is chosen on this form.

## 2. What changed from before

| | Before (state at the Sep 29 2026 mock defense) | Now |
|---|---|---|
| Team score | Tapped live by the organizer (+1/+2/+3, or "X won a game") | Same, but for points-scored sports the tap is now an atomic database increment (see section 9) |
| Player stats during the match | **None.** Live scoring was by team only, since commit `e1ab288` (Sep 20 2026). That commit had removed an earlier per-player live scoring and lineup UI | **Live per-player taps**, by one stats keeper per team |
| After-match "Player stats" form | The only way to enter player stats; it started from whatever was already saved (empty for a new match) | **Kept.** It opens pre-filled with the live taps and is used for corrections and for the MVP |
| Starting lineup / substitutions | None (removed Sep 20 2026) | **Brought back** (Oct 6 2026) for team sports with a court size |
| People per match | One organizer | Up to three devices on the same Organizer account |
| Public team page | Season roster and season stats, polled every 10 s | Adds a "Live now" box; polls every 5 s while the team is playing, 10 s otherwise |

Two other changes to the after-match form were made between the defense and the live-stats
work:

- `ecca6ca` (Oct 1) moved the form into a modal that opens by itself after End match.
- `044af88` (Oct 1) caps each team's player points at the team's score, both in the form and
  on the server.

## 3. Data model

There is no new collection, and `PlayerMatchStats` has not changed since Sep 29 2026. The live
taps write to the same records the after-match form writes.

### PlayerMatchStats (`backend/src/models/PlayerMatchStats.js`): unchanged

| Field | Type | Required | Default / notes |
|---|---|---|---|
| `match` | ObjectId, ref `Match` | yes | |
| `player` | ObjectId, ref `Player` | yes | |
| `points` | Number | no | 0 |
| `fouls` | Number | no | 0 |
| `rebounds` | Number | no | 0 |
| `assists` | Number | no | 0 |
| `extra` | Mixed (object) | no | Not set by default. Holds any other sheet column as `extra.<key>` (blocks, steals, kills, custom columns, and so on) |
| `role` | String | no | `null`. The esports role, chosen on the after-match form only |
| `createdAt`, `updatedAt` | Date | automatic | Added by `timestamps: true` |

- **Index:** `{ match: 1, player: 1 }`, **unique**, so there is one record per player per
  match. A live tap creates the record on first use (upsert).
- **No field records who entered a stat** (no user, device or session).

### Match (`backend/src/models/Match.js`): fields added since Sep 29

| Field | Type | Required | Default | Commit |
|---|---|---|---|---|
| `lineupA` | array of ObjectId, ref `Player` | no | `[]` | `16bb8ae` |
| `lineupB` | array of ObjectId, ref `Player` | no | `[]` | `16bb8ae` |
| `subs` | array of `{ side: 'A' or 'B', playerOut: ObjectId or null, playerIn: ObjectId or null, period: Number (default 1), at: Date (default now), by: String or null }`, with no `_id` per entry | no | `[]` | `16bb8ae` (`by` added Oct 15) |
| `jobs` | object `{ score, statsA, statsB }`; each is `{ device: String or null, since: Date or null, seen: Date or null }` | no | all `null` | Oct 15 |
| `formVersion` | object `{ A: Number, B: Number, result: Number }` | no | all `0` | Oct 15 |
| `enteredByName` | String | no | `''` | `69921d8` |

- `jobs.<job>.device` is the random id of the browser tab holding that job. `since` is when it
  was claimed. `seen` is the last time that tab had the match open (refreshed at most every
  30 s).
- `formVersion.A` / `.B` / `.result` count the saves of team A's stats form, team B's stats
  form, and the score keeper's result form.
- `subs[].by` is the job (`score`, `statsA` or `statsB`) of the device that made the
  substitution.
- A match created before Oct 15 has none of these fields; the code treats missing as empty /
  version 0.

- `enteredByName` is not part of live stats: if an organizer account is later deleted, its
  username is copied here.
- No new indexes on Match.
- Existing Match fields still used by this feature: `liveScoreA/B`, `games[]`, `bestOf`,
  `lastAction`, `mvp`, `enteredBy`, `enteredAt`, `status`.

`fb703e8` also added an `isDemo` field (Boolean, default false) to `Team` and `Player`. It is
used by the demo-data generator and is not part of live stats.

### Sport rules (`backend/src/lib/sportRules.js`)

`rulesFor(sport)` now also returns `onCourt`, from the new `onCourtFor()`:

- Only `entryFormat: 'team'` sports have a lineup. Singles and doubles never do.
- The sport's own `Sport.onCourt` is used if it is a positive whole number.
- Otherwise the built-in values apply: Basketball 5, Volleyball 6, Mobile Legends 5, and 5 for
  any other esport.
- Any other sport has no lineup.

## 4. API

- All Organizer routes are under `/api/organizer` and are **protected**. The whole router uses
  `authenticate` + `authorize('organizer', 'super_admin')`.
- An Organizer may only act on matches of their own `assignedSport` (403 otherwise). A Super
  Admin may act on any sport.
- `/api/public` routes are **public**: they need no login.
- **Since Oct 15 2026**, every request from the browser also carries an `X-Device-Id` header:
  the tab's random id, kept in `sessionStorage`. Most Organizer routes also check that this
  device holds the right **job**; a wrong job gets **403** with `code: 'not_your_job'`. The
  "Job" column below gives the rule.

| Route | Job required |
|---|---|
| start, score, undo, end-period, end, cancel, forfeit | score keeper |
| player-stat | the stats keeper of the player's team |
| substitute | that team's stats keeper, or the score keeper |
| PUT stats `?side=A` / `?side=B` | that team's stats keeper (score keeper when the sport has no live stats) |
| PUT result | score keeper |
| GET match, claim | any device |
| release | the job's own device; the score keeper for a stats job; any Super Admin |

### New (Oct 15 2026)

**POST `/api/organizer/matches/:matchId/claim`**

- Body: `{ job: 'score' | 'statsA' | 'statsB', confirmSwitch?, takeOver? }`.
- Atomic conditional update: the job is given to this device only if it is free, already this
  device's, or (with `takeOver`) still held by the same device that has been quiet for 2+
  minutes.
- Returns 409 with one of these codes:
  - `job_taken`: another active device holds the job.
  - `job_stale`: the holder has been quiet for 2+ minutes; repeat with `takeOver` to take it.
  - `confirm_switch`: this device holds another job and the match has started; repeat with
    `confirmSwitch`.
- Taking a job frees any other job this device held.
- The stats jobs are refused (400) for a sport with no live stats.
- Refused on a forfeited match.

**POST `/api/organizer/matches/:matchId/release`**

- Body: `{ job }`. Frees that job.

**PUT `/api/organizer/matches/:matchId/result`**

- Body: `{ mvpPlayerId, version }`. Score keeper only. Allowed only when the match is
  `completed`.
- Saves the MVP with an atomic update that only applies if `formVersion.result` still equals
  `version`, then adds 1 to it. Otherwise it returns 409 `stale_form`: "Someone else saved this
  form. Reload to see the latest."
- The result itself (winner, score) cannot be changed here.

### New (Oct 5-6 2026)

**POST `/api/organizer/matches/:matchId/player-stat`** (organizer for their own sport, or
super_admin)

- Body: `{ playerId, stat, amount }`.
- Allowed only while the match is `ongoing` (409 otherwise).
- `stat` must be a number column on the sport's score sheet (400 otherwise).
- `amount` is a non-zero whole number. For `points` it can go up to the sport's largest point
  value; for every other stat it is exactly 1, positive or negative.
- The player must be on either team's roster (400 otherwise).
- A positive amount is an atomic `$inc` with upsert.
- A negative amount (an undo) is an atomic `$inc` that only applies if the current value is
  high enough, so a stat never goes below 0 (409 otherwise).
- Returns `{ playerId, stat, value }`.
- Does **not** change the team score.

**POST `/api/organizer/matches/:matchId/substitute`** (organizer for their own sport, or
super_admin)

- Body: `{ side, outId?, inId? }`.
- Allowed only while the match is `ongoing`, and only for sports with an on-court count.
- It can swap two players, add a player to a side that is short (`inId` only), or take a
  player off (`outId` only).
- The maximum number on court is enforced.
- Each substitution is appended to `Match.subs`.
- **Atomic since Oct 15:** one conditional `findOneAndUpdate`, with `subs` appended in the same
  update. On no match it returns 409 `lineup_changed` and the screen re-reads the match.
  - Swap: the filter requires the outgoing player in the lineup and the incoming one not in
    it; the positional `$` replaces that same slot.
  - Add only: `$push`, with a filter that the player is absent and the lineup is below the
    court size.
  - Remove only: `$pull`, with a filter that the player is present.

### Changed

| Method | Path | Change |
|---|---|---|
| POST | `/api/organizer/matches/:matchId/score` | For points-scored sports, this is now one atomic `findOneAndUpdate` with `$inc` on `liveScoreA/B` (filtered on `status: 'ongoing'`). A negative amount only applies if the score is high enough. **Since Oct 15**, games-won sports (chess, billiards, esports) are atomic too: the `$inc`, the `$push` of the game and `lastAction` happen in one update. It only applies if both scores and the number of games are still what the route read; otherwise it returns 409 `score_changed`. |
| POST | `/api/organizer/matches/:matchId/undo` | **Since Oct 15**, atomic: `$inc` minus the last tap (and `$pop` of the last game for games-won sports). It only applies if the same `lastAction` is still the last one, the score is high enough and, for a game, the game count is unchanged. A second Undo finds nothing to undo. |
| PUT | `/api/organizer/matches/:matchId/stats` | **Since Oct 15**, per team: `?side=A` or `?side=B`, body `{ players, version }`. Only that team's players are accepted (400 otherwise). The version is checked and increased atomically (`formVersion.A/B`); a stale save gets 409 `stale_form`. A sport with no live stats has no stats jobs, so the score keeper saves both teams at once (no `side`, `version: { A, B }`). Player points are still capped at that team's score. The MVP moved to `PUT /result`. |
| POST | `/api/organizer/matches/:matchId/player-stat` | **Since Oct 15**, only from the device holding the stats job of the player's team. |
| POST | `/api/organizer/matches/:matchId/claim`, `/release` | New, see above. |
| POST | `/api/organizer/matches/:matchId/start` | Accepts `lineupA` / `lineupB` (arrays of player ids). They are required when a roster is bigger than the court size (400 otherwise). They are validated: no duplicates, every player on that team, at most the court size, at least one player. Start also clears `subs`. |
| POST | `/api/organizer/matches/:matchId/cancel` | Also clears `lineupA`, `lineupB` and `subs`. It already deleted the match's `PlayerMatchStats`, so live taps are discarded as well. |
| GET | `/api/organizer/matches/:matchId` | It now also returns `onCourt`, and the match carries `lineupA`, `lineupB`, `subs` and (Oct 15) `formVersion`. Its `statByPlayer` is what the organizer screens show live, and it pre-fills the after-match form. Since Oct 15 it also returns `myJob` and `jobs` (for each job: `taken`, `mine`, `stale`, `seenSecondsAgo`). Device ids are never sent to the browser. It refreshes this device's `seen` time (at most every 30 s). |
| GET | `/api/public/teams/:id` | **Public.** New `live` field (see below). Still returns no birthdate, address or documents. |

The new `live` field on `GET /api/public/teams/:id` is `null` unless the team has an
`ongoing` match. In that case it is:

```
{
  matchId,
  opponent: { id, name, barangayId },
  score, opponentScore,
  period, periods, periodLabel, gamesWon,
  stats: { <playerId>: { points, fouls, rebounds, assists } }
}
```

### Unchanged but relevant

| Method | Path | Notes |
|---|---|---|
| POST | `/api/organizer/matches/:matchId/end-period`, `/end`, `/start`, `/cancel`, `/forfeit` | Unchanged logic (read, change, save); since Oct 15 only the score keeper's device may call them. They don't write the score fields, so they can't overwrite a score tap. |

## 5. Real-time mechanism

The system uses **HTTP polling only**. There are no WebSockets, Server-Sent Events or push
messages.

| Screen | Interval | Changed? |
|---|---|---|
| Organizer match screen (`ScoringView` in `OrganizerScoring.jsx`) | **3 s**, only while the match is `scheduled` or `ongoing` and the browser tab is visible | **New** (`fb703e8`). This keeps the three devices in step. If the response is identical to the last one, nothing re-renders. |
| Public team page (`/teams/:id`, `TeamDetail.jsx`) | **5 s** while the team has a live match, **10 s** otherwise | **Changed.** It was 10 s fixed. |
| Public Home (`/`) and Matches (`/matches`) | 10 s | Unchanged |
| Public Standings (`/standings`) and Brackets (`/brackets`) | 15 s | Unchanged |
| Public Players (`/players`) | Loaded once, no polling | Unchanged |

On a stats keeper's own device, a tap shows its new value right away, using the value the
server returns.

The other two devices and the public pages see a change on their next poll. In the worst case
that is about 3 s for the organizer devices and about 5 s for the public team page, plus
request time.

## 6. UI changes per role

### Organizer: route `/organizer`, page `OrganizerScoring.jsx`, open match (`ScoringView`)

- **"Your job on this match" card** (`JobPicker`), with three buttons: Score keeper, Stats:
  <Team A>, Stats: <Team B>.
  - **Since Oct 15 the job is claimed on the server** (see section 9.1), no longer remembered
    only in the tab.
  - Each button shows one of these states:
    - "This device".
    - "Taken by another device" (greyed out, can't be tapped).
    - "Inactive for N min. Tap to take over" (amber; asks for confirmation).
    - Its description, when it is free.
  - The score keeper also sees **"Free this job"** under a stats job held by another device.
  - Switching jobs after Start asks "Switch job?" first.
  - When the sport's score sheet has no number column, there is only the score keeper job.
    The screen takes it automatically if it is free; if another device holds it, the card shows
    just that one job.
  - On a finished match the card is shown only to a device without a job, so it can claim one
    to reach the forms.
- **Score keeper view:**
  - The pre-start card, with period count and Start.
  - The team score buttons.
  - Undo, End this period/set, End match and Cancel match.
  - An **"On court" card** with a Substitute button per team (`OnCourtCard`, `SubDialog`).
- **Starting lineup modal** (`LineupDialog`): opens from Start when either roster is bigger
  than the court size. The keeper picks up to N players per team (fewer is allowed, with a
  warning), then the match starts from the modal.
- **Stats keeper view** (`StatsKeeperPanel`):
  - One card per player of that team. A button for each number column: points use the sport's
    point values (e.g. +1/+2/+3), every other stat is +1.
  - Each card shows the player's running totals.
  - When a lineup exists, only on-court players get buttons, each with a **Sub** button. The
    bench is listed below with a Substitute button.
  - There is an Undo button for this device's own last tap.
  - Before the match starts, a note says "Waiting for the score keeper to start the match".
- **After-match forms** (Oct 15: per device; `StatsDialog` with `StatsForm` or `ResultForm`).
  When the match ends, each device opens its own form by itself:
  - **Score keeper: "Confirm the result"** (`ResultForm`): the final score and period scores
    (read-only), "<team> won", and the MVP picker. A "Result & MVP" card reopens it.
  - **Each stats keeper: "Player stats · <their team>"** (`StatsForm only="A"/"B"`): only that
    team's players, pre-filled with the live taps. A card reopens it. Saved / Not saved yet
    follows that team's form version.
  - For a sport with no live stats (e.g. Mobile Legends' role sheet), the score keeper gets
    both: the result form, and the old two-team "Player stats" form.
  - If someone saved the same form in between, the save is refused and an amber bar at the top
    of the form says **"Someone else saved this form. Reload to see the latest."** Its
    **Reload** button re-reads the match and opens a fresh copy of the form.
- **Taps are instant** (Oct 15): a score or stat tap shows at once. If the server refuses it,
  the tap is taken back off the screen and the error is shown.

The organizer's Dashboard (`/organizer/dashboard`) did not change for this feature. A group
filter was added to the organizer match list in `b5399e1` (Sep 30); it is unrelated to stats.

### Super Admin

- **No screen changed for live stats.**
- The `/organizer` route also admits `super_admin`, and the organizer API accepts a Super
  Admin for any sport. Nothing in the Super Admin menu links to it.
- Which stats are recorded is still set per sport in **League Setup** (`/admin/config`), in the
  "After-match score sheet" step. The same columns now drive the live buttons.

### Barangay Admin

- **No change.** The Matches page (`BrgyMatches.jsx`) does not show live player stats. A
  Barangay Admin can see them on the public team page like anyone else.

### Public Viewer

- **Team page** (`/teams/:id`, `TeamDetail.jsx`) has a new **"Live now"** panel while the team
  is playing. It shows:
  - the pulsing live dot;
  - "Quarter 2 of 4" (or "Best of N" for a games-won sport);
  - the team name, score and opponent (a link to the opponent's page);
  - a table of this team's players who have a stat in this game, with jersey, name and only the
    sheet's columns among PTS / REB / AST / Fouls.
- The season "Roster" table below sums all of this season's `PlayerMatchStats`, including the
  match in progress. GP (games played) counts completed matches only.
- No other public page changed for live stats. Home and Matches show only the live team score,
  as before.

## 7. Which stats are recorded per sport

The live buttons are the **number** columns of the sport's score sheet (`rulesFor().statFields`).
The `role` column is a pick-list and is only on the after-match form. The Super Admin can change
the sheet per sport in League Setup. The built-in defaults (`DEFAULT_SHEET`) apply when no
choice has been saved:

| Sport | Default sheet | Live player stats by default? |
|---|---|---|
| Basketball | points, assists, fouls, rebounds | Yes: +1/+2/+3 PTS, +1 AST, +1 FOUL, +1 REB |
| Volleyball | points | Yes: +1 PTS |
| Badminton | points | Yes: +1 PTS |
| Pickleball | points | Yes: +1 PTS |
| Billiards | (none) | No. The screen is the score keeper's only ("X won a game") |
| Chess | (none) | No. The screen is the score keeper's only |
| Mobile Legends | role | No. Role is not a number column, so there are no live jobs; the role is picked after the match |

- If the Super Admin ticks number columns for one of the "No" sports, the job picker and live
  buttons appear for it automatically. For example: kills / deaths / assists for an esport, or
  points for a board game.
- Columns that can be offered, by sport type:
  - Sport: points, assists, rebounds, fouls, blocks, steals, turnovers, aces, digs.
  - Esports: kills, deaths, assists, role.
  - Board game: points.
  - Plus custom columns the Super Admin adds.
- Points, assists, rebounds and fouls are real columns. Every other column goes in `extra` and
  is not shown on public pages.
- The public "Live now" table shows only points, rebounds, assists and fouls.

### When stats can be entered or corrected

| When | How | Limits |
|---|---|---|
| During the match (`ongoing`) | Stats keeper taps (`POST .../player-stat`) | Only the device holding that team's stats job (Oct 15). No cap against the team score. A negative amount is only used by Undo. |
| Undo during the match | The stats keeper's Undo button sends the last tap back as a negative amount | Each device keeps its own list of its last 30 taps in memory (React state). That list is lost if the page is reloaded or the job is switched. Undo never goes below 0. |
| Before Start, or after End match | Refused (409) | Live taps are only accepted while `ongoing` |
| After the match (`completed`) | Each team's "Player stats" form on its stats keeper's device (`PUT .../stats?side=A/B`), pre-filled with the live values; it can be reopened and saved again any time | Values 0 to 999. Player points per team can't exceed the team score (points-scored sports). A save from an outdated copy is refused (409, Reload). |
| MVP | The score keeper's "Confirm the result" form (`PUT .../result`) | Version-checked like the stats forms. |
| Cancel match | All live taps for that match are deleted | |

### Effect on standings and MVP

- **Standings and brackets: no effect.** Advancement and standings come only from the team
  score and match results.
- **MVP: not computed from the stats.** The organizer picks it on the after-match form (or
  sends `mvpPlayerId` with End match). The public MVP counts and badges read `Match.mvp`.
- Player stats feed only these displays:
  - the team page's season totals and its "Live now" box;
  - the Players page cards (games played, points, MVP awards);
  - the MVP hover card's points for that match;
  - `/api/public/leaders` (still in the API, no longer shown on any page).

## 8. Testing

- **No automated tests were added.** The repository has no test suite: there is no test script
  in `backend/package.json` and no test files in the app.
- According to the project notes (`PROJECT_NOTES.md`), the routes were checked with throwaway
  scripts against stubbed Mongoose models. Those scripts are not committed.
  - `fb703e8`: taps, undo, an invalid stat / amount / player, the team score left untouched by
    player taps, and taps refused once the match is completed.
  - `16bb8ae`: start with and without a lineup, and substitutions (10 cases).
- The notes state that neither change has been **run in a browser, against the real database,
  or on three real devices**.

**Oct 15 2026 changes.** Still no committed test suite; the test scripts were run from a
scratch folder and are not in the repository.

- **Instant taps:**
  - Headless Edge against a mock API with a 0.9 s delay: three +2 taps in 0.26 s showed 6 at
    once, and the server had 6.
  - Stat taps and Undo, same result.
- **Atomic Undo:** stubbed models, 4 cases, including a tap landing mid-undo.
- **Jobs, atomic writes and forms: 54 checks, all passing.** The backend's real routes and
  models ran against a **real MongoDB** (`mongodb-memory-server`). They covered:
  - claiming, `job_taken`, `confirm_switch` and stale takeover;
  - release rights, and that no device ids reach the browser;
  - the 403 job checks on every route;
  - 20 parallel score taps (result 20);
  - 10 parallel stat taps, including the first tap creating the record (result 20);
  - Undo racing 5 taps (nothing lost);
  - two simultaneous swaps of the same player (one 200, one 409, lineup intact, the slot
    replaced in place);
  - two adds into one free spot (one wins);
  - two simultaneous chess game taps (score and games stay consistent);
  - per-team forms, stale saves, two saves from the same copy (one 200, one 409), the points
    cap and the result form;
  - a match created before these fields existed.
- **Three browser tabs as three phones: 29 checks, all passing.** The built frontend ran
  against the real routes on the in-memory database, at 390 px width. It covered:
  - each tab picking a different job, and the taken job greyed out;
  - only the score keeper seeing the score buttons;
  - the score reaching the other tabs on refresh;
  - End match opening the result form on the score keeper's tab, and each stats keeper's form
    opening by itself, pre-filled, showing only their team;
  - the stale-save message and Reload;
  - all three saves.
- **Not yet tested:** three real phones, real mobile networks, and the production database.

## 9. Shared Organizer account: three people, one login

This section describes the code **after the Oct 15 2026 changes**. Section 9.5 compares it
with the original Oct 5-6 version.

### 9.1 How a device gets its job (job claiming)

- **Device id.** Each browser tab makes a random id the first time it calls the API
  (`deviceId()` in `frontend/src/api.js`, kept in `sessionStorage` under `device-id`). The id
  survives a reload of that tab and is gone when the tab is closed. Every request sends it as
  the `X-Device-Id` header.
- **Claiming.** Picking a job on the "Your job on this match" card calls
  `POST .../claim { job }`.
  - The server records the claim on the match in `jobs.score`, `jobs.statsA` or `jobs.statsB`,
    as `{ device, since, seen }`.
  - The claim is a single conditional update: it succeeds only if the job is free or already
    this device's. Two devices claiming the same job at the same moment can't both get it.
  - **A job held by another device can't be picked.** The button is greyed out ("Taken by
    another device"), and the server answers 409 `job_taken`.
- **One job per device.** Taking a new job frees the device's old one. Once the match has
  started, switching needs a confirmation: the server answers 409 `confirm_switch`, the screen
  asks "Switch job?", and only then switches.
- **Stuck jobs (a dead phone):**
  - The **score keeper** can tap **"Free this job"** under a stats job held by another device
    (`POST .../release`). The server also lets a Super Admin free any job, but the screen shows
    the "Free this job" button only to the score keeper.
  - A job's `seen` time is refreshed while its device has the match open (the 3-second refresh,
    written at most every 30 s). If it hasn't been refreshed for **2 minutes**, the job shows
    as "Inactive", and another device can **take it over** after a confirmation (`takeOver`).
    This is the only way to recover the **score keeper** job if the score keeper's own phone
    dies and no Super Admin is around. It is an addition to the brief, which only named the
    score keeper freeing jobs.
  - Closing the tab, or a phone killing the browser tab in the background, also loses the
    device id. The same person then comes back as a "new device": they take over their old job
    after 2 minutes, or the score keeper frees it.
- **Enforcement.** Every write route checks the job on the server (403 `not_your_job`); see
  the table in section 4. In short:
  - score, period, end, cancel, undo, start and forfeit: score keeper only;
  - a stat tap: only the stats keeper of that player's team;
  - a substitution: that team's stats keeper or the score keeper;
  - each after-match form: its own job.
- **Sports with no live stats** (no number column on the sheet, e.g. Chess, Billiards, and
  Mobile Legends by default) have only the score keeper job. The screen claims it automatically
  when it is free, so a second device that opens the match can't score.

### 9.2 Saving at the same time

| Action | How it is written now | Can a simultaneous update be lost? |
|---|---|---|
| Player stat tap | One atomic `$inc` (upsert); only from that team's stats keeper | **No.** |
| Stat Undo | Atomic `$inc` with a negative amount, never below 0 | **No.** |
| Team score tap, points-scored sports | Atomic `$inc` | **No.** |
| Team score tap, games-won sports | One conditional update (`$inc` + `$push` game + `lastAction`), only if both scores and the game count are unchanged since read | **No.** The losing request gets 409 `score_changed` and the screen refreshes; it is never silently overwritten. |
| Team score Undo | One conditional update (`$inc` minus the tap, `$pop` game), only if the same last action is still last | **No.** |
| Substitution | One conditional update: positional `$` for a swap, `$push` for add-only, `$pull` for remove-only, plus `$push` to `subs`, filtered on the lineup still looking as expected | **No.** The second of two clashing substitutions gets 409 `lineup_changed`; the screen re-reads the lineup. |
| End period / End match / Start / Cancel / Forfeit | Read, change, `save()`, score keeper only | They don't write the score fields, so a score tap can't be overwritten. A tap still in flight when "End this quarter" is pressed counts toward the next period's split instead (totals stay right). |
| After-match team stats form | Version check: the save sends the version it loaded; an atomic update bumps `formVersion.A/B` only if it still matches, then the rows are written | **No silent overwrite.** A save from an outdated copy gets 409 and the message "Someone else saved this form. Reload to see the latest." |
| Result / MVP form | Same version check on `formVersion.result` | Same. |

- **Optimistic concurrency was NOT switched on** for the Match model (Mongoose
  `optimisticConcurrency`). Every contested write was made a conditional update instead.
- So `match.save()` calls cannot throw a `VersionError`, and no route needed new VersionError
  handling. Turning it on would have changed every other route that saves a match (brackets,
  scheduling, admin results) for no gain here.

### 9.3 Who entered what

- Everyone still shares **one login**, so the record can show **which job's device** did
  something, never the person's name.
- What the server can tell:
  - **Live stat taps:** only the device holding a team's stats job can tap that team, so a
    stat's job is implied by the player's team. No per-tap log is stored.
  - **Substitutions:** each `subs` entry records `by` (`score`, `statsA` or `statsB`).
  - **Score, periods, end:** only the score keeper's device can do them.
  - `Match.enteredBy` is the account that ended the match.
- The device id itself is not a person and isn't kept after the job is released. The jobs
  show who held them *now*, not a history.

### 9.4 Which sports

- **Three jobs (score + two stats keepers):** sports whose score sheet has at least one number
  column. By default that is Basketball, Volleyball, Badminton and Pickleball.
- **Score keeper only:** Chess, Billiards and Mobile Legends by default. The score keeper also
  fills in their after-match form (Mobile Legends' roles) for both teams.
- A Super Admin can change which sports have stats in League Setup.
- Lineups and substitutions apply to team sports with a court size, as before.

### 9.5 Risks from the first version: what is fixed, what remains

| Risk (original section 9.5) | Status |
|---|---|
| Simultaneous substitutions on the same team could silently drop a swap | **Fixed:** atomic conditional updates; the loser gets 409 and refreshes. |
| Games-won scoring and team-score Undo could overwrite a simultaneous request | **Fixed:** both are conditional atomic updates. Also only one device (the score keeper) can send them. |
| After-match form was last-save-wins for both teams and the MVP | **Fixed:** per-team forms, each saved only by its team's stats keeper, all version-checked; the MVP is on the score keeper's own form. |
| No server-side job separation; any device could change the other team's stats or the score | **Fixed:** jobs are claimed per device and every write route checks them. |

**Still limitations:**

1. **One shared login.**
   - The system tells *devices* apart, not people. A record shows the device's job, never the
     person's name.
   - Anyone with the password and a device can claim a free job.
   - The device id is only an identifier, not a secret. A device that copied another's id
     could act as it; with everyone on the same account anyway, this is not a security
     boundary.
2. **Device id lives in one tab.**
   - Closing the tab (or a phone discarding it in the background) means a new id. The person
     has to wait 2 minutes and take over, or ask the score keeper (or a Super Admin) to free
     the job.
   - Chrome's "Duplicate tab" copies `sessionStorage`, so a duplicated tab would share the id.
3. **A quiet job can be taken over after 2 minutes.**
   - The open screen refreshes `seen` only while it is visible. A phone left with its screen
     off for more than 2 minutes can lose its job to another device that deliberately taps
     "Take over".
   - Taking over always asks for confirmation.
4. **No per-tap history.** Stat taps are totals with no log of each tap or its time. Undo is
   only "this device's last taps", kept in that tab's memory.
5. **End period split.** A score tap still saving when "End this quarter" is pressed is
   counted in the next period's split. The match total is unaffected.
6. **Not yet tested on three real phones** (see section 8).

## 10. Commits since September 29, 2026

The commits relevant to live stats are `fb703e8` and `16bb8ae`. Related: `ecca6ca` and
`044af88` (the after-match form), `b5399e1` (organizer match filter) and `69921d8`
(`Match.enteredByName`). `950d0bf` is dated the day of the mock defense.

| Commit | Date | Description |
|---|---|---|
| `950d0bf` | 2026-09-29 | Redesign Champions pages, zoomable public champion photos, compact brackets on phones |
| `b71dba3` | 2026-09-30 | Count forfeits as finished matches; show forfeits in brackets |
| `4f708ab` | 2026-09-30 | Public tab rows: visible scrollbar, arrows and wheel scrolling |
| `b5399e1` | 2026-09-30 | Organizer: filter matches by group (A, B, C, D... / Knockout) |
| `b96b822` | 2026-09-30 | Brackets: show 2nd place (final's loser) on the Champion card |
| `d5d80ef` | 2026-09-30 | Brackets: 2nd place as its own box under the Grand Final |
| `4ea6d7e` | 2026-09-30 | Champions: type only the prize amount, peso sign added automatically |
| `513b853` | 2026-09-30 | Standings: knockout table so knockout (and forfeit) wins show |
| `b0defb5` | 2026-10-01 | Standings: double-elim groups ordered by seed, then fewest losses |
| `629777b` | 2026-10-01 | CLAUDE.md: note double-elim standings order |
| `d0e4ae0` | 2026-10-01 | Brackets: winner row green, loser row red |
| `616d5f2` | 2026-10-01 | Brackets: medal icons, bronze 3rd place; remove Revert button |
| `b7c1751` | 2026-10-01 | Public Matches: tabs, day/competition grouping, match card grid |
| `d6deefc` | 2026-10-01 | Untrack design reference image committed by mistake |
| `f8d5ba2` | 2026-10-01 | Public viewer: indigo/violet palette, VS-style match cards |
| `ed51ca9` | 2026-10-01 | Public viewer: steel-navy + yellow palette, clean match cards (replaces purple) |
| `42e60b1` | 2026-10-01 | Public: VS match rows (one per row) on Matches and Home |
| `4bc2639` | 2026-10-01 | Standings: glassmorphism panels; VS rows: venue under the VS |
| `7b3ad70` | 2026-10-01 | Public viewer: glassmorphism everywhere; bold venue with pin under the VS |
| `924bdda` | 2026-10-01 | Players page: remove Top scorers view |
| `98562e4` | 2026-10-01 | Team page: all stat columns bright like PTS |
| `9881452` | 2026-10-01 | Players page: poster-card rows like Teams (bigger); open on first sport tab |
| `5327900` | 2026-10-01 | Public: Teams cards like Players; perf pass (instant Matches skeleton, no idle redraws, cached date formatters, cheaper glass) |
| `cab013a` | 2026-10-01 | Standings: Knockout box sized like a group box, centred |
| `ecca6ca` | 2026-10-01 | Organizer: player stats score sheet as a modal |
| `e37e3ff` | 2026-10-01 | CLAUDE.md: note organizer score sheet modal |
| `044af88` | 2026-10-01 | Organizer score sheet: player points capped at the team's score (form + server) |
| `4c7659b` | 2026-10-01 | VS rows: sport/division centred above the score; drop venue from Matches headings |
| `cdd30f5` | 2026-10-01 | VS rows: lift sport/division label off the score; more space between rows |
| `ceb2159` | 2026-10-01 | Champions: replaced photo shows without a refresh (file id in photo URL) |
| `8715c85` | 2026-10-01 | Admin Tournaments: each group and the knockout in its own glass panel |
| `c1f1887` | 2026-10-01 | Admin Tournaments: round-robin group matches collapse per round |
| `842b2be` | 2026-10-02 | Player photo crop/zoom before upload; compact admin brackets on phones |
| `28e219b` | 2026-10-02 | Remove em dashes from user-facing text; login brand links to public Home |
| `d049a24` | 2026-10-02 | CLAUDE.md: fix capitalisation in login note |
| `546e451` | 2026-10-02 | Players page: React Bits Depth Carousel per team |
| `33ccac6` | 2026-10-02 | Players carousel: bigger front card and no swipe lag on phones |
| `3d2060c` | 2026-10-02 | Teams page: Depth Carousel; desktop carousel lag fixes |
| `13f8660` | 2026-10-03 | Lock League Setup while the season is ongoing |
| `a656323` | 2026-10-03 | Admin sidebar: collapse without re-laying out the whole page |
| `c967e1f` | 2026-10-03 | Match MVP on brackets, flip player cards, phone carousel arrows |
| `e1149e6` | 2026-10-03 | Carousel: taps right after a swipe always register |
| `e3fb794` | 2026-10-03 | Block NoSQL operator injection in request bodies |
| `7bc0896` | 2026-10-03 | Public Champions: leaderboard + per-barangay trophy cabinet |
| `69921d8` | 2026-10-03 | Accounts: delete organizers after their season; repair CLAUDE.md |
| `ffba728` | 2026-10-03 | Calm admin look for all roles, League Setup steps, faster admin, public polish |
| `cbfaf7e` | 2026-10-03 | Esports-only knockout choice; one team per division otherwise |
| `0073a0c` | 2026-10-03 | Phone layout fixes; Set a new password page in the calm look |
| `5912e58` | 2026-10-03 | Set a new password: same split screen as Login (shared AuthBrandPanel) |
| `0104579` | 2026-10-03 | First-login guide opens on the dashboard; League Setup games in a modal |
| `9cfbebe` | 2026-10-03 | Admin banner look for all roles; public viewer near-black + green with new Home |
| `1fe57d2` | 2026-10-03 | Admin: pale green page with white cards and sidebar, green accent |
| `8c597e8` | 2026-10-03 | Admin light mode: white page, sidebar and cards |
| `b8f7bb7` | 2026-10-03 | Instruction guide: new screenshots for the redesigned admin, old ones removed |
| `78d9556` | 2026-10-03 | Docs: fix the screenshot note |
| `65c25df` | 2026-10-04 | Admin: tap the top-bar avatar for Profile on phones; banner picture on the Season card |
| `d6dd7dd` | 2026-10-04 | Season tracker: segmented bar style |
| `24e73d4` | 2026-10-04 | Season: banner fills the whole season card, icon-card stage tracker, readable stage pill in dark mode |
| `58cdfb9` | 2026-10-04 | Revert the full-card banner and icon-card tracker; keep the readable stage pill in dark mode |
| `a28cbcd` | 2026-10-04 | Season tracker: back to the original numbered circles |
| `783aa71` | 2026-10-04 | Season: picture fills the whole season card again, original circles tracker drawn readably on it |
| `2c429c1` | 2026-10-04 | Delete a past season from Season history; Champions get a seasonal and an all-time leaderboard |
| `c8608ea` | 2026-10-04 | Lock page scroll behind dialogs, sheets and the phone menu; profile banner and photo update without a refresh |
| `1353d0c` | 2026-10-04 | Public: popups scroll again with Lenis paused; desktop header blends into the page; cleaner phone nav icons |
| `b31dca8` | 2026-10-04 | Home: hero copy starts lower, clear of the desktop header |
| `c8472d1` | 2026-10-04 | Reference List: current-list status on the banner picture |
| `fca2abb` | 2026-10-04 | Reference List: banner picture as the whole page background, content on solid cards |
| `03bc541` | 2026-10-04 | Revert "Reference List: banner picture as the whole page background, content on solid cards" |
| `a5357d3` | 2026-10-04 | Revert "Reference List: current-list status on the banner picture" |
| `6ad86e9` | 2026-10-04 | Docs: note the rejected Reference List banner trials |
| `18ecfcc` | 2026-10-04 | Reference list upload: lean bulk insert, batched season re-screen that reuses the uploaded rows |
| `99db30e` | 2026-10-04 | Admin: promo-style page banner with a drawn illustration on every non-Dashboard page |
| `0f05288` | 2026-10-04 | Banners: none on Season; the guide opens on the current page's step |
| `558f00f` | 2026-10-04 | Photo page banners, glowing season steps and played bracket lines; drop the local banner.jpg fallback |
| `fb703e8` | 2026-10-05 | Live player stats with 3 people per match, demo data generator, champions report, scheduling and verification rules |
| `54ba696` | 2026-10-06 | Public Home: hero photo fills the full screen width on wide monitors |
| `16bb8ae` | 2026-10-06 | Organizer: starting lineup modal at Start and substitutions while live |
| (Oct 15 commit) | 2026-10-15 | Organizer: instant score/stat taps; one device per job; atomic substitutions, games-won scoring and undo; per-team version-checked after-match forms; this document |
