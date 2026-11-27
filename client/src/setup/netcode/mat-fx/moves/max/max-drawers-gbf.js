// Design 092 grass-bug-flying: the drawers of the pieces this group added (poses: max-props.mjs).
// `prop` and `vine` are matter — giant apples, roots and plants, Venusaur's vines — drawn
// source-over (scene-move-player.js isSourceOver) and lit as solids: a gradient with its light
// from the upper left (a 2D canvas shows that much), the GPU canvas's `volume` modifier for the
// glint and the rim, and a cast shadow from the front layer. `tornado` is light: rings of wind
// turning about the lane, drawn additively like every light beat. `butterflyUnit` is a body a
// travelling drawer flies (materials/_units.js contract). Drawers follow move-drawers.js's rules:
// nothing outside [0, 1), balanced save/restore, no composite changes, lifts per item.
import { rgbCss } from '../../fx-colors.mjs';
import { LIFT, standOn, travelLift } from '../beat-lift.mjs';
import { lanePoint } from '../move-geometry.mjs';
import { anchorPoint } from '../move-poses.mjs';
import { withFxMod } from '../materials/_mods.js';
import { PROP_WIDTH, propPose, tornadoPose, vinePose } from './max-props.mjs';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// Fixed colours of the parts a beat's tint does not name (it names deep / body / hot / core).
const LEAF_GREEN = Object.freeze({ deep: [19, 116, 71], body: [75, 162, 108], hot: [168, 249, 95] });
const STEM_BROWN = [74, 42, 18];
const GRASS = Object.freeze({ deep: [19, 116, 71], tip: [201, 254, 101] });
const VINE_GREEN = Object.freeze({ deep: [31, 82, 40], body: [86, 150, 70], hot: [170, 215, 120] });

/** Solids lit from the upper left on the GPU canvas: Lambert body, a glint past 1.0, a soft rim. */
const SOLID = Object.freeze({ volume: Object.freeze({ amount: 0.55, spec: 0.7, rim: 0.35, light: 135, ambient: 0.5, bump: 0 }) });
const WOOD = Object.freeze({ volume: Object.freeze({ amount: 0.6, spec: 0.12, rim: 0.3, light: 135, ambient: 0.45, bump: 0.5, bumpScale: 7, radius: 0.12 }) });
const lit = (ctx, mod, draw) => withFxMod(ctx, mod, draw);

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// ---- prop -------------------------------------------------------------------------------------

/** The apple's outline, its base at the origin, `w` wide and `h` tall (y up the screen is −y). */
function traceApple(ctx, w, h) {
  const dip = -h * 0.84;
  const mid = -h * 0.5;
  ctx.beginPath();
  ctx.moveTo(0, dip);
  ctx.bezierCurveTo(w * 0.16, -h * 1.02, w * 0.52, -h * 0.98, w * 0.5, mid);
  ctx.bezierCurveTo(w * 0.49, -h * 0.14, w * 0.24, 0, w * 0.09, -h * 0.01);
  ctx.quadraticCurveTo(0, -h * 0.06, -w * 0.09, -h * 0.01);
  ctx.bezierCurveTo(-w * 0.24, 0, -w * 0.49, -h * 0.14, -w * 0.5, mid);
  ctx.bezierCurveTo(-w * 0.52, -h * 0.98, -w * 0.16, -h * 1.02, 0, dip);
  ctx.closePath();
}

/** A giant glossy apple: lit red body, a glint, the stem and a leaf. */
function drawApple(ctx, w, h, palette) {
  lit(ctx, SOLID, () => {
    const g = ctx.createRadialGradient(-w * 0.2, -h * 0.66, h * 0.02, 0, -h * 0.47, Math.max(w, h) * 0.6);
    g.addColorStop(0, rgbCss(palette.hot, 1));
    g.addColorStop(0.32, rgbCss(palette.body, 1));
    g.addColorStop(0.78, rgbCss(palette.deep, 1));
    g.addColorStop(1, rgbCss(mix(palette.deep, [20, 0, 10], 0.45), 1));
    ctx.fillStyle = g;
    traceApple(ctx, w, h);
    ctx.fill();
  });
  // The glint: a soft tinted highlight up on the lit shoulder.
  ctx.save();
  ctx.translate(-w * 0.2, -h * 0.7);
  ctx.rotate(-35 * DEG);
  const glint = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.12);
  glint.addColorStop(0, rgbCss(palette.core, 0.75));
  glint.addColorStop(1, rgbCss(palette.core, 0));
  ctx.fillStyle = glint;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.12, h * 0.06, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // Stem and leaf out of the dimple.
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgbCss(STEM_BROWN, 1);
  ctx.lineWidth = Math.max(1, h * 0.04);
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.82);
  ctx.quadraticCurveTo(w * 0.02, -h * 0.94, w * 0.07, -h * 1.0);
  ctx.stroke();
  const leaf = ctx.createLinearGradient(w * 0.06, -h * 0.97, w * 0.34, -h * 1.08);
  leaf.addColorStop(0, rgbCss(LEAF_GREEN.deep, 1));
  leaf.addColorStop(1, rgbCss(LEAF_GREEN.hot, 1));
  ctx.fillStyle = leaf;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, -h * 0.95);
  ctx.quadraticCurveTo(w * 0.16, -h * 1.14, w * 0.36, -h * 1.06);
  ctx.quadraticCurveTo(w * 0.24, -h * 0.93, w * 0.06, -h * 0.95);
  ctx.fill();
}

/** The root's outline: a tusk `w` wide at its base curling `curl` × w over to its tip `h` up. */
function traceRoot(ctx, w, h, curl) {
  const tipX = w * curl;
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, 0);
  ctx.bezierCurveTo(-w * 0.62, -h * 0.42, -w * 0.12, -h * 0.82, tipX, -h);
  ctx.bezierCurveTo(w * 0.2, -h * 0.74, w * 0.62, -h * 0.4, w * 0.5, 0);
  ctx.quadraticCurveTo(0, h * 0.06, -w * 0.5, 0);
  ctx.closePath();
}

/** A giant gnarled root bursting out of the ground: lit bark, a lit edge, bark grain, dirt at its foot. */
function drawRoot(ctx, w, h, palette, seed) {
  const curl = 0.35 + 0.25 * seed;
  lit(ctx, WOOD, () => {
    const g = ctx.createLinearGradient(0, 0, w * curl, -h);
    g.addColorStop(0, rgbCss(palette.deep, 1));
    g.addColorStop(0.55, rgbCss(palette.body, 1));
    g.addColorStop(1, rgbCss(palette.hot, 1));
    ctx.fillStyle = g;
    traceRoot(ctx, w, h, curl);
    ctx.fill();
  });
  // The lit flank (light from the upper left), so a 2D canvas still reads a round root.
  ctx.save();
  traceRoot(ctx, w, h, curl);
  ctx.clip();
  const flank = ctx.createLinearGradient(-w * 0.55, 0, w * 0.2, 0);
  flank.addColorStop(0, rgbCss(palette.hot, 0.55));
  flank.addColorStop(1, rgbCss(palette.hot, 0));
  ctx.fillStyle = flank;
  ctx.fillRect(-w, -h * 1.1, w * 1.2, h * 1.2);
  // Bark grain along it.
  ctx.strokeStyle = rgbCss(mix(palette.deep, [10, 5, 0], 0.4), 0.7);
  ctx.lineWidth = Math.max(1, w * 0.035);
  for (const k of [-0.18, 0.12]) {
    ctx.beginPath();
    ctx.moveTo(w * k, -h * 0.05);
    ctx.bezierCurveTo(w * (k - 0.05), -h * 0.4, w * (k + 0.05), -h * 0.6, w * (curl * 0.6 + k * 0.4), -h * 0.85);
    ctx.stroke();
  }
  ctx.restore();
  // Clods of dirt thrown up round its foot.
  ctx.fillStyle = rgbCss(mix(palette.deep, [20, 12, 6], 0.35), 1);
  for (let k = 0; k < 3; k += 1) {
    const cx = (k - 1) * w * 0.55;
    ctx.beginPath();
    ctx.ellipse(cx, -h * 0.02, w * 0.16, w * 0.09, (k - 1) * 0.4, 0, TAU);
    ctx.fill();
  }
}

/** The mushroom cap's outline: a dome over a lip that curls under it. */
function traceCap(ctx, w, h, capY) {
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, capY + h * 0.02);
  ctx.bezierCurveTo(-w * 0.56, -h * 1.04, w * 0.56, -h * 1.04, w * 0.5, capY + h * 0.02);
  ctx.quadraticCurveTo(w * 0.25, capY + h * 0.1, 0, capY + h * 0.08);
  ctx.quadraticCurveTo(-w * 0.25, capY + h * 0.1, -w * 0.5, capY + h * 0.02);
  ctx.closePath();
}

/** A giant glowing mushroom plant: a lit, spotted cap with a shadowed underside on a round stem. */
function drawMushroom(ctx, w, h, palette, seed) {
  const capY = -h * 0.55;
  // The stem: a round column, lit on its left, in the cap's shadow at its top.
  lit(ctx, WOOD, () => {
    const stem = ctx.createLinearGradient(-w * 0.17, 0, w * 0.17, 0);
    stem.addColorStop(0, rgbCss(palette.core, 1));
    stem.addColorStop(0.45, rgbCss(palette.hot, 1));
    stem.addColorStop(1, rgbCss(palette.deep, 1));
    ctx.fillStyle = stem;
    ctx.beginPath();
    ctx.moveTo(-w * 0.18, 0);
    ctx.quadraticCurveTo(-w * 0.12, capY * 0.6, -w * 0.13, capY + h * 0.05);
    ctx.lineTo(w * 0.13, capY + h * 0.05);
    ctx.quadraticCurveTo(w * 0.12, capY * 0.6, w * 0.18, 0);
    ctx.closePath();
    ctx.fill();
  });
  const shadow = ctx.createLinearGradient(0, capY + h * 0.06, 0, capY + h * 0.22);
  shadow.addColorStop(0, rgbCss(mix(palette.deep, [0, 20, 10], 0.5), 0.75));
  shadow.addColorStop(1, rgbCss(palette.deep, 0));
  ctx.fillStyle = shadow;
  ctx.fillRect(-w * 0.14, capY + h * 0.05, w * 0.28, h * 0.17);
  // The cap, lit from the upper left; its underside a dark band.
  lit(ctx, SOLID, () => {
    const g = ctx.createRadialGradient(-w * 0.2, -h * 0.92, h * 0.02, 0, capY - h * 0.1, w * 0.6);
    g.addColorStop(0, rgbCss(palette.core, 1));
    g.addColorStop(0.25, rgbCss(palette.hot, 1));
    g.addColorStop(0.6, rgbCss(palette.body, 1));
    g.addColorStop(1, rgbCss(mix(palette.deep, [0, 16, 8], 0.4), 1));
    ctx.fillStyle = g;
    traceCap(ctx, w, h, capY);
    ctx.fill();
  });
  ctx.strokeStyle = rgbCss(mix(palette.deep, [0, 16, 8], 0.5), 0.9);
  ctx.lineWidth = Math.max(1, h * 0.035);
  ctx.beginPath();
  ctx.moveTo(-w * 0.48, capY + h * 0.03);
  ctx.quadraticCurveTo(0, capY + h * 0.13, w * 0.48, capY + h * 0.03);
  ctx.stroke();
  // The glowing spots, smaller toward the cap's shadowed edge.
  for (let k = 0; k < 6; k += 1) {
    const u = (k + 0.5) / 6 - 0.5;
    const sx = u * w * 0.78 + Math.sin(seed * 7 + k) * w * 0.04;
    const sy = capY - h * (0.1 + 0.26 * (1 - Math.abs(u) * 2)) * (0.75 + 0.25 * Math.sin(seed * 9 + k * 2.3));
    const r = w * (0.06 - 0.03 * Math.abs(u));
    const spot = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, 0, sx, sy, r);
    spot.addColorStop(0, rgbCss(palette.core, 1));
    spot.addColorStop(1, rgbCss(palette.hot, 0.6));
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r, r * 0.7, 0, 0, TAU);
    ctx.fill();
  }
}

/**
 * A dome of glowing scales closing over the defender (Max Flutterby, G-Max Befuddle): a lit,
 * translucent hemisphere tiled with dark scales, brightest at its crown.
 */
function drawScaleDome(ctx, w, h, palette, seed) {
  const rx = w / 2;
  const traceDome = () => {
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, h, 0, Math.PI, TAU);
    ctx.closePath();
  };
  lit(ctx, SOLID, () => {
    const g = ctx.createRadialGradient(-rx * 0.3, -h * 0.7, h * 0.04, 0, -h * 0.3, Math.max(rx, h) * 1.05);
    g.addColorStop(0, rgbCss(palette.core, 0.92));
    g.addColorStop(0.3, rgbCss(palette.hot, 0.85));
    g.addColorStop(0.7, rgbCss(palette.body, 0.8));
    g.addColorStop(1, rgbCss(palette.deep, 0.85));
    ctx.fillStyle = g;
    traceDome();
    ctx.fill();
  });
  // Scales: dark flakes over the whole shell, foreshortened toward its rim.
  ctx.save();
  traceDome();
  ctx.clip();
  const scale = mix(palette.deep, [0, 10, 8], 0.55);
  let rand = Math.floor(seed * 1e6) % 2147483647 || 7;
  const next = () => {
    rand = (rand * 16807) % 2147483647;
    return rand / 2147483647;
  };
  for (let k = 0; k < 46; k += 1) {
    const a = Math.PI + next() * Math.PI;
    const rho = Math.sqrt(next());
    const x = Math.cos(a) * rx * rho;
    const y = Math.sin(a) * h * rho;
    const size = w * (0.03 + 0.025 * next()) * (1.1 - 0.5 * rho);
    ctx.fillStyle = rgbCss(scale, 0.55 + 0.3 * next());
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.6, next() * Math.PI, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** A fringe of grass blades round a prop's foot, lime at their tips. */
function drawGrass(ctx, w, h) {
  const blade = h * 0.32;
  for (let k = 0; k < 7; k += 1) {
    const u = (k + 0.5) / 7 - 0.5;
    const x = u * w * 1.3;
    const len = blade * (0.6 + 0.4 * Math.abs(Math.sin(k * 2.7)));
    const lean = (u * 30 + Math.sin(k * 1.9) * 12) * DEG;
    const tx = x + Math.sin(lean) * len;
    const ty = -Math.cos(lean) * len;
    const g = ctx.createLinearGradient(x, 0, tx, ty);
    g.addColorStop(0, rgbCss(GRASS.deep, 1));
    g.addColorStop(1, rgbCss(GRASS.tip, 1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.035, 0);
    ctx.quadraticCurveTo(x + (tx - x) * 0.4, ty * 0.55, tx, ty);
    ctx.quadraticCurveTo(x + (tx - x) * 0.55, ty * 0.45, x + w * 0.035, 0);
    ctx.closePath();
    ctx.fill();
  }
}

const PROP_DRAWERS = Object.freeze({ apple: drawApple, root: drawRoot, mushroom: drawMushroom, dome: drawScaleDome });

/**
 * Giant props rising out of the ground round the defender (propPose), each stood up off its foot
 * and clipped at the ground line while it is still coming out of it.
 */
export function prop(ctx, lane, s, info) {
  const p = info.params;
  const centre = anchorPoint(lane, p.target, p.dx, p.dy);
  const draw = PROP_DRAWERS[p.kind] ?? drawApple;
  const items = propPose(s, lane.h, info.seed, { ...p, widthRatio: PROP_WIDTH[p.kind] ?? 1 });
  const { palette } = info.material;
  for (const item of items) {
    if (!(item.alpha > 0) || !(item.rise > 0.01)) continue;
    const x = centre.x + item.x;
    const y = centre.y + item.y;
    ctx.fxLift = standOn({ x, y });
    ctx.save();
    ctx.globalAlpha *= item.alpha;
    // The ground line: what has not come up yet is still under the cloth.
    ctx.beginPath();
    ctx.rect(x - item.width * 2, y - item.full * 2.5, item.width * 4, item.full * 2.5);
    ctx.clip();
    ctx.translate(x, y + item.full * (1 - item.rise));
    ctx.rotate(item.lean * DEG);
    draw(ctx, item.width, item.full, palette, item.seed);
    if (p.grass && p.kind !== 'root' && p.kind !== 'dome') drawGrass(ctx, item.width, item.full);
    ctx.restore();
  }
}

// ---- vine -------------------------------------------------------------------------------------

const VINE_SAMPLES = 16;

/** A vine as screen points from its root at the attacker to its tip, bowed `side` × bow h. */
function vinePoints(lane, pose, side) {
  const h = lane.h;
  const root = { x: lane.ax + lane.nx * side * 0.22 * h, y: lane.ay + lane.ny * side * 0.22 * h };
  const tip = lanePoint(lane, pose.f, side * 0.05 * h * (1 - pose.lashed));
  const bow = side * pose.bow * h;
  const out = [];
  for (let i = 0; i <= VINE_SAMPLES; i += 1) {
    const t = i / VINE_SAMPLES;
    const arch = Math.sin(Math.PI * t) * (1 - 0.35 * t);
    out.push({ x: root.x + (tip.x - root.x) * t + lane.nx * bow * arch, y: root.y + (tip.y - root.y) * t + lane.ny * bow * arch, t });
  }
  return out;
}

/** Vine thickness at `t` along it (0 root … 1 tip), × h. */
const vineWidth = (t) => 0.11 - 0.075 * t;

/**
 * One vine: a tapering green whip drawn as a tube (shadow side, body, a lit stripe toward the
 * light), leaves along it, and a bud at its tip glowing pink.
 */
function drawVine(ctx, points, h, palette, alpha, pulse) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes = [
    [VINE_GREEN.deep, 1, 0],
    [VINE_GREEN.body, 0.66, -0.08],
    [VINE_GREEN.hot, 0.2, -0.26],
  ];
  for (const [rgb, factor, shift] of passes) {
    ctx.strokeStyle = rgbCss(rgb, alpha);
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const width = h * vineWidth(a.t) * factor;
      ctx.lineWidth = Math.max(0.75, width);
      ctx.beginPath();
      ctx.moveTo(a.x + shift * width, a.y + shift * width);
      ctx.lineTo(b.x + shift * width, b.y + shift * width);
      ctx.stroke();
    }
  }
  // Leaves along it, turned alternately to each side.
  for (let k = 1; k <= 4; k += 1) {
    const i = Math.round((k / 5) * (points.length - 1));
    const a = points[i];
    const b = points[Math.min(points.length - 1, i + 1)];
    const along = Math.atan2(b.y - a.y, b.x - a.x);
    const out = along + (k % 2 ? 1 : -1) * 1.1;
    const len = h * (0.11 - 0.04 * a.t);
    const lx = a.x + Math.cos(out) * len;
    const ly = a.y + Math.sin(out) * len;
    const leaf = ctx.createLinearGradient(a.x, a.y, lx, ly);
    leaf.addColorStop(0, rgbCss(LEAF_GREEN.deep, alpha));
    leaf.addColorStop(1, rgbCss(LEAF_GREEN.hot, alpha));
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(a.x + Math.cos(out + 0.5) * len * 0.6, a.y + Math.sin(out + 0.5) * len * 0.6, lx, ly);
    ctx.quadraticCurveTo(a.x + Math.cos(out - 0.5) * len * 0.6, a.y + Math.sin(out - 0.5) * len * 0.6, a.x, a.y);
    ctx.fill();
  }
  // The bud: a pink halo, the bud itself lit, a hot heart.
  const tip = points[points.length - 1];
  const halo = h * 0.24 * pulse;
  const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, halo);
  glow.addColorStop(0, rgbCss(palette.hot, 0.55 * alpha));
  glow.addColorStop(0.4, rgbCss(palette.body, 0.3 * alpha));
  glow.addColorStop(1, rgbCss(palette.body, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, halo, 0, TAU);
  ctx.fill();
  const r = h * 0.075;
  const bud = ctx.createRadialGradient(tip.x - r * 0.35, tip.y - r * 0.35, 0, tip.x, tip.y, r);
  bud.addColorStop(0, rgbCss(palette.core, alpha));
  bud.addColorStop(0.5, rgbCss(palette.hot, alpha));
  bud.addColorStop(1, rgbCss(palette.deep, alpha));
  ctx.fillStyle = bud;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, r, 0, TAU);
  ctx.fill();
}

/** Venusaur's two vines rearing off the attacker and lashing down onto the defender (vinePose). */
export function vine(ctx, lane, s, info) {
  const pose = vinePose(s, info.params);
  if (!(pose.alpha > 0)) return;
  const { palette } = info.material;
  const pulse = 1 + 0.15 * Math.sin(info.time * 14);
  ctx.fxLift = travelLift({ x: lane.ax, y: lane.ay }, lanePoint(lane, Math.max(pose.f, 0.05)), { arc: 0.5 * (1 - pose.lashed) + 0.1 });
  for (const side of [-1, 1]) drawVine(ctx, vinePoints(lane, pose, side), lane.h, palette, pose.alpha, pulse);
}

// ---- tornado ----------------------------------------------------------------------------------

/**
 * The lane point `f` along the tube: it leaves the attacker's leading edge (it is blown off the
 * attacker, not wrapped round it) and ends on the defender's centre.
 */
const tubePoint = (lane, f, side = 0) => lanePoint(lane, f, side);

/** How flat a ring looks from the board camera: a circle across the lane seen nearly from above. */
const RING_SQUASH = 0.42;
const ARCS = 4;
/**
 * Each wind arc's passes, outermost first: palette key, width (h), alpha. Added over each other
 * where the rings crowd, so kept low: the tube must stay silver-blue, never sum to a white slab.
 */
const ARC_PASSES = Object.freeze([
  ['deep', 0.1, 0.3],
  ['body', 0.05, 0.36],
  ['hot', 0.018, 0.6],
]);

/** The tornado tube (tornadoPose): air down its axis, two helix strands, and rings of wind arcs. */
export function tornado(ctx, lane, s, info) {
  const p = info.params;
  const pose = tornadoPose(s, lane.h, { ...p, beatMs: info.beatMs });
  if (pose.rings.length === 0) return;
  const { palette } = info.material;
  ctx.fxLift = travelLift(tubePoint(lane, 0), tubePoint(lane, 1), { arc: LIFT.beamArc });
  ctx.lineCap = 'round';
  const tail = tubePoint(lane, pose.tail);
  const head = tubePoint(lane, pose.head);
  // The air inside the tube, so the rings read as one body: a deep core inside a paler sleeve.
  for (const [key, width, alpha] of [
    ['deep', 2.1, 0.08],
    ['body', 1.2, 0.05],
  ]) {
    ctx.strokeStyle = rgbCss(palette[key], alpha);
    ctx.lineWidth = pose.radius * width;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
  }
  // Two wind strands spiralling down it.
  for (const strand of [0, Math.PI]) {
    ctx.strokeStyle = rgbCss(palette.hot, 0.45);
    ctx.lineWidth = Math.max(1, lane.h * 0.022);
    ctx.beginPath();
    for (let i = 0; i <= 28; i += 1) {
      const f = pose.tail + ((pose.head - pose.tail) * i) / 28;
      const side = Math.sin(f * 5 * TAU - pose.turns + strand) * pose.radius * (0.7 + 0.5 * f) * 0.95;
      const at = tubePoint(lane, f, side);
      if (i === 0) ctx.moveTo(at.x, at.y);
      else ctx.lineTo(at.x, at.y);
    }
    ctx.stroke();
  }
  const turn = Math.atan2(lane.uy, lane.ux);
  for (const ring of pose.rings) {
    if (!(ring.alpha > 0)) continue;
    const c = tubePoint(lane, ring.f);
    for (let k = 0; k < ARCS; k += 1) {
      const a0 = ring.phase + (k * TAU) / ARCS;
      const sweep = 1.05;
      // Arcs on the near side of the ring (toward the camera) are brighter than the far ones.
      const near = 0.5 + 0.5 * Math.sin(a0 + sweep / 2);
      for (const [key, width, alpha] of ARC_PASSES) {
        ctx.strokeStyle = rgbCss(palette[key], alpha * ring.alpha * near);
        ctx.lineWidth = Math.max(1, lane.h * width);
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, ring.r * RING_SQUASH, ring.r, turn, a0, a0 + sweep);
        ctx.stroke();
      }
    }
  }
}

// ---- butterfly unit ---------------------------------------------------------------------------

/**
 * A glowing butterfly flying along `angleDeg` (units contract: palette colours only, framed, no
 * composite): two pairs of wings beating with `s`, hot at their roots, body-coloured at their edges.
 */
export function butterflyUnit(ctx, x, y, r, angleDeg, s, palette) {
  if (!(r > 0)) return;
  const beat = 0.35 + 0.65 * Math.abs(Math.sin(s * TAU * 6));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angleDeg + 90) * DEG);
  for (const side of [-1, 1]) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgbCss(palette.core, 0.95));
    g.addColorStop(0.45, rgbCss(palette.hot, 0.85));
    g.addColorStop(1, rgbCss(palette.body, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(side * r * 0.5 * beat, -r * 0.28, r * 0.55 * beat, r * 0.42, side * 0.5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(side * r * 0.38 * beat, r * 0.3, r * 0.4 * beat, r * 0.3, -side * 0.6, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = rgbCss(palette.deep, 0.9);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.08, r * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
