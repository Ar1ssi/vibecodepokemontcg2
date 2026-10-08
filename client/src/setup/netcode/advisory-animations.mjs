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
//
// Every coin the engine flips plays the full-screen coin ceremony. The engine
// reports flips in several event shapes; each becomes one `coin-flip` plan whose
// `faces` lists every flip in order (coin-pose.mjs `coinFlipFaces`).
//
// Design 059: cards a player reveals from their deck into their hand play the
// Trainer reveal (deck → reveal spot → hand) as one `reveal` plan per player and
// batch; `deckRevealRuns` groups them before the batch is handled.
import { coinFlipFaces, MAX_CEREMONY_FLIPS } from './mat-fx/coin-pose.mjs';

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
  // Design 064: sound-only effects (no visual): they exist so the dispatcher sounds them.
  // `deckShuffled` reaches here only when no deal animates it (a search effect's shuffle).
  deckShuffled: 'search-shuffle',
  prizesSet: 'prizes-set',
  retreatBlocked: 'retreat-blocked',
  playLockApplied: 'play-lock',
  deferredKnockOut: 'deferred-ko',
  // Crowd cheers for the once-per-game GX attack and VSTAR Power (no visual, no synth voice).
  gxAttackUsed: 'gx-used',
  vstarUsed: 'vstar-used',
  // Coin events (COIN_EVENTS below) plan the `coin-flip` ceremony with their faces.
};

// Effects with no visual: the registry and hold table have no entry for them, only a sound.
export const SOUND_ONLY_FX = new Set([
  'search-shuffle',
  'prizes-set',
  'retreat-blocked',
  'play-lock',
  'deferred-ko',
  'attack-marker',
  'gx-used',
  'vstar-used',
]);

const COIN_EVENTS = new Set([
  'coinFlipped',
  'attackCoinFlipped',
  'attackMarkerCoinFlipped',
  'attackFlipGateCoinFlipped',
]);

// An attack fans into a banner (+ target ring) and then the lunge itself.
const MULTI_FX = { attackExecuted: ['attack-banner', 'attack'] };

// The turn passing and the game ending wait for every scene already on screen
// (fx-queue.mjs `awaitScenes`): an attack's move must finish before the next turn.
const AFTER_SCENES = new Set(['turnStarted', 'gameEnded']);

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
  if (AFTER_SCENES.has(type)) return { ...base, effect, awaitScenes: true };
  return { ...base, effect };
};

// The engine's own "entered play" rule (reduce.mjs `enteredPlayTurn`): from a
// hand, deck or discard onto the Active Spot or Bench. Board-to-board moves
// (retreat, switch, promote) are not an entry.
const ENTRY_SOURCES = new Set(['hand', 'deck', 'discard']);
const ENTRY_TARGETS = new Set(['active', 'bench']);

// Design 064: the opening placement is sounded differently from a mid-game entry.
const withSetup = (plan, setup) => (setup ? { ...plan, setup: true } : plan);

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

// `run` is this event's faces from coinFlipRuns: the whole run for its first
// flip, [] for a flip already folded into an earlier event's ceremony.
const coinPlan = (event, selfPlayerId, run) => {
  const faces = Array.isArray(run) ? run : coinFlipFaces(event);
  if (faces.length === 0) return null;
  // A marker event's own `kind` must not replace the plan kind. `blocking`: the
  // ceremony covers the board, so its hold survives the FX queue's flood budget.
  return { ...fxPlan(event, selfPlayerId, 'coin-flip'), kind: 'fx', blocking: true, faces };
};

/**
 * @param {object} event
 * @param {string|null} selfPlayerId
 * @param {string[]} [coinRun] this event's entry from coinFlipRuns, if any
 * @param {{ dealShuffle?: boolean, revealRun?: object[]|null, setup?: boolean, effectKo?: Set<number> }} [options]
 *   `dealShuffle`: this `deckShuffled` is in dealShuffles, so it animates (other deck shuffles
 *   only sound). `revealRun`: this event's entry from deckRevealRuns, if any. `setup`: the batch
 *   arrived while the opening placement was unfinished (tags `enter` plans). `effectKo`: the batch's
 *   effectKnockoutIds (tags those `knockout` plans)
 */
export function advisoryAnimationPlan(
  event,
  selfPlayerId,
  coinRun,
  { dealShuffle = false, revealRun = null, setup = false, effectKo = null } = {}
) {
  if (!event || typeof event !== 'object') return null;
  if (dealShuffle && event.type === 'deckShuffled' && event.playerId != null && selfPlayerId != null) {
    return { kind: 'shuffle', user: event.playerId === selfPlayerId ? 'self' : 'opp', zoneId: 'deck' };
  }
  // Explicit, never via fxPlan: its `...fields` spread would replace the plan `kind` with the marker's.
  if (event.type === 'attackMarkerAdded') {
    return {
      kind: 'fx',
      effect: 'attack-marker',
      user: sideOf(event.playerId, selfPlayerId),
      instanceId: event.instanceId,
      markerKind: event.kind,
    };
  }
  // `vstarUsed` carries its own `kind: 'vstar'`, which the spread would turn into the plan kind.
  if (event.type === 'vstarUsed') return { ...fxPlan(event, selfPlayerId), kind: 'fx' };
  if (COIN_EVENTS.has(event.type)) return coinPlan(event, selfPlayerId, coinRun);
  if (PRIZE_TAKES.has(event.type)) return prizePlans(event, selfPlayerId);
  if (Object.hasOwn(EVENT_FX, event.type)) return fxPlan(event, selfPlayerId);
  if (event.type === 'cardMoved') {
    if (event.to === 'discard' && event.instanceId != null) {
      return { ...fxPlan(event, selfPlayerId, 'discard'), cards: [event.instanceId] };
    }
    return entersPlay(event) ? withSetup(fxPlan(event, selfPlayerId, 'enter'), setup) : null;
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
      return {
        kind: 'knockout',
        user,
        instanceId: event.instanceId,
        ruleBoxes: Array.isArray(event.ruleBoxes) ? event.ruleBoxes.length : 0,
        ...(effectKo?.has(event.instanceId) ? { effectKo: true } : {}),
      };

    // Design 059: the group's first reveal plays every card the player revealed
    // from the deck into the hand in this batch; the others plan nothing.
    case 'cardsRevealed':
      if (!Array.isArray(revealRun) || revealRun.length === 0) return null;
      return { kind: 'reveal', user, cards: revealRun };

    default:
      return null;
  }
}

// A reveal both seats see: not a look only its player had (`peek`), not one shown
// to a single player (`revealedTo`), not a hand shown where it lies (`hand`).
const isPublicReveal = (event) =>
  event?.type === 'cardsRevealed' &&
  event.playerId != null &&
  !event.peek &&
  event.revealedTo == null &&
  !event.hand;

const movedDeckToHand = (event) =>
  event?.type === 'cardMoved' &&
  event.from === 'deck' &&
  event.to === 'hand' &&
  event.instanceId != null &&
  event.playerId != null;

/**
 * Design 059: the cards each player revealed from their deck into their hand in
 * one batch. A card counts when the batch both moves it deck → hand
 * (`cardMoved`) and names it in a public `cardsRevealed` by the same player —
 * the engine names a hand pick only when its text reveals it. The player's first
 * such event maps to the whole group (event order, no duplicates); the player's
 * later reveal events map to [], so one scene plays per player and batch.
 *
 * @param {object[]} events
 * @returns {Map<object, {instanceId: number, name?: string, src?: string}[]>}
 */
export function deckRevealRuns(events) {
  const runs = new Map();
  if (!Array.isArray(events)) return runs;
  const drawnFromDeck = new Map();
  for (const event of events) {
    if (!movedDeckToHand(event)) continue;
    if (!drawnFromDeck.has(event.playerId)) drawnFromDeck.set(event.playerId, new Set());
    drawnFromDeck.get(event.playerId).add(event.instanceId);
  }
  const leaders = new Map();
  for (const event of events) {
    if (!isPublicReveal(event)) continue;
    const fromDeck = drawnFromDeck.get(event.playerId);
    const cards = fromDeck ? drawnCards(event.cards).filter((card) => fromDeck.has(card.instanceId)) : [];
    if (cards.length === 0) continue;
    const leader = leaders.get(event.playerId);
    if (!leader) {
      leaders.set(event.playerId, event);
      runs.set(event, dedupeById(cards));
      continue;
    }
    runs.set(leader, dedupeById([...runs.get(leader), ...cards]));
    runs.set(event, []);
  }
  return runs;
}

const dedupeById = (cards) => {
  const seen = new Set();
  return cards.filter((card) => {
    if (seen.has(card.instanceId)) return false;
    seen.add(card.instanceId);
    return true;
  });
};

/**
 * Design 064: Pokémon knocked out by an effect rather than damage. A knockout counts when the
 * batch has no earlier `damageUpdated` for it and no `deferredKnockOut` (a marker resolving).
 *
 * @param {object[]} events
 * @returns {Set<number>} instanceIds
 */
export function effectKnockoutIds(events) {
  const ids = new Set();
  if (!Array.isArray(events)) return ids;
  const damaged = new Set();
  const deferred = new Set(events.filter((event) => event?.type === 'deferredKnockOut').map((event) => event.instanceId));
  for (const event of events) {
    if (event?.type === 'damageUpdated') damaged.add(event.instanceId);
    else if (event?.type === 'pokemonKnockedOut' && !damaged.has(event.instanceId) && !deferred.has(event.instanceId)) {
      ids.add(event.instanceId);
    }
  }
  return ids;
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

/**
 * The deck shuffles that precede a deal: a player's `deckShuffled` whose next
 * event for that player is their opening hand or mulligan redeal. Under server
 * authority these are the opening's only shuffle, so they animate (queued behind
 * the coin ceremony with the deal); a search effect's shuffle does not.
 *
 * @param {object[]} events
 * @returns {Set<object>} the `deckShuffled` events to animate
 */
export function dealShuffles(events) {
  const shuffles = new Set();
  if (!Array.isArray(events)) return shuffles;
  const pending = new Map();
  for (const event of events) {
    if (event?.playerId == null) continue;
    const shuffle = pending.get(event.playerId);
    pending.delete(event.playerId);
    if (event.type === 'deckShuffled') pending.set(event.playerId, event);
    else if (shuffle && DEAL_EVENTS.has(event.type)) shuffles.add(shuffle);
  }
  return shuffles;
}

const singleFlipFace = (event) => {
  if (event?.type !== 'coinFlipped' || event.heads !== undefined) return null;
  const faces = coinFlipFaces(event);
  return faces.length === 1 ? faces[0] : null;
};

/**
 * Back-to-back single flips by one player for one source ("Flip 3 coins" emits
 * three `coinFlipped`) play as ONE ceremony, one toss after another: the first
 * event maps to every face in the run, the others to [] so they plan nothing.
 *
 * @param {object[]} events
 * @returns {Map<object, string[]>}
 */
export function coinFlipRuns(events) {
  const runs = new Map();
  if (!Array.isArray(events)) return runs;
  let leader = null;
  for (const event of events) {
    const face = singleFlipFace(event);
    if (face == null) {
      leader = null;
      continue;
    }
    const faces = leader && runs.get(leader);
    const joins =
      faces &&
      leader.playerId === event.playerId &&
      leader.source === event.source &&
      faces.length < MAX_CEREMONY_FLIPS;
    if (joins) {
      faces.push(face);
      runs.set(event, []);
      continue;
    }
    leader = event;
    runs.set(event, [face]);
  }
  return runs;
}
