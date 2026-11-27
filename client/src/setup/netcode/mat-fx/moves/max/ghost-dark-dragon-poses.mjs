// Design 092 ghost-dark-dragon: the pure halves of the four drawers the Ghost, Dark and Dragon
// Max Moves added (move-drawers.js, design 092 block). Every pose is a function of the beat
// progress `s` (0–1), the lane (stage px, `h` = card height) and the beat's params, seeded where
// it scatters, so both clients and every frozen frame agree. DOM-free: runs under `node --test`.
//   hauntedFurniture — Max Phantasm / G-Max Terror: haunted chairs, teapots, hats, boots and cups
//                      float up round the attacker, fly down the lane and swarm into the defender.
//   darkDome         — Phantasm, Terror, Max Darkness, G-Max Snooze: a lit energy dome rises over
//                      the defender, ink inside and arcs crawling on its shell; it fades, holds
//                      or bursts.
//   darkRibbons      — Darkness, Snooze, Max Wyrmwind, G-Max Depletion: twisting energy ribbons
//                      streak from the attacker and wrap round the defender.
//   wyrmTornado      — Wyrmwind / Depletion: a funnel of spinning bands round a card, flame fins
//                      riding it, debris at its foot and a crackle on the ground under it.
import { seededRandom } from '../../flow-pose.mjs';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const span = (t, a, b) => (b > a ? clamp01((t - a) / (b - a)) : t >= b ? 1 : 0);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
// Exactly 0 at the start, where the polynomial leaves a rounding speck.
const easeOutBack = (t) => (t <= 0 ? 0 : 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2);

/** '#RRGGBB' → [r, g, b] (0–255), or `fallback` for anything else. */
export function hexRgb(hex, fallback = null) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!match) return fallback;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The first colour of a `hexes` param as rgb, else `fallback`. */
export const hexesRgb = (hexes, index, fallback) =>
  Array.isArray(hexes) && hexes.length > 0 ? hexRgb(hexes[Math.min(index, hexes.length - 1)], fallback) : fallback;

// ---- hauntedFurniture -------------------------------------------------------------------

/** The haunted pieces, in the order a beat's items take them. */
export const FURNITURE = Object.freeze(['chair', 'teapot', 'tophat', 'boot', 'teacup']);

/**
 * Every piece of a hauntedFurniture beat at `s`: where it is (stage px), how high (card heights),
 * its radius (px), turn (deg) and alpha. Three phases: up to `float` the pieces fade in on a ring
 * round the attacker and rise, drifting; to `swarm` each flies (staggered) along a bowed path to
 * its slot on a ring round the defender; after it they circle the defender and close in on it,
 * arriving at the beat's end, where the move makes contact.
 * @param {{ ax: number, ay: number, bx: number, by: number, ux: number, uy: number, nx: number, ny: number, h: number }} lane
 * @returns {Array<{ piece: string, x: number, y: number, z: number, r: number, angleDeg: number, alpha: number }>}
 */
export function furniturePose(s, lane, params, seed = 0) {
  const { count = 6, size = 0.2, float = 0.4, swarm = 0.82, r0 = 0.75, r1 = 0.8, spin = 50 } = params ?? {};
  const h = lane.h;
  const rand = seededRandom((Math.trunc(seed) >>> 0) + 7919);
  const pieces = [];
  const n = Math.max(1, Math.trunc(count));
  const flyEnd = Math.max(swarm, float + 0.05);
  for (let i = 0; i < n; i += 1) {
    const a0 = ((i / n) * 360 + (rand() - 0.5) * 30) * DEG;
    const a1 = a0 + Math.PI + (rand() - 0.5) * 0.5;
    const z0 = 0.22 + rand() * 0.18;
    const dir = rand() < 0.5 ? -1 : 1;
    const bow = (i % 2 ? 1 : -1) * (0.35 + rand() * 0.35) * h;
    const tilt = (rand() - 0.5) * 50;
    const bobPhase = rand() * TAU;
    // Launch order follows the ring, so the pieces leave one after another.
    const start = float + ((flyEnd - float) * 0.45 * i) / n;
    // Float: fade in on the attacker's ring, rise, drift a little round it.
    const appear = easeOutCubic(span(s, (0.25 * float * i) / n, (0.25 * float * i) / n + 0.35 * float));
    const drift = 0.35 * span(s, 0, float);
    const fx = lane.ax + Math.cos(a0 + drift) * r0 * h;
    const fy = lane.ay + Math.sin(a0 + drift) * r0 * h * 0.85;
    const fz = z0 + 0.14 * easeOutCubic(span(s, 0, float)) + 0.03 * Math.sin(s * 9 + bobPhase);
    // Slot on the defender's ring where the flight ends.
    const sx = lane.bx + Math.cos(a1) * r1 * h;
    const sy = lane.by + Math.sin(a1) * r1 * h * 0.85;
    let x = fx;
    let y = fy;
    let z = fz;
    let scale = 0.55 + 0.45 * appear;
    if (s > start) {
      const u = easeInOutCubic(span(s, start, flyEnd));
      // A quadratic path bowed off the lane to one side, high in the middle.
      const mx = (fx + sx) / 2 + lane.nx * bow;
      const my = (fy + sy) / 2 + lane.ny * bow;
      x = (1 - u) ** 2 * fx + 2 * (1 - u) * u * mx + u ** 2 * sx;
      y = (1 - u) ** 2 * fy + 2 * (1 - u) * u * my + u ** 2 * sy;
      z = lerp(fz, 0.34, u) + 0.3 * Math.sin(Math.PI * u);
      scale = 1;
    }
    if (s > flyEnd) {
      // Swarm: circle the defender and close in on it.
      const v = span(s, flyEnd, 1);
      const turn = a1 + dir * 2.2 * easeOutCubic(v);
      const close = 1 - 0.8 * easeInCubic(v);
      x = lane.bx + Math.cos(turn) * r1 * h * close;
      y = lane.by + Math.sin(turn) * r1 * h * 0.85 * close;
      z = lerp(0.34, 0.16, v);
      scale = 1 - 0.3 * easeInCubic(v);
    }
    const alpha = appear * (1 - easeInCubic(span(s, 0.94, 1)));
    pieces.push({
      piece: FURNITURE[i % FURNITURE.length],
      x,
      y,
      z,
      r: size * h * scale,
      angleDeg: tilt + dir * spin * s,
      alpha,
    });
  }
  return pieces;
}

// ---- darkDome --------------------------------------------------------------------------

/**
 * The dome at `s`: its radius (px), the alphas of its shell and its ink, how much crawls on its
 * shell (`arcs`), its veins (the shell cracking with light), a `flash` for its burst, and the
 * shadow world's eyes (0–1). It rises with an overshoot over `grow`; `end` 'fade' dissolves it
 * over its last quarter, 'burst' swells and breaks it open over its last fifth, 'hold' keeps it
 * whole to the end (a second dome takes over).
 * @returns {{ r: number, alpha: number, ink: number, arcs: number, veins: number, flash: number, eyes: number }}
 */
export function domePose(s, h, params) {
  const { r = 0.82, grow = 0.2, arcs = 0.5, veins = 0, end = 'fade', ink = 0.85, eyes = 0 } = params ?? {};
  const c = clamp01(s);
  const rise = easeOutBack(span(c, 0, grow));
  let radius = r * h * (0.3 + 0.7 * rise);
  let alpha = easeOutCubic(span(c, 0, grow * 0.6));
  let inkAlpha = ink * alpha;
  let flash = 0;
  if (end === 'fade') {
    const out = easeInCubic(span(c, 0.72, 1));
    alpha *= 1 - out;
    inkAlpha *= 1 - out;
    radius *= 1 + 0.06 * out;
  } else if (end === 'burst') {
    const out = span(c, 0.8, 1);
    radius *= 1 + 0.35 * easeOutCubic(out);
    flash = out > 0 ? Math.sin(Math.PI * Math.min(1, out * 1.6)) : 0;
    alpha *= 1 - easeInCubic(out);
    inkAlpha *= 1 - easeOutCubic(span(c, 0.8, 0.9));
  }
  const vein = veins * easeInCubic(span(c, 0.45, end === 'burst' ? 0.8 : 0.9));
  return {
    r: radius,
    alpha: clamp01(alpha),
    ink: clamp01(inkAlpha),
    arcs: clamp01(arcs + 0.6 * vein),
    veins: clamp01(vein),
    flash: clamp01(flash),
    eyes: eyes > 0 ? easeOutCubic(span(c, grow + 0.05, grow + 0.3)) * (end === 'hold' ? 1 : 1 - span(c, 0.75, 1)) : 0,
  };
}

/** Where the shadow world's `count` pairs of eyes sit inside a dome of radius 1 (fixed by `seed`). */
export function domeEyes(count, seed = 0) {
  const rand = seededRandom((Math.trunc(seed) >>> 0) + 104729);
  return Array.from({ length: Math.max(0, Math.trunc(count)) }, (_, i) => ({
    x: (i / Math.max(1, count - 1) - 0.5) * 1.1 + (rand() - 0.5) * 0.18,
    y: 0.05 + rand() * 0.45,
    size: 0.14 + rand() * 0.06,
    flicker: rand() * TAU,
  }));
}

// ---- darkRibbons -----------------------------------------------------------------------

/**
 * Every visible ribbon at `s` as a polyline, tail first: points `{ x, y, u }` in stage px (`u` 0
 * at the tail … 1 at the head of the visible run) and the ribbon's index. Each flies (staggered)
 * along a cubic bowed off the lane to its own side and ends wrapping `wrap` degrees round the
 * defender; its head stops at the end of its path and the tail catches it up, so it is spent
 * there.
 * @returns {Array<{ index: number, points: Array<{ x: number, y: number, u: number }> }>}
 */
export function ribbonPaths(s, lane, params, seed = 0) {
  const { count = 5, bow = 0.5, length = 0.45, wrap = 200, stagger = 0.12 } = params ?? {};
  const h = lane.h;
  const rand = seededRandom((Math.trunc(seed) >>> 0) + 15485863);
  const n = Math.max(1, Math.trunc(count));
  const out = [];
  const samples = 40;
  for (let i = 0; i < n; i += 1) {
    const side = i % 2 ? 1 : -1;
    const lean = side * (0.4 + rand() * 0.6) * bow * h;
    const ring = 0.5 * h * (0.85 + rand() * 0.3);
    const enter = Math.atan2(lane.ay - lane.by, lane.ax - lane.bx) + side * (0.6 + rand() * 0.5);
    const spinDir = side;
    const start = (stagger * i) / n;
    // Near-linear, a little quicker off the mark: the ribbon spans the lane mid-beat and is
    // wrapping the defender by its last tenth.
    const v = span(s, start, 1) ** 0.9;
    const head = Math.min(1, v * (1 + length));
    const tail = Math.max(0, v * (1 + length) - length);
    if (!(head > tail + 1e-4)) continue;
    // The path: a cubic from the attacker to the defender's ring, then an arc round it.
    const p0 = { x: lane.ax + lane.nx * side * 0.12 * h, y: lane.ay + lane.ny * side * 0.12 * h };
    const p3 = { x: lane.bx + Math.cos(enter) * ring, y: lane.by + Math.sin(enter) * ring * 0.85 };
    const p1 = { x: p0.x + (p3.x - p0.x) * 0.3 + lane.nx * lean, y: p0.y + (p3.y - p0.y) * 0.3 + lane.ny * lean };
    const p2 = { x: p0.x + (p3.x - p0.x) * 0.75 + lane.nx * lean * 0.6, y: p0.y + (p3.y - p0.y) * 0.75 + lane.ny * lean * 0.6 };
    const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y) + Math.abs(lean);
    const arcLen = ring * wrap * DEG;
    const split = chord / Math.max(1e-6, chord + arcLen);
    const at = (q) => {
      if (q <= split || arcLen <= 0) {
        const t = split > 0 ? Math.min(1, q / split) : 1;
        const k = 1 - t;
        return {
          x: k ** 3 * p0.x + 3 * k * k * t * p1.x + 3 * k * t * t * p2.x + t ** 3 * p3.x,
          y: k ** 3 * p0.y + 3 * k * k * t * p1.y + 3 * k * t * t * p2.y + t ** 3 * p3.y,
        };
      }
      const a = enter + spinDir * ((q - split) / (1 - split)) * wrap * DEG;
      return { x: lane.bx + Math.cos(a) * ring, y: lane.by + Math.sin(a) * ring * 0.85 };
    };
    const points = [];
    for (let k = 0; k <= samples; k += 1) {
      const u = k / samples;
      const p = at(lerp(tail, head, u));
      points.push({ x: p.x, y: p.y, u });
    }
    out.push({ index: i, points });
  }
  return out;
}

// ---- wyrmTornado -----------------------------------------------------------------------

/**
 * The tornado at `s` in its own frame: the base at the origin, y up (card heights × h, px), x to
 * the right. Each band is a ring at height `y` with radii `rx`/`ry` (a ring seen from the side),
 * running round from `from` to `to` (radians, 0 at the right, π/2 nearest the viewer), with an
 * `alpha`. Bands rise into place bottom-up over the first fifth, spin at `rpm`, and at the end
 * unwind: their arcs shorten as they widen and lift, and fade. Fins ride the middle bands.
 * `time` (seconds) turns it.
 * @returns {{ env: number, bands: Array<{ y: number, rx: number, ry: number, from: number, to: number, alpha: number, width: number }>,
 *   fins: Array<{ x: number, y: number, angle: number, depth: number, size: number, alpha: number }>,
 *   debris: Array<{ x: number, y: number, depth: number, size: number, spin: number, alpha: number }>,
 *   crackle: number }}
 */
export function tornadoPose(s, h, params, time = 0, seed = 0) {
  const {
    height = 1.5,
    r0 = 0.35,
    r1 = 0.9,
    bands = 6,
    w = 0.1,
    rpm = 160,
    fins = 0,
    debris = 0,
    crackle = 0,
  } = params ?? {};
  const c = clamp01(s);
  const rand = seededRandom((Math.trunc(seed) >>> 0) + 32452843);
  const rise = easeOutCubic(span(c, 0, 0.22));
  const unwind = easeInCubic(span(c, 0.72, 1));
  const env = easeOutCubic(span(c, 0, 0.12)) * (1 - span(c, 0.86, 1));
  const turn = (rpm / 60) * TAU * time;
  const n = Math.max(1, Math.trunc(bands));
  const out = { env, bands: [], fins: [], debris: [], crackle: 0 };
  for (let k = 0; k < n; k += 1) {
    const f = (k + 0.5) / n;
    const shown = easeOutCubic(span(c, 0.15 * f, 0.15 * f + 0.12));
    const radius = lerp(r0, r1, f) * h * (1 + 0.3 * unwind);
    const arc = (0.7 + 0.25 * rand()) * TAU * (1 - 0.6 * unwind);
    const head = turn * (1 + 0.15 * f) + rand() * TAU;
    out.bands.push({
      y: (height * f * rise + 0.2 * unwind) * h,
      rx: radius,
      ry: radius * 0.3,
      from: head - arc,
      to: head,
      alpha: shown * env * (1 - unwind * 0.5),
      width: w * h * (0.7 + 0.6 * f),
    });
  }
  const finCount = Math.max(0, Math.trunc(fins));
  for (let k = 0; k < finCount; k += 1) {
    const f = 0.35 + (0.4 * (k + 0.5)) / Math.max(1, finCount);
    const radius = lerp(r0, r1, f) * h * (1 + 0.3 * unwind) * 1.05;
    const angle = turn * 1.3 + (k / finCount) * TAU + 0.6;
    out.fins.push({
      x: Math.cos(angle) * radius,
      y: height * f * rise * h + Math.sin(angle) * radius * 0.3 * -1,
      angle,
      depth: Math.sin(angle),
      size: (0.42 + 0.12 * k) * h,
      alpha: env * easeOutCubic(span(c, 0.2, 0.35)) * (1 - unwind),
    });
  }
  const debrisCount = Math.max(0, Math.trunc(debris));
  for (let k = 0; k < debrisCount; k += 1) {
    const radius = lerp(r0 * 1.2, r1 * 0.75, rand()) * h * (1 + 0.5 * unwind);
    const angle = turn * (1.6 + rand() * 0.6) + rand() * TAU;
    const lift = (0.05 + rand() * 0.45) * h * (1 + 0.6 * unwind);
    out.debris.push({
      x: Math.cos(angle) * radius,
      y: lift + Math.sin(angle) * radius * 0.3 * -1,
      depth: Math.sin(angle),
      size: (0.035 + rand() * 0.04) * h,
      spin: time * (3 + rand() * 4) + rand() * TAU,
      alpha: env * easeOutCubic(span(c, 0.08, 0.25)),
    });
  }
  out.crackle = crackle * easeOutCubic(span(c, 0.25, 0.45)) * (1 - span(c, 0.88, 1));
  return out;
}

/**
 * The crackle at the tornado's foot: `count` jagged spikes of energy standing on its base ring
 * (radius `radius` px), each rising `reach` px, re-struck every `rerollMs`. Each is a polyline
 * of points in the tornado's frame (y up), root first.
 */
export function crackleArcs(count, radius, timeMs, seed = 0, rerollMs = 45, reach = radius * 0.5) {
  const step = Math.floor(timeMs / rerollMs);
  const rand = seededRandom((Math.trunc(seed) >>> 0) + step * 9973);
  const arcs = [];
  for (let i = 0; i < count; i += 1) {
    const a = rand() * TAU;
    const x0 = Math.cos(a) * radius;
    const y0 = -Math.sin(a) * radius * 0.3;
    const tall = reach * (0.5 + 0.5 * rand());
    const points = [];
    for (let k = 0; k <= 5; k += 1) {
      const up = (tall * k) / 5;
      const jag = k === 0 ? 0 : (rand() - 0.5) * 0.35 * tall;
      points.push({ x: x0 + jag, y: y0 + up });
    }
    arcs.push(points);
  }
  return arcs;
}
