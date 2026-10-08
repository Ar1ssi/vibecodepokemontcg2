// Design 066: TCG Live's Card_Devolution prefab, as data and pose functions.
// The game spawns it on the card that stays in the slot: a cyan aura flares on
// the card's edges, galaxy rings cross it, sparks and shards shoot out, a pop
// at 0.35 s, then the card's glow ripples away (Card_Devolution.spec.md keys,
// prefab units with CARD_UNITS per card height). Ops: see evolve-scene.mjs;
// `frame` is the aura — flames standing on the card's four edges.
import { DEVOLVE_OVALS } from './evolve-geometry.mjs';
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
  rateBirths,
  smoothstep,
} from './tcgl-fx.mjs';

export const DEVOLVE_SCENE_MS = 1400;
/** Scene time (s) of the devolve pop (Square_Pop). */
export const DEVOLVE_POP_S = 0.35;

const WHITE = [1, 1, 1];

const GRADIENTS = {
  smokes: [
    { color: [[0.118, [1, 0.923, 0.769]], [0.32, [0.09, 0.991, 1]], [0.773, [0.25, 0.467, 1]]], alpha: [[0, 0], [0.288, 1], [0.846, 1], [1, 0]] },
    { color: [[0.11, [0.667, 1, 0.902]], [0.821, [0, 0.881, 1]]], alpha: [[0, 0], [0.248, 1], [0.846, 1], [1, 0]] },
  ],
  glowCore: { color: [[0.198, [1, 0.552, 0.855]], [0.756, [0.674, 0.975, 1]], [1, [0.297, 0.817, 1]]], alpha: [[0, 0], [0.221, 1], [0.8, 1], [1, 0]] },
  aura: { color: [[0, WHITE]], alpha: [[0.114, 1], [0.484, 1], [1, 0]] },
  glowCard: { color: [[0, WHITE]], alpha: [[0, 1], [0.958, 1], [1, 0]] },
  oval: { color: [[0, WHITE], [0.533, [0.325, 0.923, 1]], [0.844, [0.318, 0.827, 1]], [1, [0.269, 0.231, 1]]], alpha: [[0, 0], [0.124, 1], [0.735, 1], [1, 0]] },
  ovalFaint: { color: [[0, [0.325, 0.923, 1]], [0.274, [0.42, 0.745, 1]], [1, [0.321, 0.907, 1]]], alpha: [[0, 0], [0.566, 0.675], [0.703, 0.29], [0.836, 0.127], [0.935, 0]] },
  sparks: { color: [[0.177, WHITE], [0.469, [0.585, 0.968, 1]], [0.794, [0, 0.923, 1]]], alpha: [[0.2, 1], [0.8, 1], [1, 0]] },
  clusters: { color: [[0.16, WHITE], [0.45, [0.585, 0.968, 1]], [1, [0, 0.923, 1]]], alpha: [[0.2, 1], [0.8, 1], [1, 0]] },
  pop: { color: [[0.316, WHITE], [0.998, [0.647, 0.916, 1]]], alpha: [[0, 1], [0.739, 1], [1, 0]] },
  motes: { color: [[0, WHITE], [0.168, [0.533, 1, 0.977]], [0.583, [0.344, 0.816, 1]], [0.937, [0.345, 0.674, 1]]], alpha: [[0.104, 1], [0.851, 1], [1, 0]] },
  shards: { color: [[0, WHITE], [0.078, [1, 0.986, 0.844]], [0.27, [0.741, 0.937, 1]], [1, [0.278, 0.654, 1]]], alpha: [[0, 1], [0.493, 1], [1, 0]] },
  outro: { color: [[0.105, [0.59, 1, 0.956]], [0.234, [0.467, 0.932, 1]], [0.375, [0.259, 0.573, 1]], [0.842, [0, 0.14, 0.811]]], alpha: [[0.048, 1], [0.937, 1], [1, 0]] },
};

export const DEVOLVE_TIMELINE = {
  smokes: { delay: 0, life: 1.0 },
  glowCore: { delay: 0, life: 0.6 },
  auraIntro: { delay: 0, life: 0.5 },
  aura: { delay: 0, life: 0.6 },
  glowCard: { delay: 0, life: 0.4 },
  ovals: { delay: 0, life: 0.7 },
  clusters: { delay: 0.05, life: 0.2 },
  sparks: { delay: 0.2, life: 0.43 },
  pop: { delay: 0.35, life: 0.08 },
  motes: { delay: 0.4, life: 1.0 },
  shards: { delay: 0.4, life: 0.7 },
  outro: { delay: 0.4, life: 0.7 },
};
const T = DEVOLVE_TIMELINE;

// The aura mesh flattened: flames from the card (7.9 × 11) out to 13.4 × 18.5.
const CARD_BOX = [7.9, 11];
const AURA_BOX = [13.42, 18.52];
const TWINKLE = [[0, 0.013], [0.276, 1], [0.508, -0.035], [0.75, 1], [1, -0.12]];

const outwardFrom = (rand, x, y) => {
  const len = Math.hypot(x, y) || 1;
  const reach = between(rand, 0.3, 1);
  return [(x / len) * reach, (y / len) * reach];
};

/** Every random placement of one devolution, from `seed` (deterministic). */
export function buildDevolveScene(seed = 1) {
  const rand = seededRandom(seed);
  const clusterBirths = [
    ...rateBirths({ burst: 15, rate: 99, duration: 0.58 }),
    ...Array.from({ length: 30 }, () => 0.45),
  ];
  return {
    smokes: Array.from({ length: 3 }, () => ({ size: between(rand, 25, 33), rot: between(rand, -Math.PI, Math.PI), gradient: GRADIENTS.smokes[rand() < 0.5 ? 0 : 1] })),
    ovals: [
      { shape: DEVOLVE_OVALS[0], size: 4, life: 0.7, curve: [[0.186, 0.32], [0.606, 0.458], [1, 0.641]], tint: [0.533, 0.85, 1], gradient: 'oval', dissolve: [[0, 0.438], [0.303, -0.053], [0.638, -0.056], [1, 0.647]] },
      { shape: DEVOLVE_OVALS[1], size: 4.2, life: 0.65, curve: [[0.199, 0.307], [0.525, 0.409], [1, 0.686]], tint: [0.495, 0.838, 1], gradient: 'oval', dissolve: [[0, 0.438], [0.303, -0.053], [0.638, -0.056], [1, 0.647]] },
      { shape: DEVOLVE_OVALS[0], size: 4, life: 0.7, curve: [[0.186, 0.32], [0.606, 0.458], [1, 0.641]], tint: [1, 1, 1], alpha: 0.773, gradient: 'ovalFaint', dissolve: null },
      { shape: DEVOLVE_OVALS[1], size: 4.2, life: 0.65, curve: [[0.199, 0.307], [0.525, 0.409], [1, 0.686]], tint: [1, 1, 1], alpha: 0.773, gradient: 'ovalFaint', dissolve: null },
    ].map((oval) => ({ ...oval, dots: Array.from({ length: 30 }, () => ({ at: rand(), side: rand(), size: between(rand, 0.25, 0.6), frame: rand() < 0.5 ? 0 : 1 })) })),
    clusters: clusterBirths.map((birth) => {
      const [x, y] = pointOnRectEdge(rand, 7.4, 10.2);
      const [dx, dy] = outwardFrom(rand, x, y);
      return { birth, life: between(rand, 0.15, 0.2), x, y, dx, dy, speed: between(rand, 5, 11), size: between(rand, 1.5, 2), rot: between(rand, -Math.PI, Math.PI) };
    }),
    sparks: Array.from({ length: 30 }, () => {
      const [x, y] = pointOnRectEdge(rand, 0.76 * 11, 1.29 * 8.8);
      const [dx, dy] = outwardFrom(rand, x, y);
      return { birth: 0.3, life: 0.6 * curveAt([[0, 0.721], [0.261, 0.392], [1, 0.162]], 0.1), x, y, dx, dy, speed: between(rand, 11, 22), size: between(rand, 0.2, 0.3) };
    }),
    motes: Array.from({ length: 32 }, () => {
      const angle = rand() * TAU;
      return { life: between(rand, 0.6, 1), angle, x: Math.cos(angle) * 4.24, y: Math.sin(angle) * 5.91, speed: between(rand, 3, 22), size: between(rand, 0.6, 1.2), rot: rand() * TAU, frame: Math.floor(rand() * 4) };
    }),
    shards: Array.from({ length: 13 }, () => {
      const [x, y] = pointOnRectEdge(rand, 6.39, 7.74);
      const [dx, dy] = outwardFrom(rand, x, y);
      return { life: between(rand, 0.5, 0.7), x, y, dx, dy, speed: between(rand, 5, 15), size: between(rand, 2, 8), rot: between(rand, -Math.PI, Math.PI), spin: between(rand, -10.472, -3.142), wobble: rand() * TAU };
    }),
  };
}

const timeOk = (t) => (Number.isFinite(t) ? t : 0);
const local = (t, beat) => ageOf(timeOk(t), beat.delay, beat.life);
const scaleRgb = (rgb, tint) => rgb.map((c, i) => c * tint[i]);

function backOps(scene, t) {
  const ops = [];
  const smoke = local(t, T.smokes);
  if (smoke != null) {
    for (const s of scene.smokes) {
      const g = gradientAt(s.gradient, smoke);
      const size = s.size * 2 * lerp(0.426, 0.639, smoke);
      ops.push({ kind: 'dissolve', mask: 'cloudRound', noise: 'renderClouds', x: 0, y: 0, w: size, h: size, rot: s.rot, amount: lerp(-1, 0.622, smoke), soft: 0.2, detail: 0.4, rgb: g.rgb, alpha: 0.561 * 0.58 * g.a });
    }
  }
  const core = local(t, T.glowCore);
  if (core != null) {
    const g = gradientAt(GRADIENTS.glowCore, core);
    const size = 16 * 2 * lerp(0.462, 0.954, core);
    ops.push({ kind: 'sprite', tex: 'gradRadial', x: 0, y: 0, w: size, h: size, rot: 0, rgb: g.rgb, alpha: 0.525 * g.a });
  }
  return ops;
}

function cardOps(t) {
  const ops = [];
  const intro = local(t, T.auraIntro);
  if (intro != null) {
    const amount = curveAt([[0, 0.008], [0.449, 0.253], [0.58, 0.349], [0.723, 0.202], [0.873, 0.334], [1, 1]], intro);
    ops.push({ kind: 'frame', outer: AURA_BOX, inner: CARD_BOX, mask: 'evoMask', noise: 'tileCloudStar', lut: 'spectrumLight', amount, rgb: [0.778, 0.973, 1], alpha: gradientAt(GRADIENTS.aura, intro).a });
  }
  const aura = local(t, T.aura);
  if (aura != null) {
    ops.push({ kind: 'frame', outer: AURA_BOX, inner: CARD_BOX, mask: 'gradHorizontalC', noise: 'tileCloudStar', amount: -0.2, rgb: [0.251, 0.551, 1], alpha: 0.624 * gradientAt(GRADIENTS.aura, aura).a });
  }
  const glow = local(t, T.glowCard);
  if (glow != null) {
    ops.push({ kind: 'dissolve', mask: 'cardSharp', noise: null, colors: 'prismaticBlurry', x: 0, y: 0, w: 12.79 * 0.944, h: 12.79 * 0.934, amount: -1, rgb: WHITE, alpha: gradientAt(GRADIENTS.glowCard, glow).a });
  }
  const pop = local(t, T.pop);
  if (pop != null) {
    const g = gradientAt(GRADIENTS.pop, pop);
    ops.push({ kind: 'sprite', tex: 'squareRounded', x: 0, y: 0, w: 11.4, h: 14.82, rot: 0, rgb: scaleRgb(g.rgb, [0.902, 0.788, 1]), alpha: g.a });
  }
  const outro = local(t, T.outro);
  if (outro != null) {
    const g = gradientAt(GRADIENTS.outro, outro);
    ops.push({ kind: 'dissolve', mask: 'cardSharp', noise: 'ripple', x: 0, y: 0, w: 12.79 * 0.948, h: 12.79 * 0.952, amount: lerp(-0.631, 0.673, outro), soft: 0.1, rgb: g.rgb, alpha: g.a });
  }
  return ops;
}

const ellipse = ({ major, minor, angle }, scale, count = 48) =>
  Array.from({ length: count + 1 }, (_, i) => {
    const a = (i / count) * TAU;
    const x = Math.cos(a) * major * scale;
    const y = Math.sin(a) * minor * scale;
    return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
  });

// Oval_ring01's band runs from 0.785 of the ring's radius out to its rim.
const RING_INNER = 0.785;

function ovalOps(scene, t) {
  const ops = [];
  for (const oval of scene.ovals) {
    const age = ageOf(timeOk(t), T.ovals.delay, oval.life);
    if (age == null) continue;
    const scale = oval.size * 2 * curveAt(oval.curve, age);
    const g = gradientAt(GRADIENTS[oval.gradient], age);
    const rgb = scaleRgb(g.rgb, oval.tint);
    const alpha = (oval.alpha ?? 1) * g.a;
    const solid = oval.dissolve ? 1 - smoothstep(0, 0.6, 2 * curveAt(oval.dissolve, age)) : 1;
    const a = ellipse(oval.shape, scale);
    const b = ellipse(oval.shape, scale * RING_INNER);
    ops.push({ kind: 'ribbon', a, b, lut: 'wavyBeam', profile: 'column', rgb, alpha: alpha * solid });
    if (!oval.dissolve) continue;
    for (const dot of oval.dots) {
      const i = Math.floor(dot.at * (a.length - 1));
      const x = lerp(a[i][0], b[i][0], dot.side);
      const y = lerp(a[i][1], b[i][1], dot.side);
      ops.push({ kind: 'sprite', tex: 'starsSubUV', frame: [2, 1, dot.frame], x, y, w: dot.size * 2, h: dot.size * 2, rot: 0, rgb, alpha });
    }
  }
  return ops;
}

function sparkOps(scene, t) {
  const ops = [];
  const clusterT = timeOk(t) - T.clusters.delay;
  for (const p of scene.clusters) {
    const age = ageOf(clusterT, p.birth, p.life);
    if (age == null) continue;
    const g = gradientAt(GRADIENTS.clusters, age);
    const travel = limitedTravel(p.speed, { limit: 22, limitCurve: [[0, 1], [0.55, 0.539], [1, 0.19]], dampen: 0.1 }, age * p.life, p.life);
    const size = p.size * lerp(0.6, 1, age);
    ops.push({ kind: 'sprite', tex: 'sparkleDebris', x: p.x + p.dx * travel, y: p.y + p.dy * travel, w: size, h: size, rot: p.rot, rgb: g.rgb, alpha: g.a * clamp01(curveAt(TWINKLE, age)) });
  }
  const sparkT = timeOk(t) - T.sparks.delay;
  for (const p of scene.sparks) {
    const age = ageOf(sparkT, p.birth, p.life);
    if (age == null) continue;
    const g = gradientAt(GRADIENTS.sparks, age);
    const elapsed = age * p.life;
    const travel = limitedTravel(p.speed, { limit: 22, limitCurve: [[0, 1], [0.379, 0.169], [0.605, 0.07], [1, 0]], dampen: 0.1 }, elapsed, p.life);
    const size = p.size * lerp(1, 0.523, age);
    const dir = Math.atan2(p.dy, p.dx);
    const length = size + p.speed * 0.04 * (1 - age);
    ops.push({ kind: 'sprite', tex: 'starsSubUV', frame: [2, 1, 0], x: p.x + p.dx * travel, y: p.y + p.dy * travel, w: length * 2, h: size * 2, rot: dir, rgb: g.rgb, alpha: g.a * clamp01(curveAt(TWINKLE, age)) });
  }
  const moteT = timeOk(t) - T.motes.delay;
  for (const p of scene.motes) {
    const age = ageOf(moteT, 0, p.life);
    if (age == null) continue;
    const g = gradientAt(GRADIENTS.motes, age);
    const travel = limitedTravel(p.speed, { limit: 10, limitCurve: [[0, 1], [0.353, 0.091], [1, 0]], dampen: 0.35 }, moteT, p.life);
    const size = p.size * 2 * curveAt([[0, 0.833], [0.284, 0.765], [1, 0]], age);
    ops.push({ kind: 'sprite', tex: 'starVariants', frame: [2, 2, p.frame], x: p.x + Math.cos(p.angle) * travel, y: p.y + Math.sin(p.angle) * travel, w: size, h: size, rot: p.rot, rgb: g.rgb, alpha: Math.min(1, 1.28 * g.a) });
  }
  const shardT = timeOk(t) - T.shards.delay;
  for (const p of scene.shards) {
    const age = ageOf(shardT, 0, p.life);
    if (age == null) continue;
    const g = gradientAt(GRADIENTS.shards, age);
    const travel = limitedTravel(p.speed, { limit: 33, limitCurve: [[0, 1], [0.146, 0.046], [1, 0]], dampen: 0.1 }, shardT, p.life);
    // velocityOverLifetime y: 5 · (0 → −1) pulls the shards down the card as they fade.
    const fall = (5 * shardT * shardT) / (2 * p.life);
    const wobble = 0.3 * Math.sin(p.wobble + shardT * 0.5 * TAU);
    const size = p.size * 2 * curveAt([[0, 0.566], [0.16, 0.353], [1, 0.045]], age);
    ops.push({ kind: 'sprite', tex: 'flake', x: p.x + p.dx * travel + wobble, y: p.y + p.dy * travel - fall, w: size, h: size, rot: p.rot + p.spin * shardT, rgb: g.rgb, alpha: g.a });
  }
  return ops;
}

/** The frame at scene time `t` (s): back layers, the card cutout, then the front layers. */
export function devolveOps(scene, t) {
  if (!scene) return [];
  return [...backOps(scene, t), { kind: 'cutout' }, ...cardOps(t), ...ovalOps(scene, t), ...sparkOps(scene, t)];
}
