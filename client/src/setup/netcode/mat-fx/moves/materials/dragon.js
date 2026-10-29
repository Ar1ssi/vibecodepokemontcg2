// Design 063: the dragon material (recipe in the design's § Materials). The elongated unit is
// fire's tongue in the dragon palette: a blurred violet body, a lilac mid, and an *ember* core
// (the recipe's orange `hot` override), composited additively so the core reads as a white-hot
// pink at the heart of a violet flame. `jag` makes it a dragon scale: an angular shard with
// the same three passes. The round unit is a dragon orb, a violet sphere with a two-strand
// helix churning inside it; a projectile is the orb trailing flame tongues (a meteor when it
// falls from the sky). Palette #8034CE #E25CD6 #FFB8F0, deep #34166E (design 075 parity; was #5A47C9 #8F7CF5 #D2C8FF), accent #FF9B3D; grain
// 0.25. Every call draws on the context it is handed and is otherwise pure.
//
// Design 078: modifiers (`ctx.fxMod`, ignored by Canvas2D). The violet flame and the orb waver
// like plasma and carry a streaming energy grain; the ember core and the helix stay crisp, and
// every fill names the magenta dissolve edge.
//
// Design 078 § Depth: the violet flame is lit as lumpy plasma (gpu-canvas `volume` on its solid
// fills: a bumped sheet), the orb is a glossy lit sphere and its helix strands are lit tubes
// riding above it; every pass stands at its own height over the drawer's lift, so the ember core
// sits on top of the flame and the cast pass pools violet light on the cloth.
import { rgbCss } from '../../fx-colors.mjs';
import { mergeFxMods, withFxMod, withLiftZ } from './_mods.js';
import { grainPass, shardOutline, sphere, styledKit, tongueOutline, traceOutline, wobble } from './_shared.js';

// Design 075 slices 12–14: GPU styles by paint kind (styledKit, _shared.js).
// Draconic energy: tongues crawl with current, the core boils.
const DRACONIC = Object.freeze({ byKind: { linear: { id: 'energy', streak: 0.4, speed: 1.6, gain: 0.6 }, radial: { id: 'orb', boil: 0.4, limb: 0.35, gain: 0.8 }, stroke: { id: 'energy', streak: 0.4, speed: 1.6, gain: 0.6 } } });

// Plasma wavers slower and wider than fire's haze; the grain streams along each tongue.
const PLASMA_BODY = Object.freeze({ strength: 0.16, speed: 0.9, scale: 2.5, angle: 0 });
const PLASMA_MID = Object.freeze({ strength: 0.11, speed: 1.1, scale: 3, angle: 0 });
const PLASMA_CORE = Object.freeze({ distort: Object.freeze({ strength: 0.06, speed: 1.3, scale: 3.5, angle: 0 }) });
const PLASMA_HALO = Object.freeze({ distort: Object.freeze({ strength: 0.14, speed: 0.7, scale: 2, angle: 0 }) });
const ORB_CHURN = Object.freeze({
  distort: Object.freeze({ strength: 0.1, speed: 0.8, scale: 2.5, angle: 0 }),
  detail: Object.freeze({ amount: 0.4, speed: 0.7, scale: 3.5, angle: -90 }),
});
// Heights (lane units) over the drawer's lift.
const Z_HALO = 0.01;
const Z_BODY = 0.03;
const Z_MID = 0.05;
const Z_CORE = 0.07;
const Z_ORB = 0.06;
const Z_HELIX = 0.09;
const PLASMA_SHEET = Object.freeze({ amount: 0.6, spec: 0.6, rim: 0.45, ambient: 0.3, light: 120, bump: 0.7, bumpScale: 4 });
const MID_SHEET = Object.freeze({ ...PLASMA_SHEET, amount: 0.45 });
const GLOSSY_ORB = Object.freeze({ volume: Object.freeze({ amount: 0.85, spec: 0.45, rim: 0.6, ambient: 0.3, light: 120, bump: 0.25 }) });
const HELIX_TUBE = Object.freeze({ volume: Object.freeze({ amount: 0.85, spec: 0.9, rim: 0.3, ambient: 0.35, light: 120, bump: 0 }) });
/** `draw` at `z` lane units over the current lift with `mod` merged over the current fxMod. */
const layered = (ctx, z, mod, draw) => withLiftZ(ctx, z, () => withFxMod(ctx, mod, draw));
const plasma = (warp, grain, angleDeg) => ({ distort: warp, detail: { amount: grain, speed: 1.2, scale: 4.5, angle: angleDeg } });

const TAU = Math.PI * 2;
const HELIX_SAMPLES = 10;
const HELIX_SPAN = 0.72;
const HELIX_AMP = 0.32;
const HELIX_WAVES = 1.5;
const HELIX_TILT = -35;
const HELIX_HZ = 0.6;
const HELIX_MIN_R = 3;
const TRAIL_SPREAD = 70;

// Design 075 parity: Scarlet/Violet's dragon moves run violet to magenta-pink; the old blue-violet
// with a near-white core bloomed white in the 3D board.
const PALETTE = Object.freeze({
  deep: Object.freeze([52, 22, 110]),
  body: Object.freeze([128, 52, 206]),
  hot: Object.freeze([226, 92, 214]),
  core: Object.freeze([255, 184, 240]),
  white: Object.freeze([255, 255, 255]),
  ember: Object.freeze([255, 155, 61]),
});

/**
 * The helix inside a dragon orb of radius `r`: two sine strands, one the mirror of the other,
 * running `HELIX_SPAN` r either side of the centre and pinched to nothing at the ends so they
 * stay inside 0.8 r; `phase` (radians) turns them, `tiltDeg` leans the whole helix. Points are
 * offsets from the orb's centre, px.
 * @returns {number[][][]} two polylines
 */
export function helixStrands(r, phase, tiltDeg = HELIX_TILT) {
  if (!(r > 0)) return [[], []];
  const a = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [1, -1].map((sign) => {
    const points = [];
    for (let i = 0; i <= HELIX_SAMPLES; i += 1) {
      const u = (i / HELIX_SAMPLES) * 2 - 1;
      const x = u * HELIX_SPAN * r;
      const y = sign * HELIX_AMP * r * Math.sin(Math.PI * HELIX_WAVES * u + phase) * Math.sqrt(1 - u * u);
      points.push([x * cos - y * sin, x * sin + y * cos]);
    }
    return points;
  });
}

/** The dragon material drawn in `palette` (any palette with the same keys). */
function dragonKit(palette) {
  const edge = Object.freeze({ dissolve: Object.freeze({ edge: palette.hot, width: 0.12, gain: 1.6 }) });
  /** `draw` with this kit's dissolve edge named for every fill it makes. */
  const edged = (draw) => (ctx, ...args) =>
    ctx && typeof ctx === 'object' ? withFxMod(ctx, edge, () => draw(ctx, ...args)) : draw(ctx, ...args);

  /** A soft violet halo fading through deep to nothing. */
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.hot, alpha * 0.8));
    g.addColorStop(0.55, rgbCss(palette.body, alpha * 0.4));
    g.addColorStop(1, rgbCss(palette.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    layered(ctx, Z_HALO, PLASMA_HALO, () => ctx.fill());
  }

  /**
   * A dragon orb: a white-cored violet sphere with the helix churning inside it (ember and core
   * strands). `hot` dims the white heart; `time` (the scene clock, s) turns the helix, and a
   * growing orb churns as it swells.
   */
  function body(ctx, x, y, r, alpha, hot = 1, time = 0) {
    if (!(r > 0) || !(alpha > 0)) return;
    // A dimmer white heart than the flat orb had: lit, the sphere models itself, and a full white
    // heart bloomed it into a white disc (design 078 § Depth capture).
    layered(ctx, Z_ORB, mergeFxMods(ORB_CHURN, GLOSSY_ORB), () =>
      sphere(ctx, x, y, r, [
        [0, palette.white, alpha * hot * 0.5],
        [0.25, palette.core, alpha * 0.8],
        [0.6, palette.hot, alpha * 0.9],
        [0.85, palette.body, alpha * 0.6],
        [1, palette.deep, 0],
      ])
    );
    if (r < HELIX_MIN_R) return;
    const phase = TAU * HELIX_HZ * time + r * 0.05;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, r * 0.07);
    helixStrands(r, phase).forEach((strand, index) => {
      ctx.strokeStyle = rgbCss(index === 0 ? palette.ember : palette.core, 0.85 * alpha);
      ctx.beginPath();
      strand.forEach(([dx, dy], i) => (i === 0 ? ctx.moveTo(x + dx, y + dy) : ctx.lineTo(x + dx, y + dy)));
      layered(ctx, Z_HELIX, HELIX_TUBE, () => ctx.stroke());
    });
  }

  /** The outline of one pass at `scale`: a flickering flame tongue, or a straight-edged scale. */
  const passOutline = (spec, scale, jag) =>
    jag
      ? shardOutline({ ...spec, length: spec.length * (0.85 + 0.15 * scale), width: spec.width * scale })
      : tongueOutline(spec, scale);

  /** Three-pass dragon flame: blurred violet body, lilac mid, ember core. `hot` dims the core. */
  function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    // One blurred pass only: canvas blur is the costly call (design § Constraints).
    ctx.filter = `blur(${Math.max(1, spec.width * 0.12).toFixed(1)}px)`;
    ctx.fillStyle = rgbCss(palette.body, 0.65 * alpha);
    traceOutline(ctx, passOutline(spec, 1, jag));
    layered(ctx, Z_BODY, { ...plasma(PLASMA_BODY, 0.5, spec.angleDeg), volume: PLASMA_SHEET }, () => ctx.fill());
    ctx.filter = 'none';
    ctx.fillStyle = rgbCss(palette.hot, 0.8 * alpha);
    traceOutline(ctx, passOutline(spec, 0.66, jag));
    layered(ctx, Z_MID, { ...plasma(PLASMA_MID, 0.35, spec.angleDeg), volume: MID_SHEET }, () => ctx.fill());
    if (!(hot > 0)) return;
    ctx.fillStyle = rgbCss(palette.ember, 0.85 * alpha * Math.min(1, hot));
    traceOutline(ctx, passOutline({ ...spec, seed: spec.seed + 0.5 }, 0.38, jag));
    layered(ctx, Z_CORE, PLASMA_CORE, () => ctx.fill());
  }

  /**
   * The orb travelling along `headingDeg`: a violet glow, `tongues` flame tongues streaming
   * behind it over ±`TRAIL_SPREAD`/2 degrees (the longest straight behind), then the orb.
   */
  function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 5, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 2.3, 0.4 * alpha);
    const back = headingDeg + 180;
    for (let k = 0; k < tongues; k += 1) {
      const spread = tongues > 1 ? -TRAIL_SPREAD / 2 + (TRAIL_SPREAD * k) / (tongues - 1) : 0;
      const jitter = 6 * wobble(k * 0.41, time, seed + k);
      const length = r * (1.6 + 1.1 * (1 - Math.abs(spread) / TRAIL_SPREAD)) * (0.85 + 0.3 * Math.abs(Math.sin(seed * 2.3 + k * 1.7)));
      tongue(
        ctx,
        { x, y, angleDeg: back + spread + jitter, length, width: r * 0.95, time, seed: seed + k * 2.3 },
        { alpha: alpha * 0.9, hot: hot * 0.7 }
      );
    }
    body(ctx, x, y, r, alpha, hot, time);
  }

  return Object.freeze({
    key: 'dragon',
    palette,
    // A violet-black, kept local to a card.
    shade: Object.freeze([20, 12, 48]),
    smoke: Object.freeze([90, 70, 120]),
    particle: Object.freeze({ className: 'fx-particle--ember', color: rgbCss(palette.ember), aspect: 0.3 }),
    glow: edged(glow),
    body: edged(body),
    tongue: edged(tongue),
    projectile: edged(projectile),
    grain: grainPass,
    withPalette: (p) => dragonKit(p),
  });
}

export const dragon = styledKit(dragonKit(PALETTE), DRACONIC);
