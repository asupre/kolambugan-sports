// The league terms and conditions (Nov 2026, Super Admin request). Shown to EVERY Barangay
// Admin in a pop-up they must answer. Edit the wording HERE; the server only stores the answer
// (backend/src/routes/terms.js). Registration stays closed for a barangay until it accepts
// (backend/src/lib/crossTerms.js).

export const CROSS_TERMS_TITLE = "League terms and conditions";

export const CROSS_TERMS_INTRO =
  "Before you register teams and players for the Inter-Barangay Sports League, please read and accept these terms.";

export const CROSS_TERMS = [
  "Every player must be a resident of the Municipality of Kolambugan. Players from outside the municipality (\"Dayo\") are not allowed.",
  "Our teams field only residents of our own barangay, unless the SK Federation has allowed our barangay to take players from other barangays.",
  "A player may play for only ONE barangay this season. Once they are on a barangay's roster, no other barangay may register them.",
  "All player details (name, birthdate, photo) and every document we upload are true and belong to that player.",
  "Players aged 15 and under need parental consent and supporting documents.",
  "The SK Federation may ask for proof of residency at any time, and may reject a player or a team that does not meet these terms.",
  "Breaking these terms may lead to forfeited games or removal from the league, as decided by the SK Federation.",
];

export const CROSS_TERMS_DECLINE_NOTE =
  "If you decline, registration (teams and players) will be closed for your barangay, and the SK Federation will be notified. Only the SK Federation can ask you again.";

// Page 2: the barangays the SK Federation currently allows to field players from other barangays.
export const CROSS_TERMS_PAGE2_INTRO =
  "These barangays are currently allowed to field players who live in other barangays of Kolambugan, because they are too small to field a full team on their own.";
export const CROSS_TERMS_PAGE2_NOTE =
  "Every other barangay fields only its own residents. The SK Federation may change this list. A player taken by one of these barangays can no longer play for their home barangay this season.";

// The barangay admin answered (the pop-up fires this so open pages can refresh).
export const CROSS_TERMS_EVENT = "cross-terms-answered";
