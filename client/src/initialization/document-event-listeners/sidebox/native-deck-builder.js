import {
  formatImageUrl,
  parseCsvMeta,
  parseSimCsv,
  serializeDeckToSimCsv,
} from '../../../setup/deck-builder/core/csv-adapter.mjs';
import { getSortedDeckCardArray } from '../../../setup/deck-builder/core/card-sort.mjs';
import { buildDeckExportDocument } from '../../../setup/deck-builder/core/deck-export.mjs';
import { getDeckCounterModel } from '../../../setup/deck-builder/core/deck-counter.mjs';
import {
  BUILDER_FILTER_GROUPS,
  applyCardFilters,
  buildTcgdexFilterParams,
  countActiveFilters,
  createEmptyFilters,
  deriveSetOptions,
  describeActiveFilters,
  hasActiveFilters,
  removeFilterChip,
  setHpRange,
  toggleFilter,
} from '../../../setup/deck-builder/core/card-filters.mjs';
import {
  detectDeckFormat,
  validateDeck,
} from '../../../setup/deck-builder/core/deck-validation.mjs';
import {
  deckLoadFormat,
  withPoolErrors,
} from '../../../setup/deck-builder/core/build-battle/build-battle-view.mjs';
import { DECK_FORMAT_BUILD_BATTLE } from '../../../../../shared/engine/formats.mjs';
import { initializeBuildBattle } from './native-deck-builder-build-battle.js';
import { systemState } from '../../../state.js';
import { printedRarity } from '../../../../../shared/engine/rules/card-classify.mjs';
import { cachedFetchJson } from '../../../../../shared/tcgdex/tcgdex-cache.mjs';
import { tcgdexApiUrl } from '../../../../../shared/tcgdex/tcgdex-url.mjs';
import { fetchCardDetail } from '../../../../../shared/engine/rules/rules-state.mjs';
import { warmDeckCardCache } from '../../../setup/deck-builder/core/deck-card-warm.mjs';
import {
  changeCardBack,
  loadDeckData,
} from '../../../setup/deck-constructor/import.js';
import { show } from '../../../setup/home-header/header-toggle.js';
import {
  renderDeckCards,
  renderDeckCounter,
  renderDeckSprites,
  renderDeckSummary,
  renderFilterChips,
  renderFilterDrawer,
  renderSearchResults,
} from './native-deck-builder-renderers.js';
import {
  announceHostState,
  connectToHost,
  installDeckBuilderHost,
} from './deck-builder-window.js';
import { initializeNativeDeckBuilderSpritePicker } from './native-deck-builder-sprite-picker.js';
import {
  MAX_DECK_SPRITES,
  deckSpriteImageUrl,
  deckSpriteLabel,
  normalizeDeckSprites,
} from '../../../setup/deck-builder/core/deck-sprites.mjs';
import { resolveDisplaySprites } from '../../../setup/deck-builder/core/card-sprites.mjs';
import {
  cycleWallpaper,
  findWallpaper,
} from '../../../setup/deck-builder/core/box-wallpapers.mjs';
import { syncDeckFromLoadedRows } from './native-deck-builder-sync.js';
import {
  importDeckEntries,
  parseDeckText,
} from '../../../setup/deck-builder/core/deck-text-import.mjs';
import {
  addCard,
  createEmptyDeck,
  filterDeck,
  getDeckCounts,
  removeCard,
} from '../../../setup/deck-builder/core/deck-state.mjs';
import {
  applyLocalControls,
  fetchCardDetail as fetchNormalizedCardDetail,
  queryCards,
} from '../../../setup/deck-builder/core/card-search.mjs';
import {
  applyBuilderTheme,
  builderThemeToggleLabel,
  loadBuilderTheme,
  toggleBuilderTheme,
} from '../../../setup/deck-builder/core/builder-theme.mjs';
import { initializeNativeDeckBuilderLibrary } from './native-deck-builder-library.js';
import { initializeNativeDeckBuilderSetBrowser } from './native-deck-builder-set-browser.js';
import { initializeDeckBuilderSleevePicker } from './native-deck-builder-sleeve-picker.js';
import { initializeDeckBuilderCoinPicker } from './native-deck-builder-coin-picker.js';
import { initializeDeckBuilderMatPicker } from './native-deck-builder-mat-picker.js';
import { getCoinById } from '../../../setup/deck-builder/core/coins.mjs';
import { getMatById } from '../../../setup/deck-builder/core/mats.mjs';
import { getDeckFromLibrary, hasUnsavedDraft } from '../../../setup/deck-builder/core/deck-library.mjs';
import {
  loadLastSession,
  restorableDeckId,
  saveLastSession,
} from '../../../setup/deck-builder/core/last-session.mjs';
import { changePlaymat } from '../../../setup/sizing/apply-mat-layout.js';
import { getSleeves } from '../../../setup/deck-builder/core/sleeves.mjs';
import { updateReadyButtons } from '../../../actions/general/ready.js';
import {
  LEGACY_DEFAULT_CARD_BACK_SRC,
  resolveDefaultCardBackSrc,
} from '../../../setup/deck-constructor/default-card-back.mjs';
    
    import {
  closeCardPreview,
  openFloatingCardPreview,
} from '../../../setup/image-logic/full-view.js';
import { toHighResCardImageUrl } from '../../../setup/image-logic/card-image-url.mjs';

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
        // Collector number (TCGdex localId). Decks built here know exactly
        // which printing was picked; carrying the number keeps the rules
        // engine from re-guessing it by name later — see resolveCardId() in
        // shared/engine/rules/rules-state.mjs.
        variant?.data?.number || variant?.data?.localId || null,
        variant?.data?.set?.id || null,
        variant?.data?.id || null,
      ]);
    }
  }

  return rows;
};

let restoreLastUsedDeckImpl = null;

/** Restore the last played deck (and its customization) onto the self playmat. */
export const restoreLastUsedDeckToPlaymat = () => Boolean(restoreLastUsedDeckImpl?.());

const coinPayload = (coin) =>
  coin ? { id: coin.id, name: coin.name, thumb: coin.thumb, material: coin.material } : null;

// apply-mat-layout.js listens for this to render the mat and re-fit the
// board zones; nothing here touches the board.
const matPayload = (mat) =>
  mat
    ? {
        id: mat.id,
        title: mat.title,
        image: mat.image,
        imageUrl: mat.imageUrl,
        thumb: mat.thumb,
        board: mat.board,
        layout: mat.layout,
      }
    : null;

// Shows the game's own sidebox again after Play.
const showGameSidebox = () => {
  if (systemState.isTwoPlayer) {
    show('p2Box', document.getElementById('p2Button'));
  } else {
    show('p1Box', document.getElementById('p1Button'));
  }
};

/**
 * Where the builder's game side effects land (design 050). On the game tab
 * (host) they touch this page's board directly; in the builder's own tab
 * (editor) they travel to the game tab as messages.
 */
const createLocalGameLink = () => ({
  loadDeck: (target, rows, _deckId, format) => loadDeckData(target, rows, format),
  changeCardBack: (target, image, emit) => changeCardBack(target, image, emit),
  announceSleeve: (target, image) =>
    document.dispatchEvent(new CustomEvent('deck-sleeve-changed', { detail: { target, image } })),
  announceMat: (target, mat, emit = false) => {
    if (emit) {
      changePlaymat(target, mat?.id ?? null, true);
      return;
    }
    document.dispatchEvent(
      new CustomEvent('playmat-changed', { detail: { target, mat: matPayload(mat) } })
    );
  },
  announceCoin: (target, coin) =>
    document.dispatchEvent(
      new CustomEvent('rules-coin-changed', { detail: { target, coin: coinPayload(coin) } })
    ),
  play: () => showGameSidebox(),
  isTwoPlayer: () => systemState.isTwoPlayer,
  isConnected: () => true,
});

const createRemoteGameLink = ({ onHostState }) => {
  let hostState = { isTwoPlayer: false };
  const host = connectToHost({
    onHostState: (state) => {
      hostState = state;
      onHostState(state);
    },
  });
  return {
    loadDeck: (target, rows, deckId, format) =>
      host.post('load-deck', { target, deckId: deckId || null, rows, format }),
    changeCardBack: (target, image, emit) =>
      host.post('card-back', { target, image, emit: Boolean(emit) }),
    announceSleeve: (target, image) => host.post('sleeve', { target, image: image || null }),
    announceMat: (target, mat, emit = false) =>
      host.post('mat', { target, matId: mat?.id ?? null, emit: Boolean(emit) }),
    announceCoin: (target, coin) => host.post('coin', { target, coinId: coin?.id ?? null }),
    play: (target) => {
      host.post('play', { target });
      window.close();
    },
    isTwoPlayer: () => hostState.isTwoPlayer,
    isConnected: () => host.isConnected(),
  };
};

/**
 * @param {object} [options]
 * @param {'host'|'editor'} [options.role] - 'editor' in the deck builder's own
 *   tab, 'host' on the game tab (see builder-window.mjs resolveBuilderRole).
 * @param {'standard'|'build-battle'} [options.mode] - 'build-battle' on the
 *   Build & Battle tab (design 051): Box and Pool replace Search and Browse.
 */
export const initializeNativeDeckBuilder = ({ role = 'host', mode = 'standard' } = {}) => {
  const isEditor = role === 'editor';
  const isBuildBattle = isEditor && mode === 'build-battle';
  const targetMainButton = document.getElementById(
    'nativeDeckBuilderTargetMain'
  );
  const targetAltButton = document.getElementById('nativeDeckBuilderTargetAlt');

  const playButton = document.getElementById('nativeDeckBuilderPlayButton');
  const exportCsvButton = document.getElementById('nativeDeckBuilderExportCsv');
  const importCsvLabel = document.getElementById('nativeDeckBuilderImportCsvLabel');
  const importCsvInput = document.getElementById('nativeDeckBuilderCsvImport');
  const clearButton = document.getElementById('nativeDeckBuilderClear');
  const saveButton = document.getElementById('nativeDeckBuilderSaveDeck');
  const deckSpritesEl = document.getElementById('nativeDeckBuilderDeckSprites');
  const spritePickerEl = document.getElementById('nativeDeckBuilderSpritePicker');
  const wallpaperSwitchEl = document.getElementById('nativeDeckBuilderWallpaperSwitch');
  const deckPaneEl = wallpaperSwitchEl?.closest('.native-deck-builder-pane-side') || null;

  // The pickers commit straight to the loaded deck, but with nothing loaded
  // there is no deck to commit to and the choice would be lost. Mirror the
  // live selection here so Save can carry it into a newly created deck.
  // `sprites` rides along with the same mirror: with no deck loaded the
  // picker has nothing to commit to, and the choice would be lost on Save.
  const chosenCosmetics = { self: {}, opp: {} };
  const rememberCosmetic = (target, key, value) => {
    const side = target === 'opp' ? 'opp' : 'self';
    chosenCosmetics[side][key] = value;
  };
  const deckStatus = document.getElementById('nativeDeckBuilderDeckStatus');
  const summary = document.getElementById('nativeDeckBuilderSummaryPanel');
  const validationDot = document.getElementById(
    'nativeDeckBuilderValidationDot'
  );
  const deckCounter = document.getElementById('nativeDeckBuilderCounter');
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
  const importListButton = document.getElementById('nativeDeckBuilderImportList');
  const importListModal = document.getElementById('nativeDeckBuilderImportListModal');
  const importListText = document.getElementById('nativeImportListText');
  const importListStatus = document.getElementById('nativeImportListStatus');
  const importListProblems = document.getElementById('nativeImportListProblems');
  const importListSubmit = document.getElementById('nativeImportListSubmit');
  const importListCancel = document.getElementById('nativeImportListCancel');
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

  // Live-style theme switch. The builder owns its own theme (dark by default)
  // rather than riding the legacy per-element `dark-mode-1` body class, which
  // only covers the game surface.
  const workspaceEl = document.getElementById('nativeDeckBuilderWorkspace');
  const themeToggle = document.getElementById('nativeDeckBuilderThemeToggle');
  let builderTheme = applyBuilderTheme(
    workspaceEl,
    loadBuilderTheme(window.localStorage),
    window.localStorage
  );

  const renderThemeToggle = () => {
    if (!themeToggle) return;
    const { glyph, title } = builderThemeToggleLabel(builderTheme);
    themeToggle.textContent = glyph;
    themeToggle.title = title;
    themeToggle.setAttribute('aria-label', title);
  };
  renderThemeToggle();

  themeToggle?.addEventListener('click', () => {
    builderTheme = applyBuilderTheme(
      workspaceEl,
      toggleBuilderTheme(builderTheme),
      window.localStorage
    );
    renderThemeToggle();
  });

  const linkBanner = document.getElementById('nativeDeckBuilderLinkBanner');
  // The host answers asynchronously, after this function has finished.
  const gameLink = isEditor
    ? createRemoteGameLink({
        onHostState: (state) => {
          // P2 is Solo-only: a game that is now multiplayer takes P2 away.
          if (state.isTwoPlayer && currentLoadTarget === 'opp') switchTarget('self');
          buildBattle?.setRoom(state.roomId ?? null);
          render();
        },
      })
    : createLocalGameLink();
  if (linkBanner) linkBanner.hidden = !isEditor || gameLink.isConnected();

  playButton.addEventListener('click', () => {
    const target = currentLoadTarget;
    // Play always loads what is on screen, even if nothing changed since the
    // last load, then shows the active deck's sleeve on the playmat.
    deckDirty = true;
    loadCurrentDeck();
    const sleeveId = deckLibrary?.getActiveSleeve?.(target);
    const sleeve = sleeveId ? getSleeves().find((entry) => entry.id === sleeveId) : null;
    gameLink.changeCardBack(target, sleeve?.image || resolveDefaultCardBackSrc(), false);
    gameLink.play(target);
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
          // Detaching from a deck (it was deleted, or the editor was cleared)
          // must also drop the mirrored sprite choice, or the strip would keep
          // showing the previous deck's Pokémon over an empty editor.
          if (!deckId) {
            rememberCosmetic(target, 'sprites', []);
            rememberCosmetic(target, 'wallpaperId', null);
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
        // Only the builder tab edits decks; the game tab's copy is read-only.
        allowDeckWrites: isEditor,
        // Another builder tab edited a deck this one has open: show its cards
        // (the target's editor copy included) so autosave never reverts them.
        onExternalDeckChange: (target, _deckId, cards) => {
          syncedDecks[target] = cards;
          if (target !== currentLoadTarget) return;
          deck = cards;
          render();
        },
      });

      // ── Deck Pokémon sprites (design 024) ────────────────────────────────
      // The loaded deck owns the slots; with nothing loaded the mirror holds
      // them until Save creates a deck to write them to.
      const currentDeckSprites = () => {
        const loaded = deckLibrary?.getActiveDeckId?.(currentLoadTarget);
        if (loaded) return normalizeDeckSprites(deckLibrary?.getActiveSprites?.(currentLoadTarget));
        return normalizeDeckSprites(
          chosenCosmetics[currentLoadTarget === 'opp' ? 'opp' : 'self'].sprites
        );
      };

      const spritePicker = initializeNativeDeckBuilderSpritePicker({
        pickerEl: spritePickerEl,
        getSprites: () => currentDeckSprites(),
        onChange: (sprites) => {
          rememberCosmetic(currentLoadTarget, 'sprites', sprites);
          deckLibrary?.setActiveSprites?.(currentLoadTarget, sprites);
          render();
        },
      });

      // ── PC Box wallpaper (design 025) ────────────────────────────────────
      // Per deck like the other cosmetics; the mirror covers "no deck loaded".
      const currentWallpaper = () =>
        findWallpaper(
          deckLibrary?.getActiveWallpaper?.(currentLoadTarget) ??
            chosenCosmetics[currentLoadTarget === 'opp' ? 'opp' : 'self'].wallpaperId
        );

      const applyWallpaper = () => {
        const wallpaper = currentWallpaper();
        if (deckPaneEl) {
          deckPaneEl.style.setProperty('--db-wallpaper-banner', `url('${wallpaper.banner}')`);
          deckPaneEl.style.setProperty('--db-wallpaper-body', `url('${wallpaper.body}')`);
          deckPaneEl.dataset.wallpaper = wallpaper.id;
        }
        const nameEl = wallpaperSwitchEl?.querySelector('[data-wallpaper-name]');
        if (nameEl) nameEl.textContent = wallpaper.name;
      };

      wallpaperSwitchEl?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-wallpaper-step]');
        if (!button) return;
        const next = cycleWallpaper(currentWallpaper().id, Number(button.dataset.wallpaperStep));
        rememberCosmetic(currentLoadTarget, 'wallpaperId', next.id);
        deckLibrary?.setActiveWallpaper?.(currentLoadTarget, next.id);
        applyWallpaper();
      });

      deckSpritesEl?.addEventListener('click', (event) => {
        if (!event.target.closest('[data-sprite-picker-open]')) return;
        // Without this the document-level dismiss handler would see the very
        // click that opened the popover and close it again.
        event.stopPropagation();
        spritePicker?.toggle();
      });

      const persistLastUsedSession = () => {
        const deckId = deckLibrary?.getActiveDeckId?.('self');
        if (deckId) saveLastSession(window.localStorage, { deckId, target: 'self' });
      };
    
      // ── Set browser (Mega Evolution / TCGdex) ─────────────────────────────
      const tabSearch = document.getElementById('nativeDeckBuilderTabSearch');
      const tabBrowse = document.getElementById('nativeDeckBuilderTabBrowse');
const tabCustomize = document.getElementById('nativeDeckBuilderTabCustomize');
      const tabBox = document.getElementById('buildBattleTabBox');
      const tabPool = document.getElementById('buildBattleTabPool');
      const boxPanel = document.getElementById('buildBattleBoxPanel');
      const poolPanel = document.getElementById('buildBattlePoolPanel');
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
        onPreviewCard: (imageUrl, card, sourceEl) =>
          showCardPreview(imageUrl, card, sourceEl),
      });
    
      const switchMode = (mode) => {
        const isSearch = mode === 'search';
        const isBrowse = mode === 'browse';
        const isCustomize = mode === 'customize';
        activeMode = mode;
        tabBox?.classList.toggle('active', mode === 'box');
        tabPool?.classList.toggle('active', mode === 'pool');
        if (boxPanel) boxPanel.hidden = mode !== 'box';
        if (poolPanel) poolPanel.hidden = mode !== 'pool';
        closeFilterDrawer();
        // Filters applied from Browse Sets re-run the search when it is next shown.
        if (isSearch && searchIsStale) {
          searchIsStale = false;
          runSearch();
        }

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
    
        // Customize sub-panels: only one visible at a time (setView handles
        // sleeve/coin/mat toggling). While not in customize, hide all three.
        if (typeof sleevePanel !== 'undefined' && sleevePanel) {
          if (!isCustomize) {
            sleevePanel.hidden = true;
            if (coinPanel) coinPanel.hidden = true;
            if (matPanel) matPanel.hidden = true;
          }
          const customizeSwitcherEl = document.getElementById('nativeDeckBuilderCustomizeSwitcher');
          if (customizeSwitcherEl) {
            customizeSwitcherEl.hidden = !isCustomize;
            // entering customize resets to the sleeve view
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
              rememberCosmetic(currentLoadTarget, 'sleeveId', sleeve ? sleeve.id : null);
          // Route through the syncable changeCardBack action: sets the
          // correct self/opp state var, re-points the target container's
          // back images, and (in multiplayer) broadcasts to the opponent.
          if (sleeve?.image) gameLink.changeCardBack(currentLoadTarget, sleeve.image, true);
          gameLink.announceSleeve(currentLoadTarget, sleeve?.image || null);
        },
      });

          // Coin picker (Customize tab, below sleeves) — selection persists
          // in localStorage.
          const coinPicker = initializeDeckBuilderCoinPicker({
            panelEl: coinPanel,
            onChange: (coin) => {
              deckLibrary?.setActiveCoin(currentLoadTarget, coin ? coin.id : null);
              rememberCosmetic(currentLoadTarget, 'coinId', coin ? coin.id : null);
              gameLink.announceCoin(currentLoadTarget, coin);
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
          const announceMat = (target, mat, emit = false) =>
            gameLink.announceMat(target, mat, emit);
          const matPicker = initializeDeckBuilderMatPicker({
            panelEl: matPanel,
            onChange: (mat) => {
              deckLibrary?.setActiveMat?.(currentLoadTarget, mat ? mat.id : null);
              rememberCosmetic(currentLoadTarget, 'matId', mat ? mat.id : null);
              // Full-size mats span the whole board and replace the other side.
              if (mat?.layout === 'two-player') {
                const other = currentLoadTarget === 'opp' ? 'self' : 'opp';
                deckLibrary?.setActiveMat?.(other, null);
              }
              announceMat(currentLoadTarget, mat, true);
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
              const fallback = resolveDefaultCardBackSrc();
              // when no sleeve is set for this deck, fall back to whatever
              // this player's own card back already is — never borrow the
              // default and never touch the other player's playmat
              const resolvedTarget = image || getCardBackForTarget(target) || fallback;
              const containerId = target === 'opp' ? 'oppContainer' : 'selfContainer';
              const doc = document.getElementById(containerId)?.contentWindow?.document;
              if (!doc) return;
              // `img.src` is always the browser-resolved absolute URL; the
              // tracked values here are stored as-typed (often relative),
              // so comparing them raw silently never matches and the stale
              // cover/card-back image is never repainted. Resolve both
              // sides against the target iframe's own document first.
              const resolve = (src) => {
                if (!src) return src;
                try {
                  return new URL(src, doc.baseURI).href;
                } catch {
                  return src;
                }
              };
              const knownBacks = new Set(
                [
                  systemState.cardBackSrc,
                  systemState.p1OppCardBackSrc,
                  systemState.p2OppCardBackSrc,
                  fallback,
                  LEGACY_DEFAULT_CARD_BACK_SRC,
                ]
                  .map(resolve)
                  .filter(Boolean)
              );
              // any img currently showing a card back gets the new sleeve
              doc.querySelectorAll('img').forEach((img) => {
                if (knownBacks.has(img.src)) img.src = resolvedTarget;
              });
            } catch {
              // The board iframe is mid-reload; its next build reads the new back.
            }
          };
          document.addEventListener('deck-sleeve-changed', (e) => applySleeveToPlaymat(e.detail?.image, e.detail?.target || 'self'));
    
          // ── per-deck customization restore ─────────────────────────────
          // Board-side only (restoreLastUsedDeckToPlaymat): the game tab
          // restores the sleeve of the deck it holds.
          const syncCustomizationToDeck = () => {
            // sleeve -> playmat card back via the library's own data
            const sleeveId = deckLibrary?.getActiveSleeve?.(currentLoadTarget);
            const sleeve = getSleeves().find((s) => s.id === sleeveId) || null;
            const backImage = sleeve?.image || null;
            // only write/apply for the target actually being viewed — an
            // unset sleeve on this deck must never clobber the OTHER
            // player's already-chosen card back
            // emit=false: runs locally on init/switch; do not broadcast on load.
            if (backImage) changeCardBack(currentLoadTarget, backImage, false);
            document.dispatchEvent(new CustomEvent('deck-sleeve-changed', { detail: { target: currentLoadTarget, image: backImage } }));
          };
    
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
            // Seed the default sub-view, then re-hide: the builder boots on the
            // Search tab, and setView() unhides whichever panel it selects.
            // Without this the sleeve gallery renders under the search grid.
            setView('sleeve');
            sleevePanel.hidden = true;
            coinPanel.hidden = true;
            if (matPanel) matPanel.hidden = true;
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
        gameLink.announceCoin(currentLoadTarget, coin);
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
  // Applied filters drive both Search and Browse Sets; the drawer edits a
  // draft copy that only replaces them on Apply (design 050).
  let cardFilters = createEmptyFilters();
  let draftFilters = createEmptyFilters();
  let activeMode = 'search';
  let searchIsStale = false;
  // One Filters button and chip strip per tab, one shared drawer.
  const filtersButtons = [
    document.getElementById('nativeDeckBuilderFiltersButton'),
    document.getElementById('nativeDeckBuilderBrowseFiltersButton'),
  ].filter(Boolean);
  const filterChips = document.getElementById('nativeDeckBuilderFilterChips');
  const browseFilterChips = document.getElementById('nativeDeckBuilderBrowseFilterChips');
  let drawerOpener = null;
  const filterDrawer = document.getElementById('nativeDeckBuilderFilterDrawer');
  const filterScrim = document.getElementById('nativeDeckBuilderFilterScrim');
  // Expansion names seen in any search, so a chip keeps its label after the
  // results it came from are replaced.
  const knownSetNames = {};
  let currentLoadTarget = 'self';
  let currentTotalSummaries = 0;
  let currentDetailedCount = 0;
  let currentHugeResultSet = false;
  let hasSearched = false;
  let latestSearchId = 0;
  let deckDirty = false;
  let flashFrame = null;
  // null = show every card in the deck list; 'pokemon'|'trainer'|'energy'
  // narrows it to that supertype, set by clicking a summary-bar segment.
  let deckListFilter = null;
  // The Box / Pool controller; null outside Build & Battle, and until it boots below.
  let buildBattle = null;
  // null means "read it from the cards" (detectDeckFormat): only Build & Battle is recorded.
  const currentDeckFormat = () =>
    isBuildBattle
      ? DECK_FORMAT_BUILD_BATTLE
      : deckLibrary?.getActiveDeckFormat?.(currentLoadTarget) || null;
  // What the game is told: the saved record's own format wins, so a Standard deck
  // opened from My Decks in the Build & Battle tab still plays with 6 Prizes.
  const loadFormat = () =>
    deckLoadFormat({
      isBuildBattle,
      recordedFormat: deckLibrary?.getActiveDeckFormat?.(currentLoadTarget),
      isUnsaved: !deckLibrary?.getActiveDeckId?.(currentLoadTarget),
    });

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

  const updateVisibleResults = () => {
    // Filters narrow first, then the TCG/Pocket select and the sort run over
    // what is left — sorting a smaller set is cheaper and the order is the
    // same either way.
    currentResults = applyLocalControls(
      applyCardFilters(currentRawResults, cardFilters, { quantities: cardQuantities() }),
      {
        cardType: cardTypeFilter.value,
        sortBy: sortBySelect.value,
        sortDirection: sortDirectionSelect.value,
      }
    );
  };

  const getSearchStatusText = () => {
    if (currentHugeResultSet) {
      return `Too many matches (${currentTotalSummaries}). Add a card name or more filters.`;
    }
    if (currentResults.length === 0) return 'No matching cards found.';
    if (currentDetailedCount < currentTotalSummaries) {
      return `Showing ${currentResults.length} card(s) from the first ${currentDetailedCount} of ${currentTotalSummaries} matches. Add filters to narrow it down.`;
    }
    return `Showing ${currentResults.length} card(s). Click a card to add it.`;
  };

  // The one way filters change: both tabs follow. A hidden Search tab
  // re-runs when it is next shown rather than fetching now.
  const applyCardFilterState = (nextFilters) => {
    cardFilters = nextFilters;
    setBrowser?.setCardFilters(cardFilters);
    if (activeMode === 'search') {
      runSearch();
    } else {
      searchIsStale = true;
      renderFilterSummary();
    }
  };

  const renderFilterSummary = () => {
    const activeCount = countActiveFilters(cardFilters);
    for (const button of filtersButtons) {
      const badge = button.querySelector('[data-filters-count]');
      if (badge) {
        badge.textContent = String(activeCount);
        badge.hidden = activeCount === 0;
      }
      button.setAttribute('aria-label', activeCount ? `Filters, ${activeCount} active` : 'Filters');
    }
    const chips = describeActiveFilters(cardFilters, { setNames: knownSetNames });
    const onRemove = (chip) => applyCardFilterState(removeFilterChip(cardFilters, chip));
    const onReset = () => applyCardFilterState(createEmptyFilters());
    renderFilterChips({
      chipsEl: filterChips,
      chips,
      resultLabel: hasSearched ? `${currentResults.length} result(s)` : '',
      onRemove,
      onReset,
    });
    // Browse Sets reports its own match count in its status line.
    renderFilterChips({ chipsEl: browseFilterChips, chips, onRemove, onReset });
  };

  const renderResults = () => {
    // Re-filter on every render: "In current deck" follows the deck as it changes.
    if (hasSearched) updateVisibleResults();
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
    renderFilterSummary();
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
        refreshSleeveSelection();
        refreshCoinSelection();
        refreshMatSelection();
      };

      // cache the preview holder while the image is still in the DOM — after
      // replaceChildren the image's parentElement becomes null
      const previewHolder = previewImage?.parentElement || null;
        
          // Rarity isn't in set-listing summaries; fetch per card id and cache.
      const rarityCache = new Map();
      const fetchRarity = async (cardId) => {
        if (rarityCache.has(cardId)) return rarityCache.get(cardId);
        try {
          const detail = await cachedFetchJson(tcgdexApiUrl(`/cards/${cardId}`));
          const rarity = printedRarity(detail);
          rarityCache.set(cardId, rarity);
          return rarity;
        } catch {
          rarityCache.set(cardId, '');
          return '';
        }
      };
    
      const deckBuilderSleeveSrc = () => {
        const sleeveId = deckLibrary?.getActiveSleeve?.(currentLoadTarget);
        const sleeve = sleeveId
          ? getSleeves().find((entry) => entry.id === sleeveId)
          : null;
        return (
          sleeve?.image ||
          systemState.cardBackSrc ||
          'https://ptcgsim.online/src/assets/cardback.png'
        );
      };

      const showCardPreview = async (imageUrl, card = null, sourceEl = null) => {
        if (!imageUrl) return;
        if (card?.id && !card.rarity) {
          card = { ...card, rarity: await fetchRarity(card.id) };
        }
        const origin =
          sourceEl?.querySelector?.('img.native-deck-builder-result-image') ||
          sourceEl?.querySelector?.('img') ||
          sourceEl;
        openFloatingCardPreview({
          sourceEl: origin || previewImage,
          imageUrl: toHighResCardImageUrl(imageUrl),
          card,
          sleeveSrc: deckBuilderSleeveSrc(),
        });
      };
    
      const hideCardPreview = () => {
        closeCardPreview(null, false);
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
      const target = event.target.closest('[data-preview-image], .native-deck-builder-result');
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const cardId = target.closest('[data-card-id]')?.dataset.cardId;
      const index = target.dataset.resultIndex;
      const card =
        (cardId && currentResults.find((c) => c.id === cardId)) ||
        (index !== undefined ? currentResults[Number(index)] : null);
      const previewImage =
        target.dataset.previewImage ||
        card?.images?.large ||
        card?.images?.small ||
        card?.image ||
        target.querySelector('img')?.src;
      if (previewImage) {
        showCardPreview(previewImage, card, target);
      }
    });
  }

  const handleDeckCardPreview = (event) => {
    const target = event.target.closest('[data-preview-image], .native-deck-builder-deck-row');
    if (!target) return;
    // Don't open preview if clicking the add/remove buttons
    if (event.target.closest('.native-deck-builder-deck-btn')) return;
    if (event.target.closest('.native-deck-builder-deck-row-controls')) return;
    event.preventDefault();
    event.stopPropagation();
    // find the deck card variant carrying this image for rarity-aware holo
    const row = target.closest('[data-deck-row-index]');
    const index = row ? Number(row.dataset.deckRowIndex) : -1;
    const sortedCards = getSortedDeckCardArray(deck);
    const card = index >= 0 ? sortedCards[index] : null;
    const previewImage =
      target.dataset.previewImage ||
      card?.images?.large ||
      card?.images?.small ||
      card?.image ||
      target.querySelector('img')?.src;
    if (previewImage) {
      showCardPreview(previewImage, card, target);
    }
  };

  // Click or right-click on deck cards opens preview
  if (cards) {
    cards.addEventListener('click', handleDeckCardPreview);
    cards.addEventListener('contextmenu', handleDeckCardPreview);
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

  // "Import List" popup: a pasted text decklist resolved through TCGdex.
  const openImportListModal = () => {
    importListStatus.textContent = '';
    importListProblems.replaceChildren();
    importListProblems.hidden = true;
    importListModal.removeAttribute('hidden');
    importListText.focus();
  };

  const closeImportListModal = () => {
    importListModal.setAttribute('hidden', '');
  };

  const showImportProblems = (lines) => {
    importListProblems.replaceChildren(
      ...lines.map((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      })
    );
    importListProblems.hidden = lines.length === 0;
  };

  const submitImportList = async () => {
    const { entries, skipped } = parseDeckText(importListText.value);
    importListProblems.hidden = true;
    if (!entries.length) {
      importListStatus.textContent = 'No card lines found. Use lines like "4 Pikachu ex SVI 57".';
      showImportProblems(skipped.map((line) => `Skipped: ${line}`));
      return;
    }

    const replace =
      importListModal.querySelector('input[name="nativeImportListMode"]:checked')?.value !== 'add';
    const nameSearches = new Map();
    const deps = {
      fetchCardDetail: fetchNormalizedCardDetail,
      searchByName: (name) => {
        if (!nameSearches.has(name)) {
          nameSearches.set(name, queryCards({ term: name }).then((search) => search.results));
        }
        return nameSearches.get(name);
      },
    };

    importListSubmit.disabled = true;
    try {
      const result = await importDeckEntries(entries, {
        deck: replace ? createEmptyDeck() : deck,
        addCard,
        deps,
        onProgress: (done, total) => {
          importListStatus.textContent = `Looking up cards… ${done} / ${total}`;
        },
      });

      if (result.imported > 0) {
        deck = result.deck;
        syncedDecks[currentLoadTarget] = deck;
        deckDirty = true;
        render();
      }
      importListStatus.textContent = result.imported
        ? `Imported ${result.imported} card${result.imported === 1 ? '' : 's'}.`
        : 'Nothing was imported.';
      showImportProblems([
        ...result.failed.map(({ line, reason }) => `${line} — ${reason}`),
        ...skipped.map((line) => `Skipped: ${line}`),
      ]);
      if (!result.failed.length && !skipped.length && result.imported > 0) {
        importListText.value = '';
        closeImportListModal();
      }
    } catch (error) {
      importListStatus.textContent = `Import failed: ${error.message}`;
    } finally {
      importListSubmit.disabled = false;
    }
  };

  importListButton.addEventListener('click', openImportListModal);
  importListCancel.addEventListener('click', closeImportListModal);
  importListSubmit.addEventListener('click', submitImportList);
  importListModal.addEventListener('click', (event) => {
    if (event.target === importListModal) closeImportListModal();
  });

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
    const result = withPoolErrors(
      validateDeck(deck, currentDeckFormat() || detectDeckFormat(deck)),
      buildBattle?.poolErrors(deck) || []
    );
    // The summary bar's counts always reflect the whole deck; only the list
    // of cards below it narrows when a segment filter is active.
    const deckForList = deckListFilter
      ? filterDeck(deck, {
          pokemon: deckListFilter === 'pokemon',
          trainer: deckListFilter === 'trainer',
          energy: deckListFilter === 'energy',
        })
      : deck;
    const sortedCards = getSortedDeckCardArray(deckForList);
    const hasDeckCards = Object.keys(deck).length > 0;

    clearButton.style.display = hasDeckCards ? '' : 'none';
    if (saveButton) {
      saveButton.style.display = hasDeckCards ? '' : 'none';
      // With no deck loaded, Save has nothing to overwrite and will ask for a
      // name instead — say so on the button rather than surprising the user.
      const hasLoadedDeck = Boolean(deckLibrary?.getActiveDeckId?.(currentLoadTarget));
      saveButton.textContent = hasLoadedDeck ? 'Save' : 'Save As...';
    }
    // With no game tab to load into, Play has nowhere to go (edge case 7).
    const isConnected = gameLink.isConnected();
    // Build & Battle only plays a legal deck from the pool; the standard builder
    // leaves legality to the player.
    const buildBattleBlock = isBuildBattle && !result.isValid ? result.errors[0] || '' : '';
    playButton.disabled = !hasDeckCards || !isConnected || Boolean(buildBattleBlock);
    playButton.title = !isConnected
      ? 'Open the deck builder from the game tab to play'
      : buildBattleBlock;
    if (linkBanner) linkBanner.hidden = !isEditor || isConnected;
    const isTwoPlayer = gameLink.isTwoPlayer();
    targetAltButton.style.cursor = isTwoPlayer ? 'default' : 'pointer';
    targetAltButton.style.opacity = isTwoPlayer ? '0.5' : '';

    // TCG Live-style deck name strip: show the active saved deck's name
        const deckNameEl = document.getElementById('nativeDeckBuilderDeckName');
        if (deckNameEl) {
          deckNameEl.textContent = deckLibrary?.getActiveDeckName
            ? (deckLibrary.getActiveDeckName(currentLoadTarget) || 'Untitled Deck')
            : 'Untitled Deck';
        }

        renderDeckSprites({
          stripEl: deckSpritesEl,
          sprites: resolveDisplaySprites(currentDeckSprites(), deck),
          spriteUrl: deckSpriteImageUrl,
          spriteLabel: deckSpriteLabel,
          editable: true,
          max: MAX_DECK_SPRITES,
        });
        // Loading or switching decks changes the slots under an open popover.
        spritePicker?.refresh();
        applyWallpaper();
    
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
    for (const el of [exportCsvButton, importListButton, importCsvLabel, clearButton]) {
      if (!el) continue;
      el.classList.toggle('self-color', isSelf);
      el.classList.toggle('opp-color', !isSelf);
    }

    renderDeckSummary({
      summaryEl: summary,
      counts,
      activeFilter: deckListFilter,
      onFilterClick: (type) => {
        deckListFilter = deckListFilter === type ? null : type;
        render();
      },
    });
    // Keep the Browse Sets panel's own card grid in sync with the same
    // filter — the summary bar drives both the deck list and Browse Sets.
    setBrowser?.setSupertypeFilter?.(deckListFilter);
    // "In current deck" follows the deck as it changes in Browse Sets too.
    if (cardFilters.inDeck && activeMode === 'browse') setBrowser?.render();

    renderDeckCounter({
      counterEl: deckCounter,
      model: getDeckCounterModel(result),
    });

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
    buildBattle?.refresh();
  };

  const loadCurrentDeck = () => {
    if (!deckDirty) return;
    deckDirty = false;
    syncedDecks[currentLoadTarget] = deck;
    const deckRows = deckToSimRows(deck);
    if (deckRows.length > 0) {
      gameLink.loadDeck(
        currentLoadTarget,
        deckRows,
        deckLibrary?.getActiveDeckId?.(currentLoadTarget) || null,
        loadFormat()
      );
      if (currentLoadTarget === 'self') persistLastUsedSession();
    }
    render();
  };

  const clearSearchResults = () => {
    currentResults = [];
    currentRawResults = [];
    currentTotalSummaries = 0;
    currentDetailedCount = 0;
    currentHugeResultSet = false;
    hasSearched = false;
  };

  // A name, the filters TCGdex can apply, or both (design 050). Only the
  // latest search may write results: a slow earlier one must not overwrite it.
  const runSearch = async () => {
    const term = searchInput.value.trim();
    const params = buildTcgdexFilterParams(cardFilters);
    const searchId = ++latestSearchId;

    if (!term && Object.keys(params).length === 0) {
      clearSearchResults();
      searchStatus.textContent = hasActiveFilters(cardFilters)
        ? 'Add a card name, or a Format, Type, Stage, HP, Rarity or Regulation mark filter, to search.'
        : '';
      render();
      return;
    }

    searchButton.disabled = true;
    searchStatus.textContent = term ? `Searching for “${term}”...` : 'Searching with your filters...';

    try {
      const searchResponse = await queryCards({ term, params });
      if (searchId !== latestSearchId) return;
      currentRawResults = searchResponse.results;
      currentTotalSummaries = searchResponse.totalSummaries;
      currentDetailedCount = searchResponse.detailedCount;
      currentHugeResultSet = searchResponse.isHugeResultSet;
      hasSearched = true;
      for (const option of deriveSetOptions(currentRawResults)) {
        knownSetNames[option.value] = option.label;
      }
      updateVisibleResults();
      searchStatus.textContent = getSearchStatusText();
    } catch (error) {
      if (searchId !== latestSearchId) return;
      clearSearchResults();
      searchStatus.textContent = `Search failed: ${error.message}`;
    } finally {
      if (searchId === latestSearchId) {
        searchButton.disabled = false;
        render();
      }
    }
  };

  targetMainButton.addEventListener('click', () => {
    switchTarget('self');
    document.dispatchEvent(
      new CustomEvent('deck-target-changed', { detail: { target: 'self' } })
    );
  });

  targetAltButton.addEventListener('click', () => {
    if (gameLink.isTwoPlayer()) return;
    switchTarget('opp');
    document.dispatchEvent(
      new CustomEvent('deck-target-changed', { detail: { target: 'opp' } })
    );
  });

  document.addEventListener('deck-target-changed', (event) => {
    const target = event.detail?.target;
    if (target) switchTarget(target);
  });

  const downloadDeckCsv = (csv) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ptcg-sim-deck.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  exportCsvButton.addEventListener('click', () => {
    const sleeveId = deckLibrary?.getActiveSleeve?.(currentLoadTarget) || null;
    const coinId = deckLibrary?.getActiveCoin?.(currentLoadTarget) || null;
    const csv = serializeDeckToSimCsv(deck, { sleeveId, coinId });
    const cards = getSortedDeckCardArray(deck);
    const deckName = deckLibrary?.getActiveDeckName?.(currentLoadTarget) || 'Untitled Deck';

    // A popup blocked by the browser (or refused by the user) must still
    // export: fall back to the direct CSV download this button used to be.
    let popup = null;
    try {
      popup = window.open('', 'ptcgDeckExport', 'popup=yes,width=1280,height=900');
    } catch {
      popup = null;
    }
    if (!popup) {
      downloadDeckCsv(csv);
      return;
    }

    try {
      popup.document.open();
      popup.document.write(buildDeckExportDocument({ cards, deckName, theme: builderTheme }));
      popup.document.close();
      popup.focus();
      popup.document
        .querySelector('[data-action="download-deck"]')
        ?.addEventListener('click', () => downloadDeckCsv(csv));
    } catch {
      downloadDeckCsv(csv);
    }
  });

  importCsvInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const csvText = await file.text();
      deck = parseSimCsv(csvText);
      syncedDecks[currentLoadTarget] = deck;
      deckDirty = true;

      const { sleeveId, coinId } = parseCsvMeta(csvText);
      if (sleeveId !== null) {
        deckLibrary?.setActiveSleeve(currentLoadTarget, sleeveId);
        sleevePicker?.setSelected(sleeveId);
        const sleeve = getSleeves().find((s) => s.id === sleeveId) || null;
        if (sleeve?.image) {
          gameLink.changeCardBack(currentLoadTarget, sleeve.image, true);
          gameLink.announceSleeve(currentLoadTarget, sleeve.image);
        }
      }
      if (coinId !== null) {
        deckLibrary?.setActiveCoin(currentLoadTarget, coinId);
        coinPicker?.setSelected(coinId);
        gameLink.announceCoin(currentLoadTarget, getCoinById(coinId) || null);
      }

      render();
    } catch (error) {
      searchStatus.textContent = `CSV import failed: ${error.message}`;
    } finally {
      importCsvInput.value = '';
    }
  });

  saveButton?.addEventListener('click', () => {
    // Cosmetics live on the deck, so pass the picker's current choices through:
    // Save writes the whole board state the user set up, not just the cards.
    const chosen = chosenCosmetics[currentLoadTarget === 'opp' ? 'opp' : 'self'];
    const result = deckLibrary?.saveCurrentDeck?.(deck, {
      sleeveId:
        chosen.sleeveId ?? deckLibrary?.getActiveSleeve?.(currentLoadTarget) ?? null,
      coinId:
        chosen.coinId ?? deckLibrary?.getActiveCoin?.(currentLoadTarget) ?? null,
      matId: chosen.matId ?? deckLibrary?.getActiveMat?.(currentLoadTarget) ?? null,
      wallpaperId:
        chosen.wallpaperId ?? deckLibrary?.getActiveWallpaper?.(currentLoadTarget) ?? null,
      sprites: currentDeckSprites(),
      // I205: a deck first saved from the Build & Battle tab is a 4-Prize record; a saved
      // record keeps its own format.
      format: loadFormat(),
    });
    if (!result?.saved) return;
    warmDeckCardCache(deck, fetchCardDetail);

    deckDirty = true;
    flashDeckStatus();
    render();
  });

  clearButton.addEventListener('click', () => {
        if (!window.confirm('Are you sure you want to delete your deck?')) return;
        // Detach from the saved deck so clearing the editor never silently
        // wipes a saved deck from the library.
        deckLibrary?.setActiveDeck(currentLoadTarget, null);
        rememberCosmetic(currentLoadTarget, 'sprites', []);
        deck = createEmptyDeck();
        syncedDecks[currentLoadTarget] = deck;
        deckDirty = true;
        render();
      });

  const rerenderSearchLocally = () => {
    if (!hasSearched) return;
    updateVisibleResults();
    searchStatus.textContent = getSearchStatusText();
    renderResults();
  };

  // ── TCG Live filter drawer (design 050) ──────────────────────────────
  // Expansions come from the results, plus any picked earlier that the
  // current results no longer contain, so a picked set can always be unpicked.
  const drawerSetOptions = () => {
    const options =
      activeMode === 'browse'
        ? setBrowser?.getSetOptions?.() || []
        : deriveSetOptions(currentRawResults);
    for (const option of options) knownSetNames[option.value] = option.label;
    const listed = new Set(options.map((option) => option.value));
    for (const setId of draftFilters.sets) {
      if (!listed.has(setId)) options.push({ value: setId, label: knownSetNames[setId] || setId });
    }
    return options;
  };

  const renderDrawer = () => {
    renderFilterDrawer({
      drawerEl: filterDrawer,
      groups: BUILDER_FILTER_GROUPS,
      filters: draftFilters,
      setOptions: drawerSetOptions(),
      onToggle: (group, value) => {
        draftFilters = toggleFilter(draftFilters, group, value);
        renderDrawer();
      },
      onHpChange: (low, high) => {
        draftFilters = setHpRange(draftFilters, low, high);
        renderDrawer();
      },
      onReset: () => {
        draftFilters = createEmptyFilters();
        renderDrawer();
      },
      onApply: () => {
        closeFilterDrawer();
        applyCardFilterState(draftFilters);
      },
      onClose: () => closeFilterDrawer(),
    });
  };

  const onDrawerKeydown = (event) => {
    if (event.key === 'Escape') closeFilterDrawer();
  };

  const openFilterDrawer = (opener) => {
    if (!filterDrawer) return;
    drawerOpener = opener;
    draftFilters = cardFilters;
    renderDrawer();
    filterDrawer.hidden = false;
    if (filterScrim) filterScrim.hidden = false;
    opener?.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onDrawerKeydown);
    filterDrawer.querySelector('[data-fdrawer-close]')?.focus();
  };

  // Closing without Apply keeps the applied filters and drops the draft.
  // A function declaration: switchMode, defined earlier, closes it too.
  function closeFilterDrawer() {
    if (!filterDrawer || filterDrawer.hidden) return;
    filterDrawer.hidden = true;
    if (filterScrim) filterScrim.hidden = true;
    drawerOpener?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onDrawerKeydown);
    drawerOpener?.focus();
    drawerOpener = null;
  }

  for (const button of filtersButtons) {
    button.addEventListener('click', () => {
      if (filterDrawer?.hidden) openFilterDrawer(button);
      else closeFilterDrawer();
    });
  }
  filterScrim?.addEventListener('click', () => closeFilterDrawer());

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

  if (isEditor) {
    // Closing the builder tab still loads an edited deck into the game (edge case 6).
    window.addEventListener('pagehide', loadCurrentDeck);
    if (!isBuildBattle) {
      // Cards no saved deck owns are lost on close; autosave only covers a bound deck.
      window.addEventListener('beforeunload', (event) => {
        if (!hasUnsavedDraft(deckLibrary?.getActiveDeckId?.(currentLoadTarget), deck)) return;
        event.preventDefault();
        event.returnValue = '';
      });
      // A fresh builder tab reopens the last-used deck, so edits autosave into
      // it instead of into an unbound editor that nothing saves.
      const restoreId = restorableDeckId(
        loadLastSession(window.localStorage),
        deckLibrary?.getLibrary?.()
      );
      if (restoreId && deckLibrary?.openDeckById?.('self', restoreId)) {
        // Only reopened, not edited: closing the tab must not reload it onto the board.
        deckDirty = false;
      }
    }
  } else {
    // ── The game tab applies what the builder tab sends (design 050) ────
    const applyBuilderMessage = ({ type, payload }) => {
      // P2 is Solo-only; the builder tab's view of the game can be stale.
      if (payload.target === 'opp' && systemState.isTwoPlayer) return;
      if (type === 'load-deck') {
        // Mirror the builder's binding so restoring the last deck and a later
        // Play read the deck that is actually on the board.
        deckLibrary?.refresh();
        deckLibrary?.setActiveDeck(payload.target, payload.deckId);
        loadDeckData(payload.target, payload.rows, payload.format);
        return;
      }
      const link = createLocalGameLink();
      if (type === 'card-back') {
        link.changeCardBack(payload.target, payload.image, payload.emit);
      } else if (type === 'sleeve') {
        link.announceSleeve(payload.target, payload.image);
      } else if (type === 'mat') {
        const mat = payload.matId ? getMatById(payload.matId) : null;
        if (payload.matId && !mat) return;
        link.announceMat(payload.target, mat, payload.emit);
      } else if (type === 'coin') {
        const coin = payload.coinId ? getCoinById(payload.coinId) : null;
        if (payload.coinId && !coin) return;
        link.announceCoin(payload.target, coin);
      } else if (type === 'play') {
        link.play(payload.target);
        window.focus();
      }
    };
    installDeckBuilderHost({
      apply: applyBuilderMessage,
      getHostState: () => ({
        isTwoPlayer: Boolean(systemState.isTwoPlayer),
        roomId: (systemState.isTwoPlayer && systemState.roomId) || null,
      }),
    });
    // Leaving a room (joining is announced once the join completes, in socket-event-listeners).
    document.addEventListener('room-changed', announceHostState);
  }

  if (isBuildBattle) {
    // The Build & Battle tab builds only from its pool: no Search, no Browse Sets.
    if (tabSearch) tabSearch.hidden = true;
    if (tabBrowse) tabBrowse.hidden = true;
    tabBox?.addEventListener('click', () => switchMode('box'));
    tabPool?.addEventListener('click', () => switchMode('pool'));
    buildBattle = initializeBuildBattle({
      boxPanelEl: boxPanel,
      poolPanelEl: poolPanel,
      deckLibrary,
      getTarget: () => currentLoadTarget,
      getDeck: () => deck,
      addToDeck: (card) => {
        deck = addCard(deck, card);
        deckDirty = true;
        render();
        flashDeckStatus();
      },
      showUnsavedDeck: (cards) => {
        deckLibrary?.setActiveDeck(currentLoadTarget, null);
        deck = cards;
        syncedDecks[currentLoadTarget] = cards;
        deckDirty = true;
        render();
      },
      detachEditor: () => {
        deckLibrary?.setActiveDeck(currentLoadTarget, null);
        rememberCosmetic(currentLoadTarget, 'sprites', []);
        deck = createEmptyDeck();
        syncedDecks[currentLoadTarget] = deck;
        deckDirty = false;
        render();
      },
      showPool: () => switchMode('pool'),
      showBox: () => switchMode('box'),
      onPreviewCard: (imageUrl, card, sourceEl) => showCardPreview(imageUrl, card, sourceEl),
      waitForRoom: isEditor && gameLink.isConnected(),
    });
    switchMode(buildBattle.initialMode());
  }

  render();
  // Restore each player's saved mat so both halves of the board pick up their
  // own layout on load, even if the player never opens the mat picker.
  if (!isEditor) announceAllMats();

  restoreLastUsedDeckImpl = () => {
    try {
      // The builder tab may have changed the library since this tab loaded it.
      deckLibrary?.refresh();
      const session = loadLastSession(window.localStorage);
      if (!session?.deckId) return false;
      const lib = deckLibrary?.getLibrary?.();
      const cards = getDeckFromLibrary(lib, session.deckId);
      if (!cards || Object.keys(cards).length === 0) return false;

      if (currentLoadTarget !== 'self') {
        switchTarget('self');
      }
      deckLibrary?.setActiveDeck('self', session.deckId);
      deck = cards;
      syncedDecks.self = cards;
      deckDirty = true;
      loadCurrentDeck();
      refreshSleeveSelection();
      refreshCoinSelection();
      refreshMatSelection();
      syncCustomizationToDeck();
      updateReadyButtons();
      return true;
    } catch {
      return false;
    }
  };
};
