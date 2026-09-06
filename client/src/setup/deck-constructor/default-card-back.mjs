// Shared default card-back (classic Pokémon TCG sleeve). Face-down cards
// and "type default" / no-sleeve fallbacks all resolve through here so the
// local asset and the remote legacy URL stay in sync.
export const DEFAULT_CARD_BACK_PATH = '/src/assets/cardback.png';
export const LEGACY_DEFAULT_CARD_BACK_SRC = 'https://ptcgsim.online/src/assets/cardback.png';

export function resolveDefaultCardBackSrc(origin = globalThis.location?.origin) {
  if (origin) {
    try {
      return new URL(DEFAULT_CARD_BACK_PATH, origin).href;
    } catch {
      // node --test and other non-browser hosts may pass a junk origin
    }
  }
  return DEFAULT_CARD_BACK_PATH;
}
