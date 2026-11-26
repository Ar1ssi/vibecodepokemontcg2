// The Gigantamax entry of a Pokémon VMAX, drawn on one canvas after the Sword/Shield Dynamax look
// (stills: the in-game Dynamax rim, the Max Raid pillar and its red lightning, the Twilight Wings
// cloud ring). Magenta energy swirls into the card while crimson clouds billow at its base and
// pebbles lift off the mat; a magenta column of light streams up behind it. At the burst the card
// itself swells to giant size (the 3D board drives its mesh with `gmaxCardPose`), the column breaks
// and the clouds are flung up into a ring that circles the giant, near puffs in front of the card
// and far ones behind it, red lightning jumping between them. Then the card springs back into its
// slot, the ring widens, rises and thins away, and the pebbles fall.
// The clouds and pebbles are matter (lit lobes and facets drawn over the scene); the column, the
// streaks and the lightning are light (additive). The stage's post pass blooms the light
// (`gmaxPostPose`, stage-post.js). DOM-free: timeline and scene are pure, and `drawGmaxEntry` only
// uses the 2D context passed in, so the whole module runs under `node --test`.
import { drawEnergyRibbon } from './energy-ribbon.mjs';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic, lerp, span, spring } from './entry-math.mjs';
import { seededRandom } from './flow-pose.mjs';

export const GMAX_ENTRY_MS = 3200;
/** The column breaks and the card swells here: the evolve sample's measured peak is aligned to it. */
export const GMAX_BURST_AT = 0.46;
export const GMAX_BURST_MS = Math.round(GMAX_ENTRY_MS * GMAX_BURST_AT);
/** From here the card rests in its slot again, exactly as before the entry. */
export const GMAX_SETTLE_AT = 0.92;
/** The queue moves on once the card is back in its slot; the clouds thinning out are dissipation. */
export const GMAX_HOLD_MS = Math.round(GMAX_ENTRY_MS * GMAX_SETTLE_AT);
/** How big the card stands once it has Gigantamaxed, × its slot. */
export const GMAX_SCALE = 1.5;

/** Sampled from the stills: crimson clouds and lightning, magenta-pink Dynamax light. */
export const GMAX_PALETTE = Object.freeze({
  shadow: [122, 14, 46],
  low: [184, 24, 58],
  crimson: [232, 33, 63],
  lit: [255, 98, 128],
  wine: [122, 16, 80],
  magenta: [222, 58, 143],
  pink: [244, 135, 192],
  core: [255, 208, 230],
  filament: [255, 214, 224],
  bolt: [255, 42, 72],
  rock: [52, 34, 46],
  rockLit: [112, 76, 96],
  rockDark: [20, 11, 17],
});

const CARD_ASPECT = 0.716;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const easeInQuad = (t) => t * t;
const smoothstep = (a, b, t) => {
  const x = span(t, a, b);
  return x * x * (3 - 2 * x);
};
const plateau = (t, a, b, c, d) => {
  if (t <= a || t >= d) return 0;
  if (t < b) return easeOutCubic(span(t, a, b));
  if (t <= c) return 1;
  return 1 - easeInCubic(span(t, c, d));
};
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${clamp01(a).toFixed(3)})`;

// ---- timeline ----

const B = GMAX_BURST_AT;
// How far the card sinks before the swell, and when it starts to shrink back.
const CROUCH = 0.05;
const SHRINK_AT = 0.76;
// How far the giant card rises off the cloth (card heights): enough to stand over its neighbours.
const LIFT = 0.12;

/** The damped spring from 1 to rest, exactly 0 from u = 1 on (the cosine leaves a rounding speck). */
const springBack = (u) => (u >= 1 ? 0 : spring(u));

function cardScaleAt(c) {
  if (c < B - 0.01) return 1 - CROUCH * easeOutCubic(span(c, 0.06, 0.3));
  if (c < SHRINK_AT) return lerp(1 - CROUCH, GMAX_SCALE, easeOutBack(span(c, B - 0.01, B + 0.07)));
  return 1 + (GMAX_SCALE - 1) * springBack(span(c, SHRINK_AT, GMAX_SETTLE_AT));
}

/**
 * The card's own motion at t in [0, 1] of the entry: it crouches and strains while the energy
 * gathers, swells past GMAX_SCALE at the burst and settles on it, holds giant while the clouds
 * circle, then shrinks back on one damped spring, at rest from GMAX_SETTLE_AT. `lift` and `shake`
 * are in card heights, `yawDeg` in degrees, `rim` its magenta edge glow (0–1).
 * @returns {{ scale: number, lift: number, yawDeg: number, shake: number, rim: number }}
 */
export function gmaxCardPose(t) {
  const c = clamp01(t);
  const scale = cardScaleAt(c);
  const strain = c < B ? span(c, 0.2, B) ** 2 : 0;
  const kick = plateau(c, B - 0.02, B, B + 0.02, B + 0.08);
  return {
    scale,
    lift: LIFT * clamp01((scale - 1) / (GMAX_SCALE - 1)),
    yawDeg: strain > 0 ? 1.1 * strain * Math.sin(c * 410) : 0,
    shake: strain > 0 ? 0.012 * strain * Math.sin(c * 530 + 1.3) : 0,
    rim: plateau(c, 0.01, 0.08, SHRINK_AT, GMAX_SETTLE_AT) * (0.8 + 0.2 * kick),
  };
}

/** Every layer's strength (0..1) and motion at t in [0, 1] of the entry. */
export function gmaxEntryPose(t) {
  const c = clamp01(t);
  return {
    pool: plateau(c, 0, 0.1, 0.78, 0.95),
    glow: plateau(c, 0.01, 0.08, SHRINK_AT, GMAX_SETTLE_AT),
    gather: span(c, 0.05, 0.4),
    column: plateau(c, 0.28, 0.32, B, B + 0.09),
    columnRise: easeOutCubic(span(c, 0.28, 0.37)),
    columnBreak: easeInCubic(span(c, B, B + 0.09)),
    flare: plateau(c, B - 0.015, B, B + 0.015, B + 0.09),
    clouds: plateau(c, 0.08, 0.2, 0.84, 1),
    billow: easeOutCubic(span(c, 0.08, B)),
    launch: easeOutCubic(span(c, B, B + 0.12)),
    disperse: easeOutCubic(span(c, SHRINK_AT + 0.02, 1)),
    debris: plateau(c, 0.12, 0.18, 0.86, 0.98),
    time: (c * GMAX_ENTRY_MS) / 1000,
    sinceBurst: (Math.max(0, c - B) * GMAX_ENTRY_MS) / 1000,
    sinceShrink: (Math.max(0, c - SHRINK_AT) * GMAX_ENTRY_MS) / 1000,
  };
}

/**
 * The stage's post pass at t (stage-post.js): brightness by luminance, so the crimson clouds
 * (matter) never bloom and only light near white does (filaments, the column's core, the rim's
 * hot line); the bloom eases back on the burst frame, and a chromatic fringe kicks there.
 * @returns {{ bloom: number, threshold: number, knee: number, fringe: number, luma: number }}
 */
export function gmaxPostPose(t) {
  const c = clamp01(t);
  const burst = plateau(c, B - 0.01, B, B + 0.01, B + 0.08);
  return { bloom: 0.85 - 0.25 * burst, threshold: 0.55, knee: 0.25, fringe: 0.006 * burst, luma: 1 };
}

// ---- scene ----

const PUFF_COUNT = 10;
const DEBRIS_COUNT = 12;
const STREAK_COUNT = 14;
const STRAND_COUNT = 12;

// The cloud ring (card heights): a crown round the card's top edge (RING_Y × its scale, so it
// comes down with the card as it shrinks back), tilted toward the viewer so its near side crosses
// the top of the card and its far side shows above it.
const RING_Y = 0.48;
const RING_R = 1;
const RING_R_OUT = 1.5;
const RING_TILT = 13 * DEG;
const ORBIT_DEG_PER_S = 48;
// Viewer distance (card heights): near puffs swell, far ones shrink.
const CAMERA = 6;

/**
 * One cumulus puff in its own units (radius 1): a flat-bottomed row of broad lobes, two domes
 * over it, a crown dome and small billows on its top contour. The lobes overlap heavily, so the
 * puff is one mass; `shade` (0 underside … 1 top) says which lobes catch the light.
 */
function buildPuffLobes(rand) {
  const lobes = [];
  for (let k = 0; k < 3; k += 1)
    lobes.push({ x: (k - 1) * 0.44 + (rand() - 0.5) * 0.08, y: -0.12 + (rand() - 0.5) * 0.04, r: 0.4 + rand() * 0.08 });
  for (const side of [-1, 1]) lobes.push({ x: side * (0.2 + rand() * 0.08), y: 0.14 + rand() * 0.06, r: 0.38 + rand() * 0.07 });
  lobes.push({ x: (rand() - 0.5) * 0.2, y: 0.34 + rand() * 0.06, r: 0.3 + rand() * 0.06 });
  for (let k = 0; k < 3; k += 1) lobes.push({ x: (rand() - 0.5) * 0.9, y: 0.32 + rand() * 0.12, r: 0.15 + rand() * 0.06 });
  return lobes.map((lobe) => ({ ...lobe, shade: clamp01((lobe.y + 0.2) / 0.6) }));
}

/** An irregular pebble outline: `sides` radii round a unit circle. */
const pebbleOutline = (rand) => Array.from({ length: 5 + Math.floor(rand() * 3) }, () => 0.62 + rand() * 0.38);

/** One lightning strike: when it flashes (fractions of the entry), what it joins, and its seed. */
function boltEvents(rand) {
  const events = [];
  for (let k = 0; k < 7; k += 1)
    events.push({ kind: 'rim', at: lerp(0.2, B - 0.04, k / 6) + (rand() - 0.5) * 0.02, dur: 0.022, from: rand(), reach: 0.1 + rand() * 0.08, seed: Math.floor(rand() * 1e6) });
  // The burst's bolts all strike on the contact frame, a few ms before the flare peaks.
  for (let k = 0; k < 5; k += 1)
    events.push({ kind: 'burst', at: B - 0.003, dur: 0.06, angle: k * 72 + 20 + (rand() - 0.5) * 30, length: 1 + rand() * 0.4, seed: Math.floor(rand() * 1e6) });
  for (let k = 0; k < 6; k += 1)
    events.push({ kind: 'arc', at: lerp(B + 0.1, SHRINK_AT - 0.03, k / 5), dur: 0.028, puff: Math.floor(rand() * PUFF_COUNT), seed: Math.floor(rand() * 1e6) });
  return events;
}

/**
 * Everything random in the entry, fixed by `seed`: the cloud puffs (their lobes, base spot and ring
 * slot), the pebbles, the energy streaks, the column's strands and the lightning strikes.
 */
export function buildGmaxScene(seed = 1) {
  const rand = seededRandom(seed);
  const puffs = Array.from({ length: PUFF_COUNT }, (_, i) => ({
    lobes: buildPuffLobes(rand),
    size: 0.25 + rand() * 0.08,
    angle: (i * 360) / PUFF_COUNT + (rand() - 0.5) * 14,
    base: { x: ((i + 0.5) / PUFF_COUNT - 0.5) * 1.7 + (rand() - 0.5) * 0.14, y: -0.56 + rand() * 0.1, z: 0.08 + rand() * 0.3 },
    bob: rand() * TAU,
  }));
  const debris = Array.from({ length: DEBRIS_COUNT }, () => ({
    x: (rand() - 0.5) * 1.9,
    y: -0.62 + rand() * 0.24,
    size: 0.035 + rand() * 0.045,
    start: 0.14 + rand() * 0.24,
    speed: 0.3 + rand() * 0.3,
    drift: (rand() - 0.5) * 0.16,
    spin: (rand() - 0.5) * 6,
    angle: rand() * TAU,
    outline: pebbleOutline(rand),
  }));
  const streaks = Array.from({ length: STREAK_COUNT }, (_, i) => ({
    angle: (i * 360) / STREAK_COUNT + rand() * 20,
    reach: 1.35 + rand() * 0.45,
    swirl: (rand() < 0.5 ? -1 : 1) * (45 + rand() * 40),
    start: rand() * 0.62,
    dur: 0.24 + rand() * 0.1,
    width: 0.016 + rand() * 0.01,
  }));
  // Most strands run up the column's flanks, where the card does not hide them.
  const strands = Array.from({ length: STRAND_COUNT }, (_, i) => ({
    x: (i % 2 ? 1 : -1) * (0.35 + rand() * 0.55),
    length: 0.35 + rand() * 0.4,
    period: 0.9 + rand() * 0.6,
    speed: 3 + rand() * 2,
    phase: rand(),
    alpha: 0.35 + rand() * 0.35,
    width: 0.01 + rand() * 0.018,
  }));
  return { puffs, debris, streaks, strands, bolts: boltEvents(rand) };
}

/**
 * A point `angleDeg` round the cloud ring of radius `radius` round a card at `scale` (card heights;
 * y up, z toward the viewer).
 */
export function ringPoint(angleDeg, radius, scale = GMAX_SCALE) {
  const a = angleDeg * DEG;
  const z = Math.sin(a) * radius;
  return [Math.cos(a) * radius, RING_Y * scale - z * Math.sin(RING_TILT), z * Math.cos(RING_TILT)];
}

/**
 * Where a puff is at `pose` round a card at `scale` (card heights, y up): low at the card's base
 * while the energy gathers, flung up onto its ring slot at the burst, round the ring after it;
 * as the clouds disperse the ring widens and lifts a little off the card's top edge, which comes
 * down as the card shrinks back. `size` grows with them: smoke expands as it thins.
 * @returns {{ x: number, y: number, z: number, size: number }}
 */
export function puffPlace(puff, pose, scale = GMAX_SCALE) {
  const bob = 0.025 * Math.sin(pose.time * 2.2 + puff.bob);
  const baseX = puff.base.x * (1 + 0.12 * pose.billow);
  const angle = puff.angle + ORBIT_DEG_PER_S * pose.sinceBurst;
  const [rx, ry, rz] = ringPoint(angle, lerp(RING_R, RING_R_OUT, pose.disperse), Math.max(1, scale));
  const launch = pose.launch;
  return {
    x: lerp(baseX, rx, launch),
    y: lerp(puff.base.y + bob, ry + bob + 0.1 * pose.disperse, launch) + 0.3 * Math.sin(Math.PI * launch),
    z: lerp(puff.base.z, rz, launch),
    size: puff.size * (0.35 + 0.65 * pose.billow) * (1 + 0.15 * launch) * (1 + 0.45 * pose.disperse),
  };
}

// ---- drawing ----

/**
 * Draw one frame of the Gigantamax entry at t in [0, 1]. `ctx` is a 2D context in CSS pixels,
 * (cx, cy) the card's centre and `unit` its height at rest, in the same pixels; `card` its size at
 * rest; `scene` from `buildGmaxScene`. `grows` says whether the card itself swells (the 3D board
 * drives its mesh with `gmaxCardPose`); without it the scene frames the card at its own size.
 * `layer` (optional) is a 2D context on a scratch canvas the size of `ctx`'s: the clouds are drawn
 * there whole and laid on at their opacity, so a thinning cloud never shows its lobes through.
 */
export function drawGmaxEntry(ctx, t, { cx, cy, unit, card = null, scene, grows = true, layer = null }) {
  if (!(unit > 0) || !scene) return;
  const pose = gmaxEntryPose(t);
  const body = gmaxCardPose(t);
  const scale = grows ? body.scale : 1;
  const g = {
    cx,
    cy,
    unit,
    cardX: cx + (grows ? body.shake * unit : 0),
    cardW: (card?.width > 0 ? card.width : unit * CARD_ASPECT) * scale,
    cardH: (card?.height > 0 ? card.height : unit) * scale,
  };
  const puffs = placePuffs(scene, pose, g, scale);
  // As the ring disperses its near side clears first, so the card settles back in plain sight.
  const farAlpha = pose.clouds * (1 - 0.55 * pose.disperse);
  const nearAlpha = pose.clouds * (1 - 0.9 * pose.disperse);
  ctx.save();
  outsideCard(ctx, g, () => {
    drawPool(ctx, pose, g);
    drawColumn(ctx, pose, scene, g);
    drawDebris(ctx, pose, scene, g);
    drawClouds(ctx, layer, puffs.filter((p) => p.z < 0), farAlpha, pose);
    drawCorona(ctx, pose, g);
    drawRimGlow(ctx, pose, g);
    drawStreaks(ctx, pose, scene, g);
  });
  drawClouds(ctx, layer, puffs.filter((p) => p.z >= 0), nearAlpha, pose);
  drawBolts(ctx, t, pose, scene, puffs, g);
  ctx.restore();
}

/** The card's outline at its current size (rounded like the printed card). */
function traceCard(ctx, g) {
  const w = g.cardW;
  const h = g.cardH;
  const r = Math.min(w, h) * 0.045;
  const x = g.cardX - w / 2;
  const y = g.cy - h / 2;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Runs `draw` with the card cut out of the canvas: what it draws lies behind the card. */
function outsideCard(ctx, g, draw) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.cx - g.unit * 8, g.cy - g.unit * 8, g.unit * 16, g.unit * 16);
  traceCard(ctx, g);
  ctx.clip('evenodd');
  draw();
  ctx.restore();
}

function fillCircle(ctx, x, y, radius, style) {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

/** A radial glow of `rgb` from `alpha` at its centre to nothing at `radius`. */
function glow(ctx, x, y, radius, rgb, alpha, mid = 0.4) {
  if (!(radius > 0) || !(alpha > 0)) return;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, rgba(rgb, alpha));
  grad.addColorStop(0.45, rgba(rgb, alpha * mid));
  grad.addColorStop(1, rgba(rgb, 0));
  fillCircle(ctx, x, y, radius, grad);
}

/** The light the card throws on the cloth round it. */
function drawPool(ctx, pose, g) {
  if (!(pose.pool > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, g.cardX, g.cy, Math.max(g.cardW, g.cardH) * 0.95, GMAX_PALETTE.wine, 0.3 * pose.pool, 0.5);
  ctx.restore();
}

/**
 * The Dynamax light behind the card: it wells up round the card from its base and streams upward
 * in strands, a little past its top edge (local to the card: it must not wash the cards beyond),
 * flares on the burst and breaks, its base climbing away as it fades. Drawn in slices, each its
 * own width and brightness, so it widens as it rises and fades at both ends.
 */
function drawColumn(ctx, pose, scene, g) {
  if (!(pose.column > 0)) return;
  const { unit } = g;
  const base = lerp(-0.48, 0.9, pose.columnBreak);
  const top = lerp(0.25, 1.45, pose.columnRise) + 0.35 * pose.columnBreak;
  const tall = top - base;
  if (!(tall > 0.05)) return;
  const width = 1.3 * (1 + 0.25 * pose.flare);
  const strength = pose.column * (1 + 0.4 * pose.flare);
  const envelope = (yn) => smoothstep(0, 0.1, yn) * (1 - smoothstep(0.45, 1, yn));
  const P = GMAX_PALETTE;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const slices = 28;
  for (let i = 0; i < slices; i += 1) {
    const y0 = base + (tall * i) / slices;
    const y1 = base + (tall * (i + 1)) / slices;
    const yn = (i + 0.5) / slices;
    const a = strength * envelope(yn);
    if (!(a > 0.004)) continue;
    const half = (width * (1 + 0.2 * yn) * unit) / 2;
    const grad = ctx.createLinearGradient(g.cx - half, 0, g.cx + half, 0);
    grad.addColorStop(0, rgba(P.wine, 0));
    grad.addColorStop(0.18, rgba(P.magenta, 0.4 * a));
    grad.addColorStop(0.5, rgba(P.pink, 0.62 * a));
    grad.addColorStop(0.82, rgba(P.magenta, 0.4 * a));
    grad.addColorStop(1, rgba(P.wine, 0));
    ctx.fillStyle = grad;
    // Slices abut exactly: added light that overlapped would draw a bright seam at each joint.
    ctx.fillRect(g.cx - half, g.cy - y1 * unit, half * 2, (y1 - y0) * unit);
  }
  for (const strand of scene.strands) {
    const scroll = (pose.time * strand.speed + strand.phase * strand.period) % strand.period;
    for (let y = base - strand.period + scroll; y < top; y += strand.period) {
      const from = Math.max(base, y);
      const to = Math.min(top, y + strand.length);
      if (!(to > from)) continue;
      const a = strand.alpha * strength * envelope(((from + to) / 2 - base) / tall);
      if (!(a > 0.004)) continue;
      const x = g.cx + strand.x * (width / 2) * unit;
      const grad = ctx.createLinearGradient(0, g.cy - from * unit, 0, g.cy - to * unit);
      grad.addColorStop(0, rgba(P.magenta, 0));
      grad.addColorStop(0.7, rgba(P.pink, a));
      grad.addColorStop(1, rgba(P.core, a));
      ctx.fillStyle = grad;
      const w = strand.width * unit;
      ctx.fillRect(x - w / 2, g.cy - to * unit, w, (to - from) * unit);
    }
  }
  ctx.restore();
}

/** Where a pebble is at `pose` (card heights, y up), or null before it lifts. */
export function pebblePlace(pebble, pose) {
  const lifted = pose.time - pebble.start * (GMAX_ENTRY_MS / 1000);
  if (!(lifted > 0)) return null;
  // Lifts off slowly, then rises at its speed; once the card shrinks back it falls.
  const risen = (pebble.speed * lifted * lifted) / (lifted + 0.25);
  const fall = pose.sinceShrink;
  const drop = fall > 0 ? 3.2 * fall * fall - 0.4 * pebble.speed * fall : 0;
  return {
    x: pebble.x + pebble.drift * lifted,
    y: pebble.y + risen - Math.max(0, drop),
    angle: pebble.angle + pebble.spin * lifted,
  };
}

/**
 * Pebbles lifting off the mat round the card: dark stone with a lit top facet (the outline shrunk
 * toward the light), its edge catching a little of the magenta light.
 */
function drawDebris(ctx, pose, scene, g) {
  if (!(pose.debris > 0)) return;
  const P = GMAX_PALETTE;
  const { unit } = g;
  for (const pebble of scene.debris) {
    const place = pebblePlace(pebble, pose);
    if (!place) continue;
    const x = g.cx + place.x * unit;
    const y = g.cy - place.y * unit;
    const r = pebble.size * unit;
    const outline = (k, dx, dy) =>
      pebble.outline.map((radius, i) => {
        const a = place.angle + (i / pebble.outline.length) * TAU;
        return [x + dx + Math.cos(a) * r * radius * k, y + dy + Math.sin(a) * r * radius * k];
      });
    ctx.save();
    ctx.globalAlpha *= pose.debris;
    ctx.fillStyle = rgba(P.rockDark, 1);
    tracePolygon(ctx, outline(1, 0, 0));
    ctx.fill();
    ctx.strokeStyle = rgba(P.pink, 0.3);
    ctx.lineWidth = Math.max(0.6, r * 0.1);
    ctx.stroke();
    ctx.fillStyle = rgba(P.rock, 1);
    tracePolygon(ctx, outline(0.8, -r * 0.08, -r * 0.08));
    ctx.fill();
    ctx.fillStyle = rgba(P.rockLit, 1);
    tracePolygon(ctx, outline(0.45, -r * 0.22, -r * 0.26));
    ctx.fill();
    ctx.restore();
  }
}

function tracePolygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

/** Every puff's screen place at `pose` round a card at `scale`, far ones first. */
function placePuffs(scene, pose, g, scale) {
  if (!(pose.clouds > 0)) return [];
  return scene.puffs
    .map((puff, index) => {
      const at = puffPlace(puff, pose, scale);
      const k = CAMERA / (CAMERA - at.z);
      return {
        puff,
        index,
        z: at.z,
        x: g.cx + at.x * g.unit * k,
        y: g.cy - at.y * g.unit * k,
        r: at.size * g.unit * k,
      };
    })
    .sort((a, b) => a.z - b.z);
}

/** One path through every lobe of a puff, each circle moved `shift` (× its radius) and scaled by `k`. */
function traceLobes(ctx, puff, x, y, r, shift, k) {
  ctx.beginPath();
  for (const lobe of puff.lobes) {
    const lr = lobe.r * r;
    const lx = x + lobe.x * r + shift[0] * lr;
    const ly = y - lobe.y * r + shift[1] * lr;
    ctx.moveTo(lx + lr * k, ly);
    ctx.arc(lx, ly, lr * k, 0, TAU);
  }
}

// The light comes from the upper left: the lit body is the silhouette moved toward it, which
// leaves one shadow band along the far edge of the whole mass, as on a real cloud.
const BODY_SHIFT = [-0.15, -0.2];
const BODY_SCALE = 0.86;

/**
 * A cloud puff as matter, lit as one volume from the upper left: the silhouette in shadow, the
 * body (darker low down) moved toward the light, soft lit tops on the high lobes, and the
 * Dynamax energy glowing faintly inside it.
 */
function drawPuff(ctx, puff, x, y, r, energy) {
  if (!(r > 0.5)) return;
  const P = GMAX_PALETTE;
  ctx.save();
  ctx.fillStyle = rgba(P.shadow, 1);
  traceLobes(ctx, puff, x, y, r, [0, 0], 1);
  ctx.fill();
  const body = ctx.createLinearGradient(0, y - r * 0.75, 0, y + r * 0.5);
  body.addColorStop(0, rgba(P.crimson, 1));
  body.addColorStop(0.55, rgba(P.crimson, 1));
  body.addColorStop(1, rgba(P.low, 1));
  ctx.fillStyle = body;
  traceLobes(ctx, puff, x, y, r, BODY_SHIFT, BODY_SCALE);
  ctx.fill();
  for (const lobe of puff.lobes) {
    if (!(lobe.shade > 0.4)) continue;
    const lr = lobe.r * r;
    const lx = x + lobe.x * r - lr * 0.28;
    const ly = y - lobe.y * r - lr * 0.32;
    glow(ctx, lx, ly, lr * 0.62, P.lit, 0.85 * lobe.shade, 0.7);
  }
  if (energy > 0) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y + r * 0.08, r * 0.8, P.magenta, 0.14 * energy);
  }
  ctx.restore();
}

/**
 * The clouds at `alpha`. With a scratch `layer` they are drawn there whole and laid on at once,
 * so a thinning cloud fades as one body; without one each puff is faded on its own.
 */
function drawClouds(ctx, layer, placed, alpha, pose) {
  if (!placed.length || !(alpha > 0)) return;
  const energy = 1 - pose.disperse;
  if (!layer?.canvas || typeof ctx.getTransform !== 'function') {
    ctx.save();
    ctx.globalAlpha *= alpha;
    for (const p of placed) drawPuff(ctx, p.puff, p.x, p.y, p.r, energy);
    ctx.restore();
    return;
  }
  const { canvas } = layer;
  layer.setTransform(1, 0, 0, 1, 0, 0);
  layer.clearRect(0, 0, canvas.width, canvas.height);
  layer.setTransform(ctx.getTransform());
  for (const p of placed) drawPuff(layer, p.puff, p.x, p.y, p.r, energy);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= alpha;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

/** The burst's corona round the card: crimson into magenta, local to the card, never white. */
function drawCorona(ctx, pose, g) {
  if (!(pose.flare > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const radius = Math.hypot(g.cardW, g.cardH) * 0.72;
  const grad = ctx.createRadialGradient(g.cardX, g.cy, Math.min(g.cardW, g.cardH) * 0.45, g.cardX, g.cy, radius);
  grad.addColorStop(0, rgba(GMAX_PALETTE.pink, 0.55 * pose.flare));
  grad.addColorStop(0.35, rgba(GMAX_PALETTE.magenta, 0.35 * pose.flare));
  grad.addColorStop(0.7, rgba(GMAX_PALETTE.crimson, 0.12 * pose.flare));
  grad.addColorStop(1, rgba(GMAX_PALETTE.crimson, 0));
  fillCircle(ctx, g.cardX, g.cy, radius, grad);
  ctx.restore();
}

/** The Dynamax rim: a magenta glow hugging the card's edge outside it, a hot pink line on the edge. */
function drawRimGlow(ctx, pose, g) {
  if (!(pose.glow > 0)) return;
  const P = GMAX_PALETTE;
  const a = pose.glow * (0.85 + 0.15 * pose.flare);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowColor = rgba(P.magenta, 0.9 * a);
  ctx.shadowBlur = g.unit * 0.12;
  ctx.strokeStyle = rgba(P.magenta, 0.7 * a);
  ctx.lineWidth = g.unit * 0.05;
  ctx.beginPath();
  traceCard(ctx, g);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(P.pink, 0.9 * a);
  ctx.lineWidth = Math.max(1, g.unit * 0.014);
  ctx.beginPath();
  traceCard(ctx, g);
  ctx.stroke();
  ctx.restore();
}

/** Distance from the card's centre to its edge along `angle` (radians), in pixels. */
const edgeDistance = (g, angle) => {
  const c = Math.abs(Math.cos(angle)) || 1e-6;
  const s = Math.abs(Math.sin(angle)) || 1e-6;
  return Math.min(g.cardW / 2 / c, g.cardH / 2 / s);
};

/**
 * The energy the card draws in: magenta streaks spiral in from round it, speeding up, and vanish
 * into its edge. Few at a time and curved, so they read as a pull, not a fan of rays.
 */
function drawStreaks(ctx, pose, scene, g) {
  if (!(pose.gather > 0) || !(pose.gather < 1)) return;
  const P = GMAX_PALETTE;
  for (const streak of scene.streaks) {
    const local = (pose.gather - streak.start) / streak.dur;
    if (!(local > 0) || !(local < 1)) continue;
    const head = easeInQuad(local);
    const tail = Math.max(0, head - 0.3);
    const fade = smoothstep(0, 0.15, local);
    const at = (q) => {
      const angle = (streak.angle + streak.swirl * (1 - q)) * DEG;
      const r = lerp(streak.reach * g.unit, edgeDistance(g, angle), q);
      return [g.cardX + Math.cos(angle) * r, g.cy - Math.sin(angle) * r];
    };
    const points = [];
    for (let s = 0; s <= 16; s += 1) {
      const u = s / 16;
      const [x, y] = at(lerp(tail, head, u));
      points.push({
        x,
        y,
        half: streak.width * g.unit * Math.sin((Math.PI / 2) * u) * 0.5,
        facing: 1,
        rgb: mixRgb(P.magenta, P.pink, u),
        alpha: fade * u ** 1.4,
      });
    }
    drawEnergyRibbon(ctx, points);
  }
}

/** A jagged bolt from `a` to `b` (pixels) by midpoint displacement: straight runs, sharp corners. */
export function boltPath(rand, [ax, ay], [bx, by], jag = 0.24, levels = 4) {
  let points = [
    [ax, ay],
    [bx, by],
  ];
  let amp = Math.hypot(bx - ax, by - ay) * jag;
  for (let level = 0; level < levels; level += 1) {
    const next = [points[0]];
    for (let i = 0; i < points.length - 1; i += 1) {
      const [px, py] = points[i];
      const [qx, qy] = points[i + 1];
      const len = Math.hypot(qx - px, qy - py) || 1;
      const off = (rand() - 0.5) * amp;
      next.push([(px + qx) / 2 - ((qy - py) / len) * off, (py + qy) / 2 + ((qx - px) / len) * off], points[i + 1]);
    }
    points = next;
    amp *= 0.55;
  }
  return points;
}

/** A point `u` (0..1, clockwise from the top-left corner) round the card's edge, `out` px outside it. */
function perimeterPoint(g, u, out) {
  const w = g.cardW + out * 2;
  const h = g.cardH + out * 2;
  const x0 = g.cardX - w / 2;
  const y0 = g.cy - h / 2;
  let d = (((u % 1) + 1) % 1) * 2 * (w + h);
  if (d < w) return [x0 + d, y0];
  d -= w;
  if (d < h) return [x0 + w, y0 + d];
  d -= h;
  if (d < w) return [x0 + w - d, y0 + h];
  d -= w;
  return [x0, y0 + h - d];
}

/** The bolts showing at t: each a path of screen points (and its forks), re-struck every 45 ms. */
function boltsAt(t, pose, scene, puffs, g) {
  const ms = t * GMAX_ENTRY_MS;
  const front = puffs.filter((p) => p.z >= 0 && p.r > 0);
  const out = [];
  for (const bolt of scene.bolts) {
    if (!(t >= bolt.at) || !(t < bolt.at + bolt.dur)) continue;
    const rand = seededRandom(bolt.seed + Math.floor(ms / 45));
    if (bolt.kind === 'rim') {
      const pad = g.unit * 0.03;
      out.push(boltPath(rand, perimeterPoint(g, bolt.from, pad), perimeterPoint(g, bolt.from + bolt.reach, pad), 0.35, 3));
    } else if (bolt.kind === 'burst') {
      const angle = bolt.angle * DEG;
      const r0 = edgeDistance(g, angle);
      const r1 = r0 + bolt.length * g.unit * 0.5;
      const from = [g.cardX + Math.cos(angle) * r0, g.cy - Math.sin(angle) * r0];
      const to = [g.cardX + Math.cos(angle) * r1, g.cy - Math.sin(angle) * r1];
      const main = boltPath(rand, from, to, 0.28, 4);
      out.push(main);
      const root = main[Math.floor(main.length * (0.35 + rand() * 0.3))];
      const turn = angle + (rand() < 0.5 ? -1 : 1) * (25 + rand() * 25) * DEG;
      const reach = bolt.length * g.unit * 0.25;
      out.push(boltPath(rand, root, [root[0] + Math.cos(turn) * reach, root[1] - Math.sin(turn) * reach], 0.3, 3));
    } else if (front.length > 1) {
      const a = front[bolt.puff % front.length];
      const b = front[(bolt.puff + 1) % front.length];
      out.push(boltPath(rand, [a.x, a.y], [b.x, b.y], 0.3, 4));
    }
  }
  return out;
}

/** Red lightning: a crimson halo, a hot body and a pale pink filament, the one near-white thing. */
function drawBolts(ctx, t, pose, scene, puffs, g) {
  const paths = boltsAt(t, pose, scene, puffs, g);
  if (!paths.length) return;
  const P = GMAX_PALETTE;
  const layers = [
    [P.crimson, 0.55, 0.05],
    [P.bolt, 0.95, 0.016],
    [P.filament, 0.85, 0.005],
  ];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'round';
  for (const [rgb, alpha, width] of layers) {
    ctx.strokeStyle = rgba(rgb, alpha);
    ctx.lineWidth = Math.max(0.8, g.unit * width);
    for (const path of paths) {
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i][0], path[i][1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}
