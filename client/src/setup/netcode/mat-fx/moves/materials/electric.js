// Design 063: the electric material (recipe in the design's § Materials). The elongated unit
// is a *jag*: a tapered polygon whose centre line is a polyline with joints thrown off the
// axis, re-rolled 22 times a second from a seeded generator so the arc flickers rather than
// slides. Three passes: a wide pale-blue glow (the one blurred fill), a yellow core at
// 0.45 w and a white centre at 0.15 w. The round unit is a crackling ball: a hot sphere with
// six short jags radiating; a projectile is the ball with jags streaming behind it. Bolts
// (the `bolt` drawer) stroke their polylines through `jagStroke` in the same three passes.
// Palette: #F7D21E #FFF27A #FFFFFF, deep #B98A00, the blue edge #9FD5FF. No grain, no smoke.
// Every call draws on the context it is handed and is otherwise pure.
//
// Design 075 slice 11: every fill and stroke runs the GPU `energy` style (`ctx.fxStyle`, ignored
// by Canvas2D): bolts carry bright packets running down them over a stepped flicker, fills
// crackle with thin filaments. The gain stays low so only the packets' centres bloom.
//
// Design 076: modifiers (`ctx.fxMod`, ignored by Canvas2D). A fast, fine crackle jitter runs
// through the glow and the yellow core of every jag and bolt (the white centre stays a clean
// line), the ball carries a charge grain, and every fill names the cyan-white dissolve edge.
//
// Design 076 § Depth: a bolt is a lit tube (gpu-canvas `volume`: a stroke shades round its
// width), a gold body with a white-hot centre riding above it and a soft halo below; the ball is
// a lit sphere inside a thin fresnel shell of charge. Each pass stands at its own height over the
// drawer's lift (halo lowest, centre highest), so the camera sees the layers part and the cast
// pass pools each one's light on the cloth at its own offset.
import { rgbCss } from '../../fx-colors.mjs';
import { seededRandom } from '../../flow-pose.mjs';
import { mergeFxMods, withFxMod, withLiftZ } from './_mods.js';
import { rootFaded } from './_root-fade.js';
import { grainPass, sphere } from './_shared.js';

const TAU = Math.PI * 2;
const REROLL_HZ = 22;
const BALL_JAGS = 6;
const GLOW_BLUR = 0.1;
const STROKE_BLUR = 0.12;
const CORE_WIDTH = 0.45;
const CENTRE_WIDTH = 0.15;
const BOLT_GLOW = 3.2;
const BOLT_CENTRE = 0.3;
// Style params (gpu-canvas STYLE_PARAMS energy): fast current; the halo only shimmers.
const ENERGY = Object.freeze({ id: 'energy', streak: 0.6, speed: 5, gain: 0.7 });
const ENERGY_HALO = Object.freeze({ id: 'energy', streak: 0.35, speed: 3, gain: 0 });

// Crackle: small, fast, fine-grained, so it reads as jitter and never as a wave.
const crackleMod = (strength, speed, scale) => Object.freeze({ distort: Object.freeze({ strength, speed, scale, angle: 0 }) });
const CRACKLE_HALO = crackleMod(0.1, 6, 6);
const CRACKLE_CORE = crackleMod(0.06, 7, 8);
const CHARGED_AIR = crackleMod(0.1, 4, 4);
const CHARGE_GRAIN = Object.freeze({
  distort: Object.freeze({ strength: 0.08, speed: 5, scale: 6, angle: 0 }),
  detail: Object.freeze({ amount: 0.45, speed: 3, scale: 5, angle: -90 }),
});

// Heights (lane units) over the drawer's lift: the cloth-hugging glow, the halo, the body, the
// white centre and the crackle on top.
const Z_AIR = 0.01;
const Z_HALO = 0.04;
const Z_BODY = 0.07;
const Z_CENTRE = 0.09;
const Z_SPARK = 0.1;
// Lit solids: the tube's edges fall to amber (low ambient) and its crest glints white; the
// centre is mostly emissive; the ball is a sphere with a rim; the shell is nearly all rim.
const TUBE = Object.freeze({ volume: Object.freeze({ amount: 1, spec: 0.5, rim: 0.25, ambient: 0.18, light: 120, bump: 0.15 }) });
const CENTRE_TUBE = Object.freeze({ volume: Object.freeze({ amount: 0.6, spec: 1, rim: 0.15, ambient: 0.65, light: 120, bump: 0 }) });
const ORB = Object.freeze({ volume: Object.freeze({ amount: 1, spec: 0.55, rim: 0.55, ambient: 0.25, light: 120, bump: 0.2 }) });
const SHELL = Object.freeze({ volume: Object.freeze({ amount: 1, spec: 0.4, rim: 1, ambient: 0.1, light: 120, bump: 0 }) });
const SHELL_SCALE = 1.35;
// The filament wrapping a bolt: sway (tube widths), one turn per WRAP_TURN widths, sampled every
// WRAP_STEP widths; its front runs ride over the bolt, its back runs sink under it.
const WRAP_REACH = 0.75;
const WRAP_TURN = 7;
const WRAP_STEP = 0.5;
const WRAP_WIDTH = 0.2;
const Z_WRAP_BACK = 0.03;
const Z_WRAP_FRONT = 0.11;
const BOLT_BODY = 1.8;

/** `draw` at `z` lane units over the current lift with `mod` merged over the current fxMod. */
const layered = (ctx, z, mod, draw) => withLiftZ(ctx, z, () => withFxMod(ctx, mod, draw));

const freezeAll = (palette) => Object.freeze(Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, Object.freeze(v)])));

const PALETTE = freezeAll({
  deep: [185, 138, 0],
  body: [247, 210, 30],
  hot: [255, 242, 122],
  core: [255, 251, 222],
  white: [255, 255, 255],
  edge: [159, 213, 255],
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rad = (deg) => (deg * Math.PI) / 180;

/** A generator for one flicker frame: the same (seed, time bucket) always rolls the same jags. */
const flickerRandom = (seed, time) => seededRandom(Math.floor(seed * 1013) + Math.floor(time * REROLL_HZ) * 7919);

/**
 * A filament spiralling round a bolt's polyline (`line`, [[x, y]…]) of tube width `width`: it
 * sways `WRAP_REACH` w either side of the line, one turn every `WRAP_TURN` w of length, starting
 * at `phase` radians. Runs where it passes in front of the tube (sin of its angle ≥ 0) and behind
 * it are split apart, so a caller can lift the front over the bolt and sink the back under it.
 * Lines under two points, or a width that is not positive, wrap nothing.
 * @returns {{front: number[][][], back: number[][][]}}
 */
export function wrapStrand(line, width, phase = 0) {
  const front = [];
  const back = [];
  if (!Array.isArray(line) || line.length < 2 || !(width > 0)) return { front, back };
  const step = Math.max(1, width * WRAP_STEP);
  let travelled = 0;
  let run = null;
  let runFront = null;
  const push = (x, y, angle) => {
    const isFront = Math.sin(angle) >= 0;
    if (run === null || isFront !== runFront) {
      const joint = run?.at(-1);
      run = joint ? [joint] : [];
      runFront = isFront;
      (isFront ? front : back).push(run);
    }
    run.push([x, y]);
  };
  for (let i = 0; i < line.length - 1; i += 1) {
    const [x0, y0] = line[i];
    const [x1, y1] = line[i + 1];
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (!(length > 0)) continue;
    const nx = -(y1 - y0) / length;
    const ny = (x1 - x0) / length;
    const samples = Math.max(1, Math.ceil(length / step));
    for (let k = i === 0 ? 0 : 1; k <= samples; k += 1) {
      const f = k / samples;
      const angle = phase + (TAU * (travelled + f * length)) / (WRAP_TURN * width);
      const sway = Math.cos(angle) * WRAP_REACH * width;
      push(x0 + (x1 - x0) * f + nx * sway, y0 + (y1 - y0) * f + ny * sway, angle);
    }
    travelled += length;
  }
  return { front: front.filter((r) => r.length > 1), back: back.filter((r) => r.length > 1) };
}

/**
 * One jag's centre line from its base (x, y) along `angleDeg`: `segments` joints thrown
 * ±amplitude across the axis (amplitude 0.35-0.7 w as `jag` goes 0-1, never more than
 * 0.18 of the length), both ends on the axis. Each point carries the joint normal (the mean
 * of its two segments') and the half-width, tapering from 0.5 w at the base to 0 at the tip.
 * @returns {{x: number, y: number, nx: number, ny: number, half: number}[]}
 */
export function jagOutline({ x, y, angleDeg, length, width, time, seed }, { jag = 0, segments } = {}) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const count = segments ?? Math.max(3, Math.min(10, Math.round(length / Math.max(width * 0.6, 1))));
  const amplitude = Math.min(width * (0.35 + 0.35 * clamp01(jag)), length * 0.18);
  const rand = flickerRandom(seed, time);
  const centre = [];
  for (let i = 0; i <= count; i += 1) {
    const f = i / count;
    const off = i === 0 || i === count ? 0 : (rand() * 2 - 1) * amplitude;
    centre.push([x + ux * f * length - uy * off, y + uy * f * length + ux * off]);
  }
  const segmentNormal = (i) => {
    const [x0, y0] = centre[i];
    const [x1, y1] = centre[i + 1];
    const d = Math.hypot(x1 - x0, y1 - y0) || 1;
    return [-(y1 - y0) / d, (x1 - x0) / d];
  };
  return centre.map(([px, py], i) => {
    const before = segmentNormal(Math.max(0, i - 1));
    const after = segmentNormal(Math.min(count - 1, i));
    const mx = before[0] + after[0];
    const my = before[1] + after[1];
    const m = Math.hypot(mx, my) || 1;
    return { x: px, y: py, nx: mx / m, ny: my / m, half: 0.5 * width * (1 - i / count) ** 0.7 };
  });
}

/** The electric material drawn in `palette` (any palette with the same keys). */
function electricKit(palette) {
  const edge = Object.freeze({ dissolve: Object.freeze({ edge: palette.edge, width: 0.08, gain: 1.6 }) });
  /** `draw` with this kit's dissolve edge named for every fill it makes. */
  const edged = (draw) => (ctx, ...args) =>
    ctx && typeof ctx === 'object' ? withFxMod(ctx, edge, () => draw(ctx, ...args)) : draw(ctx, ...args);

  /** Trace a jag outline as a closed polygon, its width scaled by `scale`. */
  function traceJag(ctx, points, scale) {
    ctx.beginPath();
    points.forEach((p, i) => {
      const px = p.x + p.nx * p.half * scale;
      const py = p.y + p.ny * p.half * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    for (let i = points.length - 2; i >= 0; i -= 1) {
      const p = points[i];
      ctx.lineTo(p.x - p.nx * p.half * scale, p.y - p.ny * p.half * scale);
    }
    ctx.closePath();
  }

  /** Static charge in the air: a pale core through yellow to a faint blue fringe. */
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.hot, alpha * 0.55));
    g.addColorStop(0.4, rgbCss(palette.body, alpha * 0.3));
    g.addColorStop(0.75, rgbCss(palette.edge, alpha * 0.18));
    g.addColorStop(1, rgbCss(palette.edge, 0));
    ctx.fillStyle = g;
    ctx.fxStyle = ENERGY_HALO;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    layered(ctx, Z_AIR, CHARGED_AIR, () => ctx.fill());
    ctx.fxStyle = null;
  }

  /** Six short two-kink jags radiating off a ball, all in one path, blue fringe then white. */
  function crackle(ctx, x, y, r, alpha, rand) {
    ctx.beginPath();
    const turn = rand() * TAU;
    for (let k = 0; k < BALL_JAGS; k += 1) {
      const a = turn + (k / BALL_JAGS) * TAU + (rand() - 0.5) * 0.6;
      const reach = r * (1.3 + 0.45 * rand());
      const start = r * 0.75;
      ctx.moveTo(x + Math.cos(a) * start, y + Math.sin(a) * start);
      for (const f of [0.45, 1]) {
        const d = start + (reach - start) * f;
        const kink = f < 1 ? (rand() - 0.5) * 0.7 : (rand() - 0.5) * 0.3;
        ctx.lineTo(x + Math.cos(a + kink) * d, y + Math.sin(a + kink) * d);
      }
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fxStyle = ENERGY;
    ctx.strokeStyle = rgbCss(palette.edge, 0.55 * alpha);
    ctx.lineWidth = Math.max(1, r * 0.12);
    layered(ctx, Z_SPARK, TUBE, () => ctx.stroke());
    ctx.strokeStyle = rgbCss(palette.white, 0.9 * alpha);
    ctx.lineWidth = Math.max(1, r * 0.05);
    layered(ctx, Z_SPARK, CENTRE_TUBE, () => ctx.stroke());
    ctx.fxStyle = null;
  }

  /**
   * The crackling ball: a small white heart fading through yellow to amber, jags round it. The
   * white stays inside a quarter of the radius so a big ball reads as a ball, not a white slab.
   */
  function crackleBall(ctx, x, y, r, alpha, hot, rand) {
    ctx.fxStyle = ENERGY;
    // The shell: clear inside, a thin bright skin at its edge, lit almost only by its rim.
    layered(ctx, Z_HALO, SHELL, () =>
      sphere(
        ctx,
        x,
        y,
        r * SHELL_SCALE,
        [
          [0, palette.edge, 0],
          [0.62, palette.body, 0],
          [0.88, palette.hot, alpha * 0.22],
          [1, palette.edge, 0],
        ],
        0
      )
    );
    // Less white than a flat ball: the light (lambert, glint, limb) does the modelling, and a
    // white slab would bloom it away.
    layered(ctx, Z_BODY, mergeFxMods(CHARGE_GRAIN, ORB), () =>
      sphere(ctx, x, y, r, [
        [0, palette.white, alpha * (0.3 + 0.3 * clamp01(hot))],
        [0.25, palette.hot, alpha * 0.65],
        [0.7, palette.body, alpha * 0.55],
        [0.92, palette.deep, alpha * 0.3],
        [1, palette.deep, 0],
      ])
    );
    ctx.fxStyle = null;
    crackle(ctx, x, y, r, alpha, rand);
  }

  // The interface's `body` carries no clock, so its jags are rolled from where the ball is
  // and how big it is: a growing or travelling ball crackles, a resting one holds its jags.
  /** A crackling ball of radius `r`; `hot` whitens its core. */
  function body(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    crackleBall(ctx, x, y, r, alpha, hot, seededRandom(Math.floor(x / 3) * 92821 + Math.floor(y / 3) * 68917 + Math.floor(r / 2) * 4111));
  }

  /**
   * One jag from its base along `angleDeg`: blurred blue glow, yellow core, white centre, each
   * clear at the root so a fan of jags (a flare, a ball's trail) never stacks into a white disc.
   */
  function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    const points = jagOutline(spec, { jag });
    ctx.filter = `blur(${Math.max(1, spec.width * GLOW_BLUR).toFixed(1)}px)`;
    ctx.fxStyle = ENERGY_HALO;
    ctx.fillStyle = rootFaded(ctx, spec, palette.edge, 0.45 * alpha);
    traceJag(ctx, points, 1);
    layered(ctx, Z_HALO, CRACKLE_HALO, () => ctx.fill());
    ctx.filter = 'none';
    ctx.fxStyle = ENERGY;
    ctx.fillStyle = rootFaded(ctx, spec, palette.body, 0.95 * alpha);
    traceJag(ctx, points, CORE_WIDTH);
    layered(ctx, Z_BODY, CRACKLE_CORE, () => ctx.fill());
    const centre = alpha * clamp01(hot);
    if (centre > 0) {
      ctx.fillStyle = rootFaded(ctx, spec, palette.white, centre);
      traceJag(ctx, points, CENTRE_WIDTH);
      withLiftZ(ctx, Z_CENTRE, () => ctx.fill());
    }
    ctx.fxStyle = null;
  }

  /**
   * A spark in flight along `headingDeg`: a halo, `tongues` jags streaming behind it (0 = a
   * bare ball), and the crackling ball itself, re-rolled on the material's flicker clock.
   */
  function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    const rand = flickerRandom(seed, time);
    glow(ctx, x, y, r * 2.2, 0.4 * alpha);
    const back = headingDeg + 180;
    for (let k = 0; k < tongues; k += 1) {
      const spread = tongues > 1 ? -28 + (56 * k) / (tongues - 1) : 0;
      const jitter = (rand() - 0.5) * 16;
      tongue(
        ctx,
        { x, y, angleDeg: back + spread + jitter, length: r * (1.8 + 0.8 * rand()), width: r * 0.55, time, seed: seed + k * 2.1 },
        { alpha: alpha * 0.85, hot: hot * 0.8, jag: 0.5 }
      );
    }
    crackleBall(ctx, x, y, r, alpha, hot, rand);
  }

  /**
   * Stroke jagged polylines (`lines` = [[x, y]...][]) as lightning: one blurred glow at `width`
   * x 3.2, the lit gold tube at `width` x 1.8, a white centre at `width` x 0.3, and a filament
   * wrapping the tube (its back under, its front over). Under the additive pass these sum toward
   * white, so the glow stays faint (0.25), the tube is the deep yellow at 0.75 with a soft glint,
   * and the centre 0.6, or the bolt reads as a white ribbon and its shading is lost (design 076
   * § Depth: the first depth capture did exactly that).
   */
  function jagStroke(ctx, lines, { width, alpha = 1 }) {
    if (!(width > 0) || !(alpha > 0) || !lines?.length) return;
    const trace = () => {
      ctx.beginPath();
      for (const line of lines) line.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const glowWidth = width * BOLT_GLOW;
    ctx.filter = `blur(${Math.max(1, glowWidth * STROKE_BLUR).toFixed(1)}px)`;
    ctx.fxStyle = ENERGY_HALO;
    // The move's own hot colour (design 075 parity): the pale-blue edge bloomed every bolt white-cyan,
    // where Scarlet/Violet's thunder is yellow; a tinted bolt (cyan, violet) still follows its tint.
    ctx.strokeStyle = rgbCss(palette.hot, 0.25 * alpha);
    ctx.lineWidth = glowWidth;
    trace();
    layered(ctx, Z_HALO, CRACKLE_HALO, () => ctx.stroke());
    ctx.filter = 'none';
    ctx.fxStyle = ENERGY;
    // A filament wraps the bolt: its back runs dim under the tube, its front runs bright over it,
    // so the bolt reads as a round thing with something going round it. Re-rolled with the bolt.
    const tube = Math.max(1.5, width * BOLT_BODY);
    const strands = lines.map((line) => wrapStrand(line, tube, (line[0]?.[0] ?? 0) * 0.37 + (line[0]?.[1] ?? 0) * 0.23));
    const strokeRuns = (runs) => {
      ctx.beginPath();
      for (const run of runs) run.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    };
    ctx.lineWidth = Math.max(1, tube * WRAP_WIDTH);
    ctx.strokeStyle = rgbCss(palette.hot, 0.35 * alpha);
    strokeRuns(strands.flatMap((s) => s.back));
    withLiftZ(ctx, Z_WRAP_BACK, () => ctx.stroke());
    // The body is a lit gold tube a little wider than the drawer's width, so its shading reads.
    // No crackle on the tube: a warped read smears its shading; the halo carries the jitter.
    ctx.strokeStyle = rgbCss(palette.body, 0.75 * alpha);
    ctx.lineWidth = tube;
    trace();
    layered(ctx, Z_BODY, TUBE, () => ctx.stroke());
    ctx.strokeStyle = rgbCss(palette.white, 0.6 * alpha);
    ctx.lineWidth = Math.max(1, width * BOLT_CENTRE);
    layered(ctx, Z_CENTRE, CENTRE_TUBE, () => ctx.stroke());
    ctx.lineWidth = Math.max(1, tube * WRAP_WIDTH);
    ctx.strokeStyle = rgbCss(palette.hot, 0.6 * alpha);
    strokeRuns(strands.flatMap((s) => s.front));
    layered(ctx, Z_WRAP_FRONT, CENTRE_TUBE, () => ctx.stroke());
    ctx.fxStyle = null;
  }

  return Object.freeze({
    key: 'electric',
    palette,
    // A storm-slate darkening: the bolts read against it without tinting the board yellow.
    shade: Object.freeze([18, 20, 38]),
    smoke: null,
    particle: Object.freeze({ className: 'fx-particle--streak', color: rgbCss(palette.hot), aspect: 0.2 }),
    glow: edged(glow),
    body: edged(body),
    tongue: edged(tongue),
    projectile: edged(projectile),
    jagStroke: edged(jagStroke),
    grain: grainPass,
    withPalette: (p) => electricKit(p),
  });
}

export const electric = electricKit(PALETTE);
