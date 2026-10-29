// Design 075: one burst particle drawn on a Canvas2D-like context (the GPU recorder in the 3D
// board), in the shapes the 2D bursts took from CSS (css/mat-fx.css `.fx-particle--*`): the
// element was `size` wide and `size·aspect` tall, centred on its point, rotated by its travel
// angle. Shapes are written in that box, unit square [-.5, .5]², then scaled.
import { PARTICLE_KINDS } from './move-spec.mjs';

const TAU = Math.PI * 2;

/** clip-path polygons (CSS percentages → the unit box). */
const POLYGONS = Object.freeze({
  shard: [[50, 0], [100, 60], [40, 100], [0, 35]],
  flake: [[50, 0], [62, 30], [94, 25], [72, 50], [94, 75], [62, 70], [50, 100], [38, 70], [6, 75], [28, 50], [6, 25], [38, 30]],
  twinkle: [[50, 0], [58, 42], [100, 50], [58, 58], [50, 100], [42, 58], [0, 50], [42, 42]],
  star: [[50, 0], [61, 35], [98, 35], [68, 57], [79, 91], [50, 70], [21, 91], [32, 57], [2, 35], [39, 35]],
  // The SVG masks of `zzz` and `note` (16 × 16 viewBox), flattened.
  zzz: [[12.5, 12.5], [87.5, 12.5], [87.5, 31.25], [37.5, 81.25], [87.5, 81.25], [87.5, 100], [12.5, 100], [12.5, 81.25], [62.5, 31.25], [12.5, 31.25]],
});
const NOTE_STEM = [[37.5, 12.5], [81.25, 12.5], [81.25, 37.5], [50, 37.5], [50, 81.25]];

const polygon = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x / 100 - 0.5, y / 100 - 0.5) : ctx.lineTo(x / 100 - 0.5, y / 100 - 0.5)));
  ctx.closePath();
};

const ellipse = (ctx) => {
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.5, 0.5, 0, 0, TAU);
};

const radial = (ctx, cx, cy, stops) => {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(Math.max(cx + 0.5, 0.5 - cx), Math.max(cy + 0.5, 0.5 - cy)));
  for (const [offset, colour] of stops) g.addColorStop(offset, colour);
  return g;
};

/** A soft halo (the CSS box-shadow / drop-shadow) behind the shape. */
const halo = (ctx, colour, blurPx, size) => {
  ctx.save();
  ctx.filter = `blur(${blurPx / Math.max(size, 1)}px)`;
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
};

const SHAPES = {
  dot(ctx, colour, size) {
    ellipse(ctx);
    halo(ctx, colour, 6, size);
    ctx.fillStyle = colour;
    ctx.fill();
  },
  streak(ctx, colour, size) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.5, 0.5, 0, 0, TAU);
    halo(ctx, colour, 6, size);
    const g = ctx.createLinearGradient(-0.5, 0, 0.5, 0);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.55, '#fff');
    g.addColorStop(1, colour);
    ctx.fillStyle = g;
    ctx.fill();
  },
  shard(ctx, colour, size) {
    polygon(ctx, POLYGONS.shard);
    halo(ctx, colour, 3, size);
    ctx.fillStyle = colour;
    ctx.fill();
  },
  mote(ctx, colour) {
    ellipse(ctx);
    ctx.fillStyle = radial(ctx, 0, 0, [[0, '#fff'], [0.3, '#fff'], [0.6, colour], [0.72, 'rgba(255, 255, 255, 0)'], [1, 'rgba(255, 255, 255, 0)']]);
    ctx.fill();
  },
  droplet(ctx, colour) {
    ellipse(ctx);
    ctx.fillStyle = radial(ctx, -0.15, -0.2, [[0, '#fff'], [0.2, '#fff'], [0.6, colour], [1, 'rgba(255, 255, 255, 0)']]);
    ctx.fill();
  },
  leaf(ctx, colour, size) {
    // border-radius: 60% 0 60% 0 — round top-left and bottom-right corners.
    ctx.beginPath();
    ctx.moveTo(0.1, -0.5);
    ctx.lineTo(0.5, -0.5);
    ctx.lineTo(0.5, -0.1);
    ctx.quadraticCurveTo(0.5, 0.5, -0.1, 0.5);
    ctx.lineTo(-0.5, 0.5);
    ctx.lineTo(-0.5, 0.1);
    ctx.quadraticCurveTo(-0.5, -0.5, 0.1, -0.5);
    ctx.closePath();
    halo(ctx, colour, 3, size);
    ctx.fillStyle = colour;
    ctx.fill();
  },
  glob(ctx, colour) {
    ellipse(ctx);
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.06;
    ctx.stroke();
  },
  feather(ctx, colour) {
    // border-radius: 50% / 80% 80% 20% 20% — a rounded top over a flatter base.
    ctx.beginPath();
    ctx.moveTo(-0.5, 0.3);
    ctx.bezierCurveTo(-0.5, -0.5, 0.5, -0.5, 0.5, 0.3);
    ctx.quadraticCurveTo(0.5, 0.5, 0, 0.5);
    ctx.quadraticCurveTo(-0.5, 0.5, -0.5, 0.3);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
  },
  flake(ctx, colour) {
    polygon(ctx, POLYGONS.flake);
    ctx.fillStyle = colour;
    ctx.fill();
  },
  twinkle(ctx, colour) {
    polygon(ctx, POLYGONS.twinkle);
    ctx.fillStyle = radial(ctx, 0, 0, [[0, '#fff'], [0.14, '#fff'], [0.4, colour], [0.75, 'rgba(255, 255, 255, 0)'], [1, 'rgba(255, 255, 255, 0)']]);
    ctx.fill();
  },
  star(ctx) {
    polygon(ctx, POLYGONS.star);
    ctx.fillStyle = radial(ctx, 0, -0.05, [[0, '#fffbd0'], [0.18, '#fffbd0'], [0.45, '#ffd23a'], [0.85, '#f08a0c'], [1, '#b85a00']]);
    ctx.fill();
  },
  zzz(ctx, colour) {
    polygon(ctx, POLYGONS.zzz);
    ctx.fillStyle = colour;
    ctx.fill();
  },
  note(ctx, colour) {
    ctx.beginPath();
    NOTE_STEM.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x / 100 - 0.5, y / 100 - 0.5) : ctx.lineTo(x / 100 - 0.5, y / 100 - 0.5)));
    ctx.lineTo(0.05, 0.31);
    ctx.ellipse(-0.06, 0.31, 0.12, 0.12, 0, 0, TAU);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
  },
};
SHAPES.ember = SHAPES.streak;

/** The shape each move particle kind draws ('dot' is the plain `.fx-particle`). */
export const PARTICLE_SHAPES = Object.freeze(Object.fromEntries(PARTICLE_KINDS.map((kind) => [kind, kind in SHAPES ? kind : 'dot'])));

/**
 * Design 077: the TCG Live texture each particle kind draws as when element sprites are live
 * (`channel` per sprite.mjs SPRITE_CHANNELS; `gain` > 1 blooms). Kinds left out keep their shape.
 */
export const PARTICLE_SPRITES = Object.freeze({
  ember: { texture: 'TEX_VFX_Dot_Glow.webp', channel: 'r', gain: 2.2, grow: 1.6 },
  droplet: { texture: 'T_VFX_Water_Drop_Blurred.webp', channel: 'r', gain: 1.3, grow: 1.6 },
  leaf: { texture: 'T_VFX_Leaves_2x2.webp', channel: 'rgba', gain: 1, grow: 1.8, blend: 'over' },
  shard: { texture: 'TEX_VFX_Diamond_Shard.webp', channel: 'r', gain: 1.4, grow: 1.6 },
  glob: { texture: 'TEX_VFX_Circle_Bokeh_2x2.webp', channel: 'r', gain: 1.2, grow: 1.6 },
  feather: { texture: 'T_VFX_Fairy_Petal_Soft_2x2.webp', channel: 'a', gain: 1.1, grow: 1.8 },
  flake: { texture: 'TEX_VFX_Flake_Sharp.webp', channel: 'r', gain: 1.6, grow: 1.6 },
  streak: { texture: 'TEX_VFX_Trail_Soft.webp', channel: 'r', gain: 1.8, grow: 1.6 },
  mote: { texture: 'TEX_VFX_Dot_Glow.webp', channel: 'r', gain: 1.6, grow: 1.6 },
  star: { texture: 'TEX_VFX_Star_FourPoint_Light.webp', channel: 'a', gain: 2.4, grow: 1.8 },
  twinkle: { texture: 'TEX_VFX_Sparkle_2x2.webp', channel: 'r', gain: 2.4, grow: 1.8 },
});

/** Emits the particle as a sprite element; false when sprites are not live or it was refused. */
function emitSprite(ctx, kind, state, { originX, originY, size, aspect, colour, frame }) {
  const sprite = PARTICLE_SPRITES[kind];
  if (!sprite || !ctx.fxElements?.live) return false;
  const [r, g, b, a] = parseCssColour(colour);
  const at = ctx.stagePoint(originX + state.x, originY + state.y);
  const scale = ctx.stageScale();
  return ctx.fxElements.emit('sprite', {
    texture: sprite.texture,
    channel: sprite.channel,
    blend: sprite.blend ?? 'add',
    at,
    size: size * state.scale * scale * sprite.grow,
    aspect: aspect ?? 1,
    rotation: state.rotateDeg,
    colour: [r * sprite.gain, g * sprite.gain, b * sprite.gain],
    alpha: state.opacity * a * (Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1),
    frame,
  });
}

/** A CSS colour as 0–1 rgba (`#rgb`, `#rrggbb`, `rgb()`, `rgba()`); anything else is white. */
export function parseCssColour(text) {
  const s = String(text ?? '').trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).concat(1);
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(s);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      const alpha = Number.isFinite(parts[3]) ? Math.min(1, Math.max(0, parts[3])) : 1;
      return [parts[0] / 255, parts[1] / 255, parts[2] / 255, alpha];
    }
  }
  return [1, 1, 1, 1];
}

/**
 * Draw one particle: `state` from fx-stage.mjs `particleState` (null draws nothing), at
 * `(originX + x, originY + y)`; `size` and `aspect` are the burst row's, `colour` a CSS colour.
 * Design 077: while element sprites are live the kind draws as its TCG Live sprite instead
 * (`frame` picks a flipbook frame, e.g. the row index).
 */
export function drawParticle(ctx, kind, state, { originX = 0, originY = 0, size, aspect = 1, colour = '#fff', frame = 0 }) {
  if (!state || !(state.opacity > 0) || !(state.scale > 0) || !(size > 0)) return;
  if (emitSprite(ctx, kind, state, { originX, originY, size, aspect, colour, frame })) return;
  const shape = SHAPES[PARTICLE_SHAPES[kind] ?? 'dot'];
  ctx.save();
  ctx.globalAlpha *= state.opacity;
  ctx.translate(originX + state.x, originY + state.y);
  ctx.rotate((state.rotateDeg * Math.PI) / 180);
  ctx.scale(size * state.scale, size * (aspect ?? 1) * state.scale);
  shape(ctx, colour, size * state.scale);
  ctx.restore();
}
