// Design 022 slice 4: pre-diff snapshots for effects that need where a card WAS
// (retreat slide, trainer present). apply-view's `onBeforeApply` fills this
// before the DOM diff moves the cards; the effect takes its entry afterwards.
// Design 026: combat snapshots (attacker, defender, damage target) live in a
// second map, rebuilt every batch and only peeked — a KO'd defender is gone
// from the DOM by the time its hit plays, so the hit falls back to these.
// Design 041: an evolution snapshots the card it evolves FROM — by the time the
// scene plays, the evolved card is already drawn on top of the stack.
// Design 042: a discard snapshots each card where it was (hand or board), so it
// can fly from there to the pile; a card with nothing on screen (deck, prizes)
// is remembered as `{ hidden: true }`. A `cardMoved` into the pile counts as
// a discard of its card; a `zoneMoved` into it names no cards, so every card
// then in the source zone is snapshotted and listed as that zone's sweep.
import { topPokemonCard } from '../../../../../shared/engine/rules/evolved-pokemon.mjs';
import { moveIdsForEvent } from './lifecycle-pose.mjs';

const MAX_ENTRIES = 24;
const isId = (v) => v != null && v !== '';
const origins = new Map();
const sweeps = new Map();
const combatOrigins = new Map();

const remember = (instanceId, ghost) => {
  origins.delete(instanceId);
  origins.set(instanceId, ghost);
  while (origins.size > MAX_ENTRIES) origins.delete(origins.keys().next().value);
};

const movesToDiscard = (event) => event?.type === 'cardMoved' && event.to === 'discard' && isId(event.instanceId);
const sweepsToDiscard = (event) => event?.type === 'zoneMoved' && event.to === 'discard' && Boolean(event.from);
const isDiscard = (event) => event?.type === 'cardsDiscarded' || movesToDiscard(event);
// apply-view tags every rendered card with its side ('you'/'them') and zone.
const SIDE_TAG = { self: 'you', opp: 'them' };
const sweepKey = (user, zoneId) => `${user}:${zoneId}`;

/** Ids of the rendered cards in one side's zone (`element.dataset.zone`/`side`). */
export function zoneCardIds(registry, user, zoneId) {
  const side = SIDE_TAG[user];
  if (!side || !registry) return [];
  const ids = [];
  for (const [id, record] of registry) {
    const tags = record?.element?.dataset;
    if (tags?.zone === zoneId && tags.side === side) ids.push(id);
  }
  return ids;
}

/** The instance ids in a `cardsDiscarded`'s `cards`: `{instanceId}` entries or bare ids. */
export function discardedIds(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map((card) => (card && typeof card === 'object' ? card.instanceId : card)).filter(isId);
}

const idsToCapture = (event) => {
  if (event?.type === 'trainerPlayed' && event.instanceId != null) return [event.instanceId];
  if (event?.type === 'cardsDiscarded') return discardedIds(event.cards);
  if (movesToDiscard(event)) return [event.instanceId];
  return moveIdsForEvent(event);
};

/**
 * @param {object[]} events
 * @param {Map<any, {element?: Element}>} registry - getCardRegistry()
 * @param {(user: string, el: Element) => object|null} capture - captureKnockoutGhost
 * @param {(event: object) => 'self'|'opp'} sideOf
 */
const combatIdsFor = (event) => {
  if (event?.type === 'attackExecuted') return [event.attackerId, event.defenderId].filter((id) => id != null);
  if (event?.type === 'damageUpdated' && event.instanceId != null) return [event.instanceId];
  return [];
};

const rootHolding = (registry, record) => {
  for (const candidate of registry.values()) {
    if (candidate.stackAttached?.some((entry) => entry.record === record)) return candidate;
  }
  return null;
};

/**
 * The registry record of the card drawn on top of the stack that holds
 * `instanceId` — the root Basic or any card attached to it — chosen the way
 * apply-view's `layoutCardStack` chooses it. Null when the card is unknown.
 */
export function visibleStackRecord(registry, instanceId) {
  const record = registry?.get(instanceId);
  if (!record) return null;
  const root = record.stackAttached ? record : rootHolding(registry, record) || record;
  if (!root.card) return root;
  const stack = [root.card, ...(root.stackAttached || []).map((entry) => entry.cardData)];
  const top = topPokemonCard(stack, root.card);
  return registry.get(top?.instanceId) || root;
}

/**
 * Design 042: the stack a knocked-out Pokémon goes down with — `shown` is the
 * card drawn on top, `rest` every other card in it (lower Stages, Energy,
 * Tools) in stack order. Empty when the card is unknown.
 */
export function knockoutStack(registry, instanceId) {
  const record = registry?.get(instanceId);
  if (!record) return { shown: null, rest: [] };
  const root = record.stackAttached ? record : rootHolding(registry, record) || record;
  const shown = visibleStackRecord(registry, instanceId) || record;
  const members = [root, ...(root.stackAttached || []).map((entry) => entry.record)];
  return { shown, rest: members.filter((member) => member && member !== shown) };
}

// Keyed by the evolved card's id (`event.instanceId`), which is what the plan names.
const captureEvolution = (event, registry, capture, sideOf) => {
  if (event?.type !== 'pokemonEvolved' || event.instanceId == null) return;
  const record = visibleStackRecord(registry, event.targetInstanceId);
  const ghost = record?.element && capture(sideOf(event), record.element);
  if (ghost) remember(event.instanceId, ghost);
};

const captureSweep = (event, registry, capture, sideOf) => {
  if (!sweepsToDiscard(event)) return;
  const user = sideOf(event);
  const ids = zoneCardIds(registry, user, event.from);
  for (const id of ids) {
    const element = registry.get(id)?.element;
    const ghost = element && capture(user, element);
    remember(id, ghost || { hidden: true });
  }
  sweeps.set(sweepKey(user, event.from), ids);
};

export function captureOrigins(events, registry, capture, sideOf) {
  combatOrigins.clear();
  for (const event of events) {
    captureSweep(event, registry, capture, sideOf);
    for (const id of combatIdsFor(event)) {
      if (combatOrigins.has(id)) continue;
      const element = registry.get(id)?.element;
      const ghost = element && capture(sideOf(event), element);
      if (ghost) combatOrigins.set(id, ghost);
    }
    for (const id of idsToCapture(event)) {
      const element = registry.get(id)?.element;
      const ghost = element && capture(sideOf(event), element);
      if (ghost) remember(id, ghost);
      else if (isDiscard(event)) remember(id, { hidden: true });
    }
    captureEvolution(event, registry, capture, sideOf);
  }
}

/** Removes and returns the captured origin for `instanceId` (or undefined). */
export const takeOrigin = (instanceId) => {
  const ghost = origins.get(instanceId);
  origins.delete(instanceId);
  return ghost;
};

/** Removes and returns the ids snapshotted in `user`'s `zoneId` for a sweep into the pile. */
export const takeZoneSweep = (user, zoneId) => {
  const key = sweepKey(user, zoneId);
  const ids = sweeps.get(key) || [];
  sweeps.delete(key);
  return ids;
};

/** Drops any captured origins tied to `event` (skipped events must not leak). */
export const discardOrigins = (event) => {
  for (const id of idsToCapture(event)) origins.delete(id);
  if (sweepsToDiscard(event)) {
    // Side unknown here; a skipped sweep drops both sides' lists for that zone.
    for (const user of Object.keys(SIDE_TAG)) {
      for (const id of takeZoneSweep(user, event.from)) origins.delete(id);
    }
  }
  if (event?.type === 'pokemonEvolved') origins.delete(event.instanceId);
};

/** Pre-diff snapshot of a combat card from the current batch (not consumed). */
export const peekCombatOrigin = (instanceId) => combatOrigins.get(instanceId);
