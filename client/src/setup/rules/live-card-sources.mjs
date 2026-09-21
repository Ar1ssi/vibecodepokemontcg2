/**
 * @file Where the glow glue (design 023 slice 5) reads live cards and their DOM
 * nodes from, under the two render paths.
 *
 * Legacy: cards ARE their zone-array objects and their node is `wrapper || image`.
 * Authoritative: the view's card objects are plain data (no DOM, no attachment
 * links stamped); apply-view.js's registry holds the renderer's own copy, which
 * carries `attachedCards`/`abilityUsed`, and the visible node is its holo wrapper
 * or element. Each helper prefers the legacy source and falls back to the
 * authoritative one (same split as attack-preview-sources.mjs).
 *
 * Pure except for the injected registry lookup, so it runs under `node --test`.
 */

import { getCardRegistry, hasAuthoritativeView } from '../netcode/apply-view.js';
import { topPokemonCard } from '../../../../shared/engine/rules/evolved-pokemon.mjs';
import { getActivePokemonCard } from '../../../../shared/engine/zones/active-pokemon.mjs';

const isPokemon = (card) => (card?.type2 || card?.type) === 'Pokémon';

const resolveDeps = ({
  authoritative = hasAuthoritativeView(),
  registry = getCardRegistry(),
} = {}) => ({ authoritative, registry });

/**
 * The renderer's own card object for a live card. Under authoritative rendering
 * the view object is a plain copy the renderer never writes back to, while its
 * registry record carries the stamped `attachedCards`/`abilityUsed`; legacy
 * cards are returned as they are.
 *
 * @param {object} card
 * @param {{authoritative?: boolean, registry?: Map}} [deps]
 * @returns {object}
 */
export function liveCardFor(card, deps) {
  const { authoritative, registry } = resolveDeps(deps);
  if (!authoritative || card?.instanceId == null) return card;
  return registry.get(card.instanceId)?.card || card;
}

/**
 * The Pokémon a play zone's Active spot is showing. The server models an
 * evolution as the Evolution card attached under the Basic (D40), so the
 * authoritative read is the top of the stack, through the registry (so
 * `attachedCards`/`abilityUsed` and the node are the renderer's). Legacy keeps
 * its own `image.relative` top-of-stack read.
 *
 * @param {object[]} zoneCards
 * @param {{authoritative?: boolean, registry?: Map}} [deps]
 * @returns {object|null}
 */
export function liveActiveCard(zoneCards, deps) {
  const cards = Array.isArray(zoneCards) ? zoneCards : [];
  const { authoritative } = resolveDeps(deps);
  if (!authoritative) return getActivePokemonCard({ array: cards });
  const root = cards.find((card) => card?.attachedTo == null && isPokemon(card)) || null;
  if (!root) return null;
  return liveCardFor(topPokemonCard(cards, root), deps);
}

/**
 * The node a glow paints: the registry's holo wrapper (the <img> lives inside it
 * once hydrated), else its element, else the legacy `wrapper || image`.
 *
 * @param {object} card
 * @param {{authoritative?: boolean, registry?: Map}} [deps]
 * @returns {object|null}
 */
export function glowNodeFor(card, deps) {
  const { authoritative, registry } = resolveDeps(deps);
  if (authoritative && card?.instanceId != null) {
    const record = registry.get(card.instanceId);
    const node = record?.holoCard?.wrapper || record?.element;
    if (node) return node;
  }
  return card?.wrapper || card?.image || null;
}
