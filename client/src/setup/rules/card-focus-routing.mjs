import { isInspectablePokemon } from './card-inspector-model.mjs';

/**
 * Whether a click on a card opens the TCG Live focus view (design 067). Only your own Active
 * Pokémon does: Bench, Stadium, hand and opponent cards keep the 013 inspector or the plain
 * preview. `isInspectablePokemon` also keeps an attached Energy token, which can sit in the same
 * zone, from opening a Pokémon focus.
 *
 * @param {{ zoneId?: string, cardUser?: string, card?: object|null }} click
 */
export const shouldOpenCardFocus = ({ zoneId, cardUser, card } = {}) =>
  zoneId === 'active' &&
  cardUser === 'self' &&
  Boolean(card?.image) &&
  isInspectablePokemon(card);
