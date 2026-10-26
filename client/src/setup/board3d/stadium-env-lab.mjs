// Design 077 (prototype): Full Metal Lab (customhb-163) after its card art (TEF 148, sv05-148 in
// set.json; AYUMI ODASHIMA): a round steel lab. The cards lie on its raised dais, a dark teal disc
// ringed in pale steel plates, the Poké Ball lit blue in white lines in its middle under the
// machine's lens; yellow railings run round the dais's edge and a teal-grey stair with yellow
// handrails climbs to it from the near right, as in the art. Below the dais, on the lab's deck of
// plate steel: control consoles with glowing screens, steel tanks and the pipes that ring the dais
// and run to them. The art looks across the dais from below its stair; the board looks down on it, so the
// dais grows round every Active and Bench card, docking pads join it under the Prize cards and
// piles at its corners, and the lower deck shows beside the cards, where the table is free.
//
// Bake, once per layout: BAKE_FIELD writes R height px (the dais at the cloth, the deck DROP_PX
// below), G signed px from the dais's edge, A the kind (-1 dais, 1 deck); the shared light bake
// adds normals and occlusion. Per frame: TERRAIN paints the metal, the emblem and the lens's light;
// PROPS is every railing, post, stair step, console, tank and pipe, one geometry
// (stadium-env-props.mjs).
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  POKE_BALL,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { arenaRects, craterEmblem, environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { tableBounds } from './table-uv.mjs';

export const LAB_KEY = 'full-metal-lab';
/** Free steel kept round the Active and Bench cards, the Stadium and the Trainer rows on the dais. */
export const DAIS_MARGIN_PX = 26;
/** Steel kept round a Prize block or pile on its docking pad. */
export const PAD_MARGIN_PX = 16;
const PAD_CORNER_PX = 14;
const PAD_BLEND_PX = 40;
export const MAX_PADS = 6;
/** How far the lower deck lies under the dais (and the cloth). */
export const DROP_PX = 56;
/** The railing: inset from the dais's edge, its rails' heights, its posts' height and spacing. */
const RAIL = { inset: 9, heights: [20, 37], post: 41, every: 58, radius: 2.3 };
/** The stair: its turn round the dais (rad; the art's near right), width, steps, tread depth. */
export const STAIR = { angle: -0.42, width: 84, steps: 6, tread: 15 };
const OUTLINE_STEP_RAD = Math.PI / 90;
/**
 * The tanks on the deck: turn round the dais (deg), gap from the dais's edge to the tank, radius,
 * height, tint (0 steel, 1 blue steel). Dropped when one would leave the scene or crowd the stair,
 * a console or another tank.
 */
const TANKS = [
  [180, 46, 54, 170, 0],
  [158, 64, 40, 140, 1],
  [203, 62, 38, 130, 0],
  [222, 34, 30, 110, 1],
  [128, 40, 46, 160, 0],
  [2, 70, 50, 165, 1],
  [22, 42, 40, 145, 0],
  [40, 70, 30, 120, 0],
  [56, 36, 44, 160, 1],
  [318, 70, 36, 125, 0],
];
/** The consoles on the deck: turn round the dais (deg), gap from its edge. */
const CONSOLES = [
  [146, 22],
  [137, 22],
];

const YELLOW = [0.95, 0.68, 0.04, 0.35];
const STEEL = [0.72, 0.8, 0.84, 0.85];
const BLUE_STEEL = [0.55, 0.68, 0.76, 0.85];
const DARK_STEEL = [0.32, 0.35, 0.4, 0.7];
const PIPE = [0.76, 0.85, 0.88, 0.85];
const CABLE = [0.03, 0.03, 0.035, 0.3];
const LAMP_BLACK = [0.035, 0.037, 0.045, 0.5];
const LAMP_LIGHT = [1.2, 1.25, 1.3, 2.2];
/** Cable runs on the dais's band: start turn (deg), span (deg), a wobble seed. */
const CABLE_RUNS = [
  [96, 22, 0.4],
  [108, 16, 2.1],
  [128, 14, 4.0],
];
/** Brushed lids: steel that doesn't mirror the lamps overhead as a white disc. */
const LID = [0.45, 0.48, 0.54, 0.25];
/** The big pipes: turn round the dais (deg) each runs out from the ring before rising. */
const BIG_PIPES = [100, 120, 238, 262, 292, 72, 200, 160];
const BIG_PIPE = { radius: 20, run: 150, bend: 40, top: 320 };
const STEP_BLUE = [0.14, 0.24, 0.27, 0.35];
const STEP_BLUE_LIGHT = [0.18, 0.29, 0.32, 0.35];
const STEP_SIDE = [0.06, 0.1, 0.12, 0.35];
/** The art's consoles: pale grey bodies, dark teal screens with a faint glow. */
const SCREEN = [0.16, 0.3, 0.38, 1.9];
const CONSOLE_GREY = [0.66, 0.7, 0.74, 0.3];
const BUTTON = [0.25, 0.3, 0.34, 0.3];

const isRect = (rect) => rect && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w > 0 && rect.h > 0;
const cornersOf = (rect) => [
  [rect.x, rect.y],
  [rect.x + rect.w, rect.y],
  [rect.x, rect.y + rect.h],
  [rect.x + rect.w, rect.y + rect.h],
];

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

const padDistance = (x, y, pad) => {
  const qx = Math.abs(x - (pad.x0 + pad.x1) / 2) - ((pad.x1 - pad.x0) / 2 - PAD_CORNER_PX);
  const qy = Math.abs(y - (pad.y0 + pad.y1) / 2) - ((pad.y1 - pad.y0) / 2 - PAD_CORNER_PX);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - PAD_CORNER_PX;
};

/**
 * Signed px from the dais's edge at (x, y), negative on it: its round top smoothly joined to its
 * docking pads (the shader's daisDistance).
 */
export function daisDistance(x, y, dais) {
  let d = Math.hypot(x - dais.x, y - dais.y) - dais.r;
  for (const pad of dais.pads) d = smin(d, padDistance(x, y, pad), PAD_BLEND_PX);
  return d;
}

/** Pads grown round the footprints, merged where they meet, at most MAX_PADS. */
const padsFor = (rects) => {
  const pads = rects.map((r) => ({
    x0: r.x - PAD_MARGIN_PX,
    y0: r.y - PAD_MARGIN_PX,
    x1: r.x + r.w + PAD_MARGIN_PX,
    y1: r.y + r.h + PAD_MARGIN_PX,
  }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < pads.length && !merged; i += 1) {
      for (let j = i + 1; j < pads.length && !merged; j += 1) {
        const a = pads[i];
        const b = pads[j];
        if (a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1) {
          pads[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
          pads.splice(j, 1);
          merged = true;
        }
      }
    }
  }
  return pads.slice(0, MAX_PADS);
};

/** The dais's edge round its centre, one point per OUTLINE_STEP_RAD: { x, y, angle, r }. */
const outlineOf = (dais) => {
  const points = [];
  for (let angle = 0; angle < 2 * Math.PI - 1e-9; angle += OUTLINE_STEP_RAD) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const at = (r) => daisDistance(dais.x + c * r, dais.y + s * r, dais);
    let r = dais.r + 600;
    while (r > 0 && at(r) > 0) r -= 4;
    let lo = r;
    let hi = r + 4;
    for (let k = 0; k < 20; k += 1) {
      const mid = (lo + hi) / 2;
      if (at(mid) > 0) hi = mid;
      else lo = mid;
    }
    points.push({ x: dais.x + c * lo, y: dais.y + s * lo, angle, r: lo });
  }
  return points;
};

/** The point of the outline at a turn (rad), between its two nearest samples. */
const outlineAt = (outline, angle) => {
  const turn = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const i = Math.floor(turn / OUTLINE_STEP_RAD) % outline.length;
  const a = outline[i];
  const b = outline[(i + 1) % outline.length];
  const t = (turn - a.angle) / OUTLINE_STEP_RAD;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: a.r + (b.r - a.r) * t };
};

const turnBetween = (a, b) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

/**
 * Full Metal Lab's layout: the dais (a circle round the Active and Bench cards, the Stadium and the
 * Trainer rows, DAIS_MARGIN_PX clear; docking pads under every footprint it doesn't hold), its
 * outline, the stair, the tanks and consoles on the deck, and the emblem. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function labSpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const centre = { x: table.x + table.w / 2, y: layout.depth };
  const { slabs, flats } = environmentFootprints(layout);
  const core = [...arenaRects(layout), ...flats, ...(isRect(layout.stadium) ? [layout.stadium] : [])];
  const reach = (rect) => Math.max(...cornersOf(rect).map(([x, y]) => Math.hypot(x - centre.x, y - centre.y)));
  const r = (core.length ? Math.max(...core.map(reach)) : table.h / 3) + DAIS_MARGIN_PX;
  const pads = padsFor(slabs.filter((rect) => reach(rect) > r - DAIS_MARGIN_PX / 2));
  const dais = { x: centre.x, y: centre.y, r, pads };
  const outline = outlineOf(dais);
  const scene = sceneBounds(layout, LAB_KEY);
  const stairFoot = outlineAt(outline, STAIR.angle);
  const stair = {
    x: stairFoot.x,
    y: stairFoot.y,
    angle: STAIR.angle,
    run: STAIR.steps * STAIR.tread,
  };
  const stairEnd = {
    x: stair.x + Math.cos(stair.angle) * stair.run,
    y: stair.y + Math.sin(stair.angle) * stair.run,
  };
  const consoles = CONSOLES.map(([deg, gap]) => {
    const angle = (deg * Math.PI) / 180;
    const edge = outlineAt(outline, angle);
    return { x: edge.x + Math.cos(angle) * (gap + 20), y: edge.y + Math.sin(angle) * (gap + 20), angle };
  });
  const inScene = (x, y, margin) =>
    x - margin > scene.x && x + margin < scene.x + scene.w && y - margin > scene.y && y + margin < scene.y + scene.h;
  const tanks = [];
  for (const [deg, gap, radius, height, tint] of TANKS) {
    const angle = (deg * Math.PI) / 180;
    const edge = outlineAt(outline, angle);
    const x = edge.x + Math.cos(angle) * (gap + radius);
    const y = edge.y + Math.sin(angle) * (gap + radius);
    const clear =
      inScene(x, y, radius) &&
      daisDistance(x, y, dais) > radius + 20 &&
      turnBetween(angle, STAIR.angle) > 0.18 &&
      Math.hypot(x - stairEnd.x, y - stairEnd.y) > radius + 70 &&
      consoles.every((c) => Math.hypot(x - c.x, y - c.y) > radius + 60) &&
      tanks.every((t) => Math.hypot(x - t.x, y - t.y) > radius + t.radius + 14);
    if (clear) tanks.push({ x, y, radius, height, tint, angle });
  }
  const emblem = craterEmblem(layout, centre);
  return { dais, outline, stair, consoles, tanks, emblem };
}

/** The railing round the dais (open at the stair), its posts, the stair, consoles, tanks and pipes. */
export function labProps(spots) {
  const props = createPropBuilder();
  const { dais, outline, stair, consoles, tanks } = spots;
  const halfGap = (STAIR.width / 2 + 10) / outlineAt(outline, STAIR.angle).r;
  // The railing: from one side of the stair round to the other, inset from the edge.
  const rail = [];
  const start = STAIR.angle + halfGap;
  for (let turn = 0; turn <= 2 * Math.PI - 2 * halfGap + 1e-9; turn += OUTLINE_STEP_RAD) {
    const edge = outlineAt(outline, start + turn);
    const angle = Math.atan2(edge.y - dais.y, edge.x - dais.x);
    rail.push([edge.x - Math.cos(angle) * RAIL.inset, edge.y - Math.sin(angle) * RAIL.inset]);
  }
  for (const z of RAIL.heights) props.tube(rail.map(([x, y]) => [x, y, z]), RAIL.radius, YELLOW, { sides: 6 });
  let run = 0;
  rail.forEach(([x, y], i) => {
    if (i > 0) run += Math.hypot(x - rail[i - 1][0], y - rail[i - 1][1]);
    if (i === 0 || i === rail.length - 1 || run >= RAIL.every) {
      props.cylinder({ x, y, z0: 0, z1: RAIL.post, r: 2.8, color: YELLOW, sides: 8, domeRise: 2.5 });
      run = 0;
    }
  });

  // The stair: blue steps down to the deck, a yellow handrail either side.
  const along = [Math.cos(stair.angle), Math.sin(stair.angle)];
  const across = [-along[1], along[0]];
  const rise = DROP_PX / (STAIR.steps + 1);
  for (let i = 0; i < STAIR.steps; i += 1) {
    const centreRun = STAIR.tread * (i + 0.5) - 1;
    props.box({
      x: stair.x + along[0] * centreRun,
      y: stair.y + along[1] * centreRun,
      z0: -DROP_PX,
      z1: -rise * (i + 1),
      hw: STAIR.tread / 2 + 0.5,
      hh: STAIR.width / 2,
      yaw: stair.angle,
      color: STEP_SIDE,
      topColor: i % 2 ? STEP_BLUE : STEP_BLUE_LIGHT,
    });
    // A steel nosing along each tread's outer edge, so the steps read one by one from above.
    const edgeRun = STAIR.tread * (i + 1) - 2.5;
    props.box({
      x: stair.x + along[0] * edgeRun,
      y: stair.y + along[1] * edgeRun,
      z0: -rise * (i + 1),
      z1: -rise * (i + 1) + 1,
      hw: 2,
      hh: STAIR.width / 2,
      yaw: stair.angle,
      color: DARK_STEEL,
      topColor: STEEL,
    });
  }
  for (const side of [-1, 1]) {
    const offset = (STAIR.width / 2 + 3) * side;
    const top = [stair.x + across[0] * offset - along[0] * 6, stair.y + across[1] * offset - along[1] * 6, 37];
    const foot = [stair.x + across[0] * offset + along[0] * stair.run, stair.y + across[1] * offset + along[1] * stair.run, 37 - DROP_PX];
    props.tube([top, foot], RAIL.radius, YELLOW, { sides: 6 });
    for (const [x, y, z] of [top, foot]) props.cylinder({ x, y, z0: z - 37, z1: z, r: 2.8, color: YELLOW, sides: 8 });
  }

  // The consoles: pale grey desks, a dark screen and a row of buttons on top.
  for (const { x, y, angle } of consoles) {
    const yaw = angle + Math.PI / 2;
    props.box({ x, y, z0: -DROP_PX, z1: -20, hw: 30, hh: 16, yaw, color: CONSOLE_GREY, topColor: CONSOLE_GREY });
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const at = (u, v) => [x + u * c - v * s, y + u * s + v * c, -19.5];
    props.quad(at(-24, -2), at(24, -2), at(24, 12), at(-24, 12), SCREEN);
    for (let k = 0; k < 5; k += 1) {
      const u = -20 + k * 10;
      props.quad(at(u - 2.5, -11), at(u + 2.5, -11), at(u + 2.5, -6), at(u - 2.5, -6), BUTTON);
    }
  }

  // The tanks: steel drums with darker bands; on each lid a rim, a hatch and a pipe stub. A pipe
  // runs to each from the ring.
  for (const tank of tanks) {
    const body = tank.tint ? BLUE_STEEL : STEEL;
    const top = -DROP_PX + tank.height;
    props.cylinder({ x: tank.x, y: tank.y, z0: -DROP_PX, z1: top, r: tank.radius, color: body, sides: 28, capColor: LID });
    for (const band of [0.2, 0.62]) {
      const z = -DROP_PX + tank.height * band;
      props.ring({ x: tank.x, y: tank.y, z0: z, z1: z + 8, r: tank.radius + 1.8, color: DARK_STEEL, sides: 28 });
    }
    props.ring({ x: tank.x, y: tank.y, z0: top - 5, z1: top + 3, r: tank.radius + 2, color: STEEL, sides: 28 });
    props.cylinder({ x: tank.x, y: tank.y, z0: top, z1: top + 5, r: tank.radius * 0.5, color: DARK_STEEL, sides: 20 });
    const stub = tank.angle + 2.2;
    props.cylinder({
      x: tank.x + Math.cos(stub) * tank.radius * 0.72,
      y: tank.y + Math.sin(stub) * tank.radius * 0.72,
      z0: top,
      z1: top + 22,
      r: Math.max(5, tank.radius * 0.13),
      color: PIPE,
      sides: 10,
    });
  }
  // Black cables snake over the deck from the dais's foot to the consoles.
  consoles.forEach(({ x, y, angle }, i) => {
    const edge = outlineAt(outline, angle + 0.06 * (i ? 1 : -1));
    const bend = [-Math.sin(angle) * 26 * (i ? 1 : -1), Math.cos(angle) * 26 * (i ? 1 : -1)];
    const points = [];
    for (let k = 0; k <= 12; k += 1) {
      const t = k / 12;
      const sway = Math.sin(t * Math.PI);
      points.push([
        edge.x + (x - edge.x) * t + bend[0] * sway,
        edge.y + (y - edge.y) * t + bend[1] * sway,
        -DROP_PX + 3,
      ]);
    }
    props.tube(points, 3, CABLE, { sides: 6 });
  });
  // As in the art, black cables lie in loose loops on the dais's steel band inside the railing,
  // where the far Bench leaves it free, and hang over its edge to the deck.
  for (const [deg, span, seed] of CABLE_RUNS) {
    const from = (deg * Math.PI) / 180;
    const points = [];
    for (let k = 0; k <= 16; k += 1) {
      const t = k / 16;
      const angle = from + ((span * Math.PI) / 180) * t;
      const edge = outlineAt(outline, angle);
      const inset = RAIL.inset + 14 + 9 * Math.sin(t * Math.PI * 3 + seed);
      const radial = Math.atan2(edge.y - dais.y, edge.x - dais.x);
      points.push([edge.x - Math.cos(radial) * inset, edge.y - Math.sin(radial) * inset, 2.5]);
    }
    // Over the lip and down the dais's side to the deck.
    const last = points[points.length - 1];
    const radial = Math.atan2(last[1] - dais.y, last[0] - dais.x);
    const out = (r, z) => [last[0] + Math.cos(radial) * r, last[1] + Math.sin(radial) * r, z];
    points.push(out(10, 2), out(15, -10), out(17, -30), out(22, -DROP_PX + 3), out(40, -DROP_PX + 3));
    props.tube(points, 2.6, CABLE, { sides: 6 });
  }
  // The art's gooseneck lamp on the dais's rim by the stair, bent over the platform.
  const lampFoot = outlineAt(outline, STAIR.angle + halfGap + 0.12);
  const inward = Math.atan2(dais.y - lampFoot.y, dais.x - lampFoot.x);
  const foot = [lampFoot.x + Math.cos(inward) * 8, lampFoot.y + Math.sin(inward) * 8];
  const neck = [];
  for (let k = 0; k <= 10; k += 1) {
    const t = k / 10;
    const reach = 46 * Math.sin((t * Math.PI) / 2) ** 2;
    neck.push([foot[0] + Math.cos(inward) * reach, foot[1] + Math.sin(inward) * reach, 120 * Math.sin((t * Math.PI) / 1.6)]);
  }
  props.cylinder({ x: foot[0], y: foot[1], z0: 0, z1: 4, r: 9, color: LAMP_BLACK, sides: 12 });
  props.tube(neck, 2.4, LAMP_BLACK, { sides: 6 });
  const head = neck[neck.length - 1];
  props.cylinder({ x: head[0], y: head[1], z0: head[2] - 10, z1: head[2] + 4, r: 7, color: LAMP_BLACK, sides: 12 });
  props.cylinder({ x: head[0], y: head[1], z0: head[2] - 11, z1: head[2] - 10, r: 5.5, color: LAMP_LIGHT, sides: 12 });
  const ringPipe = [];
  for (let turn = 0; turn <= 2 * Math.PI - 2 * halfGap + 1e-9; turn += OUTLINE_STEP_RAD * 2) {
    const edge = outlineAt(outline, start + turn);
    const angle = Math.atan2(edge.y - dais.y, edge.x - dais.x);
    ringPipe.push([edge.x + Math.cos(angle) * 22, edge.y + Math.sin(angle) * 22, -DROP_PX + 10]);
  }
  props.tube(ringPipe, 9, PIPE, { sides: 10 });
  // A second, thinner pipe runs beside it, and a bundle of three low along the deck's far side.
  props.tube(ringPipe.map(([x, y, z]) => {
    const angle = Math.atan2(y - dais.y, x - dais.x);
    return [x + Math.cos(angle) * 19, y + Math.sin(angle) * 19, z - 3];
  }), 5.5, PIPE, { sides: 8 });
  ringPipe.forEach((point, i) => {
    if (i % 9 !== 4) return;
    const next = ringPipe[Math.min(i + 1, ringPipe.length - 1)];
    const back = ringPipe[Math.max(i - 1, 0)];
    const dir = [next[0] - back[0], next[1] - back[1], 0];
    const length = Math.hypot(dir[0], dir[1]) || 1;
    const half = [(dir[0] / length) * 4, (dir[1] / length) * 4, 0];
    props.tube([[point[0] - half[0], point[1] - half[1], point[2]], [point[0] + half[0], point[1] + half[1], point[2]]], 11.5, DARK_STEEL, { sides: 10 });
  });
  for (const tank of tanks) {
    const edge = outlineAt(outline, tank.angle);
    const from = [edge.x + Math.cos(tank.angle) * 22, edge.y + Math.sin(tank.angle) * 22, -DROP_PX + 10];
    const to = [tank.x - Math.cos(tank.angle) * (tank.radius - 2), tank.y - Math.sin(tank.angle) * (tank.radius - 2), -DROP_PX + 10];
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 8) props.tube([from, to], 7, PIPE, { sides: 8 });
  }
  // Big pipes run out across the deck from the ring and rise at its far side, bent like the art's.
  const pastSegment = (point, a, b) => {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point.x - a[0]) * abx + (point.y - a[1]) * aby) / (abx * abx + aby * aby || 1)));
    return Math.hypot(point.x - a[0] - abx * t, point.y - a[1] - aby * t);
  };
  for (const deg of BIG_PIPES) {
    const angle = (deg * Math.PI) / 180;
    if (turnBetween(angle, STAIR.angle) < 0.3) continue;
    const edge = outlineAt(outline, angle);
    const dir = [Math.cos(angle), Math.sin(angle)];
    const from = [edge.x + dir[0] * 22, edge.y + dir[1] * 22];
    const corner = [from[0] + dir[0] * BIG_PIPE.run, from[1] + dir[1] * BIG_PIPE.run];
    const blocked =
      tanks.some((t) => pastSegment(t, from, corner) < t.radius + BIG_PIPE.radius + 8) ||
      consoles.some((c) => pastSegment(c, from, corner) < 50);
    if (blocked) continue;
    const z = -DROP_PX + BIG_PIPE.radius + 2;
    const bendFrom = BIG_PIPE.run - BIG_PIPE.bend;
    const points = [];
    for (let k = 0; k <= 6; k += 1) {
      const t = (bendFrom * k) / 6;
      points.push([from[0] + dir[0] * t, from[1] + dir[1] * t, z]);
    }
    for (let k = 1; k <= 8; k += 1) {
      const phi = (k / 8) * (Math.PI / 2);
      const t = bendFrom + BIG_PIPE.bend * Math.sin(phi);
      points.push([from[0] + dir[0] * t, from[1] + dir[1] * t, z + BIG_PIPE.bend * (1 - Math.cos(phi))]);
    }
    for (let up = z + BIG_PIPE.bend + 40; up <= BIG_PIPE.top; up += 40) points.push([corner[0], corner[1], up]);
    props.tube(points, BIG_PIPE.radius, PIPE, { sides: 12 });
    for (const [x, y, zz] of [points[6], points[14], points[points.length - 2]]) {
      const vertical = zz > z + 1;
      const half = 5;
      props.tube(
        vertical
          ? [[x, y, zz - half], [x, y, zz + half]]
          : [[x - dir[0] * half, y - dir[1] * half, zz], [x + dir[0] * half, y + dir[1] * half, zz]],
        BIG_PIPE.radius + 3,
        DARK_STEEL,
        { sides: 12 }
      );
    }
  }
  return props;
}

const DAIS = /* glsl */ `
// The dais: centre x, y, radius, and how far below it the deck lies; its docking pads (x0, y0, x1,
// y1; unused ones empty) (labSpots).
uniform vec4 uDais;
uniform vec4 uPads[${MAX_PADS}];
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float padDistance(vec2 p, vec4 pad) {
  if (pad.z <= pad.x) return 100000.0;
  vec2 q = abs(p - (pad.xy + pad.zw) * 0.5) - ((pad.zw - pad.xy) * 0.5 - ${PAD_CORNER_PX}.0);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - ${PAD_CORNER_PX}.0;
}
// Signed px from the dais's edge, negative on it.
float daisDistance(vec2 p) {
  float d = length(p - uDais.xy) - uDais.z;
  for (int i = 0; i < ${MAX_PADS}; i++) d = smin(d, padDistance(p, uPads[i]), ${PAD_BLEND_PX}.0);
  return d;
}
`;

/** Bake: the dais at the cloth with a rounded lip and shallow panel grooves; the deck below. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${DAIS}
void main() {
  vec2 p = uMin + vUv * uSize;
  float d = daisDistance(p);
  float h;
  if (d < 0.0) {
    vec2 rel = p - uDais.xy;
    float ringGroove = abs(mod(length(rel) + 32.0, 64.0) - 32.0);
    float spoke = abs(mod(atan(rel.y, rel.x) * length(rel) + 1000.0, max(length(rel) * 0.2618, 1.0)) - length(rel) * 0.1309);
    h = -2.5 * smoothstep(-5.0, 0.0, d) - 0.7 * (1.0 - smoothstep(0.6, 1.6, min(ringGroove, spoke))) * step(d, -30.0);
  } else {
    // The deck's grating, a hair proud along its bars.
    vec2 bar = abs(fract(p / 9.0) - 0.5);
    h = -uDais.w + 0.5 * smoothstep(0.3, 0.45, max(bar.x, bar.y));
  }
  gl_FragColor = vec4(h, d, 0.0, d < 0.0 ? -1.0 : 1.0);
}
`;

export const TERRAIN_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vec2 p = position.xy;
  vec2 uv = (p - uMin) / uSize;
  vPos = p;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, groundAt(uv) * terrainGrowth(p) * edgeSkirt(uv), 1.0);
}
`;

const LENS_BLUE = /* glsl */ `vec3(0.35, 0.75, 1.35)`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
uniform vec3 uEmblem;
${NOISE}
${REVEAL}
${POKE_BALL}
${DAIS}
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float d = field.g;
  vec2 rel = p - uDais.xy;
  float fromCentre = length(rel);
  vec3 col;
  if (d < 0.0) {
    // The dais, as in the art: a dark navy disc in its middle, shallow grooves picked out in blue;
    // round it a band of pale steel plates out to the edge, its own steel rim; the pads steel too.
    col = vec3(0.017, 0.036, 0.046) * (0.92 + 0.16 * fbm3(p / 140.0));
    float ringGroove = abs(mod(fromCentre + 32.0, 64.0) - 32.0);
    float spoke = abs(mod(atan(rel.y, rel.x) * fromCentre + 1000.0, max(fromCentre * 0.2618, 1.0)) - fromCentre * 0.1309);
    col = mix(col, vec3(0.04, 0.09, 0.12), (1.0 - smoothstep(0.6, 1.8, min(ringGroove, spoke))) * step(d, -30.0) * 0.8);
    float plates = smoothstep(uDais.z - 82.0, uDais.z - 79.0, fromCentre);
    float plateSeam = abs(mod(atan(rel.y, rel.x) * uDais.z + 1000.0, 58.0) - 29.0);
    vec3 paleSteel = mix(vec3(0.29, 0.34, 0.39), vec3(0.38, 0.44, 0.5), fbm3(p / 60.0));
    paleSteel = mix(vec3(0.12, 0.13, 0.16), paleSteel, smoothstep(0.6, 1.6, plateSeam));
    col = mix(col, paleSteel, plates);
    col = mix(col, vec3(0.02, 0.025, 0.035), (1.0 - smoothstep(0.8, 2.2, abs(fromCentre - uDais.z + 80.5))) * step(-60.0, d) * 0.9);
    float rim = smoothstep(-28.0, -24.0, d);
    vec3 steel = mix(vec3(0.16, 0.18, 0.22), vec3(0.34, 0.37, 0.42), smoothstep(-24.0, -8.0, d));
    steel = mix(steel, vec3(0.6, 0.64, 0.7), 1.0 - smoothstep(0.8, 2.6, abs(d + 4.0)));
    col = mix(col, steel, rim);
    col = mix(col, vec3(0.02, 0.025, 0.035), (1.0 - smoothstep(0.6, 1.6, abs(d + 26.0))));
    // The lens overhead lights the middle of the dais blue; every few seconds its scan runs out
    // across the disc as a soft ring.
    col += vec3(0.015, 0.05, 0.07) * exp(-fromCentre * fromCentre / (2.0 * 320.0 * 320.0));
    float scanR = fract(uTime / 4.5) * (uDais.z - 80.0);
    float scan = exp(-abs(fromCentre - scanR) / 9.0) * (1.0 - fract(uTime / 4.5)) * (1.0 - plates);
    col += vec3(0.08, 0.2, 0.42) * scan * 0.5;
    // The Poke Ball as in the art: the disc lit blue inside it, brightest toward the far side, in
    // thick white lines (its outline, the band, the button's ring) with a cyan glow round them.
    if (uEmblem.z > 0.0) {
      float R = uEmblem.z;
      float inside = 1.0 - smoothstep(R - 1.0, R + 1.0, fromCentre);
      vec3 lit = mix(vec3(0.0, 0.1, 0.22), vec3(0.01, 0.2, 0.4), smoothstep(-R, R, rel.y));
      col = mix(col, lit * (0.9 + 0.1 * fbm3(p / 50.0)), inside * 0.9);
      float ring = abs(fromCentre - R);
      float button = abs(fromCentre - R * 0.27);
      float bar = fromCentre > R * 0.27 && fromCentre < R ? abs(rel.y) : 100000.0;
      float line = min(min(ring, button), bar);
      float pulse = 0.9 + 0.1 * sin(uTime * 1.4);
      col = mix(col, vec3(0.42, 0.85, 1.0), exp(-line / 12.0) * 0.4 * pulse);
      col = mix(col, vec3(0.92, 1.0, 1.05) * pulse, 1.0 - smoothstep(3.0, 4.6, line));
    }
  } else {
    // The deck: dark tread-plate steel in broad plates, shade gathering at the dais's foot.
    vec2 diamond = abs(fract(mat2(0.7071, 0.7071, -0.7071, 0.7071) * p / 7.0 * vec2(1.0, 2.6)) - 0.5);
    float tread = smoothstep(0.32, 0.46, max(diamond.x, diamond.y) - 0.0);
    col = mix(vec3(0.17, 0.24, 0.27), vec3(0.23, 0.31, 0.35), tread * 0.6);
    col *= 0.9 + 0.2 * fbm3(p / 90.0);
    vec2 panel = abs(mod(p + 72.0, 144.0) - 72.0);
    col = mix(vec3(0.1, 0.11, 0.13), col, smoothstep(0.8, 2.0, min(panel.x, panel.y)));
    col *= mix(0.55, 1.0, smoothstep(0.0, 70.0, d));
    col += vec3(0.008, 0.022, 0.03) * exp(-d / 160.0);
  }
  col = mix(col * 0.55, col, smoothstep(0.3, 0.9, light.b));
  vec2 edgeUv = min(vUv, 1.0 - vUv);
  col *= mix(0.35, 1.0, smoothstep(0.0, 0.05, min(edgeUv.x, edgeUv.y)));

  col += ${LENS_BLUE} * revealGlow(p, 0.035);
  col += ${LENS_BLUE} * exitGlow(p);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** The props' light: the lab's cold key from the far left, a blue-white fill from the lamps above, steel highlights. */
const PROP_LIGHT = /* glsl */ `
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 sun = normalize(uSun);
  float key = max(dot(n, sun), 0.0);
  vec3 diffuse = albedo * (vec3(0.16, 0.18, 0.22) + vec3(0.72, 0.75, 0.8) * key + vec3(0.2, 0.26, 0.36) * (0.5 + 0.5 * n.z));
  // Polished steel mirrors the lab: lamps overhead, bright panels round the walls, dark machinery
  // low down, the deck beneath.
  vec3 view = normalize(uEye - world);
  vec3 r = reflect(-view, n);
  vec3 env = mix(vec3(0.12, 0.18, 0.2), vec3(0.55, 0.68, 0.72), smoothstep(-0.35, 0.25, r.z));
  env += vec3(0.55, 0.7, 0.76) * smoothstep(0.82, 1.0, sin(atan(r.y, r.x) * 5.0)) * smoothstep(-0.1, 0.3, r.z) * (1.0 - smoothstep(0.55, 0.85, r.z));
  env = mix(env, vec3(1.25, 1.35, 1.38), smoothstep(0.78, 0.95, r.z));
  vec3 col = mix(diffuse, env * mix(vec3(1.0), albedo * 1.5, 0.45), metal * 0.85);
  col += vec3(0.9, 0.95, 1.0) * pow(max(dot(r, sun), 0.0), 30.0) * metal * 0.5;
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, reveal: LENS_BLUE });

const NO_SPOTS = { dais: null, outline: [], stair: null, consoles: [], tanks: [], emblem: null };

/** Full Metal Lab's board (stadium-environment-mesh.js BOARDS): the dais and deck, and the props. */
export function fullMetalLabBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uDais: { value: new three.Vector4() },
    uPads: { value: Array.from({ length: MAX_PADS }, () => new three.Vector4()) },
    uEmblem: { value: new three.Vector3() },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    // Both sides: a tube's winding turns with its frame.
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  return {
    objects: [terrain, props],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => labSpots(layout) ?? NO_SPOTS,
    apply(spots, bounds) {
      const { dais, emblem } = spots;
      own.uDais.value.set(dais?.x ?? 0, dais?.y ?? 0, dais?.r ?? 0, DROP_PX);
      own.uPads.value.forEach((slot, i) => {
        const pad = dais?.pads[i];
        if (pad) slot.set(pad.x0, pad.y0, pad.x1, pad.y1);
        else slot.set(0, 0, 0, 0);
      });
      own.uEmblem.value.set(emblem?.x ?? 0, emblem?.y ?? 0, emblem?.r ?? 0);
      replaceGeometry(terrain, terrainGrid(bounds));
      props.visible = Boolean(dais);
      if (dais) replaceGeometry(props, labProps(spots).build(three));
    },
  };
}
