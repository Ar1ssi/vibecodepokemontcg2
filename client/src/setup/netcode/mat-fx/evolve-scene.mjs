// Design 041: the evolution scene for every evolution that is not Mega or Tera,
// after Scarlet/Violet. A light-blue nebula irises open round the Pokémon, which
// glows pearly white as pairs of light beads rise past it and bokeh drifts out;
// at the surge's peak the pearl card becomes the evolved one, which drains from
// white as glitter twinkles, still inside the nebula. The whole scene stays in
// the nebula's blue and frost: no whiteout, no starburst, no change of backdrop.
// DOM-free: the timeline, scene and layer poses are pure, and the two draw
// functions only use the 2D context passed in, so it all runs under node --test.
// The scene is drawn on two canvases that sandwich the card images
// (evolve-scene.js): beads behind the card go on the back one.
import { seededRandom } from './flow-pose.mjs';

// The glow hold: once the evolved card has flipped front, still white, the card,
// halo and nebula stay put for GLOW_HOLD_MS before it drops back onto its slot.
// The rest plays on a 3.2 s clock, so the flare still peaks 2.05 s in (the
// score's FLARE_S) however long the hold is.
const GLOW_HOLD_MS = 300;
const CARD_CLOCK_MS = 3200;
export const EVOLVE_SCENE_MS = CARD_CLOCK_MS + GLOW_HOLD_MS;
// The surge's peak: the pearl-white old card hands over to the pearl-white new one.
export const EVOLVE_REVEAL_AT = 2048 / EVOLVE_SCENE_MS;
const HOLD_SHARE = GLOW_HOLD_MS / EVOLVE_SCENE_MS;
const SCENE_SPEED = 1 / (1 - HOLD_SHARE);
// Where the hold sits on the card clock: after the flip.
const HOLD_AT = 0.77;
const HOLD_START = HOLD_AT / SCENE_SPEED;
const CARD_REVEAL_AT = EVOLVE_REVEAL_AT * SCENE_SPEED;
// The canvas stages' side, in card heights: room for the bokeh and glow.
export const EVOLVE_STAGE = 4.2;

// Every light in the scene — glow, beads, glitter — is one family of
// slightly blue-tinted whites, as in the clip; nothing is pure white.
export const EVOLVE_PALETTE = {
  ink: [6, 16, 40],
  indigo: [22, 60, 132],
  violet: [58, 128, 214],
  magenta: [104, 186, 240],
  blue: [76, 150, 246],
  frost: [190, 214, 255],
  pearl: [226, 238, 255],
  white: [238, 246, 255],
};

const TAU = Math.PI * 2;
const CARD_ASPECT = 0.716;
// The old card's lift (card heights) and swell as it shines and surges; the
// new card starts from exactly there, so the hand-over shows no jump.
const CARD_LIFT = -0.05;
const CARD_SWELL = 0.06;
const SURGE_SWELL = 0.05;
// Depth: the lifted card leans back (degrees about X) and rocks side to side
// (about Y), then flips edge-on through the white hand-over so it reads as a
// solid card turning in space, not a flat sprite.
const CARD_LEAN = 12;
const CARD_ROCK = 10;
// How much pearl-blue glow stays over the evolved art once it clears.
const CARD_GLOW_REST = 0.45;
const clamp01 = (t) => (Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0);
const span = (t, a, b) => clamp01((t - a) / (b - a));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeInOutSine = (t) => (1 - Math.cos(Math.PI * t)) / 2;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const plateau = (t, a, b, c, d) => {
  if (t <= a || t >= d) return 0;
  if (t < b) return easeOutCubic(span(t, a, b));
  if (t <= c) return 1;
  return 1 - easeInCubic(span(t, c, d));
};
const lerp = (a, b, t) => a + (b - a) * t;
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;

// ---- timeline ----

/**
 * The card clock for scene fraction t: runs at SCENE_SPEED, stops at HOLD_AT
 * for HOLD_SHARE of the scene, then runs on to 1 at the end.
 */
export function cardClock(t) {
  const c = clamp01(t);
  if (c <= HOLD_START) return c * SCENE_SPEED;
  if (c <= HOLD_START + HOLD_SHARE) return HOLD_AT;
  return Math.min(1, HOLD_AT + (c - HOLD_START - HOLD_SHARE) * SCENE_SPEED);
}

/** Every layer's strength (0..1) and motion at t in [0, 1] of the scene. */
export function evolveScenePose(t) {
  const s = clamp01(t);
  const c = cardClock(s);
  // Flying layers never stop: beads and bokeh keep the unheld pace.
  const f = clamp01(s * SCENE_SPEED);
  return {
    nebula: plateau(c, 0, 0.07, 0.82, 0.98),
    iris: easeOutCubic(span(c, 0, 0.09)),
    stars: plateau(c, 0.02, 0.1, 0.8, 0.95),
    halo: plateau(c, 0.04, 0.24, 0.8, 0.96),
    beads: plateau(f, 0.12, 0.18, 0.58, 0.68),
    beadRise: span(f, 0.12, 0.68),
    bokeh: plateau(f, 0.4, 0.46, 0.74, 0.86),
    bokehTravel: span(f, 0.4, 0.86),
    glitter: plateau(s, 0.55, 0.62, 0.92, 1),
    glitterTime: span(s, 0.55, 1),
  };
}

/** Side-to-side rock (degrees about Y), fading out as the new card settles. */
const cardRock = (c) => {
  const u = span(c, 0.06, 0.86);
  return CARD_ROCK * Math.sin(TAU * u) * Math.sqrt(1 - u);
};

/** A band of light sweeping across the face: x in card widths, 0 when idle. */
const sheenPose = (c, from, to) => {
  const p = span(c, from, to);
  return { sheenX: lerp(-1.2, 1.2, easeInOutCubic(p)), sheen: Math.sin(Math.PI * p) };
};

/** Side shading from the turn: darker as the card faces away from the light. */
const shadeOf = (tiltY) => Math.min(1, Math.abs(Math.sin((tiltY * Math.PI) / 180)));

/**
 * The pre-evolution card: glows to pearl white, lifts and swells, and hands
 * over to the new card at the surge's peak. Without its art (no pre-diff
 * snapshot) it is a pearl card from the first frames, so the new art is never
 * spoiled.
 */
export function oldCardPose(t, { hasArt = true } = {}) {
  const c = cardClock(t);
  const lift = easeInOutCubic(span(c, 0.04, 0.5));
  const tiltY = cardRock(c) + 180 * easeInCubic(span(c, 0.5, CARD_REVEAL_AT));
  return {
    opacity: c < CARD_REVEAL_AT ? 1 : 0,
    white: hasArt ? easeInOutCubic(span(c, 0.06, 0.3)) : easeOutCubic(span(c, 0, 0.04)),
    scale: 1 + CARD_SWELL * lift + SURGE_SWELL * easeInCubic(span(c, 0.36, 0.62)),
    x: 0,
    y: CARD_LIFT * lift,
    tiltX: CARD_LEAN * lift,
    tiltY,
    shade: shadeOf(tiltY),
    ...sheenPose(c, 0.14, 0.4),
  };
}

/**
 * The evolved card: takes over, pearl white, from where the old card stood,
 * keeps its size through the flip (one settle, no second drop), clears to a
 * pale blue glow over its art, and dissolves into the real card as it drops
 * back onto its slot.
 */
export function newCardPose(t) {
  const c = cardClock(t);
  // Stays lifted through the hold, then eases slowly back down as it dissolves
  // into the real card: a gentle settle, never a fall.
  const settle = easeInOutSine(span(c, HOLD_AT, 1));
  // Finishes the flip from its back (-180deg, same as the old card's 180deg) to
  // face front while still white, so the swap and the mirrored back never show.
  const tiltY = cardRock(c) - 180 * (1 - easeOutCubic(span(c, CARD_REVEAL_AT, 0.74)));
  return {
    opacity: c < CARD_REVEAL_AT ? 0 : 1 - easeInCubic(span(c, 0.84, 1)),
    // Clears only part-way: the art shows through a pale blue glow to the end.
    white: 1 - (1 - CARD_GLOW_REST) * easeInOutCubic(span(c, HOLD_AT, 0.9)),
    scale: lerp(1 + CARD_SWELL + SURGE_SWELL, 1, settle),
    x: 0,
    y: lerp(CARD_LIFT, 0, settle),
    tiltX: lerp(CARD_LEAN, 0, settle),
    tiltY,
    shade: shadeOf(tiltY),
    ...sheenPose(c, 0.8, 0.94),
  };
}

/** Darkening of the rest of the screen while the nebula is up. */
export const stageDimPose = (t) => plateau(cardClock(t), 0, 0.1, 0.82, 0.98);

/**
 * Degrees a 2D CSS matrix turns its content, so card art in the overlay can
 * match a rotated board (the opponent's frame is turned 180°). A mirror is
 * not a turn: it reads as 0.
 */
export function turnOfMatrix(matrix) {
  const { a = 1, b = 0, c = 0, d = 1 } = matrix || {};
  if (![a, b, c, d].every(Number.isFinite) || a * d - b * c <= 0) return 0;
  const degrees = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  return degrees === -180 ? 180 : degrees;
}

// ---- scene ----

const between = (rand, lo, hi) => lo + rand() * (hi - lo);
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

/** Every random placement of one play-through, from `seed` (deterministic). */
export function buildEvolveScene(seed = 1) {
  const rand = seededRandom(seed);
  const P = EVOLVE_PALETTE;
  const cloudTints = [P.violet, P.indigo, P.magenta, P.blue, P.frost];
  const clouds = Array.from({ length: 22 }, () => ({
    angle: rand() * TAU,
    radius: Math.sqrt(rand()) * 0.95,
    size: between(rand, 0.25, 0.55),
    tint: pick(rand, cloudTints),
    alpha: between(rand, 0.22, 0.5),
    drift: between(rand, 0.08, 0.22) * (rand() < 0.75 ? 1 : -1),
  }));
  const stars = Array.from({ length: 36 }, () => ({
    angle: rand() * TAU,
    radius: between(rand, 0.3, 0.98),
    size: between(rand, 0.025, 0.07),
    phase: rand() * TAU,
    rate: between(rand, 3, 7),
  }));
  const beads = Array.from({ length: 16 }, () => ({
    x: between(rand, -0.8, 0.8),
    y: between(rand, 0.3, 0.65),
    rise: between(rand, 0.6, 1.05),
    start: rand() * 0.55,
    size: between(rand, 0.026, 0.05),
    gap: between(rand, 0.05, 0.09),
    phase: rand() * TAU,
    front: rand() < 0.55,
  }));
  const bokeh = Array.from({ length: 22 }, () => ({
    angle: rand() * TAU,
    delay: rand(),
    distance: between(rand, 0.45, 0.95),
    size: between(rand, 0.05, 0.14),
    tint: rand() < 0.5 ? P.frost : P.white,
  }));
  const glitter = Array.from({ length: 26 }, () => ({
    x: between(rand, -0.75, 0.75),
    y: between(rand, -0.65, 0.6),
    start: rand() * 0.7,
    life: between(rand, 0.18, 0.32),
    size: between(rand, 0.07, 0.18),
    turn: rand() * Math.PI,
  }));
  return { clouds, stars, beads, bokeh, glitter };
}

// ---- drawing ----

const geometryOf = ({ cx, cy, unit, card, scene, time, palette = EVOLVE_PALETTE }) => ({
  cx,
  cy,
  unit,
  cardW: card?.width > 0 ? card.width : unit * CARD_ASPECT,
  cardH: card?.height > 0 ? card.height : unit,
  scene,
  time: Number.isFinite(time) ? time : 0,
  palette,
});

const drawable = (g) =>
  g && g.unit > 0 && Number.isFinite(g.cx) && Number.isFinite(g.cy) && Boolean(g.scene);

/**
 * The layers behind the card at t in [0, 1]: nebula, stars, halo, and the
 * beads that pass behind it. `g` is
 * `{cx, cy, unit, card, scene, time}` in the canvas's CSS pixels: (cx, cy) the
 * card centre, `unit` the card height, `time` seconds (for twinkling).
 */
export function drawEvolveBack(ctx, t, g) {
  if (!ctx || !drawable(g)) return;
  const pose = evolveScenePose(t);
  const k = geometryOf(g);
  ctx.save();
  drawNebula(ctx, pose, k);
  drawHalo(ctx, pose, k);
  drawBeads(ctx, pose, k, false);
  ctx.restore();
}

/** The layers over the card: near beads, bokeh, glitter. */
export function drawEvolveFront(ctx, t, g) {
  if (!ctx || !drawable(g)) return;
  const pose = evolveScenePose(t);
  const k = geometryOf(g);
  ctx.save();
  drawBeads(ctx, pose, k, true);
  drawBokeh(ctx, pose, k);
  drawGlitter(ctx, pose, k);
  ctx.restore();
}

function fillCircle(ctx, x, y, radius, style) {
  if (!(radius > 0)) return;
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

/** A radial glow of `rgb` fading from `alpha` at the centre to nothing. */
function glow(ctx, x, y, radius, rgb, alpha) {
  if (!(radius > 0) || !(alpha > 0)) return;
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

/** A four-point star with long rays and a soft core. */
function drawStar(ctx, x, y, size, alpha, turn, core) {
  if (!(alpha > 0) || !(size > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.globalAlpha *= Math.min(1, alpha);
  glow(ctx, 0, 0, size * 0.45, core, 0.9);
  ctx.fillStyle = rgba(EVOLVE_PALETTE.white, 1);
  traceDiamond(ctx, size, size * 0.05);
  ctx.fill();
  ctx.rotate(Math.PI / 2);
  traceDiamond(ctx, size * 0.7, size * 0.05);
  ctx.fill();
  ctx.restore();
}

/** The violet nebula disc and its twinkling stars. */
function drawNebula(ctx, pose, k) {
  if (!(pose.nebula > 0)) return;
  const { cx, cy, unit, palette: P, scene, time } = k;
  const R = unit * 1.3 * (0.15 + 0.85 * pose.iris);
  const a = pose.nebula;
  ctx.save();
  const base = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  base.addColorStop(0, rgba(P.violet, 0.9 * a));
  base.addColorStop(0.35, rgba(P.indigo, 0.92 * a));
  base.addColorStop(0.72, rgba(P.ink, 0.85 * a));
  base.addColorStop(1, rgba(P.ink, 0));
  fillCircle(ctx, cx, cy, R, base);

  ctx.globalCompositeOperation = 'lighter';
  for (const cloud of scene.clouds) {
    const angle = cloud.angle + cloud.drift * time;
    const r = cloud.radius * R * 0.85;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r * 0.8;
    const fade = 1 - cloud.radius ** 3;
    glow(ctx, x, y, cloud.size * unit, cloud.tint, cloud.alpha * a * fade);
  }
  if (pose.stars > 0) {
    for (const star of scene.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(time * star.rate + star.phase);
      const x = cx + Math.cos(star.angle) * star.radius * R;
      const y = cy + Math.sin(star.angle) * star.radius * R * 0.85;
      drawStar(ctx, x, y, star.size * unit, pose.stars * twinkle, 0, P.frost);
    }
  }
  ctx.restore();
}

/** Frost-white glow behind the card while it shines and the new one settles. */
function drawHalo(ctx, pose, k) {
  if (!(pose.halo > 0)) return;
  const { cx, cy, unit, palette: P } = k;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, cx, cy, unit * 0.85, P.frost, 0.75 * pose.halo);
  glow(ctx, cx, cy, unit * 0.7, P.white, 0.5 * pose.halo);
  ctx.restore();
}

/** Pairs of glowing beads floating up past the card. */
function drawBeads(ctx, pose, k, front) {
  if (!(pose.beads > 0)) return;
  const { cx, cy, unit, palette: P, scene } = k;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const bead of scene.beads) {
    if (bead.front !== front) continue;
    const p = span(pose.beadRise, bead.start, bead.start + 0.45);
    if (!(p > 0 && p < 1)) continue;
    const alpha = pose.beads * Math.sin(p * Math.PI);
    const x = cx + bead.x * unit + Math.sin(p * TAU + bead.phase) * unit * 0.05;
    const y = cy + bead.y * unit - bead.rise * unit * easeOutCubic(p);
    // Near beads are bigger and brighter than far ones: parallax, not a flat layer.
    const depth = front ? 1.2 : 0.7;
    const r = bead.size * unit * depth;
    const shine = alpha * (front ? 1 : 0.55);
    for (const [dx, dy] of [
      [0, 0],
      [bead.gap * unit, bead.gap * unit * 0.4],
    ]) {
      glow(ctx, x + dx, y + dy, r * 3.2, P.frost, 0.6 * shine);
      fillCircle(ctx, x + dx, y + dy, r, rgba(P.white, shine));
    }
  }
  ctx.restore();
}

/** Soft out-of-focus discs thrown outward by the surge. */
function drawBokeh(ctx, pose, k) {
  if (!(pose.bokeh > 0)) return;
  const { cx, cy, unit, scene } = k;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const disc of scene.bokeh) {
    const from = disc.delay * 0.5;
    const p = easeOutCubic(span(pose.bokehTravel, from, from + 0.5));
    if (!(p > 0 && p < 1)) continue;
    const reach = (0.25 + disc.distance * p) * unit;
    const x = cx + Math.cos(disc.angle) * reach;
    const y = cy + Math.sin(disc.angle) * reach;
    const r = disc.size * unit * (0.6 + 0.6 * p);
    const alpha = pose.bokeh * (1 - p) ** 0.7;
    fillCircle(ctx, x, y, r, rgba(disc.tint, 0.3 * alpha));
    ctx.strokeStyle = rgba(disc.tint, 0.6 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

/** Twinkling glitter round the evolved Pokémon. */
function drawGlitter(ctx, pose, k) {
  if (!(pose.glitter > 0)) return;
  const { cx, cy, unit, palette: P, scene } = k;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const bit of scene.glitter) {
    const p = span(pose.glitterTime, bit.start, bit.start + bit.life);
    if (!(p > 0 && p < 1)) continue;
    const bloom = Math.sin(p * Math.PI);
    const x = cx + bit.x * unit;
    const y = cy + bit.y * unit - p * unit * 0.12;
    drawStar(ctx, x, y, bit.size * unit * (0.4 + 0.6 * bloom), pose.glitter * bloom, bit.turn + p * 0.8, P.frost);
  }
  ctx.restore();
}
