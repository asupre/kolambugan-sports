// src/models/Sport.js
// The sports in the league. Physical sports use double-elimination;
// Mobile Legends uses grouped round-robin. This model stores that difference.

const mongoose = require('mongoose');

const sportSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,            // "Basketball", "Volleyball", "Mobile Legends", etc.
      trim: true,
    },
    category: {
      type: String,
      enum: ['physical', 'esports', 'board'],   // physical = a sport; esports; board = a board game (chess)
      required: true,
    },
    tournamentFormat: {
      type: String,
      enum: ['double_elimination', 'round_robin'],
      required: true,
      // physical sports -> double_elimination
      // Mobile Legends  -> round_robin
    },
    // Whether this sport runs separate boys' and girls' brackets this season.
    // false = single "open" bracket; true = boys + girls, each its own bracket.
    // Set by the Super Admin when opening registration.
        isDivided: {
      type: Boolean,
      default: false,
    },
    // Which divisions this sport runs THIS SEASON (set by Super Admin when opening
    // registration). e.g. Basketball ['under15','under30']; Volleyball ['boys','girls'];
    // Billiards/ML ['open']. Drives one bracket per division.
    divisions: {
      type: [String],
      default: ['open'],
    },
    // The entry format this sport runs THIS SEASON:
    //   'team'    -> squad sports
    //   'singles' -> badminton if the admin picks singles; billiards
    //   'doubles' -> badminton if the admin picks doubles; pickleball (always)
    entryFormat: {
      type: String,
      enum: ['team', 'singles', 'doubles'],
      default: 'team',
    },
     // ── Per-sport rules ───────────────────────────────────────────────────
    // These used to be hardcoded by sport NAME across three route files, which
    // meant a new sport could be created but never scored or drawn. Each is
    // left null so it falls back to the original built-in default for the seven
    // seeded sports — nothing changes until someone configures it.

    // How the organizer scores:
    //   player — every point belongs to a player (basketball)
    //   rally  — player points plus a team button for opponent errors
    //   final  — no per-player scoring; who won each game
    scoringMode: {
      type: String,
      enum: ['player', 'rally', 'final', null],
      default: null,
    },
    // What one scoring action can add. Basketball 1/2/3; rally sports [1].
    pointValues: { type: [Number], default: undefined },
    // Display only — "quarter", "set", "game".
    periodLabel: { type: String, default: null, trim: true },
    // Which period counts an organizer may choose at the start of a match.
    periodOptions: { type: [Number], default: undefined },
    // Stats beyond points. Fouls only belong where the sport has them.
    statTypes: {
      type: [String],
      enum: ['foul', 'rebound', 'assist'],
      default: undefined,
    },
    // The after-match score sheet: which stat columns the organizer fills in per player
    // (keys from lib/sportRules.js STAT_CATALOG). Absent = the built-in default for the sport;
    // an empty array = no player form at all.
    scoreSheet: { type: [String], default: undefined },
    // Columns the Super Admin added themselves (e.g. "Spikes"). See lib/sportRules.js.
    customStats: {
      type: [new mongoose.Schema({ key: { type: String, required: true }, label: { type: String, required: true } }, { _id: false })],
      default: undefined,
    },
    // How many players are on court at once, so the scoring screen shows only
    // those. Null means show the whole roster.
    onCourt: { type: Number, default: null },
    // Entries a single barangay may register. Mobile Legends allows 2.
    teamsPerBarangay: { type: Number, default: null },
    // How many groups the draw creates, and how many teams reach the knockout.
    numGroups: { type: Number, default: null },
    knockoutSize: { type: Number, default: null },
    // Whether this game is part of the league this season (Nov 2026, Super Admin: untick a game
    // instead of deleting it, so it keeps its settings and can be ticked back later). An
    // excluded game is hidden from registration, the public site and the dashboards.
    // Absent on older records = included; query with Sport.ACTIVE.
    active: { type: Boolean, default: true },
  
  },
  {
    timestamps: true,
  }
);

// The draw is the Super Admin's CHOICE per game (Nov 2026, professor's suggestion). This used to
// force it from the type (Sep 2026: esports always round-robin; Oct 31 2026: sports and board
// games always double elimination). Now a new game only starts on its type's usual draw when none
// was given; after that, League Setup decides (routes/reference.js PATCH /sports/:id).
sportSchema.pre('validate', function () {
  if (this.isNew && !this.tournamentFormat) {
    this.tournamentFormat = this.category === 'esports' ? 'round_robin' : 'double_elimination';
  }
});

const Sport = mongoose.model('Sport', sportSchema);
// Filter for games included this season (older records have no `active` field).
Sport.ACTIVE = { active: { $ne: false } };
module.exports = Sport;