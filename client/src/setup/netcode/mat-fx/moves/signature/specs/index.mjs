// Design 065: signature move specs (tier 'S'), merged from the per-type files as slices 5–15
// ship them. Never merged with 063's SPECS (ids such as `aeroblast` exist in both).
import { FIRE_SIGNATURE_SPECS } from './fire.mjs';
import { GRASS_SIGNATURE_SPECS } from './grass.mjs';
import { WATER_SIGNATURE_SPECS } from './water.mjs';
import { ICE_SIGNATURE_SPECS } from './ice.mjs';
import { ELECTRIC_SIGNATURE_SPECS } from './electric.mjs';
import { GROUND_SIGNATURE_SPECS } from './ground.mjs';
import { ROCK_SIGNATURE_SPECS } from './rock.mjs';
import { FIGHTING_SIGNATURE_SPECS } from './fighting.mjs';
import { POISON_SIGNATURE_SPECS } from './poison.mjs';
import { FAIRY_SIGNATURE_SPECS } from './fairy.mjs';
import { PSYCHIC_SIGNATURE_SPECS } from './psychic.mjs';

export const SIGNATURE_SPECS = Object.freeze({
  ...FIRE_SIGNATURE_SPECS,
  ...GRASS_SIGNATURE_SPECS,
  ...WATER_SIGNATURE_SPECS,
  ...ICE_SIGNATURE_SPECS,
  ...ELECTRIC_SIGNATURE_SPECS,
  ...GROUND_SIGNATURE_SPECS,
  ...ROCK_SIGNATURE_SPECS,
  ...FIGHTING_SIGNATURE_SPECS,
  ...POISON_SIGNATURE_SPECS,
  ...FAIRY_SIGNATURE_SPECS,
  ...PSYCHIC_SIGNATURE_SPECS,
});
