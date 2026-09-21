// Design 022: routes an `fx` plan (from advisoryAnimationPlan) to its effect.
// Dependencies are injected so the guard order is unit-testable without a DOM.
// An effect failure must never break event handling, so calls are try/caught.
export const createFxDispatcher = ({
  effects,
  staticFallbacks = {},
  isDisabled,
  isMotionReduced,
}) => (plan) => {
  if (!plan || plan.kind !== 'fx') return;
  if (isDisabled()) return;
  const table = isMotionReduced() ? staticFallbacks : effects;
  const run = table[plan.effect];
  if (typeof run !== 'function') return;
  try {
    run(plan);
  } catch (err) {
    console.warn(`[mat-fx] ${plan.effect} failed`, err);
  }
};
