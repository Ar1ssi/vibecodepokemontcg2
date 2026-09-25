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
// Design 024: an event may now produce SEVERAL plans, returned as an array and
// queued in order (fx-queue.mjs). `attackExecuted` is the reason: an attack
// must read as its name, then its impact — one event, two beats.
//
// Design 042: every way into the discard pile plays `discard`. A `cardMoved`
// into it (retreat Energy, a replaced Stadium, …) names its card; a
// `zoneMoved` into it (played Trainers swept off the board, discard-hand)
// names only a count, so its plan carries `sweep` — the source zone whose
// pre-diff cards the effect flies (origins.mjs `takeZoneSweep`).
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
  // Design 024 slice 4: events the engine already emitted with no effect.
  prizesTaken: 'prize-claim',
  prizeTaken: 'prize-claim',
  pokemonPromoted: 'promote',
  pokemonDevolved: 'devolve',
  statusCleared: 'status-clear',
  cardsDiscarded: 'discard',
  coinFlipped: 'coin-flip',
};

// An attack fans into a banner (+ target ring) and then the lunge itself.
const MULTI_FX = { attackExecuted: ['attack-banner', 'attack'] };

const sideOf = (playerId, selfPlayerId) =>
  playerId == null || selfPlayerId == null ? null : playerId === selfPlayerId ? 'self' : 'opp';

// `user` is the acting side. turnStarted names it `player`; gameEnded names the
// `winner` (so 'self' = you won, 'opp' = you lost, null = draw/no winner).
const fxPlan = (event, selfPlayerId, effect = EVENT_FX[event.type]) => {
  const { type, playerId, ...fields } = event;
  const actor = type === 'gameEnded' ? event.winner : (playerId ?? event.player);
  const base = { kind: 'fx', user: sideOf(actor, selfPlayerId), ...fields };
  const effects = MULTI_FX[type];
  if (effects) return effects.map((effect) => ({ ...base, effect }));
  return { ...base, effect };
};

// The engine's own "entered play" rule (reduce.mjs `enteredPlayTurn`): from a
// hand, deck or discard onto the Active Spot or Bench. Board-to-board moves
// (retreat, switch, promote) are not an entry.
const ENTRY_SOURCES = new Set(['hand', 'deck', 'discard']);
const ENTRY_TARGETS = new Set(['active', 'bench']);

// Draw events carry `[{instanceId}]`; a few engine sites emit bare ids.
export const drawnCards = (cards) => {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((card) => (card != null && typeof card === 'object' ? card : { instanceId: card }))
    .filter((card) => card.instanceId != null);
};

const entersPlay = (event) =>
  event.instanceId != null && ENTRY_SOURCES.has(event.from) && ENTRY_TARGETS.has(event.to);

// Design 045: taken prizes naming their cards also fly into the hand, after the
// claim burst on the prize zone.
const PRIZE_TAKES = new Set(['prizesTaken', 'prizeTaken']);

const prizePlans = (event, selfPlayerId) => {
  const burst = fxPlan(event, selfPlayerId);
  const cards = drawnCards(event.cards);
  if (cards.length === 0 || burst.user == null) return burst;
  return [burst, { kind: 'draw', user: burst.user, cards, count: cards.length, source: 'prizes' }];
};

export function advisoryAnimationPlan(event, selfPlayerId) {
  if (!event || typeof event !== 'object') return null;
  if (PRIZE_TAKES.has(event.type)) return prizePlans(event, selfPlayerId);
  if (Object.hasOwn(EVENT_FX, event.type)) return fxPlan(event, selfPlayerId);
  if (event.type === 'cardMoved') {
    if (event.to === 'discard' && event.instanceId != null) {
      return { ...fxPlan(event, selfPlayerId, 'discard'), cards: [event.instanceId] };
    }
    return entersPlay(event) ? fxPlan(event, selfPlayerId, 'enter') : null;
  }
  if (event.type === 'zoneMoved') {
    return event.to === 'discard' && event.from ? { ...fxPlan(event, selfPlayerId, 'discard'), sweep: event.from } : null;
  }
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

    // Design 044: the opening hand, a mulligan redeal and a bonus draw fly in
    // like any other draw.
    case 'cardsDrawn':
    case 'openingHandDealt':
    case 'mulliganTaken':
    case 'bonusDrawAwarded': {
      const cards = drawnCards(event.cards);
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

const DEAL_EVENTS = new Set(['openingHandDealt', 'mulliganTaken']);

/**
 * Deals a later mulligan replaced (design 044): only each player's last deal in
 * a batch is animated, so a card kept through a redeal does not fly in twice.
 *
 * @param {object[]} events
 * @returns {Set<object>} the superseded deal events
 */
export function supersededDeals(events) {
  const superseded = new Set();
  if (!Array.isArray(events)) return superseded;
  const lastDeal = new Map();
  for (const event of events) {
    if (!DEAL_EVENTS.has(event?.type)) continue;
    const previous = lastDeal.get(event.playerId);
    if (previous) superseded.add(previous);
    lastDeal.set(event.playerId, event);
  }
  return superseded;
}
