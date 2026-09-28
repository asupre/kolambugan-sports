// A human round label for every match — "Round 1", "Winners Round 2", "Semifinals",
// "Final" — so the public pages / barangay / organizer lists can say where a game sits.
// Needs the WHOLE tournament's matches (not one match on its own): a knockout round is
// named by how many games are in it, and a double-elim group's losers bracket doesn't
// necessarily start at round 1.
//
// Returns Map(matchId string -> label). Mirrors the admin bracket's own naming
// (Tournaments.jsx koLabel / roundLabel), so the two never disagree.

const isThird = (m) => (m.bracket || '').includes('third');

function roundLabels(matches) {
  const key = (...parts) => parts.map((p) => String(p ?? '')).join('|');

  // Knockout: games per round, per tournament (third place excluded — it shares the
  // final's round number and would turn "Final" into "Semifinals").
  const koCount = new Map();
  // Double-elim group: the distinct rounds of each (tournament, group, bracket), in order.
  const deRounds = new Map();
  for (const m of matches) {
    if (m.isTiebreaker) continue;
    if (!m.group) {
      if (!isThird(m)) koCount.set(key(m.tournament, m.round), (koCount.get(key(m.tournament, m.round)) || 0) + 1);
    } else if (m.bracket === 'winners' || m.bracket === 'losers') {
      const k = key(m.tournament, m.group, m.bracket);
      if (!deRounds.has(k)) deRounds.set(k, new Set());
      deRounds.get(k).add(m.round || 0);
    }
  }
  const deIndex = new Map();
  for (const [k, set] of deRounds) {
    [...set].sort((a, b) => a - b).forEach((r, i) => deIndex.set(key(k, r), i + 1));
  }

  const labels = new Map();
  for (const m of matches) {
    let label = '';
    if (m.isTiebreaker) {
      label = m.round >= 101 ? 'Playoff decider' : 'Playoff';
    } else if (m.group) {
      if (m.bracket === 'winners' || m.bracket === 'losers') {
        const n = deIndex.get(key(key(m.tournament, m.group, m.bracket), m.round || 0));
        label = `${m.bracket === 'winners' ? 'Winners' : 'Losers'} Round ${n || m.round}`;
      } else if (m.round) {
        label = `Round ${m.round}`;
      }
    } else if (isThird(m)) {
      label = '3rd place';
    } else {
      const n = koCount.get(key(m.tournament, m.round)) || 0;
      label = n === 1 ? 'Final' : n === 2 ? 'Semifinals' : n === 4 ? 'Quarterfinals' : n ? `Round of ${n * 2}` : '';
    }
    labels.set(String(m._id), label);
  }
  return labels;
}

module.exports = { roundLabels };
