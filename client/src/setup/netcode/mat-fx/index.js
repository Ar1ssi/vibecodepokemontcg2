// Design 022: client effect registry. Each effect is `(plan) => void` keyed by
// the `effect` name in advisory-animations.mjs's EVENT_FX. `STATIC_FALLBACKS`
// holds the reduced-motion variant of state-reflecting effects; a transient
// effect has no entry there, which skips it under `prefers-reduced-motion`.
import { fxDisabled, motionReduced } from '../../image-logic/mat-fx.mjs';
import { attack, damage } from './combat.js';
import { createFxDispatcher } from './dispatcher.mjs';

const EFFECTS = { damage, attack };
const STATIC_FALLBACKS = {};

export const playFx = createFxDispatcher({
  effects: EFFECTS,
  staticFallbacks: STATIC_FALLBACKS,
  isDisabled: fxDisabled,
  isMotionReduced: motionReduced,
});
