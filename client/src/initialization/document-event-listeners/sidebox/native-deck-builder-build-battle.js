import { createRng } from '../../../../../shared/engine/rng.mjs';
import { DECK_FORMAT_BUILD_BATTLE } from '../../../../../shared/engine/formats.mjs';
import {
  BASIC_ENERGY_LABELS,
  BUILD_BATTLE_BOXES,
  getBuildBattleBox,
} from '../../../setup/deck-builder/core/build-battle/box-catalog.mjs';
import {
  BUILD_BATTLE_DECKS,
  BUILD_BATTLE_SET_CARDS,
} from '../../../setup/deck-builder/core/build-battle/build-battle.generated.mjs';
import { openBox, poolFromBox } from '../../../setup/deck-builder/core/build-battle/pack-opening.mjs';
import {
  canAddFromPool,
  clearSession,
  createSession,
  deckCardCounts,
  loadSession,
  parseSeed,
  randomSeed,
  saveSession,
  validatePoolDeck,
} from '../../../setup/deck-builder/core/build-battle/build-battle-session.mjs';
import {
  boxHeadline,
  buildBattleDeckName,
  deckFromCardCounts,
  deckFromRows,
  poolRefusalMessage,
  poolRemaining,
} from '../../../setup/deck-builder/core/build-battle/build-battle-view.mjs';
import { advanceUnboxing } from '../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import { buildModernBasicEnergy } from '../../../setup/deck-builder/core/modern-energy.mjs';
import { fxDisabled, motionReduced } from '../../../setup/image-logic/mat-fx.mjs';
import { mountUnboxingScene } from './native-deck-builder-unboxing.js';

/**
 * The Box and Pool tabs of the Build & Battle builder tab (design 051 § Builder-tab controller).
 * The deck pane, library, Play and autosave stay with native-deck-builder.js; this module owns
 * the opened box, the unboxing scene (design 052, native-deck-builder-unboxing.js) and the pool
 * grid, and reports pool errors back to it.
 *
 * Until the unboxing is done the scene plays on a fullscreen stage and the builder UI is hidden;
 * at the end the stage fades out, the UI comes back with the box deck already in the deck pane
 * and the Pool tab open. A finished box shows its settled scene inline in the Box tab.
 */

// The only box today; the catalog is a list so a later box is data, not code.
const BOX = BUILD_BATTLE_BOXES[0];
const MEMORY_ONLY_TEXT = 'Your box will not survive a reload';
const UNSAVED_DECK_TEXT =
  'My Decks is full, so this deck is kept with your box in this browser only. ' +
  'Delete a deck in My Decks, then press Save to keep it there.';
const NEW_BOX_CONFIRM =
  'Discard this pool and open a new box? Your built deck stays in My Decks.';
const STAGE_ACTIVE_CLASS = 'bb-unboxing-active';
const UI_ENTER_CLASS = 'bb-ui-enter';
const STAGE_FADE_MS = 360;
const UI_ENTER_MS = 900;
const POOL_GROUPS = [
  ['Pokémon', 'Pokémon'],
  ['Trainer', 'Trainers'],
  ['Energy', 'Energy'],
];

// Reading `window.localStorage` itself throws when site data is blocked.
const browserStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const cardImage = (card, size = 'small') =>
  card?.images?.[size] || card?.images?.small || card?.image || '';

const unlimitedEnergyCards = () =>
  BASIC_ENERGY_LABELS.map((label) => {
    const { qty: _qty, ...card } = buildModernBasicEnergy(label, 1);
    return card;
  });

/**
 * @param {object} options
 * @param {HTMLElement|null} options.boxPanelEl `#buildBattleBoxPanel`
 * @param {HTMLElement|null} options.poolPanelEl `#buildBattlePoolPanel`
 * @param {object|null} options.deckLibrary the My Decks controller
 * @param {() => 'self'|'opp'} options.getTarget the player the editor is building for
 * @param {() => object} options.getDeck the editor deck map
 * @param {(card: object) => void} options.addToDeck adds one copy to the editor deck
 * @param {(cards: object) => void} options.showUnsavedDeck puts cards in the editor with no library deck bound
 * @param {() => void} options.detachEditor unbinds and empties the editor
 * @param {() => void} options.showPool switches the left pane to the Pool tab
 * @param {(imageUrl: string, card: object, sourceEl: Element) => void} options.onPreviewCard
 * @returns {{poolErrors: (deck: object) => string[], initialMode: () => 'box'|'pool', refresh: () => void}}
 */
export const initializeBuildBattle = ({
  boxPanelEl,
  poolPanelEl,
  deckLibrary,
  getTarget,
  getDeck,
  addToDeck,
  showUnsavedDeck,
  detachEditor,
  showPool,
  onPreviewCard,
}) => {
  const storage = browserStorage();
  const setCards = BUILD_BATTLE_SET_CARDS[BOX.setId] || [];
  const boxDecks = BUILD_BATTLE_DECKS[BOX.key] || {};
  const energyCards = unlimitedEnergyCards();
  const urlSeed = parseSeed(new URLSearchParams(window.location.search).get('seed') ?? '');

  let session = null;
  let pool = [];
  let memoryOnly = false;
  let poolStatus = '';
  let scene = null;
  let stageEl = null;
  // The builder workspace: the stage is its child so the Live tokens and scene CSS apply.
  const workspaceEl = boxPanelEl?.closest('.db-live') || null;

  const deckEntryOf = (activeSession) =>
    getBuildBattleBox(activeSession.boxKey)?.decks.find((deck) => deck.key === activeSession.deckKey);

  const persist = () => {
    memoryOnly = !saveSession(storage, session);
  };

  const computePool = () => {
    pool = session
      ? poolFromBox({ box: BOX, decks: boxDecks, cards: setCards, opened: session })
      : [];
  };

  // Every card an unsaved deck may name: the pool, the box deck's own rows (its Basic Energy is
  // not a pool entry) and the unlimited Energy.
  const knownCards = () => [
    ...pool.map((entry) => entry.card),
    ...(boxDecks[session.deckKey] || []),
    ...energyCards,
  ];

  // The box deck goes into My Decks as a Build & Battle record and opens in the editor. At the
  // deck limit it still opens, unsaved, and the session keeps its cards so edits survive a
  // reload (I207); the Box tab says so until the player saves it.
  const openBoxDeck = (cards = deckFromRows(boxDecks[session.deckKey] || [])) => {
    const deckEntry = deckEntryOf(session);
    const deckId =
      deckLibrary?.createAndOpenDeck?.(
        getTarget(),
        buildBattleDeckName(deckEntry.name, session.seed),
        cards,
        { format: DECK_FORMAT_BUILD_BATTLE, sprites: deckEntry.sprites }
      ) || null;
    if (!deckId) showUnsavedDeck(cards);
    session = { ...session, deckId, unsavedDeck: deckId ? null : deckCardCounts(cards) };
    persist();
  };

  // Runs after every editor change. While no My Decks record is bound, the edits go into the
  // session; once the player saves a Build & Battle record, the session binds to it.
  const trackUnsavedDeck = () => {
    if (!session || session.deckId) return;
    const target = getTarget();
    const activeId = deckLibrary?.getActiveDeckId?.(target) || null;
    if (activeId && deckLibrary?.getActiveDeckFormat?.(target) === DECK_FORMAT_BUILD_BATTLE) {
      session = { ...session, deckId: activeId, unsavedDeck: null };
      persist();
      renderBox();
      return;
    }
    if (activeId) return; // another My Decks deck is open: leave the box's own deck alone
    const unsavedDeck = deckCardCounts(getDeck());
    if (JSON.stringify(unsavedDeck) === JSON.stringify(session.unsavedDeck)) return;
    session = { ...session, unsavedDeck };
    persist();
  };

  const resumeSession = () => {
    session = loadSession(storage);
    if (!session) return;
    computePool();
    const reopened = session.deckId && deckLibrary?.openDeckById?.(getTarget(), session.deckId);
    if (reopened) return;
    // Unsaved at the deck limit: reopen the player's edits. A bound deck deleted from My Decks
    // is built again from the box.
    openBoxDeck(
      session.unsavedDeck ? deckFromCardCounts(session.unsavedDeck, knownCards()) : undefined
    );
  };

  const openNewBox = (seedText) => {
    if (session) return;
    const seed = parseSeed(seedText.trim()) ?? randomSeed();
    const opened = openBox({ box: BOX, cards: setCards, rng: createRng(seed) });
    session = createSession({ boxKey: BOX.key, seed, ...opened });
    computePool();
    poolStatus = '';
    openBoxDeck();
    renderAll();
  };

  // The scene's beats: a refused event returns null and the scene does nothing (design 052 row 3).
  const dispatchUnboxing = (event) => {
    if (!session) return null;
    const next = advanceUnboxing(session.unboxing, event);
    if (next === session.unboxing) return null;
    session = { ...session, unboxing: next };
    persist();
    return next;
  };

  const unboxingDone = () => !session || session.unboxing.stage === 'done';

  // The Pool tab fades in when the scene hands over to it.
  const handOverToPool = () => {
    showPool();
    if (!poolPanelEl) return;
    poolPanelEl.classList.remove('bb-enter');
    void poolPanelEl.offsetWidth;
    poolPanelEl.classList.add('bb-enter');
  };

  // ── Fullscreen stage (the opening hides the builder UI) ─────────────────
  const openStage = () => {
    if (stageEl || !workspaceEl) return stageEl;
    stageEl = el('div', 'bb-stage');
    stageEl.id = 'bbUnboxingStage';
    stageEl.setAttribute('role', 'dialog');
    stageEl.setAttribute('aria-label', `Opening your ${BOX.name}`);
    workspaceEl.classList.remove(UI_ENTER_CLASS);
    workspaceEl.classList.add(STAGE_ACTIVE_CLASS);
    workspaceEl.append(stageEl);
    return stageEl;
  };

  // The stage fades out while the builder UI loads back in, piece by piece (CSS stagger).
  const closeStage = () => {
    if (!stageEl) return;
    const leaving = stageEl;
    stageEl = null;
    workspaceEl?.classList.remove(STAGE_ACTIVE_CLASS);
    if (motionReduced() || fxDisabled()) {
      leaving.remove();
      return;
    }
    leaving.classList.add('is-leaving');
    setTimeout(() => leaving.remove(), STAGE_FADE_MS);
    workspaceEl?.classList.add(UI_ENTER_CLASS);
    setTimeout(() => workspaceEl?.classList.remove(UI_ENTER_CLASS), UI_ENTER_MS);
  };

  const finishOpening = () => {
    if (stageEl) {
      closeStage();
      renderBox();
    }
    handOverToPool();
  };

  const discardBox = () => {
    if (!session || !window.confirm(NEW_BOX_CONFIRM)) return;
    clearSession(storage);
    session = null;
    pool = [];
    poolStatus = '';
    detachEditor();
    renderAll();
  };

  // ── Box tab ─────────────────────────────────────────────────────────────
  const renderBanner = (parent) => {
    if (memoryOnly) parent.append(el('p', 'bb-banner', MEMORY_ONLY_TEXT));
    if (session && !session.deckId) parent.append(el('p', 'bb-banner', UNSAVED_DECK_TEXT));
  };

  const renderSealedBox = () => {
    const sealed = el('div', 'bb-sealed');
    sealed.append(
      el('h3', 'bb-title', BOX.name),
      el(
        'p',
        'bb-note',
        `${BOX.packCount} Phantasmal Flames packs and one of ${BOX.decks.length} 40-card decks. ` +
          'Build a 40-card deck from them; games use 4 Prizes.'
      )
    );
    const seedLabel = el('label', 'bb-seed-label', 'Box #');
    const seedInput = el('input', 'bb-seed-input');
    seedInput.id = 'buildBattleSeed';
    seedInput.type = 'text';
    seedInput.inputMode = 'numeric';
    seedInput.placeholder = 'random';
    seedInput.value = urlSeed === null ? '' : String(urlSeed);
    seedLabel.append(seedInput);
    const openButton = el('button', 'bb-primary', 'Open box');
    openButton.id = 'buildBattleOpenBox';
    openButton.type = 'button';
    openButton.addEventListener('click', () => {
      openButton.disabled = true;
      openNewBox(seedInput.value);
    });
    sealed.append(seedLabel, openButton);
    boxPanelEl.append(sealed);
  };

  const renderOpenedBox = () => {
    const cardsById = new Map(setCards.map((card) => [card.id, card]));
    const deckEntry = deckEntryOf(session);
    const header = el('div', 'bb-box-header');
    header.append(el('h3', 'bb-title', boxHeadline(BOX, deckEntry, session.seed)));
    const actions = el('div', 'bb-box-actions');
    const newBox = el('button', 'bb-secondary', 'New box');
    newBox.id = 'buildBattleNewBox';
    newBox.type = 'button';
    newBox.addEventListener('click', discardBox);
    actions.append(newBox);
    header.append(actions);
    boxPanelEl.append(header);

    const root = el('div', 'bb-scene');
    root.id = 'bbUnboxing';
    const stage = unboxingDone() ? null : openStage();
    if (stage) {
      root.classList.add('bb-scene--stage');
      stage.replaceChildren(root);
      boxPanelEl.append(el('p', 'bb-note', 'Your box is being opened.'));
    } else {
      boxPanelEl.append(root);
    }
    scene = mountUnboxingScene({
      root,
      getUnboxing: () => session.unboxing,
      dispatch: dispatchUnboxing,
      packs: session.packs.map((pack) => pack.map((id) => cardsById.get(id) || null)),
      packModel: BOX.packModel,
      seed: session.seed,
      promo: boxDecks[session.deckKey]?.find((row) => row.id === deckEntry.promoId) || null,
      onBuildDeck: finishOpening,
    });
  };

  const renderBox = () => {
    if (!boxPanelEl) return;
    scene?.unmount();
    scene = null;
    if (unboxingDone()) closeStage();
    boxPanelEl.replaceChildren();
    renderBanner(boxPanelEl);
    if (session) renderOpenedBox();
    else renderSealedBox();
  };

  // ── Pool tab ────────────────────────────────────────────────────────────
  const poolTile = (card, badgeText) => {
    const tile = el('button', 'bb-pool-card');
    tile.type = 'button';
    tile.dataset.cardId = card.id;
    tile.title = `${card.name} · ${card.set?.name || ''}`;
    const img = el('img', 'bb-pool-card-image');
    img.src = cardImage(card);
    img.alt = card.name;
    img.loading = 'lazy';
    tile.append(img, el('span', 'bb-pool-badge', badgeText));
    return tile;
  };

  const renderPool = () => {
    if (!poolPanelEl) return;
    poolPanelEl.replaceChildren();
    renderBanner(poolPanelEl);
    const statusEl = el('p', 'bb-pool-status', poolStatus);
    statusEl.setAttribute('role', 'status');
    statusEl.dataset.poolStatus = '';
    poolPanelEl.append(statusEl);
    if (!session) {
      statusEl.textContent = 'Open your box first: the Box tab holds your packs.';
      return;
    }
    for (const [supertype, label] of POOL_GROUPS) {
      const entries = pool.filter((entry) => entry.card.supertype === supertype);
      const isEnergy = supertype === 'Energy';
      if (!entries.length && !isEnergy) continue;
      const group = el('section', 'bb-pool-group');
      group.append(el('h4', 'bb-pool-group-title', label));
      const grid = el('div', 'bb-pool-grid');
      for (const { card } of entries) grid.append(poolTile(card, ''));
      if (isEnergy) {
        for (const card of energyCards) {
          const tile = poolTile(card, '∞');
          tile.classList.add('is-unlimited');
          tile.title = `${card.name} · unlimited`;
          grid.append(tile);
        }
      }
      group.append(grid);
      poolPanelEl.append(group);
    }
    refreshPoolCounts();
  };

  // Badges only: re-rendering every image on each deck edit would flicker the grid.
  const refreshPoolCounts = () => {
    if (!poolPanelEl || !session) return;
    const left = poolRemaining(getDeck(), pool);
    poolPanelEl.querySelectorAll('.bb-pool-card:not(.is-unlimited)').forEach((tile) => {
      const count = left.get(tile.dataset.cardId) ?? 0;
      tile.querySelector('.bb-pool-badge').textContent = `${count} left`;
      tile.classList.toggle('is-spent', count === 0);
    });
  };

  const setPoolStatus = (text) => {
    poolStatus = text;
    const statusEl = poolPanelEl?.querySelector('[data-pool-status]');
    if (statusEl) statusEl.textContent = text;
  };

  const findPoolCard = (id) =>
    pool.find((entry) => entry.card.id === id)?.card ||
    energyCards.find((card) => card.id === id) ||
    null;

  poolPanelEl?.addEventListener('click', (event) => {
    const tile = event.target.closest('.bb-pool-card');
    const card = tile && findPoolCard(tile.dataset.cardId);
    if (!card) return;
    if (!canAddFromPool(getDeck(), pool, card)) {
      setPoolStatus(poolRefusalMessage(card, pool));
      return;
    }
    setPoolStatus('');
    addToDeck(card);
  });

  poolPanelEl?.addEventListener('contextmenu', (event) => {
    const tile = event.target.closest('.bb-pool-card');
    const card = tile && findPoolCard(tile.dataset.cardId);
    if (!card) return;
    event.preventDefault();
    onPreviewCard(cardImage(card, 'large'), card, tile);
  });

  boxPanelEl?.addEventListener('contextmenu', (event) => {
    const image = event.target.closest('[data-preview-card-id]');
    if (!image) return;
    const id = image.dataset.previewCardId;
    const card =
      setCards.find((entry) => entry.id === id) ||
      Object.values(boxDecks)
        .flat()
        .find((row) => row.id === id);
    if (!card) return;
    event.preventDefault();
    onPreviewCard(cardImage(card, 'large'), card, image);
  });

  const renderAll = () => {
    renderBox();
    renderPool();
  };

  resumeSession();
  renderAll();

  return {
    poolErrors: (deck) => (session ? validatePoolDeck(deck, pool) : []),
    // A finished box opens on the Pool tab; a new or unfinished one on the Box tab.
    initialMode: () => (session && unboxingDone() ? 'pool' : 'box'),
    refresh: () => {
      trackUnsavedDeck();
      refreshPoolCounts();
    },
  };
};
