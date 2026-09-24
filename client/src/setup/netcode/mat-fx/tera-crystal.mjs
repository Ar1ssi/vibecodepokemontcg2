// Design 037: the Tera entry, drawn on one canvas after the Scarlet/Violet
// Terastallization. The Tera Orb drops onto the Pokémon in a violet starburst,
// the screen flashes lime then teal, the six-point Tera Jewel blazes over the
// Pokémon and dims, the Pokémon goes white, and a cluster of glittering
// crystal blocks grows round it from a glitter floor. Rainbow beams fan out
// behind the cluster, it brightens to a whiteout and bursts into a blue disc
// of chromatic shards under two expanding rainbow rings, revealing the card.
// DOM-free: the timeline and scene are pure; `drawTeraEntry` only uses the 2D
// context passed in, so the whole module runs under `node --test`.
import { normalizeEnergyType } from '../../../actions/move-card-bundle/energy-token-assets.mjs';
import { seededRandom } from './flow-pose.mjs';

export const TERA_ENTRY_MS = 3000;
export const TERA_BURST_AT = 0.83;
// When the card shows through the burst; the crystal skin (tera-skin.js) appears then.
export const TERA_REVEAL_AT = 0.88;

export const TERA_PALETTE = {
  deep: [52, 96, 220],
  ice: [150, 222, 255],
  white: [246, 252, 255],
  lime: [205, 240, 95],
  teal: [40, 200, 175],
  violet: [150, 110, 255],
  pink: [255, 130, 210],
  cyan: [90, 230, 255],
  red: [255, 80, 120],
};

// The crystal colour of each Tera type, as in Scarlet/Violet. Brighter and
// more saturated than the card-glow palette so Darkness and Metal crystals
// don't read as grey. Colorless (and an unknown type) keeps the icy default.
export const TERA_TYPE_RGB = {
  fire: [255, 105, 55],
  water: [55, 135, 255],
  grass: [85, 205, 90],
  lightning: [255, 205, 45],
  psychic: [235, 85, 205],
  fighting: [225, 125, 60],
  darkness: [120, 70, 170],
  metal: [165, 185, 210],
  dragon: [105, 95, 240],
  fairy: [255, 135, 200],
};

const INK = [8, 10, 30];

/**
 * The Tera palette for a Pokémon's type: its crystal tones (deep, ice, cyan)
 * come from the type's colour; flash, orb and rainbow accents stay the same.
 *
 * @param {unknown} type a printed type ('Fire', 'Darkness', 'R', …)
 * @returns {typeof TERA_PALETTE}
 */
export function teraPaletteFor(type) {
  const rgb = TERA_TYPE_RGB[normalizeEnergyType(type)];
  if (!rgb) return TERA_PALETTE;
  return {
    ...TERA_PALETTE,
    deep: mixRgb(rgb, INK, 0.35),
    ice: mixRgb(rgb, TERA_PALETTE.white, 0.2),
    cyan: mixRgb(rgb, TERA_PALETTE.white, 0.1),
  };
}

/** The Tera palette for a card, from its first printed type. */
export const teraPaletteForCard = (card) =>
  teraPaletteFor(Array.isArray(card?.types) ? card.types[0] : null);

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const CARD_ASPECT = 0.716;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
// Exactly 0 at the start, where the polynomial leaves a rounding speck.
const easeOutBack = (t) =>
  t <= 0 ? 0 : 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const plateau = (t, a, b, c, d) => {
  if (t <= a || t >= d) return 0;
  if (t < b) return easeOutCubic(span(t, a, b));
  if (t <= c) return 1;
  return 1 - easeInCubic(span(t, c, d));
};
const lerp = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;

// ---- vectors (x right, y up, z toward the viewer; units are card heights) ----
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a) => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const centroid = (points) =>
  scale(points.reduce(add, [0, 0, 0]), 1 / points.length);
const rotateX = (p, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
};
const rotateY = (p, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
};
const rotateZ = (p, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
};

// ---- timeline ----

/** Every layer's strength (0..1) and motion at t in [0, 1] of the Tera entry. */
export function teraEntryPose(t) {
  const c = clamp01(t);
  return {
    orb: plateau(c, 0, 0.03, 0.12, 0.16),
    orbDrop: easeInOutCubic(span(c, 0.01, 0.14)),
    flash: plateau(c, 0.13, 0.15, 0.22, 0.3),
    flashTeal: easeInOutCubic(span(c, 0.15, 0.25)),
    flashTravel: span(c, 0.13, 0.3),
    jewel: plateau(c, 0.17, 0.2, 0.34, 0.42),
    jewelScale: easeOutBack(span(c, 0.17, 0.25)),
    jewelHeat: 1 - easeInOutCubic(span(c, 0.22, 0.36)),
    streaks: plateau(c, 0.18, 0.21, 0.3, 0.38),
    silhouette: plateau(c, 0.3, 0.34, 0.46, 0.54),
    beams: plateau(c, 0.31, 0.36, 0.46, 0.53),
    floor: plateau(c, 0.32, 0.4, 0.8, 0.86),
    cluster: plateau(c, 0.42, 0.44, TERA_BURST_AT, TERA_BURST_AT + 0.02),
    grow: span(c, 0.42, 0.62),
    shine: easeInCubic(span(c, 0.7, TERA_BURST_AT)),
    spray: plateau(c, 0.44, 0.47, 0.56, 0.62),
    sprayTravel: easeOutCubic(span(c, 0.44, 0.62)),
    glints: plateau(c, 0.55, 0.58, 0.76, 0.8),
    rainbow: plateau(c, 0.6, 0.68, 0.8, 0.86),
    whiteout: plateau(c, 0.77, TERA_BURST_AT, TERA_BURST_AT, 0.9),
    burst: plateau(c, TERA_BURST_AT - 0.005, TERA_BURST_AT + 0.01, 0.9, 1),
    burstTravel: easeOutCubic(span(c, TERA_BURST_AT, 1)),
    reveal: plateau(c, TERA_REVEAL_AT, 0.9, 0.97, 1),
    revealTravel: span(c, TERA_REVEAL_AT, 1),
    yaw: -30 + 50 * c,
    time: (c * TERA_ENTRY_MS) / 1000,
  };
}

// ---- scene ----

const BASE_Y = -0.62;
const PRISM_GROW = 0.45;

// The crystal cluster: x/z of the base, radius, height, lean sideways (deg,
// + to the right) and toward the viewer (deg), sides, and when it starts to
// grow (fraction of the grow beat). The central block covers the card.
const PRISM_LAYOUT = [
  { x: 0, z: 0.05, r: 0.5, h: 1.25, tilt: 0, lean: 4, sides: 5, delay: 0 },
  {
    x: -0.22,
    z: -0.25,
    r: 0.28,
    h: 1.55,
    tilt: -6,
    lean: -4,
    sides: 4,
    delay: 0.1,
  },
  {
    x: 0.2,
    z: -0.3,
    r: 0.26,
    h: 1.45,
    tilt: 8,
    lean: -4,
    sides: 4,
    delay: 0.16,
  },
  {
    x: -0.6,
    z: 0,
    r: 0.33,
    h: 0.75,
    tilt: -28,
    lean: 0,
    sides: 4,
    delay: 0.22,
  },
  {
    x: 0.62,
    z: -0.05,
    r: 0.31,
    h: 0.8,
    tilt: 30,
    lean: 0,
    sides: 5,
    delay: 0.28,
  },
  {
    x: -0.92,
    z: 0.1,
    r: 0.25,
    h: 0.45,
    tilt: -55,
    lean: 6,
    sides: 4,
    delay: 0.36,
  },
  {
    x: 0.92,
    z: 0.12,
    r: 0.26,
    h: 0.5,
    tilt: 52,
    lean: 6,
    sides: 4,
    delay: 0.4,
  },
  {
    x: -0.32,
    z: 0.38,
    r: 0.22,
    h: 0.4,
    tilt: -20,
    lean: 14,
    sides: 5,
    delay: 0.46,
  },
  {
    x: 0.34,
    z: 0.4,
    r: 0.2,
    h: 0.35,
    tilt: 24,
    lean: 14,
    sides: 4,
    delay: 0.52,
  },
];

const GLITTER_COLOURS = [
  'white',
  'white',
  'white',
  'white',
  'white',
  'ice',
  'ice',
  'pink',
  'deep',
  'deep',
];
const GLITTER_PER_FACE = { side: 24, bevel: 8, top: 14 };
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

/** Seeded glitter specks inside a face: a fan triangle and barycentric weights. */
function faceGlitter(rand, vertexCount, count) {
  return Array.from({ length: count }, () => {
    let u = rand();
    let v = rand();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    return {
      tri: 1 + Math.floor(rand() * (vertexCount - 2)),
      u,
      v,
      colour: pick(rand, GLITTER_COLOURS),
      size: 0.5 + rand(),
      phase: rand() * TAU,
    };
  });
}

/**
 * One crystal block in its own frame (base on y = 0): a prism with a slanted,
 * bevelled top. Side walls stand straight on the base ring and the bevel ring
 * is the top ring shrunk toward a point above it, so every face is planar.
 */
function buildPrism(layout, rand) {
  const { r, h, sides } = layout;
  const spin = rand() * TAU;
  const step = TAU / sides;
  const slope = 0.1 + rand() * 0.25;
  const slopeDir = rand() * TAU;
  const bevel = r * (0.12 + rand() * 0.1);
  const inset = 0.68 + rand() * 0.1;
  const topAt = (x, z) =>
    h + slope * (x * Math.cos(slopeDir) + z * Math.sin(slopeDir));
  const ring = Array.from({ length: sides }, (_, i) => {
    const angle = spin + i * step + (rand() - 0.5) * step * 0.3;
    const radius = r * (0.9 + rand() * 0.2);
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  const vertices = [
    ...ring.map(([x, z]) => [x, 0, z]),
    ...ring.map(([x, z]) => [x, topAt(x, z), z]),
    ...ring.map(([x, z]) => [
      x * inset,
      topAt(x * inset, z * inset) + bevel,
      z * inset,
    ]),
  ];
  const faces = [];
  const face = (kind, idx) =>
    faces.push({
      kind,
      idx,
      tone: rand(),
      glitter: faceGlitter(rand, idx.length, GLITTER_PER_FACE[kind]),
    });
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    face('side', [i, j, sides + j, sides + i]);
    face('bevel', [sides + i, sides + j, 2 * sides + j, 2 * sides + i]);
  }
  face(
    'top',
    ring.map((_, i) => 2 * sides + i)
  );
  return { ...layout, vertices, faces };
}

/** Everything random about one Tera entry, fixed by `seed`. */
export function buildTeraScene(seed = 1) {
  const rand = seededRandom(seed);
  const count = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  return {
    prisms: PRISM_LAYOUT.map((layout) => buildPrism(layout, rand)),
    trail: count(26, () => ({
      along: rand(),
      dx: rand() - 0.5,
      size: 0.5 + rand(),
      phase: rand() * TAU,
    })),
    rays: count(14, (i) => ({
      angle: (i / 14) * TAU + (rand() - 0.5) * 0.3,
      width: 0.02 + rand() * 0.035,
      length: 2.2 + rand() * 1.3,
    })),
    dashes: count(36, () => ({
      angle: rand() * TAU,
      start: rand() * 0.5,
      speed: 0.5 + rand() * 0.8,
      length: 0.08 + rand() * 0.2,
      colour: pick(rand, ['lime', 'white', 'cyan']),
    })),
    jewelLines: count(48, () => ({
      angle: rand() * TAU,
      inner: 0.9 + rand() * 0.3,
      outer: 1.4 + rand() * 1.4,
    })),
    beams: count(5, (i) => ({
      x: (i - 2) * 0.32 + (rand() - 0.5) * 0.12,
      angle: (i - 2) * 14 + (rand() - 0.5) * 10,
      width: 0.08 + rand() * 0.1,
      length: 1.8 + rand() * 1.2,
    })),
    floor: count(160, () => {
      const angle = rand() * TAU;
      const distance = Math.sqrt(rand());
      return {
        u: Math.cos(angle) * distance,
        v: Math.sin(angle) * distance,
        size: 0.4 + rand(),
        phase: rand() * TAU,
      };
    }),
    spray: count(44, () => ({
      angle: -(10 + rand() * 160) * DEG,
      speed: 0.4 + rand() * 0.9,
      length: 0.06 + rand() * 0.14,
      colour: pick(rand, ['cyan', 'white', 'violet', 'ice']),
      delay: rand() * 0.3,
    })),
    glints: count(6, () => ({
      x: (rand() - 0.5) * 1.6,
      y: -0.2 + rand(),
      phase: rand() * TAU,
      size: 0.18 + rand() * 0.16,
    })),
    shards: count(42, () => ({
      angle: rand() * TAU,
      speed: 0.35 + rand() * 0.9,
      length: 0.1 + rand() * 0.22,
      width: 0.02 + rand() * 0.04,
      spin: (rand() - 0.5) * 6,
      colour: pick(rand, ['white', 'ice', 'cyan']),
    })),
  };
}

// ---- projection ----

const PITCH = 12 * DEG;
const CAMERA = 6;
const CAMERA_POS = [0, 0, CAMERA];
const LIGHT_DIR = normalize([-0.35, 0.75, 0.55]);

const viewPoint = (p, yaw) => rotateX(rotateY(p, yaw), PITCH);

/** Screen position of view-space point `p`: nearer points spread out. */
export function projectPoint(p, { cx, cy, unit }) {
  const k = CAMERA / (CAMERA - p[2]);
  return [cx + p[0] * unit * k, cy - p[1] * unit * k, p[2]];
}

/** How far (0..~1.1, overshooting) a block has grown at grow progress `grow`. */
export const prismGrowth = (prism, grow) =>
  easeOutBack(span(grow, prism.delay, prism.delay + PRISM_GROW));

function placePrism(prism, grow, yaw) {
  const growth = prismGrowth(prism, grow);
  if (!(growth > 0)) return null;
  const widen = 0.55 + 0.45 * growth;
  const view = prism.vertices.map(([x, y, z]) => {
    const local = rotateX(
      rotateZ([x * widen, y * growth, z * widen], -prism.tilt * DEG),
      prism.lean * DEG
    );
    return viewPoint(add(local, [prism.x, BASE_Y, prism.z]), yaw);
  });
  return { prism, view, centre: centroid(view) };
}

/** Newell's normal of a planar polygon, turned to point away from `inside`. */
function faceNormal(points, inside) {
  let n = [0, 0, 0];
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    n = add(n, [
      (p[1] - q[1]) * (p[2] + q[2]),
      (p[2] - q[2]) * (p[0] + q[0]),
      (p[0] - q[0]) * (p[1] + q[1]),
    ]);
  });
  n = normalize(n);
  return dot(n, sub(centroid(points), inside)) < 0 ? scale(n, -1) : n;
}

// ---- drawing ----

/**
 * Draw one frame of the Tera entry at t in [0, 1]. `ctx` is a 2D context in
 * CSS pixels, (cx, cy) the card centre, `unit` the card height in the same
 * pixels, `card` its size, `scene` from `buildTeraScene` and `palette` from
 * `teraPaletteFor` (the Pokémon's type).
 */
export function drawTeraEntry(
  ctx,
  t,
  { cx, cy, unit, card, scene, palette = TERA_PALETTE }
) {
  if (!(unit > 0) || !scene) return;
  const pose = teraEntryPose(t);
  const g = {
    cx,
    cy,
    unit,
    cardW: card?.width > 0 ? card.width : unit * CARD_ASPECT,
    cardH: card?.height > 0 ? card.height : unit,
    palette,
  };
  ctx.save();
  drawRainbow(ctx, pose, g);
  drawFlash(ctx, pose, scene, g);
  drawFloor(ctx, pose, scene, g);
  drawBeams(ctx, pose, scene, g);
  drawSilhouette(ctx, pose, g);
  drawCluster(ctx, pose, scene, g);
  drawClusterGlints(ctx, pose, scene, g);
  drawSpray(ctx, pose, scene, g);
  drawJewel(ctx, pose, scene, g);
  drawOrb(ctx, pose, scene, g);
  drawWhiteout(ctx, pose, g);
  drawBurst(ctx, pose, scene, g);
  drawReveal(ctx, pose, g);
  ctx.restore();
}

function tracePolygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1)
    ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

function fillCircle(ctx, x, y, radius, style) {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

/** A radial glow of `rgb` fading from `alpha` at the centre to nothing. */
function glow(ctx, x, y, radius, rgb, alpha) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, rgba(rgb, alpha));
  grad.addColorStop(0.45, rgba(rgb, alpha * 0.4));
  grad.addColorStop(1, rgba(rgb, 0));
  fillCircle(ctx, x, y, radius, grad);
}

/** A thin diamond along the x axis, centred on the origin. */
function traceDiamond(ctx, length, width) {
  ctx.beginPath();
  ctx.moveTo(-length, 0);
  ctx.lineTo(0, -width);
  ctx.lineTo(length, 0);
  ctx.lineTo(0, width);
  ctx.closePath();
}

/** A four-point star glint with long rays and a soft core. */
function drawStarGlint(ctx, pal, x, y, size, alpha, turn = 0) {
  if (!(alpha > 0) || !(size > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.globalAlpha *= alpha;
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 0, size * 0.4, pal.ice, 0.9);
  ctx.fillStyle = rgba(pal.white, 1);
  traceDiamond(ctx, size, size * 0.04);
  ctx.fill();
  ctx.rotate(Math.PI / 2);
  traceDiamond(ctx, size, size * 0.04);
  ctx.fill();
  ctx.rotate(Math.PI / 4);
  traceDiamond(ctx, size * 0.4, size * 0.03);
  ctx.fill();
  ctx.rotate(Math.PI / 2);
  traceDiamond(ctx, size * 0.4, size * 0.03);
  ctx.fill();
  ctx.restore();
}

/** Stroke many segments of one colour as a single path. */
function strokeSegments(ctx, segments, style, width) {
  if (!segments.length) return;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of segments) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
}

const polar = (x, y, angle, radius) => [
  x + Math.cos(angle) * radius,
  y + Math.sin(angle) * radius,
];

/** The Tera Orb falling onto the Pokémon in a blue, violet and red starburst. */
function drawOrb(ctx, pose, scene, g) {
  const pal = g.palette;
  if (!(pose.orb > 0)) return;
  const { cx, cy, unit } = g;
  const startY = cy - unit * 2.6;
  const y = lerp(startY, cy - unit * 0.45, pose.orbDrop);
  const r = unit * 0.13;
  const time = pose.time;
  ctx.save();
  ctx.globalAlpha *= pose.orb;
  ctx.globalCompositeOperation = 'lighter';

  const trail = Math.min(unit * 1.6, y - startY);
  ctx.fillStyle = rgba(pal.white, 0.9);
  for (const s of scene.trail) {
    const twinkle = 0.5 + 0.5 * Math.sin(time * 20 + s.phase);
    const size = unit * 0.014 * s.size * twinkle * (1 - s.along);
    if (!(size > 0) || !(trail > 0)) continue;
    ctx.fillRect(
      cx + s.dx * unit * 0.3 * s.along - size / 2,
      y - s.along * trail - size / 2,
      size,
      size
    );
  }

  glow(ctx, cx, y, r * 4.5, [70, 90, 255], 0.75);
  const spikeColours = [[70, 110, 255], pal.violet, pal.red];
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * TAU + time * 0.8;
    const down = Math.max(0, Math.sin(a));
    const length = r * (1.8 + 1.4 * down + 0.5 * Math.sin(time * 23 + i * 1.7));
    const [tx, ty] = polar(cx, y, a, length);
    const [lx, ly] = polar(cx, y, a + Math.PI / 2, r * 0.16);
    const [rx, ry] = polar(cx, y, a - Math.PI / 2, r * 0.16);
    const grad = ctx.createLinearGradient(cx, y, tx, ty);
    grad.addColorStop(0, rgba(pal.white, 0.9));
    grad.addColorStop(0.4, rgba(spikeColours[i % 3], 0.8));
    grad.addColorStop(1, rgba(spikeColours[i % 3], 0));
    ctx.fillStyle = grad;
    tracePolygon(ctx, [
      [lx, ly],
      [tx, ty],
      [rx, ry],
    ]);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
  const body = ctx.createRadialGradient(cx - r * 0.3, y - r * 0.3, 0, cx, y, r);
  body.addColorStop(0, rgba([70, 80, 170], 1));
  body.addColorStop(1, rgba([12, 14, 50], 1));
  fillCircle(ctx, cx, y, r, body);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(pal.cyan, 0.95);
  ctx.lineWidth = r * 0.2;
  ctx.beginPath();
  ctx.ellipse(cx, y, r * 0.92, r * 0.32, 0, 0, TAU);
  ctx.stroke();
  glow(ctx, cx - r * 0.35, y - r * 0.4, r * 0.35, pal.white, 0.9);
  ctx.restore();
}

/** The screen-wide flash: lime to teal, with white rays and speed dashes. */
function drawFlash(ctx, pose, scene, g) {
  const pal = g.palette;
  if (!(pose.flash > 0)) return;
  const { cx, unit } = g;
  const fy = g.cy - unit * 0.35;
  const reach = unit * 3.4;
  ctx.save();
  ctx.globalAlpha *= pose.flash;
  const edge = mixRgb(pal.lime, pal.teal, pose.flashTeal);
  const wash = ctx.createRadialGradient(cx, fy, 0, cx, fy, reach);
  wash.addColorStop(0, rgba([255, 255, 240], 0.95));
  wash.addColorStop(0.18, rgba(mixRgb(edge, pal.white, 0.5), 0.9));
  wash.addColorStop(0.6, rgba(edge, 0.82));
  wash.addColorStop(1, rgba(edge, 0));
  fillCircle(ctx, cx, fy, reach, wash);

  ctx.globalCompositeOperation = 'lighter';
  const spin = pose.flashTeal * 0.25;
  for (const ray of scene.rays) {
    const a = ray.angle + spin;
    const length = unit * ray.length;
    const [tx, ty] = polar(cx, fy, a, length);
    const grad = ctx.createLinearGradient(cx, fy, tx, ty);
    grad.addColorStop(0, rgba(pal.white, 0.9));
    grad.addColorStop(1, rgba(pal.white, 0));
    ctx.fillStyle = grad;
    tracePolygon(ctx, [
      [cx, fy],
      polar(cx, fy, a - ray.width, length),
      polar(cx, fy, a + ray.width, length),
    ]);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  for (const colour of ['lime', 'white', 'cyan']) {
    const segments = scene.dashes
      .filter((d) => d.colour === colour)
      .map((d) => {
        const inner =
          unit * (0.4 + (d.start + d.speed * pose.flashTravel) * 2.8);
        const outer = inner + unit * d.length * (0.4 + pose.flashTravel);
        return [
          ...polar(cx, fy, d.angle, inner),
          ...polar(cx, fy, d.angle, outer),
        ];
      });
    strokeSegments(ctx, segments, rgba(pal[colour], 0.9), unit * 0.018);
  }
  ctx.restore();
}

/** Six-point star with a tall hexagonal window: the Tera Jewel. */
function traceJewel(ctx, x, y, R) {
  ctx.beginPath();
  for (let i = 0; i < 12; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 6;
    const [px, py] = polar(x, y, a, i % 2 ? R * 0.5 : R);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const hole = [
    [0, -0.3],
    [0.14, -0.14],
    [0.14, 0.14],
    [0, 0.3],
    [-0.14, 0.14],
    [-0.14, -0.14],
  ];
  hole.forEach(([hx, hy], i) => {
    if (i === 0) ctx.moveTo(x + hx * R, y + hy * R);
    else ctx.lineTo(x + hx * R, y + hy * R);
  });
  ctx.closePath();
}

/** The Tera Jewel over the Pokémon: white-hot, then teal, then dark as it fades. */
function drawJewel(ctx, pose, scene, g) {
  const pal = g.palette;
  if (!(pose.jewel > 0)) return;
  const R = g.unit * 0.72 * pose.jewelScale;
  if (!(R > 0)) return;
  const { cx, unit } = g;
  const y = g.cy - unit * 0.3;
  const heat = pose.jewelHeat;
  ctx.save();
  ctx.globalAlpha *= pose.jewel;
  ctx.globalCompositeOperation = 'lighter';
  strokeSegments(
    ctx,
    scene.jewelLines.map((line) => [
      ...polar(cx, y, line.angle, R * line.inner),
      ...polar(cx, y, line.angle, R * line.outer),
    ]),
    rgba(pal.white, 0.2 + 0.6 * heat),
    Math.max(1, unit * 0.006)
  );
  if (pose.streaks > 0) {
    const streaks = [
      [0, 2.8, 0.035],
      [0.16, 1.9, 0.018],
      [-0.12, 1.5, 0.014],
      [0.34, 2.3, 0.012],
    ];
    for (const [dy, length, width] of streaks) {
      const sy = y + dy * unit;
      const half = length * unit;
      const grad = ctx.createLinearGradient(cx - half, sy, cx + half, sy);
      grad.addColorStop(0, rgba(pal.cyan, 0));
      grad.addColorStop(0.5, rgba(pal.white, 0.95 * pose.streaks));
      grad.addColorStop(1, rgba(pal.cyan, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(cx - half, sy - (width * unit) / 2, half * 2, width * unit);
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  const hot = mixRgb(pal.teal, pal.white, 0.85);
  const fill =
    heat > 0.5
      ? mixRgb(pal.teal, hot, (heat - 0.5) * 2)
      : mixRgb([34, 58, 96], pal.teal, heat * 2);
  const halo = heat > 0.5 ? pal.lime : pal.teal;
  ctx.shadowColor = rgba(halo, 0.9 * heat);
  ctx.shadowBlur = unit * 0.25 * heat;
  const body = ctx.createLinearGradient(cx, y - R, cx, y + R);
  body.addColorStop(0, rgba(mixRgb(fill, pal.white, 0.35), 1));
  body.addColorStop(1, rgba(mixRgb(fill, [20, 40, 70], 0.3), 1));
  ctx.fillStyle = body;
  traceJewel(ctx, cx, y, R);
  ctx.fill('evenodd');
  ctx.shadowBlur = 0;
  // Facet creases from the centre to every point and notch.
  const creases = [];
  for (let i = 0; i < 12; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 6;
    creases.push([
      ...polar(cx, y, a, R * 0.3),
      ...polar(cx, y, a, i % 2 ? R * 0.5 : R),
    ]);
  }
  strokeSegments(ctx, creases, rgba(pal.white, 0.45), Math.max(1, R * 0.015));
  ctx.strokeStyle = rgba(mixRgb(halo, pal.white, 0.5), 0.9);
  ctx.lineWidth = Math.max(1, R * 0.025);
  traceJewel(ctx, cx, y, R);
  ctx.stroke();
  ctx.restore();
}

/** The glitter floor the crystal grows from. */
function drawFloor(ctx, pose, scene, g) {
  const pal = g.palette;
  if (!(pose.floor > 0)) return;
  const [fx, fy] = projectPoint(viewPoint([0, BASE_Y, 0], 0), g);
  const rx = g.unit * 1.7;
  const ry = rx * Math.sin(PITCH);
  ctx.save();
  ctx.globalAlpha *= pose.floor;
  ctx.globalCompositeOperation = 'lighter';
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(1, ry / rx);
  glow(ctx, 0, 0, rx, pal.ice, 0.75);
  ctx.restore();
  ctx.fillStyle = rgba(pal.white, 0.95);
  for (const s of scene.floor) {
    const twinkle = 0.5 + 0.5 * Math.sin(pose.time * 9 + s.phase);
    const size = g.unit * 0.02 * s.size * twinkle;
    if (!(size > 0)) continue;
    ctx.fillRect(
      fx + s.u * rx - size / 2,
      fy + s.v * ry - size / 2,
      size,
      size
    );
  }
  ctx.restore();
}

/** Teal light beams rising from the floor round the white silhouette. */
function drawBeams(ctx, pose, scene, g) {
  const pal = g.palette;
  if (!(pose.beams > 0)) return;
  const [, fy] = projectPoint(viewPoint([0, BASE_Y, 0], 0), g);
  const { cx, unit } = g;
  ctx.save();
  ctx.globalAlpha *= pose.beams;
  ctx.globalCompositeOperation = 'lighter';
  for (const beam of scene.beams) {
    const a = -Math.PI / 2 + beam.angle * DEG;
    const bx = cx + beam.x * unit;
    const length = beam.length * unit;
    const [tx, ty] = polar(bx, fy, a, length);
    const across = a + Math.PI / 2;
    const base = beam.width * unit * 0.5;
    const grad = ctx.createLinearGradient(bx, fy, tx, ty);
    grad.addColorStop(0, rgba(pal.teal, 0.6));
    grad.addColorStop(1, rgba(pal.teal, 0));
    ctx.fillStyle = grad;
    tracePolygon(ctx, [
      polar(bx, fy, across, base),
      polar(tx, ty, across, base * 1.6),
      polar(tx, ty, across, -base * 1.6),
      polar(bx, fy, across, -base),
    ]);
    ctx.fill();
  }
  ctx.restore();
}

function traceRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The card turned to glowing white light, before the crystal closes over it. */
function drawSilhouette(ctx, pose, g) {
  const pal = g.palette;
  if (!(pose.silhouette > 0)) return;
  ctx.save();
  ctx.globalAlpha *= pose.silhouette;
  ctx.shadowColor = rgba(pal.ice, 0.95);
  ctx.shadowBlur = g.unit * 0.3;
  ctx.fillStyle = rgba(pal.white, 1);
  traceRoundRect(
    ctx,
    g.cx - g.cardW / 2,
    g.cy - g.cardH / 2,
    g.cardW,
    g.cardH,
    g.cardW * 0.045
  );
  ctx.fill();
  ctx.restore();
}

function crystalShade(pal, normal, tone, shine) {
  const { deep, ice, white } = pal;
  const lambert = Math.max(0, dot(normal, LIGHT_DIR));
  const facing = Math.max(0, normal[2]);
  const ramp = clamp01(
    0.46 + 0.5 * lambert + 0.15 * facing + 0.25 * (tone - 0.5)
  );
  const base =
    ramp < 0.5
      ? mixRgb(deep, ice, ramp / 0.5)
      : mixRgb(ice, white, (ramp - 0.5) / 0.5);
  return mixRgb(base, white, 0.85 * shine);
}

function fillFace(ctx, pal, poly, rgb) {
  let top = poly[0];
  let bottom = poly[0];
  for (const p of poly) {
    if (p[1] < top[1]) top = p;
    if (p[1] > bottom[1]) bottom = p;
  }
  const grad = ctx.createLinearGradient(top[0], top[1], bottom[0], bottom[1]);
  grad.addColorStop(0, rgba(mixRgb(rgb, pal.white, 0.4), 0.93));
  grad.addColorStop(1, rgba(mixRgb(rgb, pal.deep, 0.2), 0.87));
  ctx.fillStyle = grad;
  tracePolygon(ctx, poly);
  ctx.fill();
}

/** White edges with pink and cyan fringes either side, like cut glass. */
function strokeFaceEdges(ctx, pal, poly, unit, shine) {
  const fringe = unit * 0.006;
  ctx.lineWidth = Math.max(1, unit * 0.007);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(pal.pink, 0.35);
  tracePolygon(
    ctx,
    poly.map(([x, y]) => [x + fringe, y])
  );
  ctx.stroke();
  ctx.strokeStyle = rgba(pal.cyan, 0.35);
  tracePolygon(
    ctx,
    poly.map(([x, y]) => [x - fringe, y])
  );
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = rgba(pal.white, 0.7 * (1 - 0.5 * shine));
  tracePolygon(ctx, poly);
  ctx.stroke();
}

function drawPrism(ctx, placed, pose, g) {
  const pal = g.palette;
  const { prism, view, centre } = placed;
  const screen = view.map((p) => projectPoint(p, g));
  const specks = { white: [], ice: [], pink: [], deep: [] };
  for (const face of prism.faces) {
    const points = face.idx.map((i) => view[i]);
    const normal = faceNormal(points, centre);
    if (dot(normal, sub(CAMERA_POS, centroid(points))) <= 0) continue;
    const poly = face.idx.map((i) => screen[i]);
    fillFace(
      ctx,
      g.palette,
      poly,
      crystalShade(g.palette, normal, face.tone, pose.shine)
    );
    strokeFaceEdges(ctx, g.palette, poly, g.unit, pose.shine);
    for (const s of face.glitter) {
      const [a, b, c] = [poly[0], poly[s.tri], poly[s.tri + 1]];
      const w = 1 - s.u - s.v;
      const twinkle =
        0.35 + 0.65 * (0.5 + 0.5 * Math.sin(pose.time * 7 + s.phase));
      specks[s.colour].push([
        w * a[0] + s.u * b[0] + s.v * c[0],
        w * a[1] + s.u * b[1] + s.v * c[1],
        g.unit * 0.028 * s.size * twinkle,
      ]);
    }
  }
  for (const [colour, list] of Object.entries(specks)) {
    if (!list.length) continue;
    ctx.fillStyle = rgba(pal[colour], colour === 'deep' ? 0.7 : 0.9);
    ctx.beginPath();
    for (const [x, y, size] of list) {
      ctx.moveTo(x - size, y);
      ctx.lineTo(x, y - size * 0.6);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size * 0.6);
      ctx.closePath();
    }
    ctx.fill();
  }
}

/** The crystal cluster: blocks grow from the floor, back to front, and brighten. */
function drawCluster(ctx, pose, scene, g) {
  const pal = g.palette;
  if (!(pose.cluster > 0)) return;
  const yaw = pose.yaw * DEG;
  const placed = scene.prisms
    .map((prism) => placePrism(prism, pose.grow, yaw))
    .filter(Boolean)
    .sort((a, b) => a.centre[2] - b.centre[2]);
  if (!placed.length) return;
  ctx.save();
  ctx.globalAlpha *= pose.cluster;
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, g.cx, g.cy, g.unit * 1.5, pal.ice, 0.45);
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineJoin = 'round';
  for (const prism of placed) drawPrism(ctx, prism, pose, g);
  if (pose.shine > 0) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, g.cx, g.cy, g.unit * 1.4, pal.white, 0.7 * pose.shine);
  }
  ctx.restore();
}

function drawClusterGlints(ctx, pose, scene, g) {
  if (!(pose.glints > 0)) return;
  for (const glint of scene.glints) {
    const twinkle = Math.max(0, Math.sin(pose.time * 5 + glint.phase));
    drawStarGlint(
      ctx,
      g.palette,
      g.cx + glint.x * g.unit,
      g.cy - glint.y * g.unit,
      g.unit * glint.size * twinkle,
      pose.glints * twinkle
    );
  }
}

/** Glitter sprayed up and out as the crystal forms. */
function drawSpray(ctx, pose, scene, g) {
  const pal = g.palette;
  if (!(pose.spray > 0)) return;
  const { cx, unit } = g;
  const oy = g.cy - unit * 0.05;
  ctx.save();
  ctx.globalAlpha *= pose.spray;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const colour of ['cyan', 'white', 'violet', 'ice']) {
    const segments = [];
    for (const d of scene.spray) {
      if (d.colour !== colour) continue;
      const travel = clamp01((pose.sprayTravel - d.delay) / (1 - d.delay));
      if (!(travel > 0)) continue;
      const inner = unit * (0.35 + d.speed * 2.4 * travel);
      const outer = inner + unit * d.length * (1.4 - travel);
      segments.push([
        ...polar(cx, oy, d.angle, inner),
        ...polar(cx, oy, d.angle, outer),
      ]);
    }
    strokeSegments(ctx, segments, rgba(pal[colour], 0.85), unit * 0.016);
  }
  ctx.restore();
}

// Behind the cluster: angle from straight up (deg) and colour of each beam.
const RAINBOW_BEAMS = [
  [-78, 'pink'],
  [-55, 'violet'],
  [-32, 'cyan'],
  [-8, 'white'],
  [20, 'white'],
  [42, 'cyan'],
  [63, 'teal'],
  [82, 'pink'],
];

/** Pastel light beams fanning out behind the cluster, in a violet haze. */
function drawRainbow(ctx, pose, g) {
  const pal = g.palette;
  if (!(pose.rainbow > 0)) return;
  const { cx, unit } = g;
  const oy = g.cy + unit * 0.25;
  const reach = unit * 3.4;
  ctx.save();
  ctx.globalAlpha *= pose.rainbow;
  glow(ctx, cx, oy, unit * 2.8, pal.violet, 0.4);
  ctx.globalCompositeOperation = 'lighter';
  RAINBOW_BEAMS.forEach(([angle, colour], i) => {
    const a = -Math.PI / 2 + (angle + 4 * Math.sin(pose.time * 1.5 + i)) * DEG;
    const half = (7 + (i % 3)) * DEG;
    const grad = ctx.createRadialGradient(cx, oy, 0, cx, oy, reach);
    grad.addColorStop(0.1, rgba(pal[colour], 0));
    grad.addColorStop(0.3, rgba(pal[colour], 0.75));
    grad.addColorStop(1, rgba(pal[colour], 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, oy);
    ctx.arc(cx, oy, reach, a - half, a + half);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

function drawWhiteout(ctx, pose, g) {
  const pal = g.palette;
  if (!(pose.whiteout > 0)) return;
  const radius = g.unit * (1.2 + 2.2 * pose.whiteout);
  const grad = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, radius);
  grad.addColorStop(0, rgba(pal.white, pose.whiteout));
  grad.addColorStop(0.5, rgba(pal.white, 0.95 * pose.whiteout));
  grad.addColorStop(1, rgba(pal.white, 0));
  fillCircle(ctx, g.cx, g.cy, radius, grad);
}

const RING_COLOURS = [
  [255, 90, 120],
  [255, 210, 90],
  [140, 255, 140],
  [90, 230, 255],
  [80, 120, 255],
  [190, 110, 255],
];

function strokeRainbowRing(ctx, x, y, radius, band, alpha) {
  if (!(alpha > 0) || !(radius > 0)) return;
  ctx.lineWidth = band;
  RING_COLOURS.forEach((rgb, i) => {
    ctx.strokeStyle = rgba(rgb, alpha);
    ctx.beginPath();
    ctx.arc(x, y, radius + (i - 2.5) * band, 0, TAU);
    ctx.stroke();
  });
}

/** A thin, pointed sliver of crystal centred on (x, y). */
function traceSliver(ctx, x, y, angle, length, width) {
  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(x - (ax * length) / 2, y - (ay * length) / 2);
  ctx.lineTo(
    x - (ay * width) / 2 + ax * length * 0.1,
    y + (ax * width) / 2 + ay * length * 0.1
  );
  ctx.lineTo(x + (ax * length) / 2, y + (ay * length) / 2);
  ctx.lineTo(
    x + (ay * width) / 2 - ax * length * 0.15,
    y - (ax * width) / 2 - ay * length * 0.15
  );
  ctx.closePath();
}

/** The burst: a crystal-coloured glow, shards flying out with colour fringes, rainbow rings. */
function drawBurst(ctx, pose, scene, g) {
  const pal = g.palette;
  if (!(pose.burst > 0)) return;
  const { cx, cy, unit } = g;
  const travel = pose.burstTravel;
  ctx.save();
  ctx.globalAlpha *= pose.burst;
  const radius = unit * (1 + 1.3 * travel);
  const disc = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  disc.addColorStop(0, rgba(pal.ice, 0.3));
  disc.addColorStop(0.55, rgba(mixRgb(pal.cyan, pal.deep, 0.5), 0.75));
  disc.addColorStop(0.85, rgba(pal.deep, 0.45));
  disc.addColorStop(1, rgba(pal.deep, 0));
  fillCircle(ctx, cx, cy, radius, disc);

  ctx.globalCompositeOperation = 'lighter';
  const band = unit * 0.022;
  strokeRainbowRing(
    ctx,
    cx,
    cy,
    unit * (0.9 + 2.3 * travel),
    band,
    0.8 * (1 - travel)
  );
  strokeRainbowRing(
    ctx,
    cx,
    cy,
    unit * (0.6 + 1.9 * easeOutCubic(span(travel, 0.12, 1))),
    band * 0.7,
    0.6 * (1 - travel)
  );

  const fade = 1 - travel ** 2;
  for (const shard of scene.shards) {
    const distance = unit * (0.3 + shard.speed * 2.8 * travel);
    const [x, y] = polar(cx, cy, shard.angle, distance);
    const turn = shard.angle + shard.spin * travel;
    const length = unit * shard.length;
    const width = unit * shard.width;
    const fringe = unit * 0.012;
    ctx.fillStyle = rgba(pal.pink, 0.55 * fade);
    traceSliver(ctx, x + fringe, y, turn, length, width);
    ctx.fill();
    ctx.fillStyle = rgba(pal.cyan, 0.55 * fade);
    traceSliver(ctx, x - fringe, y, turn, length, width);
    ctx.fill();
    ctx.fillStyle = rgba(pal[shard.colour], 0.9 * fade);
    traceSliver(ctx, x, y, turn, length, width);
    ctx.fill();
  }
  ctx.restore();
}

// Where glints twinkle round the revealed card: fractions of the card from its
// top-left corner, and a stagger.
const REVEAL_GLINTS = [
  [-0.08, 0.12, 0],
  [1.04, 0.3, 0.12],
  [0.86, 1.02, 0.22],
  [-0.02, 0.78, 0.32],
  [0.5, -0.06, 0.4],
];

function drawReveal(ctx, pose, g) {
  if (!(pose.reveal > 0)) return;
  const left = g.cx - g.cardW / 2;
  const top = g.cy - g.cardH / 2;
  for (const [fx, fy, lag] of REVEAL_GLINTS) {
    const local = span(pose.revealTravel, lag, lag + 0.5);
    const pop = Math.sin(Math.PI * local);
    drawStarGlint(
      ctx,
      g.palette,
      left + g.cardW * fx,
      top + g.cardH * fy,
      g.cardW * 0.32 * pop,
      pose.reveal * pop,
      (Math.PI / 4) * local
    );
  }
}
