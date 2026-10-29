// Design 079 § Element kits: an element kit overrides some of a canvas kit's methods (body,
// tongue, projectile, glow, jagStroke, sigil) and may replace whole drawers (`beats`). The
// merged kit routes each overridden call to the element kit only while the GPU canvas records a
// lit pass; in the cast pass, on a 2D context and in node tests the canvas kit draws as before.
import { elementsLive } from './_emit.js';

/**
 * @param {Record<string, Function> & { beats?: Record<string, Function> }} definition methods with
 *   the canvas kit's signatures `(ctx, ...args)`; `this.base` is the canvas kit inside them.
 *   `beats[drawer](ctx, lane, s, info)` draws instead of that drawer for this material (inside the
 *   drawer's lift and burn wrappers); returning false leaves that beat to the canvas drawer.
 */
export function elementKit(definition) {
  const { beats = {}, ...methods } = definition ?? {};
  for (const [name, fn] of [...Object.entries(methods), ...Object.entries(beats)]) {
    if (typeof fn !== 'function') throw new TypeError(`element kit: ${name} is not a function`);
  }
  return Object.freeze({ methods: Object.freeze(methods), beats: Object.freeze({ ...beats }) });
}

/** Element kits merged left to right: a later kit's methods and beats win. Nulls are skipped. */
export function combineKits(...kits) {
  const methods = {};
  const beats = {};
  for (const kit of kits) {
    if (!kit) continue;
    Object.assign(methods, kit.methods);
    Object.assign(beats, kit.beats);
  }
  return elementKit({ ...methods, beats });
}

/** The canvas `kit` with `elements` merged over it (the kit itself when there is none). */
export function withElements(kit, elements) {
  if (!elements) return kit;
  const merged = { ...kit };
  const self = { base: kit };
  for (const [name, method] of Object.entries(elements.methods)) {
    const base = kit[name];
    merged[name] = (ctx, ...args) => (elementsLive(ctx) ? method.call(self, ctx, ...args) : base?.call(kit, ctx, ...args));
  }
  /** The element drawer for `name` when one exists and elements are live on `ctx`, else null. */
  merged.drawBeat = (name, ctx) => (elementsLive(ctx) && Object.hasOwn(elements.beats, name) ? elements.beats[name] : null);
  // A tinted beat (design 065) redraws the kit over another palette; it keeps its elements, which
  // read the tinted palette through `this.base`.
  if (typeof kit.withPalette === 'function') merged.withPalette = (palette) => withElements(kit.withPalette(palette), elements);
  return Object.freeze(merged);
}
