// Design 077: element kits by material key (materials/index.js). A material without one draws
// with its canvas kit everywhere. `default` serves a spec whose type has no kit: it is fire's.
import { fireElements } from './fire.js';

export const ELEMENT_KITS = Object.freeze({
  fire: fireElements,
  default: fireElements,
});
