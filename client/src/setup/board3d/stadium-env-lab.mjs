// Design 077 (prototype): Full Metal Lab (customhb-163) after its card art (TEF 148, sv05-148 in
// set.json; AYUMI ODASHIMA): a round steel lab. The cards lie on its raised dais, a blue disc lit
// from the machine's lens overhead and ringed in pale steel plates, the Poké Ball lit brighter in
// white lines in its middle; yellow railings run round the dais's edge and a teal-grey stair with yellow
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
// Wide enough that the railing runs on round a docking pad's join without a kink.
const PAD_BLEND_PX = 80;
export const MAX_PADS = 6;
/** How far the lower deck lies under the dais (and the cloth). */
export const DROP_PX = 56;
/** The railing: inset from the dais's edge, its rails' heights, its posts' height and spacing. */
const RAIL = { inset: 9, heights: [20, 37], post: 41, every: 58, radius: 3.2 };
/** The stair: its turn round the dais (rad; the art's near right), width, steps, tread depth. */
export const STAIR = { angle: -0.42, width: 84, steps: 6, tread: 15 };
const OUTLINE_STEP_RAD = Math.PI / 90;
/**
 * The tanks on the deck, as the art's few big bulbous ones: turn round the dais (deg), gap from the
 * dais's edge to the tank, radius, height to its shoulder, tint (0 steel, 1 blue steel). Dropped when
 * one would leave the scene or crowd the stair, a console or another tank.
 */
const TANKS = [
  [184, 44, 78, 104, 0],
  [3, 60, 72, 100, 1],
  [214, 60, 56, 92, 1],
  [40, 56, 58, 96, 0],
  [118, 52, 50, 90, 0],
];
/** A tank's domed top rises this share of its radius over its shoulder. */
const TANK_DOME = 0.72;
/** The consoles on the deck: turn round the dais (deg), gap from its edge. */
const CONSOLES = [
  [156, 26],
  [143, 26],
  [130, 26],
];
/** A console's half width along the dais, half depth, and its sloped top's low and high edges (z). */
/** A terminal: half width along the dais, half depth, its desk's height (z) and its monitor's. */
const CONSOLE = { hw: 46, hh: 24, low: 6, monitor: 42 };

/** The art's safety yellow, bright in every light (glowing w: thin rails seen from above stayed olive when lit). */
const YELLOW = [1.0, 0.76, 0.06, 1.78];
const STEEL = [0.72, 0.8, 0.84, 0.85];
const BLUE_STEEL = [0.55, 0.68, 0.76, 0.85];
const DARK_STEEL = [0.32, 0.35, 0.4, 0.7];
const PIPE = [0.42, 0.54, 0.6, 0.85];
const BIG_PIPE_STEEL = [0.24, 0.38, 0.45, 0.85];
const CABLE = [0.03, 0.03, 0.035, 0.3];
/**
 * Clusters of thin upright pipes on the deck, as the art's lab packed with them: turn round the dais
 * (deg), gap from its edge; each cluster three pipes in a row along the dais. Dropped when one would
 * leave the scene or crowd the stair, a console or a tank.
 */
const PIPE_CLUSTERS = [
  [168, 120],
  [195, 160],
  [12, 150],
  [32, 120],
  [62, 150],
  [112, 140],
];
/** A cluster's pipes: radius, spacing, heights; brushed pale silver, as the art's (polished, seen
 * from above, they mirrored only the dark machinery below and read as black sticks). */
const CLUSTER_PIPE = { radius: 8, spacing: 24, heights: [210, 260, 180] };
const PALE_PIPE = [0.72, 0.8, 0.85, 0.4];
/** Cable runs on the dais's band: start turn (deg), span (deg), a wobble seed. */
const CABLE_RUNS = [
  [96, 22, 0.4],
  [108, 16, 2.1],
  [128, 14, 4.0],
];
/** Brushed lids: steel that doesn't mirror the lamps overhead as a white disc. */
const LID = [0.45, 0.48, 0.54, 0.25];
/** The big pipes: turn round the dais (deg) each runs out from the ring before rising. */
const BIG_PIPES = [100, 120, 238, 262, 292, 72, 200, 160, 325, 345, 20, 60];
/**
 * The big pipes: radius, run out across the deck, bend radius, the height their upper elbow turns
 * them out level at, and how far they run on out from there.
 */
const BIG_PIPE = { radius: 32, run: 150, bend: 50, top: 236, reach: 300 };
/** Longest span a hanging cable crosses between two risers or tank tops. */
const CABLE_SPAN_PX = 300;
/** The art's thin white bands round its big pipes: spacing along the pipe, how far proud. */
const PIPE_BAND = { every: 150, proud: 1.6, width: 2.4 };
const BAND_WHITE = [0.92, 0.95, 0.97, 0.2];
/** The deck's pipe runs: candidates every `step` deg, at most `most`, two pipes `spread` px apart. */
const BUNDLE = { step: 24, most: 6, spread: 22, radius: 8 };
/** The art's blue-teal stair. */
const STEP_BLUE = [0.1, 0.32, 0.4, 0.35];
const STEP_BLUE_LIGHT = [0.13, 0.38, 0.46, 0.35];
const STEP_SIDE = [0.05, 0.14, 0.18, 0.35];
/** The art's consoles: pale cabinets, sloped dark navy screens with a faint glow, a few grey buttons. */
const SCREEN = [0.08, 0.16, 0.3, 1.6];
const CONSOLE_GREY = [0.78, 0.81, 0.84, 0.3];
const BUTTON = [0.3, 0.33, 0.37, 0.3];

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
    return { x: edge.x + Math.cos(angle) * (gap + CONSOLE.hh), y: edge.y + Math.sin(angle) * (gap + CONSOLE.hh), angle };
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
  const clusters = [];
  for (const [deg, gap] of PIPE_CLUSTERS) {
    const angle = (deg * Math.PI) / 180;
    const edge = outlineAt(outline, angle);
    const x = edge.x + Math.cos(angle) * gap;
    const y = edge.y + Math.sin(angle) * gap;
    const reach = CLUSTER_PIPE.spacing + CLUSTER_PIPE.radius;
    const clear =
      inScene(x, y, reach) &&
      daisDistance(x, y, dais) > reach + 30 &&
      turnBetween(angle, STAIR.angle) > 0.3 &&
      Math.hypot(x - stairEnd.x, y - stairEnd.y) > reach + 70 &&
      consoles.every((c) => Math.hypot(x - c.x, y - c.y) > reach + 70) &&
      tanks.every((t) => Math.hypot(x - t.x, y - t.y) > reach + t.radius + 16) &&
      clusters.every((other) => Math.hypot(x - other.x, y - other.y) > 2 * reach + 20);
    if (clear) clusters.push({ x, y, angle });
  }
  // Pipe runs, as the art's pipes curving round the dais: each leaves the ring pipe along its
  // tangent and runs straight on to the scene's edge, two side by side, clear of the dais, the
  // tanks, consoles and the stair. Radial runs read as a wheel's spokes.
  const bundles = [];
  const nearSegment = (x, y, a, length, dir) => {
    const t = Math.max(0, Math.min(length, (x - a[0]) * dir[0] + (y - a[1]) * dir[1]));
    return Math.hypot(a[0] + dir[0] * t - x, a[1] + dir[1] * t - y);
  };
  const room = BUNDLE.spread / 2 + BUNDLE.radius + 8;
  // A run goes on until the next step would leave the scene or come within its room of the dais, a
  // tank (it ends against the tank's side, as if feeding it), a console or another run.
  const stopsAt = (x, y) =>
    !inScene(x, y, 0) ||
    daisDistance(x, y, dais) < room ||
    tanks.some((t) => Math.hypot(x - t.x, y - t.y) < t.radius + room) ||
    clusters.some((c) => Math.hypot(x - c.x, y - c.y) < CLUSTER_PIPE.spacing + CLUSTER_PIPE.radius + room) ||
    consoles.some((c) => Math.hypot(x - c.x, y - c.y) < 40 + room) ||
    bundles.some((b) => nearSegment(x, y, [b.x, b.y], b.length, [b.dx, b.dy]) < room * 2);
  for (let deg = 10, k = 0; deg < 360 && bundles.length < BUNDLE.most; deg += BUNDLE.step, k += 1) {
    const angle = (deg * Math.PI) / 180;
    if (turnBetween(angle, STAIR.angle) < 0.5) continue;
    const edge = outlineAt(outline, angle);
    const start = [dais.x + Math.cos(angle) * (edge.r + 40), dais.y + Math.sin(angle) * (edge.r + 40)];
    if (stopsAt(start[0], start[1]) || Math.hypot(start[0] - stairEndOf(stair).x, start[1] - stairEndOf(stair).y) < 90) continue;
    const turn = k % 2 ? 1 : -1;
    const dir = [-Math.sin(angle) * turn, Math.cos(angle) * turn];
    let length = 0;
    while (length < 1400 && !stopsAt(start[0] + dir[0] * (length + 10), start[1] + dir[1] * (length + 10))) length += 10;
    // One on to the scene's edge runs off it; one against an obstacle ends there.
    if (!inScene(start[0] + dir[0] * (length + 10), start[1] + dir[1] * (length + 10), 0)) length += 20;
    if (length >= 90) bundles.push({ x: start[0], y: start[1], dx: dir[0], dy: dir[1], length });
  }
  const emblem = craterEmblem(layout, centre);
  return { dais, outline, stair, consoles, tanks, clusters, bundles, emblem };
}

/** Where the stair meets the deck. */
const stairEndOf = (stair) => ({ x: stair.x + Math.cos(stair.angle) * stair.run, y: stair.y + Math.sin(stair.angle) * stair.run });

/** Thin white bands round a pipe running along `points`, every PIPE_BAND.every px of its length. */
const pipeBands = (props, points, radius) => {
  let travelled = 0;
  let next = PIPE_BAND.every / 2;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const length = Math.hypot(...d);
    if (length < 1e-6) continue;
    const dir = d.map((v) => v / length);
    for (; next <= travelled + length; next += PIPE_BAND.every) {
      const at = a.map((v, k) => v + dir[k] * (next - travelled));
      const half = PIPE_BAND.width / 2;
      props.tube(
        [at.map((v, k) => v - dir[k] * half), at.map((v, k) => v + dir[k] * half)],
        radius + PIPE_BAND.proud,
        BAND_WHITE,
        { sides: 12 }
      );
    }
    travelled += length;
  }
};

/** The railing round the dais (open at the stair), its posts, the stair, consoles, tanks and pipes. */
export function labProps(spots) {
  const props = createPropBuilder();
  const { dais, outline, stair, consoles, tanks, clusters = [], bundles = [] } = spots;
  for (const bundle of bundles) {
    const dir = [bundle.dx, bundle.dy];
    const side = [-dir[1], dir[0]];
    for (const offset of [-0.5, 0.5]) {
      const at = (t) => [
        bundle.x + dir[0] * t + side[0] * offset * BUNDLE.spread,
        bundle.y + dir[1] * t + side[1] * offset * BUNDLE.spread,
        -DROP_PX + BUNDLE.radius + 1,
      ];
      const points = [at(0), at(bundle.length)];
      props.tube(points, BUNDLE.radius, PIPE, { sides: 10 });
      pipeBands(props, points, BUNDLE.radius);
    }
    // A clamp across the pair every so often.
    for (let t = 40; t < bundle.length - 20; t += 110) {
      props.box({
        x: bundle.x + dir[0] * t,
        y: bundle.y + dir[1] * t,
        z0: -DROP_PX,
        z1: -DROP_PX + BUNDLE.radius * 2 + 3,
        hw: 3,
        hh: BUNDLE.spread / 2 + BUNDLE.radius + 3,
        yaw: Math.atan2(dir[1], dir[0]),
        color: DARK_STEEL,
      });
    }
  }
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

  // The consoles, as the art's row of terminals: a pale desk on the deck, its front half a keyboard
  // sloping up with a strip of buttons, and an upright monitor at its back, its dark screen facing
  // the dais (and so the cameras).
  for (const { x, y, angle } of consoles) {
    const yaw = angle + Math.PI / 2;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const { hw, hh, low, monitor } = CONSOLE;
    // u runs along the desk, v out from the dais (-hh its front edge, hh its back).
    const at = (u, v, z) => [x + u * c - v * s, y + u * s + v * c, z];
    props.box({ x, y, z0: -DROP_PX, z1: low, hw, hh, yaw, color: CONSOLE_GREY, topColor: CONSOLE_GREY });
    props.quad(at(-hw, -hh, low), at(hw, -hh, low), at(hw, 0, low + 7), at(-hw, 0, low + 7), CONSOLE_GREY);
    for (const side of [-1, 1]) props.quad(at(side * hw, -hh, low), at(side * hw, 0, low), at(side * hw, 0, low + 7), at(side * hw, -hh, low), CONSOLE_GREY);
    props.quad(at(-hw, 0, low), at(hw, 0, low), at(hw, 0, low + 7), at(-hw, 0, low + 7), CONSOLE_GREY);
    for (let k = 0; k < 6; k += 1) {
      const u = -hw + 10 + k * ((2 * hw - 20) / 5);
      const v = -hh * 0.55;
      const z = low + 0.6 + (7 * (v + hh)) / hh;
      props.quad(at(u - 3, v - 2.5, z), at(u + 3, v - 2.5, z), at(u + 3, v + 2.5, z + 0.7), at(u - 3, v + 2.5, z + 0.7), BUTTON);
    }
    const back = hh * 0.62;
    const [mx, my] = at(0, back, 0);
    props.box({ x: mx, y: my, z0: low, z1: low + monitor, hw: hw - 4, hh: 4, yaw, color: CONSOLE_GREY, topColor: CONSOLE_GREY });
    const face = back - 4.6;
    props.quad(at(-hw + 10, face, low + 6), at(hw - 10, face, low + 6), at(hw - 10, face, low + monitor - 6), at(-hw + 10, face, low + monitor - 6), SCREEN);
  }

  // The tanks, as in the art: big steel drums with darker bands and a bulbous domed top, a neck of
  // stacked collars at its crown under a small cap, a pipe stub beside it. A pipe runs to each from
  // the ring.
  for (const tank of tanks) {
    const body = tank.tint ? BLUE_STEEL : STEEL;
    const top = -DROP_PX + tank.height;
    const dome = tank.radius * TANK_DOME;
    props.cylinder({ x: tank.x, y: tank.y, z0: -DROP_PX, z1: top, r: tank.radius, color: body, sides: 28, capColor: LID, domeRise: dome });
    for (const band of [0.2, 0.62]) {
      const z = -DROP_PX + tank.height * band;
      props.ring({ x: tank.x, y: tank.y, z0: z, z1: z + 8, r: tank.radius + 1.8, color: DARK_STEEL, sides: 28 });
    }
    props.ring({ x: tank.x, y: tank.y, z0: top - 5, z1: top + 1, r: tank.radius + 2, color: STEEL, sides: 28 });
    const neck = tank.radius * 0.3;
    for (let k = 0; k < 3; k += 1) {
      const z = top + dome * 0.86 + k * 6;
      props.cylinder({ x: tank.x, y: tank.y, z0: z, z1: z + 5, r: neck * (1 - k * 0.08), color: k % 2 ? DARK_STEEL : STEEL, sides: 18 });
    }
    props.cylinder({ x: tank.x, y: tank.y, z0: top + dome * 0.86 + 18, z1: top + dome * 0.86 + 24, r: neck * 0.7, color: DARK_STEEL, capColor: LID, sides: 18 });
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
    props.tube([[point[0] - half[0] * 0.3, point[1] - half[1] * 0.3, point[2]], [point[0] + half[0] * 0.3, point[1] + half[1] * 0.3, point[2]]], 10.6, BAND_WHITE, { sides: 10 });
  });
  for (const tank of tanks) {
    const edge = outlineAt(outline, tank.angle);
    const from = [edge.x + Math.cos(tank.angle) * 22, edge.y + Math.sin(tank.angle) * 22, -DROP_PX + 10];
    const to = [tank.x - Math.cos(tank.angle) * (tank.radius - 2), tank.y - Math.sin(tank.angle) * (tank.radius - 2), -DROP_PX + 10];
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 8) props.tube([from, to], 7, PIPE, { sides: 8 });
  }
  // Big pipes run out across the deck from the ring, rise at its far side and elbow out level high
  // over the deck, away from the dais, bent like the art's. (Rising out of view, from above they
  // pointed at the eye like barrels.)
  const pastSegment = (point, a, b) => {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point.x - a[0]) * abx + (point.y - a[1]) * aby) / (abx * abx + aby * aby || 1)));
    return Math.hypot(point.x - a[0] - abx * t, point.y - a[1] - aby * t);
  };
  const risers = [];
  for (const deg of BIG_PIPES) {
    const angle = (deg * Math.PI) / 180;
    if (turnBetween(angle, STAIR.angle) < 0.3) continue;
    const edge = outlineAt(outline, angle);
    const dir = [Math.cos(angle), Math.sin(angle)];
    const from = [edge.x + dir[0] * 22, edge.y + dir[1] * 22];
    const corner = [from[0] + dir[0] * BIG_PIPE.run, from[1] + dir[1] * BIG_PIPE.run];
    const blocked =
      tanks.some((t) => pastSegment(t, from, corner) < t.radius + BIG_PIPE.radius + 8) ||
      clusters.some((c) => pastSegment(c, from, corner) < CLUSTER_PIPE.spacing + CLUSTER_PIPE.radius + BIG_PIPE.radius + 6) ||
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
    const elbow = BIG_PIPE.top - BIG_PIPE.bend;
    for (let up = z + BIG_PIPE.bend + 40; up < elbow; up += 40) points.push([corner[0], corner[1], up]);
    points.push([corner[0], corner[1], elbow]);
    for (let k = 1; k <= 8; k += 1) {
      const phi = (k / 8) * (Math.PI / 2);
      const out = BIG_PIPE.bend * (1 - Math.cos(phi));
      points.push([corner[0] + dir[0] * out, corner[1] + dir[1] * out, elbow + BIG_PIPE.bend * Math.sin(phi)]);
    }
    for (let k = 1; k <= 6; k += 1) {
      const out = BIG_PIPE.bend + (BIG_PIPE.reach * k) / 6;
      points.push([corner[0] + dir[0] * out, corner[1] + dir[1] * out, BIG_PIPE.top]);
    }
    props.tube(points, BIG_PIPE.radius, BIG_PIPE_STEEL, { sides: 14 });
    pipeBands(props, points, BIG_PIPE.radius);
    risers.push({ x: corner[0], y: corner[1], angle });
  }
  // The clusters of thin upright pipes, each with a white clamp ring near its top.
  for (const cluster of clusters) {
    const along = [-Math.sin(cluster.angle), Math.cos(cluster.angle)];
    CLUSTER_PIPE.heights.forEach((height, k) => {
      const offset = (k - 1) * CLUSTER_PIPE.spacing;
      const x = cluster.x + along[0] * offset;
      const y = cluster.y + along[1] * offset;
      props.cylinder({ x, y, z0: -DROP_PX, z1: -DROP_PX + height, r: CLUSTER_PIPE.radius, color: PALE_PIPE, sides: 12 });
      props.ring({ x, y, z0: -DROP_PX + height - 30, z1: -DROP_PX + height - 27, r: CLUSTER_PIPE.radius + 1.5, color: BAND_WHITE, sides: 12 });
    });
  }
  // As in the art, black cables hang in loops between neighbouring risers and tank tops.
  const anchors = [
    ...risers.map((riser) => ({ x: riser.x, y: riser.y, z: 210, angle: riser.angle })),
    ...tanks.map((tank) => ({ x: tank.x, y: tank.y, z: -DROP_PX + tank.height + tank.radius * TANK_DOME, angle: tank.angle })),
  ].sort((a, b) => a.angle - b.angle);
  anchors.forEach((a, i) => {
    const b = anchors[(i + 1) % anchors.length];
    const span = Math.hypot(a.x - b.x, a.y - b.y);
    if (a === b || span > CABLE_SPAN_PX) return;
    for (const [lift, sag] of [
      [0, 0.3],
      [12, 0.2],
    ]) {
      const points = [];
      for (let k = 0; k <= 16; k += 1) {
        const t = k / 16;
        const z = a.z + (b.z - a.z) * t + lift - span * sag * 4 * t * (1 - t);
        points.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, z]);
      }
      props.tube(points, 2.4, CABLE, { sides: 6 });
    }
  });
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
    // The deck: flat plate steel (its tread is painted).
    h = -uDais.w;
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
    // The dais, as in the art: a deep glossy navy disc, lit blue from the lens overhead toward its
    // middle, a darker band of reflection across it; round it a band of pale steel plates out to the
    // edge, its own steel rim; the pads steel too.
    float pool = exp(-fromCentre * fromCentre / (2.0 * 360.0 * 360.0));
    col = mix(vec3(0.008, 0.035, 0.1), vec3(0.0, 0.11, 0.3), pool) * (0.94 + 0.12 * fbm3(p / 140.0));
    float reflection = 1.0 - smoothstep(30.0, 90.0, abs(dot(rel, vec2(0.8, 0.6)) - uDais.z * 0.45));
    col *= 1.0 - 0.35 * reflection;
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
    // Every few seconds the lens's scan runs out across the disc as a soft ring.
    float scanR = fract(uTime / 4.5) * (uDais.z - 80.0);
    float scan = exp(-abs(fromCentre - scanR) / 9.0) * (1.0 - fract(uTime / 4.5)) * (1.0 - plates);
    col += vec3(0.08, 0.2, 0.42) * scan * 0.5;
    // The Poke Ball as in the art: crisp white lines (its outline, the band, the button's ring) with
    // a cyan glow round them, over a soft radial glow of the lens's blue light.
    if (uEmblem.z > 0.0) {
      float R = uEmblem.z;
      col += vec3(0.03, 0.22, 0.55) * exp(-fromCentre * fromCentre / (2.0 * R * R * 0.45));
      float ring = abs(fromCentre - R);
      float button = abs(fromCentre - R * 0.27);
      float bar = fromCentre > R * 0.27 && fromCentre < R ? abs(rel.y) : 100000.0;
      float line = min(min(ring, button), bar);
      float pulse = 0.9 + 0.1 * sin(uTime * 1.4);
      col = mix(col, vec3(0.42, 0.85, 1.0), exp(-line / 8.0) * 0.45 * pulse);
      col = mix(col, vec3(0.92, 1.0, 1.05) * pulse, 1.0 - smoothstep(2.2, 3.4, line));
    }
  } else {
    // The deck: dark tread-plate steel in big plates, faint seams between them, shade gathering at
    // the dais's foot.
    vec2 diamond = abs(fract(mat2(0.7071, 0.7071, -0.7071, 0.7071) * p / 7.0 * vec2(1.0, 2.6)) - 0.5);
    float tread = smoothstep(0.32, 0.46, max(diamond.x, diamond.y) - 0.0);
    col = mix(vec3(0.4, 0.5, 0.56), vec3(0.46, 0.56, 0.62), tread * 0.5);
    col *= 0.9 + 0.2 * fbm3(p / 120.0);
    vec2 panel = abs(mod(p + 150.0, 300.0) - 150.0);
    col = mix(col * 0.72, col, smoothstep(0.8, 2.0, min(panel.x, panel.y)));
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
  // Polished chrome mirrors the lab, as the art's pipes: dark machinery and the deck below a sharp
  // horizon, pale walls just above it, bright panels round them, the lamps overhead a hard white
  // stripe along the pipe's crown.
  vec3 view = normalize(uEye - world);
  vec3 r = reflect(-view, n);
  vec3 env = mix(vec3(0.03, 0.06, 0.1), vec3(0.14, 0.22, 0.28), smoothstep(-0.7, -0.06, r.z));
  env = mix(env, vec3(0.62, 0.72, 0.78), smoothstep(-0.06, 0.0, r.z));
  env = mix(env, vec3(0.36, 0.45, 0.5), smoothstep(0.08, 0.5, r.z));
  env += vec3(0.5, 0.62, 0.68) * smoothstep(0.85, 1.0, sin(atan(r.y, r.x) * 5.0)) * smoothstep(0.0, 0.2, r.z) * (1.0 - smoothstep(0.5, 0.8, r.z));
  env = mix(env, vec3(1.45, 1.52, 1.56), smoothstep(0.9, 0.95, r.z));
  vec3 col = mix(diffuse, env * mix(vec3(1.0), albedo * 1.5, 0.45), metal * 0.85);
  col += vec3(0.9, 0.95, 1.0) * pow(max(dot(r, sun), 0.0), 30.0) * metal * 0.5;
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, reveal: LENS_BLUE });

const NO_SPOTS = { dais: null, outline: [], stair: null, consoles: [], tanks: [], clusters: [], bundles: [], emblem: null };

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
