// One-time repair of saved decks whose customhb cards were renumbered by cardback pushes (a push used to number
// cards by list position, so deleting a card shifted every later id). A deck keeps each card under its name with the
// card's old id/localId/image, so the name finds the card again.
import {
  LIBRARY_STORAGE_KEY,
  loadLibraryFromStorage,
  saveLibraryToStorage,
} from './deck-library.mjs';

export const RENUMBER_SET_ID = 'customhb';
export const RENUMBER_DONE_KEY = 'ptcg-sim.customhb-renumber-fix.v1';
export const RENUMBER_BACKUP_KEY = `${LIBRARY_STORAGE_KEY}.backup-customhb-renumber`;

function candidatesFor(byName, name, data) {
  let candidates = byName.get(name) || [];
  if (candidates.length > 1 && data.hp != null) {
    const sameHp = candidates.filter((card) => Number(card.hp) === Number(data.hp));
    if (sameHp.length) candidates = sameHp;
  }
  if (candidates.length > 1 && Array.isArray(data.types) && data.types.length) {
    const sameTypes = candidates.filter((card) => (card.types || []).join('/') === data.types.join('/'));
    if (sameTypes.length) candidates = sameTypes;
  }
  return candidates;
}

/**
 * Points every deck entry of `setId` whose stored id no longer names a card of that name at the card that has the
 * name now. An entry still on the right card is left alone, and so is one that cannot be placed (the card is gone, or
 * several cards share its name and nothing tells them apart).
 * @returns {{ library: object, changed: number, unplaced: number }}
 */
export function remapRenumberedCards(library, setCards, setId = RENUMBER_SET_ID) {
  const cards = Array.isArray(setCards) ? setCards : [];
  const byName = new Map();
  const byNumber = new Map();
  for (const card of cards) {
    if (!card || typeof card.name !== 'string' || typeof card.localId !== 'string') continue;
    byNumber.set(card.localId, card);
    if (!byName.has(card.name)) byName.set(card.name, []);
    byName.get(card.name).push(card);
  }
  const next = structuredClone(library);
  const prefix = `${setId}-`;
  let changed = 0;
  let unplaced = 0;

  for (const deck of Object.values(next.decks || {})) {
    for (const [cardName, group] of Object.entries(deck.cards || {})) {
      for (const variant of group?.cards || []) {
        const data = variant?.data;
        const oldId = typeof data?.id === 'string' ? data.id : '';
        if (!oldId.startsWith(prefix)) continue;
        const oldNumber = oldId.slice(prefix.length);
        const name = typeof data.name === 'string' ? data.name : cardName;
        if (byNumber.get(oldNumber)?.name === name) continue;

        const candidates = candidatesFor(byName, name, data);
        if (candidates.length !== 1) {
          unplaced += 1;
          continue;
        }
        const target = candidates[0];
        const fixed = JSON.parse(
          JSON.stringify(data)
            .split(`${prefix}${oldNumber}`)
            .join(`${prefix}${target.localId}`)
            .split(`/${setId}/${oldNumber}/`)
            .join(`/${setId}/${target.localId}/`)
            .split(`/${setId}/${oldNumber}"`)
            .join(`/${setId}/${target.localId}"`)
        );
        for (const key of ['localId', 'number']) if (key in fixed) fixed[key] = target.localId;
        variant.data = fixed;
        changed += 1;
      }
    }
  }
  return { library: next, changed, unplaced };
}

/**
 * Runs the repair once per browser. `fetchSet()` resolves the current set.json (an object with `cards`). The done flag
 * is set only after the set was read, so a failed fetch tries again on the next load.
 * @returns {Promise<{ ran: boolean, changed: number, unplaced: number }>}
 */
export async function repairRenumberedDecks(storage, fetchSet) {
  if (!storage || typeof storage.getItem !== 'function') return { ran: false, changed: 0, unplaced: 0 };
  if (storage.getItem(RENUMBER_DONE_KEY)) return { ran: false, changed: 0, unplaced: 0 };
  const set = await fetchSet();
  if (!Array.isArray(set?.cards)) throw new Error('custom set data has no cards');

  const raw = storage.getItem(LIBRARY_STORAGE_KEY);
  let changed = 0;
  let unplaced = 0;
  if (raw) {
    const result = remapRenumberedCards(loadLibraryFromStorage(storage), set.cards);
    ({ changed, unplaced } = result);
    if (changed) {
      try {
        storage.setItem(RENUMBER_BACKUP_KEY, raw);
      } catch {
        // a full storage must not stop the repair: the backup is a courtesy
      }
      if (!saveLibraryToStorage(storage, result.library)) return { ran: false, changed: 0, unplaced };
    }
  }
  try {
    storage.setItem(RENUMBER_DONE_KEY, new Date().toISOString());
  } catch {
    // unset flag: the repair runs again next load and finds nothing left to change
  }
  return { ran: true, changed, unplaced };
}
