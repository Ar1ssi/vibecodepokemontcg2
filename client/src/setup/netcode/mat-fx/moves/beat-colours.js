// Design 065 § New pieces A: beat colours — a beat's `tint` and `hues` resolved against the scene
// material. Shared by the 2D move player and the in-scene player (design 075).
import { lighten, tintedPalette } from './materials/_shared.js';

/**
 * A per-scene memo of tinted materials: `cachedTint(material, tint)` is `material` redrawn
 * over its palette with `tint`'s keys replaced, built once per material key and tint.
 */
export function tintCache() {
  const cache = new Map();
  return function cachedTint(material, tint) {
    const key = `${material.key}|${JSON.stringify(tint)}`;
    if (!cache.has(key)) cache.set(key, material.withPalette(tintedPalette(material.palette, tint)));
    return cache.get(key);
  };
}

/**
 * Resolve a beat's `tint` and `hues` against the scene material: `material` is what the
 * drawer draws with; `materialAt(i)` is item `i`'s material (hues[i % n] as its body, a
 * lighter hot), or the beat material without hues. The returned params drop both keys, so
 * drawers never see them.
 */
export function resolveBeatColours(material, params, cachedTint) {
  const { tint = null, hues = null, ...rest } = params ?? {};
  const beatMaterial = tint ? cachedTint(material, tint) : material;
  const materialAt =
    hues && hues.length > 0
      ? (i) => {
          const hue = hues[((i % hues.length) + hues.length) % hues.length];
          return cachedTint(material, { ...tint, body: hue, hot: lighten(hue, 0.35) });
        }
      : () => beatMaterial;
  return { material: beatMaterial, materialAt, params: rest };
}
