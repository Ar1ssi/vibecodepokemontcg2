// Design 022: client effect registry. Each effect is `(plan) => void` keyed by
// the `effect` name in advisory-animations.mjs's EVENT_FX. `STATIC_FALLBACKS`
// holds the reduced-motion variant of state-reflecting effects; a transient
// effect has no entry there, which skips it under `prefers-reduced-motion`.
import { fxDisabled, motionReduced, soundDisabled } from '../../image-logic/mat-fx.mjs';
import { playFxSound } from './fx-audio.js';
import { holdFor } from './fx-holds.mjs';
import { attack, attackBanner, damage } from './combat.js';
import { createFxDispatcher } from './dispatcher.mjs';
import { abilityBanner, gameOver, turnBanner } from './flow.js';
import { attach, evolve, retreat, stadiumPlay, trainerPlay } from './lifecycle.js';
import { prizeClaim } from './prize.js';
import { status } from './status.js';

const EFFECTS = {
  damage,
  attack,
  'attack-banner': attackBanner,
  status,
  evolve,
  attach,
  retreat,
  'trainer-play': trainerPlay,
  'stadium-play': stadiumPlay,
  'turn-banner': turnBanner,
  'ability-banner': abilityBanner,
  'prize-claim': prizeClaim,
  'game-over': gameOver,
};
const STATIC_FALLBACKS = {};

export const playFx = createFxDispatcher({
  effects: EFFECTS,
  staticFallbacks: STATIC_FALLBACKS,
  isDisabled: fxDisabled,
  isMotionReduced: motionReduced,
  isSoundDisabled: soundDisabled,
  playSound: playFxSound,
  holdFor,
});
