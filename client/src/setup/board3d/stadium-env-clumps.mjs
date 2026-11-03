// Design 083: natural clumps for a Stadium board's free ground, in place of an even scatter. Anchors
// on a jittered grid gather where patchy() runs thick; each clump is a hero piece and satellites round
// it, kinds drawn by weight from the board's mix, sizes falling off from the hero. Every piece passes
// the board's own clearance test and keeps off the others. Pure: no three.js, no DOM.
import { measureAsset } from './stadium-kit-assets.mjs';
import { clumpAround, hash, patchy, shuffled } from './stadium-env-spots.mjs';

/** Default flower head and blade sizes (px at card scale 1) of the assets that take them. */
const HEADS = Object.freeze({ flowers: 6, flowerBed: 6 });
const BLADES = Object.freeze({ tallGrass: 16 });

/**
 * A clump mix authored at card scale 1, at the board's card scale `u`: each size, and each flower
 * head and grass blade (given or the asset's default), times u.
 */
export function scaledKinds(kinds, u) {
  const k = Number.isFinite(u) && u > 0 ? u : 1;
  return kinds.map((kind) => {
    const options = { ...(kind.options ?? {}) };
    const head = options.head ?? HEADS[kind.asset];
    const blade = options.blade ?? BLADES[kind.asset];
    if (head !== undefined) options.head = head * k;
    if (blade !== undefined) options.blade = blade * k;
    return { ...kind, size: [kind.size[0] * k, kind.size[1] * k], options };
  });
}

/** A kind from `mix` by weight, for a 0..1 roll. */
const pick = (mix, roll) => {
  const total = mix.reduce((sum, kind) => sum + Math.max(0, kind.weight ?? 1), 0);
  let left = roll * total;
  for (const kind of mix) {
    left -= Math.max(0, kind.weight ?? 1);
    if (left <= 0) return kind;
  }
  return mix[mix.length - 1];
};

/**
 * Design 084: a piece's lean, up to `most` rad toward a hashed heading, as frameOf's [about x, about
 * y]; null when it stands upright.
 */
export function pieceLean(x, y, most, salt = 0) {
  if (!(most > 0)) return null;
  const tilt = most * hash(x, y, salt + 35);
  if (!(tilt > 0)) return null;
  const heading = hash(y, x, salt + 37) * 2 * Math.PI;
  return [-Math.sin(heading) * tilt, Math.cos(heading) * tilt];
}

/**
 * Clumps over `area` ({ x, y, w, h } table px).
 * - `step`: px between anchors (a clump's spacing).
 * - `mix`: [{ asset, weight, size: [min, max] px, options?, lean?, spread? }] — `options` ride into
 *   placeAsset; satellites draw from `satellites ?? mix`. Design 084: `lean` (rad) tips each piece
 *   by a hashed amount up to it, `spread` (0..0.6) scales its size by a hashed factor in
 *   [1 − spread, 1 + spread], so no two pieces of a kind stand alike.
 * - `fits(x, y, reach, height)`: the board's clearance (cards, hand, its own features); a leaning
 *   piece's reach grows by its height × sin(lean).
 * - `thick`: least patchy() weight an anchor needs (1: about half the ground holds clumps).
 * - `weight(x, y)`: design 084, a factor on that weight (frameWeight: fewer clumps under the panel).
 * - `count`: [min, max] satellites per clump. `cap`: most pieces. `spacing`: least gap between two
 *   pieces as a share of their reaches. `taken`: [{ x, y, r }] already there.
 * @returns {{ asset: string, x: number, y: number, size: number, seed: number, yaw: number, lean: number[]|null, reach: number, height: number, hero: boolean, options: object }[]}
 */
export function clumpPieces(area, { step, mix, satellites = null, fits, thick = 1, count = [2, 4], cap = 40, spacing = 0.85, salt = 0, taken = [], weight = null }) {
  if (!area || !(area.w > 0 && area.h > 0) || !(step > 0) || !mix?.length || typeof fits !== 'function') return [];
  const pieces = [];
  const others = taken.map((spot) => ({ ...spot }));
  const room = (x, y, reach) => others.every((spot) => Math.hypot(x - spot.x, y - spot.y) >= (spot.r + reach) * spacing);
  const tryPlace = (kind, x, y, share, seed, hero) => {
    const [low, high] = kind.size;
    const spread = Math.min(0.6, Math.max(0, kind.spread ?? 0));
    const size = (low + (high - low) * hash(x, y, salt + 31)) * share * (1 + spread * (2 * hash(y, x, salt + 33) - 1));
    const dims = measureAsset(kind.asset, { ...(kind.options ?? {}), size });
    const lean = pieceLean(x, y, Math.min(0.5, kind.lean ?? 0), salt);
    const reach = dims.reach + (lean ? dims.height * Math.sin(Math.hypot(lean[0], lean[1])) : 0);
    if (!fits(x, y, reach, dims.height) || !room(x, y, reach)) return null;
    const piece = { asset: kind.asset, x, y, size, seed, yaw: seed * 2 * Math.PI, lean, reach, height: dims.height, hero, options: kind.options ?? {} };
    pieces.push(piece);
    others.push({ x, y, r: reach });
    return piece;
  };
  const anchors = [];
  for (let gy = area.y + step / 2; gy < area.y + area.h; gy += step) {
    for (let gx = area.x + step / 2; gx < area.x + area.w; gx += step) {
      const x = gx + (hash(gx, gy, salt + 1) - 0.5) * step * 0.8;
      const y = gy + (hash(gx, gy, salt + 2) - 0.5) * step * 0.8;
      const welcome = patchy(x, y, { scale: step * 2.2, salt: salt + 3 }) * (typeof weight === 'function' ? weight(x, y) : 1);
      if (welcome >= thick) anchors.push({ x, y });
    }
  }
  for (const anchor of shuffled(anchors, salt + 4)) {
    if (pieces.length >= cap) break;
    const heroKind = pick(mix, hash(anchor.x, anchor.y, salt + 5));
    const hero = tryPlace(heroKind, anchor.x, anchor.y, 0.85 + 0.15 * hash(anchor.y, anchor.x, salt + 6), hash(anchor.x, anchor.y, salt + 7), true);
    if (!hero) continue;
    const [fewest, most] = count;
    const n = fewest + Math.floor(hash(anchor.x, anchor.y, salt + 8) * (most - fewest + 1));
    const around = clumpAround(anchor, { count: n, reach: [hero.reach * 0.9, hero.reach * 1.9], salt: salt + 9 });
    for (const spot of around) {
      if (pieces.length >= cap) break;
      const kind = pick(satellites ?? mix, hash(spot.x, spot.y, salt + 10));
      tryPlace(kind, spot.x, spot.y, spot.share, spot.seed, false);
    }
  }
  return pieces;
}
