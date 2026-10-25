// Design 076: what holds for a whole kit (its dissolve edge colour) laid round every drawing
// method, as `styledKit` (_shared.js) lays its GPU style; per-fill texture (distort, detail)
// stays inside the kit's own fills. Merges through `withFxMod`, so a drawer's dissolve amount
// set round the call survives and gains the kit's edge. A real 2D context ignores `fxMod`.
import { withFxMod } from './_mods.js';

const UNWRAPPED = new Set(['grain', 'withPalette']);

/** `kit` with every drawing method run under `mod` (merged over the caller's `fxMod`). */
export function moddedKit(kit, mod) {
  const modded = {};
  for (const [key, value] of Object.entries(kit)) {
    if (typeof value !== 'function' || UNWRAPPED.has(key)) {
      modded[key] = value;
      continue;
    }
    modded[key] = (ctx, ...args) => {
      if (!ctx || typeof ctx !== 'object') return value(ctx, ...args);
      return withFxMod(ctx, mod, () => value(ctx, ...args));
    };
  }
  return Object.freeze(modded);
}
