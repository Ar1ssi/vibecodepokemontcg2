import { normalizeDeckSprites } from './deck-sprites.mjs';

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
        matId: options.matId ?? null,
        wallpaperId: options.wallpaperId ?? null,
        sprites: normalizeDeckSprites(options.sprites),
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
    
        export function setDeckMat(library = {}, deckId, matId = null) {
          if (!library?.decks?.[deckId]) return structuredClone(library);
          const nextLibrary = structuredClone(library);
          nextLibrary.decks[deckId].matId = matId || null;
          nextLibrary.decks[deckId].updatedAt = Date.now();
          return nextLibrary;
        }
    
        /**
         * Writes the deck's Pokémon sprite slots (design 024). Anything the
         * caller cannot back with vendored art is dropped by the normalizer,
         * so a bad slug can never reach the renderer.
         */
        /** Stores the deck's PC Box wallpaper; null falls back to the default. */
        export function setDeckWallpaper(library = {}, deckId, wallpaperId = null) {
          if (!library?.decks?.[deckId]) return structuredClone(library);
          const nextLibrary = structuredClone(library);
          nextLibrary.decks[deckId].wallpaperId = wallpaperId || null;
          nextLibrary.decks[deckId].updatedAt = Date.now();
          return nextLibrary;
        }

        export function setDeckSprites(library = {}, deckId, sprites = []) {
          if (!library?.decks?.[deckId]) return structuredClone(library);
          const nextLibrary = structuredClone(library);
          nextLibrary.decks[deckId].sprites = normalizeDeckSprites(sprites);
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
    
    /**
     * Writes the builder's current state — cards plus the chosen sleeve, coin,
     * mat and Pokémon sprites — over one saved deck, creating it when `deckId`
     * names no deck in the library (the "Untitled Deck" case, where nothing is
     * loaded yet).
     *
     * Cosmetics are only written when supplied: `undefined` leaves whatever the
     * deck already has, while an explicit `null` (or `[]` for sprites) clears it
     * back to the default.
     *
     * @returns {{library: object, deckId: string, created: boolean}}
     */
    export function saveDeckSnapshot(
      library = {},
      { deckId, name, cards = {}, sleeveId, coinId, matId, wallpaperId, sprites } = {},
      now = Date.now()
    ) {
      if (!deckId || !library?.decks?.[deckId]) {
        const created = createDeckInLibrary(library, name, cards, now, {
          sleeveId: sleeveId ?? null,
          coinId: coinId ?? null,
          matId: matId ?? null,
          wallpaperId: wallpaperId ?? null,
          sprites,
        });
        return { library: created.library, deckId: created.deckId, created: true };
      }

      const nextLibrary = structuredClone(library);
      const deck = nextLibrary.decks[deckId];
      deck.cards = structuredClone(cards);
      if (sleeveId !== undefined) deck.sleeveId = sleeveId;
      if (coinId !== undefined) deck.coinId = coinId;
      if (matId !== undefined) deck.matId = matId;
      if (wallpaperId !== undefined) deck.wallpaperId = wallpaperId;
      if (sprites !== undefined) deck.sprites = normalizeDeckSprites(sprites);
      deck.updatedAt = now;
      return { library: nextLibrary, deckId, created: false };
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
          sprites: normalizeDeckSprites(decks[deckId].sprites),
          cards: structuredClone(decks[deckId].cards || {}),
          wallpaperId: decks[deckId].wallpaperId ?? null,
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
            // Decks saved before sprites existed have no field at all; a
            // hand-edited one may have nonsense. Both normalize to [].
            sprites: normalizeDeckSprites(deck.sprites),
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
    