// FROZEN 2026-10-15 per design 073: the legacy flow (/build-and-battle-legacy) must keep working as is,
// but gets no new features; the live flow is native-deck-builder-bnb-run.js. Do not extend this file.
import { createRng } from '../../../../../shared/engine/rng.mjs';
import { DECK_FORMAT_BUILD_BATTLE } from '../../../../../shared/engine/formats.mjs';
import { DEFAULT_BOX_KEY, getBuildBattleBox } from '../../../setup/deck-builder/core/build-battle/box-catalog.mjs';
import { loadBoxData } from '../../../setup/deck-builder/core/build-battle/box-data.mjs';
import {
  openBox,
  poolFromBox,
  startingDeckRows,
} from '../../../setup/deck-builder/core/build-battle/pack-opening.mjs';
import {
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
} from '../../../setup/deck-builder/core/build-battle/build-battle-view.mjs';
import { advanceUnboxing, boxSkin } from '../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import {
  boxShot,
  boxUnboxingOptions,
  browserStorage,
  cardImage,
  createPoolTab,
  el,
  mountBoxOnStage,
  renderBoxPicker,
  unlimitedEnergyCards,
} from './native-deck-builder-bb-shared.js';
import { createStage } from './native-deck-builder-stage.js';
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
  let scene = null;
  // The game tab's room (null outside one); a box belongs to the room it was opened for.
  let currentRoomId = null;
  let resumed = false;
  let resumeTimer = null;
  let newRoomNote = false;
  let staleBoxNote = false;
  // The builder workspace: the stage is its child so the Live tokens and scene CSS apply.
  const stage = createStage(boxPanelEl?.closest('.db-live') || null);

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
    clearPoolStatus();
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

  const finishOpening = () => {
    if (stage.el) {
      stage.close();
      renderBox();
    }
    handOverToPool();
  };

  const discardBox = () => {
    if (!session || !window.confirm(NEW_BOX_CONFIRM)) return;
    clearSession(storage);
    session = null;
    pool = [];
    clearPoolStatus();
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
  const renderPicker = () =>
    renderBoxPicker({
      getActiveBox: () => activeBox,
      onPick: pickBox,
      eraRowId: 'buildBattleEra',
      selectId: 'buildBattleBox',
    });

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
    const stageEl = unboxingDone() ? null : stage.open(`Opening your ${activeBox.name}`);
    const sceneOptions = boxUnboxingOptions({
      root,
      box: activeBox,
      loaded,
      skin,
      opened: session,
      getUnboxing: () => session.unboxing,
      dispatch: dispatchUnboxing,
      onFinish: finishOpening,
    });
    if (stageEl) {
      boxPanelEl.append(el('p', 'bb-note', 'Your box is being opened.'));
      scene = mountBoxOnStage({ stageEl, sceneOptions, box: activeBox, deckRows: boxStartingRows(), storage });
    } else {
      boxPanelEl.append(root);
      scene = mountUnboxingScene(sceneOptions);
    }
  };

  const renderBox = () => {
    if (!boxPanelEl) return;
    scene?.unmount();
    scene = null;
    if (unboxingDone()) stage.close();
    const focused = focusedControl();
    boxPanelEl.replaceChildren();
    if (!resumed) return; // still waiting for the game tab to name its room
    renderBanner(boxPanelEl);
    if (session && isLoaded()) renderOpenedBox();
    else renderSealedBox();
    refocus(focused);
  };

  // ── Pool tab ────────────────────────────────────────────────────────────
  const {
    render: renderPool,
    refreshCounts: refreshPoolCounts,
    clearStatus: clearPoolStatus,
  } = createPoolTab({
    poolPanelEl,
    energyCards,
    getPool: () => pool,
    hasPool: () => Boolean(session),
    emptyText: 'Open your box first: the Box tab holds your packs.',
    renderBanner,
    getDeck,
    addToDeck,
    onPreviewCard,
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
    clearPoolStatus();
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
