// Design 077: the element kinds the layer builds, by the name element kits emit. Each entry is
// `define({ three, textures, uniforms, layer, debug })` → { kind, object3d, needsBoard(), begin(),
// push(params) → boolean, finish(uniforms), counts?(), dispose() }.
import { defineSprite } from './sprite.js';
import { spriteSamples } from './sprite.mjs';

export const ELEMENT_KINDS = Object.freeze({
  sprite: defineSprite,
});

/** Per kind, emits that exercise its shader paths (scripts/fx/check-element-shaders.mjs). */
export const ELEMENT_SAMPLES = Object.freeze({
  sprite: spriteSamples,
});
