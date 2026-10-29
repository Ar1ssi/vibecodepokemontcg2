// Design 077: element kits by material key (materials/index.js). A material without one draws
// with its canvas kit everywhere. `default` serves a spec whose type has no kit: it is fire's.
import { electricElements } from './electric.js';
import { fireElements } from './fire.js';
import { waterElements } from './water.js';

export const ELEMENT_KITS = Object.freeze({
  fire: fireElements,
  electric: electricElements,
  water: waterElements,
  default: fireElements,
});
