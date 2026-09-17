// Content for the first-login orientation modal (components/InstructionModal.jsx)
// — promised in the thesis (Chapter 3, Data Collection Procedure) and required
// for the September evaluation to orient a real SK Chairperson/organizer who
// has never seen this system before.
//
// SCREENSHOTS NEEDED — none exist yet. Drop real PNGs (any 16:9-ish crop,
// the modal displays them object-fit: cover, anchored top) into
// frontend/public/instructions/ using these exact filenames. Until a file
// exists, that step shows a graceful placeholder instead of a broken image
// (see StepImage in InstructionModal.jsx), so this feature is fully usable
// right now — the screenshots are a polish item, not a blocker.
//
//   super-admin-1.png    — the Dashboard
//   super-admin-2.png    — Reference List upload
//   super-admin-3.png    — Review Queue, a player open with photo + document
//   super-admin-4.png    — League Setup or a generated bracket
//   super-admin-5.png    — Accounts panel
//   barangay-admin-1.png — the Barangay Admin dashboard/landing
//   barangay-admin-2.png — Team Registration, add-a-player form
//   barangay-admin-3.png — Document Submission
//   barangay-admin-4.png — a roster showing eligibility badges
//   organizer-1.png      — the Organizer match list
//   organizer-2.png      — "Playing now" / "Today" sections
//   organizer-3.png      — the live scoring screen mid-match
//   organizer-4.png      — the End match / MVP confirmation dialog

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
      screenshot: "/instructions/super-admin-1.png",
    },
    {
      title: "Season & Reference List",
      description:
        "Start a season from the Season page, then upload the SK Federation's reference list (a CSV) from Reference List. Every player a Barangay Admin adds is checked against it automatically.",
      screenshot: "/instructions/super-admin-2.png",
    },
    {
      title: "Review Queue",
      description:
        "Players the system can't confirm land here as “needs document” or “flagged.” Open a player to compare their photo against their submitted ID, then Approve or Reject — rejecting removes the player and reopens the roster so the barangay can fix it.",
      screenshot: "/instructions/super-admin-3.png",
    },
    {
      title: "League Setup & Tournaments",
      description:
        "Configure each sport's divisions and roster format in League Setup, then generate the bracket once enough teams are verified. The bracket's structure locks at draw time — organizers only ever enter scores, never pick who advances.",
      screenshot: "/instructions/super-admin-4.png",
    },
    {
      title: "Accounts",
      description:
        "Provision any missing barangay-admin or organizer account in one click from Accounts. Temporary passwords are shown once — copy and share them before you close that screen.",
      screenshot: "/instructions/super-admin-5.png",
    },
  ],
  barangay_admin: [
    {
      title: "Welcome, Barangay Admin",
      description:
        "You register your barangay's teams, build their rosters, and upload residency documents for any player who needs one.",
      screenshot: "/instructions/barangay-admin-1.png",
    },
    {
      title: "Register a team",
      description:
        "From Team Registration, pick a sport and division, then add players one at a time — name, birthdate, address, jersey number, and a close-up photo.",
      screenshot: "/instructions/barangay-admin-2.png",
    },
    {
      title: "Documents",
      description:
        "Players under 15, or anyone the system can't confirm from the reference list, need a supporting document. Upload it from Document Submission — the Super Admin reviews it before your team can be verified.",
      screenshot: "/instructions/barangay-admin-3.png",
    },
    {
      title: "Submit & track",
      description:
        "Once your roster meets the size limit, submit it. It locks and gets screened automatically — watch each player's status turn eligible, or follow up if one comes back flagged.",
      screenshot: "/instructions/barangay-admin-4.png",
    },
  ],
  organizer: [
    {
      title: "Welcome, Organizer",
      description: "You score matches for your assigned sport, courtside, in real time.",
      screenshot: "/instructions/organizer-1.png",
    },
    {
      title: "Find your match",
      description:
        "Your match list only shows your sport. “Playing now” and “Today” sit at the top, so you never have to scroll to find the game in front of you.",
      screenshot: "/instructions/organizer-2.png",
    },
    {
      title: "Start & score",
      description:
        "Pick how many periods you're playing, tap Start, then tap a player's score buttons as points happen. Everything updates live on the public site as you go.",
      screenshot: "/instructions/organizer-3.png",
    },
    {
      title: "End the match",
      description:
        "Once every period is in, End match locks the score, lets you name the MVP, and advances the winner automatically — you never pick who moves on, the score decides it.",
      screenshot: "/instructions/organizer-4.png",
    },
  ],
};
