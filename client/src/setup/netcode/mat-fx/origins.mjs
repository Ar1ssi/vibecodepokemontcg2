// Design 022 slice 4: pre-diff snapshots for effects that need where a card WAS
// (retreat slide, trainer present). apply-view's `onBeforeApply` fills this
// before the DOM diff moves the cards; the effect takes its entry afterwards.
// Design 026: combat snapshots (attacker, defender, damage target) live in a
// second map, rebuilt every batch and only peeked — a KO'd defender is gone
// from the DOM by the time its hit plays, so the hit falls back to these.
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
};

/** Pre-diff snapshot of a combat card from the current batch (not consumed). */
export const peekCombatOrigin = (instanceId) => combatOrigins.get(instanceId);
