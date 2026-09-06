const DECK_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const DECK_ID_LENGTH = 8;
    const MAX_DECK_NAME_LENGTH = 60;
    
    export const LIBRARY_STORAGE_KEY = 'ptcg-sim.deck-library.v1';
    export const MAX_LIBRARY_DECKS = 60;
    
    export function createEmptyLibrary() {
      return { decks: {}, order: [] };
    }
    
    export function generateDeckId(existingIds = {}) {
      let deckId = '';
      do {
        deckId = '';
        for (let i = 0; i < DECK_ID_LENGTH; i += 1) {
          deckId += DECK_ID_ALPHABET[Math.floor(Math.random() * DECK_ID_ALPHABET.length)];
        }
      } while (existingIds[deckId]);
      return deckId;
    }
    
    function sanitizeDeckName(name, fallback = 'Untitled Deck') {
      const trimmed = String(name ?? '')
        .trim()
        .slice(0, MAX_DECK_NAME_LENGTH);
      return trimmed || fallback;
    }
    
    export function createDeckInLibrary(
      library = {},
      name,
      cards = {},
      now = Date.now(),
      options = {}
    ) {
      const nextLibrary = structuredClone(library);
      const deckId = generateDeckId(nextLibrary.decks);
      nextLibrary.decks[deckId] = {
        id: deckId,
        name: sanitizeDeckName(name),
        createdAt: now,
        updatedAt: now,
        cards: structuredClone(cards),
        sleeveId: options.sleeveId ?? null,
        coinId: options.coinId ?? null,
      };
      nextLibrary.order = [...(nextLibrary.order || []), deckId];
      return { library: nextLibrary, deckId };
    }
    
    export function renameDeckInLibrary(library = {}, deckId, name) {
      if (!library?.decks?.[deckId]) return structuredClone(library);
      const nextLibrary = structuredClone(library);
      nextLibrary.decks[deckId].name = sanitizeDeckName(name, nextLibrary.decks[deckId].name);
      return nextLibrary;
    }
    
    export function deleteDeckFromLibrary(library = {}, deckId) {
      if (!library?.decks?.[deckId]) return structuredClone(library);
      const nextLibrary = structuredClone(library);
      delete nextLibrary.decks[deckId];
      nextLibrary.order = (nextLibrary.order || []).filter((id) => id !== deckId);
      return nextLibrary;
    }
    
    export function getDeckFromLibrary(library = {}, deckId) {
      const deck = library?.decks?.[deckId];
      if (!deck) return null;
      return structuredClone(deck.cards || {});
    }
    
    export function setDeckSleeve(library = {}, deckId, sleeveId = null) {
      if (!library?.decks?.[deckId]) return structuredClone(library);
      const nextLibrary = structuredClone(library);
      nextLibrary.decks[deckId].sleeveId = sleeveId || null;
      nextLibrary.decks[deckId].updatedAt = Date.now();
      return nextLibrary;
    }
    
        export function setDeckCoin(library = {}, deckId, coinId = null) {
          if (!library?.decks?.[deckId]) return structuredClone(library);
          const nextLibrary = structuredClone(library);
          nextLibrary.decks[deckId].coinId = coinId || null;
          nextLibrary.decks[deckId].updatedAt = Date.now();
          return nextLibrary;
        }
    
    export function saveDeckToLibrary(library = {}, deckId, cards = {}, now = Date.now()) {
      if (!library?.decks?.[deckId]) return structuredClone(library);
      const nextLibrary = structuredClone(library);
      nextLibrary.decks[deckId].cards = structuredClone(cards);
      nextLibrary.decks[deckId].updatedAt = now;
      return nextLibrary;
    }
    
    export function listDecks(library = {}) {
      const decks = library?.decks || {};
      return (library?.order || [])
        .filter((deckId) => decks[deckId])
        .map((deckId) => ({
          id: decks[deckId].id,
          name: decks[deckId].name,
          createdAt: decks[deckId].createdAt,
          updatedAt: decks[deckId].updatedAt,
        }));
    }
    
    export function serializeLibrary(library = {}) {
      return JSON.stringify(library);
    }
    
    function isValidLibraryShape(value) {
      return Boolean(
        value &&
          typeof value === 'object' &&
          value.decks &&
          typeof value.decks === 'object' &&
          Array.isArray(value.order)
      );
    }
    
    export function parseLibrary(json = '') {
      let parsed;
      try {
        parsed = JSON.parse(String(json));
      } catch {
        return createEmptyLibrary();
      }
      if (!isValidLibraryShape(parsed)) return createEmptyLibrary();
    
      // Drop malformed entries and repair ordering so the library always renders.
      const decks = {};
      for (const [deckId, deck] of Object.entries(parsed.decks)) {
        if (deck && typeof deck === 'object' && deck.id === deckId && typeof deck.name === 'string') {
          decks[deckId] = {
            ...deck,
            cards: deck.cards && typeof deck.cards === 'object' ? deck.cards : {},
          };
        }
      }
      const order = parsed.order.filter((deckId) => decks[deckId]);
      for (const deckId of Object.keys(decks)) {
        if (!order.includes(deckId)) order.push(deckId);
      }
      return { decks, order };
    }
    
    export function loadLibraryFromStorage(storage) {
      try {
        return parseLibrary(storage?.getItem?.(LIBRARY_STORAGE_KEY) || '');
      } catch {
        return createEmptyLibrary();
      }
    }
    
    export function saveLibraryToStorage(storage, library = {}) {
      try {
        if (!storage || typeof storage.setItem !== 'function') return false;
        storage.setItem(LIBRARY_STORAGE_KEY, serializeLibrary(library));
        return true;
      } catch {
        return false;
      }
    }
    