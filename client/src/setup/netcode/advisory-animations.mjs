// Design 009 slice 5/6: pure plan from a server advisory event to a
// shuffle/draw/knockout animation intent. DOM-free so it can be unit-tested
// without a browser; the paired advisory-animations.js does the actual
// playShuffleFlight/playDrawToHand/playKnockoutGhost calls. The knockout ghost
// itself is captured earlier, by `onBeforeApply` (before the DOM diff removes
// the card) — this plan only carries the instanceId needed to find it.
//
// Design 022: event types in EVENT_FX become `{ kind: 'fx', effect, user, ...payload }`
// and are dispatched to the mat-fx registry. Several of those events (e.g.
// damageUpdated) carry no playerId, so `user` is null there and the effect
// finds its side from the card element instead.
//
// Design 027: a `cardMoved` that puts a Pokémon into play becomes the `enter`
// effect, which decides from the card itself whether a Mega/Tera entry plays.
export const EVENT_FX = {
  damageUpdated: 'damage',
  attackExecuted: 'attack',
  statusApplied: 'status',
  pokemonEvolved: 'evolve',
  cardAttached: 'attach',
  abilityUsed: 'ability-banner',
  cardRetreated: 'retreat',
  pokemonSwapped: 'retreat',
  trainerPlayed: 'trainer-play',
  stadiumEffectUsed: 'stadium-play',
  turnStarted: 'turn-banner',
  gameEnded: 'game-over',
};

const sideOf = (playerId, selfPlayerId) =>
  playerId == null || selfPlayerId == null ? null : playerId === selfPlayerId ? 'self' : 'opp';

// `user` is the acting side. turnStarted names it `player`; gameEnded names the
// `winner` (so 'self' = you won, 'opp' = you lost, null = draw/no winner).
const fxPlan = (event, selfPlayerId, effect = EVENT_FX[event.type]) => {
  const { type, playerId, ...fields } = event;
  const actor = type === 'gameEnded' ? event.winner : (playerId ?? event.player);
  return { kind: 'fx', effect, user: sideOf(actor, selfPlayerId), ...fields };
};

// The engine's own "entered play" rule (reduce.mjs `enteredPlayTurn`): from a
// hand, deck or discard onto the Active Spot or Bench. Board-to-board moves
// (retreat, switch, promote) are not an entry.
const ENTRY_SOURCES = new Set(['hand', 'deck', 'discard']);
const ENTRY_TARGETS = new Set(['active', 'bench']);

const entersPlay = (event) =>
  event.instanceId != null && ENTRY_SOURCES.has(event.from) && ENTRY_TARGETS.has(event.to);

export function advisoryAnimationPlan(event, selfPlayerId) {
  if (!event || typeof event !== 'object') return null;
  if (Object.hasOwn(EVENT_FX, event.type)) return fxPlan(event, selfPlayerId);
  if (event.type === 'cardMoved') return entersPlay(event) ? fxPlan(event, selfPlayerId, 'enter') : null;
  if (event.playerId == null || selfPlayerId == null) return null;
  const user = event.playerId === selfPlayerId ? 'self' : 'opp';

  switch (event.type) {
    case 'zoneShuffled':
      if (!event.zoneId) return null;
      return { kind: 'shuffle', user, zoneId: event.zoneId };

    // event.zoneId is the SOURCE zone (hand, discard, board); the shuffle
    // itself happens in the deck, so that is where it animates.
    case 'zoneShuffledIntoDeck':
      return { kind: 'shuffle', user, zoneId: 'deck' };

    case 'cardsDrawn': {
      if (!Array.isArray(event.cards) || event.cards.length === 0) return null;
      const cards = event.cards.filter((c) => c?.instanceId != null);
      if (cards.length === 0) return null;
      return { kind: 'draw', user, cards, count: cards.length };
    }

    case 'pokemonKnockedOut':
      if (event.instanceId == null) return null;
      return { kind: 'knockout', user, instanceId: event.instanceId };

    default:
      return null;
  }
}
