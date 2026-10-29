// Design 077: the element kinds the layer builds, by the name element kits emit. Each entry is
// `define({ three, textures, uniforms, layer, debug })` → { kind, object3d, needsBoard(), begin(),
// push(params) → boolean, finish(uniforms), counts?(), dispose() }.
import { defineBolt } from './bolt.js';
import { boltSamples } from './bolt.mjs';
import { defineFireball } from './fireball.js';
import { fireballSamples } from './fireball.mjs';
import { defineFlameJet } from './flame-jet.js';
import { flameJetSamples } from './flame-jet.mjs';
import { definePlasma } from './plasma.js';
import { plasmaSamples } from './plasma.mjs';
import { defineSprite } from './sprite.js';
import { spriteSamples } from './sprite.mjs';

export const ELEMENT_KINDS = Object.freeze({
  sprite: defineSprite,
  fireball: defineFireball,
  flameJet: defineFlameJet,
  bolt: defineBolt,
  plasma: definePlasma,
});

/** Per kind, emits that exercise its shader paths (scripts/fx/check-element-shaders.mjs). */
export const ELEMENT_SAMPLES = Object.freeze({
  sprite: spriteSamples,
  fireball: fireballSamples,
  flameJet: flameJetSamples,
  bolt: boltSamples,
  plasma: plasmaSamples,
});
