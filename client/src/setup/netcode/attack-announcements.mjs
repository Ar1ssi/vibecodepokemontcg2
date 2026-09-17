// Design 013: chat lines for the server's attack events. Under server authority the whole
// legacy attack body (which used to announce the damage math) is gated off, so without these
// lines a scaled 200-damage attack, a coin flip the server just rolled, or a hit on a benched
// Pokémon all reach the player as an unexplained number on the board.
//
// Pure: no DOM, no imports. `attack-announcements.js` is the thin caller that appends.

/** The Pokémon name a bench event refers to, or null when the caller cannot resolve it. */
const nameOf = (event, resolveName) =>
  (typeof resolveName === 'function' ? resolveName(event.instanceId) : null) || null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Chat lines for one advisory event, from this client's point of view.
 *
 * @param {object} event One server event (`type` plus its payload)
 * @param {string|null} selfPlayerId This client's absolute player id
 * @param {(instanceId: number) => string|null} [resolveName] Card name lookup for bench events
 * @returns {string[]} Lines to append, in order; empty for events with nothing to say
 */
export function attackAnnouncementLines(event, selfPlayerId, resolveName) {
  if (!event || typeof event !== 'object' || event.playerId == null || selfPlayerId == null) {
    return [];
  }
  const mine = event.playerId === selfPlayerId;
  const attackName = event.attackName || 'That attack';

  switch (event.type) {
    case 'attackCoinFlipped': {
      const flips = Array.isArray(event.flips) ? event.flips : [];
      if (flips.length === 0) return [];
      if (flips.length === 1) {
        return [`🪙 ${attackName}: ${flips[0] === 'heads' ? 'Heads' : 'Tails'}!`];
      }
      const heads = event.headsCount ?? flips.filter((f) => f === 'heads').length;
      return [
        `🪙 ${attackName}: flipped ${plural(flips.length, 'coin')} — ${plural(heads, 'head')}.`,
      ];
    }

    case 'attackDamageScaled': {
      const notes = Array.isArray(event.notes) ? event.notes : [];
      const lines = [];
      if (event.total !== event.base) {
        lines.push(`✨ ${attackName}: ${event.base} → ${event.total} damage.`);
      }
      for (const note of notes) {
        // An unresolved note means the server could not count something the card asks for;
        // saying so is the honest version of silently using the printed number.
        lines.push(
          /resolve the printed|pending/.test(note)
            ? `❔ ${attackName}: ${note}`
            : `✨ ${note}`
        );
      }
      return lines;
    }

    case 'benchDamaged': {
      // event.playerId is the OWNER of the damaged Pokémon, not the attacker.
      const target = nameOf(event, resolveName);
      const where = mine ? 'your benched' : "the opponent's benched";
      const lines = [`💥 ${event.dealt} damage to ${where} ${target || 'Pokémon'}.`];
      if (event.auto) {
        lines.push(
          `🎯 ${attackName} hit the first benched Pokémon — move the damage with the card tools if it belongs elsewhere.`
        );
      }
      return lines;
    }

    case 'attackBenchFizzled':
      return [`💤 ${attackName}'s bench damage fizzles — no benched Pokémon to hit.`];

    default:
      return [];
  }
}
