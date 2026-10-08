// Design 066: TCG Live's Card_Evolution prefab, as data and pose functions.
// The game spawns it on the evolved card when the card lands (charge 0–1 s,
// pop at 1 s, outro dissolve to 3 s). Every emitter below keeps the extract's
// delay, lifetime, counts, size and colour-over-life keys (Card_Evolution.spec.md),
// in prefab units on the card plane (CARD_UNITS per card height, x right, y up).
// `evolveOps(scene, t)` returns the frame as draw ops for tcgl-canvas.js:
//   sprite   – a texture quad (flipbook frame optional), additive
//   dissolve – a mask texture eaten by a noise texture (the card materials)
//   polar    – a noise texture in polar UVs (radial rays, wisps, spark disc)
//   ribbon   – a strip between two rails (helix whorls, trails, light shafts)
//   cutout   – the card's face is cleared: emitters drawn before it glow
//              around the card, never over its art.
import { HELIX_RIBBONS, LIGHT_SHAFTS, SPIRAL_TRAILS } from './evolve-geometry.mjs';
import { seededRandom } from './flow-pose.mjs';
import {
  TAU,
  ageOf,
  between,
  clamp01,
  curveAt,
  gradientAt,
  lerp,
  limitedTravel,
  pointOnRectEdge,
  railsAround,
  rateBirths,
  smoothstep,
  spinAngle,
  turnPoints,
} from './tcgl-fx.mjs';

export const EVOLVE_SCENE_MS = 3000;
/** Scene time (s) of the pop: Square_Pop at 0.95, everything else at 1.0. */
export const EVOLVE_POP_S = 1.0;
/** Canvas side in card heights; the soft edge keeps every layer local to the card. */
export const EVOLVE_STAGE = 5;

const WHITE = [1, 1, 1];
const POP_TINT = [1, 0.823, 0.684];
const fade = (alpha) => ({ color: [[0, WHITE]], alpha });

// ---- colour-over-life (extract keys) ----
const RAINBOW = [
  [0.036, [1, 0.942, 0.222]],
  [0.141, [0.005, 0.758, 1]],
  [0.246, [1, 0.307, 0.307]],
  [0.364, [0.67, 1, 0.175]],
  [0.528, [1, 0.231, 0.823]],
  [0.629, [0.664, 1, 0.127]],
  [0.829, [0.222, 0.9, 1]],
];
const GRADIENTS = {
  smokes: [
    { color: [[0.118, [1, 0.923, 0.769]], [0.32, [0.09, 1, 0.691]], [0.644, [0.693, 0, 1]], [1, [0.194, 0.066, 0.736]]], alpha: [[0, 0], [0.154, 1], [0.926, 1], [1, 0]] },
    { color: [[0.11, [1, 0.688, 0.665]], [0.352, [0, 0.881, 1]], [0.638, [0.259, 0, 1]], [1, [0.43, 0.283, 0.689]]], alpha: [[0, 0], [0.16, 1], [0.907, 1], [1, 0]] },
  ],
  glowCore: { color: [[0.198, [1, 0.402, 0]], [0.756, [0.674, 0.975, 1]], [0.893, WHITE], [1, [0.672, 0.975, 1]]], alpha: [[0, 0], [0.221, 1], [0.8, 1], [1, 0]] },
  wisp: { color: [[0.036, [1, 0.942, 0.222]], [0.181, [0.005, 0.758, 1]], [0.366, [0.67, 1, 0.175]], [0.596, [1, 0.231, 0.823]], [0.829, [0.222, 0.9, 1]]], alpha: [[0, 0], [0.248, 0.737], [0.45, 1], [0.825, 1], [1, 0]] },
  raysRad: { color: RAINBOW, alpha: [[0, 1], [0.722, 1], [1, 0]] },
  beam: fade([[0, 0], [0.221, 1], [0.657, 1], [1, 0]]),
  softy: fade([[0, 0], [0.162, 1], [0.53, 0.331], [0.756, 0.228], [1, 0]]),
  sparkles: [
    { color: [[0.036, [1, 0.986, 0.844]], [0.141, [0.58, 0.898, 1]], [0.246, [1, 0.788, 0.788]], [0.364, [0.842, 1, 0.608]], [0.524, [1, 0.693, 0.928]], [0.629, [0.883, 1, 0.693]], [0.829, [0.222, 0.9, 1]]], alpha: [[0, 0], [0.13, 1], [0.722, 1], [1, 0]] },
    { color: RAINBOW, alpha: [[0, 0], [0.124, 1], [0.722, 1], [1, 0]] },
  ],
  refraction: { color: [[0, WHITE], [0.399, [0.738, 0.972, 0.969]]], alpha: [[0, 0.078], [0.125, 1], [0.391, 1], [1, 0]] },
  motes: [
    { color: [[0, WHITE], [0.036, [1, 0.982, 0.788]], [0.089, [0.854, 0.963, 1]], [0.163, [1, 0.808, 0.807]], [0.257, [0.835, 1, 0.855]], [0.367, [1, 0.807, 0.953]], [0.699, [0.984, 0.894, 0.824]], [0.947, WHITE]], alpha: [[0, 1], [0.493, 1], [1, 0]] },
    { color: [[0, WHITE], [0.036, [1, 0.986, 0.844]], [0.089, [0.825, 0.956, 1]], [0.163, [1, 0.817, 0.816]], [0.257, [0.873, 1, 0.888]], [0.367, [1, 0.882, 0.971]], [0.699, [0.984, 0.894, 0.824]], [0.947, WHITE]], alpha: [[0, 1], [0.108, 0.318], [0.263, 1], [0.346, 0.667], [0.493, 1], [1, 0]] },
  ],
  introDissolve: { color: [[0.305, [1, 0.857, 0.788]], [0.478, [0.647, 0.916, 1]], [0.657, WHITE]], alpha: [[0.048, 1], [0.937, 1], [1, 0]] },
  introFlash: { color: [[0.124, WHITE], [0.998, [1, 0.647, 0.849]]], alpha: [[0, 1], [0.24, 1], [0.51, 0.835], [0.743, 0.617], [1, 0]] },
  pop: { color: [[0.316, WHITE], [0.998, [0.647, 0.916, 1]]], alpha: [[0, 1], [0.739, 1], [1, 0]] },
  shockwave: { color: [[0.115, WHITE], [0.374, [0.825, 0.561, 1]], [0.685, [0.421, 0.271, 0.784]], [0.853, [0.344, 0.584, 1]]], alpha: [[0.2, 1], [0.553, 1], [0.8, 0.197], [1, 0]] },
  outro: { color: [[0, WHITE], [0.2, [0.524, 0.944, 1]], [0.766, [0, 0.883, 1]]], alpha: [[0.048, 1], [0.97, 1], [1, 0]] },
  disc: fade([[0.143, 0], [0.173, 1], [0.88, 1], [1, 0]]),
  debris: [
    { color: [[0, WHITE], [0.144, [0.399, 0.718, 0.821]], [0.353, [1, 0.847, 0.533]], [0.726, [0.646, 0.943, 1]], [1, [0.821, 0.283, 0.283]]], alpha: [[0, 1], [0.493, 1], [1, 0]] },
    { color: [[0, [1, 0.844, 0.946]], [1, [1, 0.552, 0.957]]], alpha: [[0.091, 1], [0.663, 1], [1, 0]] },
  ],
  helix: fade([[0, 0], [0.087, 0.055], [0.405, 1], [0.767, 1], [1, 0]]),
  spiral: { color: [[0, [0.269, 0.231, 1]], [0.352, [0.325, 0.923, 1]], [0.611, WHITE]], alpha: [[0, 0], [0.087, 0.055], [0.405, 1], [0.966, 1], [1, 0]] },
  spiralLate: { color: [[0.299, [0.269, 0.231, 1]], [0.512, [0.325, 0.923, 1]], [0.754, WHITE]], alpha: [[0, 0], [0.087, 0.055], [0.405, 1], [0.767, 1], [1, 0]] },
  shafts: fade([[0.399, 1], [1, 0]]),
};

// ---- the timeline (delay s · life s) — the order the frame is drawn in ----
export const EVOLVE_TIMELINE = {
  smokes: { delay: 0, life: 0.8 },
  glowCore: { delay: 0, life: 1.257 },
  wisps: { delay: 0.1, life: 1.15 },
  raysRad: { delay: 0.2, life: 1.0 },
  softy: { delay: 0.3, life: 0.6 },
  sparkles: { delay: 1.0, life: 1.0 },
  introFlash: { delay: 0, life: 0.3 },
  introDissolve: { delay: 0, life: 1.0 },
  helix: { delay: 0.1, life: 1.0 },
  spirals: { delay: 0.1, life: 0.9 },
  debris: { delay: 0.2, life: 0.6 },
  prismaticSet: { delay: 0.2, life: 0.4 },
  prismaticThin: { delay: 0.2, life: 0.4 },
  pop: { delay: 0.95, life: 0.08 },
  refraction: { delay: 1.0, life: 0.35 },
  shockwave: { delay: 1.0, life: 0.25 },
  disc: { delay: 1.0, life: 0.3 },
  shafts: { delay: 1.0, life: 0.7 },
  flash: { delay: 1.0, life: 0.3 },
  motes: { delay: 1.0, life: 0.8 },
  outro: { delay: 1.0, life: 2.0 },
};
const T = EVOLVE_TIMELINE;

/** Degrees a 2D matrix turns its content (the opponent's board frame is 180°); mirrors are not turns. */
export function turnOfMatrix(matrix) {
  const { a = 1, b = 0, c = 0, d = 1 } = matrix || {};
  if (![a, b, c, d].every(Number.isFinite) || a * d - b * c <= 0) return 0;
  const degrees = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  return degrees === -180 ? 180 : degrees;
}

// ---- scene: every random pick of one play-through ----

const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

// Particles leaving the edge of a cone of `radius` (thickness 0 → on the rim) straight outward.
const conePoint = (rand, radius, thickness) => {
  const angle = rand() * TAU;
  const r = radius * (1 - thickness * rand());
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, dir: angle };
};

const streaks = (rand, { birthsAt, life, place }) =>
  birthsAt.map((birth) => ({ birth, life: between(rand, life[0], life[1]), row: Math.floor(rand() * 4), tint: rand(), ...place(rand) }));

const ringBirths = (rate, curve) => rateBirths({ burst: 1, rate, curve, duration: 4, until: 1 });

/** Every random placement of one evolution, from `seed` (deterministic). */
export function buildEvolveScene(seed = 1) {
  const rand = seededRandom(seed);
  return {
    smoke: { size: between(rand, 33, 45), rot: between(rand, -Math.PI, Math.PI), gradient: pick(rand, GRADIENTS.smokes) },
    wisps: [0, 1].map(() => ({ size: between(rand, 18, 21), rot: rand() * TAU })),
    raysRad: [0, 1].map(() => ({ size: between(rand, 28, 33), rot: between(rand, -Math.PI, Math.PI), spin: between(rand, -0.262, 0.262) })),
    softy: streaks(rand, {
      birthsAt: ringBirths(15, [[0, 1], [0.123, 1], [0.135, 0]]),
      life: [0.4, 0.6],
      place: (r) => ({ ...conePoint(r, 24.7, 0.58), speed: between(r, 0.5, 3), w: between(r, 7, 8), h: between(r, 7, 9) }),
    }),
    prismaticSet: streaks(rand, {
      birthsAt: ringBirths(22, [[0, 1], [0.162, 1], [0.164, 0]]),
      life: [0.2, 0.4],
      place: (r) => ({ ...conePoint(r, 5.98 * 1.435, 0), w: between(r, 0.45, 1.2), h: between(r, 5, 11) }),
    }),
    prismaticThin: streaks(rand, {
      birthsAt: ringBirths(11, [[0, 1], [0.164, 1], [0.171, 0]]),
      life: [0.2, 0.4],
      place: (r) => ({ ...conePoint(r, 4.14 * 1.287, 0), w: between(r, 1, 3), h: between(r, 8, 11) }),
    }),
    debris: rateBirths({ burst: 14, rate: 150, curve: [[0, 0.171], [0.245, 1], [0.309, 0]], duration: 4 }).map((birth) => {
      const [x, y] = pointOnRectEdge(rand, 0.76 * 11, 1.29 * 8.8);
      const out = Math.hypot(x, y) || 1;
      const reach = between(rand, 0.25, 1);
      return {
        birth,
        life: 0.6 * curveAt([[0, 0.721], [0.261, 0.392], [1, 0.162]], birth / 4),
        x,
        y,
        dx: (x / out) * reach,
        dy: (y / out) * reach,
        speed: between(rand, 0.5, 3),
        size: between(rand, 0.3, 0.75),
        gradient: pick(rand, GRADIENTS.debris),
      };
    }),
    sparkles: Array.from({ length: 22 }, () => {
      const angle = rand() * TAU;
      const r = 15.64 * Math.sqrt(rand());
      return {
        life: between(rand, 0.5, 1),
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        dir: angle,
        speed: between(rand, 1, 5),
        size: between(rand, 0.5, 1),
        rot: between(rand, -Math.PI, Math.PI),
        frame: Math.floor(rand() * 4),
        gradient: pick(rand, GRADIENTS.sparkles),
      };
    }),
    motes: Array.from({ length: 22 }, () => {
      const [x, y] = pointOnRectEdge(rand, 10 - 0.25 * rand(), 14 - 0.25 * rand());
      return {
        life: between(rand, 0.4, 0.8),
        x,
        y,
        size: between(rand, 0.4, 1.2),
        rot: rand() * TAU,
        frame: rand(),
        drift: rand() * TAU,
        gradient: pick(rand, GRADIENTS.motes),
      };
    }),
    spiralDots: Object.fromEntries(
      Object.keys(SPIRAL_TRAILS).map((key) => [
        key,
        Array.from({ length: 26 }, () => ({ at: rand(), side: between(rand, -1, 1), size: between(rand, 0.25, 0.7), frame: rand() < 0.5 ? 0 : 1 })),
      ])
    ),
  };
}

// ---- pose helpers ----

const timeOk = (t) => (Number.isFinite(t) ? t : 0);
const local = (t, beat) => ageOf(timeOk(t), beat.delay, beat.life);
const scaleRgb = (rgb, tint) => rgb.map((c, i) => c * tint[i]);
const along = (x, y, dir, distance) => [x + Math.cos(dir) * distance, y + Math.sin(dir) * distance];

/** A stretched billboard: its quad trails the head back along `dir`. */
const streakOp = (tex, frame, x, y, dir, width, length, rgb, alpha) => {
  const [cx, cy] = along(x, y, dir, -length / 2);
  return { kind: 'sprite', tex, x: cx, y: cy, w: length, h: width, rot: dir, rgb, alpha, frame };
};

function cardLayerOps(t) {
  const ops = [];
  const flash = local(t, T.introFlash);
  if (flash != null) {
    const g = gradientAt(GRADIENTS.introFlash, flash);
    ops.push({ kind: 'dissolve', mask: 'squareRounded', noise: 'tileCell', x: 0, y: 0, w: 10, h: 13, amount: lerp(-1, 1, flash), rgb: scaleRgb(g.rgb, POP_TINT), alpha: g.a });
  }
  const intro = local(t, T.introDissolve);
  if (intro != null) {
    const g = gradientAt(GRADIENTS.introDissolve, intro);
    ops.push({
      kind: 'dissolve',
      mask: 'squareRounded',
      noise: 'diamondSwirl',
     
      x: 0,
      y: 0,
      w: 9.54,
      h: 12.72,
      amount: curveAt([[0, 1], [0.239, 0.562], [0.761, -0.168], [1, -1]], intro),
      noiseRot: -intro * T.introDissolve.life,
      rgb: g.rgb,
      alpha: g.a,
    });
  }
  const pop = local(t, T.pop);
  if (pop != null) {
    const g = gradientAt(GRADIENTS.pop, pop);
    ops.push({ kind: 'sprite', tex: 'squareRounded', x: 0, y: 0, w: 10, h: 13, rot: 0, rgb: scaleRgb(g.rgb, POP_TINT), alpha: g.a });
  }
  const outro = local(t, T.outro);
  if (outro != null) {
    const g = gradientAt(GRADIENTS.outro, outro);
    ops.push({ kind: 'dissolve', mask: 'squareRounded', noise: 'tileCell', x: 0, y: 0, w: 9.54, h: 12.72, amount: lerp(-0.252, 0.82, outro), rgb: g.rgb, alpha: g.a });
  }
  return ops;
}

function backOps(scene, t) {
  const ops = [];
  const smoke = local(t, T.smokes);
  if (smoke != null) {
    const g = gradientAt(scene.smoke.gradient, smoke);
    const size = scene.smoke.size;
    ops.push({ kind: 'dissolve', mask: 'cloudRound', noise: 'renderClouds', x: 0, y: 0, w: size, h: size, rot: scene.smoke.rot, amount: lerp(-1, 0.622, smoke), soft: 0.2, detail: 0.4, rgb: g.rgb, alpha: 0.561 * 0.58 * g.a });
  }
  const core = local(t, T.glowCore);
  if (core != null) {
    const g = gradientAt(GRADIENTS.glowCore, core);
    const size = 20.15 * 2 * lerp(0.462, 0.954, core);
    ops.push({ kind: 'sprite', tex: 'gradRadial', x: 0, y: 0, w: size, h: size, rot: 0, rgb: g.rgb, alpha: g.a });
  }
  const wisp = local(t, T.wisps);
  if (wisp != null) {
    const g = gradientAt(GRADIENTS.wisp, wisp);
    const elapsed = wisp * T.wisps.life;
    for (const w of scene.wisps) {
      const size = w.size * 2 * lerp(0.66, 1, wisp);
      ops.push({ kind: 'polar', noise: 'tileClouds', mask: 'glowSquare', shape: 'open', x: 0, y: 0, size, rot: w.rot, tileU: 2.14, tileV: 0.25, offU: 0, offV: -2 * elapsed, levels: [0.25, 1], detail: 0.5, rgb: g.rgb, alpha: Math.min(1, 1.3 * g.a) });
    }
  }
  const rays = local(t, T.raysRad);
  if (rays != null) {
    const g = gradientAt(GRADIENTS.raysRad, rays);
    const elapsed = rays * T.raysRad.life;
    for (const r of scene.raysRad) {
      const size = r.size * 2 * lerp(0.462, 0.954, rays);
      ops.push({ kind: 'polar', noise: 'streaks', mask: 'gradRadial', shape: 'open', x: 0, y: 0, size, rot: r.rot + r.spin * elapsed, tileU: 1, tileV: 1, offU: 0.15 * elapsed, offV: elapsed, levels: [0, 0.5], detail: 1.2, rgb: g.rgb, alpha: g.a });
    }
  }
  for (const p of scene.softy) {
    const age = ageOf(timeOk(t) - T.softy.delay, p.birth, p.life);
    if (age == null) continue;
    const [x, y] = along(p.x, p.y, p.dir, p.speed * age * p.life);
    const s = 1.2 * lerp(1, 0.694, age);
    const alpha = lerp(0.298, 0.325, p.tint) * gradientAt(GRADIENTS.softy, age).a;
    ops.push(streakOp('raysPrismatic', [1, 4, p.row], x, y, p.dir, p.w * s, p.h * s, [lerp(1, 0.325, p.tint), lerp(1, 0.893, p.tint), 1], alpha));
  }
  const sparkT = timeOk(t) - T.sparkles.delay;
  for (const p of scene.sparkles) {
    const age = ageOf(sparkT, 0, p.life);
    if (age == null) continue;
    const g = gradientAt(p.gradient, age);
    const [x, y] = along(p.x, p.y, p.dir, limitedTravel(p.speed, { limit: 4, limitCurve: [[0, 1], [1, 0]], dampen: 0.05 }, sparkT, p.life));
    const size = p.size * 2 * lerp(0.462, 0.621, age);
    ops.push({ kind: 'sprite', tex: 'starVariants', frame: [2, 2, p.frame], x, y, w: size, h: size, rot: p.rot, rgb: g.rgb, alpha: Math.min(1, 1.28 * g.a) });
  }
  return ops;
}

const SPIN = {
  helix1: { scalar: 10.472, curve: [[0, -0.315], [0.822, -1]], life: 0.81, shrink: 0.559 },
  helix4: { scalar: 10.472, curve: [[0, -0.034], [0.853, -1]], life: 1.0, shrink: 0.09 },
  helix5: { scalar: 10.472, curve: [[0, -0.034], [0.853, -1]], life: 1.0, shrink: 0.126 },
  helix6: { scalar: 10.472, curve: [[0, -0.034], [0.853, -1]], life: 1.0, shrink: 0.054 },
  helix7: { scalar: 10.472, curve: [[0, -0.034], [0.636, -1]], life: 1.0, shrink: 0.306 },
};
// Each helix shrinks toward the card while it spins: the mesh turns about its
// own axis, which the card-plane projection mirrors, so the 2D turn is −spin.
function helixOps(t) {
  const ops = [];
  for (const [key, spin] of Object.entries(SPIN)) {
    const age = ageOf(timeOk(t), T.helix.delay, spin.life);
    if (age == null) continue;
    const angle = -spinAngle(spin.scalar, spin.curve, age, spin.life);
    const scale = lerp(1, spin.shrink, age);
    const ribbon = HELIX_RIBBONS[key];
    ops.push({
      kind: 'ribbon',
      a: turnPoints(ribbon.a, angle, scale),
      b: turnPoints(ribbon.b, angle, scale),
      lut: 'lightShaft',
      pan: lerp(0, key === 'helix1' ? 0.495 : 1, age),
      rgb: WHITE,
      alpha: gradientAt(GRADIENTS.helix, age).a,
    });
  }
  return ops;
}

// Projected spin/scale origins of the three trails (their parent offsets).
const SPIRALS = {
  spiral1: { origin: [0.16, -3.92], scalar: 2.618, curve: [[0, -0.034], [0.872, -1]], dissolve: [[0, 0.477], [0.405, -0.004], [0.73, 0.025], [1, 0.45]], gradient: 'spiral' },
  spiral2: { origin: [0.16, 2.64], scalar: 4.538, curve: [[0.214, 0.02], [0.86, 1]], dissolve: [[0.467, 0.468], [1, 1]], gradient: 'spiralLate' },
  spiral3: { origin: [4.08, -3.92], scalar: 2.618, curve: [[0, -0.034], [0.872, -1]], dissolve: [[0, 0.477], [0.405, -0.004], [0.73, 0.025], [1, 0.45]], gradient: 'spiral' },
};
const shiftPoints = (points, [ox, oy], back = false) => points.map(([x, y]) => (back ? [x + ox, y + oy] : [x - ox, y - oy]));

function spiralOps(scene, t) {
  const ops = [];
  const age = local(t, T.spirals);
  if (age == null) return ops;
  for (const [key, cfg] of Object.entries(SPIRALS)) {
    const trail = SPIRAL_TRAILS[key];
    const angle = -spinAngle(cfg.scalar, cfg.curve, age, T.spirals.life);
    const scale = curveAt([[0.475, 1], [1, 0.757]], age);
    const centre = shiftPoints(turnPoints(shiftPoints(trail.c, cfg.origin), angle, scale), cfg.origin, true);
    const half = trail.w.map((w) => w * scale);
    const g = gradientAt(GRADIENTS[cfg.gradient], age);
    // The trail dissolves through its Debris_Glow dots: solid mid-life, stars at both ends.
    const solid = 1 - smoothstep(0, 0.45, curveAt(cfg.dissolve, age));
    const { a, b } = railsAround(centre, half);
    ops.push({ kind: 'ribbon', a, b, lut: 'prismaticVert', band: 'gradBeamH', rgb: g.rgb, alpha: g.a * solid * 0.85 });
    for (const dot of scene.spiralDots[key]) {
      const i = Math.min(centre.length - 1, Math.floor(dot.at * centre.length));
      const side = (dot.side + 1) / 2;
      const x = lerp(a[i][0], b[i][0], side);
      const y = lerp(a[i][1], b[i][1], side);
      const band = Math.sin(Math.PI * dot.at);
      ops.push({ kind: 'sprite', tex: 'starsSubUV', frame: [2, 1, dot.frame], x, y, w: dot.size * 2, h: dot.size * 2, rot: angle, rgb: g.rgb, alpha: g.a * band });
    }
  }
  return ops;
}

function chargeParticleOps(scene, t) {
  const ops = [];
  const debrisT = timeOk(t) - T.debris.delay;
  for (const p of scene.debris) {
    const age = ageOf(debrisT, p.birth, p.life);
    if (age == null) continue;
    const g = gradientAt(p.gradient, age);
    const travel = limitedTravel(p.speed, { limit: 7, limitCurve: [[0, 1], [0.336, 0.064], [1, 0]], dampen: 0.1 }, age * p.life, p.life);
    const x = p.x + p.dx * travel;
    const y = p.y + p.dy * travel;
    const size = p.size * lerp(1, 0.523, age);
    // Spark_Lerp blends the round glow into the four-point star by its custom curve.
    const star = clamp01(curveAt([[0, 0.013], [0.276, 1], [0.508, -0.035], [0.75, 1], [1, -0.12]], age));
    ops.push({ kind: 'sprite', tex: 'starsSubUV', frame: [2, 1, 0], x, y, w: size, h: size, rot: 0, rgb: g.rgb, alpha: g.a * (1 - star) });
    ops.push({ kind: 'sprite', tex: 'starsSubUV', frame: [2, 1, 1], x, y, w: size * 1.6, h: size * 1.6, rot: 0, rgb: g.rgb, alpha: g.a * star });
  }
  for (const p of scene.prismaticSet) {
    const age = ageOf(timeOk(t) - T.prismaticSet.delay, p.birth, p.life);
    if (age == null) continue;
    const [x, y] = along(p.x, p.y, p.dir, 33 * 1.435 * age * p.life);
    const s = 1.435 * 1.2 * lerp(0.541, 1, age);
    ops.push(streakOp('raysPrismatic', [1, 4, p.row], x, y, p.dir, p.w * s, p.h * s, [lerp(1, 0.325, p.tint), lerp(1, 0.893, p.tint), 1], gradientAt(GRADIENTS.beam, age).a));
  }
  for (const p of scene.prismaticThin) {
    const age = ageOf(timeOk(t) - T.prismaticThin.delay, p.birth, p.life);
    if (age == null) continue;
    const travel = limitedTravel(-2 * 1.287, { limit: 22, limitCurve: [[0, 1], [1, 0.441]], dampen: 0.1 }, age * p.life, p.life);
    const [x, y] = along(p.x, p.y, p.dir, travel);
    const s = 1.287 * 5 * lerp(0.198, 0.405, age);
    ops.push(streakOp('victoryRays', [1, 4, p.row], x, y, p.dir + Math.PI, p.w * s, p.h * s, WHITE, gradientAt(GRADIENTS.beam, age).a));
  }
  return ops;
}

function popOps(scene, t) {
  const ops = [];
  const ring = local(t, T.refraction);
  if (ring != null) {
    const g = gradientAt(GRADIENTS.refraction, ring);
    const size = 31.08 * curveAt([[0, 0.709], [0.152, 0.964], [1, 0.955]], ring);
    ops.push({ kind: 'sprite', tex: 'spectrumRing', x: 0, y: 0, w: size, h: size, rot: 0, rgb: g.rgb, alpha: Math.min(1, 0.51 * 1.6 * g.a) });
  }
  const wave = local(t, T.shockwave);
  if (wave != null) {
    const g = gradientAt(GRADIENTS.shockwave, wave);
    const size = 2 * 95.69 * 0.1 * 4 * curveAt([[0, 0.153], [0.81, 0.835]], wave);
    ops.push({ kind: 'sprite', tex: 'radialLine', x: 0, y: 0, w: size, h: size, rot: 2.592 + 0.6 * wave * T.shockwave.life, rgb: g.rgb, alpha: g.a });
  }
  const disc = local(t, T.disc);
  if (disc != null) {
    const size = 2 * 13.59 * 1.06 * 3 * lerp(0.144, 0.423, disc);
    ops.push({ kind: 'polar', noise: 'debrisGlow', band: 'gradBeamH', lut: 'prismaticVert', x: 0, y: 0, size, rot: 0, tileU: 3, tileV: 1, offU: 0, offV: 0, amount: lerp(-0.514, 0.207, disc), soft: 0.12, detail: 0.7, rgb: WHITE, alpha: gradientAt(GRADIENTS.disc, disc).a });
  }
  const shafts = ageOf(timeOk(t), T.shafts.delay, 0.6);
  if (shafts != null) {
    const boost = curveAt([[0, 1], [0.442, 0.029]], shafts);
    const alpha = gradientAt(GRADIENTS.shafts, shafts).a * (0.55 + 0.45 * boost);
    for (const blade of LIGHT_SHAFTS) ops.push({ kind: 'ribbon', a: blade.a, b: blade.b, lut: 'lightRay', rgb: WHITE, alpha });
  }
  const flash = local(t, T.flash);
  if (flash != null) {
    const alpha = gradientAt(GRADIENTS.shafts, flash).a;
    for (let i = 0; i < 4; i += 1) {
      const angle = (i * Math.PI) / 2;
      const { a, b } = railsAround([[0, 0], [Math.cos(angle) * 15.75, Math.sin(angle) * 15.75]], [1.4, 0.15]);
      ops.push({ kind: 'ribbon', a, b, lut: 'lightRay', rgb: WHITE, alpha });
    }
  }
  const moteT = timeOk(t) - T.motes.delay;
  for (const p of scene.motes) {
    const age = ageOf(moteT, 0, p.life);
    if (age == null) continue;
    const g = gradientAt(p.gradient, age);
    // Noise (strength 3, frequency 0.1) as a slow seeded drift.
    const drift = 3 * 0.35 * moteT;
    const size = p.size * 2 * curveAt([[0, 0.833], [0.689, 0.962], [1, 0.225]], age);
    const frame = Math.floor((p.frame + age) * 4) % 4;
    ops.push({ kind: 'sprite', tex: 'starVariants', frame: [2, 2, frame], x: p.x + Math.cos(p.drift) * drift, y: p.y + Math.sin(p.drift) * drift, w: size, h: size, rot: p.rot, rgb: g.rgb, alpha: Math.min(1, 1.28 * g.a) });
  }
  return ops;
}

/** The frame at scene time `t` (s): back layers, the card cutout, then the front layers. */
export function evolveOps(scene, t) {
  if (!scene) return [];
  return [
    ...backOps(scene, t),
    { kind: 'cutout' },
    ...chargeParticleOps(scene, t),
    ...spiralOps(scene, t),
    ...helixOps(t),
    ...popOps(scene, t),
    ...cardLayerOps(t),
  ];
}
