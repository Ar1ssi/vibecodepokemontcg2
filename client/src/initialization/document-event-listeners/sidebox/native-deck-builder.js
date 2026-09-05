import {
  formatImageUrl,
  parseSimCsv,
  serializeDeckToSimCsv,
} from '../../../setup/deck-builder/core/csv-adapter.mjs';
import { getSortedDeckCardArray } from '../../../setup/deck-builder/core/card-sort.mjs';
import {
  detectDeckFormat,
  validateDeck,
} from '../../../setup/deck-builder/core/deck-validation.mjs';
import { systemState } from '../../../front-end.js';
import {
  changeCardBack,
  loadDeckData,
} from '../../../setup/deck-constructor/import.js';
import { show } from '../../../setup/home-header/header-toggle.js';
import {
  renderDeckCards,
  renderDeckSummary,
  renderSearchResults,
} from './native-deck-builder-renderers.js';
import { syncDeckFromLoadedRows } from './native-deck-builder-sync.js';
import {
  addCard,
  createEmptyDeck,
  getDeckCounts,
  removeCard,
} from '../../../setup/deck-builder/core/deck-state.mjs';
import {
  applyLocalControls,
  queryCardsByName,
} from '../../../setup/deck-builder/core/card-search.mjs';
import { initializeNativeDeckBuilderLibrary } from './native-deck-builder-library.js';
import { initializeNativeDeckBuilderSetBrowser } from './native-deck-builder-set-browser.js';
import { initializeDeckBuilderSleevePicker } from './native-deck-builder-sleeve-picker.js';
import { initializeDeckBuilderCoinPicker } from './native-deck-builder-coin-picker.js';
import { initializeDeckBuilderMatPicker } from './native-deck-builder-mat-picker.js';
import { getCoinById } from '../../../setup/deck-builder/core/coins.mjs';
import { getMatById } from '../../../setup/deck-builder/core/mats.mjs';
import { getSleeves } from '../../../setup/deck-builder/core/sleeves.mjs';
    
    import {
      buildHoloCard,
      resolveHoloEffect,
      startHoloAnimation,
      stopHoloAnimation,
    } from '../../../setup/deck-builder/core/holo.mjs';

const deckToSimRows = (deck = {}) => {
  const rows = [];

  for (const cardName in deck) {
    const group = deck[cardName];
    for (const variant of group?.cards || []) {
      rows.push([
        String(variant.count),
        cardName,
        variant?.data?.supertype || '',
        formatImageUrl(variant?.data || {}),
      ]);
    }
  }

  return rows;
};

export const initializeNativeDeckBuilder = () => {
  const targetMainButton = document.getElementById(
    'nativeDeckBuilderTargetMain'
  );
  const targetAltButton = document.getElementById('nativeDeckBuilderTargetAlt');

  const playButton = document.getElementById('nativeDeckBuilderPlayButton');
  const exportCsvButton = document.getElementById('nativeDeckBuilderExportCsv');
  const importCsvLabel = document.getElementById('nativeDeckBuilderImportCsvLabel');
  const importCsvInput = document.getElementById('nativeDeckBuilderCsvImport');
  const clearButton = document.getElementById('nativeDeckBuilderClear');
  const deckStatus = document.getElementById('nativeDeckBuilderDeckStatus');
  const summary = document.getElementById('nativeDeckBuilderSummaryPanel');
  const validationDot = document.getElementById(
    'nativeDeckBuilderValidationDot'
  );
  const cards = document.getElementById('nativeDeckBuilderCardsPanel');
  const searchInput = document.getElementById('nativeDeckBuilderSearchInput');
  const cardTypeFilter = document.getElementById(
    'nativeDeckBuilderCardTypeFilter'
  );
  const sortBySelect = document.getElementById('nativeDeckBuilderSortBy');
  const sortDirectionSelect = document.getElementById(
    'nativeDeckBuilderSortDirection'
  );
  const searchButton = document.getElementById('nativeDeckBuilderSearchButton');
  const searchStatus = document.getElementById('nativeDeckBuilderSearchStatus');
  const searchResults = document.getElementById(
    'nativeDeckBuilderSearchResults'
  );
  const previewScrim = document.getElementById(
    'nativeDeckBuilderCardPreviewScrim'
  );
  const previewImage = document.getElementById(
    'nativeDeckBuilderCardPreviewImage'
  );
  const addCustomCardButton = document.getElementById(
    'nativeDeckBuilderAddCustomCard'
  );
  const customCardModal = document.getElementById(
    'nativeDeckBuilderCustomCardModal'
  );
  const customCardQty = document.getElementById('nativeCustomCardQty');
  const customCardName = document.getElementById('nativeCustomCardName');
  const customCardType = document.getElementById('nativeCustomCardType');
  const customCardImageUrl = document.getElementById(
    'nativeCustomCardImageUrl'
  );
  const customCardError = document.getElementById('nativeCustomCardError');
  const customCardCancel = document.getElementById('nativeCustomCardCancel');
  const customCardSubmit = document.getElementById('nativeCustomCardSubmit');
  const customCardPreviewImage = document.getElementById(
    'nativeCustomCardPreviewImage'
  );
  const customCardPreviewPlaceholder = document.getElementById(
    'nativeCustomCardPreviewPlaceholder'
  );

  playButton.addEventListener('click', () => {
    if (systemState.isTwoPlayer) {
      show('p2Box', document.getElementById('p2Button'));
    } else {
      show('p1Box', document.getElementById('p1Button'));
    }
    document.dispatchEvent(new CustomEvent('deck-builder-closing'));
    const panel = document.getElementById('nativeDeckBuilderWorkspace');
    if (panel) panel.classList.remove('open');
 
    
        // apply the ACTIVE DECK's saved sleeve to the playmat via the sim's
        // official card-back API — runs on every Play, so reloads and deck
        // switches always show the right sleeve
        try {
          const activeId = deckLibrary?.getActiveDeckId?.(currentLoadTarget);
          const lib = deckLibrary?.getLibrary?.();
          const deck = activeId && lib?.decks?.[activeId];
          const sleeveId = deck?.sleeveId;
          const sleeve = sleeveId ? getSleeves().find((s) => s.id === sleeveId) : null;
          const fallback = 'https://ptcgsim.online/src/assets/cardback.png';
          const image = sleeve?.image || fallback;
          import('../../../setup/deck-constructor/import.js').then(({ changeCardBack }) => {
            changeCardBack('self', image, false);
          });
        } catch {}
  });

  const syncedDecks = {
        self: createEmptyDeck(),
        opp: createEmptyDeck(),
      };
    
      // Saved deck library ("My Decks"). deckLibrary is null when the workspace
      // markup is missing (e.g. older pages), so all uses are optional-chained.
      const deckLibrary = initializeNativeDeckBuilderLibrary({
        onOpenDeck: (target, deckId, cards) => {
          if (currentLoadTarget !== target) {
            // Save the outgoing deck into its own target's saved deck before
            // switching, so switching never cross-contaminates saved decks.
            deckLibrary?.saveActiveDeck(deck);
            syncedDecks[currentLoadTarget] = deck;
            currentLoadTarget = target;
            deckLibrary?.setTarget(target);
          }
          deck = cards;
          syncedDecks[target] = cards;
          // A non-empty deck should sync into the playmat on close; a freshly
          // created empty deck should not wipe whatever the playmat is holding.
          deckDirty = Object.keys(cards).length > 0;
          render();
          refreshSleeveSelection();
          refreshCoinSelection();
          refreshMatSelection();
        },
        onSaveCurrentDeck: () => {
          deckLibrary?.saveActiveDeck(deck);
        },
      });
    
      // ── Set browser (Mega Evolution / TCGdex) ─────────────────────────────
      const tabSearch = document.getElementById('nativeDeckBuilderTabSearch');
      const tabBrowse = document.getElementById('nativeDeckBuilderTabBrowse');
const tabCustomize = document.getElementById('nativeDeckBuilderTabCustomize');
      const searchPane = document.querySelector('.native-deck-builder-pane-main-header');
      const resultsShell = document.querySelector('.native-deck-builder-results-shell');
      const browserPanel = document.getElementById('nativeDeckBuilderSetBrowserPanel');
    
      // Quantities of each card currently in the deck, keyed by card id —
          // used to badge browse/search results with owned counts.
          const cardQuantities = () => {
            const quantities = {};
            for (const group of Object.values(deck)) {
              for (const variant of group?.cards || []) {
                if (variant?.data?.id) quantities[variant.data.id] = variant.count;
              }
            }
            return quantities;
          };
    
          const setBrowser = initializeNativeDeckBuilderSetBrowser({
        panelEl: browserPanel,
        getQuantities: () => cardQuantities(),
        onAddCard: (card) => {
          deck = addCard(deck, card);
          deckDirty = true;
          render();
          flashDeckStatus();
        },
        // Deferred so this object can be built before showCardPreview is
        // declared below (it is referenced lazily, at call time).
        onPreviewCard: (imageUrl, card) => showCardPreview(imageUrl, card),
      });
    
      const switchMode = (mode) => {
        const isSearch = mode === 'search';
        const isBrowse = mode === 'browse';
        const isCustomize = mode === 'customize';
    
        if (tabSearch) tabSearch.classList.toggle('active', isSearch);
        if (tabBrowse) tabBrowse.classList.toggle('active', isBrowse);
        if (tabCustomize) tabCustomize.classList.toggle('active', isCustomize);
    
        // Search pane + results shell only show in search mode
        if (searchPane) searchPane.style.display = isSearch ? '' : 'none';
        if (resultsShell) resultsShell.style.display = isSearch ? '' : 'none';
    
        // Set browser only in browse mode (lazy-load on first open)
        if (browserPanel) {
          browserPanel.hidden = !isBrowse;
          if (isBrowse) setBrowser?.load();
        }
    
        // The deck summary side pane is irrelevant while customizing sleeves —
        // hide it so the customize tab gets the full workspace width.
        const sidePane = document.querySelector('.native-deck-builder-pane-side');
        if (sidePane) {
          sidePane.style.display = isCustomize ? 'none' : '';
        }
    
        // Sleeve panel only in customize mode. sleevePanel is declared below the
        // picker init block; safe because switchMode only runs on tab clicks.
        if (typeof sleevePanel !== 'undefined' && sleevePanel) {
          sleevePanel.hidden = !isCustomize;
    if (typeof coinPanel !== 'undefined' && coinPanel) {
      coinPanel.hidden = !isCustomize;
    }
    if (typeof matPanel !== 'undefined' && matPanel) {
      matPanel.hidden = !isCustomize;
    }
        const customizeSwitcherEl = document.getElementById('nativeDeckBuilderCustomizeSwitcher');
        if (customizeSwitcherEl) {
          customizeSwitcherEl.hidden = !isCustomize;
          // entering customize resets to the sleeve view; leaving hides both
          if (isCustomize) {
            const sleeveBtn = customizeSwitcherEl.querySelector('[data-view="sleeve"]');
            sleeveBtn?.click();
          }
        }
        }
      };
    
      if (tabSearch) tabSearch.addEventListener('click', () => switchMode('search'));
    
      // ── Card sleeve picker ────────────────────────────────────────────────
      const sleevePanel = document.getElementById('nativeDeckBuilderSleevePanel');
      const coinPanel = document.getElementById('nativeDeckBuilderCoinPanel');
      const matPanel = document.getElementById('nativeDeckBuilderMatPanel');
      const sleevePicker = initializeDeckBuilderSleevePicker({
        panelEl: sleevePanel,
        onChange: (sleeve) => {
          deckLibrary?.setActiveSleeve(currentLoadTarget, sleeve ? sleeve.id : null);
          if (sleeve?.image) {
                // Route through the syncable changeCardBack action: sets the
                // correct self/opp state var, re-points the target container's
                // back images, and (in multiplayer) broadcasts to the opponent.
                changeCardBack(currentLoadTarget, sleeve.image, true);
                document.dispatchEvent(new CustomEvent('deck-sleeve-changed', { detail: { target: currentLoadTarget, image: sleeve.image } }));
              } else {
                document.dispatchEvent(new CustomEvent('deck-sleeve-changed', { detail: { target: currentLoadTarget, image: null } }));
              }
            },
      });
    
          // Coin picker (Customize tab, below sleeves) — selection persists
          // in localStorage.
          const coinPicker = initializeDeckBuilderCoinPicker({
            panelEl: coinPanel,
            onChange: (coin) => {
              deckLibrary?.setActiveCoin(currentLoadTarget, coin ? coin.id : null);
              document.dispatchEvent(new CustomEvent('rules-coin-changed', {
                detail: { target: currentLoadTarget, coin: coin ? { id: coin.id, name: coin.name, thumb: coin.thumb, material: coin.material } : null },
              }));
            },
          });

          // Playmat picker (Customize tab). The pick is persisted with the
          // active deck; the board-side module (setup/sizing/apply-mat-layout.js)
          // owns the ptcg-sim.playmat.v1 localStorage record, so this only
          // reads that key — as the fallback selection when no saved deck is
          // active — and never writes it, keeping a single writer.
          const MAT_STORAGE_KEY = 'ptcg-sim.playmat.v1';
          const getStoredMatId = (target = 'self') => {
            try {
              const raw = localStorage.getItem(MAT_STORAGE_KEY);
              if (!raw) return null;
              const parsed = JSON.parse(raw);
              if (parsed && ('self' in parsed || 'opp' in parsed)) {
                const side = target === 'opp' ? 'opp' : 'self';
                return parsed[side]?.id || null;
              }
              return target === 'self' ? parsed?.id || null : null;
            } catch {
              return null;
            }
          };
          // apply-mat-layout.js listens for this to render the mat and re-fit
          // the board zones; nothing here touches the board.
          const announceMat = (target, mat) => {
            document.dispatchEvent(new CustomEvent('playmat-changed', {
              detail: {
                target,
                mat: mat
                  ? {
                      id: mat.id,
                      title: mat.title,
                      image: mat.image,
                      // The local `image` is absent from a deploy, so the
                      // board needs the scraped original to fall back on.
                      imageUrl: mat.imageUrl,
                      thumb: mat.thumb,
                      layout: mat.layout,
                    }
                  : null,
              },
            }));
          };
          const matPicker = initializeDeckBuilderMatPicker({
            panelEl: matPanel,
            onChange: (mat) => {
              deckLibrary?.setActiveMat?.(currentLoadTarget, mat ? mat.id : null);
              // Full-size mats span the whole board and replace the other side.
              if (mat?.layout === 'two-player') {
                const other = currentLoadTarget === 'opp' ? 'self' : 'opp';
                deckLibrary?.setActiveMat?.(other, null);
              }
              announceMat(currentLoadTarget, mat);
            },
          });

      // Customize switcher: Card Sleeve <-> Coin <-> Mat toggle + shared filter
          // ── playmat sleeve application ─────────────────────────────────
          // Card backs are tracked per-player (systemState.cardBackSrc for
          // self; p1OppCardBackSrc/p2OppCardBackSrc for the opponent) —
          // writing/applying a sleeve must only ever touch the target it
          // was actually picked for, or picking (or even just opening) one
          // player's sleeve/deck silently overwrites the other player's
          // custom sleeve back to the default the next time either of
          // their card backs happens to be redrawn (e.g. on shuffle).
          const setCardBackForTarget = (target, image) => {
            if (target === 'opp') {
              if (systemState.isTwoPlayer) systemState.p2OppCardBackSrc = image;
              else systemState.p1OppCardBackSrc = image;
            } else {
              systemState.cardBackSrc = image;
            }
          };
          const getCardBackForTarget = (target) => (
            target === 'opp'
              ? (systemState.isTwoPlayer ? systemState.p2OppCardBackSrc : systemState.p1OppCardBackSrc)
              : systemState.cardBackSrc
          );
          // On sleeve change: update every currently face-down card on the
          // relevant player's playmat only (they read the card-back state
          // on next flip), and re-point existing back images so the change
          // is immediately visible.
          const applySleeveToPlaymat = (image, target = 'self') => {
            try {
              const fallback = 'https://ptcgsim.online/src/assets/cardback.png';
              // when no sleeve is set for this deck, fall back to whatever
              // this player's own card back already is — never borrow the
              // default and never touch the other player's playmat
              const resolvedTarget = image || getCardBackForTarget(target) || fallback;
              const knownBacks = [systemState.cardBackSrc, systemState.p1OppCardBackSrc, systemState.p2OppCardBackSrc, fallback];
              const containerId = target === 'opp' ? 'oppContainer' : 'selfContainer';
              const doc = document.getElementById(containerId)?.contentWindow?.document;
              if (!doc) return;
              // any img currently showing a card back gets the new sleeve
              doc.querySelectorAll('img').forEach((img) => {
                if (knownBacks.includes(img.src)) img.src = resolvedTarget;
              });
            } catch {}
          };
          document.addEventListener('deck-sleeve-changed', (e) => applySleeveToPlaymat(e.detail?.image, e.detail?.target || 'self'));
    
          // ── per-deck customization restore ─────────────────────────────
          const syncCustomizationToDeck = () => {
            try {
              const activeId = deckLibrary?.getActiveDeckId?.(currentLoadTarget)
                || (deckLibrary?.getActiveDeckName?.(currentLoadTarget) ? null : null);
              // sleeve -> playmat card back via the library's own data
              const sleeveId = deckLibrary?.getActiveSleeve?.(currentLoadTarget);
              const sleeves = typeof getSleeves === 'function' ? getSleeves() : [];
              const sleeve = sleeves.find((s) => s.id === sleeveId) || null;
              const backImage = sleeve?.image || null;
              // only write/apply for the target actually being viewed — an
              // unset sleeve on this deck must never clobber the OTHER
              // player's already-chosen card back
              // emit=false: runs locally on init/switch; do not broadcast on load.
              if (backImage) changeCardBack(currentLoadTarget, backImage, false);
              document.dispatchEvent(new CustomEvent('deck-sleeve-changed', { detail: { target: currentLoadTarget, image: backImage } }));
            } catch {}
          };
      syncCustomizationToDeck();
    
          const customizeSwitcher = document.getElementById('nativeDeckBuilderCustomizeSwitcher');
          const customizeFilter = document.getElementById('nativeDeckBuilderCustomizeFilter');
          if (customizeSwitcher && coinPicker) {
            const sleeveBtn = customizeSwitcher.querySelector('[data-view="sleeve"]');
            const coinBtn = customizeSwitcher.querySelector('[data-view="coin"]');
            const matBtn = customizeSwitcher.querySelector('[data-view="mat"]');
            const placeholders = {
              sleeve: 'Filter sleeves...',
              coin: 'Filter coins...',
              mat: 'Filter mats...',
            };
            const setView = (view) => {
              sleeveBtn.classList.toggle('active', view === 'sleeve');
              coinBtn.classList.toggle('active', view === 'coin');
              matBtn?.classList.toggle('active', view === 'mat');
              sleevePanel.hidden = view !== 'sleeve';
              coinPanel.hidden = view !== 'coin';
              if (matPanel) matPanel.hidden = view !== 'mat';
              customizeFilter.placeholder = placeholders[view] || placeholders.sleeve;
            };
            sleeveBtn.addEventListener('click', () => setView('sleeve'));
            coinBtn.addEventListener('click', () => setView('coin'));
            matBtn?.addEventListener('click', () => setView('mat'));
    
            // the pickers expose controllers? sleeve picker returns one too —
            // drive their internal filters via the shared input
            if (customizeFilter) {
              customizeFilter.addEventListener('input', () => {
                const term = customizeFilter.value;
                // sleeve picker: its own filter input (hidden but functional)
                const sleeveInput = sleevePanel.querySelector('.native-deck-builder-sleeve-filter');
                if (sleeveInput) {
                  sleeveInput.value = term;
                  sleeveInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                // coin picker: same via its (hidden) filter input
                const coinInput = coinPanel.querySelector('.native-deck-builder-coin-filter');
                if (coinInput) {
                  coinInput.value = term;
                  coinInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                // mat picker: exposes its filter directly on the controller
                matPicker?.filter(term);
              });
            }
            setView('sleeve'); // default view
          }

    
      // Reflect the active deck's sleeve when decks switch
      const refreshSleeveSelection = () => {
        const sleeveId = deckLibrary?.getActiveSleeve(currentLoadTarget) || null;
        sleevePicker?.setSelected(sleeveId);
      };

      // Reflect the active deck's coin when decks switch, and let the
      // rules engine know (for the match-start turn-order coin flip) even
      // if the player never opens the coin picker this session.
      const refreshCoinSelection = () => {
        const coinId = deckLibrary?.getActiveCoin?.(currentLoadTarget) || null;
        const coin = coinId ? getCoinById(coinId) : null;
        coinPicker?.setSelected(coinId);
        document.dispatchEvent(new CustomEvent('rules-coin-changed', {
          detail: {
            target: currentLoadTarget,
            coin: coin ? { id: coin.id, name: coin.name, thumb: coin.thumb, material: coin.material } : null,
          },
        }));
      };

      // Reflect the active deck's mat when decks switch, and re-announce it
      // so the board picks the mat up even if the player never opens the mat
      // picker this session.
      const refreshMatSelection = () => {
        const matId = deckLibrary?.getActiveMat?.(currentLoadTarget)
          || getStoredMatId(currentLoadTarget);
        const mat = matId ? getMatById(matId) : null;
        matPicker?.setSelected(mat ? mat.id : null);
        announceMat(currentLoadTarget, mat || null);
      };
      const announceAllMats = () => {
        const mats = {};
        for (const target of ['self', 'opp']) {
          const matId =
            deckLibrary?.getActiveMat?.(target) || getStoredMatId(target);
          mats[target] = matId ? getMatById(matId) : null;
        }
        // A saved full-size mat wins over any per-side one-player choice.
        if (mats.self?.layout === 'two-player') {
          deckLibrary?.setActiveMat?.('opp', null);
          announceMat('self', mats.self);
          return;
        }
        if (mats.opp?.layout === 'two-player') {
          deckLibrary?.setActiveMat?.('self', null);
          announceMat('opp', mats.opp);
          return;
        }
        for (const target of ['self', 'opp']) {
          announceMat(target, mats[target] || null);
        }
      };
      if (tabBrowse) tabBrowse.addEventListener('click', () => switchMode('browse'));
  if (tabCustomize) tabCustomize.addEventListener('click', () => switchMode('customize'));

  let deck = createEmptyDeck();
  let currentResults = [];
  let currentRawResults = [];
  let currentLoadTarget = 'self';
  let currentTotalSummaries = 0;
  let currentHugeResultSet = false;
  let deckDirty = false;
  let flashFrame = null;

  const flashDeckStatus = () => {
    if (!deckStatus) return;
    if (flashFrame) cancelAnimationFrame(flashFrame);
    deckStatus.classList.remove('flash');
    flashFrame = requestAnimationFrame(() => {
      deckStatus.classList.add('flash');
      flashFrame = requestAnimationFrame(() => {
        deckStatus.classList.remove('flash');
        flashFrame = null;
      });
    });
  };

  const renderResults = () => {
    renderSearchResults({
      searchResultsEl: searchResults,
      results: currentResults,
      quantities: cardQuantities(),
      onSelect: (card) => {
        deck = addCard(deck, card);
        deckDirty = true;
        render();
        flashDeckStatus();
      },
    });
  };

  const updateVisibleResults = () => {
    currentResults = applyLocalControls(currentRawResults, {
      cardType: cardTypeFilter.value,
      sortBy: sortBySelect.value,
      sortDirection: sortDirectionSelect.value,
    });
  };

  const getSearchStatusText = () => {
    if (currentHugeResultSet) {
      return `Too many results (${currentTotalSummaries}). Please redefine your search terms.`;
    }
    return currentResults.length > 0
      ? `Showing all ${currentResults.length} result(s). Click a card to add it.`
      : 'No matching cards found.';
  };

  const switchTarget = (target) => {
        if (target === currentLoadTarget) return;
        // Save the outgoing deck into its own target's saved deck, then switch.
        deckLibrary?.saveActiveDeck(deck);
        syncedDecks[currentLoadTarget] = deck;
        currentLoadTarget = target;
        deck = syncedDecks[target];
        deckLibrary?.setTarget(target);
        render();
        refreshMatSelection();
      };

let activeHoloStop = null;
      // cache the preview holder while the image is still in the DOM — after
      // replaceChildren the image's parentElement becomes null
      const previewHolder = previewImage?.parentElement || null;
        
          // Rarity isn't in set-listing summaries; fetch per card id and cache.
      const rarityCache = new Map();
      const fetchRarity = async (cardId) => {
        if (rarityCache.has(cardId)) return rarityCache.get(cardId);
        try {
          const response = await fetch(`https://api.tcgdex.net/v2/en/cards/${cardId}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const detail = await response.json();
          const rarity = detail?.rarity || '';
          rarityCache.set(cardId, rarity);
          return rarity;
        } catch {
          rarityCache.set(cardId, '');
          return '';
        }
      };
    
      const showCardPreview = async (imageUrl, card = null) => {
        if (!previewScrim || !previewImage || !imageUrl) return;
        if (activeHoloStop) {
          activeHoloStop();
          activeHoloStop = null;
        }
        previewScrim.removeAttribute('hidden');
    
        let effect = null;
        if (card?.id) {
          const rarity = card.rarity || (await fetchRarity(card.id));
          effect = resolveHoloEffect({ rarity });
        }
    
        const holder = previewHolder;
        if (effect) {
          const cardEl = buildHoloCard(imageUrl, effect);
          holder.replaceChildren(cardEl);
          activeHoloStop = startHoloAnimation(cardEl);
        } else {
          previewImage.src = imageUrl;
          holder.replaceChildren(previewImage);
        }
      };
    
      const hideCardPreview = () => {
        if (activeHoloStop) {
          activeHoloStop();
          activeHoloStop = null;
        }
        if (!previewScrim) return;
        previewScrim.setAttribute('hidden', '');
        const holder = previewHolder;
        if (holder && !holder.contains(previewImage)) {
          holder.replaceChildren(previewImage);
        }
        previewImage.removeAttribute('src');
      };

  if (previewScrim) {
    previewScrim.addEventListener('click', hideCardPreview);
  }

  // Right-click on search results opens preview
  if (searchResults) {
    searchResults.addEventListener('contextmenu', (event) => {
        const target = event.target.closest('[data-preview-image]');
        if (!target) return;
        event.preventDefault();
        const index = target.dataset.resultIndex;
        const card = index !== undefined ? currentResults[Number(index)] : null;
        showCardPreview(target.dataset.previewImage, card);
      });
  }

  // Click on deck cards opens preview
  if (cards) {
    cards.addEventListener('click', (event) => {
          const target = event.target.closest('[data-preview-image]');
          if (!target) return;
          // Don't open preview if clicking the add/remove buttons
          if (event.target.closest('.native-deck-builder-deck-btn')) return;
          if (event.target.closest('.native-deck-builder-deck-row-controls')) return;
          // find the deck card variant carrying this image for rarity-aware holo
          const row = target.closest('[data-deck-row-index]');
          const index = row ? Number(row.dataset.deckRowIndex) : -1;
          const sortedCards = getSortedDeckCardArray(deck);
          const card = index >= 0 ? sortedCards[index] : null;
          showCardPreview(target.dataset.previewImage, card);
        });
  }

  document.addEventListener('native-deck-builder:deck-loaded', (event) => {
    const user = event.detail?.user;
    const deckData = event.detail?.deckData;
    if (!user || !Array.isArray(deckData)) return;

    syncedDecks[user] = syncDeckFromLoadedRows(deckData);

    if (currentLoadTarget === user) {
      deck = syncedDecks[user];

      render();
    }
  });

  let customCardImageLoaded = false;

  const showPreviewImage = () => {
    customCardPreviewImage.style.display = '';
    customCardPreviewPlaceholder.style.display = 'none';
  };

  const showPreviewPlaceholder = (text = 'No image') => {
    customCardPreviewImage.style.display = 'none';
    customCardPreviewPlaceholder.style.display = '';
    customCardPreviewPlaceholder.textContent = text;
  };

  const updateCustomCardPreview = (url) => {
    const trimmed = url.trim();
    customCardImageLoaded = false;

    if (!trimmed) {
      showPreviewPlaceholder('No image');
      return;
    }

    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      showPreviewPlaceholder('Invalid URL');
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      showPreviewPlaceholder('http/https only');
      return;
    }

    showPreviewPlaceholder('Loading…');
    customCardPreviewImage.src = trimmed;
  };

  customCardImageUrl.addEventListener('input', () => {
    updateCustomCardPreview(customCardImageUrl.value);
  });

  customCardPreviewImage.addEventListener('error', () => {
    customCardImageLoaded = false;
    showPreviewPlaceholder('Image not found');
  });

  customCardPreviewImage.addEventListener('load', () => {
    customCardImageLoaded = true;
    showPreviewImage();
  });

  const openCustomCardModal = () => {
    customCardQty.value = '1';
    customCardName.value = '';
    customCardType.value = 'Pokémon';
    customCardImageUrl.value = '';
    customCardError.textContent = '';
    customCardImageLoaded = false;
    customCardPreviewImage.removeAttribute('src');
    showPreviewPlaceholder('No image');
    customCardModal.removeAttribute('hidden');
    customCardName.focus();
  };

  const closeCustomCardModal = () => {
    customCardModal.setAttribute('hidden', '');
  };

  addCustomCardButton.addEventListener('click', openCustomCardModal);
  customCardCancel.addEventListener('click', closeCustomCardModal);

  customCardModal.addEventListener('click', (event) => {
    if (event.target === customCardModal) closeCustomCardModal();
  });

  customCardSubmit.addEventListener('click', () => {
    const qty = parseInt(customCardQty.value, 10);
    const name = customCardName.value.trim();
    const type = customCardType.value;
    const imageUrl = customCardImageUrl.value.trim();

    if (!name) {
      customCardError.textContent = 'Card Name is required.';
      return;
    }
    if (!qty || qty < 1) {
      customCardError.textContent = 'Quantity must be at least 1.';
      return;
    }
    if (!imageUrl) {
      customCardError.textContent = 'Image URL is required.';
      return;
    }
    if (!customCardImageLoaded) {
      customCardError.textContent = 'Image URL must point to a loadable image.';
      return;
    }

    const card = {
      id: `custom:${name}:${type}:${imageUrl}`,
      name,
      supertype: type,
      images: { small: imageUrl, large: imageUrl },
      image: imageUrl,
      set: { id: '', name: '', releaseDate: '' },
      number: '',
      _provider: 'custom',
    };

    for (let i = 0; i < qty; i++) {
      deck = addCard(deck, card);
    }

    deckDirty = true;
    closeCustomCardModal();
    render();
    flashDeckStatus();
  });

  const render = () => {
        // Autosave the editor into the active saved deck (if any). Safe at boot:
        // the active deck binding is session state and starts null.
        deckLibrary?.saveActiveDeck(deck);
        const counts = getDeckCounts(deck);
    const result = validateDeck(deck, detectDeckFormat(deck));
    const sortedCards = getSortedDeckCardArray(deck);
    const hasDeckCards = Object.keys(deck).length > 0;

    clearButton.style.display = hasDeckCards ? '' : 'none';
    playButton.disabled = !hasDeckCards;
    targetAltButton.style.cursor = systemState.isTwoPlayer ? 'default' : 'pointer';
    targetAltButton.style.opacity = systemState.isTwoPlayer ? '0.5' : '';

    // TCG Live-style deck name strip: show the active saved deck's name
        const deckNameEl = document.getElementById('nativeDeckBuilderDeckName');
        if (deckNameEl) {
          deckNameEl.textContent = deckLibrary?.getActiveDeckName
            ? (deckLibrary.getActiveDeckName(currentLoadTarget) || 'Untitled Deck')
            : 'Untitled Deck';
        }
    
        if (deckStatus) {
      deckStatus.textContent = hasDeckCards ? 'Saved ✓' : '';
    }

    targetMainButton.classList.toggle(
      'native-target-selected',
      currentLoadTarget === 'self'
    );
    targetAltButton.classList.toggle(
      'native-target-selected',
      currentLoadTarget === 'opp'
    );

    const isSelf = currentLoadTarget === 'self';
    for (const el of [exportCsvButton, importCsvLabel, clearButton]) {
      if (!el) continue;
      el.classList.toggle('self-color', isSelf);
      el.classList.toggle('opp-color', !isSelf);
    }

    renderDeckSummary({ summaryEl: summary, counts });

    if (validationDot) {
      const formatLabel = result.formatName;
      const validationTitle = result.isValid
        ? `${formatLabel} · Valid (${result.totalCards} cards)`
        : `${formatLabel} · ${result.errors.join('\n')}`;

      validationDot.classList.toggle('valid', result.isValid);
      validationDot.classList.toggle('invalid', !result.isValid);
      validationDot.setAttribute('aria-label', validationTitle);
      validationDot.title = validationTitle;
    }

    renderDeckCards({
      cardsEl: cards,
      sortedCards,
      onAdd: (card) => {
        deck = addCard(deck, card);
        deckDirty = true;
        render();
        flashDeckStatus();
      },
      onRemove: (card) => {
        deck = removeCard(deck, card);
        deckDirty = true;
        render();
        flashDeckStatus();
      },
    });

    renderResults();
  };

  const loadCurrentDeck = () => {
    if (!deckDirty) return;
    deckDirty = false;
    syncedDecks[currentLoadTarget] = deck;
    const deckRows = deckToSimRows(deck);
    if (deckRows.length > 0) {
      loadDeckData(currentLoadTarget, deckRows);
    }
    render();
  };

  const runSearch = async (options = {}) => {
    const term = (options.term ?? searchInput.value).trim();

    if (!term) {
      currentResults = [];
      currentRawResults = [];
      currentTotalSummaries = 0;
      searchStatus.textContent = '';
      render();
      return;
    }

    searchButton.disabled = true;
    searchStatus.textContent = `Searching for “${term}”...`;

    try {
      const searchResponse = await queryCardsByName(term);
      currentRawResults = searchResponse.results;
      currentTotalSummaries = searchResponse.totalSummaries;
      currentHugeResultSet = searchResponse.isHugeResultSet;
      updateVisibleResults();

      searchStatus.textContent = getSearchStatusText();
    } catch (error) {
      currentResults = [];
      currentRawResults = [];
      currentTotalSummaries = 0;
      currentHugeResultSet = false;
      searchStatus.textContent = `Search failed: ${error.message}`;
    } finally {
      searchButton.disabled = false;
      render();
    }
  };

  targetMainButton.addEventListener('click', () => {
    switchTarget('self');
    document.dispatchEvent(
      new CustomEvent('deck-target-changed', { detail: { target: 'self' } })
    );
  });

  targetAltButton.addEventListener('click', () => {
    if (systemState.isTwoPlayer) return;
    switchTarget('opp');
    document.dispatchEvent(
      new CustomEvent('deck-target-changed', { detail: { target: 'opp' } })
    );
  });

  document.addEventListener('deck-target-changed', (event) => {
    const target = event.detail?.target;
    if (target) switchTarget(target);
  });

  exportCsvButton.addEventListener('click', () => {
    const csv = serializeDeckToSimCsv(deck);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ptcg-sim-deck.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  });

  importCsvInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const csvText = await file.text();
      deck = parseSimCsv(csvText);
      syncedDecks[currentLoadTarget] = deck;
      deckDirty = true;
      render();
    } catch (error) {
      searchStatus.textContent = `CSV import failed: ${error.message}`;
    } finally {
      importCsvInput.value = '';
    }
  });

  clearButton.addEventListener('click', () => {
        if (!window.confirm('Are you sure you want to delete your deck?')) return;
        // Detach from the saved deck so clearing the editor never silently
        // wipes a saved deck from the library.
        deckLibrary?.setActiveDeck(currentLoadTarget, null);
        deck = createEmptyDeck();
        syncedDecks[currentLoadTarget] = deck;
        deckDirty = true;
        render();
      });

  const rerenderSearchLocally = () => {
    if (currentRawResults.length === 0) return;
    updateVisibleResults();
    searchStatus.textContent = getSearchStatusText();
    renderResults();
  };

  cardTypeFilter.addEventListener('change', rerenderSearchLocally);
  sortBySelect.addEventListener('change', rerenderSearchLocally);
  sortDirectionSelect.addEventListener('change', rerenderSearchLocally);

  searchButton.addEventListener('click', () => {
    runSearch();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  });

  document.addEventListener('deck-builder-closing', loadCurrentDeck);

  const deckImportButton = document.getElementById('deckImportButton');
  if (deckImportButton) deckImportButton.addEventListener('click', () => {
    if (systemState.isTwoPlayer && currentLoadTarget === 'opp') {
      switchTarget('self');
      document.dispatchEvent(new CustomEvent('deck-target-changed', { detail: { target: 'self' } }));
    }
    render();
  });

  render();
  // Restore each player's saved mat so both halves of the board pick up their
  // own layout on load, even if the player never opens the mat picker.
  announceAllMats();
};
