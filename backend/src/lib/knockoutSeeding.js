// src/lib/knockoutSeeding.js
// Standard seeding for the knockout after double-elimination groups (Nov 2026: any number of
// groups, 2 / 4 / 8, instead of the fixed 4). Every group sends two teams: its upper-bracket
// winner ("A1", seed 1) and its lower-bracket winner ("A2", seed 2).
//
// Groups are paired in order (A-B, C-D, E-F, G-H). The TOP half of the bracket holds each pair's
// X1 v Y2, the BOTTOM half each pair's Y1 v X2. So:
//   - every first-round game is a group winner against ANOTHER group's runner-up;
//   - a group's two qualifiers are in opposite halves, so they can only meet in the final;
//   - the group winners are spread evenly across both halves.
// 2 groups -> A1-B2, B1-A2                                  (Top 4: semifinals)
// 4 groups -> A1-B2, C1-D2, B1-A2, D1-C2                    (Top 8: exactly the old fixed order)
// 8 groups -> A1-B2, C1-D2, E1-F2, G1-H2, B1-A2, D1-C2, F1-E2, H1-G2   (Top 16)
// Returns the qualifier keys in bracket-slot order: slots 0+1 play each other, 2+3, and so on.

function standardSeedOrder(groups) {
  if (!Array.isArray(groups) || groups.length < 2 || (groups.length & (groups.length - 1)) !== 0) {
    throw new Error('The number of groups must be a power of two (2, 4, 8).');
  }
  const pairs = [];
  for (let i = 0; i < groups.length; i += 2) pairs.push([groups[i], groups[i + 1]]);
  return [
    ...pairs.flatMap(([x, y]) => [`${x}1`, `${y}2`]),
    ...pairs.flatMap(([x, y]) => [`${y}1`, `${x}2`]),
  ];
}

module.exports = { standardSeedOrder };
