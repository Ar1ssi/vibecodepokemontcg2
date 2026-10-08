// Design 063: the material registry. A move spec names a material by key; `default` serves
// a spec whose type's material has not landed yet (and an unknown key).
import { bug, buzz, silver } from './bug.js';
import { dark } from './dark.js';
import { dragon } from './dragon.js';
import { electric } from './electric.js';
import { fairy } from './fairy.js';
import { aura, fighting } from './fighting.js';
import { fire } from './fire.js';
import { flying } from './flying.js';
import { ghost } from './ghost.js';
import { grass, petal, solar } from './grass.js';
import { ground, mud } from './ground.js';
import { aurora, ice } from './ice.js';
import { poison } from './poison.js';
import { psychic } from './psychic.js';
import { ancient, gem, rock } from './rock.js';
import { normal } from './normal.js';
import { stellar } from './stellar.js';
import { steel } from './steel.js';
import { water } from './water.js';

export const MATERIALS = Object.freeze({
  fire,
  water,
  grass,
  petal,
  solar,
  electric,
  fighting,
  aura,
  psychic,
  dark,
  steel,
  dragon,
  fairy,
  ghost,
  poison,
  ground,
  mud,
  rock,
  ancient,
  gem,
  flying,
  ice,
  aurora,
  bug,
  buzz,
  silver,
  normal,
  stellar,
  default: fire,
});

/** The material for `key`, else the default. */
export const materialFor = (key) => (Object.hasOwn(MATERIALS, key) ? MATERIALS[key] : MATERIALS.default);
