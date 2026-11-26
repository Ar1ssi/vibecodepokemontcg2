// Design 092: the Max and G-Max Move specs (tier 'S'), merged from the group files as their slices
// ship them. Kept apart from 063's SPECS and 065's SIGNATURE_SPECS: a VMAX's Dynamax attack picks
// from here first (combat.js), and a move whose spec has not shipped plays as before.
import { variedSpecs } from '../../motion-variety.mjs';
import { ELECTRIC_POISON_FIGHTING_MAX_SPECS } from './electric-poison-fighting.mjs';
import { FIRE_NORMAL_MAX_SPECS } from './fire-normal.mjs';
import { GHOST_DARK_DRAGON_MAX_SPECS } from './ghost-dark-dragon.mjs';
import { GRASS_BUG_FLYING_MAX_SPECS } from './grass-bug-flying.mjs';
import { GROUND_ROCK_STEEL_MAX_SPECS } from './ground-rock-steel.mjs';
import { PSYCHIC_FAIRY_MAX_SPECS } from './psychic-fairy.mjs';
import { WATER_ICE_MAX_SPECS } from './water-ice.mjs';

// Design 089: as written per group; what plays has its card motions spread (motion-variety.mjs).
export const MAX_SPECS = variedSpecs({
  ...FIRE_NORMAL_MAX_SPECS,
  ...WATER_ICE_MAX_SPECS,
  ...ELECTRIC_POISON_FIGHTING_MAX_SPECS,
  ...GRASS_BUG_FLYING_MAX_SPECS,
  ...GROUND_ROCK_STEEL_MAX_SPECS,
  ...PSYCHIC_FAIRY_MAX_SPECS,
  ...GHOST_DARK_DRAGON_MAX_SPECS,
});
