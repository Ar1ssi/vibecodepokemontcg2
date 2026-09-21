// Design 021 / I71: chat lines for the server's ordinary-play events. Under server authority
// the gated legacy bodies no longer announce anything (the server's view is the only thing that
// renders the action), so without this map the multiplayer battle log is silent for everything
// but the four attack events `attack-announcements.mjs` covers. Both players read the same server
// event, so each client phrases the line from its own absolute `selfPlayerId` — one source, no
// double-announcing (design 013's precedent).
//
// Pure: no DOM, no imports beyond the attack plan. `server-battle-log.js` is the thin caller that
// resolves card names and appends.

import { attackAnnouncementLines } from './attack-announcements.mjs';

const ATTACK_EVENT_TYPES = new Set([
  'attackCoinFlipped',
  'attackDamageScaled',
  'benchDamaged',
  'attackBenchFizzled',
]);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A card name from the caller's registry lookup, or null when unavailable. */
const nameOf = (instanceId, resolveName) => {
  if (instanceId == null || typeof resolveName !== 'function') return null;
  return resolveName(instanceId) || null;
};

/**
 * Chat lines for one advisory server event, from this client's point of view.
 *
 * @param {object} event One server event (`type` plus its payload)
 * @param {string|null} selfPlayerId This client's absolute player id
 * @param {(instanceId: number) => string|null} [resolveName] Card-name lookup (registry)
 * @returns {string[]} Lines to append, in order; empty for events with nothing to say
 */
export function serverBattleLogLines(event, selfPlayerId, resolveName) {
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
    return [];
  }
  if (ATTACK_EVENT_TYPES.has(event.type)) {
    return attackAnnouncementLines(event, selfPlayerId, resolveName);
  }
  // An actor is mandatory: a line that cannot name whose move it was is worse than no line,
  // and a spectator has no side to phrase from. `turnStarted` names its actor `player`.
  const actorId = event.playerId != null ? event.playerId : event.player;
  if (actorId == null || selfPlayerId == null) return [];

  const mine = actorId === selfPlayerId;
  const you = mine ? 'You' : 'Your opponent';
  const your = mine ? 'Your' : "Your opponent's";
  const their = mine ? 'your' : 'their';

  switch (event.type) {
    case 'turnStarted':
      return [
        `Turn ${Number.isFinite(event.number) ? event.number : '?'} — ${
          mine ? 'your' : "your opponent's"
        } turn.`,
      ];

    case 'trainerPlayed': {
      const name =
        event.name || nameOf(event.instanceId, resolveName) || 'a Trainer';
      return [`${you} played ${name}${event.stadium ? ' (Stadium)' : ''}.`];
    }

    case 'abilityUsed': {
      const name = event.name || nameOf(event.instanceId, resolveName);
      return [`✦ ${you} used ${name || 'a Pokémon'}'s ability.`];
    }

    case 'pokemonEvolved': {
      const name = nameOf(event.instanceId, resolveName) || 'A Pokémon';
      const onto = nameOf(event.targetInstanceId, resolveName);
      return [`✨ ${name} evolved onto ${onto || 'a Pokémon'}.`];
    }

    case 'pokemonDevolved': {
      const top = nameOf(event.instanceId, resolveName) || 'an Evolution';
      const base = nameOf(event.targetInstanceId, resolveName) || 'A Pokémon';
      return [`⬇ ${base} devolved — ${top} returned.`];
    }

    case 'cardAttached': {
      const name = nameOf(event.instanceId, resolveName) || 'a card';
      const onto = nameOf(event.targetInstanceId, resolveName);
      return [`⚡ ${you} attached ${name}${onto ? ` to ${onto}` : ''}.`];
    }

    case 'cardRetreated': {
      const active = nameOf(event.activeId, resolveName) || 'The Active Pokémon';
      const promoted =
        nameOf(event.promotedId, resolveName) || 'a Benched Pokémon';
      return [`🔄 ${active} retreated — ${promoted} promoted to the Active Spot.`];
    }

    case 'cardSwitched': {
      const active = nameOf(event.activeId, resolveName) || 'The Active Pokémon';
      const bench = nameOf(event.benchId, resolveName) || 'a Benched Pokémon';
      return [`🔄 ${active} switched with ${bench}.`];
    }

    case 'pokemonKnockedOut': {
      const name = nameOf(event.instanceId, resolveName) || 'Pokémon';
      return [`💀 ${your} ${name} was Knocked Out.`];
    }

    case 'pokemonPromoted': {
      const name = nameOf(event.instanceId, resolveName) || 'A Pokémon';
      return [`⬆️ ${name} was promoted to the Active Spot.`];
    }

    case 'prizeTaken':
    case 'prizesTaken': {
      const count = Number.isFinite(event.count) ? event.count : 1;
      if (count <= 0) return [];
      return [`🏆 ${you} took ${plural(count, 'prize card')}.`];
    }

    case 'cardsDrawn': {
      const count = Number.isFinite(event.count)
        ? event.count
        : Array.isArray(event.cards)
          ? event.cards.length
          : null;
      if (count == null || count <= 0) return [];
      return [`${you} drew ${plural(count, 'card')}.`];
    }

    case 'cardsDiscarded': {
      const cards = Array.isArray(event.cards) ? event.cards : [];
      const names = cards.map((c) => c?.name).filter(Boolean);
      if (names.length === 1) return [`${you} discarded ${names[0]}.`];
      const count = cards.length || (Number.isFinite(event.count) ? event.count : 0);
      if (count <= 0) return [];
      return [`${you} discarded ${plural(count, 'card')}.`];
    }

    case 'zoneShuffled':
    case 'deckShuffled': {
      const zone =
        event.zoneId && event.zoneId !== 'deck' ? event.zoneId : 'deck';
      return [`🔀 ${you} shuffled ${their} ${zone}.`];
    }

    case 'cardsLookedAt': {
      if (!Number.isFinite(event.count)) return [`👀 ${you} looked at cards.`];
      return [`👀 ${you} looked at ${plural(event.count, 'card')}.`];
    }

    case 'cardsRevealed': {
      const cards = Array.isArray(event.cards) ? event.cards : [];
      const names = cards.map((c) => c?.name).filter(Boolean);
      if (names.length === 0) return [];
      return [`👀 ${you} revealed ${names.join(', ')}.`];
    }

    case 'statusApplied': {
      const name = nameOf(event.instanceId, resolveName) || 'A Pokémon';
      const condition =
        typeof event.condition === 'string' ? event.condition : null;
      return [
        condition
          ? `☠️ ${name} is now ${condition}.`
          : `☠️ ${name} is affected by a Special Condition.`,
      ];
    }

    case 'statusCleared': {
      const name = nameOf(event.instanceId, resolveName) || 'A Pokémon';
      const condition =
        typeof event.condition === 'string' ? event.condition : null;
      return [
        condition
          ? `☠️ ${name} recovered from ${condition}.`
          : `☠️ ${name} recovered from its Special Conditions.`,
      ];
    }

    case 'coinFlipped': {
      if (Number.isFinite(event.heads)) {
        return [`🪙 ${you} flipped ${plural(event.heads, 'head')}.`];
      }
      if (event.face == null) return [];
      return [`🪙 ${you} flipped ${event.face === 'heads' ? 'Heads' : 'Tails'}.`];
    }

    case 'gxAttackUsed':
      return [`💥 ${you} used the GX attack ${event.attackName || 'an attack'}.`];

    case 'vstarUsed':
      return [`💥 ${you} used a VSTAR Power.`];

    default:
      return [];
  }
}
