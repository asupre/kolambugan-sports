// Built-in scoring rules for the seven seeded sports, and rulesFor() which layers a sport's
// own saved settings on top. Shared by the organizer routes (what the scoring screen and the
// post-match score sheet show) and GET /api/sports (what League Setup shows).
//
// LIVE scoring is by TEAM only (Sep 2026): the organizer taps +1 / +2 / +3 for a team, nothing
// is credited to a player while the game runs. Player stats are entered on a SCORE SHEET after
// the match. Which columns that sheet has is a per-sport choice the Super Admin makes in League
// Setup (`Sport.scoreSheet`); until they choose, the built-in default below is used.
//
// Every sport has a TYPE (`Sport.category`): 'physical' = a sport, 'esports', or 'board' = a
// board game. The type decides which sheet columns are on offer and the default scoring mode.

// How each seeded sport is scored live. Anything not listed: an esport or board game records
// games won; any other sport scores by points.
//   points — the organizer taps points for a team; periods (quarters / sets) are banked
//   final  — no points; the organizer records who won each game (best-of series)
const SCORING_MODE = {
  'Billiards': 'final',
  'Chess': 'final',
  'Mobile Legends': 'final',
};

// What a period is called per sport (display only — the mechanics are identical:
// score accumulates across all periods, winner is the higher total).
const PERIOD_LABEL = {
  'Basketball': 'quarter',
  'Volleyball': 'set',
  'Badminton': 'set',
  'Pickleball': 'set',
};
// Sensible period counts per sport, so an organizer can't pick 7 quarters of basketball.
const PERIOD_OPTIONS = {
  'Basketball': [4],
  'Volleyball': [1, 3, 5],
  'Badminton': [1, 3, 5],
  'Pickleball': [1, 3, 5],
};
// Timed sports (Nov 2026): a countdown clock per period, and overtime when tied after
// regulation. Basketball: FIBA / local-league style, 4 quarters of 8, 10 or 12 minutes (the
// organizer picks at Start, default 10) and 5-minute overtimes, repeated until a team leads.
// The rally sports (sets to points), chess, billiards and esports are not played on a clock.
const TIMED = {
  'Basketball': { minutes: [8, 10, 12], defaultMinutes: 10, overtimeMinutes: 5 },
};
// Which point values a sport can score in one tap. Basketball has 1/2/3; the rest add 1.
const POINT_VALUES = {
  'Basketball': [1, 2, 3],
};

// Everything a score sheet column can be. `short` is the tiny header over the input.
// `role` is special: not a number but a pick-list (see ESPORT_ROLES).
const STAT_CATALOG = {
  points:    { label: 'Points',      short: 'PTS' },
  assists:   { label: 'Assists',     short: 'AST' },
  rebounds:  { label: 'Rebounds',    short: 'REB' },
  fouls:     { label: 'Fouls',       short: 'FOUL' },
  blocks:    { label: 'Blocks',      short: 'BLK' },
  steals:    { label: 'Steals',      short: 'STL' },
  turnovers: { label: 'Turnovers',   short: 'TO' },
  aces:      { label: 'Aces',        short: 'ACE' },
  digs:      { label: 'Digs',        short: 'DIG' },
  kills:     { label: 'Kills',       short: 'K' },
  deaths:    { label: 'Deaths',      short: 'D' },
  role:      { label: 'Role played', short: 'ROLE' },
};

// Which columns each TYPE of sport can have on its sheet.
const SHEET_BY_CATEGORY = {
  physical: ['points', 'assists', 'rebounds', 'fouls', 'blocks', 'steals', 'turnovers', 'aces', 'digs'],
  esports: ['kills', 'deaths', 'assists', 'role'],
  board: ['points'],
};

// How many players are on court at once (Oct 2026: the starting lineup + substitutions are
// back). Only team-format entries have a lineup; a sport's own `onCourt` (Sport model) wins,
// else these built-ins, else 5 for any esport. Singles / doubles have no lineup.
const ON_COURT = {
  'Basketball': 5,
  'Volleyball': 6,
  'Mobile Legends': 5,
};
function onCourtFor(sport) {
  if (!sport || (sport.entryFormat && sport.entryFormat !== 'team')) return null;
  if (Number.isInteger(sport.onCourt) && sport.onCourt > 0) return sport.onCourt;
  return ON_COURT[sport.name] || (sport.category === 'esports' ? 5 : null);
}

// The sheet used until the Super Admin picks one. Basketball is the full box score;
// volleyball & co: points; esports: the role each player played; chess / billiards: none.
const DEFAULT_SHEET = {
  'Basketball': ['points', 'assists', 'fouls', 'rebounds'],
  'Volleyball': ['points'],
  'Badminton': ['points'],
  'Pickleball': ['points'],
  'Billiards': [],
  'Chess': [],
  'Mobile Legends': ['role'],
};

// The columns that already exist on PlayerMatchStats (the public pages sum these). Any other
// column is stored under `extra`.
const LEGACY_STAT_COLUMNS = ['points', 'assists', 'rebounds', 'fouls'];

// A role pick-list for esports, matched by sport name (case-insensitive, substring) so
// "Call of Duty Mobile" and "COD Mobile" both work; any other esport gets the generic list.
const ESPORT_ROLES = [
  { match: /mobile legends|\bmlbb\b/i, roles: [
    'Carry (Gold Lane)', 'Fighter (EXP Lane)', 'Mage (Mid Lane)', 'Jungler', 'Support (Roamer)',
  ] },
  { match: /call of duty|\bcodm?\b/i, roles: [
    'Slayer', 'Objective (OBJ)', 'Anchor', 'Support', 'Flex',
  ] },
];
const GENERIC_ESPORT_ROLES = ['Carry', 'Tank', 'Support', 'Flex'];

function rolesFor(sport) {
  const hit = ESPORT_ROLES.find((r) => r.match.test(sport?.name || ''));
  return hit ? hit.roles : GENERIC_ESPORT_ROLES;
}

// A column the Super Admin invented for one sport (e.g. "Spikes" for volleyball). Stored on the
// sport as { key, label }; the key is a safe slug prefixed "x_" so it can never collide with a
// catalog column, and its values live under PlayerMatchStats.extra like any non-original column.
const customOf = (sport) => (Array.isArray(sport?.customStats) ? sport.customStats : [])
  .filter((c) => c && c.key && c.label);
const shortOf = (label) => String(label).replace(/\s+/g, ' ').trim().slice(0, 5).toUpperCase();

const typeOf = (sport) => (SHEET_BY_CATEGORY[sport?.category] ? sport.category : 'physical');

// The columns a sport of this type may put on its sheet, with labels — for the League Setup picker.
function sheetOptionsFor(sport) {
  return [
    ...SHEET_BY_CATEGORY[typeOf(sport)].map((key) => ({ key, ...STAT_CATALOG[key] })),
    ...customOf(sport).map((c) => ({ key: c.key, label: c.label, short: shortOf(c.label), custom: true })),
  ];
}

// A configured sport wins for what it configures; otherwise the built-in default for one of the
// seven seeded sports; otherwise something safe. A brand-new sport scores by points with +1
// taps; a new esport or board game records games won.
function rulesFor(sport) {
  const name = sport?.name;
  const type = typeOf(sport);
  const gamesWon = type !== 'physical';

  // The sheet: the Super Admin's pick if they made one (an empty pick means "no form"),
  // else the built-in default. Only columns valid for the sport's type survive, so changing a
  // sport's type can't leave a stray column behind.
  const picked = Array.isArray(sport?.scoreSheet) ? sport.scoreSheet
    : (DEFAULT_SHEET[name] || (type === 'esports' ? ['role'] : type === 'board' ? [] : ['points']));
  const customs = customOf(sport);
  const allowed = [...SHEET_BY_CATEGORY[type], ...customs.map((c) => c.key)];
  const sheet = picked.filter((k) => allowed.includes(k));
  const statLabels = { ...STAT_CATALOG };
  customs.forEach((c) => { statLabels[c.key] = { label: c.label, short: shortOf(c.label), custom: true }; });

  const scoringMode = SCORING_MODE[name] || (gamesWon ? 'final' : 'points');
  // A games-won sport's "periods" are the games of a series (best of 1 / 3 / 5), picked at start.
  const seriesDefault = scoringMode === 'final';

  return {
    scoringMode,
    pointValues: sport?.pointValues?.length ? sport.pointValues : (POINT_VALUES[name] || [1]),
    periodLabel: sport?.periodLabel || PERIOD_LABEL[name] || (seriesDefault ? 'game' : 'period'),
    periodOptions: sport?.periodOptions?.length ? sport.periodOptions
      : (PERIOD_OPTIONS[name] || (seriesDefault ? [1, 3, 5] : [1, 3, 5, 7])),
    sheet,
    statFields: sheet.filter((k) => k !== 'role'),
    roles: sheet.includes('role') ? rolesFor(sport) : [],
    statLabels,
    onCourt: onCourtFor(sport),
    // null = no game clock (see TIMED).
    timed: TIMED[name] || null,
  };
}

// Knockout size for a ROUND-ROBIN sport (Mobile Legends), set in League Setup BEFORE
// registration opens (Sep 2026) so Barangay Admins know how many teams to enter:
// Top 8 = one team per barangay, Top 16 = up to two. Unset = Top 16, the old default.
// Double-elimination sports always end in a Top 8 and aren't configured here (null).
const KNOCKOUT_SIZES = [8, 16];
// The draw is the Super Admin's CHOICE per game (Nov 2026, professor's suggestion: "not just fixed
// to double elim and round robin"; reverses the Oct 31 "fixed by type" rule). A new game starts on
// its type's usual draw (esports round-robin, others double elimination) and can be switched.
function isRoundRobinSport(sport) {
  return sport?.tournamentFormat === 'round_robin';
}
// ESPORTS ONLY choose Top 8 / Top 16 (Oct 2026, Super Admin rule: "those choices should only be
// in the esports"). A non-esport that is set to a round-robin draw is always a Top 8 and always
// one team per barangay per division. (Before, any round-robin game got the choice, so a physical
// sport switched to round-robin defaulted to Top 16 = TWO teams per barangay per division: how
// Mukas registered a second Badminton Girls team.)
function hasKnockoutChoice(sport) {
  return sport?.category === 'esports' && isRoundRobinSport(sport);
}
function knockoutSizeOf(sport) {
  if (!isRoundRobinSport(sport)) return null;
  if (!hasKnockoutChoice(sport)) return 8;
  return KNOCKOUT_SIZES.includes(sport.knockoutSize) ? sport.knockoutSize : 16;
}
// The knockout size the Super Admin CHOSE (esports), else null: what League Setup and the
// team-registration form show.
function knockoutChoiceOf(sport) {
  return hasKnockoutChoice(sport) ? knockoutSizeOf(sport) : null;
}

// How many teams ONE barangay may register for this sport in one division: an esport follows
// its knockout size (Top 8 = 1, Top 16 = 2); every other game is one team per division.
function teamsAllowedFor(sport) {
  const ko = knockoutChoiceOf(sport);
  if (ko) return ko === 8 ? 1 : 2;
  return 1;
}

// Number of groups (Nov 2026, professor's suggestion: "number of teams should be changeable per
// bracketing"). The Super Admin picks 2, 4 or 8 per game in League Setup; unset = the old fixed
// count (double elimination 4, round-robin 8).
//   double elimination: each group's double-elim mini-bracket sends 2 teams on, so the knockout
//                       is 2 x groups: 2 groups = Top 4, 4 = Top 8, 8 = Top 16. At least 3 teams
//                       per group.
//   round-robin:        the knockout size stays as set (Top 8, or Top 8 / 16 for an esport);
//                       knockout / groups advance from each group, and each group needs at
//                       least one more team than advance from it (knockout + groups in all).
const GROUP_OPTIONS = [2, 4, 8];
// The group counts this game may choose. Round-robin is held to AT MOST 2 advancing per group:
// its cutoff tiebreaker (a per-group playoff) settles a tie for 1 or 2 open spots, and a tie for
// 3+ spots (possible with 4 or 8 advancing) has no clean playoff. So Top 8 = 4 or 8 groups, Top
// 16 = 8 groups. Double elimination always sends exactly 2 per group, so 2 / 4 / 8 all work.
function groupOptionsFor(sport) {
  if (!isRoundRobinSport(sport)) return GROUP_OPTIONS;
  const ko = knockoutSizeOf(sport);
  return GROUP_OPTIONS.filter((g) => ko % g === 0 && ko / g <= 2);
}
function groupsOf(sport) {
  if (groupOptionsFor(sport).includes(sport?.numGroups)) return sport.numGroups;
  return isRoundRobinSport(sport) ? 8 : 4;
}
// Everything Generate needs to know about the draw.
function drawOf(sport) {
  const groups = groupsOf(sport);
  if (isRoundRobinSport(sport)) {
    const knockout = knockoutSizeOf(sport);
    return { format: 'round_robin', groups, knockout, advancePerGroup: knockout / groups, minTeams: knockout + groups };
  }
  return { format: 'double_elimination', groups, knockout: groups * 2, advancePerGroup: 2, minTeams: groups * 3 };
}

module.exports = {
  SCORING_MODE, PERIOD_LABEL, PERIOD_OPTIONS, POINT_VALUES, STAT_CATALOG, SHEET_BY_CATEGORY,
  DEFAULT_SHEET, LEGACY_STAT_COLUMNS, ON_COURT, onCourtFor, rolesFor, sheetOptionsFor, rulesFor,
  KNOCKOUT_SIZES, isRoundRobinSport, knockoutSizeOf, knockoutChoiceOf, hasKnockoutChoice, teamsAllowedFor,
  GROUP_OPTIONS, groupOptionsFor, groupsOf, drawOf,
};
