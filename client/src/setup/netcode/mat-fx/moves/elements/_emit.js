// Design 077 § Element kits: what an element kit needs from the context it is handed. The
// recorder knows the current transform and the 076 lift; these helpers turn a kit's local
// numbers into the stage px (and height) element params take, and send them to the layer.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** True while element kits should draw: a lit pass of an FX frame on the GPU canvas. */
export const elementsLive = (ctx) => Boolean(ctx?.fxElements?.live);

/** (x, y) in the kit's current transform → `{ x, y, z }`: stage px, z px above the cloth. */
export const stageOf = (ctx, x, y) => ctx.stagePoint(x, y);

/** A length in the kit's current transform → stage px. */
export const stageLen = (ctx, length) => (Number(length) || 0) * ctx.stageScale();

/**
 * An angle in the kit's current transform → the stage angle (degrees), so a jet drawn under a
 * rotate() keeps its heading.
 */
export function stageAngle(ctx, angleDeg) {
  const { a, b, c, d } = ctx.getTransform();
  const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
  const x = a * Math.cos(rad) + c * Math.sin(rad);
  const y = b * Math.cos(rad) + d * Math.sin(rad);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** A kit alpha with the context's globalAlpha folded in, clamped to [0, 1]. */
export const alphaOf = (ctx, alpha) => {
  const global = Number(ctx.globalAlpha);
  return clamp01((Number(alpha) || 0) * (Number.isFinite(global) ? global : 1));
};

/** The drawer's dissolve amount on this draw (design 076), 0 when none. */
export const dissolveOf = (ctx) => clamp01(Number(ctx.fxMod?.dissolve?.amount) || 0);

/** Queues one element; false when the layer refused it (not live, unknown kind, bad params, full). */
export const emit = (ctx, kind, params) => Boolean(ctx?.fxElements?.emit?.(kind, params));

/** A kit palette colour (0–255 rgb) as 0–1 rgb, scaled by `gain` (> 1 blooms). */
export const rgb01 = (rgb, gain = 1) => [0, 1, 2].map((i) => ((Number(rgb?.[i]) || 0) / 255) * gain);
