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
      enum: [1, 3, 5, 7],
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
    schedule: {
      type: Date,          // when the match is set to be played
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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Match', matchSchema);