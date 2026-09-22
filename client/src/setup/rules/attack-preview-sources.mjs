/**
 * @file Where the attack/ability preview reads a card's live state from.
 *
 * Single-player (legacy) cards live in the per-player zone arrays. In a
 * server-authoritative game those arrays are never populated; apply-view.js
 * stamps the server's data on the card instead (`attachedCards`,
 * `abilityUsed`) and keeps the Stadium in its own cache. Each helper prefers
 * the legacy source and falls back to the authoritative one.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

import { isEnergy } from '../../../../shared/engine/cards.mjs';

/**
 * @param {object} card the previewed active Pokémon
 * @param {object[]} legacyActiveCards `getZone('self', 'active').array`
 * @returns {object[]} Energy cards attached to `card`
 */
export function attachedEnergiesFor(card, legacyActiveCards = []) {
  if (!card) return [];
  const legacy = (legacyActiveCards || []).filter(
    (c) => isEnergy(c) && c.image != null && c.image?.relative === card.image
  );
  if (legacy.length > 0) return legacy;
  return (Array.isArray(card.attachedCards) ? card.attachedCards : []).filter(isEnergy);
}

/**
 * @param {{ card: object }|null} legacyStadium `getStadium()`
 * @param {object[]} authoritativeStadiums `getAuthoritativeStadiumArray()`
 * @returns {object|null} the Stadium card in play
 */
export function stadiumCardFor(legacyStadium, authoritativeStadiums = []) {
  if (legacyStadium?.card) return legacyStadium.card;
  return (Array.isArray(authoritativeStadiums) && authoritativeStadiums[0]) || null;
}

/**
 * @param {object} card
 * @param {boolean} legacyUsed `abilityUsed('self', card)`
 * @param {object} [serverAbilitiesUsed] the server's `flags.abilitiesUsed`, keyed by instanceId or card name
 * @returns {boolean} whether the card's once-per-turn ability is spent
 */
export function abilityUsedFor(card, legacyUsed, serverAbilitiesUsed = null) {
  if (legacyUsed || card?.abilityUsed) return true;
  if (!serverAbilitiesUsed || !card) return false;
  // reduce.mjs useAbility checks both keys.
  return Boolean(
    (card.instanceId != null && serverAbilitiesUsed[card.instanceId]) ||
      (card.name && serverAbilitiesUsed[card.name])
  );
}
