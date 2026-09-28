import {
      createDeckInLibrary,
      deleteDeckFromLibrary,
      getDeckFromLibrary,
      getDeckFormat,
      LIBRARY_STORAGE_KEY,
      listDecks,
      loadLibraryFromStorage,
      renameDeckInLibrary,
      saveDeckSnapshot,
      saveDeckToLibrary,
      saveLibraryToStorage,
      setDeckSleeve,
      setDeckCoin,
      setDeckMat,
      setDeckSprites,
      setDeckWallpaper,
      MAX_LIBRARY_DECKS,
    } from '../../../setup/deck-builder/core/deck-library.mjs';
    import {
      deckSpriteImageUrl,
      deckSpriteLabel,
      normalizeDeckSprites,
    } from '../../../setup/deck-builder/core/deck-sprites.mjs';
    import { resolveDisplaySprites } from '../../../setup/deck-builder/core/card-sprites.mjs';
    import { renderDeckSprites } from './native-deck-builder-renderers.js';
    import { getStarterDecks, STARTER_DECK_CATALOG } from '../../../setup/deck-builder/core/set-browser.mjs';
    import { DECK_FORMAT_BUILD_BATTLE } from '../../../../../shared/engine/formats.mjs';
    
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
     * The deck builder tab and the game tab both hold a controller over the
     * same stored library (design 050), so every change re-reads storage first
     * and writes back only its own edit, and a `storage` event from the other
     * tab reloads this one.
     *
     * @param {object} options
     * @param {function} options.onOpenDeck - called with (target, deckId, cards)
     *   when a saved deck is opened; deckId is null when the editor is cleared.
     * @param {function} options.onSaveCurrentDeck - called before switching decks
     *   so the caller can flush the current editor deck into its saved deck.
     * @param {boolean} [options.allowDeckWrites] - false on the game tab: it
     *   never edits deck cards, so its stale editor copy must never be saved.
     * @returns {object|null} controller, or null when the bar markup is missing.
     */
    export const initializeNativeDeckBuilderLibrary = ({
      onOpenDeck,
      onSaveCurrentDeck,
      allowDeckWrites = true,
    }) => {
      const barEl = document.getElementById('nativeDeckBuilderLibraryBar');
      const listEl = document.getElementById('nativeDeckBuilderLibraryList');
      const newDeckButton = document.getElementById('nativeDeckBuilderNewDeck');
      const statusEl = document.getElementById('nativeDeckBuilderLibraryStatus');
      // "My Decks" is a dropdown beside Current Deck (design 050): the toggle
      // names the open deck, the popover holds the deck chips.
      const toggleEl = document.getElementById('nativeDeckBuilderLibraryToggle');
      const popoverEl = document.getElementById('nativeDeckBuilderLibraryPopover');
      const toggleLabelEl = toggleEl?.querySelector('[data-deck-picker-label]') || null;

      if (!barEl || !listEl || !newDeckButton) return null;

      const onPickerKeydown = (event) => {
        if (event.key === 'Escape') {
          closePicker();
          toggleEl?.focus();
        }
      };
      const onPickerOutside = (event) => {
        if (!barEl.contains(event.target)) closePicker();
      };
      const openPicker = () => {
        if (!popoverEl) return;
        popoverEl.hidden = false;
        toggleEl?.setAttribute('aria-expanded', 'true');
        document.addEventListener('keydown', onPickerKeydown);
        document.addEventListener('mousedown', onPickerOutside);
      };
      // Hoisted: openDeck, defined below, closes the picker once a deck is picked.
      function closePicker() {
        if (!popoverEl || popoverEl.hidden) return;
        popoverEl.hidden = true;
        toggleEl?.setAttribute('aria-expanded', 'false');
        document.removeEventListener('keydown', onPickerKeydown);
        document.removeEventListener('mousedown', onPickerOutside);
      }
      toggleEl?.addEventListener('click', () => {
        if (popoverEl?.hidden) openPicker();
        else closePicker();
      });
    
      let library = loadLibraryFromStorage(window.localStorage);
      let currentTarget = 'self';
      const activeDeckIds = { self: null, opp: null };

      const reload = () => {
        library = loadLibraryFromStorage(window.localStorage);
      };
    
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
            if (entry.matId && !deck.matId) {
              nextLibrary = setDeckMat(nextLibrary, existingId, entry.matId);
              changed = true;
            }
            if (entry.sprites && !deck.sprites?.length) {
              nextLibrary = setDeckSprites(nextLibrary, existingId, entry.sprites);
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
            {
              sleeveId: entry.sleeveId || null,
              coinId: entry.coinId || null,
              matId: entry.matId || null,
            }
          );
          nextLibrary = created.library;
          if (entry.sprites) {
            nextLibrary = setDeckSprites(nextLibrary, created.deckId, entry.sprites);
          }
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
        reload();
        const cards = getDeckFromLibrary(library, deckId);
        if (!cards) return;
        const key = target === 'opp' ? 'opp' : 'self';
        activeDeckIds[key] = deckId;
        closePicker();
        onOpenDeck(target, deckId, cards);
        render();
      };
    
      const createNewDeck = () => {
        reload();
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
        reload();
        const deck = library?.decks?.[deckId];
        if (!deck) return;
        const newName = window.prompt('Rename deck:', deck.name);
        if (newName === null) return;
        commit(renameDeckInLibrary(library, deckId, newName));
      };
    
      const deleteDeck = (deckId) => {
        reload();
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
        if (toggleLabelEl) {
          toggleLabelEl.textContent = library?.decks?.[activeId]?.name || 'Choose a deck';
        }

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
                <span class="native-deck-builder-deck-sprites native-deck-builder-chip-sprites" data-chip-sprites="${safeId}"></span>
                <button class="native-deck-builder-library-chip-name" title="Open deck for editing">${safeName}</button>
                ${deck.format === DECK_FORMAT_BUILD_BATTLE ? '<span class="native-deck-builder-format-badge" title="Build &amp; Battle: 40 cards, 4 Prizes">B&amp;B 40</span>' : ''}
                <span class="native-deck-builder-library-chip-actions">
                  <button class="native-deck-builder-library-chip-btn" data-action="rename" title="Rename deck" aria-label="Rename deck">&#9998;</button>
                  <button class="native-deck-builder-library-chip-btn" data-action="delete" title="Delete deck" aria-label="Delete deck">&#10005;</button>
                </span>
              </span>`;
          })
          .join('');
    
        // The chip sprites are drawn rather than inlined so the strip markup
        // has exactly one definition, shared with the editor header.
        for (const deck of decks) {
          renderDeckSprites({
            stripEl: listEl.querySelector(`[data-chip-sprites="${CSS.escape(deck.id)}"]`),
            sprites: resolveDisplaySprites(deck.sprites, deck.cards),
            spriteUrl: deckSpriteImageUrl,
            spriteLabel: deckSpriteLabel,
            editable: false,
          });
        }

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

      // The other tab changed the library (key null = storage cleared).
      window.addEventListener('storage', (event) => {
        if (event.key !== null && event.key !== LIBRARY_STORAGE_KEY) return;
        reload();
        render();
      });

      render();

      // Cosmetic setters: re-read, then write only this deck's field.
      const setActiveField = (target, value, setField, { silent = true } = {}) => {
        reload();
        const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
        if (!activeId || !library?.decks?.[activeId]) return false;
        commit(setField(library, activeId, value), { silent });
        return true;
      };

      return {
        refresh: () => {
          reload();
          render();
        },
        setTarget: (target) => {
          currentTarget = target === 'opp' ? 'opp' : 'self';
          render();
        },
        /** Opens a saved deck into the editor, as picking it from My Decks does. */
        openDeckById: (target, deckId) => {
          reload();
          if (!library?.decks?.[deckId]) return false;
          openDeck(target, deckId);
          return true;
        },
        /**
         * Creates a deck without prompting (Build & Battle box decks) and opens it for `target`.
         *
         * @returns {string|null} the new deck id, or null at the deck limit or on the read-only game tab.
         */
        createAndOpenDeck: (target, name, cards, options = {}) => {
          if (!allowDeckWrites) return null;
          reload();
          if (listDecks(library).length >= MAX_LIBRARY_DECKS) {
            showStatus(`Deck limit reached (${MAX_LIBRARY_DECKS}). Delete a deck first.`);
            return null;
          }
          const { library: nextLibrary, deckId } = createDeckInLibrary(
            library,
            name,
            cards,
            Date.now(),
            options
          );
          commit(nextLibrary, { silent: true });
          openDeck(target, deckId);
          return deckId;
        },
        setActiveDeck: (target, deckId) => {
          const key = target === 'opp' ? 'opp' : 'self';
          activeDeckIds[key] = deckId || null;
          render();
        },
        setActiveSleeve: (target, sleeveId) =>
          setActiveField(target, sleeveId, setDeckSleeve),
        setActiveCoin: (target, coinId) => setActiveField(target, coinId, setDeckCoin),
        setActiveMat: (target, matId) => setActiveField(target, matId, setDeckMat),
        setActiveSprites: (target, sprites) =>
          setActiveField(target, sprites, setDeckSprites, { silent: false }),
        setActiveWallpaper: (target, wallpaperId) =>
          setActiveField(target, wallpaperId, setDeckWallpaper),
        getActiveWallpaper: (target) => {
              const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
              return activeId && library?.decks?.[activeId]
                ? library.decks[activeId].wallpaperId || null
                : null;
            },
        getActiveSprites: (target) => {
              const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
              return activeId && library?.decks?.[activeId]
                ? normalizeDeckSprites(library.decks[activeId].sprites)
                : [];
            },
            getActiveDeckName: (target) => {
          const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
          return activeId && library?.decks?.[activeId]
            ? library.decks[activeId].name || null
            : null;
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
          if (!allowDeckWrites) return false;
          reload();
          const activeId = activeDeckIds[currentTarget];
          if (!activeId || !library?.decks?.[activeId]) return false;
          commit(saveDeckToLibrary(library, activeId, cards, Date.now()), {
            silent: true,
          });
          return true;
        },
        /**
         * Explicit Save: writes the editor's cards and the chosen sleeve, coin
         * and mat over the loaded deck. With nothing loaded there is no deck to
         * overwrite, so it asks for a name and creates one rather than throwing
         * the work away.
         *
         * @returns {{saved: boolean, created: boolean, name: string|null,
         *   reason?: 'cancelled'|'limit'}}
         */
        saveCurrentDeck: (cards, cosmetics = {}) => {
          if (!allowDeckWrites) {
            return { saved: false, created: false, name: null, reason: 'read-only' };
          }
          reload();
          const activeId = activeDeckIds[currentTarget];
          const isNew = !activeId || !library?.decks?.[activeId];

          let name;
          if (isNew) {
            if (listDecks(library).length >= MAX_LIBRARY_DECKS) {
              showStatus(
                `Deck limit reached (${MAX_LIBRARY_DECKS}). Delete a deck first.`
              );
              return { saved: false, created: false, name: null, reason: 'limit' };
            }
            name = window.prompt('Name this deck:');
            if (name === null) {
              return { saved: false, created: false, name: null, reason: 'cancelled' };
            }
          }

          const { library: nextLibrary, deckId, created } = saveDeckSnapshot(
            library,
            { deckId: activeId, name, cards, ...cosmetics },
            Date.now()
          );

          activeDeckIds[currentTarget] = deckId;
          commit(nextLibrary, {
            savedMessage: created ? 'Deck created.' : 'Deck saved.',
          });
          return {
            saved: true,
            created,
            name: nextLibrary.decks[deckId]?.name || null,
          };
        },
        // 'build-battle' for Build & Battle decks, null otherwise: a Standard record must leave
        // room for detectDeckFormat to spot a Pocket deck (design 051, slice 2 pin).
        getActiveDeckFormat: (target) => {
          const activeId = activeDeckIds[target === 'opp' ? 'opp' : 'self'];
          const format = activeId ? getDeckFormat(library, activeId) : null;
          return format === DECK_FORMAT_BUILD_BATTLE ? format : null;
        },
        getActiveDeckId: (target) =>
          activeDeckIds[target === 'opp' ? 'opp' : 'self'] ??
          activeDeckIds[currentTarget],
        getLibrary: () => library,
      };
    };
    