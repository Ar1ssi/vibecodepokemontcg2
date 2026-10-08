// Design 064 Addendum A: what the attack's sound needs to know about the scene combat.js plays —
// its sound family, its tier (which size of sampled hit), when it makes contact (where the hit's
// peak must land) and the attacker's printed type. Pure, so it is testable without the DOM; the
// caller (combat.js attackSoundFor) makes the same signature / move picks `attack()` makes.
import { LUNGE_IMPACT, LUNGE_MS } from '../combat-pose.mjs';
import { tierFor } from './move-select.mjs';

/** Contact time of the generic lunge, the fallback when no move spec plays. */
export const LUNGE_CONTACT_MS = Math.round(LUNGE_MS * LUNGE_IMPACT);

/**
 * @param {{ signatureSpec?: object|null, zeroDamage?: boolean, pick?: object|null, card?: object|null }} scene
 * @returns {{ family: string|undefined, attackTier: 1|2|3|'S'|'aura', contactMs: number, attackType: string|null }}
 */
export function attackSoundFields({ signatureSpec = null, zeroDamage = false, pick = null, card = null } = {}) {
  const attackType = Array.isArray(card?.types) ? (card.types[0] ?? null) : null;
  if (signatureSpec) {
    return { family: signatureSpec.family, attackTier: 'S', contactMs: signatureSpec.contactMs, attackType };
  }
  if (zeroDamage) return { family: undefined, attackTier: 'aura', contactMs: 0, attackType };
  if (pick?.score) {
    return { family: pick.family, attackTier: pick.tier, contactMs: pick.score.contactMs, attackType };
  }
  return { family: pick?.family, attackTier: tierFor(card), contactMs: LUNGE_CONTACT_MS, attackType };
}
