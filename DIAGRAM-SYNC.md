# DIAGRAM-SYNC — labels for the thesis diagrams, read from the code

Source of truth: the code at commit `3d28636` (26 Sep 2026). Every string in `code font` is copied
from the code. Where the code and `CLAUDE.md` disagree, it is marked **⚠ Mismatch**.

---

## 1. ERD

### 1.1 Collections

Mongoose models map to these MongoDB collection names. The names were confirmed against the dev
database (22 collections: 14 model collections + 8 GridFS collections).

| Model (`backend/src/models/`) | Collection |
|---|---|
| `Barangay` | `barangays` |
| `Champion` | `champions` |
| `Document` | `documents` |
| `Match` | `matches` |
| `Player` | `players` |
| `PlayerMatchStats` | `playermatchstats` |
| `ReferenceList` | `referencelists` |
| `Season` | `seasons` |
| `SiteImage` | `siteimages` |
| `Sport` | `sports` |
| `Team` | `teams` |
| `TeamPlayer` | `teamplayers` |
| `Tournament` | `tournaments` |
| `User` | `users` |

Every schema has `timestamps: true`, so every document also has `createdAt` and `updatedAt`
(Date), plus `_id` (ObjectId).

⚠ Mismatch: `CLAUDE.md` describes a `verified_residents` collection (step 5 of the verification
flow, marked PENDING). No such model or collection exists. Approving a player writes only to
`players` and `documents`.

### 1.2 Fields

"—" = not set. "ref" = the model the ObjectId points to.

#### `barangays` (Barangay)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `name` | String (trim) | yes | — | — | — |
| `allowsCrossBarangay` | Boolean | no | `false` | — | — |
| `logo` | ObjectId (GridFS file in `logos`) | no | `null` | — | — |

#### `champions` (Champion)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `year` | Number | yes | — | — | — |
| `sport` | String (trim) — free text, not a ref | yes | — | — | — |
| `division` | String (trim) | no | `''` | — | — |
| `barangay` | String (trim) — free text, not a ref | yes | — | — | — |
| `teamName` | String (trim) | no | `''` | — | — |
| `mvp` | String (trim) | no | `''` | — | — |
| `prize` | String (trim) | no | `''` | — | — |
| `notes` | String (trim) | no | `''` | — | — |
| `photo` | ObjectId (GridFS file in `champions`) | no | `null` | — | — |
| `addedBy` | ObjectId | no | `null` | — | `User` |

⚠ Mismatch: `CLAUDE.md`'s data model lists `season/year, sport, division, teamName, playerName,
proofPhoto`. The code has no `season`, `playerName` or `proofPhoto` fields. It has `year`,
`barangay`, `mvp`, `prize`, `notes` and `photo` instead.

#### `documents` (Document) — residency documents
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `player` | ObjectId | yes | — | — | `Player` |
| `docType` | String | yes | — | `birth_certificate`, `voters_id`, `barangay_clearance`, `parental_consent` | — |
| `file` | ObjectId (GridFS file in `documents`) | yes | — | — | — |
| `verifyStatus` | String | no | `'pending'` | `pending`, `approved`, `rejected` | — |
| `reviewedBy` | ObjectId | no | `null` | — | `User` |
| `reviewedAt` | Date | no | `null` | — | — |

A document links to a player only, not to a team.

#### `matches` (Match)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `tournament` | ObjectId | yes | — | — | `Tournament` |
| `bracket` | String | no | `'group'` | `winners`, `losers`, `final`, `group`, `third`, `knockout`, `ko_final`, `ko_third` | — |
| `round` | Number | no | — | — | — |
| `group` | String | no | `null` | — | — |
| `teamA` | ObjectId | no | `null` | — | `Team` |
| `teamB` | ObjectId | no | `null` | — | `Team` |
| `organizer` | ObjectId | no | `null` | — | `User` |
| `bestOf` | Number (also the period count) | no | `1` | `1, 2, 3, 4, 5, 7` | — |
| `games` | Array of `gameSchema` (below) | no | `[]` | — | — |
| `seriesWinner` | ObjectId | no | `null` | — | `Team` |
| `liveScoreA` | Number | no | `0` | — | — |
| `liveScoreB` | Number | no | `0` | — | — |
| `startedAt` | Date | no | `null` | — | — |
| `mvp` | ObjectId | no | `null` | — | `Player` |
| `nextMatchWin` | ObjectId | no | `null` | — | `Match` |
| `nextMatchLose` | ObjectId | no | `null` | — | `Match` |
| `isTiebreaker` | Boolean | no | `false` | — | — |
| `status` | String | no | `'scheduled'` | `scheduled`, `ongoing`, `completed`, `forfeited` | — |
| `lastAction.type` | String | no | `null` | — | — |
| `lastAction.side` | String | no | `null` | — | — |
| `lastAction.player` | ObjectId | no | `null` | — | `Player` |
| `lastAction.amount` | Number | no | `0` | — | — |
| `lastAction.label` | String | no | `''` | — | — |
| `schedule` | Date | no | — | — | — |
| `venue` | String (trim) | no | `""` | — | — |
| `enteredBy` | ObjectId | no | `null` | — | `User` |
| `enteredAt` | Date | no | `null` | — | — |

Embedded `gameSchema` (`_id: false`, one entry per period):
| Field | Type | Required | Default | Ref |
|---|---|---|---|---|
| `gameNumber` | Number | yes | — | — |
| `scoreA` | Number | no | `0` | — |
| `scoreB` | Number | no | `0` | — |
| `winner` | ObjectId | no | `null` | `Team` |

⚠ Mismatch: `CLAUDE.md`'s data model omits `Match.organizer` and `gameSchema.winner`. Also, one
line in `CLAUDE.md` says "Per-match best_of: 1/3/5/7", but the enum also allows `2` and `4`.

#### `players` (Player)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `firstName` | String (trim) | yes | — | — | — |
| `middleName` | String (trim) | no | — | — | — |
| `lastName` | String (trim) | yes | — | — | — |
| `birthdate` | Date | yes | — | — | — |
| `age` | Number | no | — | — | — |
| `photo` | ObjectId (GridFS file in `photos`) | no | `null` | — | — |
| `address` | String (trim) | no | — | — | — |
| `jerseyNumber` | Number | no | — | — | — |
| `eligibilityStatus` | String | no | `'pending'` | `pending`, `eligible`, `needs_document`, `flagged` | — |
| `flagReason` | String | no | `""` | — | — |

A player has no `team` or `barangay` field. Team membership is only in `teamplayers`. The schema
doesn't require a middle name or address. The routes require them on the manual "Add a player"
form.

#### `playermatchstats` (PlayerMatchStats)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `match` | ObjectId | yes | — | — | `Match` |
| `player` | ObjectId | yes | — | — | `Player` |
| `points` | Number | no | `0` | — | — |
| `fouls` | Number | no | `0` | — | — |
| `rebounds` | Number | no | `0` | — | — |
| `assists` | Number | no | `0` | — | — |
| `extra` | Mixed | no | `undefined` | — | — |
| `role` | String (trim) | no | `null` | — | — |

#### `referencelists` (ReferenceList)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `firstName` | String (trim) | yes | — | — | — |
| `lastName` | String (trim) | yes | — | — | — |
| `middleName` | String (trim) | no | — | — | — |
| `birthdate` | Date | no | — | — | — |
| `barangay` | String (trim) — free text, not a ref | no | — | — | — |
| `season` | ObjectId | yes | — | — | `Season` |
| `uploadedBy` | ObjectId | no | — | — | `User` |

#### `seasons` (Season)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `name` | String (trim) | yes | — | — | — |
| `status` | String | no | `'setup'` | `setup`, `registration_open`, `verification`, `ongoing`, `completed` | — |
| `openedBy` | ObjectId | no | — | — | `User` |
| `openedAt` | Date | no | — | — | — |
| `closedAt` | Date | no | — | — | — |
| `cleanedAt` | Date | no | `null` | — | — |

⚠ Mismatch: `CLAUDE.md`'s data-model block doesn't list `cleanedAt`. It was added Sep 2026 for
the season clean-up and is documented elsewhere in `CLAUDE.md`.

#### `siteimages` (SiteImage)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `key` | String (trim) | yes | — | — (no schema enum) | — |
| `file` | ObjectId (GridFS file in `site`) | no | `null` | — | — |
| `focal` | String | no | `'center'` | `top`, `center`, `bottom` | — |
| `updatedBy` | ObjectId | no | `null` | — | `User` |

`key` values are defined by the exported `SLOTS` constant, not a schema enum: `hero`
(`Home banner`), `league` (`About the league`), `barangay` (`Kolambugan`), `about` (`About page`).

#### `sports` (Sport)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `name` | String (trim) | yes | — | — | — |
| `category` | String | yes | — | `physical`, `esports`, `board` | — |
| `tournamentFormat` | String | yes | — | `double_elimination`, `round_robin` | — |
| `isDivided` | Boolean | no | `false` | — | — |
| `divisions` | [String] | no | `['open']` | — (no schema enum) | — |
| `entryFormat` | String | no | `'team'` | `team`, `singles`, `doubles` | — |
| `scoringMode` | String | no | `null` | `player`, `rally`, `final`, `null` | — |
| `pointValues` | [Number] | no | `undefined` | — | — |
| `periodLabel` | String (trim) | no | `null` | — | — |
| `periodOptions` | [Number] | no | `undefined` | — | — |
| `statTypes` | [String] | no | `undefined` | `foul`, `rebound`, `assist` | — |
| `scoreSheet` | [String] | no | `undefined` | — | — |
| `customStats` | [{ `key`: String (required), `label`: String (required) }], `_id: false` | no | `undefined` | — | — |
| `onCourt` | Number | no | `null` | — | — |
| `teamsPerBarangay` | Number | no | `null` | — | — |
| `numGroups` | Number | no | `null` | — | — |
| `knockoutSize` | Number | no | `null` | — (no schema enum) | — |

A `pre('validate')` hook sets `tournamentFormat = 'round_robin'` whenever `category === 'esports'`.

⚠ Mismatch: `CLAUDE.md` writes `knockoutSize ∈ {8,16}|null` for Sport. The schema has no enum;
the 8/16 limit is enforced in the route (`PATCH /api/sports/:id/config`). `Tournament.knockoutSize`
does have the enum.

#### `teams` (Team)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `teamName` | String (trim) | yes | — | — | — |
| `barangay` | ObjectId | yes | — | — | `Barangay` |
| `sport` | ObjectId | yes | — | — | `Sport` |
| `season` | ObjectId | yes | — | — | `Season` |
| `status` | String | no | `'pending'` | `pending`, `verified`, `rejected` | — |
| `submittedAt` | Date | no | `null` | — | — |
| `division` | String | no | `'open'` | `open`, `boys`, `girls`, `under15`, `under30` | — |
| `format` | String | no | `'team'` | `team`, `singles`, `doubles` | — |

#### `teamplayers` (TeamPlayer) — the many-to-many link between teams and players
| Field | Type | Required | Default | Ref |
|---|---|---|---|---|
| `team` | ObjectId | yes | — | `Team` |
| `player` | ObjectId | yes | — | `Player` |

#### `tournaments` (Tournament)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `sport` | ObjectId | yes | — | — | `Sport` |
| `division` | String | no | `'open'` | `open`, `boys`, `girls`, `under15`, `under30` | — |
| `season` | ObjectId | yes | — | — | `Season` |
| `stage` | String | no | `'group_stage'` | `group_stage`, `elimination`, `completed` | — |
| `format` | String | yes | — | `double_elimination`, `round_robin` | — |
| `groups` | [String] | no | `[]` | — | — |
| `advancePerGroup` | Number | no | `2` | — | — |
| `knockoutSize` | Number | no | `16` | `8`, `16` | — |

#### `users` (User)
| Field | Type | Required | Default | Enum | Ref |
|---|---|---|---|---|---|
| `username` | String (trim) | yes | — | — | — |
| `passwordHash` | String | yes | — | — | — |
| `role` | String | yes | — | `super_admin`, `barangay_admin`, `organizer` | — |
| `barangay` | ObjectId | no | `null` | — | `Barangay` |
| `assignedSport` | ObjectId | no | `null` | — | `Sport` |
| `mustChangePassword` | Boolean | no | `true` | — | — |
| `recoveryCodeHash` | String | no | `null` | — | — |
| `recoveryCodeSetAt` | Date | no | `null` | — | — |
| `photo` | ObjectId (GridFS file in `photos`) | no | `null` | — | — |

### 1.3 Relationships (for the crow's-foot lines)

| From | Field | To | Cardinality |
|---|---|---|---|
| `teams` | `barangay` | `barangays` | many teams : 1 barangay |
| `teams` | `sport` | `sports` | many : 1 |
| `teams` | `season` | `seasons` | many : 1 |
| `teamplayers` | `team` / `player` | `teams` / `players` | teams M : N players |
| `documents` | `player` | `players` | many : 1 |
| `documents` | `reviewedBy` | `users` | many : 0..1 |
| `referencelists` | `season` | `seasons` | many : 1 |
| `referencelists` | `uploadedBy` | `users` | many : 0..1 |
| `tournaments` | `sport` / `season` | `sports` / `seasons` | many : 1 |
| `matches` | `tournament` | `tournaments` | many : 1 |
| `matches` | `teamA`, `teamB`, `seriesWinner`, `games[].winner` | `teams` | many : 0..1 |
| `matches` | `nextMatchWin`, `nextMatchLose` | `matches` (self) | many : 0..1 |
| `matches` | `mvp`, `lastAction.player` | `players` | many : 0..1 |
| `matches` | `organizer`, `enteredBy` | `users` | many : 0..1 |
| `playermatchstats` | `match` / `player` | `matches` / `players` | many : 1 |
| `users` | `barangay` | `barangays` | 0..1 (barangay_admin only) |
| `users` | `assignedSport` | `sports` | 0..1 (organizer only) |
| `seasons` | `openedBy` | `users` | many : 0..1 |
| `champions` | `addedBy` | `users` | many : 0..1 |
| `siteimages` | `updatedBy` | `users` | many : 0..1 |

`champions.sport`, `champions.barangay` and `referencelists.barangay` are plain strings, with no
foreign key.

### 1.4 Indexes

Every collection also has the default unique `_id` index.

| Collection | Index | Unique | Source |
|---|---|---|---|
| `barangays` | `{ name: 1 }` | yes | `unique: true` on `name` |
| `sports` | `{ name: 1 }` | yes | `unique: true` on `name` |
| `users` | `{ username: 1 }` | yes | `unique: true` on `username` |
| `siteimages` | `{ key: 1 }` | yes | `unique: true` on `key` |
| `teamplayers` | `{ team: 1, player: 1 }` | yes (compound) | `teamPlayerSchema.index` |
| `playermatchstats` | `{ match: 1, player: 1 }` | yes (compound) | `playerMatchStatsSchema.index` |
| `champions` | `{ year: -1, sport: 1 }` | no (compound) | `championSchema.index` |
| `referencelists` | `{ season: 1 }` | no | `referenceListSchema.index` |
| `referencelists` | `{ season: 1, lastName: 1, firstName: 1 }` | no (compound) | `referenceListSchema.index` |

There are no other indexes: `teams`, `players`, `documents`, `matches`, `tournaments` and
`seasons` have only `_id`.

### 1.5 GridFS buckets

Each bucket is two collections: `<bucket>.files` and `<bucket>.chunks`. Helpers are in
`backend/src/config/gridfs.js`.

| Bucket | Contents | Referenced by | Access |
|---|---|---|---|
| `photos` | Player headshots **and** staff profile photos | `players.photo`, `users.photo` | Public read (`GET /api/teams/players/:playerId/photo`, `GET /api/auth/users/:id/photo`) |
| `documents` | Residency documents (image or PDF) | `documents.file` | Authenticated only: `super_admin` (any), `barangay_admin` (own team) |
| `champions` | Champion photos | `champions.photo` | Public read (`GET /api/champions/:id/photo`) |
| `site` | Home/About page images | `siteimages.file` | Public read (`GET /api/public/site-image/:key`) |
| `logos` | Barangay logos | `barangays.logo` | Public read (`GET /api/barangays/:id/logo`) |

The `documents` model collection and the `documents` GridFS bucket (`documents.files`,
`documents.chunks`) are separate collections with a similar name.

Upload limits: photos 3 MB, `image/jpeg|png|webp`. Documents 8 MB, the same image types plus
`application/pdf`.

---

## 2. HIPO charts and use case: pages, routes, labels, buttons

Routes come from `frontend/src/App.jsx`, menu labels from `frontend/src/components/menus.js`, and
page titles from each page's `AdminLayout title=`. The sidebar also has `Sign out` at the bottom
for all three roles. The header has a `?` guide button, a theme toggle and a profile avatar, which
opens a panel with a change-password form (plus account recovery for Super Admin).

### 2.0 Before login (no role)
| Page | Route | Primary buttons |
|---|---|---|
| Login | `/login` | `Sign in`, `Forgot your password?` → dialog: `Reset password`, `Back to sign in` |
| Set a new password (heading `Set a new password`) | `/change-password` | `Update password` |

The public site has no link to `/login`.

### 2.1 Super Admin (`super_admin`)

The sidebar is grouped. Headers are shown exactly as below.

| Group header | Menu label | Route | Page title | Primary buttons (on-screen text) |
|---|---|---|---|---|
| `Overview` | `Dashboard` | `/admin` | `Dashboard` | `Manage season`, `Create a season` |
| `Season & Verification` | `Season` | `/admin/season` | `Season` | `Create Season` / `Create New Season`, the next-stage button (`Open registration`, `Move to Verification`, `Start the season`, `Close the season`), `Move on anyway` (in the confirm dialog when items are unfinished), `Create`, `Clean up` → dialog `Clean up (N MB)` |
| `Season & Verification` | `Reference List` | `/admin/reference` | `Reference List` | `Upload & Replace List`, `Show all residents`, `Prev`, `Next` |
| `Season & Verification` | `Review Queue` (red count badge) | `/admin/review` | `Review Queue` | `All barangays` + barangay chips, `Approve`, `Reject`, `Verify Team`, `Reopen for corrections`, `View in Reference List →`. Sections: `Waiting for the barangay to resubmit`, `Verified teams` |
| `Competition` | `League Setup` | `/admin/config` | `League Setup` | `Add a game`, `Add game`, `Remove game` → `Delete everything`, `Save changes`, `Discard`, `Use the default scoring rules`, `Add column`, `Use the default columns`, `How each type is scored`, `Add a barangay` |
| `Competition` | `Tournaments` (expands to one child per sport) | `/admin/tournaments`, `/admin/tournaments/:sportId` | — | `Generate <Sport> Tournament`, `Generate Knockout Bracket (N teams)`, `Generate Tiebreaker Playoff`, `Delete tournament`, `Revert`; section `Schedule`: `Apply to round`, `Save`; orphan cards: `Delete all N` |
| `Content` | `Champions` | `/admin/champions` | `Champions` | `Add champion`, `Save changes`, `Cancel`, `Delete` (edit dialog title `Edit champion`) |
| `Content` | `Reports` | `/admin/reports` | `Reports` | `Print / Save as PDF` (card heading `Season records`) |
| `Content` | `Site Images` | `/admin/site-images` | `Site Images` | file input per slot, `Remove`; crop dialog `Cancel` |
| `Administration` | `Accounts` | `/admin/accounts` | `Accounts` | `Add account`, `Provision all`, `Create account`, `Copy`, `Reset password`, `Delete` |

The Super Admin can also open `/organizer` (route allows `organizer` and `super_admin`), but it
isn't in the Super Admin menu.

### 2.2 Barangay Admin (`barangay_admin`)
| Menu label | Route | Page title | Primary buttons |
|---|---|---|---|
| `Dashboard` | `/brgy/dashboard` | `Dashboard` | `Manage teams`, `Open Verification Status`, `All my matches` |
| `My Teams` | `/brgy` | `Team Registration` | `Create team`, `View roster` / `Edit roster`, `Delete team`, `Remove logo`; roster editor: `Add player` (form heading `Add a player`), `Import CSV`, `Submit roster`, `Save`, `Cancel`, remove-player icon (`aria-label="Remove player"`) |
| `Verification Status` | `/brgy/documents` | `Verification Status` | document-type picker, `Choose file` (`Uploading…` while busy), view (eye icon), delete (trash icon) |
| `Matches` | `/brgy/matches` | `Matches` | (read-only list) |

⚠ Mismatch: `CLAUDE.md` calls `/brgy/documents` the "Document Submission" page. The menu label
and the page title in the code are both `Verification Status`.

### 2.3 Organizer (`organizer`)
| Menu label | Route | Page title | Primary buttons |
|---|---|---|---|
| `Dashboard` | `/organizer/dashboard` | `Dashboard` | `Open scoring` |
| `Matches` | `/organizer` | `Matches` | tabs `To play` / `Completed`, filter `All divisions`, `All matches` (back), `Start match` (or `Start match · N <period>s`), `+1` / `+2` / `+3` (one button per point value set in League Setup; built-in default: `+1`, `+2`, `+3` for Basketball, `+1` for the other point-scored sports), `<Team> won a game` (games-won sports), `Undo`, `End this <period label>`, `End match`, `Cancel match`, `A team didn't show up` (forfeit), `Save player stats`; MVP picker `MVP` / `No MVP` |

### 2.4 Public site (no login)

The nav comes from `PublicLayout.jsx`. The phone icon bar uses the `short` labels shown in
brackets.

| Nav label | Route | Refresh |
|---|---|---|
| `Home` | `/` | every 10 s |
| `Matches` | `/matches` | every 10 s |
| `Standings` (`Table`) | `/standings` | every 15 s |
| `Brackets` | `/brackets` | every 15 s |
| `Teams` | `/teams` | none |
| — (from Teams) | `/teams/:id` | none |
| `Players` | `/players` | none |
| `Champions` (`Titles`) | `/champions` | none |
| `About` | `/about` | none |

Any unknown path redirects to `/` (`<Route path="*" element={<Navigate to="/" replace />} />`).

---

## 3. DFDs: data by process area

Collections read and written were taken from each route file's Mongoose calls, plus `.save()`
calls on loaded documents. External entities: Super Admin, Barangay Admin, Organizer, Public
Viewer.

### P1 User management (`routes/auth.js`, `routes/accounts.js`)
| | |
|---|---|
| Reads | `users`, `barangays`, `sports`, `matches` (count by `enteredBy`, before a delete) |
| Writes | `users` (create, update password/`mustChangePassword`/recovery code/photo, delete); GridFS `photos` (profile photo) |
| In, from Super Admin | new account (username, role, barangay or sport), "provision all" request, reset-password request, delete request, recovery-code request (+ current password) |
| Out, to Super Admin | account list (never the hashes), **temporary password** (10 characters, shown once), **recovery code** `XXXX-XXXX-XXXX-XXXX` (shown once) |
| In, from any staff user | username + password (login), current + new password (change), profile photo |
| Out, to any staff user | **JWT** (8 h; payload `id`, `role`, `barangay`, `assignedSport`), `mustChangePassword` flag |
| In, public (locked out Super Admin) | username + recovery code + new password (`POST /api/auth/forgot-password`) |

Provisioned usernames: a barangay admin's username is its barangay name as a slug (lowercase,
non-alphanumerics → `.`). An organizer's is `organizer.` + the sport slug. A number is appended
if the name is already taken.

### P2 Player registration and verification (`routes/team.js`, `routes/referenceList.js`, `routes/review.js`, `services/prescreen.js`)
| | |
|---|---|
| Reads | `teams`, `players`, `teamplayers`, `documents`, `referencelists`, `barangays`, `sports`, `seasons` (current), `matches` (count, before delete/reopen) |
| Writes | `teams`, `players` (incl. `eligibilityStatus`, `flagReason`), `teamplayers`, `documents`, `referencelists` (replace per upload); GridFS `photos`, `documents`, `logos` |
| In, from Super Admin | **reference list CSV** (replaces the season's list and re-screens every player), approve / reject / verify / reopen verdicts, `allowsCrossBarangay` toggle (re-screens the season) |
| Out, to Super Admin | review queue (teams, tallies, player photo, **residency document file**, near-miss comparison with the list's recorded fields), reference-list rows |
| In, from Barangay Admin | team (name, sport, division), player details (first/middle/last name, birthdate, address, jersey number), **player CSV**, **player photo**, **residency document** (+ `docType`), roster submission, barangay logo |
| Out, to Barangay Admin | roster with screening result (`eligibilityStatus`, `flagReason`), import report (skipped rows + reasons), document verify status, their own document files |

### P3 Tournament and bracketing (`routes/tournament.js`, `routes/reference.js` sports/barangays, `routes/season.js`)
| | |
|---|---|
| Reads | `teams` (verified, current season, one division), `sports`, `tournaments`, `matches`, `barangays`, `seasons` |
| Writes | `tournaments` (create, `stage`, delete), `matches` (create the skeleton, results, schedule/venue, revert), `playermatchstats` (deleted with a tournament), `sports` (League Setup), `barangays`, `seasons` (create, advance, `cleanedAt`) |
| In, from Super Admin | generate request (sport + division), knockout generation, tiebreaker generation, **match schedule (date/time + venue)**, bulk schedule by round/group/bracket, revert request, League Setup config, season create/advance |
| Out, to Super Admin | brackets, standings, qualification lists, schedule |

### P4 Live scoring (`routes/organizer.js`, `POST /api/tournaments/matches/:matchId/result`)
| | |
|---|---|
| Reads | `matches`, `tournaments` (current season only for the match list), `sports`, `teams`, `teamplayers`, `players`, `playermatchstats` |
| Writes | `matches` (`status`, `bestOf`, `liveScoreA/B`, `games[]`, `lastAction`, `seriesWinner`, `mvp`, `enteredBy`, `enteredAt`; advancement writes `teamA`/`teamB` of the next matches), `tournaments` (`stage: 'completed'` on a final), `playermatchstats` |
| In, from Organizer | start (period count), **score tap** (side + points), undo, end period, end match, cancel, forfeit, **post-match score sheet** (per-player stats + MVP) |
| Out, to Organizer | match list, live score, period state, rosters for the score sheet |

### P5 Public information (`routes/public.js`, plus the public GETs in sections 5.4)
| | |
|---|---|
| Reads | `seasons`, `tournaments`, `matches`, `teams`, `teamplayers`, `players`, `playermatchstats`, `barangays`, `sports`, `siteimages`, `champions`; GridFS `photos`, `site`, `logos`, `champions` |
| Writes | none |
| In, from Public Viewer | page requests (sport / status / tournament filters) |
| Out, to Public Viewer | live scores, schedule, standings, brackets, team lineups (first name, last name, jersey, age, photo, stats), leaders, champions, site images |

### Content (`routes/champion.js`, `routes/siteimage.js`)
| | |
|---|---|
| Writes | `champions` + GridFS `champions`; `siteimages` + GridFS `site` |
| In, from Super Admin | champion record (year, sport, division, barangay, team name, MVP, prize, notes, photo); **site image** + focal point |

---

## 4. Flowchart sequences

### 4.1 Login and forced password change
1. `/login`: the user submits username + password to `POST /api/auth/login` (rate limit: 10 per
   15 min).
2. Unknown username or wrong password → 401 `Invalid username or password.`
3. On success the browser stores `token` and `user` in `localStorage`.
4. If `mustChangePassword` is `true` → navigate to `/change-password`.
   - The user submits current + new password to `POST /api/auth/change-password`. The new
     password must be ≥ 8 characters and differ from the current one.
   - On success the server sets `mustChangePassword = false`. The page then shows the
     first-login `InstructionModal` for the role, and closing it navigates to the role's home.
5. Otherwise → navigate to the role's home: `super_admin` → `/admin`, `barangay_admin` →
   `/brgy/dashboard`, `organizer` → `/organizer/dashboard`.
6. Every protected page is wrapped in `RequireRole`. No token/user → `/login`. Wrong role → that
   role's home.
7. Any API 401 while logged in → the session is cleared and the browser goes to
   `/login?expired=1`.

⚠ Mismatch: `CLAUDE.md` says the password change is forced on first login. Only the frontend
enforces it (step 4). No backend middleware checks `mustChangePassword`, so an account that
still needs a change can call every API it's authorised for.

Recovery (Super Admin only): `Forgot your password?` → username + recovery code + new password →
`POST /api/auth/forgot-password` (5 per 15 min). The code works once, then it's cleared.

### 4.2 Season lifecycle
States: `setup` → `registration_open` → `verification` → `ongoing` → `completed`.

- Forward only, one step at a time (`POST /api/seasons/:id/advance`, using `NEXT_STATE` in
  `routes/season.js`). There is no backward transition, and `completed` is final.
- The client sends `expectedNext`. If it doesn't match the real next state, the server responds
  409, so a stale page can't skip a stage.
- `ongoing` → `completed` also sets `closedAt`.
- Creating a season (`POST /api/seasons`) is refused while the newest season isn't `completed`.
  A new season starts in `setup`. The "current season" is the most recently created one.
- Button labels per transition: `Open registration`, `Move to Verification`, `Start the season`,
  `Close the season`.
- A season can't be deleted (no route). `Clean up` works only on a `completed` season that isn't
  the current one. It deletes that season's residency documents and reference list (and, if
  ticked, player photos) and sets `cleanedAt`.

What each stage gates in the backend:
| Action | Allowed when |
|---|---|
| Create a team | `registration_open` |
| Add/remove/import players, submit roster | `registration_open`; or during `verification` for a team whose status is `rejected` and hasn't been resubmitted |
| Upload a reference list | `setup` or `registration_open` |
| Approve / reject / verify | `verification` |
| Reopen a verified team | `verification`, and the team is in no match |
| Generate brackets, score, schedule | not gated by season stage |

### 4.3 Match lifecycle
States: `scheduled`, `ongoing`, `completed`, `forfeited`.

| From | To | Trigger | Route |
|---|---|---|---|
| (created) | `scheduled` | bracket generated | `POST /api/tournaments/generate`, `/:id/bracket`, `/:id/de-bracket`, `/:id/tiebreakers` |
| `scheduled` | `ongoing` | Organizer taps `Start match` (chooses the period count → `bestOf`). Needs both teams. A date not today returns a confirmation, then proceeds. | `POST /api/organizer/matches/:matchId/start` |
| `ongoing` | `ongoing` | score tap / `Undo` / `End this <period>` (banks a period into `games[]`) | `/score`, `/undo`, `/end-period` |
| `ongoing` | `scheduled` | `Cancel match` (discards the live score, periods and player stats) | `/cancel` |
| `ongoing` | `completed` | `End match`: all periods must be banked and the totals can't be tied. Sets `seriesWinner`, `enteredBy`, `enteredAt`, then advances. | `/end` |
| any state except `completed` | `completed` | Super Admin or Organizer enters a final result directly (refused if a team is missing) | `POST /api/tournaments/matches/:matchId/result` |
| `scheduled` | `forfeited` | `A team didn't show up` → the other team wins 1–0, and advances the same way. Refused while `ongoing` (`Cancel the match first, then record the forfeit.`). | `/forfeit` |
| `completed` / `forfeited` | `scheduled` | Super Admin `Revert`. Refused for a `final` / `ko_final` match, and if a downstream match has left `scheduled`. | `POST /api/tournaments/matches/:matchId/revert` |
| `completed` | `completed` | post-match `Save player stats` (only allowed when `completed`) | `PUT /api/organizer/matches/:matchId/stats` |

Advancement after a result: the winner goes to `nextMatchWin` and the loser to `nextMatchLose`
(for brackets `winners`, `losers`, `final`, `knockout`, `ko_final`, and tiebreakers). A `final` or
`ko_final` result sets the tournament's `stage` to `completed` (champion). Tournament `stage`
becomes `elimination` when the knockout is generated.

### 4.4 Roster submission and verification
1. **Create team** (Barangay Admin, `registration_open`) → `teams` row, `status: 'pending'`,
   `submittedAt: null` (draft).
2. **Add players**: manually (`Add player`) or by `Import CSV`. Each add checks: roster max,
   required fields, address = the team's barangay name, division age limits (`under15` ≤ 15,
   `under30` 16–30), one barangay per athlete, boys/girls not mixed, same athlete not on two of
   the barangay's teams in the same sport, cross-barangay rule. A player who passes is
   pre-screened immediately.
3. **Submit roster** (`POST /api/teams/:id/submit`): checks roster size min/max, the division age
   limits and boys/girls again. It then sets `submittedAt = now`, `status = 'pending'`, and runs
   `prescreenTeam` against the season's reference list. Each player becomes `eligible`,
   `needs_document` (15 or under) or `flagged` (not on the list: possible Dayo; or on the list
   under another barangay the team can't recruit from), with `flagReason`.
4. **Documents**: for `needs_document` players the Barangay Admin uploads files
   (`birth_certificate`, `voters_id`, `barangay_clearance`, `parental_consent`) →
   `verifyStatus: 'pending'`.
5. **Review** (Super Admin, `verification` stage):
   - **Approve**: refused (409) if the player is still `flagged` on a live re-check. Refused (400)
     if `needs_document` with no document. Otherwise the player gets `eligibilityStatus:
     'eligible'` and `flagReason: ''`, and all their `pending` documents get `approved` +
     `reviewedBy` + `reviewedAt`.
   - **Reject**: removes the `teamplayers` link. If the player is on no other team, it also
     deletes their documents (records + GridFS files), their photo and the player record. The
     team gets `submittedAt: null` and `status: 'rejected'` (reopened for that barangay only).
     Resubmitting sets it `pending` again.
   - **Verify Team**: refused unless the team is submitted and every player is `eligible`.
     Sets `status: 'verified'`.
6. **Correction after submission** (`PATCH /api/teams/:id/players/:playerId`): the Barangay Admin
   is refused (409) once the team is `verified` (photos stay editable). A Super Admin may still
   call it. The same entry checks as step 2 apply. If the first name, middle name, last name or
   birthdate changed, the player is re-screened. If the result isn't `eligible` and the team was
   `verified`, the team goes back to `pending`. `submittedAt` isn't changed.
7. **Reopen for corrections** (Super Admin, `verification` stage, team in no match): `verified` →
   `pending`.
8. Only `verified` teams of the current season are used by bracket generation.

---

## 5. Architecture

### 5.1 Stack and versions
Versions are from `package.json`, with the installed version in brackets where it differs.

**Backend** (`backend/`, entry `server.js`, `npm start` = `node server.js`, `npm run dev` =
`nodemon server.js`):
`express ^5.2.1`, `mongoose ^9.8.1` (MongoDB driver `mongodb` 7.5.0 installed),
`jsonwebtoken ^9.0.3`, `bcryptjs ^3.0.3`, `multer ^2.2.0`, `express-rate-limit ^8.6.1`,
`csv-parse ^7.0.2`, `cors ^2.8.6`, `dotenv ^17.4.2`; dev: `nodemon ^3.1.14`.

**Frontend** (`frontend/`, Vite):
`react ^19.2.8`, `react-dom ^19.2.8`, `react-router-dom ^7.18.2`, `radix-ui ^1.6.7`,
`shadcn ^4.21.0`, `class-variance-authority ^0.7.1`, `lucide-react ^1.46.0`, `motion ^13.4.0`,
`lenis ^1.3.26`, `ogl ^1.0.11`, `@tanstack/react-virtual ^3.14.13`, `react-day-picker ^10.0.1`,
`date-fns ^4.4.0`, `embla-carousel-react ^8.6.0`, `react-easy-crop ^6.2.3`,
`react-theme-switch-animation ^1.3.0`, `tw-animate-css ^1.4.0`, `cn ^0.3.0`;
dev: `vite ^8.2.0` (8.2.1 installed), `tailwindcss ^4.3.3`, `@tailwindcss/postcss ^4.3.3`,
`postcss ^8.5.26`, `@vitejs/plugin-react ^6.0.4`, `eslint ^10.8.0`,
`eslint-plugin-react-hooks ^7.1.1`, `eslint-plugin-react-refresh ^0.5.3`, `@eslint/js ^10.0.1`,
`globals ^17.7.0`, `@types/react ^19.2.17`, `@types/react-dom ^19.2.3`.

**Node:** neither `package.json` has an `engines` field and there's no `.nvmrc`, so the repo
doesn't pin a Node version. The development machine runs Node v25.6.0.

### 5.2 Hosting
- Frontend: **Vercel**. `frontend/vercel.json` rewrites `/api/:path*` →
  `https://kolambugan-sports.onrender.com/api/:path*` and everything else → `/index.html`.
- Backend: **Render**, at `kolambugan-sports.onrender.com` (from `vercel.json`; there's no Render
  config file in the repo).
- Database and file storage: **MongoDB Atlas** (connection string `MONGO_URI` in `.env`). Files
  are stored in GridFS in the same database.
- Dev: backend on port 5000, frontend on Vite's port 5173, with a proxy `/api` →
  `http://localhost:5000` (`vite.config.js`).

### 5.3 Polling intervals
| Page | Interval |
|---|---|
| Public `Home` (`/`) | 10 s |
| Public `Matches` (`/matches`) | 10 s |
| Public `Standings` (`/standings`) | 15 s |
| Public `Brackets` (`/brackets`) | 15 s |
| Public `Teams`, team detail, `Players`, `Champions`, `About` | none (load once) |
| Barangay Admin `Matches` (`/brgy/matches`) | 20 s |
| Barangay Admin `Dashboard` | 30 s |
| Organizer `Dashboard` | 30 s |
| Super Admin `Dashboard` | 30 s |

### 5.4 Public vs authenticated endpoints
**Public (no token):**
- `/api/public/*`: `overview`, `matches`, `tournaments`, `teams`, `teams/:id`, `leaders`,
  `players`, `bracket`, `site-images`, `site-image/:key`
- `GET /api/seasons/current`
- `GET /api/sports`, `GET /api/barangays`, `GET /api/barangays/:id/logo`
- `GET /api/champions`, `GET /api/champions/:id/photo`
- `GET /api/teams/players/:playerId/photo`
- `GET /api/auth/users/:id/photo`
- `GET /api/tournaments`, `/api/tournaments/:id/matches`, `/:id/standings`, `/:id/qualification`,
  `/:id/bracket`, `/:id/de-qualification`
- `POST /api/auth/login` (rate-limited 10 per 15 min), `POST /api/auth/forgot-password`
  (rate-limited 5 per 15 min)

⚠ Mismatch: `CLAUDE.md`'s "Public API" section lists only `routes/public.js`. The
`/api/tournaments` GET routes above are also unauthenticated. They return match documents
(team names, scores, status, ids), and no player personal data.

**Authenticated** (JWT `Authorization: Bearer`, `authenticate` + `authorize(...)`): everything
else. That's all of `/api/accounts`, `/api/review`, `/api/organizer`, `/api/stats`,
`/api/site-images`, `/api/reference-list`; the write routes of `/api/seasons`, `/api/sports`,
`/api/barangays`, `/api/champions` and `/api/tournaments`; and all `/api/teams` routes except
the player photo.

**What the public endpoints deliberately leave out** (comment at the top of `routes/public.js`:
"no birthdates, no addresses, no documents. Photos ARE public by decision."):
- Player shapes return only `id`, `firstName`, `lastName`, `jerseyNumber`, `age` (team detail),
  `hasPhoto` and season `stats`.
- No `birthdate`, `address`, `middleName`, `eligibilityStatus`, `flagReason` or documents.
- Residency document files are served only through the two authenticated routes, with
  `Cache-Control: private, no-store`.
- Reference-list data is available only to `super_admin`.

---

## 6. Permissions matrix

Yes = the backend allows it (with the season-stage conditions from 4.2). Organizer actions are
limited to the organizer's `assignedSport`. Barangay Admin actions are limited to their own
barangay's teams.

| Action | Super Admin | Barangay Admin | Organizer | Public |
|---|---|---|---|---|
| Log in / change own password / set own profile photo | yes | yes | yes | no |
| Generate own recovery code; reset password with it | yes | no | no | no |
| View accounts, add an account, provision all | yes | no | no | no |
| Reset another account's password | yes (a Super Admin only until they've set their own) | no | no | no |
| Delete an account | yes (not own, not last Super Admin, not one with entered results) | no | no | no |
| Create a season / advance its stage | yes | no | no | no |
| Clean up a past season | yes | no | no | no |
| Upload / view the reference list | yes | no | no | no |
| Configure games (League Setup): add, edit, delete a game (incl. with its history) | yes | no | no | no |
| Add / edit / delete a barangay; toggle cross-barangay | yes | no | no | no |
| Upload / remove a barangay logo | yes | yes (own) | no | no |
| Register a team | no | yes | no | no |
| Add / remove / import players; submit a roster | no | yes | no | no |
| Correct a player's details | yes (API only, no UI) | yes (until the team is verified) | no | no |
| Upload / remove a player photo | no | yes | no | no |
| Upload / delete a residency document | no | yes (delete only while the document is `pending` and the team isn't `verified`) | no | no |
| View a residency document file | yes (any) | yes (own team) | no | no |
| Delete a team | yes | yes (own, not verified, not in a match) | no | no |
| Approve / reject a player; verify a team | yes | no | no | no |
| Reopen a verified team | yes | no | no | no |
| Generate a tournament / knockout / tiebreaker | yes | no | no | no |
| Schedule matches (date/time, venue) | yes | no | no | no |
| Delete a tournament | yes | no | no | no |
| Enter a final result directly | yes | no | yes | no |
| Start / score / undo / end period / end / cancel / forfeit a match | yes (route allows it; no menu entry) | no | yes | no |
| Save post-match player stats + MVP | yes (route allows it) | no | yes | no |
| Revert a completed match | yes | no | no | no |
| Add / edit / delete champions | yes | no | no | no |
| Upload / remove site images | yes | no | no | no |
| View the Super Admin dashboard and reports | yes | no | no | no |
| View own role's dashboard | yes | yes | yes | no |
| View live scores, schedule, standings, brackets, teams, players, champions | yes | yes | yes | yes |
