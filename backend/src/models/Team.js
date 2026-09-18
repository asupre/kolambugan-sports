// src/models/Team.js
// A team = one barangay's entry into one sport for one season.
// Example: "Baybay Warriors" in Basketball for the 2026 Season.

const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    barangay: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Barangay',
      required: true,          // every team belongs to a barangay
    },
    sport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sport',
      required: true,          // every team plays one sport
    },
    season: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Season',
      required: true,          // every team belongs to one season
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',      // a newly submitted team starts as pending
    },
    // Roster lifecycle, separate from verification status above.
    // null = still a draft (editable); a date = submitted & locked.
    submittedAt: {
      type: Date,
      default: null,
    },
        // Which division this entry competes in. Values used per sport:
    //   Basketball  -> 'under15' | 'under30'   (age split)
    //   Volleyball  -> 'boys' | 'girls'
    //   Badminton   -> 'boys' | 'girls'        (crossed with the season's format)
    //   Pickleball  -> 'boys' | 'girls'        (always doubles)
    //   Billiards / Mobile Legends -> 'open'
    division: {
      type: String,
      enum: ['open', 'boys', 'girls', 'under15', 'under30'],
      default: 'open',
    },
    // Squad vs individual entry. Decides the roster size:
    //   'team'    -> 10-15 players (basketball, volleyball, ML)
    //   'singles' -> 1 player  (badminton when the season runs singles; billiards)
    //   'doubles' -> 2 players (badminton when the season runs doubles; pickleball)
    format: {
      type: String,
      enum: ['team', 'singles', 'doubles'],
      default: 'team',
    },
  },
  {
    timestamps: true,
  }
  
);

module.exports = mongoose.model('Team', teamSchema);