// Design 022: client effect registry. Each effect is `(plan) => void` keyed by
// the `effect` name in advisory-animations.mjs's EVENT_FX. `STATIC_FALLBACKS`
// holds the reduced-motion variant of state-reflecting effects; a transient
// effect has no entry there, which skips it under `prefers-reduced-motion`.
import { fxDisabled, motionReduced, soundDisabled } from '../../image-logic/mat-fx.mjs';
import { playFxSound } from './fx-audio.js';
import { holdFor } from './fx-holds.mjs';
import { attack, attackBanner, damage } from './combat.js';
import { createFxDispatcher } from './dispatcher.mjs';
import { enter } from './entry.js';
import { abilityBanner, gameOver, turnBanner } from './flow.js';
import { installTeraSkins } from './tera-skin.js';
import {
  attach,
  devolve,
  discard,
  evolve,
  promote,
  retreat,
  stadiumPlay,
  trainerPlay,
} from './lifecycle.js';
import { prizeClaim } from './prize.js';
import { coinFlip } from './coin.js';
import { status, statusClear } from './status.js';

const EFFECTS = {
  damage,
  attack,
  'attack-banner': attackBanner,
  status,
  'status-clear': statusClear,
  evolve,
  enter,
  devolve,
  attach,
  promote,
  discard,
  'coin-flip': coinFlip,
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

// Design 037: Tera Pokémon keep their crystal skin while in play.
installTeraSkins();
