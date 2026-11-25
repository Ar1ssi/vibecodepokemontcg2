// Every coin the engine flips plays the same full-screen ceremony as the
// opening turn-order call, with the flipping player's chosen coin. A plan's
// `faces` (advisory-animations.mjs) may hold several flips; they toss one after
// another in one overlay.
import { playCoinFlipCeremony } from '../../rules/coin-flip-ceremony.js';
import { getSelectedCoin, pickDefaultCoin } from '../../rules/mat-coin.js';
import { motionReduced } from '../../image-logic/mat-fx.mjs';
import { chainedCeremonySlot, coinCeremonyTimeline } from './coin-pose.mjs';

// Ceremonies never cut each other off: the FX queue drops its holds under a
// flood, so a second flip can arrive while the first is still on screen.
let ceremonyChain = Promise.resolve();
// performance.now() at which the last chained ceremony is expected to end.
let chainFreeAt = 0;

const headingFor = (plan) => {
  const owner = plan.user === 'opp' ? "Opponent's" : 'Your';
  const context = [plan.attackName, plan.source].find(
    (value) => typeof value === 'string' && value.trim() !== ''
  );
  return context ? `${owner} coin flip — ${context}` : `${owner} coin flip`;
};

export const coinFlip = (plan) => {
  const faces = Array.isArray(plan.faces) ? plan.faces : [];
  if (faces.length === 0) return 0;
  // The app's reduce-motion setting shows each face without the tumble.
  const reducedMotion = motionReduced();
  const side = plan.user === 'opp' ? 'opp' : 'self';
  const coin = getSelectedCoin(side) || pickDefaultCoin();
  const label = headingFor(plan);

  ceremonyChain = ceremonyChain
    .then(() => playCoinFlipCeremony({ coin, results: faces, label, passive: true, reducedMotion }))
    .catch((err) => console.warn('[mat-fx] coin ceremony failed', err));

  // Hold the queue until the result has been read; later effects start as the overlay fades.
  // A ceremony queued behind another starts when that one ends, so its hold includes the wait.
  const slot = chainedCeremonySlot(coinCeremonyTimeline(faces.length, { reducedMotion }), performance.now(), chainFreeAt);
  chainFreeAt = slot.endsAt;
  return slot.holdMs;
};
