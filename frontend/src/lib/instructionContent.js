// Content for the first-login orientation modal (components/InstructionModal.jsx)
// — promised in the thesis (Chapter 3, Data Collection Procedure) and required
// for the September evaluation to orient a real SK Chairperson/organizer who
// has never seen this system before.
//
// Screenshots live in frontend/public/instructions/, referenced below by
// exact filename. Until a file exists at that path, that step shows a
// graceful placeholder instead of a broken image (see StepImage in
// InstructionModal.jsx). Keep this list and the folder's README.md in sync
// if a step is ever added, removed, or renamed.

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
      screenshot: "/instructions/super-admin-welcome.png",
    },
    {
      title: "Start a season",
      description:
        "Everything else in the app is scoped to whichever season is active. A season runs through five stages — setup, registration, verification, ongoing, completed — and only you can advance it.",
      screenshot: "/instructions/super-admin-create-season.png",
    },
    {
      title: "Reference List",
      description:
        "Upload the SK Federation's reference list (a CSV) from Reference List. Every player a Barangay Admin adds is checked against it automatically — uploading a new list replaces the old one for the season.",
      screenshot: "/instructions/super-admin-reference-list.png",
    },
    {
      title: "Review Queue",
      description:
        "Players the system can't confirm land here as “needs document” or “flagged.” Open a player to compare their photo against their submitted ID, then Approve or Reject — rejecting removes the player and reopens the roster so the barangay can fix it.",
      screenshot: "/instructions/super-admin-review-queue.png",
    },
    {
      title: "League Setup",
      description:
        "Configure each sport's divisions and roster format here — set these before registration opens, since changing them afterward would invalidate rosters already built against the old settings.",
      screenshot: "/instructions/super-admin-league-set-up.png",
    },
    {
      title: "Tournaments",
      description:
        "Once enough teams in a division are verified, generate its bracket from Tournaments. The structure locks at draw time — organizers only ever enter scores, never pick who advances.",
      screenshot: "/instructions/super-admin-tournaments.png",
    },
    {
      title: "Accounts",
      description:
        "Provision any missing barangay-admin or organizer account in one click from Accounts. Temporary passwords are shown once — copy and share them before you close that screen.",
      screenshot: "/instructions/super-admin-accounts.png",
    },
  ],
  barangay_admin: [
    {
      title: "Welcome, Barangay Admin",
      description:
        "You register your barangay's teams, build their rosters, and upload residency documents for any player who needs one.",
      screenshot: "/instructions/brgy-admin-welcome.png",
    },
    {
      title: "Register a team",
      description:
        "From Team Registration, pick a sport and division, then add players one at a time — name, birthdate, address, jersey number, and a close-up photo.",
      screenshot: "/instructions/brgy-admin-register.png",
    },
    {
      title: "Documents",
      description:
        "Players under 15, or anyone the system can't confirm from the reference list, need a supporting document. Upload it from Document Submission — the Super Admin reviews it before your team can be verified.",
      screenshot: "/instructions/brgy-admin-document.png",
    },
    {
      title: "Submit & track",
      description:
        "Once your roster meets the size limit, submit it. It locks and gets screened automatically — watch each player's status turn eligible, or follow up if one comes back flagged.",
      screenshot: "/instructions/brgy-admin-submit.png",
    },
  ],
  organizer: [
    {
      title: "Welcome, Organizer",
      description: "You score matches for your assigned sport, courtside, in real time.",
      screenshot: "/instructions/organizer-welcome.png",
    },
    {
      title: "Find your match",
      description:
        "Your match list only shows your sport. “Playing now” and “Today” sit at the top, so you never have to scroll to find the game in front of you.",
      screenshot: "/instructions/organizer-findmatch.png",
    },
    {
      title: "Start & score",
      description:
        "Pick how many periods you're playing, tap Start, then tap a player's score buttons as points happen. Everything updates live on the public site as you go.",
      screenshot: "/instructions/organizer-start-score.png",
    },
    {
      title: "Substitute",
      description:
        "Tap Substitute to change who's shown on court. It's just a display filter — swap freely to match who's actually playing; nothing about who's in or out is recorded.",
      screenshot: "/instructions/organizer-substitute.png",
    },
    {
      title: "End the match",
      description:
        "Once every period is in, End match locks the score, lets you name the MVP, and advances the winner automatically — you never pick who moves on, the score decides it.",
      screenshot: "/instructions/organizer-endmatch.png",
    },
  ],
};
