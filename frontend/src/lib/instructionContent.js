// Content for the first-login orientation modal (components/InstructionModal.jsx)
// — promised in the thesis (Chapter 3, Data Collection Procedure) and required
// for the September evaluation to orient a real SK Chairperson/organizer who
// has never seen this system before.
//
// Text + icon only (Sep 2026) — was screenshot-based (frontend/public/
// instructions/*.png). Dropped the screenshots: every UI pass this project
// goes through (and there have been several) makes them stale again, and a
// stale screenshot showing an old layout is worse for a first-time user than
// no screenshot at all. An icon doesn't go stale. Keep new steps to an
// `icon` + short description, not a screenshot path.

import {
  Building2, CalendarRange, ClipboardList, Flag, KeyRound,
  LayoutDashboard, ListChecks, Play, Radio, Repeat,
  Send, Settings2, Trophy, UserCheck, UserPlus,
} from "lucide-react";

export const ROLE_LABEL = {
  super_admin: "Super Admin",
  barangay_admin: "Barangay Admin",
  organizer: "Organizer",
};

export const INSTRUCTION_STEPS = {
  super_admin: [
    {
      title: "Welcome, Super Admin",
      description:
        "You run the season end to end: set up the league, verify player residency, generate brackets, and provision accounts for every barangay and organizer.",
      icon: LayoutDashboard,
    },
    {
      title: "Start a season",
      description:
        "Everything else in the app is scoped to whichever season is active. A season runs through five stages — setup, registration, verification, ongoing, completed — and only you can advance it.",
      icon: CalendarRange,
    },
    {
      title: "Reference List",
      description:
        "Upload the SK Federation's reference list (a CSV) from Reference List. Every player a Barangay Admin adds is checked against it automatically — uploading a new list replaces the old one for the season.",
      icon: ClipboardList,
    },
    {
      title: "Review Queue",
      description:
        "Players the system can't confirm land here as “needs document” or “flagged.” Open a player to compare their photo against their submitted ID, then Approve or Reject — rejecting removes the player and reopens the roster so the barangay can fix it.",
      icon: UserCheck,
    },
    {
      title: "League Setup",
      description:
        "Configure each sport's divisions and roster format here — set these before registration opens, since changing them afterward would invalidate rosters already built against the old settings.",
      icon: Settings2,
    },
    {
      title: "Tournaments",
      description:
        "Once enough teams in a division are verified, generate its bracket from Tournaments. The structure locks at draw time — organizers only ever enter scores, never pick who advances.",
      icon: Trophy,
    },
    {
      title: "Accounts",
      description:
        "Provision any missing barangay-admin or organizer account in one click from Accounts. Temporary passwords are shown once — copy and share them before you close that screen.",
      icon: KeyRound,
    },
  ],
  barangay_admin: [
    {
      title: "Welcome, Barangay Admin",
      description:
        "You register your barangay's teams, build their rosters, and upload residency documents for any player who needs one.",
      icon: Building2,
    },
    {
      title: "Register a team",
      description:
        "From Team Registration, pick a sport and division, then add players one at a time — name, birthdate, address, jersey number, and a close-up photo.",
      icon: UserPlus,
    },
    {
      title: "Documents",
      description:
        "Players under 15, or anyone the system can't confirm from the reference list, need a supporting document. Upload it from Document Submission — the Super Admin reviews it before your team can be verified.",
      icon: ClipboardList,
    },
    {
      title: "Submit & track",
      description:
        "Once your roster meets the size limit, submit it. It locks and gets screened automatically — watch each player's status turn eligible, or follow up if one comes back flagged.",
      icon: Send,
    },
  ],
  organizer: [
    {
      title: "Welcome, Organizer",
      description: "You score matches for your assigned sport, courtside, in real time.",
      icon: Radio,
    },
    {
      title: "Find your match",
      description:
        "Your match list only shows your sport. “Playing now” and “Today” sit at the top, so you never have to scroll to find the game in front of you.",
      icon: ListChecks,
    },
    {
      title: "Start & score",
      description:
        "Pick how many periods you're playing, tap Start, then tap a player's score buttons as points happen. Everything updates live on the public site as you go.",
      icon: Play,
    },
    {
      title: "Substitute",
      description:
        "Tap Substitute to change who's shown on court. It's just a display filter — swap freely to match who's actually playing; nothing about who's in or out is recorded.",
      icon: Repeat,
    },
    {
      title: "End the match",
      description:
        "Once every period is in, End match locks the score, lets you name the MVP, and advances the winner automatically — you never pick who moves on, the score decides it.",
      icon: Flag,
    },
  ],
};
