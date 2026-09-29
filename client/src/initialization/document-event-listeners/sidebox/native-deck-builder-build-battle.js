import { createRng } from '../../../../../shared/engine/rng.mjs';
import { DECK_FORMAT_BUILD_BATTLE } from '../../../../../shared/engine/formats.mjs';
import {
  BASIC_ENERGY_LABELS,
  BUILD_BATTLE_ERA_NAMES,
  BUILD_BATTLE_ERAS,
  DEFAULT_BOX_KEY,
  boxesForEra,
  getBuildBattleBox,
} from '../../../setup/deck-builder/core/build-battle/box-catalog.mjs';
import { loadBoxData } from '../../../setup/deck-builder/core/build-battle/box-data.mjs';
import {
  boxPromoRow,
  openBox,
  poolFromBox,
  startingDeckRows,
} from '../../../setup/deck-builder/core/build-battle/pack-opening.mjs';
import { cardClass, resolvePackModel } from '../../../setup/deck-builder/core/build-battle/pack-models.mjs';
import {
  canAddFromPool,
  clearSession,
  createSession,
  deckCardCounts,
  loadSession,
  parseSeed,
  randomSeed,
  saveSession,
  sessionBelongsHere,
  validatePoolDeck,
  verifySessionCards,
} from '../../../setup/deck-builder/core/build-battle/build-battle-session.mjs';
import {
  boxContentsLine,
  boxHeadline,
  buildBattleDeckName,
  deckFromCardCounts,
  deckFromRows,
  parseBoxKey,
  poolRefusalMessage,
  poolRemaining,
  showsPlayLevel,
  unboxingLabels,
} from '../../../setup/deck-builder/core/build-battle/build-battle-view.mjs';
import { advanceUnboxing, boxArt, boxSkin } from '../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import { buildModernBasicEnergy } from '../../../setup/deck-builder/core/modern-energy.mjs';
import { fxDisabled, motionReduced } from '../../../setup/image-logic/mat-fx.mjs';
import { mountUnboxingScene } from './native-deck-builder-unboxing.js';

/**
 * The Box and Pool tabs of the Build & Battle builder tab (designs 051 § Builder-tab controller,
 * 054 § Builder tab). The deck pane, library, Play and autosave stay with native-deck-builder.js;
 * this module owns the chosen box and its loaded data, the opened box, the unboxing scene (design
 * 052, native-deck-builder-unboxing.js) and the pool grid, and reports pool errors back to it.
 *
 * A box's card data loads on demand (`loadBoxData`); until it has, the sealed box shows a loading
 * line and cannot be opened, and a saved box waits for its data before it resumes.
 *
 * Until the unboxing is done the scene plays on a fullscreen stage and the builder UI is hidden;
 * at the end the stage fades out, the UI comes back with the box deck already in the deck pane
 * and the Pool tab open. A finished box shows its settled scene inline in the Box tab.
 */

const MEMORY_ONLY_TEXT = 'Your box will not survive a reload';
const UNSAVED_DECK_TEXT =
  'My Decks is full, so this deck is kept with your box in this browser only. ' +
  'Delete a deck in My Decks, then press Save to keep it there.';
const NEW_ROOM_TEXT =
  'You are in a new room, so this is a fresh box. Decks you built stay in My Decks.';
const STALE_BOX_TEXT =
  'Your saved box no longer matches its card data, so it was put away. Decks you built stay in My Decks.';
// How long a builder tab opened from the game waits for the game to name its room.
const ROOM_WAIT_MS = 800;
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
 * @param {() => void} options.showBox switches the left pane to the Box tab
 * @param {boolean} [options.waitForRoom] the game tab will name its room: hold the saved box
 *   until it does (or ROOM_WAIT_MS passes), so a box from another room never shows
 * @param {(imageUrl: string, card: object, sourceEl: Element) => void} options.onPreviewCard
 * @returns {{poolErrors: (deck: object) => string[], initialMode: () => 'box'|'pool',
 *   refresh: () => void, setRoom: (roomId: string|null) => void}}
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
  showBox,
  onPreviewCard,
  waitForRoom = false,
}) => {
  const storage = browserStorage();
  const energyCards = unlimitedEnergyCards();
  const urlParams = new URLSearchParams(window.location.search);
  const urlSeed = parseSeed(urlParams.get('seed') ?? '');
  // What the Box # field holds; it outlives the sealed box's re-renders.
  let typedSeed = urlSeed === null ? '' : String(urlSeed);

  // The box on the sealed screen (`?box=`, else the default), or the opened box's; its data once
  // `loadBoxData` settles.
  let activeBox = getBuildBattleBox(parseBoxKey(urlParams.get('box')) ?? DEFAULT_BOX_KEY);
  let loaded = null;
  let loadError = null;
  // Bumped per load, so a slow load for a box the player moved away from is dropped.
  let loadToken = 0;
  let session = null;
  let pool = [];
  let memoryOnly = false;
  let poolStatus = '';
  let scene = null;
  let stageEl = null;
  // The game tab's room (null outside one); a box belongs to the room it was opened for.
  let currentRoomId = null;
  let resumed = false;
  let resumeTimer = null;
  let newRoomNote = false;
  let staleBoxNote = false;
  // The builder workspace: the stage is its child so the Live tokens and scene CSS apply.
  const workspaceEl = boxPanelEl?.closest('.db-live') || null;

  const isLoaded = () => loaded?.box.key === activeBox.key;

  const deckEntryOf = (activeSession, key = activeSession.deckKey) =>
    getBuildBattleBox(activeSession.boxKey)?.decks.find((deck) => deck.key === key);

  const persist = () => {
    memoryOnly = !saveSession(storage, session);
  };

  const computePool = () => {
    pool =
      session && isLoaded()
        ? poolFromBox({ box: activeBox, data: loaded.data, cards: loaded.cards, opened: session })
        : [];
  };

  const boxStartingRows = () =>
    session && isLoaded() ? startingDeckRows({ box: activeBox, data: loaded.data, opened: session }) : [];

  // Every card an unsaved deck may name: the pool, the box's own deck rows (their Basic Energy is
  // not a pool entry) and the unlimited Energy.
  const knownCards = () => [
    ...pool.map((entry) => entry.card),
    ...boxStartingRows(),
    ...energyCards,
  ];

  // A fixed deck shows its own two sprites; an Evolution deck each group's promo Pokémon.
  const deckSprites = () => {
    if (!session.groupKeys) return deckEntryOf(session)?.sprites || [];
    return session.groupKeys.map((key) => deckEntryOf(session, key)?.sprites?.[0]).filter(Boolean);
  };

  // The box deck goes into My Decks as a Build & Battle record and opens in the editor. At the
  // deck limit it still opens, unsaved, and the session keeps its cards so edits survive a
  // reload (I207); the Box tab says so until the player saves it.
  const openBoxDeck = (cards = deckFromRows(boxStartingRows())) => {
    const deckEntry = deckEntryOf(session);
    const deckId =
      deckLibrary?.createAndOpenDeck?.(
        getTarget(),
        buildBattleDeckName(activeBox, deckEntry.name, session.seed),
        cards,
        { format: DECK_FORMAT_BUILD_BATTLE, sprites: deckSprites() }
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

  const unboxingDone = () => !session || session.unboxing.stage === 'done';

  // A saved box resumes once its box's data is in: the pool is built, and its deck reopens from My
  // Decks (or, unsaved at the deck limit, from the session). Cards the data no longer has put the
  // box away (design 054 row 2).
  const resumeLoadedSession = (saved) => {
    if (!verifySessionCards(saved, loaded)) {
      clearSession(storage);
      staleBoxNote = true;
      return;
    }
    session = saved;
    computePool();
    const reopened = session.deckId && deckLibrary?.openDeckById?.(getTarget(), session.deckId);
    if (!reopened) {
      // Unsaved at the deck limit: reopen the player's edits. A bound deck deleted from My Decks
      // is built again from the box.
      openBoxDeck(
        session.unsavedDeck ? deckFromCardCounts(session.unsavedDeck, knownCards()) : undefined
      );
    }
    if (unboxingDone()) showPool();
  };

  // A saved box waiting for its data: until it resumes, the picker is hidden and the box cannot
  // change under it.
  let pendingSession = null;

  // A saved box from another room is put away and the player starts a fresh one.
  const putAwayForNewRoom = () => {
    clearSession(storage);
    newRoomNote = true;
  };

  const onBoxLoaded = () => {
    const saved = pendingSession;
    if (saved?.boxKey === loaded.box.key) {
      pendingSession = null;
      if (sessionBelongsHere(saved, currentRoomId)) resumeLoadedSession(saved);
      else putAwayForNewRoom();
    }
    renderAll();
  };

  // Loads `box`'s data; the panel shows "Loading …" until it settles, and a failure shows the
  // load error with no session created (design 054 row 5).
  const loadActiveBox = (box) => {
    activeBox = box;
    loadError = null;
    // Every switch drops a load still in flight, even back to the box already loaded.
    const token = ++loadToken;
    if (isLoaded()) {
      onBoxLoaded();
      return;
    }
    renderAll();
    loadBoxData(box.key).then(
      (result) => {
        if (token !== loadToken) return;
        loaded = result;
        onBoxLoaded();
      },
      (error) => {
        if (token !== loadToken) return;
        loadError = error;
        pendingSession = null;
        renderAll();
      }
    );
  };

  const resumeSession = () => {
    const saved = loadSession(storage);
    if (saved && !sessionBelongsHere(saved, currentRoomId)) putAwayForNewRoom();
    const resumable = saved && sessionBelongsHere(saved, currentRoomId) ? saved : null;
    pendingSession = resumable;
    loadActiveBox(resumable ? getBuildBattleBox(resumable.boxKey) : activeBox);
  };

  const openNewBox = (seedText) => {
    if (session || !isLoaded()) return;
    const seed = parseSeed(seedText.trim()) ?? randomSeed();
    const opened = openBox({
      box: activeBox,
      data: loaded.data,
      cards: loaded.cards,
      setInfo: loaded.setInfo,
      rng: createRng(seed),
    });
    session = createSession({ boxKey: activeBox.key, seed, roomId: currentRoomId, ...opened });
    computePool();
    poolStatus = '';
    newRoomNote = false;
    staleBoxNote = false;
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
    stageEl.setAttribute('aria-label', `Opening your ${activeBox.name}`);
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
    if (newRoomNote && !session) parent.append(el('p', 'bb-banner', NEW_ROOM_TEXT));
    if (staleBoxNote && !session) parent.append(el('p', 'bb-banner', STALE_BOX_TEXT));
    if (memoryOnly) parent.append(el('p', 'bb-banner', MEMORY_ONLY_TEXT));
    if (session && !session.deckId) parent.append(el('p', 'bb-banner', UNSAVED_DECK_TEXT));
  };

  // The picked box goes into the URL, so a reload or a shared link opens the same box.
  const rememberBoxInUrl = (box) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('box', box.key);
      window.history.replaceState(window.history.state, '', url);
    } catch {
      // A sandboxed or file: page may refuse; the picker still works.
    }
  };

  const pickBox = (box) => {
    if (!box || session || pendingSession || box.key === activeBox.key) return;
    rememberBoxInUrl(box);
    loadActiveBox(box);
  };

  // Era chips and the era's boxes in release order (design 054 § Builder tab). Only the sealed
  // screen shows the picker, so a box cannot change under an opened session (row 22).
  const renderPicker = () => {
    const picker = el('div', 'bb-picker');
    const eras = el('div', 'bb-era-row');
    eras.id = 'buildBattleEra';
    eras.setAttribute('role', 'group');
    eras.setAttribute('aria-label', 'Era');
    for (const era of BUILD_BATTLE_ERAS) {
      const chip = el('button', 'bb-era-chip', era.name);
      chip.type = 'button';
      chip.dataset.era = era.key;
      chip.disabled = !era.boxKeys.length;
      chip.setAttribute('aria-pressed', String(era.key === activeBox.era));
      chip.addEventListener('click', () => {
        if (era.key !== activeBox.era) pickBox(getBuildBattleBox(era.boxKeys[0]));
      });
      eras.append(chip);
    }
    const label = el('label', 'bb-box-label', 'Box');
    const select = el('select', 'bb-box-select');
    select.id = 'buildBattleBox';
    for (const box of boxesForEra(activeBox.era)) {
      const option = el('option', '', box.shortName);
      option.value = box.key;
      option.selected = box.key === activeBox.key;
      select.append(option);
    }
    select.addEventListener('change', () => pickBox(getBuildBattleBox(select.value)));
    label.append(select);
    picker.append(eras, label);
    return picker;
  };

  // Every re-render replaces the sealed box's controls; the one the player was on keeps focus.
  const focusedControl = () => {
    const active = document.activeElement;
    if (!boxPanelEl?.contains(active)) return null;
    if (active.id === 'buildBattleBox' || active.id === 'buildBattleSeed') return `#${active.id}`;
    return active.dataset?.era ? `.bb-era-chip[data-era="${active.dataset.era}"]` : null;
  };

  const refocus = (selector) => {
    const control = selector && boxPanelEl.querySelector(selector);
    if (!control) return;
    control.focus();
    if (control.id === 'buildBattleSeed') control.setSelectionRange(control.value.length, control.value.length);
  };

  const sealedNote = () => {
    if (loadError) return `Could not load ${activeBox.name}. Reload to try again.`;
    if (pendingSession) return `Loading your ${activeBox.name}…`;
    if (!isLoaded()) return `Loading ${activeBox.name}…`;
    return boxContentsLine(activeBox, loaded.setInfo.name);
  };

  // The picked box's product shot (design 055 § Every box's art); a missing file drops out quietly.
  const boxShot = (box) => {
    const render = boxArt(box)?.render;
    if (!render) return null;
    const img = el('img', 'bb-boxshot');
    img.alt = box.name;
    img.width = render.width;
    img.height = render.height;
    img.draggable = false;
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = `/${render.src}`;
    return img;
  };

  const renderSealedBox = () => {
    const sealed = el('div', 'bb-sealed');
    const note = el('p', 'bb-note', sealedNote());
    note.id = 'buildBattleBoxNote';
    note.setAttribute('role', 'status');
    if (loadError) note.classList.add('is-error');
    if (pendingSession) {
      sealed.append(el('h3', 'bb-title', activeBox.name), note);
      boxPanelEl.append(sealed);
      return;
    }
    sealed.append(renderPicker());
    const shot = boxShot(activeBox);
    if (shot) sealed.append(shot);
    sealed.append(el('h3', 'bb-title', activeBox.name), note);
    const seedLabel = el('label', 'bb-seed-label', 'Box #');
    const seedInput = el('input', 'bb-seed-input');
    seedInput.id = 'buildBattleSeed';
    seedInput.type = 'text';
    seedInput.inputMode = 'numeric';
    seedInput.placeholder = 'random';
    seedInput.value = typedSeed;
    seedInput.addEventListener('input', () => {
      typedSeed = seedInput.value;
    });
    seedLabel.append(seedInput);
    const openButton = el('button', 'bb-primary', 'Open box');
    openButton.id = 'buildBattleOpenBox';
    openButton.type = 'button';
    openButton.disabled = !isLoaded();
    openButton.addEventListener('click', () => {
      openButton.disabled = true;
      openNewBox(seedInput.value);
    });
    sealed.append(seedLabel, openButton);
    boxPanelEl.append(sealed);
  };

  const renderOpenedBox = () => {
    const cardsById = new Map(loaded.cards.map((card) => [card.id, card]));
    const deckEntry = deckEntryOf(session);
    const header = el('div', 'bb-box-header');
    header.append(el('h3', 'bb-title', boxHeadline(activeBox, deckEntry, session.seed)));
    const actions = el('div', 'bb-box-actions');
    const newBox = el('button', 'bb-secondary', 'New box');
    newBox.id = 'buildBattleNewBox';
    newBox.type = 'button';
    newBox.addEventListener('click', discardBox);
    actions.append(newBox);
    header.append(actions);
    boxPanelEl.append(header);

    const { setInfo, cards, data } = loaded;
    const skin = boxSkin({ box: activeBox, setInfo, cards, data });
    const root = el('div', 'bb-scene');
    root.id = 'bbUnboxing';
    root.dataset.era = skin.palette;
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
      packModel: resolvePackModel(activeBox.packModelKey, cards, setInfo),
      classOf: (card) => cardClass(card, activeBox.era, setInfo),
      look: {
        skin,
        labels: unboxingLabels(activeBox, setInfo.name),
        seriesName: BUILD_BATTLE_ERA_NAMES[activeBox.era],
        setName: setInfo.name,
        playLevel: showsPlayLevel(activeBox),
      },
      seed: session.seed,
      promo: boxPromoRow({ box: activeBox, data, deckKey: session.deckKey }),
      onBuildDeck: finishOpening,
    });
  };

  const renderBox = () => {
    if (!boxPanelEl) return;
    scene?.unmount();
    scene = null;
    if (unboxingDone()) closeStage();
    const focused = focusedControl();
    boxPanelEl.replaceChildren();
    if (!resumed) return; // still waiting for the game tab to name its room
    renderBanner(boxPanelEl);
    if (session && isLoaded()) renderOpenedBox();
    else renderSealedBox();
    refocus(focused);
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
    // The document-level contextmenu listener runs closePopups, which would
    // shut the preview in the same event that opened it.
    event.stopPropagation();
    onPreviewCard(cardImage(card, 'large'), card, tile);
  });

  boxPanelEl?.addEventListener('contextmenu', (event) => {
    const image = event.target.closest('[data-preview-card-id]');
    if (!image || !isLoaded()) return;
    const id = image.dataset.previewCardId;
    const card =
      loaded.cards.find((entry) => entry.id === id) || loaded.data.cardsById.get(id) || null;
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    onPreviewCard(cardImage(card, 'large'), card, image);
  });

  const renderAll = () => {
    renderBox();
    renderPool();
  };

  const finishResume = () => {
    if (resumed) return;
    resumed = true;
    clearTimeout(resumeTimer);
    resumeSession();
  };

  // The game tab joined or left a room. A box opened for another room is put away (its deck
  // stays in My Decks) and the player starts a fresh one; a reload in the same room resumes.
  const setRoom = (roomId) => {
    currentRoomId = roomId || null;
    if (!resumed) {
      finishResume();
      return;
    }
    if (pendingSession && !sessionBelongsHere(pendingSession, currentRoomId)) {
      pendingSession = null;
      putAwayForNewRoom();
      renderAll();
      showBox();
      return;
    }
    if (!session || sessionBelongsHere(session, currentRoomId)) return;
    clearSession(storage);
    session = null;
    pool = [];
    poolStatus = '';
    newRoomNote = true;
    detachEditor();
    renderAll();
    showBox();
  };

  if (waitForRoom) {
    resumeTimer = setTimeout(finishResume, ROOM_WAIT_MS);
    renderAll();
  } else {
    finishResume();
  }

  return {
    poolErrors: (deck) => (session ? validatePoolDeck(deck, pool) : []),
    // A finished box opens on the Pool tab; a new or unfinished one on the Box tab. A box whose
    // data is still loading picks its tab itself once it resumes.
    initialMode: () => (session && unboxingDone() ? 'pool' : 'box'),
    refresh: () => {
      trackUnsavedDeck();
      refreshPoolCounts();
    },
    setRoom,
  };
};
