// Design 026: pure, seeded particle tables for burst effects (hit sparks, KO
// shards, evolve sparkles, energy motes). DOM-free; `spawnParticles` in
// image-logic/mat-fx.mjs turns a table into animated nodes.
import { seededRandom } from './flow-pose.mjs';

export const MAX_PARTICLES = 24;

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param {object} opts
 * @param {number} opts.count - clamped to [0, MAX_PARTICLES]
 * @param {number} opts.distance - mean travel in px
 * @param {number} [opts.direction] - center angle in degrees (0 = right, 90 = down)
 * @param {number} [opts.spread] - total cone in degrees (360 = full ring)
 * @param {[number, number]} [opts.size] - px range
 * @param {number} [opts.aspect] - height / width (streaks < 1)
 * @param {number} [opts.gravity] - extra px of fall added at the end
 * @param {number} [opts.maxDelay] - fraction of the duration
 * @returns {{dx:number, dy:number, angle:number, size:number, aspect:number,
 *   gravity:number, delay:number, life:number}[]}
 */
export function burstParticles({
  count,
  distance,
  direction = 0,
  spread = 360,
  size = [4, 8],
  aspect = 1,
  gravity = 0,
  maxDelay = 0.1,
  seed = 1,
}) {
  const n = Math.max(0, Math.min(MAX_PARTICLES, Math.floor(Number(count) || 0)));
  const rand = seededRandom(seed);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const slot = spread >= 360 ? (i + rand() * 0.8) / n : rand();
    const angle = direction - spread / 2 + spread * slot;
    const rad = (angle * Math.PI) / 180;
    const travel = distance * lerp(0.55, 1.15, rand());
    out.push({
      dx: Math.cos(rad) * travel,
      dy: Math.sin(rad) * travel,
      angle,
      size: lerp(size[0], size[1], rand()),
      aspect,
      gravity: gravity * lerp(0.6, 1.2, rand()),
      delay: maxDelay * rand(),
      life: lerp(0.7, 1, rand()),
    });
  }
  return out;
}
