// Design 068: the order Unity's built-in pipeline draws transparent renderers in — render
// queue, then sorting order, then far to near, a particle renderer's sorting fudge added to its
// distance (a lower fudge draws later, on top). DOM-free.
import { length, sub } from './impact-math.mjs';

/** Queues up to this one are opaque geometry: drawn first, near to far. */
const LAST_OPAQUE_QUEUE = 2500;

/** The middle of the box around a system's live particles; its own position when it has none. */
export function boundsCentre(system) {
  const { particles } = system;
  if (particles.length === 0) return system.position;
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const particle of particles) {
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis], particle.pos[axis]);
      high[axis] = Math.max(high[axis], particle.pos[axis]);
    }
  }
  return [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
}

/**
 * Sort draw items `{queue, order, fudge, centre}` into draw order; ties keep their input order.
 * @param {{queue:number, order:number, fudge:number, centre:number[]}[]} items
 * @param {number[]} cameraPosition
 */
export function drawOrder(items, cameraPosition) {
  return items
    .map((item, index) => ({ item, index, depth: length(sub(item.centre, cameraPosition)) + item.fudge }))
    .sort((a, b) => {
      if (a.item.queue !== b.item.queue) return a.item.queue - b.item.queue;
      if (a.item.order !== b.item.order) return a.item.order - b.item.order;
      if (a.depth !== b.depth) return a.item.queue <= LAST_OPAQUE_QUEUE ? a.depth - b.depth : b.depth - a.depth;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}
