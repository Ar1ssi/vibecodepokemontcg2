// Signature entry animations (design 027), played on the three.js board's FX layer. A Tera
// Pokémon grows a cluster of crystal round its card that breaks under the Tera jewel and leaves
// it wearing its crystal coat (tera-entry.js, tera-skin.js). A Mega Pokémon is closed in a turning
// shell of energy that cracks and bursts (mega-entry.js). Played by `evolve` (lifecycle.js) and by
// `enter` (a Pokémon put into play from hand, deck or discard). Each returns the hold its scene
// needs, so what follows waits for the burst; without a scene nothing plays and the caller falls
// back.
import { getCardRegistry } from '../apply-view.js';
import { playLanding } from './board-fx.js';
import { signatureEntryKind } from './entry-kind.mjs';
import { playMegaEntry } from './mega-entry.js';
import { MEGA_BURST_MS, MEGA_HOLD_MS } from './mega-entry.mjs';
import { playTeraEntry } from './tera-entry.js';
import { TERA_BURST_MS, TERA_HOLD_MS } from './tera-entry.mjs';
import { flyFromPile } from './transit.js';

const HOLD_MS = Object.freeze({ tera: TERA_HOLD_MS, mega: MEGA_HOLD_MS });
const BURST_MS = Object.freeze({ tera: TERA_BURST_MS, mega: MEGA_BURST_MS });

/** When a signature entry's burst lands, ms from its start (its sound is aligned to it); null for no entry. */
export const signatureBurstMs = (kind) => BURST_MS[kind] ?? null;

/**
 * Play the signature entry for `kind` on the card `instanceId`; `card` (the entering card) picks
 * a Tera crystal's type colour.
 * @returns {number | false} the hold in ms, or false when it did not play (another kind, or no
 *   scene draws the card)
 */
export function playSignatureEntry(kind, instanceId, card) {
  if (kind === 'tera') return playTeraEntry(instanceId, card);
  if (kind === 'mega') return playMegaEntry(instanceId);
  return false;
}

/**
 * `enter` effect: a Pokémon was put into play. A Mega or Tera plays its signature entry; any other
 * lands on its slot (design 089: the card settles, a ring in its type colour rolls out from under
 * it). One that came out of the deck or the discard pile flies in from that pile first
 * (`plan.held`: the card, hidden since the plan was queued).
 */
export const enter = (plan) => {
  clearTimeout(plan.backstop);
  const card = getCardRegistry().get(plan.instanceId)?.card;
  const held = Array.isArray(plan.held) ? plan.held[0] : null;
  const flightMs = held ? flyFromPile(held, plan.user, plan.from) : 0;
  const kind = signatureEntryKind(card);
  const land = () => {
    const hold = kind ? playSignatureEntry(kind, plan.instanceId, card) : false;
    if (hold === false) playLanding(plan.instanceId, card);
    return hold;
  };
  if (flightMs > 0) {
    setTimeout(land, flightMs);
    return kind ? flightMs + HOLD_MS[kind] : flightMs * 0.8;
  }
  const hold = land();
  return hold === false ? undefined : hold;
};
