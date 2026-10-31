import { divisionLabel } from "./dashboardFormat";

// The Season page's "is it safe to move on?" logic, kept out of the component.
//
// IMPORTANT — what the season stage really controls (checked against the backend,
// Sep 2026): only REGISTRATION is gated by stage (create a team, add / remove a
// player, import a roster, submit a roster: `registration_open` only), plus
// "reopen a verified team" and the Review Queue verdicts — approve / reject / verify —
// (`verification` only; the queue can still be VIEWED at any stage), and generating
// a tournament (`ongoing` only, Oct 2026). Later bracket steps
// and scoring are NOT tied to the stage. So nothing stops a
// premature advance — the checklist below is the Super Admin's only safety net,
// and the CONSEQUENCES text must stay limited to what is actually enforced.

export const NEXT_LABEL = {
  setup: "Open registration",
  registration_open: "Move to Verification",
  verification: "Start the season",
  ongoing: "Close the season",
};

// What advancing OUT of each stage changes. Keep these true.
export const CONSEQUENCES = {
  setup: [
    "Barangay admins can create teams, add players, import rosters and submit them.",
    "Each sport's divisions and entry format should be final. Rosters are built against them.",
  ],
  registration_open: [
    "Barangays can no longer create teams, add or remove players, import a roster, or submit one. Rosters already submitted stay as they are.",
    "Players on teams that aren't verified yet can still be corrected by their barangay.",
    "You can reopen a verified team for corrections. That is only possible during Verification.",
  ],
  verification: [
    "Verified teams can no longer be reopened for corrections. From here they're final.",
    "Tournaments can be generated from the verified teams. That is only possible once the season is Ongoing.",
  ],
  ongoing: [
    "The season is closed and its close date is recorded.",
    "Its matches freeze: organizers can't start or score them, and dates and brackets can't be changed.",
    "You can then create a new season; this one stays in the history.",
  ],
};

const ok = (text) => ({ state: "ok", text });
const warn = (text, to, cta) => ({ state: "warn", text, to, cta });
const info = (text, to, cta) => ({ state: "info", text, to, cta });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// `s` is the payload of GET /api/stats/dashboard.
export function buildReadiness(status, s) {
  if (!s) return [];
  const items = [];

  if (status === "setup") {
    if (s.referenceList?.count > 0) items.push(ok(`Reference list loaded: ${s.referenceList.count.toLocaleString()} residents.`));
    else items.push(warn("No reference list is uploaded, so players can't be checked automatically.", "/admin/reference", "Upload list"));

    const missing = (s.accounts?.missingBarangayAdmins || 0) + (s.accounts?.missingOrganizers || 0);
    if (missing > 0) {
      items.push(warn(
        `${plural(s.accounts.missingBarangayAdmins, "barangay has", "barangays have")} no admin and ${plural(s.accounts.missingOrganizers, "sport has", "sports have")} no organizer account.`,
        "/admin/accounts", "Provision accounts"
      ));
    } else {
      items.push(ok("Every barangay has an admin account and every sport an organizer."));
    }
    // (No row for sport setup: the Season page shows the Sport setup card right below this in Setup.)
  }

  if (status === "registration_open") {
    const bp = s.barangayProgress;
    if (bp?.notStarted > 0) {
      const names = bp.notStartedNames.slice(0, 4).join(", ");
      items.push(warn(`${bp.notStarted} of ${bp.total} barangays haven't registered a team yet (${names}${bp.notStarted > 4 ? "…" : ""}).`));
    } else if (bp) {
      items.push(ok("Every barangay has registered at least one team."));
    }
    const draft = s.teamsByState?.draft || 0;
    if (draft > 0) items.push(warn(`${plural(draft, "team is", "teams are")} still a draft, not submitted, so it won't be reviewed.`));
    else items.push(ok("Every registered team has been submitted."));
    items.push(info(`${s.teams} teams registered · ${s.teamsByState?.verified || 0} verified so far.`));
  }

  if (status === "verification") {
    const review = s.teamsByState?.review || 0;
    if (review > 0) items.push(warn(`${plural(review, "team is", "teams are")} still waiting for review.`, "/admin/review", "Open Review Queue"));
    else items.push(ok("No teams are waiting for review."));

    if (s.playersToReview > 0) items.push(warn(`${plural(s.playersToReview, "player is", "players are")} flagged or missing a document.`, "/admin/review", "Review players"));
    else items.push(ok("No flagged players."));

    if (!(s.teamsByState?.verified > 0)) {
      items.push(warn("No team is verified yet, so there will be nothing to build brackets from.", "/admin/review", "Open Review Queue"));
    }
    // Generating a tournament is only allowed once the season is Ongoing.
    items.push(info("Tournaments are generated from the verified teams after you start the season."));
  }

  if (status === "ongoing") {
    const undrawn = (s.sportsProgress || []).flatMap((sp) =>
      sp.divisions.filter((d) => d.verifiedTeams > 0 && !d.tournament).map((d) => `${sp.name} ${divisionLabel(d.division)}`.trim()));
    if (undrawn.length) {
      items.push(warn(`${plural(undrawn.length, "division has", "divisions have")} verified teams but no bracket yet (${undrawn.slice(0, 3).join(", ")}${undrawn.length > 3 ? "…" : ""}).`, "/admin/tournaments", "Generate brackets"));
    }
  }

  if (status === "ongoing") {
    const remaining = (s.matches?.total || 0) - (s.matches?.completed || 0);
    if (remaining > 0) items.push(warn(`${plural(remaining, "match hasn't", "matches haven't")} been played yet.`, "/admin/tournaments", "Open Tournaments"));
    else items.push(ok("Every match has been played."));
    if (s.matches?.live > 0) items.push(warn(`${plural(s.matches.live, "match is", "matches are")} live right now.`));
    const open = (s.sportsProgress || []).flatMap((sp) => sp.divisions.filter((d) => d.tournament && d.tournament.stage !== "completed"));
    if (open.length) items.push(warn(`${plural(open.length, "bracket isn't", "brackets aren't")} finished.`, "/admin/tournaments", "Open Tournaments"));
    else items.push(ok("Every bracket has a champion."));
  }

  return items;
}
