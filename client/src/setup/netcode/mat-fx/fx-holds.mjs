// Design 024 slice 0: the choreography table. A "hold" is how long the FX queue
// waits after starting an effect before it starts the NEXT one — deliberately
// shorter than the effect's own duration, so tails overlap (TCG Live does the
// same: the damage number is still rising while the KO burst begins).
// Keeping every value in one table is the point: the pacing of a whole attack
// is reviewable here without reading six effect modules.
import { BANNER_MS } from './flow-pose.mjs';

export const DEFAULT_HOLD_MS = 0;

// The beat between the attack's name banner leaving and its move scene starting.
export const ATTACK_SCENE_GAP_MS = 400;
// The beat between the move scene ending and the next turn's banner.
export const TURN_AFTER_ATTACK_GAP_MS = 700;

export const HOLD_MS = {
  // Design 063: the move scene starts once the attack's name banner has left the
  // screen, so the banner is read on its own and the move is watched on its own.
  'attack-banner': BANNER_MS + ATTACK_SCENE_GAP_MS,
  attack: 240,
  damage: 180,
  status: 260,
  'status-clear': 160,
  // Design 042: the prize claim lands while the knocked-out cards fly to the pile.
  knockout: 900,
  'prize-claim': 320,
  evolve: 240,
  // Design 066: TCG Live moves damage and attachments across 1 s in (the pop); the
  // next effect lands as the pop's light shafts fade, over the outro dissolve.
  'evolve-scene': 1300,
  // Design 066: after the devolve pop (0.35 s) and its shards, as the card glow ripples away.
  devolve: 700,
  attach: 140,
  'tool-attach': 120,
  retreat: 200,
  promote: 220,
  'trainer-play': 520,
  // Design 043: what the opponent's Trainer does starts as its preview is placed.
  'opp-trainer-play': 1700,
  'stadium-play': 520,
  'ability-banner': 480,
  'turn-banner': 260,
  discard: 120,
  // One flip's ceremony until its fade; coin.js returns the hold for the plan's
  // actual flip count (coinCeremonyTimeline).
  'coin-flip': 2250,
  'game-over': 0,
};

/**
 * How long the turn banner still waits at the head of the queue: an attack's hold ends at
 * contact, so its scene outlasts it and the banner would otherwise play over the scene.
 *
 * @param {object} plan
 * @param {number} sceneEndsAt when the last attack scene ends (same clock as `now`)
 * @param {number} now
 * @returns {number} ms
 */
export function turnBannerLead(plan, sceneEndsAt, now) {
  if (plan?.kind !== 'fx' || plan.effect !== 'turn-banner') return 0;
  if (!Number.isFinite(sceneEndsAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, sceneEndsAt + TURN_AFTER_ATTACK_GAP_MS - now);
}

/** Hold for an effect name; unknown names pace as 0 (play immediately). */
export const holdFor = (effect) =>
  Object.hasOwn(HOLD_MS, effect) ? HOLD_MS[effect] : DEFAULT_HOLD_MS;
