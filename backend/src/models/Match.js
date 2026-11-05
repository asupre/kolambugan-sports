// src/models/Match.js
// A single match between two teams. Holds the score, the best-of series games,
// the bracket routing (where winner/loser go next), and an audit trail of who
// entered the result. Advancement is SCORE-DRIVEN: the system decides the winner
// from the entered score, never the organizer picking manually.

const mongoose = require('mongoose');

// A match can be a best-of series (BO3/BO5/BO7). Each game in the series is one of these.
const gameSchema = new mongoose.Schema(
  {
    gameNumber: { type: Number, required: true },
    scoreA: { type: Number, default: 0 },   // team A's score in this game
    scoreB: { type: Number, default: 0 },   // team B's score in this game
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
  },
  { _id: false }   // these are sub-documents inside a match; they don't need their own id
);

// One job on a live match (see `jobs` below): which device holds it, since when, last seen.
const jobSlot = () => ({
  device: { type: String, default: null },
  since: { type: Date, default: null },
  seen: { type: Date, default: null },
});

const matchSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament',
      required: true,
    },
    // Which bracket this match belongs to (for double-elimination).
        bracket: {
      type: String,
      enum: ['winners', 'losers', 'final', 'group', 'third', 'knockout', 'ko_final', 'ko_third'],
      default: 'group',
    },
    round: { type: Number },              // round number within the bracket/stage
    group: { type: String, default: null }, // group label for round-robin (e.g. "A")

    teamA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,       // may be null until an earlier match feeds a team in
    },
    teamB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },

    // The organizer (game official) assigned to score this match.
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    bestOf: {
      type: Number,
      enum: [1, 2,3, 4, 5, 7],
      default: 1,          // physical sports use 1; ML knockouts use 3/5/7
    },
    games: {
      type: [gameSchema],  // the individual games in the series
      default: [],
    },
    seriesWinner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,       // set by the system once one team wins the majority
    },
        // --- LIVE SCORING (organizer's courtside screen) ---
    // Running tally while status === 'ongoing'. Every tap updates these, so the
    // bracket and public viewer can read the current score cheaply (no aggregating
    // PlayerMatchStats). On "End match" these are written into games[] as the result.
    liveScoreA: { type: Number, default: 0 },
    liveScoreB: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },   // when the organizer tapped Start
    // Who is on court right now (Oct 2026): picked in the starting-lineup modal at Start and
    // changed by substitutions. Only for team sports with an on-court count (basketball 5,
    // volleyball 6, esports 5); empty for everything else.
    lineupA: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    lineupB: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    // Every substitution, in order: who came off, who went in, during which period, when.
    subs: [{
      _id: false,
      side: { type: String, enum: ['A', 'B'] },
      playerOut: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
      playerIn: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
      period: { type: Number, default: 1 },
      at: { type: Date, default: Date.now },
      // Which job's device made it ('score', 'statsA', 'statsB'). All three share one login,
      // so this is the only "who" on record: a job, never a person.
      by: { type: String, default: null },
    }],
    // Job claims (Oct 2026): up to three devices work one match on the sport's one organizer
    // account, and each job is held by ONE device. `device` is a random id the browser tab
    // makes for itself (sent as the X-Device-Id header); `seen` is refreshed while that
    // device has the match open, so a job whose phone died can be taken over after a while.
    jobs: {
      score: jobSlot(),
      statsA: jobSlot(),
      statsB: jobSlot(),
    },
    // After-match forms (Oct 2026): each save sends the version it loaded and bumps it, so a
    // save made from an older copy of the form is refused instead of overwriting a newer one.
    // A / B = each team's player stats form, result = the score keeper's result + MVP form.
    formVersion: {
      A: { type: Number, default: 0 },
      B: { type: Number, default: 0 },
      result: { type: Number, default: 0 },
    },
    // Organizer's declared MVP (suggested as top scorer, confirmed by the organizer).
    mvp: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      default: null,
    },

    // Bracket routing: where the winner and loser go next. Pre-generated at draw time
    // and LOCKED, so advancement is determined by structure, not by an admin's choice.
    nextMatchWin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      default: null,
    },
    nextMatchLose: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      default: null,
    },

    isTiebreaker: {
      type: Boolean,
      default: false,      // true if this is a playoff to break a group-stage tie
    },

    status: {
      type: String,
      enum: ['scheduled', 'ongoing', 'completed', 'forfeited'],
      default: 'scheduled',
    },
        // What the organizer did last, so a mis-tap is one tap to reverse. Only one
    // step deep — this is an undo button, not a history.
    lastAction: {
      type: { type: String, default: null },        // 'points' (per-player actions were removed Sep 2026)
      side: { type: String, default: null },
      player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
      amount: { type: Number, default: 0 },
      label: { type: String, default: '' },         // shown on the button
    },
    schedule: {
      type: Date,          // when the match is set to be played
    },
    // When the game is expected to END (Nov 2026, Super Admin): same day as `schedule`. Two games of
    // one sport can't overlap (routes/tournament.js findScheduleClash). Null for a date with no time,
    // and on matches dated before this field existed (those count as a single minute).
    scheduleEnd: {
      type: Date,
      default: null,
    },
     venue: {
      type: String,        // where it's played, e.g. "Kolambugan Covered Court"
      trim: true,
      default: "",
    },

    // Audit trail: who entered the final result and when.
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    enteredAt: {
      type: Date,
      default: null,
    },
    // The scorer's username, copied here when their account is deleted (Oct 2026: an
    // organizer from a finished season may be deleted), so the audit trail still names
    // who entered the result after enteredBy no longer resolves.
    enteredByName: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Match', matchSchema);