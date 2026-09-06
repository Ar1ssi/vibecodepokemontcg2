import {
      createDeckInLibrary,
      deleteDeckFromLibrary,
      getDeckFromLibrary,
      listDecks,
      loadLibraryFromStorage,
      renameDeckInLibrary,
      saveDeckToLibrary,
      saveLibraryToStorage,
      setDeckSleeve,
      setDeckCoin,
      setDeckMat,
      MAX_LIBRARY_DECKS,
    } from '../../../setup/deck-builder/core/deck-library.mjs';
    import { getStarterDecks, STARTER_DECK_CATALOG } from '../../../setup/deck-builder/core/set-browser.mjs';
    
    const escapeHtml = (value = '') => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
    
    /**
     * Saved deck library ("My Decks") bar inside the native deck builder.
     *
     * The deck library itself is persisted to localStorage, while the binding of
     * "which saved deck is currently open for editing" is session state, tracked
     * per target (P1 / P2). This avoids stale cross-session bindings overwriting
     * saved decks on page load.
     *
     * @param {object} options
     * @param {function} options.onOpenDeck - called with (target, deckId, cards)
     *   when a saved deck is opened; deckId is null when the editor is cleared.
     * @param {function} options.onSaveCurrentDeck - called before switching decks
     *   so the caller can flush the current editor deck into its saved deck.
     * @returns {object|null} controller, or null when the bar markup is missing.
     */
    export const initializeNativeDeckBuilderLibrary = ({
      onOpenDeck,
      onSaveCurrentDeck,
    }) => {
      const barEl = document.getElementById('nativeDeckBuilderLibraryBar');
      const listEl = document.getElementById('nativeDeckBuilderLibraryList');
      const newDeckButton = document.getElementById('nativeDeckBuilderNewDeck');
      const statusEl = document.getElementById('nativeDeckBuilderLibraryStatus');
    
      if (!barEl || !listEl || !newDeckButton) return null;
    
      let library = loadLibraryFromStorage(window.localStorage);
      let currentTarget = 'self';
      const activeDeckIds = { self: null, opp: null };
    
      // Seed premade starter/battle decks so every player has playable lists.
      // Adds any catalog deck missing from the library; backfills sleeve/coin on
      // existing premade decks that were seeded before cosmetics were added.
      const seedStarterDecks = () => {
        const starters = getStarterDecks();
        const decksByName = new Map(listDecks(library).map((d) => [d.name, d.id]));
        let nextLibrary = library;
        let changed = false;

        for (const entry of STARTER_DECK_CATALOG) {
          const existingId = decksByName.get(entry.name);
          if (existingId) {
            const deck = nextLibrary.decks[existingId];
            if (entry.sleeveId && !deck.sleeveId) {
              nextLibrary = setDeckSleeve(nextLibrary, existingId, entry.sleeveId);
              changed = true;
            }
            if (entry.coinId && !deck.coinId) {
              nextLibrary = setDeckCoin(nextLibrary, existingId, entry.coinId);
              changed = true;
            }
            continue;
          }

          const cards = starters[entry.key];
          if (!cards?.length) continue;

          const grouped = {};
          for (const card of cards) {
            const variant = { ...card };
            delete variant.qty;
            const count = card.qty;
            if (!grouped[card.name]) {
              grouped[card.name] = { cards: [], totalCount: 0 };
            }
            grouped[card.name].cards.push({ data: variant, count });
            grouped[card.name].totalCount += count;
          }
          const created = createDeckInLibrary(
            nextLibrary,
            entry.name,
            grouped,
            Date.now(),
            { sleeveId: entry.sleeveId || null, coinId: entry.coinId || null }
          );
          nextLibrary = created.library;
          changed = true;
        }

        if (changed) {
          library = nextLibrary;
          saveLibraryToStorage(window.localStorage, library);
        }
      };
      seedStarterDecks();
    
      const showStatus = (message) => {
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.classList.add('visible');
        setTimeout(() => statusEl.classList.remove('visible'), 2400);
      };
    
      const commit = (nextLibrary, { savedMessage, silent = false } = {}) => {
        library = nextLibrary;
        saveLibraryToStorage(window.localStorage, library);
        if (!silent) render();
        if (savedMessage) showStatus(savedMessage);
      };
    
      const openDeck = (target, deckId) => {
        const cards = getDeckFromLibrary(library, deckId);
        if (!cards) return;
        const key = target === 'opp' ? 'opp' : 'self';
        activeDeckIds[key] = deckId;
        onOpenDeck(target, deckId, cards);
        render();
      };
    
      const createNewDeck = () => {
        if (listDecks(library).length >= MAX_LIBRARY_DECKS) {
          showStatus(`Deck limit reached (${MAX_LIBRARY_DECKS}). Delete a deck first.`);
          return;
        }
        const name = window.prompt('Name your new deck:');
        if (name === null) return;
        const { library: nextLibrary, deckId } = createDeckInLibrary(
          library,
          name,
          {},
          Date.now()
        );
        activeDeckIds[currentTarget] = deckId;
        commit(nextLibrary);
        onOpenDeck(currentTarget, deckId, {});
        showStatus('Deck created.');
      };
    
      const renameDeck = (deckId) => {
        const deck = library?.decks?.[deckId];
        if (!deck) return;
        const newName = window.prompt('Rename deck:', deck.name);
        if (newName === null) return;
        commit(renameDeckInLibrary(library, deckId, newName));
      };
    
      const deleteDeck = (deckId) => {
        const deck = library?.decks?.[deckId];
        if (!deck) return;
        if (!window.confirm(`Delete deck "${deck.name}"? This cannot be undone.`)) return;
        const nextLibrary = deleteDeckFromLibrary(library, deckId);
        for (const key of ['self', 'opp']) {
          if (activeDeckIds[key] === deckId) {
            activeDeckIds[key] = null;
            onOpenDeck(key, null, {});
          }
        }
        commit(nextLibrary);
        showStatus('Deck deleted.');
      };
    
      const render = () => {
        const decks = listDecks(library);
        const activeId = activeDeckIds[currentTarget];
    
        if (decks.length === 0) {
          listEl.innerHTML =
            '<span class="native-deck-builder-library-empty">No saved decks yet — create one to get started.</span>';
          return;
        }
    
        listEl.innerHTML = decks
          .map((deck) => {
            const safeName = escapeHtml(deck.name);
            const safeId = escapeHtml(deck.id);
            const isActive = deck.id === activeId;
            return `
              <span class="native-deck-builder-library-chip${isActive ? ' active' : ''}" data-deck-id="${safeId}">
                <button class="native-deck-builder-library-chip-name" title="Open deck for editing">${safeName}</button>
                <span class="native-deck-builder-library-chip-actions">
                  <button class="native-deck-builder-library-chip-btn" data-action="rename" title="Rename deck" aria-label="Rename deck">&#9998;</button>
                  <button class="native-deck-builder-library-chip-btn" data-action="delete" title="Delete deck" aria-label="Delete deck">&#10005;</button>
                </span>
              </span>`;
          })
          .join('');
    
        listEl.querySelectorAll('[data-deck-id]').forEach((chip) => {
          const deckId = chip.dataset.deckId;
    
          const nameButton = chip.querySelector('.native-deck-builder-library-chip-name');
          nameButton.addEventListener('click', () => {
            onSaveCurrentDeck?.();
            openDeck(currentTarget, deckId);
          });
    
          chip.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
              event.stopPropagation();
              if (btn.dataset.action === 'rename') renameDeck(deckId);
              if (btn.dataset.action === 'delete') deleteDeck(deckId);
            });
          });
        });
      };
    
      newDeckButton.addEventListener('click', () => {
        onSaveCurrentDeck?.();
        createNewDeck();
      });
    
      render();
    
      return {
        refresh: () => {
          library = loadLibraryFromStorage(window.localStorage);
          render();
        },
        setTarget: (target) => {
          currentTarget = target === 'opp' ? 'opp' : 'self';
          render();
        },
        setActiveDeck: (target, deckId) => {
          const key = target === 'opp' ? 'opp' : 'self';
          activeDeckIds[key] = deckId || null;
          render();
        },
        setActiveSleeve: (target, sleeveId) => {
              const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
              if (!activeId || !library?.decks?.[activeId]) return false;
              commit(setDeckSleeve(library, activeId, sleeveId), { silent: true });
              return true;
            },
        setActiveCoin: (target, coinId) => {
              const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
              if (!activeId || !library?.decks?.[activeId]) return false;
              commit(setDeckCoin(library, activeId, coinId), { silent: true });
              return true;
            },
        setActiveMat: (target, matId) => {
              const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
              if (!activeId || !library?.decks?.[activeId]) return false;
              commit(setDeckMat(library, activeId, matId), { silent: true });
              return true;
            },
            getActiveDeckName: (target) => {
          const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
        },
        getActiveSleeve: (target) => {
              const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
              return activeId && library?.decks?.[activeId] ? library.decks[activeId].sleeveId || null : null;
            },
        getActiveCoin: (target) => {
              const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
              return activeId && library?.decks?.[activeId] ? library.decks[activeId].coinId || null : null;
            },
        getActiveMat: (target) => {
              const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
              return activeId && library?.decks?.[activeId] ? library.decks[activeId].matId || null : null;
            },
            saveActiveDeck: (cards) => {
          const activeId = activeDeckIds[currentTarget];
          if (!activeId || !library?.decks?.[activeId]) return false;
          commit(saveDeckToLibrary(library, activeId, cards, Date.now()), {
            silent: true,
          });
          return true;
        },
        getActiveDeckId: (target) =>
          activeDeckIds[target === 'opp' ? 'opp' : 'self'] ??
          activeDeckIds[currentTarget],
        getLibrary: () => library,
      };
    };
    