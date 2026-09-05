import { determineDeckData } from './determine-deckdata.js';
import { getZone } from '../zones/get-zone.js';

const deckDataHasCards = (deckData) => {
  if (!Array.isArray(deckData) || deckData.length === 0) return false;
  return deckData.some((row) => {
    const qty = Number.parseInt(row?.[0], 10);
    return Number.isFinite(qty) && qty > 0;
  });
};

/** True when the player has a non-empty deck on the playmat. */
export const hasDeckLoaded = (user) => {
  const deck = getZone(user, 'deck');
  if (deck?.getCount?.() > 0) return true;
  return deckDataHasCards(determineDeckData(user));
};
