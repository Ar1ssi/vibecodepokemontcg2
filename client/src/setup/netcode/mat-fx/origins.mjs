// Design 022 slice 4: pre-diff snapshots for effects that need where a card WAS
// (retreat slide, trainer present). apply-view's `onBeforeApply` fills this
// before the DOM diff moves the cards; the effect takes its entry afterwards.
import { moveIdsForEvent } from './lifecycle-pose.mjs';

const MAX_ENTRIES = 24;
const origins = new Map();

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
export function captureOrigins(events, registry, capture, sideOf) {
  for (const event of events) {
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
