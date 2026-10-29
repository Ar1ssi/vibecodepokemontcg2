// Design 077: element kits by material key (materials/index.js). Every material gets the shared
// beats (impact flash, slash, aura) under its own kit; a material with no kit of its own draws
// everything else with its canvas kit. `default` serves a spec whose type has no kit: fire's.
import { combineKits } from './_kit.js';
import { sharedBeats } from './_shared-beats.js';
import { airElements } from './air.js';
import { gemElements, iceElements, needleElements, steelElements } from './crystal.js';
import { grassElements, groundElements, petalElements, rockElements } from './earth.js';
import { electricElements } from './electric.js';
import { energyElements } from './energy.js';
import { fireElements } from './fire.js';
import { psychicElements } from './psychic.js';
import { darkElements, ghostElements } from './shadow.js';
import { smokeBeats } from './_smoke.js';
import { waterElements } from './water.js';
import { rgb01 } from './_emit.js';

/** Poison and mud are liquids (water's drops and streams in their palette) with their own gas. */
const liquidGas = (glow) =>
  combineKits(
    waterElements,
    { methods: {}, beats: smokeBeats((info) => ({
      tint: rgb01(info.material.smoke ?? info.material.palette.deep, 1),
      light: rgb01(info.material.palette.hot, 1.3),
      density: 0.55,
      rise: 0.5,
      glow,
      cloudGlow: glow * 1.5,
      alphaGain: 2,
    })) }
  );

export const ELEMENT_KITS = Object.freeze({
  fire: fireElements,
  solar: fireElements,
  dragon: fireElements,
  electric: electricElements,
  water: waterElements,
  poison: liquidGas(0.35),
  mud: liquidGas(0),
  psychic: psychicElements,
  fairy: psychicElements,
  stellar: psychicElements,
  ghost: ghostElements,
  dark: darkElements,
  rock: rockElements,
  ancient: rockElements,
  ground: groundElements,
  grass: grassElements,
  petal: petalElements,
  fighting: energyElements,
  aura: energyElements,
  normal: energyElements,
  ice: iceElements,
  aurora: iceElements,
  gem: gemElements,
  steel: steelElements,
  bug: needleElements,
  buzz: energyElements,
  silver: airElements,
  flying: airElements,
  default: fireElements,
});

/** The element kit `key` draws with: the shared beats under its own kit. */
export const elementsFor = (key) => combineKits(sharedBeats, Object.hasOwn(ELEMENT_KITS, key) ? ELEMENT_KITS[key] : null);
