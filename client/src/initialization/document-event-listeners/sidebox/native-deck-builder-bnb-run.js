import { createRng } from '../../../../../shared/engine/rng.mjs';
import { DECK_FORMAT_BUILD_BATTLE } from '../../../../../shared/engine/formats.mjs';
import { BUILD_BATTLE_LEGACY_PATH } from '../../../setup/deck-builder/core/builder-window.mjs';
import { DEFAULT_BOX_KEY, getBuildBattleBox } from '../../../setup/deck-builder/core/build-battle/box-catalog.mjs';
import { loadBoxData } from '../../../setup/deck-builder/core/build-battle/box-data.mjs';
import {
  openBox,
  poolFromBox,
  startingDeckRows,
} from '../../../setup/deck-builder/core/build-battle/pack-opening.mjs';
import {
  createSession,
  deckCardCounts,
  parseSeed,
  randomSeed,
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
  RUN_STORAGE_KEY,
  armMatch,
  clearRun,
  createRun,
  forfeitRun,
  loadRun,
  recordResult,
  runProgress,
  saveRun,
  withSession,
} from '../../../setup/deck-builder/core/build-battle-run/run-state.mjs';
import {
  RUN_TEXT,
  matchResultLine,
  progressLabel,
  summaryHeadline,
} from '../../../setup/deck-builder/core/build-battle-run/run-view.mjs';
import {
  boxShot,
  boxUnboxingOptions,
  browserStorage,
  createPoolTab,
  el,
  mountBoxOnStage,
  renderBoxPicker,
  unlimitedEnergyCards,
} from './native-deck-builder-bb-shared.js';
import { createStage } from './native-deck-builder-stage.js';
import { mountUnboxingScene } from './native-deck-builder-unboxing.js';

/**
 * The Run and Pool tabs of the Build & Battle builder tab (design 071): TCG Live's run flow over the
 * box machinery of designs 051–055. This replaces native-deck-builder-build-battle.js on
 * `/build-and-battle`; that module still runs at `/build-and-battle-legacy`, unedited. The deck
 * pane, library, Play and autosave stay with native-deck-builder.js.
 *
 * Three screens share the Run tab, picked from the stored run: the buy-in (no run), the lobby (a run
 * in progress) and the run summary (a run that is over). The opened box's unboxing plays on the
 * fullscreen stage first, exactly as in the legacy flow; the lobby follows it.
 *
 * Every change to the run re-reads it from storage first: the game tab records results into the
 * same record while this tab is closed or open, and a stale copy must not undo them.
 */

const MEMORY_ONLY_TEXT = 'Your run will not survive a reload';
const UNSAVED_DECK_TEXT =
  'My Decks is full, so this deck is kept with your run in this browser only. ' +
  'Delete a deck in My Decks, then press Save to keep it there.';
const STALE_BOX_TEXT =
  'Your saved run no longer matches its card data, so it was put away. Decks you built stay in My Decks.';
const EMPTY_DECK_TEXT = 'Build a 40-card deck to play.';
const NO_RUN_PLAY_TEXT = 'Start a run on the Run tab to play';
const RUN_OVER_PLAY_TEXT = 'This run is over';
const SPLASH_BASE = '/src/assets/build-battle/run';

const button = (className, text, onClick) => {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
};

/**
 * @param {object} options
 * @param {HTMLElement|null} options.runPanelEl `#buildBattleBoxPanel`, labelled "Run"
 * @param {HTMLElement|null} options.poolPanelEl `#buildBattlePoolPanel`
 * @param {object|null} options.deckLibrary the My Decks controller
 * @param {() => 'self'|'opp'} options.getTarget the player the editor is building for
 * @param {() => object} options.getDeck the editor deck map
 * @param {(card: object) => void} options.addToDeck adds one copy to the editor deck
 * @param {(cards: object) => void} options.showUnsavedDeck puts cards in the editor with no library deck bound
 * @param {() => void} options.detachEditor unbinds and empties the editor
 * @param {() => void} options.showPool switches the left pane to the Pool tab
 * @param {() => void} options.showRun switches the left pane to the Run tab
 * @param {(imageUrl: string, card: object, sourceEl: Element) => void} options.onPreviewCard
 * @param {() => {disabled: boolean, reason: string}} options.getPlayState the deck pane's Play button
 * @param {() => void} options.requestPlay presses the deck pane's Play button
 * @returns {{poolErrors: (deck: object) => string[], initialMode: () => 'box'|'pool',
 *   refresh: () => void, setRoom: (roomId: string|null) => void, playBlock: () => string,
 *   onPlay: () => void}}
 */
export const initializeBuildBattleRun = ({
  runPanelEl,
  poolPanelEl,
  deckLibrary,
  getTarget,
  getDeck,
  addToDeck,
  showUnsavedDeck,
  detachEditor,
  showPool,
  showRun,
  onPreviewCard,
  getPlayState = () => ({ disabled: true, reason: '' }),
  requestPlay = () => {},
}) => {
  const storage = browserStorage();
  const energyCards = unlimitedEnergyCards();
  const urlParams = new URLSearchParams(window.location.search);
  // `?seed=` fixes the first run's box only; a second run in the same page load draws its own.
  let urlSeed = parseSeed(urlParams.get('seed') ?? '');

  // The box on the buy-in (`?box=`, else the default), or the run's box; its data once
  // `loadBoxData` settles.
  let activeBox = getBuildBattleBox(parseBoxKey(urlParams.get('box')) ?? DEFAULT_BOX_KEY);
  let loaded = null;
  let loadError = null;
  // Bumped per load, so a slow load for a box the player moved away from is dropped.
  let loadToken = 0;
  let run = loadRun(storage);
  let pool = [];
  let memoryOnly = false;
  let staleRunNote = false;
  let scene = null;
  let dialogEl = null;
  let carouselIndex = 0;
  // The run's deck is rebound once per page load, after the box's data is in.
  let deckBound = false;
  const stage = createStage(runPanelEl?.closest('.db-live') || null);

  const isLoaded = () => loaded?.box.key === activeBox.key;
  const session = () => run?.session ?? null;
  const unboxingDone = () => !run || run.session.unboxing.stage === 'done';

  const deckEntryOf = (activeSession, key = activeSession.deckKey) =>
    getBuildBattleBox(activeSession.boxKey)?.decks.find((deck) => deck.key === key);

  // ── Run record ────────────────────────────────────────────────────────────
  // The stored copy of this run, if another tab changed it; else the one in memory.
  const freshRun = () => {
    const stored = loadRun(storage);
    return stored && run && stored.startedAt === run.startedAt ? stored : run;
  };

  // Applies `change` to the freshest copy of the run and stores it. Returns the new run.
  const mutateRun = (change) => {
    const base = freshRun();
    if (!base) return null;
    run = change(base);
    memoryOnly = !saveRun(storage, run);
    return run;
  };

  const updateSession = (next) => mutateRun((current) => withSession(current, next));

  // ── Pool ──────────────────────────────────────────────────────────────────
  const computePool = () => {
    pool =
      run && isLoaded()
        ? poolFromBox({ box: activeBox, data: loaded.data, cards: loaded.cards, opened: run.session })
        : [];
  };

  const boxStartingRows = () =>
    run && isLoaded() ? startingDeckRows({ box: activeBox, data: loaded.data, opened: run.session }) : [];

  // Every card an unsaved deck may name: the pool, the box's own deck rows (their Basic Energy is
  // not a pool entry) and the unlimited Energy.
  const knownCards = () => [
    ...pool.map((entry) => entry.card),
    ...boxStartingRows(),
    ...energyCards,
  ];

  const deckSprites = () => {
    const current = session();
    if (!current.groupKeys) return deckEntryOf(current)?.sprites || [];
    return current.groupKeys.map((key) => deckEntryOf(current, key)?.sprites?.[0]).filter(Boolean);
  };

  // The box deck goes into My Decks as a Build & Battle record and opens in the editor. At the deck
  // limit it still opens, unsaved, and the session keeps its cards so edits survive a reload.
  const openBoxDeck = (cards = deckFromRows(boxStartingRows())) => {
    const current = session();
    const deckEntry = deckEntryOf(current);
    const deckId =
      deckLibrary?.createAndOpenDeck?.(
        getTarget(),
        buildBattleDeckName(activeBox, deckEntry.name, current.seed),
        cards,
        { format: DECK_FORMAT_BUILD_BATTLE, sprites: deckSprites() }
      ) || null;
    if (!deckId) showUnsavedDeck(cards);
    updateSession({
      ...current,
      deckId,
      unsavedDeck: deckId ? null : deckCardCounts(cards),
    });
  };

  // Runs after every editor change. While no My Decks record is bound, the edits go into the
  // session; once the player saves a Build & Battle record, the session binds to it.
  const trackUnsavedDeck = () => {
    const current = session();
    // Until the run's deck is rebound the editor is empty: it must not overwrite the saved edits.
    if (!current || !deckBound || current.deckId) return;
    const target = getTarget();
    const activeId = deckLibrary?.getActiveDeckId?.(target) || null;
    if (activeId && deckLibrary?.getActiveDeckFormat?.(target) === DECK_FORMAT_BUILD_BATTLE) {
      updateSession({ ...current, deckId: activeId, unsavedDeck: null });
      renderRun();
      return;
    }
    if (activeId) return; // another My Decks deck is open: leave the run's own deck alone
    const unsavedDeck = deckCardCounts(getDeck());
    if (JSON.stringify(unsavedDeck) === JSON.stringify(current.unsavedDeck)) return;
    updateSession({ ...current, unsavedDeck });
  };

  // ── Loading and resuming ──────────────────────────────────────────────────
  // A saved run resumes once its box's data is in: the pool is built, and its deck reopens from My
  // Decks (or, unsaved at the deck limit, from the session). Cards the data no longer has put the
  // run away.
  const resumeLoadedRun = () => {
    if (!run || deckBound) return;
    if (!verifySessionCards(run.session, loaded)) {
      clearRun(storage);
      run = null;
      staleRunNote = true;
      return;
    }
    deckBound = true;
    computePool();
    const current = run.session;
    const reopened = current.deckId && deckLibrary?.openDeckById?.(getTarget(), current.deckId);
    if (!reopened) {
      // A bound deck deleted from My Decks is built again from the box.
      openBoxDeck(
        current.unsavedDeck ? deckFromCardCounts(current.unsavedDeck, knownCards()) : undefined
      );
    }
  };

  const onBoxLoaded = () => {
    resumeLoadedRun();
    renderAll();
  };

  // Loads `box`'s data; the panel shows "Loading …" until it settles, and a failure shows the load
  // error with no run created.
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
        renderAll();
      }
    );
  };

  const pickBox = (box) => {
    if (!box || run || box.key === activeBox.key) return;
    loadActiveBox(box);
  };

  // ── Run actions ───────────────────────────────────────────────────────────
  // Re-points the tab at the run another tab started: its deck is bound again once its box loads.
  const adoptRun = (adopted) => {
    run = adopted;
    deckBound = false;
    pool = [];
    loadActiveBox(getBuildBattleBox(adopted.boxKey));
  };

  const startRun = () => {
    if (run || !isLoaded()) return;
    // A second builder tab may have started a run since this buy-in was drawn: never overwrite it.
    const existing = loadRun(storage);
    if (existing) {
      adoptRun(existing);
      return;
    }
    const seed = urlSeed ?? randomSeed();
    urlSeed = null;
    const opened = openBox({
      box: activeBox,
      data: loaded.data,
      cards: loaded.cards,
      setInfo: loaded.setInfo,
      rng: createRng(seed),
    });
    run = createRun({ session: createSession({ boxKey: activeBox.key, seed, ...opened }) });
    memoryOnly = !saveRun(storage, run);
    staleRunNote = false;
    deckBound = true;
    computePool();
    clearPoolStatus();
    openBoxDeck();
    renderAll();
  };

  const forfeit = () => {
    mutateRun(forfeitRun);
    renderRun();
  };

  const recordByHand = (won) => {
    mutateRun((current) => recordResult(current, won));
    renderRun();
  };

  // Done on the summary: the run and its box go; the decks built from it stay in My Decks.
  const finishRun = () => {
    // Only this run: another tab may have started a newer one since.
    const stored = loadRun(storage);
    if (!stored || stored.startedAt === run?.startedAt) clearRun(storage);
    run = null;
    deckBound = false;
    pool = [];
    clearPoolStatus();
    memoryOnly = false;
    detachEditor();
    renderAll();
  };

  // ── Unboxing ──────────────────────────────────────────────────────────────
  // The scene's beats: a refused event returns null and the scene does nothing.
  const dispatchUnboxing = (event) => {
    if (!run) return null;
    const next = advanceUnboxing(run.session.unboxing, event);
    if (next === run.session.unboxing) return null;
    updateSession({ ...run.session, unboxing: next });
    return next;
  };

  const finishOpening = () => {
    if (stage.el) stage.close();
    renderRun();
    showRun();
  };

  // ── Dialogs ───────────────────────────────────────────────────────────────
  const closeDialog = () => {
    dialogEl?.remove();
    dialogEl = null;
  };

  const showDialog = ({ title, body, actions }) => {
    closeDialog();
    const backdrop = el('div', 'bnb-dialog-backdrop');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', title);
    const card = el('div', 'bnb-dialog');
    card.append(el('h3', 'bnb-dialog-title', title));
    for (const paragraph of body) card.append(el('p', 'bnb-dialog-body', paragraph));
    const row = el('div', 'bnb-dialog-actions');
    for (const action of actions) {
      row.append(
        button(action.primary ? 'bb-primary' : 'bb-secondary', action.label, () => {
          closeDialog();
          action.onClick?.();
        })
      );
    }
    card.append(row);
    backdrop.append(card);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeDialog();
    });
    backdrop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDialog();
    });
    runPanelEl.append(backdrop);
    dialogEl = backdrop;
    row.querySelector('button')?.focus();
  };

  const cancelAction = { label: 'Cancel', primary: false };

  // ── Run tab ───────────────────────────────────────────────────────────────
  const renderBanner = (parent) => {
    if (staleRunNote && !run) parent.append(el('p', 'bb-banner', STALE_BOX_TEXT));
    if (memoryOnly) parent.append(el('p', 'bb-banner', MEMORY_ONLY_TEXT));
    if (run && !run.session.deckId) parent.append(el('p', 'bb-banner', UNSAVED_DECK_TEXT));
  };

  const renderCarousel = () => {
    const wrap = el('div', 'bnb-carousel');
    const page = RUN_TEXT.carousel[carouselIndex];
    const art = el('img', 'bnb-carousel-art');
    art.alt = '';
    art.draggable = false;
    art.addEventListener('error', () => art.remove(), { once: true });
    art.src = `${SPLASH_BASE}/carousel-${carouselIndex + 1}.webp`;
    const caption = el('p', 'bnb-carousel-caption', page);
    caption.setAttribute('role', 'status');
    const dots = el('div', 'bnb-carousel-dots');
    RUN_TEXT.carousel.forEach((_, index) => {
      const dot = button('bnb-carousel-dot', '', () => {
        carouselIndex = index;
        renderRun();
      });
      dot.setAttribute('aria-label', `Page ${index + 1}`);
      dot.setAttribute('aria-pressed', String(index === carouselIndex));
      dots.append(dot);
    });
    wrap.append(art, caption, dots);
    return wrap;
  };

  const renderPicker = () => renderBoxPicker({ getActiveBox: () => activeBox, onPick: pickBox, selectId: 'bnbBox' });

  const loadNote = () => {
    if (loadError) return `Could not load ${activeBox.name}. Reload to try again.`;
    if (!isLoaded()) return `Loading ${activeBox.name}…`;
    return boxContentsLine(activeBox, loaded.setInfo.name);
  };

  const renderBuyIn = (parent) => {
    const screen = el('div', 'bnb-screen bnb-buyin');
    screen.append(el('h2', 'bnb-title', RUN_TEXT.title), renderCarousel(), renderPicker());
    const shot = boxShot(activeBox);
    if (shot) screen.append(shot);
    const note = el('p', 'bb-note', loadNote());
    note.id = 'bnbBoxNote';
    note.setAttribute('role', 'status');
    if (loadError) note.classList.add('is-error');
    screen.append(el('h3', 'bb-title', activeBox.name), note);
    const start = button('bb-primary', RUN_TEXT.startButton, () =>
      showDialog({
        title: RUN_TEXT.title,
        body: [RUN_TEXT.startConfirm],
        actions: [cancelAction, { label: RUN_TEXT.startButton, primary: true, onClick: startRun }],
      })
    );
    start.id = 'bnbStartRun';
    start.disabled = !isLoaded();
    const legacy = el('a', 'bnb-legacy-link', 'Classic box opener');
    legacy.href = BUILD_BATTLE_LEGACY_PATH;
    screen.append(start, legacy);
    parent.append(screen);
  };

  const renderNodes = (progress) => {
    const map = el('ol', 'bnb-map');
    map.setAttribute('aria-label', 'Matches');
    for (const node of progress.nodes) {
      const item = el('li', 'bnb-node');
      item.dataset.state = node.state;
      const label =
        node.state === 'win' || node.state === 'loss'
          ? matchResultLine(node.index, node.state === 'win')
          : `Match ${node.index + 1}`;
      item.append(el('span', 'bnb-node-index', String(node.index + 1)));
      item.append(el('span', 'bnb-node-label', label));
      item.title = label;
      map.append(item);
    }
    return map;
  };

  const renderLobby = (parent, progress) => {
    const screen = el('div', 'bnb-screen bnb-lobby');
    const deckEntry = deckEntryOf(run.session);
    screen.append(
      el('h2', 'bnb-title', RUN_TEXT.title),
      el('p', 'bb-note', boxHeadline(activeBox, deckEntry, run.session.seed))
    );
    const meter = el('div', 'bnb-meter');
    meter.setAttribute('role', 'progressbar');
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', String(progress.total));
    meter.setAttribute('aria-valuenow', String(progress.played));
    meter.append(el('span', 'bnb-meter-label', progressLabel(progress)));
    const fill = el('span', 'bnb-meter-fill');
    fill.style.width = `${(progress.played / progress.total) * 100}%`;
    meter.append(fill);
    screen.append(meter, renderNodes(progress));

    const invalid = el('p', 'bnb-deck-invalid');
    invalid.dataset.bnbDeckInvalid = '';
    invalid.setAttribute('role', 'status');
    screen.append(invalid);

    const actions = el('div', 'bnb-actions');
    const play = button('bb-primary bnb-play', RUN_TEXT.playButton, () => requestPlay());
    play.dataset.bnbPlay = '';
    actions.append(
      play,
      button('bb-secondary', RUN_TEXT.editDeckButton, () => showPool()),
      button('bb-secondary', RUN_TEXT.modeInfoButton, () =>
        showDialog({
          title: RUN_TEXT.title,
          body: RUN_TEXT.modeInfo,
          actions: [{ label: 'Close', primary: true }],
        })
      ),
      button('bb-secondary bnb-forfeit', RUN_TEXT.forfeitButton, () =>
        showDialog({
          title: RUN_TEXT.forfeitButton,
          body: [RUN_TEXT.forfeitConfirm],
          actions: [cancelAction, { label: RUN_TEXT.forfeitButton, primary: true, onClick: forfeit }],
        })
      )
    );
    screen.append(actions);

    const manual = el('details', 'bnb-manual');
    manual.append(
      el('summary', '', RUN_TEXT.manualResultSummary),
      button('bb-secondary', RUN_TEXT.manualWin, () => recordByHand(true)),
      button('bb-secondary', RUN_TEXT.manualLoss, () => recordByHand(false))
    );
    screen.append(manual);
    parent.append(screen);
    updatePlayState();
  };

  const renderSummary = (parent, progress) => {
    const screen = el('div', 'bnb-screen bnb-summary');
    screen.append(
      el('h2', 'bnb-title', summaryHeadline({ ...progress, endedEarly: run.endedEarly })),
      renderNodes(progress)
    );
    const list = el('ul', 'bnb-results');
    run.results.forEach((won, index) => list.append(el('li', '', matchResultLine(index, won))));
    screen.append(list);
    if (isLoaded()) {
      const cardCount = pool.reduce((sum, entry) => sum + entry.count, 0);
      screen.append(el('p', 'bb-note', `${cardCount} cards were in your pool.`));
    }
    const done = button('bb-primary', RUN_TEXT.doneButton, finishRun);
    done.id = 'bnbDone';
    screen.append(done);
    parent.append(screen);
  };

  // The lobby's Play and its invalid-deck line follow the deck pane's own Play state.
  const updatePlayState = () => {
    if (!runPanelEl) return;
    const play = runPanelEl.querySelector('[data-bnb-play]');
    const note = runPanelEl.querySelector('[data-bnb-deck-invalid]');
    if (!play || !note) return;
    const state = getPlayState();
    play.disabled = state.disabled;
    note.textContent = state.disabled ? state.reason || EMPTY_DECK_TEXT : '';
    note.hidden = !note.textContent;
  };

  const renderOpening = (parent) => {
    const { setInfo, cards, data } = loaded;
    const skin = boxSkin({ box: activeBox, setInfo, cards, data });
    const root = el('div', 'bb-scene');
    root.id = 'bbUnboxing';
    root.dataset.era = skin.palette;
    const sceneOptions = boxUnboxingOptions({
      root,
      box: activeBox,
      loaded,
      skin,
      opened: run.session,
      getUnboxing: () => run.session.unboxing,
      dispatch: dispatchUnboxing,
      onFinish: finishOpening,
    });
    // Without a workspace to host the stage the DOM scene plays inline, as in the legacy flow.
    const stageEl = stage.open(`Opening your ${activeBox.name}`);
    if (stageEl) {
      parent.append(el('p', 'bb-note', 'Your box is being opened.'));
      scene = mountBoxOnStage({ stageEl, sceneOptions, box: activeBox, deckRows: boxStartingRows(), storage });
    } else {
      parent.append(root);
      scene = mountUnboxingScene(sceneOptions);
    }
  };

  const renderRun = () => {
    if (!runPanelEl) return;
    scene?.unmount();
    scene = null;
    if (unboxingDone()) stage.close();
    closeDialog();
    runPanelEl.replaceChildren();
    renderBanner(runPanelEl);
    if (!run) {
      renderBuyIn(runPanelEl);
      return;
    }
    if (loadError) {
      runPanelEl.append(el('p', 'bb-note is-error', `Could not load ${activeBox.name}. Reload to try again.`));
      return;
    }
    if (!isLoaded() || !deckBound) {
      runPanelEl.append(el('p', 'bb-note', `Loading your ${activeBox.name}…`));
      return;
    }
    if (!unboxingDone()) {
      renderOpening(runPanelEl);
      return;
    }
    const progress = runProgress(run);
    if (progress.finished) renderSummary(runPanelEl, progress);
    else renderLobby(runPanelEl, progress);
  };

  // ── Pool tab ──────────────────────────────────────────────────────────────
  const {
    render: renderPool,
    refreshCounts: refreshPoolCounts,
    clearStatus: clearPoolStatus,
  } = createPoolTab({
    poolPanelEl,
    energyCards,
    getPool: () => pool,
    hasPool: () => Boolean(run),
    emptyText: 'Start a run first: the Run tab holds the buy-in.',
    renderBanner,
    getDeck,
    addToDeck,
    onPreviewCard,
  });

  const renderAll = () => {
    renderRun();
    renderPool();
  };

  // Another tab (the game tab recording a result, or a second builder tab) changed the run.
  const onStorage = (event) => {
    if (event.storageArea && event.storageArea !== storage) return;
    if (event.key !== RUN_STORAGE_KEY && event.key !== null) return;
    const stored = loadRun(storage);
    if (!stored && !run) return;
    if (stored && run && JSON.stringify(stored) === JSON.stringify(run)) return;
    if (stored && stored.startedAt !== run?.startedAt) {
      adoptRun(stored);
      return;
    }
    run = stored;
    if (!run) {
      deckBound = false;
      pool = [];
      detachEditor();
    }
    renderAll();
  };
  window.addEventListener('storage', onStorage);

  // ── Boot ──────────────────────────────────────────────────────────────────
  loadActiveBox(run ? getBuildBattleBox(run.boxKey) : activeBox);

  return {
    poolErrors: (deck) => (run ? validatePoolDeck(deck, pool) : []),
    // The lobby is the Run tab; the pool is one press away.
    initialMode: () => 'box',
    refresh: () => {
      trackUnsavedDeck();
      refreshPoolCounts();
      updatePlayState();
    },
    // A run is not tied to a room: it spans matches and rematches.
    setRoom: () => {},
    // Why the deck pane's Play must stay disabled whatever the deck looks like.
    playBlock: () => {
      if (!run) return NO_RUN_PLAY_TEXT;
      return runProgress(run).finished ? RUN_OVER_PLAY_TEXT : '';
    },
    // The deck pane's Play was pressed: claim the next result for the game it starts.
    onPlay: () => {
      mutateRun((current) => armMatch(current));
    },
  };
};
