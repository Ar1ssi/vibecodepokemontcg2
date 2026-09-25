// Design 022 slice 4: pre-diff snapshots for effects that need where a card WAS
// (retreat slide, trainer present). apply-view's `onBeforeApply` fills this
// before the DOM diff moves the cards; the effect takes its entry afterwards.
// Design 026: combat snapshots (attacker, defender, damage target) live in a
// second map, rebuilt every batch and only peeked — a KO'd defender is gone
// from the DOM by the time its hit plays, so the hit falls back to these.
// Design 041: an evolution snapshots the card it evolves FROM — by the time the
// scene plays, the evolved card is already drawn on top of the stack.
import { topPokemonCard } from '../../../../../shared/engine/rules/evolved-pokemon.mjs';
import { moveIdsForEvent } from './lifecycle-pose.mjs';

const MAX_ENTRIES = 24;
const origins = new Map();
const combatOrigins = new Map();

const remember = (instanceId, ghost) => {
  origins.delete(instanceId);
  origins.set(instanceId, ghost);
  while (origins.size > MAX_ENTRIES) origins.delete(origins.keys().next().value);
};

const idsToCapture = (event) => {
  if (event?.type === 'trainerPlayed' && event.instanceId != null) return [event.instanceId];
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

// Keyed by the evolved card's id (`event.instanceId`), which is what the plan names.
const captureEvolution = (event, registry, capture, sideOf) => {
  if (event?.type !== 'pokemonEvolved' || event.instanceId == null) return;
  const record = visibleStackRecord(registry, event.targetInstanceId);
  const ghost = record?.element && capture(sideOf(event), record.element);
  if (ghost) remember(event.instanceId, ghost);
};

export function captureOrigins(events, registry, capture, sideOf) {
  combatOrigins.clear();
  for (const event of events) {
    for (const id of combatIdsFor(event)) {
      if (combatOrigins.has(id)) continue;
      const element = registry.get(id)?.element;
      const ghost = element && capture(sideOf(event), element);
      if (ghost) combatOrigins.set(id, ghost);
    }
    for (const id of idsToCapture(event)) {
      const element = registry.get(id)?.element;
      if (!element) continue;
      const ghost = capture(sideOf(event), element);
      if (ghost) remember(id, ghost);
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

/** Drops any captured origins tied to `event` (skipped events must not leak). */
export const discardOrigins = (event) => {
  for (const id of idsToCapture(event)) origins.delete(id);
  if (event?.type === 'pokemonEvolved') origins.delete(event.instanceId);
};

/** Pre-diff snapshot of a combat card from the current batch (not consumed). */
export const peekCombatOrigin = (instanceId) => combatOrigins.get(instanceId);
