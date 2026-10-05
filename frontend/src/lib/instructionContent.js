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
        "Everything else in the app is scoped to whichever season is active. A season runs through five stages (setup, registration, verification, ongoing, completed), and only you can advance it.",
      icon: CalendarRange,
      shots: [["create-season.png", "The Season page: its stage, the seasons before it, and Create New Season"]],
    },
    {
      title: "Reference List",
      description:
        "Upload the SK Federation's reference list (a CSV) from Reference List. Every player a Barangay Admin adds is checked against it automatically. Uploading a new list replaces the old one for the season.",
      icon: ClipboardList,
      shots: [
        ["reference-list.png", "The Reference List page"],
        ["reference-upload.png", "Choose the CSV, then tap Upload & Replace List"],
      ],
    },
    {
      title: "Review Queue",
      description:
        "Players the system can't confirm land here as “needs document” or “flagged.” Open a player to compare their photo against their submitted ID, then Approve or Reject. Rejecting removes the player and reopens the roster so the barangay can fix it.",
      icon: UserCheck,
      shots: [
        ["review-queue.png", "Pick a barangay: red shows how many teams are waiting"],
        ["review-queue-modal.png", "A player's photo, details and documents side by side, then Approve or Reject"],
      ],
    },
    {
      title: "League Setup",
      description:
        "Configure each sport's divisions, roster format, scoring rules and after-match score sheet here, and which barangays may field players from other barangays. Set these before registration opens, since changing them afterward would invalidate rosters already built against the old settings.",
      icon: Settings2,
      shots: [
        ["league-setup.png", "Games: every game with its divisions, entry and draw"],
        ["league-setup2.png", "Open a game and set it up step by step"],
        ["league-setup3.png", "Barangays: who may field players from other barangays"],
      ],
    },
    {
      title: "Tournaments",
      description:
        "Once enough teams in a division are verified, generate its bracket from Tournaments (pick the sport in the sidebar). The structure locks at draw time. Organizers only ever enter scores, never pick who advances.",
      icon: Trophy,
      shots: [["tournament-side.png", "Pick a sport in the sidebar, then generate its tournament"]],
    },
    {
      title: "Accounts",
      description:
        "Provision any missing barangay-admin or organizer account in one click from Accounts. Temporary passwords are shown once. Copy and share them before you close that screen.",
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
        "Tap your name above Sign out (bottom of the sidebar) to change your password, add a profile photo or a Dashboard banner picture. Generate a recovery code and keep it somewhere safe: it's the only way back in if you forget your password, since no one can reset a Super Admin's password for you.",
      icon: UserCircle,
      shots: [
        ["profile.png", "Your name above Sign out opens your profile"],
        ["profile-info.png", "Profile photo, Dashboard banner and password"],
        ["profile-recovery.png", "Account recovery: enter your password to generate a code. It's shown only once"],
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
        "From My Teams, pick a sport and division, name the team, then open its roster and add players: name, birthdate, address, jersey number, and a close-up photo. You can also import a CSV.",
      icon: UserPlus,
      shots: [
        ["teams.png", "My Teams: your barangay logo and Register a team"],
        ["team-create.png", "Pick the sport and division, name the team, tap Create team"],
        ["team-created.png", "The new team is a draft. Tap Edit roster"],
        ["team-modal-edit-roster.png", "Add your players one by one, or Import CSV"],
      ],
    },
    {
      title: "Documents",
      description:
        "Players 15 and under, or anyone the system can't confirm from the reference list, need a supporting document. Upload it from Verification Status. The Super Admin reviews it before your team can be verified.",
      icon: ClipboardList,
      shots: [
        ["verification-status.png", "Verification Status: every player's result"],
        ["verification-status-document.png", "Pick the document type, then choose the file"],
      ],
    },
    {
      title: "Submit & track",
      description:
        "Once your roster meets the size limit, submit it. It locks and gets screened automatically. Watch each player's status turn eligible, or follow up if one comes back flagged.",
      icon: Send,
      shots: [["team-submit-modal.png", "Roster ready: tap Submit roster"]],
    },
    {
      title: "Follow your matches",
      description:
        "Once the tournaments start, Matches shows your barangay's games: when and where they are, and the results.",
      icon: CalendarDays,
      shots: [["matches.png", "Your barangay's matches"]],
    },
  ],
  organizer: [
    {
      title: "Welcome, Organizer",
      description: "You score matches for your assigned sport, courtside, in real time. The Dashboard shows the game being played now, today's schedule and how far each bracket has got.",
      icon: Radio,
      shots: [["dashboard.png", "Your Dashboard: your sport, the season, today's games and what needs attention"]],
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
        "Up to three people can work one match on this account. Each picks a job: the Score keeper picks how many periods, taps Start, then taps the team that scored (+1, +2 or +3 in basketball). A Stats keeper for each barangay taps that team's players' points, fouls and other stats as they happen. Player points don't change the team score. Everything updates live on the public site as you go.",
      icon: Play,
      shots: [
        ["start.png", "Choose the number of periods and tap Start match"],
        ["scoring.png", "Tap the team that scored"],
      ],
    },
    {
      title: "End the match",
      description:
        "Once every period is in, End match locks the score and advances the winner automatically. You never pick who moves on, the score decides it.",
      icon: Flag,
      shots: [["completed.png", "Finished games move to the Completed tab"]],
    },
    {
      title: "Fill in the player stats",
      description:
        "After the match, a score sheet lists every player, already filled in from the stats keepers' live taps. Correct anything that's off in the columns the Super Admin set up for your sport (for example points, fouls, rebounds, blocks and assists in basketball; the role each player played, and kills / deaths / assists, in esports). Leave a player blank if they didn't play, choose the MVP and Save. You can come back and correct it later.",
      icon: ClipboardList,
      shots: [["scoresheet.png", "Player stats: each player's totals, team by team, then Save"]],
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

// Which guide step a page belongs to (Oct 2026): "How this works" and the "?" open the guide AT
// that step (e.g. Season opens on "Start a season", step 2), not always on the welcome step.
// Indexes into RAW_STEPS above: keep in step if steps are added or reordered. Longest path wins.
const STEP_FOR_PATH = {
  super_admin: {
    "/admin/season": 1, "/admin/reference": 2, "/admin/review": 3, "/admin/config": 4,
    "/admin/tournaments": 5, "/admin/accounts": 6,
    "/admin/champions": 7, "/admin/reports": 7, "/admin/site-images": 7,
  },
  barangay_admin: { "/brgy": 1, "/brgy/documents": 2, "/brgy/matches": 4 },
  organizer: { "/organizer": 1 },
};

export function stepForPath(role, pathname) {
  const map = STEP_FOR_PATH[role] || {};
  const key = Object.keys(map)
    .filter((k) => pathname === k || pathname.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length)[0];
  // Dashboards ("/brgy/dashboard" would otherwise match "/brgy") start at the welcome step.
  if (!key || /\/dashboard$/.test(pathname)) return 0;
  return map[key];
}
