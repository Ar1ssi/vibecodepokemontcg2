// Design 079: the element kinds the layer builds, by the name element kits emit. Each entry is
// `define({ three, textures, uniforms, layer, debug })` → { kind, object3d, needsBoard(), begin(),
// push(params) → boolean, finish(uniforms), counts?(), dispose() }.
import { defineBolt } from './bolt.js';
import { boltSamples } from './bolt.mjs';
import { defineDebris } from './debris.js';
import { debrisSamples } from './debris.mjs';
import { defineFireball } from './fireball.js';
import { fireballSamples } from './fireball.mjs';
import { defineFlameJet } from './flame-jet.js';
import { flameJetSamples } from './flame-jet.mjs';
import { defineLens } from './lens.js';
import { lensSamples } from './lens.mjs';
import { definePlasma } from './plasma.js';
import { plasmaSamples } from './plasma.mjs';
import { defineSmoke } from './smoke.js';
import { smokeSamples } from './smoke.mjs';
import { defineSprite } from './sprite.js';
import { defineWaterBeam } from './water-beam.js';
import { waterBeamSamples } from './water-beam.mjs';
import { defineWaterDrop } from './water-drop.js';
import { waterDropSamples } from './water-drop.mjs';
import { spriteSamples } from './sprite.mjs';

export const ELEMENT_KINDS = Object.freeze({
  sprite: defineSprite,
  fireball: defineFireball,
  flameJet: defineFlameJet,
  bolt: defineBolt,
  plasma: definePlasma,
  waterBeam: defineWaterBeam,
  waterDrop: defineWaterDrop,
  lens: defineLens,
  smoke: defineSmoke,
  debris: defineDebris,
});

/** Per kind, emits that exercise its shader paths (scripts/fx/check-element-shaders.mjs). */
export const ELEMENT_SAMPLES = Object.freeze({
  sprite: spriteSamples,
  fireball: fireballSamples,
  flameJet: flameJetSamples,
  bolt: boltSamples,
  plasma: plasmaSamples,
  waterBeam: waterBeamSamples,
  waterDrop: waterDropSamples,
  lens: lensSamples,
  smoke: smokeSamples,
  debris: debrisSamples,
});
