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

const router = express.Router();

// Shape a match for public display — teams, score, status, schedule, context.
function publicMatch(m, sportName, division) {
  return {
    id: m._id,
    sport: sportName,
    division,
    bracket: m.bracket,
    round: m.round,
    group: m.group,
    teamA: m.teamA ? { id: m.teamA._id, name: m.teamA.teamName } : null,
    teamB: m.teamB ? { id: m.teamB._id, name: m.teamB.teamName } : null,
    scoreA: m.liveScoreA || 0,
    scoreB: m.liveScoreB || 0,
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
    if (!season) return res.json({ season: null, live: [], today: [], recent: [] });

    const matches = await Match.find({ tournament: { $in: ids } })
      .populate('teamA', 'teamName').populate('teamB', 'teamName')
      .sort({ updatedAt: -1 });

    const shaped = matches.map((m) => {
      const t = byId[String(m.tournament)] || {};
      return publicMatch(m, t.sport, t.division);
    });

    const sameDay = (d) => {
      if (!d) return false;
      const x = new Date(d), n = new Date();
      return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth() && x.getDate() === n.getDate();
    };

    res.json({
      season: { name: season.name, status: season.status },
      live: shaped.filter((m) => m.status === 'ongoing'),
      today: shaped.filter((m) => m.status === 'scheduled' && sameDay(m.schedule)),
      recent: shaped.filter((m) => m.status === 'completed').slice(0, 10),
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
      .populate('teamA', 'teamName').populate('teamB', 'teamName')
      .sort({ schedule: 1, round: 1 });

    let shaped = matches.map((m) => {
      const t = byId[String(m.tournament)] || {};
      return publicMatch(m, t.sport, t.division);
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
      .populate('barangay', 'name').populate('sport', 'name');
    if (!team) return res.status(404).json({ message: 'Team not found.' });

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
      { $group: { _id: '$player', points: { $sum: '$points' }, fouls: { $sum: '$fouls' } } },
    ]);
    const games = (await teamGamesMap(ids))[String(team._id)] || 0;
    const statBy = {};
    stats.forEach((s) => { statBy[String(s._id)] = { points: s.points, fouls: s.fouls }; });

    res.json({
      team: {
        id: team._id, name: team.teamName, barangay: team.barangay?.name,
        sport: team.sport?.name, division: team.division, format: team.format,
      },
      players: players.map((p) => ({
        id: p._id,
        firstName: p.firstName,
        lastName: p.lastName,
        jerseyNumber: p.jerseyNumber,
        age: p.age,
        hasPhoto: !!p.photo,
                stats: { points: 0, fouls: 0, ...(statBy[String(p._id)] || {}), games },
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
      { $group: { _id: '$player', points: { $sum: '$points' }, fouls: { $sum: '$fouls' }, games: { $sum: 1 } } },
      { $sort: { points: -1 } },
      { $limit: limit },
    ]);

    const players = await Player.find({ _id: { $in: rows.map((r) => r._id) } })
      .select('firstName lastName photo');
    const pBy = {};
    players.forEach((p) => { pBy[String(p._id)] = p; });

    // Which team each leader plays for (first match found is enough for display).
        const links = await TeamPlayer.find({ player: { $in: rows.map((r) => r._id) } }).populate('team', 'teamName');
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

// W/L per team, per group. Counts completed matches only; a match in progress
// contributes nothing until the organizer ends it.
function groupStandings(matches) {
  const byGroup = {};
  matches.forEach((m) => {
    if (!m.group) return;
    const g = (byGroup[m.group] = byGroup[m.group] || {});
    [m.teamA, m.teamB].forEach((t) => {
      if (!t) return;
      const k = String(t.id);
      g[k] = g[k] || { teamId: k, teamName: t.name, wins: 0, losses: 0, played: 0 };
    });
    if (m.status !== 'completed' || !m.winner) return;
    [m.teamA, m.teamB].forEach((t) => {
      if (!t) return;
      const row = g[String(t.id)];
      row.played += 1;
      if (String(m.winner) === String(t.id)) row.wins += 1;
      else row.losses += 1;
    });
  });
  const out = {};
  Object.entries(byGroup).forEach(([g, rows]) => {
    out[g] = Object.values(rows).sort(
      (a, b) => b.wins - a.wins || a.losses - b.losses || a.teamName.localeCompare(b.teamName)
    );
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
      const final = list.find((m) => (m.round || 0) === last && m.status === 'completed' && m.winner);
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

    const matches = await Match.find({ tournament: tid })
      .populate('teamA', 'teamName').populate('teamB', 'teamName')
      .sort({ _id: 1 });

       const shaped = matches.map((m) => ({
      ...publicMatch(m, t.sport, t.division),
      isTiebreaker: !!m.isTiebreaker,
      // The tree: a match's feeders are the matches pointing at it.
      nextMatchWin: m.nextMatchWin ? String(m.nextMatchWin) : null,
    }));

    res.json({
      tournament: { id: t.id, sport: t.sport, division: t.division, stage: t.stage },
      matches: shaped,
      standings: groupStandings(shaped),
      qualifiers: groupQualifiers(shaped),
    });
  } catch (err) {
    console.error('Public bracket error:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

module.exports = router;