// Content for the first-login orientation modal (components/InstructionModal.jsx)
// — promised in the thesis (Chapter 3, Data Collection Procedure) and required
// for the September evaluation to orient a real SK Chairperson/organizer who
// has never seen this system before.
//
// Each step has an `icon` (fallback) and a list of `shots`: screenshots shown
// together on the right of the modal (a large viewer plus a thumbnail strip of
// every shot for that step), each one clickable to open a zoomable view. Files
// live in frontend/public/instructions/<role folder>/ and are listed here by
// file name with a caption, so a step can have any number of them in any order
// (see that folder's README.md). A step with no shots shows its icon instead.
// Screenshots go stale when a page is redesigned, so re-capture the affected
// ones after a UI pass.

import {
  Building2, CalendarDays, CalendarRange, ClipboardList, Flag, Images, KeyRound,
  LayoutDashboard, ListChecks, Play, Radio, Send, Settings2, Trophy,
  UserCheck, UserCircle, UserPlus,
} from "lucide-react";

export const ROLE_LABEL = {
  super_admin: "Super Admin",
  barangay_admin: "Barangay Admin",
  organizer: "Organizer",
};

const RAW_STEPS = {
  super_admin: [
    {
      title: "Welcome, Super Admin",
      description:
        "You run the season end to end: set up the league, verify player residency, generate brackets, and provision accounts for every barangay and organizer. The Dashboard shows where the season stands and lists what needs your attention.",
      icon: LayoutDashboard,
      shots: [["dashboard.png", "The Dashboard: season progress and what needs your attention"]],
    },
    {
      title: "Start a season",
      description:
        "Everything else in the app is scoped to whichever season is active. A season runs through five stages — setup, registration, verification, ongoing, completed — and only you can advance it.",
      icon: CalendarRange,
      shots: [
        ["create-season.png", "No season yet: tap Create Season"],
        ["create-season-modal.png", "Name the season"],
        ["create-season-dashboard.png", "The season page: its stage, and a checklist before you move on"],
      ],
    },
    {
      title: "Reference List",
      description:
        "Upload the SK Federation's reference list (a CSV) from Reference List. Every player a Barangay Admin adds is checked against it automatically — uploading a new list replaces the old one for the season.",
      icon: ClipboardList,
      shots: [
        ["reference-list.png", "The Reference List page"],
        ["reference-list-upload.png", "Upload the CSV"],
        ["reference-list-uploadedlist.png", "The uploaded list, searchable"],
      ],
    },
    {
      title: "Review Queue",
      description:
        "Players the system can't confirm land here as “needs document” or “flagged.” Open a player to compare their photo against their submitted ID, then Approve or Reject — rejecting removes the player and reopens the roster so the barangay can fix it.",
      icon: UserCheck,
      shots: [
        ["review-queue.png", "Teams waiting for review, filtered by barangay"],
        ["review-queue-modal.png", "A player's photo, details and documents side by side"],
        ["review-queue-modal-2.png", "Approve or reject the player"],
      ],
    },
    {
      title: "League Setup",
      description:
        "Configure each sport's divisions, roster format, scoring rules and after-match score sheet here, and which barangays may field players from other barangays. Set these before registration opens, since changing them afterward would invalidate rosters already built against the old settings.",
      icon: Settings2,
      shots: [
        ["league-setup-games.png", "Games: divisions, entry format, scoring and score sheet"],
        ["league-setup-brgy.png", "Barangays: who may field players from other barangays"],
      ],
    },
    {
      title: "Tournaments",
      description:
        "Once enough teams in a division are verified, generate its bracket from Tournaments (pick the sport in the sidebar). The structure locks at draw time — organizers only ever enter scores, never pick who advances.",
      icon: Trophy,
      shots: [["tournament-side.png", "Pick a sport in the sidebar, then generate its tournament"]],
    },
    {
      title: "Accounts",
      description:
        "Provision any missing barangay-admin or organizer account in one click from Accounts. Temporary passwords are shown once — copy and share them before you close that screen.",
      icon: KeyRound,
      shots: [["accounts.png", "Every account, its password status, and Provision all"]],
    },
    {
      title: "Champions, Reports & Site Images",
      description:
        "Record each season's champions for the public archive, pull reports, and change the photos shown on the public website.",
      icon: Images,
      shots: [
        ["champions.png", "Champions: the permanent archive"],
        ["reports.png", "Reports"],
        ["site-images.png", "Site Images: the public website's photos"],
      ],
    },
    {
      title: "Your profile & recovery code",
      description:
        "Tap your name at the top right to change your password or add a profile photo. Generate a recovery code and keep it somewhere safe: it's the only way back in if you forget your password, since no one can reset a Super Admin's password for you.",
      icon: UserCircle,
      shots: [
        ["profile.png", "Your name at the top right opens your profile"],
        ["profile-info.png", "Change your password, or set up account recovery"],
        ["profile-generated-recovery.png", "A new recovery code is shown only once — save it"],
      ],
    },
  ],
  barangay_admin: [
    {
      title: "Welcome, Barangay Admin",
      description:
        "You register your barangay's teams, build their rosters, and upload residency documents for any player who needs one. The Dashboard shows how far your teams have got.",
      icon: Building2,
      shots: [["dashboard.png", "Your Dashboard"]],
    },
    {
      title: "Register a team",
      description:
        "From My Teams, pick a sport and division, name the team, then open its roster and add players — name, birthdate, address, jersey number, and a close-up photo. You can also import a CSV.",
      icon: UserPlus,
      shots: [
        ["teams.png", "My Teams"],
        ["teams-create.png", "Pick the sport"],
        ["teams-create-2.png", "Name the team and tap Create team"],
        ["teams-created.png", "The new team is a draft — tap Edit roster"],
        ["teams-modal-edit-roster.png", "Add your players"],
      ],
    },
    {
      title: "Documents",
      description:
        "Players 15 and under, or anyone the system can't confirm from the reference list, need a supporting document. Upload it from Verification Status — the Super Admin reviews it before your team can be verified.",
      icon: ClipboardList,
      shots: [
        ["verification-status.png", "Verification Status: every player's result"],
        ["verification-status-document.png", "Pick the document type and upload the file"],
      ],
    },
    {
      title: "Submit & track",
      description:
        "Once your roster meets the size limit, submit it. It locks and gets screened automatically — watch each player's status turn eligible, or follow up if one comes back flagged.",
      icon: Send,
      shots: [["teams-submit-modal.png", "Roster ready: tap Submit roster"]],
    },
    {
      title: "Follow your matches",
      description:
        "Once the tournaments start, Matches shows your barangay's games — when and where they are, and the results.",
      icon: CalendarDays,
      shots: [["matches.png", "Your barangay's matches"]],
    },
  ],
  organizer: [
    {
      title: "Welcome, Organizer",
      description: "You score matches for your assigned sport, courtside, in real time. The Dashboard shows the game being played now, today's schedule and how far each bracket has got.",
      icon: Radio,
      shots: [
        ["dashboard-1.png", "Your Dashboard"],
        ["dashboard-2.png", "Today, the schedule, bracket progress and recent results"],
      ],
    },
    {
      title: "Find your match",
      description:
        "Your match list only shows your sport. “Playing now” and “Today” sit at the top, so you never have to scroll to find the game in front of you.",
      icon: ListChecks,
      shots: [["matches.png", "Matches: games to play, by division"]],
    },
    {
      title: "Start & score",
      description:
        "Pick how many periods you're playing, tap Start, then tap the team that scored (+1, +2 or +3 in basketball). Scoring is by team — you don't pick players while the game runs. Everything updates live on the public site as you go.",
      icon: Play,
      shots: [
        ["start.png", "Choose the number of periods and tap Start"],
        ["scoring.png", "Tap the team that scored"],
      ],
    },
    {
      title: "End the match",
      description:
        "Once every period is in, End match locks the score and advances the winner automatically — you never pick who moves on, the score decides it.",
      icon: Flag,
      shots: [["completed.png", "Finished games move to the Completed tab"]],
    },
    {
      title: "Fill in the player stats",
      description:
        "After the match, a score sheet lists every player. Fill in the columns the Super Admin set up for your sport (for example points, fouls, rebounds, blocks and assists in basketball; the role each player played, and kills / deaths / assists, in esports). Leave a player blank if they didn't play, choose the MVP and Save — you can come back and correct it later.",
      icon: ClipboardList,
    },
  ],
};

const SHOT_FOLDER = {
  super_admin: "super-admin",
  barangay_admin: "barangay-admin",
  organizer: "organizer",
};

export const INSTRUCTION_STEPS = Object.fromEntries(
  Object.entries(RAW_STEPS).map(([role, steps]) => [
    role,
    steps.map((s) => ({
      ...s,
      shots: (s.shots || []).map(([file, caption]) => ({
        src: `/instructions/${SHOT_FOLDER[role]}/${file}`,
        caption,
      })),
    })),
  ])
);
