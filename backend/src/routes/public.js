// Public read-only routes for the Public Viewer. NO authentication — anyone can
// read scores, standings, and rosters. Nothing here exposes private data:
// no birthdates, no addresses, no documents. Photos ARE public by decision.
const express = require('express');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamPlayer = require('../models/TeamPlayer');
const PlayerMatchStats = require('../models/PlayerMatchStats');
const Sport = require('../models/Sport');
const Barangay = require('../models/Barangay');
const { getCurrentSeason } = require('../middleware/season');
const SiteImage = require('../models/SiteImage');
const { sendFile } = require('../config/gridfs');
const { isManilaToday, manilaDay } = require('../config/time');
const { rulesFor, LEGACY_STAT_COLUMNS } = require('../lib/sportRules');
const { roundLabels } = require('../lib/roundLabels');

const router = express.Router();

// Shape a match for public display — teams, score, status, schedule, context.
// roundLabel comes from roundLabels() over the whole season's matches (a knockout round
// is named by how many games are in it), so callers pass the map in.
function publicMatch(m, sportName, division, labels) {
  return {
    id: m._id,
    sport: sportName,
    division,
    bracket: m.bracket,
    round: m.round,
    roundLabel: (labels && labels.get(String(m._id))) || '',
    group: m.group,
        // barangayId lets the public pages show the barangay crest instead of a
    // monogram — the team name alone isn't enough to find the logo.
    teamA: m.teamA ? { id: m.teamA._id, name: m.teamA.teamName, barangayId: m.teamA.barangay ? String(m.teamA.barangay) : null } : null,
    teamB: m.teamB ? { id: m.teamB._id, name: m.teamB.teamName, barangayId: m.teamB.barangay ? String(m.teamB.barangay) : null } : null,
        scoreA: m.liveScoreA || (m.games || []).reduce((n, g) => n + (g.scoreA || 0), 0),
    scoreB: m.liveScoreB || (m.games || []).reduce((n, g) => n + (g.scoreB || 0), 0),
    periods: (m.games || []).map((g) => ({ n: g.gameNumber, a: g.scoreA, b: g.scoreB })),
    periodsPlayed: (m.games || []).length,
    totalPeriods: m.bestOf || 1,
    status: m.status,
    schedule: m.schedule,
    venue: m.venue || "",
    winner: m.seriesWinner ? String(m.seriesWinner) : null,
  };
}

// Load every tournament in the current season, keyed by id, with sport + division.
async function seasonTournaments() {
  const season = await getCurrentSeason();
  if (!season) return { season: null, byId: {}, ids: [] };
  const tournaments = await Tournament.find({ season: season._id }).populate('sport', 'name');
  const byId = {};
  tournaments.forEach((t) => {
    byId[String(t._id)] = { sport: t.sport?.name || '?', division: t.division, stage: t.stage, id: t._id };
  });
  return { season, byId, ids: tournaments.map((t) => t._id) };
}

// Games played is derived from the TEAM's completed matches. The system records
// points and fouls, not lineups — there is no per-player attendance to count,
// so every player on a team shares the team's game count.
async function teamGamesMap(tournamentIds) {
  const done = await Match.find({ tournament: { $in: tournamentIds }, status: 'completed' })
    .select('teamA teamB');
  const map = {};
  done.forEach((m) => {
    if (m.teamA) map[String(m.teamA)] = (map[String(m.teamA)] || 0) + 1;
    if (m.teamB) map[String(m.teamB)] = (map[String(m.teamB)] || 0) + 1;
  });
  return map;
}

// GET /api/public/overview — everything the landing page needs in one call.
router.get('/overview', async (req, res) => {
  try {
    const { season, byId, ids } = await seasonTournaments();
    if (!season) return res.json({ season: null, live: [], today: [], upcoming: [], recent: [] });

    const matches = await Match.find({ tournament: { $in: ids } })
            .populate('teamA', 'teamName barangay').populate('teamB', 'teamName barangay')
      .sort({ updatedAt: -1 });

    const labels = roundLabels(matches);
    const shaped = matches.map((m) => {
      const t = byId[String(m.tournament)] || {};
      return publicMatch(m, t.sport, t.division, labels);
    });

    // A fixture needs at least one real team — an empty bracket slot isn't a game.
    const fixtures = shaped.filter((m) => m.status === 'scheduled' && m.schedule && (m.teamA || m.teamB));
    const todayKey = manilaDay(new Date());

    res.json({
      season: { name: season.name, status: season.status },
      live: shaped.filter((m) => m.status === 'ongoing'),
      today: fixtures
        .filter((m) => isManilaToday(m.schedule))
        .sort((a, b) => new Date(a.schedule) - new Date(b.schedule)),
      // The next dated games after today, soonest first. Home used to show only
      // "today", so the rest of the schedule never appeared there at all.
      upcoming: fixtures
        .filter((m) => manilaDay(m.schedule) > todayKey)
        .sort((a, b) => new Date(a.schedule) - new Date(b.schedule))
        .slice(0, 8),
      recent: shaped.filter((m) => ['completed', 'forfeited'].includes(m.status)).slice(0, 10),
      counts: {
        barangays: await Barangay.countDocuments(),
        sports: await Sport.countDocuments(),
        liveNow: shaped.filter((m) => m.status === 'ongoing').length,
      },
    });
  } catch (err) {
    console.error('Public overview error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/public/matches?sport=Basketball&status=completed — filtered match list.
router.get('/matches', async (req, res) => {
  try {
    const { byId, ids } = await seasonTournaments();
    let matches = await Match.find({ tournament: { $in: ids } })
            .populate('teamA', 'teamName barangay').populate('teamB', 'teamName barangay')
      .sort({ schedule: 1, round: 1 });

    const labels = roundLabels(matches);
    let shaped = matches.map((m) => {
      const t = byId[String(m.tournament)] || {};
      return publicMatch(m, t.sport, t.division, labels);
    });
    if (req.query.sport) shaped = shaped.filter((m) => m.sport === req.query.sport);
    if (req.query.status) shaped = shaped.filter((m) => m.status === req.query.status);

    res.json({ matches: shaped });
  } catch (err) {
    console.error('Public matches error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/public/tournaments — what's running this season, for sport/division pickers.
router.get('/tournaments', async (req, res) => {
  try {
    const { byId } = await seasonTournaments();
    res.json({ tournaments: Object.values(byId) });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/public/teams?sport=Basketball — verified teams, with barangay.
router.get('/teams', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ teams: [] });

    const filter = { season: season._id, status: 'verified' };
    const teams = await Team.find(filter)
      .populate('barangay', 'name').populate('sport', 'name')
      .sort({ teamName: 1 });

    let out = teams.map((t) => ({
      id: t._id,
      name: t.teamName,
      barangay: t.barangay?.name,
      barangayId: t.barangay?._id ? String(t.barangay._id) : null,
      sport: t.sport?.name,
      division: t.division,
      format: t.format,
    }));
    if (req.query.sport) out = out.filter((t) => t.sport === req.query.sport);

    res.json({ teams: out });
  } catch (err) {
    console.error('Public teams error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/public/teams/:id — one team's public lineup.
// Surname, first name, jersey, age, photo, and season stats. NO birthdate,
// NO address, NO documents — those stay private.
router.get('/teams/:id', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('barangay', 'name').populate('sport', 'name category scoreSheet customStats');
    if (!team) return res.status(404).json({ message: 'Team not found.' });

    // Only the columns the Super Admin put on this sport's after-match score sheet
    // (League Setup) — e.g. chess set to "points" must not show a Fouls column.
    const sheet = team.sport ? rulesFor(team.sport).sheet : [];
    const statColumns = LEGACY_STAT_COLUMNS.filter((k) => sheet.includes(k));

    const links = await TeamPlayer.find({ team: team._id }).populate('player');
    const players = links.map((l) => l.player).filter(Boolean);

       // Season-scoped: aggregating on player alone would pull in other sports
    // and past seasons.
    const { ids } = await seasonTournaments();
    const seasonMatches = await Match.find({ tournament: { $in: ids } }).select('_id');
    const stats = await PlayerMatchStats.aggregate([
      {
        $match: {
          match: { $in: seasonMatches.map((m) => m._id) },
          player: { $in: players.map((p) => p._id) },
        },
      },
                  { $group: { _id: '$player', points: { $sum: '$points' }, fouls: { $sum: '$fouls' },
                  rebounds: { $sum: '$rebounds' }, assists: { $sum: '$assists' } } },
    ]);
    const games = (await teamGamesMap(ids))[String(team._id)] || 0;
    const statBy = {};
    stats.forEach((s) => {
      statBy[String(s._id)] = { points: s.points, fouls: s.fouls, rebounds: s.rebounds, assists: s.assists };
    });

    res.json({
            team: {
        id: team._id, name: team.teamName, barangay: team.barangay?.name,
        barangayId: team.barangay?._id ? String(team.barangay._id) : null,
        sport: team.sport?.name, division: team.division, format: team.format,
        statColumns,
      },
      players: players.map((p) => ({
        id: p._id,
        firstName: p.firstName,
        lastName: p.lastName,
        jerseyNumber: p.jerseyNumber,
        age: p.age,
        hasPhoto: !!p.photo,
                        stats: { points: 0, fouls: 0, rebounds: 0, assists: 0, ...(statBy[String(p._id)] || {}), games },
      })),
    });
  } catch (err) {
    console.error('Public team error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET /api/public/leaders?sport=Basketball&limit=10 — top scorers this season.
router.get('/leaders', async (req, res) => {
  try {
    const { byId, ids } = await seasonTournaments();
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const matches = await Match.find({ tournament: { $in: ids } }).select('_id tournament');
    const wanted = req.query.sport
      ? matches.filter((m) => byId[String(m.tournament)]?.sport === req.query.sport)
      : matches;

    const rows = await PlayerMatchStats.aggregate([
      { $match: { match: { $in: wanted.map((m) => m._id) } } },
            { $group: { _id: '$player', points: { $sum: '$points' }, fouls: { $sum: '$fouls' },
                  rebounds: { $sum: '$rebounds' }, assists: { $sum: '$assists' } } },
      { $sort: { points: -1 } },
      { $limit: limit },
    ]);

    const players = await Player.find({ _id: { $in: rows.map((r) => r._id) } })
      .select('firstName lastName photo');
    const pBy = {};
    players.forEach((p) => { pBy[String(p._id)] = p; });

    // Which team each leader plays for (first match found is enough for display).
        const links = await TeamPlayer.find({ player: { $in: rows.map((r) => r._id) } })      .populate('teamA', 'teamName barangay').populate('teamB', 'teamName barangay');
    const teamBy = {};
    links.forEach((l) => {
      if (!teamBy[String(l.player)] && l.team) {
        teamBy[String(l.player)] = { id: String(l.team._id), name: l.team.teamName };
      }
    });
    const gamesBy = await teamGamesMap(ids);

    res.json({
      leaders: rows.map((r, i) => ({
        rank: i + 1,
        id: r._id,
        firstName: pBy[String(r._id)]?.firstName,
        lastName: pBy[String(r._id)]?.lastName,
        hasPhoto: !!pBy[String(r._id)]?.photo,
        team: teamBy[String(r._id)]?.name || null,
        games: gamesBy[String(teamBy[String(r._id)]?.id)] || 0,
                points: r.points,
        fouls: r.fouls,
        rebounds: r.rebounds || 0,
        assists: r.assists || 0,
        games: r.games,
      })),
    });
  } catch (err) {
    console.error('Public leaders error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// Sort a roster the way a team sheet does: numbered players in order, then
// anyone without a number, alphabetically.
function byJersey(a, b) {
  const an = a.jerseyNumber, bn = b.jerseyNumber;
  if (an != null && bn != null) return an - bn;
  if (an != null) return -1;
  if (bn != null) return 1;
  return (a.lastName || "").localeCompare(b.lastName || "");
}

// GET /api/public/players?sport=Basketball — every player on a verified team,
// grouped by team. Unlike /leaders, a player with no points still appears.
router.get('/players', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ teams: [] });

    let teams = await Team.find({ season: season._id, status: 'verified' })
      .populate('barangay', 'name').populate('sport', 'name')
      .sort({ teamName: 1 });
    if (req.query.sport) teams = teams.filter((t) => t.sport?.name === req.query.sport);
    if (teams.length === 0) return res.json({ teams: [] });

    const links = await TeamPlayer.find({ team: { $in: teams.map((t) => t._id) } })
      .populate('player');
    const playerIds = links.map((l) => l.player?._id).filter(Boolean);

    // Stats are scoped to THIS season's matches. Aggregating on player alone
    // would pull in other sports and past seasons.
    const { ids } = await seasonTournaments();
    const seasonMatches = await Match.find({ tournament: { $in: ids } }).select('_id');
    const rows = await PlayerMatchStats.aggregate([
      {
        $match: {
          match: { $in: seasonMatches.map((m) => m._id) },
          player: { $in: playerIds },
        },
      },
            { $group: { _id: '$player', points: { $sum: '$points' }, fouls: { $sum: '$fouls' } } },
    ]);
    const statBy = {};
        rows.forEach((r) => { statBy[String(r._id)] = { points: r.points, fouls: r.fouls }; });

    const gamesBy = await teamGamesMap(ids);

    const byTeam = {};
    links.forEach((l) => {
      const p = l.player;
      if (!p) return;
      (byTeam[String(l.team)] = byTeam[String(l.team)] || []).push({
        id: p._id,
        firstName: p.firstName,
        lastName: p.lastName,
        jerseyNumber: p.jerseyNumber,
        hasPhoto: !!p.photo,
                stats: { points: 0, fouls: 0, ...(statBy[String(p._id)] || {}), games: gamesBy[String(l.team)] || 0 },
      });
    });

    res.json({
      teams: teams.map((t) => ({
                id: t._id,
        name: t.teamName,
        barangay: t.barangay?.name,
        barangayId: t.barangay?._id ? String(t.barangay._id) : null,
        sport: t.sport?.name,
        division: t.division,
        players: (byTeam[String(t._id)] || []).sort(byJersey),
      })),
    });
  } catch (err) {
    console.error('Public players error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// W/L per team, per group. Counts completed matches only, and EXCLUDES
// tiebreaker playoffs — a playoff decides a tie, it isn't part of the group
// record that created the tie.
// includeTiebreakers: the DISPLAY table counts playoff wins, so a team that won
// its way through reads 6-2 rather than 6-2's worth of matches at 4-2. The
// QUALIFICATION logic must not count them — it needs the pre-playoff record to
// see the tie that caused the playoff in the first place.
function groupStandings(matches, includeTiebreakers = false) {
  const byGroup = {};
  matches.forEach((m) => {
    if (!m.group || (!includeTiebreakers && m.isTiebreaker)) return;
    const g = (byGroup[m.group] = byGroup[m.group] || {});
    [m.teamA, m.teamB].forEach((t) => {
      if (!t) return;
      const k = String(t.id);
                 g[k] = g[k] || { teamId: k, teamName: t.name, barangayId: t.barangayId || null, wins: 0, losses: 0, played: 0, gameWinDiff: 0 };
    });
        if (!['completed', 'forfeited'].includes(m.status) || !m.winner) return;

    // Games won within the match — the second tiebreak, matching the admin's.
    let ga = 0, gb = 0;
    (m.periods || []).forEach((p) => { if (p.a > p.b) ga++; else if (p.b > p.a) gb++; });

    [m.teamA, m.teamB].forEach((t, i) => {
      if (!t) return;
      const row = g[String(t.id)];
      row.played += 1;
      if (String(m.winner) === String(t.id)) row.wins += 1; else row.losses += 1;
      row.gameWinDiff += i === 0 ? ga - gb : gb - ga;
    });
  });

  const out = {};
  Object.entries(byGroup).forEach(([g, rows]) => {
       // Losses before gameWinDiff: in a double-elim group teams play different
    // numbers of matches, and gameWinDiff accumulates, so a team that played
    // more can out-rank an unbeaten one on raw period totals.
    out[g] = Object.values(rows).sort(
      (a, b) =>
        b.wins - a.wins ||
        a.losses - b.losses ||
        b.gameWinDiff - a.gameWinDiff ||
        a.teamName.localeCompare(b.teamName)
    );
  });
  return out;
}

// W/L in the knockout (every match with no group: Top 8/16, final, 3rd place).
// The group tables above only hold group matches, so without this a team's
// knockout wins — a forfeit win included — appeared nowhere on Standings.
// Sorted by finish (champion, 2nd, 3rd, 4th), then record.
function knockoutStandings(matches) {
  const rows = {};
  const finish = {};
  matches.forEach((m) => {
    if (m.group) return;
    [m.teamA, m.teamB].forEach((t) => {
      if (!t) return;
      const k = String(t.id);
      rows[k] = rows[k] || { teamId: k, teamName: t.name, barangayId: t.barangayId || null, wins: 0, losses: 0, played: 0, forfeitWins: 0, place: null };
    });
    if (!['completed', 'forfeited'].includes(m.status) || !m.winner || !m.teamA || !m.teamB) return;
    const w = String(m.winner);
    const l = String(m.teamA.id) === w ? String(m.teamB.id) : String(m.teamA.id);
    rows[w].wins += 1; rows[w].played += 1;
    rows[l].losses += 1; rows[l].played += 1;
    if (m.status === 'forfeited') rows[w].forfeitWins += 1;
    if (m.bracket === 'ko_final' || m.bracket === 'final') { finish[w] = 1; finish[l] = 2; }
    if (m.bracket === 'ko_third' || m.bracket === 'third') { finish[w] = 3; finish[l] = 4; }
  });
  Object.entries(finish).forEach(([k, p]) => { if (rows[k]) rows[k].place = p; });
  return Object.values(rows).sort(
    (a, b) =>
      (a.place || 99) - (b.place || 99) ||
      b.wins - a.wins ||
      a.losses - b.losses ||
      a.teamName.localeCompare(b.teamName)
  );
}

// Who has actually qualified from a ROUND-ROBIN group, and who is still
// contesting the last spot. Position in the table isn't enough: teams level on
// the cutoff line are tied, and a tie is settled by a playoff, not by
// alphabetical order.
function groupQualification(matches, advance) {
  const standings = groupStandings(matches);
  const out = {};

  Object.entries(standings).forEach(([g, table]) => {
    const gm = matches.filter((m) => m.group === g);
    const rr = gm.filter((m) => !m.isTiebreaker && m.bracket === 'group');
    const complete = rr.length > 0 && rr.every((m) => ['completed', 'forfeited'].includes(m.status));

    if (!complete || table.length <= advance) {
      out[g] = { complete, clear: [], contested: [] };
      return;
    }

    const lastIn = table[advance - 1];
    const level = (t) => t.wins === lastIn.wins && t.gameWinDiff === lastIn.gameWinDiff;
    const above = (t) => t.wins > lastIn.wins || (t.wins === lastIn.wins && t.gameWinDiff > lastIn.gameWinDiff);

    const tied = table.filter(level);
    const clearIn = table.filter(above);
    const spotsLeft = advance - clearIn.length;

    // Not a real contest: no tie, or enough spots for everyone tied.
    if (tied.length < 2 || tied.length <= spotsLeft) {
      out[g] = { complete, clear: table.slice(0, advance).map((t) => t.teamId), contested: [] };
      return;
    }

    const tb = gm.filter((m) => m.isTiebreaker);
    const resolved = tb.length > 0 && tb.every((m) => ['completed', 'forfeited'].includes(m.status));

    if (resolved) {
      const final = tb.reduce((hi, m) => (!hi || m.round > hi.round ? m : hi), null);
      // One spot goes to the playoff winner; two spots go to both finalists,
      // since reaching the final is itself qualifying.
      const through = spotsLeft === 1
        ? [final?.winner].filter(Boolean).map(String)
        : [final?.teamA?.id, final?.teamB?.id].filter(Boolean).map(String);
      out[g] = { complete, clear: [...clearIn.map((t) => t.teamId), ...through], contested: [] };
      return;
    }

    out[g] = {
      complete,
      clear: clearIn.map((t) => t.teamId),
      contested: tied.map((t) => t.teamId),
      spotsLeft,
      playoffGenerated: tb.length > 0,
    };
  });

  return out;
}

// Who actually advances from a double-elim group: the winners-bracket winner
// (seed 1) and the losers-bracket winner (seed 2). NOT the top two records —
// an eliminated team can finish level with a qualifier.
function groupQualifiers(matches) {
  const out = {};
  [...new Set(matches.filter((m) => m.group).map((m) => m.group))].forEach((g) => {
    const inG = matches.filter((m) => m.group === g);
    const decided = (bracket) => {
      const list = inG.filter((m) => m.bracket === bracket);
      if (list.length === 0) return null;
      const last = Math.max(...list.map((m) => m.round || 0));
      const final = list.find((m) => (m.round || 0) === last && ['completed', 'forfeited'].includes(m.status) && m.winner);
      return final ? String(final.winner) : null;
    };
    const seeds = [];
    const upper = decided('winners');
    const lower = decided('losers');
    if (upper) seeds.push({ seed: 1, teamId: upper });
    if (lower) seeds.push({ seed: 2, teamId: lower });
    if (seeds.length) out[g] = seeds;
  });
  return out;
}
// GET /api/public/bracket?tournament=<id> — one tournament's full match tree.
//
// Deliberately sorted by _id, i.e. CREATION order. The bracket layout depends
// on it: matches are generated top-to-bottom within each round, and that order
// is what the admin bracket has always relied on. Sorting by schedule here
// (as /matches does) would reshuffle the bracket every time a match is dated.
router.get('/bracket', async (req, res) => {
  try {
    const { byId } = await seasonTournaments();
    const tid = req.query.tournament;
    const t = tid && byId[String(tid)];
    if (!t) return res.status(404).json({ message: 'Tournament not found.' });

        // advancePerGroup decides how many rows to highlight in a round-robin table.
    const tdoc = await Tournament.findById(tid).select('advancePerGroup');
    const matches = await Match.find({ tournament: tid })
            .populate('teamA', 'teamName barangay').populate('teamB', 'teamName barangay')
      .sort({ _id: 1 });

    const labels = roundLabels(matches);
       const shaped = matches.map((m) => ({
      ...publicMatch(m, t.sport, t.division, labels),
      isTiebreaker: !!m.isTiebreaker,
      // The tree: a match's feeders are the matches pointing at it.
      nextMatchWin: m.nextMatchWin ? String(m.nextMatchWin) : null,
    }));

    res.json({
            tournament: { id: t.id, sport: t.sport, division: t.division, stage: t.stage,
                    advancePerGroup: tdoc?.advancePerGroup || 2 },
                          qualification: groupQualification(shaped, tdoc?.advancePerGroup || 2),
      matches: shaped,
      standings: groupStandings(shaped, true),
      knockout: knockoutStandings(shaped),
      qualifiers: groupQualifiers(shaped),
    });
  } catch (err) {
    console.error('Public bracket error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// GET /api/public/site-images — PUBLIC. The focal point of each filled slot, so
// a page can position all its images from one request instead of one each.
router.get('/site-images', async (req, res) => {
  try {
    const rows = await SiteImage.find({ file: { $ne: null } }).select('key focal');
    const focals = {};
    rows.forEach((r) => { focals[r.key] = r.focal || 'center'; });
    res.json({ focals });
  } catch (err) {
    console.error('Site images error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
// GET /api/public/site-image/:key — PUBLIC. Serves an editable site image.
// Short cache: replacing a banner should show up right away, not tomorrow.
router.get('/site-image/:key', async (req, res) => {
  try {
    const row = await SiteImage.findOne({ key: req.params.key });
    if (!row || !row.file) return res.status(404).json({ message: 'No image.' });
        res.set('X-Focal', row.focal || 'center');
    await sendFile('site', row.file, res, 60);
  } catch (err) {
    console.error('Site image serve error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});
module.exports = router;