// src/lib/mvp.js
// Automatic MVP (Nov 2026, Super Admin: "the automatic MVP, based on the stats of a player").
// The MVP is a player of the WINNING team with the best rating on the after-match score sheet
// (PlayerMatchStats, filled by the stats keepers' live taps and the after-match forms):
//   sports    points + rebounds + assists + steals + blocks + aces + digs + custom columns
//             - turnovers - ½ per foul
//   esports   kills + ½ assists - ½ deaths
// Only the sport's own sheet columns count. Ties: more points (or kills), then fewer fouls (or
// deaths). A singles match (one player a side) gives it to the winner even with no stats.
// The score keeper may still choose someone by hand on "Confirm the result"; that choice
// (match.mvpPick = 'manual') is never overwritten by a recount.

const Match = require('../models/Match');
const TeamPlayer = require('../models/TeamPlayer');
const PlayerMatchStats = require('../models/PlayerMatchStats');
const { rulesFor } = require('./sportRules');

const WEIGHTS = {
  physical: { points: 1, rebounds: 1, assists: 1, steals: 1, blocks: 1, aces: 1, digs: 1, turnovers: -1, fouls: -0.5 },
  esports: { kills: 1, assists: 0.5, deaths: -0.5 },
  board: { points: 1 },
};
const typeOf = (sport) => (['esports', 'board'].includes(sport?.category) ? sport.category : 'physical');

// The weight of each column on this sport's sheet (custom columns count +1 each).
function weightsFor(sport) {
  const rules = rulesFor(sport);
  const base = WEIGHTS[typeOf(sport)];
  const custom = new Set((sport?.customStats || []).map((c) => c.key));
  const out = {};
  for (const f of rules.statFields) {
    if (base[f] !== undefined) out[f] = base[f];
    else if (custom.has(f)) out[f] = 1;
  }
  return out;
}

const valueOf = (row, f) => Number((['points', 'fouls', 'rebounds', 'assists'].includes(f) ? row[f] : row.extra?.[f]) || 0);

function ratingOf(row, weights) {
  let r = 0;
  for (const [f, w] of Object.entries(weights)) r += w * valueOf(row, f);
  return Math.round(r * 10) / 10;
}

// "18 PTS · 7 REB · 6 AST" for the explanation.
function lineOf(row, weights, sport) {
  const labels = rulesFor(sport).statLabels || {};
  return Object.keys(weights)
    .map((f) => [f, valueOf(row, f)])
    .filter(([, v]) => v > 0)
    .map(([f, v]) => `${v} ${labels[f]?.short || f}`)
    .join(' · ');
}

// The automatic pick for a finished match: { player, rating, line, reason } or null.
async function suggestMvp(match, sport) {
  const winner = match.seriesWinner;
  if (!winner) return null;
  const links = await TeamPlayer.find({ team: winner }).select('player').lean();
  const ids = links.map((l) => String(l.player));
  if (!ids.length) return null;
  const weights = weightsFor(sport);
  const rows = Object.keys(weights).length
    ? await PlayerMatchStats.find({ match: match._id, player: { $in: ids } }).lean()
    : [];
  const primary = typeOf(sport) === 'esports' ? 'kills' : 'points';
  const penalty = typeOf(sport) === 'esports' ? 'deaths' : 'fouls';
  const scored = rows
    .map((row) => ({ row, rating: ratingOf(row, weights) }))
    .filter((x) => Object.keys(weights).some((f) => valueOf(x.row, f) > 0))
    .sort((a, b) => b.rating - a.rating
      || valueOf(b.row, primary) - valueOf(a.row, primary)
      || valueOf(a.row, penalty) - valueOf(b.row, penalty));
  if (scored.length) {
    const best = scored[0];
    return { player: best.row.player, rating: best.rating, line: lineOf(best.row, weights, sport), reason: 'stats' };
  }
  // Singles: the winner is the only player of the winning side.
  if (ids.length === 1) return { player: ids[0], rating: null, line: '', reason: 'singles' };
  return null;
}

// Recount and save the automatic MVP, unless the score keeper chose one by hand.
async function applyAutoMvp(matchId, sport) {
  const match = await Match.findById(matchId);
  if (!match || match.status !== 'completed' || match.mvpPick === 'manual') return null;
  // A match finished before automatic MVPs (no mvpPick) whose MVP was chosen by hand: keep it.
  if (!match.mvpPick && match.mvp) return null;
  const s = await suggestMvp(match, sport);
  await Match.updateOne(
    { _id: match._id, mvpPick: { $ne: 'manual' } },
    { $set: { mvp: s ? s.player : null, mvpPick: 'auto', mvpRating: s ? s.rating : null } }
  );
  return s;
}

// The formula in words, for the screen: "PTS + REB + AST − ½ FOUL".
function formulaText(sport) {
  const labels = rulesFor(sport).statLabels || {};
  const w = weightsFor(sport);
  // Plus columns first, then the minus ones (sheet order within each).
  const entries = Object.entries(w);
  const ordered = [...entries.filter(([, v]) => v > 0), ...entries.filter(([, v]) => v < 0)];
  const parts = ordered.map(([f, v]) => {
    const name = labels[f]?.short || f;
    const mag = Math.abs(v) === 1 ? '' : Math.abs(v) === 0.5 ? '½ ' : `${Math.abs(v)} `;
    return { sign: v < 0 ? '−' : '+', text: `${mag}${name}` };
  });
  return parts.map((p, i) => (i === 0 && p.sign === '+' ? p.text : `${p.sign} ${p.text}`)).join(' ');
}

module.exports = { suggestMvp, applyAutoMvp, formulaText, weightsFor };
