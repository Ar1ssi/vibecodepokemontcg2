// Design 063: every shipped MoveSpec, keyed by move id (the kebab-case ids of move-table.mjs).
// A type's specs land one slice at a time; a table move without a spec plays the generic
// lunge until its type ships (move-select.mjs returns null for it).
import { BUG_SPECS } from './bug.mjs';
import { DARK_SPECS } from './dark.mjs';
import { DRAGON_SPECS } from './dragon.mjs';
import { ELECTRIC_SPECS } from './electric.mjs';
import { FAIRY_SPECS } from './fairy.mjs';
import { FIGHTING_SPECS } from './fighting.mjs';
import { FIRE_SPECS } from './fire.mjs';
import { FLYING_SPECS } from './flying.mjs';
import { GHOST_SPECS } from './ghost.mjs';
import { GRASS_SPECS } from './grass.mjs';
import { GROUND_SPECS } from './ground.mjs';
import { ICE_SPECS } from './ice.mjs';
import { POISON_SPECS } from './poison.mjs';
import { PSYCHIC_SPECS } from './psychic.mjs';
import { ROCK_SPECS } from './rock.mjs';
import { STEEL_SPECS } from './steel.mjs';
import { WATER_SPECS } from './water.mjs';

export const SPECS = Object.freeze({
  ...FIRE_SPECS,
  ...WATER_SPECS,
  ...GRASS_SPECS,
  ...ELECTRIC_SPECS,
  ...FIGHTING_SPECS,
  ...PSYCHIC_SPECS,
  ...DARK_SPECS,
  ...STEEL_SPECS,
  ...DRAGON_SPECS,
  ...FAIRY_SPECS,
  ...GHOST_SPECS,
  ...POISON_SPECS,
  ...GROUND_SPECS,
  ...ROCK_SPECS,
  ...FLYING_SPECS,
  ...ICE_SPECS,
  ...BUG_SPECS,
});

/** Spec ids that are not cells of the move table (look-test references). */
export const REFERENCE_SPEC_IDS = Object.freeze(['fire-blast']);
