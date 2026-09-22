// Design 022: routes an `fx` plan (from advisoryAnimationPlan) to its effect.
// Dependencies are injected so the guard order is unit-testable without a DOM.
// An effect failure must never break event handling, so calls are try/caught.
//
// Design 024: the dispatcher is also the choke point for SOUND, so visuals and
// audio can never drift into disagreeing about whether an event happened. It
// now returns the plan's hold (fx-holds.mjs) for the FX queue to pace on.
// Audio is gated by the kill switch and the mute, but deliberately NOT by
// reduced motion: motion sensitivity and sound preference are separate axes,
// and a reduced-motion player still wants to hear the game.
export const createFxDispatcher = ({
  effects,
  staticFallbacks = {},
  isDisabled,
  isMotionReduced,
  isSoundDisabled = () => true,
  playSound = () => {},
  holdFor = () => 0,
}) => (plan) => {
  if (!plan || plan.kind !== 'fx') return 0;
  if (isDisabled()) return 0;

  if (!isSoundDisabled()) {
    try {
      playSound(plan);
    } catch (err) {
      console.warn(`[mat-fx] sound ${plan.effect} failed`, err);
    }
  }

  const table = isMotionReduced() ? staticFallbacks : effects;
  const run = table[plan.effect];
  if (typeof run !== 'function') return 0;
  try {
    run(plan);
  } catch (err) {
    console.warn(`[mat-fx] ${plan.effect} failed`, err);
    return 0;
  }
  return holdFor(plan.effect);
};
