// Design 089 § D5: a card that goes into a pile flies there. The view has already taken it off the
// board (a deck and a Lost Zone show no card of theirs), so before the diff its mesh is pinned
// where it stood (lifecycle.js pinTransitOrigins); this effect flies that mesh into the pile and
// lets it go. A card the board drew no mesh for flies as a ghost mesh from where it was last seen;
// one that was never on screen (deck to Lost Zone) only lights the pile. The Prize deal at setup
// is the same flight the other way round: out of the deck, onto each Prize slot.
import { getCardRegistry } from '../apply-view.js';
import { rectForInstance } from '../../image-logic/mat-fx.mjs';
import { hideForFlight, showAfterFlight } from '../../image-logic/draw-flight.js';
import {
  FLIGHT_MS,
  cardShapedRect,
  flightDelays,
  flightPose,
  flightTrail,
  planFlight,
  rectFlightEnds,
} from './card-flight.mjs';
import { meshCanFly, pileOf, playGhostTrack, playMeshTrack, playPileCatch, playTrailTrack } from './card-flight.js';
import { frameTurnOf } from './evolve-scene.js';
import { releaseSlidePin, takeSlidePin } from './slide-pin-store.js';
import { discardedIds, takeOrigin, takeZoneSweep, zoneCardIds } from './origins.mjs';

/** Prize cards leave the deck this far apart, each a little quicker than a discard. */
export const PRIZE_DEAL_STAGGER_MS = 95;
export const PRIZE_DEAL_MS = 460;

let prizeDealEnd = 0;
/** When the last Prize card of the latest deal lands (performance.now clock); the plan's hold ends before it. */
export const prizeDealEndsAt = () => prizeDealEnd;

const PILE_OF = { deck: 'deck', lostZone: 'lostZone' };
const CATCH_CLASS = { deck: 'fx-pile-catch--deck', lostZone: 'fx-pile-catch--lost' };

const seed = () => Math.floor(Math.random() * 1e6);

/**
 * Flies one card to `pile`: its own mesh when the board still draws it (pinned), else a ghost from
 * its pre-diff snapshot. False when it was never on screen.
 */
function flyToPile(instanceId, pile, delay, registry) {
  const origin = takeOrigin(instanceId);
  const flying = meshCanFly(instanceId);
  const rect = cardShapedRect(origin?.rect ?? (flying ? rectForInstance(instanceId, registry) : null));
  if (!rect) {
    releaseSlidePin(instanceId);
    return false;
  }
  const turn = origin?.turn ?? pile.turn;
  const flight = planFlight({ ...rectFlightEnds(rect, pile.rect, { fromTurn: turn, toTurn: pile.turn }), seed: seed() });
  const pose = (u) => flightPose(u, flight);
  const trail = (u) => flightTrail(u, flight);
  if (flying) {
    // The flight starts (and retains the mesh) before the pin lets go of it.
    playMeshTrack({ instanceId, rect, pose, duration: FLIGHT_MS, delay });
    takeSlidePin(instanceId);
    playTrailTrack({ rect, trail, duration: FLIGHT_MS, delay });
    return true;
  }
  if (!origin?.src) return false;
  playGhostTrack({ src: origin.src, rect, pose, trail, duration: FLIGHT_MS, delay });
  return true;
}

/**
 * The cards a transit flies. A plan that names cards flies those; a sweep flies the cards that
 * were in its zone before the view and are not there now (the rest are let go where they are).
 */
function transitIds(plan, registry) {
  if (!plan.sweep) return discardedIds(plan.cards);
  const still = new Set(zoneCardIds(registry, plan.user, plan.sweep));
  const swept = takeZoneSweep(plan.user, plan.sweep);
  for (const id of swept.filter((each) => still.has(each))) {
    takeOrigin(id);
    releaseSlidePin(id);
  }
  return swept.filter((id) => !still.has(id));
}

/** `transit`: cards put into the deck or the Lost Zone fly into it. Holds until most have landed. */
export const transit = (plan) => {
  const zoneId = PILE_OF[plan.to];
  const registry = getCardRegistry();
  const ids = transitIds(plan, registry);
  const pile = zoneId && plan.user ? pileOf(plan.user, zoneId) : null;
  if (!pile) {
    for (const id of ids) {
      takeOrigin(id);
      releaseSlidePin(id);
    }
    return 0;
  }
  const delays = flightDelays(ids.length);
  let flown = 0;
  ids.forEach((id, index) => {
    // Past the cap a card does not fly: it is let go, and the pile's count says it arrived.
    if (index >= delays.length) {
      takeOrigin(id);
      releaseSlidePin(id);
      return;
    }
    if (!flyToPile(id, pile, delays[index], registry)) return;
    playPileCatch(pile.rect, delays[index] + FLIGHT_MS * 0.9, CATCH_CLASS[zoneId]);
    flown += 1;
  });
  if (flown === 0) {
    playPileCatch(pile.rect, 0, CATCH_CLASS[zoneId]);
    return 0;
  }
  return delays[flown - 1] + FLIGHT_MS * 0.7;
};

/**
 * A card that came out of a pile onto the board (a Basic put on the Bench from the deck): it flies
 * from the pile to where it now stands. `card` was hidden when its plan was queued and is shown
 * as it lands. Returns the flight's length in ms, 0 when it could not fly (the card just shows).
 */
export function flyFromPile(card, user, zoneId) {
  const pile = user ? pileOf(user, zoneId) : null;
  const to = rectForInstance(card.instanceId, getCardRegistry());
  if (!pile || !to || !meshCanFly(card.instanceId)) {
    showAfterFlight(card);
    return 0;
  }
  hideForFlight(card);
  const turn = frameTurnOf(card.image) ?? pile.turn;
  const flight = planFlight({ ...rectFlightEnds(pile.rect, to, { fromTurn: pile.turn, toTurn: turn }), seed: seed() });
  playMeshTrack({ instanceId: card.instanceId, rect: pile.rect, pose: (u) => flightPose(u, flight), duration: FLIGHT_MS }).then(() =>
    showAfterFlight(card)
  );
  return FLIGHT_MS;
}

/** `pile-catch`: cards went into a pile from somewhere the board shows no cards; the pile lights. */
export const pileCatch = (plan) => {
  const zoneId = PILE_OF[plan.zoneId];
  const pile = zoneId && plan.user ? pileOf(plan.user, zoneId) : null;
  if (!pile) return 0;
  playPileCatch(pile.rect, 0, CATCH_CLASS[zoneId]);
  return undefined;
};

/**
 * `prizes-set`: the Prize cards are dealt off the deck, one after another, onto their slots.
 * `plan.held` are the Prize cards hidden since the plan was queued (advisory-animations.js).
 * Holds until the last has left the deck.
 */
export const prizesDeal = (plan) => {
  clearTimeout(plan.backstop);
  const held = Array.isArray(plan.held) ? plan.held : [];
  const deck = plan.user ? pileOf(plan.user, 'deck') : null;
  const registry = getCardRegistry();
  let dealt = 0;
  for (const card of held) {
    const to = rectForInstance(card.instanceId, registry);
    if (!deck || !to || !meshCanFly(card.instanceId)) {
      showAfterFlight(card);
      continue;
    }
    hideForFlight(card);
    const turn = frameTurnOf(card.image) ?? deck.turn;
    const flight = planFlight({ ...rectFlightEnds(deck.rect, to, { fromTurn: deck.turn, toTurn: turn }), seed: seed() });
    const delay = dealt * PRIZE_DEAL_STAGGER_MS;
    playMeshTrack({ instanceId: card.instanceId, rect: deck.rect, pose: (u) => flightPose(u, flight), duration: PRIZE_DEAL_MS, delay }).then(() =>
      showAfterFlight(card)
    );
    dealt += 1;
  }
  if (dealt > 0) {
    prizeDealEnd = Math.max(prizeDealEnd, performance.now() + (dealt - 1) * PRIZE_DEAL_STAGGER_MS + PRIZE_DEAL_MS);
  }
  return dealt === 0 ? 0 : (dealt - 1) * PRIZE_DEAL_STAGGER_MS + PRIZE_DEAL_MS * 0.6;
};
