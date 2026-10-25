// Design 076: the GPU canvas modifiers (gpu-canvas.mjs FX_MODS: dissolve, distort, detail) as
// kits and drawers use them. A drawer owns a beat's dissolve (its exit timing); a kit owns its
// distort and detail (its texture) and may name the dissolve edge colour. Both layer through
// `withFxMod`, which merges into whatever the caller already set and restores it after, so
// neither erases the other's. A real 2D context keeps `fxMod` as an inert property.

const MODULES = Object.freeze(['dissolve', 'distort', 'detail']);

/** `outer` with each module of `inner` merged over it, field by field. */
export function mergeFxMods(outer, inner) {
  if (!outer) return inner ?? null;
  if (!inner) return outer;
  const merged = { ...outer };
  for (const name of MODULES) {
    if (inner[name]) merged[name] = { ...outer[name], ...inner[name] };
  }
  return merged;
}

/** Runs `draw` with `mod` merged over `ctx.fxMod`; the previous value is back afterwards. */
export function withFxMod(ctx, mod, draw) {
  const previous = ctx.fxMod ?? null;
  ctx.fxMod = mergeFxMods(previous, mod);
  try {
    return draw();
  } finally {
    ctx.fxMod = previous;
  }
}

/**
 * Dissolve amount for a beat's tail: 0 until `from` of its progress, rising to 1 at its end.
 * Non-finite progress reads as 0 (whole).
 */
export function dissolveTail(progress, from = 0.7) {
  if (!Number.isFinite(progress) || progress <= from) return 0;
  if (from >= 1) return 0;
  return Math.min(1, (progress - from) / (1 - from));
}
