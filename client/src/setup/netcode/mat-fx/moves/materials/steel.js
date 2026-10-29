// Design 063: the steel material (recipe in the design's § Materials). The elongated unit is a
// *blade*: straight-edged, no wobble, a flat heel widening to its shoulder, parallel edges and a
// needle point, brushed across its width from a bright edge to a dark one, a cool blue halo at its
// edges and one white specular line running its length; `jag` makes it an angular splinter of
// metal. The round unit is a metal sphere with a hard highlight and a cool blue rim. A
// projectile is the recipe's tight white-blue beam core: a hard sphere trailing one long streak
// and a few short spark blades. The sigil is a targeting reticle that turns and locks (Smart
// Strike). Palette #9AA7B8 #D5DEEA #FFFFFF, deep #4A5563, cool edge #9FC5F0. No grain. Every
// call draws on the context it is handed and is otherwise pure.
//
// Design 078: modifiers (`ctx.fxMod`, ignored by Canvas2D). Metal is rigid, so nothing on a
// blade or sphere warps: a slow brushed grain runs along the blade body and over the sphere, a
// faint cool shimmer moves in the halos, the specular line and rim stay clean, and every fill
// names the cool-blue dissolve edge (a thin, cold sliver).
//
// Design 078 § Depth: the metal sphere is lit as polished metal (gpu-canvas `volume`: hard glint,
// cool rim, little bump) with its rim a lit tube; a blade's halo, body and specular line stand at
// rising heights over the drawer's lift. The blade body keeps its own brushed gradient lighting:
// its gradient runs across the blade, so the volume tube would wrap the wrong axis.
import { rgbCss } from '../../fx-colors.mjs';
import { mergeFxMods, withFxMod, withLiftZ } from './_mods.js';
import { grainPass, shardOutline, sphere, styledKit, traceOutline } from './_shared.js';

// Design 075 slices 12–14: GPU styles by paint kind (styledKit, _shared.js).
// Polished metal: hard facets with a glint sweeping each blade; edges carry running glints.
const METAL = Object.freeze({ byKind: { linear: { id: 'crystal', facets: 3, sheen: 0.8, speed: 1.6 }, radial: { id: 'crystal', facets: 6, sheen: 0.5, speed: 1.2 }, stroke: { id: 'crystal', sheen: 0.7, speed: 1.6 } } });

const COOL_SHIMMER = Object.freeze({ distort: Object.freeze({ strength: 0.06, speed: 0.8, scale: 2.5, angle: 0 }) });
const SPHERE_BRUSH = Object.freeze({ detail: Object.freeze({ amount: 0.25, speed: 0.3, scale: 5, angle: 0 }) });
const bladeBrush = (angleDeg) => ({ detail: { amount: 0.3, speed: 0.4, scale: 6, angle: angleDeg } });

// Heights (lane units) over the drawer's lift.
const Z_HAZE = 0.01;
const Z_HALO = 0.02;
const Z_BLADE = 0.04;
const Z_SPECULAR = 0.06;
const Z_SPHERE = 0.05;
const Z_RIM = 0.07;
const POLISHED = Object.freeze({ volume: Object.freeze({ amount: 1, spec: 1.2, rim: 0.6, ambient: 0.3, light: 120, bump: 0.05 }) });
const RIM_TUBE = Object.freeze({ volume: Object.freeze({ amount: 0.8, spec: 1, rim: 0.3, ambient: 0.4, light: 120, bump: 0 }) });
/** `draw` at `z` lane units over the current lift with `mod` merged over the current fxMod. */
const layered = (ctx, z, mod, draw) => withLiftZ(ctx, z, () => withFxMod(ctx, mod, draw));

const TAU = Math.PI * 2;
const HEEL = 0.22;
const SHOULDER_AT = 0.16;
const TIP_WIDTHS = 2.5;
const TIP_MAX = 0.35;
const HALO_WIDTH = 1.5;
const HALO_ALPHA = 0.45;
const HALO_BLUR = 0.1;
const SPECULAR_REACH = 0.88;
const TRAIL_LENGTH = 3.4;
const SPARK_SPREAD = 16;
const RETICLE_TICKS = 4;
const RETICLE_TURN = 90;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rad = (deg) => (deg * Math.PI) / 180;

const PALETTE = Object.freeze({
  deep: Object.freeze([74, 85, 99]),
  body: Object.freeze([154, 167, 184]),
  hot: Object.freeze([213, 222, 234]),
  edge: Object.freeze([159, 197, 240]),
  core: Object.freeze([236, 242, 250]),
  white: Object.freeze([255, 255, 255]),
});

/**
 * A blade's outline: a flat heel `HEEL` w wide, full width (w) from `SHOULDER_AT` of its
 * length, parallel edges, then a needle point `TIP_WIDTHS` w long (at most `TIP_MAX` of the
 * length, so a long beam stays a bar and does not read as a cone). `left` is the edge on the
 * direction's left normal, heel to tip; both edges end at the tip.
 * @returns {{left: number[][], right: number[][]}}
 */
export function bladeOutline({ x, y, angleDeg, length, width }) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const at = (f, side) => [x + ux * length * f + nx * side, y + uy * length * f + ny * side];
  const taperFrom = Math.max(SHOULDER_AT, 1 - Math.min((TIP_WIDTHS * width) / length, TIP_MAX));
  const tip = at(1, 0);
  return {
    left: [at(0, width * HEEL), at(SHOULDER_AT, width * 0.5), at(taperFrom, width * 0.5), tip],
    right: [at(0, -width * HEEL), at(SHOULDER_AT, -width * 0.5), at(taperFrom, -width * 0.5), tip],
  };
}

/**
 * The reticle's four ticks at progress `s`: they turn `RETICLE_TURN` degrees and slow to a
 * stop square to the screen (locked on), closing from 1.2 r to their resting span.
 * @returns {{angleDeg: number, from: number, to: number}[]}
 */
export function reticleTicks(s, r) {
  const c = clamp01(s);
  const turn = RETICLE_TURN * (1 - c) ** 2;
  const close = 1 - c;
  const ticks = [];
  for (let i = 0; i < RETICLE_TICKS; i += 1) {
    ticks.push({ angleDeg: (i * 360) / RETICLE_TICKS + turn, from: r * (0.72 + 0.2 * close), to: r * (1.0 + 0.2 * close) });
  }
  return ticks;
}

/** The steel material drawn in `palette` (any palette with the same keys). */
function steelKit(palette) {
  const edge = Object.freeze({ dissolve: Object.freeze({ edge: palette.edge, width: 0.06, gain: 1.2 }) });
  /** `draw` with this kit's dissolve edge named for every fill it makes. */
  const edged = (draw) => (ctx, ...args) =>
    ctx && typeof ctx === 'object' ? withFxMod(ctx, edge, () => draw(ctx, ...args)) : draw(ctx, ...args);

  /** A cool haze: the bright steel at the centre fading through the blue edge to clear. */
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.hot, alpha * 0.5));
    g.addColorStop(0.5, rgbCss(palette.edge, alpha * 0.2));
    g.addColorStop(1, rgbCss(palette.edge, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    layered(ctx, Z_HAZE, COOL_SHIMMER, () => ctx.fill());
  }

  /** A metal sphere: a hard white highlight up-left, steel shading to deep, a cool blue rim. */
  function body(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    const shine = alpha * clamp01(hot);
    layered(ctx, Z_SPHERE, mergeFxMods(SPHERE_BRUSH, POLISHED), () =>
      sphere(
        ctx,
        x,
        y,
        r,
        [
          [0, palette.white, shine],
          [0.16, palette.white, shine * 0.9],
          [0.22, palette.hot, alpha],
          [0.62, palette.body, alpha * 0.95],
          [1, palette.deep, alpha * 0.9],
        ],
        0.35
      )
    );
    ctx.strokeStyle = rgbCss(palette.edge, 0.6 * alpha);
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.97, 0, TAU);
    layered(ctx, Z_RIM, RIM_TUBE, () => ctx.stroke());
  }

  /**
   * A blade: a blurred cool halo, the brushed steel body (bright edge to dark edge across its
   * width), one white specular line along its axis. `jag` makes it an angular splinter; `hot` 0
   * drops the specular line.
   */
  function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    const shape = (widthScale) =>
      jag ? shardOutline({ ...spec, width: spec.width * widthScale }) : bladeOutline({ ...spec, width: spec.width * widthScale });
    ctx.filter = `blur(${Math.max(1, spec.width * HALO_BLUR).toFixed(2)}px)`;
    ctx.fillStyle = rgbCss(palette.edge, HALO_ALPHA * alpha);
    traceOutline(ctx, shape(HALO_WIDTH));
    layered(ctx, Z_HALO, COOL_SHIMMER, () => ctx.fill());
    ctx.filter = 'none';

    const blade = shape(1);
    const a = rad(spec.angleDeg);
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const half = spec.width * 0.5;
    const sx = spec.x + Math.cos(a) * spec.length * SHOULDER_AT;
    const sy = spec.y + Math.sin(a) * spec.length * SHOULDER_AT;
    const brush = ctx.createLinearGradient(sx + nx * half, sy + ny * half, sx - nx * half, sy - ny * half);
    brush.addColorStop(0, rgbCss(palette.hot, 0.95 * alpha));
    brush.addColorStop(0.5, rgbCss(palette.body, 0.9 * alpha));
    brush.addColorStop(1, rgbCss(palette.deep, 0.85 * alpha));
    ctx.fillStyle = brush;
    traceOutline(ctx, blade);
    layered(ctx, Z_BLADE, bladeBrush(spec.angleDeg), () => ctx.fill());

    const shine = alpha * clamp01(hot);
    if (!(shine > 0)) return;
    const lift = spec.width * 0.08;
    ctx.strokeStyle = rgbCss(palette.white, 0.9 * shine);
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(spec.x + nx * lift, spec.y + ny * lift);
    ctx.lineTo(
      spec.x + Math.cos(a) * spec.length * SPECULAR_REACH + nx * lift * 0.3,
      spec.y + Math.sin(a) * spec.length * SPECULAR_REACH + ny * lift * 0.3
    );
    withLiftZ(ctx, Z_SPECULAR, () => ctx.stroke());
  }

  /**
   * The beam core in flight along `headingDeg`: a cool haze, one long streak behind it, then
   * `tongues - 1` short spark blades flickering either side of the streak, and the hard sphere.
   * 0 tongues = a bare sphere in its haze.
   */
  function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 2.2, 0.5 * alpha);
    const back = headingDeg + 180;
    if (tongues > 0) {
      tongue(ctx, { x, y, angleDeg: back, length: r * TRAIL_LENGTH, width: r * 1.1, time, seed }, { alpha: alpha * 0.85, hot });
    }
    for (let k = 1; k < tongues; k += 1) {
      const side = k % 2 ? 1 : -1;
      const angleDeg = back + side * (SPARK_SPREAD + 6 * Math.ceil(k / 2)) + 5 * Math.sin(time * 9 + k * 1.7 + seed);
      const ar = rad(angleDeg);
      tongue(
        ctx,
        {
          x: x + Math.cos(ar) * r * 0.5,
          y: y + Math.sin(ar) * r * 0.5,
          angleDeg,
          length: r * (1.2 + 0.6 * Math.abs(Math.sin(seed * 1.3 + k * 2.1))),
          width: r * 0.3,
          time,
          seed: seed + k * 1.9,
        },
        { alpha: alpha * 0.8, hot, jag: k % 2 }
      );
    }
    body(ctx, x, y, r, alpha, hot);
  }

  /**
   * A steel glint of radius `r` at progress `s`: a cool glow and a four-point sparkle that flares
   * and turns as it locks (design 075 parity: the stroked targeting reticle read as clip art).
   */
  function sigil(ctx, x, y, r, s) {
    if (!(r > 0)) return;
    const lock = Math.sin(Math.PI * Math.max(0, Math.min(1, s)));
    glow(ctx, x, y, r, 0.45 * lock);
    const turn = rad(45 * s);
    const reach = r * (0.35 + 0.45 * lock);
    const waist = reach * 0.14;
    ctx.fillStyle = rgbCss(palette.white, 0.85 * lock);
    ctx.beginPath();
    for (let k = 0; k < 8; k += 1) {
      const a = turn + (k * Math.PI) / 4;
      const d = k % 2 === 0 ? reach : waist;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  return Object.freeze({
    key: 'steel',
    palette,
    // A cool blue-black, kept local to a card.
    shade: Object.freeze([6, 10, 20]),
    smoke: null,
    particle: Object.freeze({ className: 'fx-particle--streak', color: rgbCss(palette.white), aspect: 0.2 }),
    glow: edged(glow),
    body: edged(body),
    tongue: edged(tongue),
    projectile: edged(projectile),
    sigil: edged(sigil),
    grain: grainPass,
    withPalette: (p) => steelKit(p),
  });
}

export const steel = styledKit(steelKit(PALETTE), METAL);
