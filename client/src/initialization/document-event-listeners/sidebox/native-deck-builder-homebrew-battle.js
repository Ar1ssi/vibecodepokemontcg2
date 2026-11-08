import { createRng } from '../../../../../shared/engine/rng.mjs';
import { deckFromCardCounts } from '../../../setup/deck-builder/core/build-battle/build-battle-view.mjs';
import {
  deckCardCounts,
  parseSeed,
  randomSeed,
  validatePoolDeck,
} from '../../../setup/deck-builder/core/build-battle/build-battle-session.mjs';
import { advanceUnboxing } from '../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import {
  HOMEBREW_DECK_SIZE,
  HOMEBREW_PACK_COUNT,
  HOMEBREW_SET_PATH,
  buildHomebrewPackModel,
  homebrewCardClass,
  hydrateHomebrewSet,
  openHomebrewBox,
  poolFromPacks,
} from '../../../setup/deck-builder/core/homebrew-battle/homebrew-pack.mjs';
import {
  HOMEBREW_BOX_RENDER,
  homebrewContents,
  homebrewLook,
  homebrewPresentation,
} from '../../../setup/deck-builder/core/homebrew-battle/homebrew-look.mjs';
import {
  HOMEBREW_DECK_PREFIX,
  clearHomebrewSession,
  createHomebrewSession,
  homebrewDeckName,
  loadHomebrewSession,
  saveHomebrewSession,
  verifyHomebrewSession,
  HOMEBREW_STORAGE_KEY,
} from '../../../setup/deck-builder/core/homebrew-battle/homebrew-session.mjs';
import { browserStorage, cardImage, createPoolTab, el, unlimitedEnergyCards } from './native-deck-builder-bb-shared.js';
import { createStage } from './native-deck-builder-stage.js';
import { mountUnboxingScene } from './native-deck-builder-unboxing.js';

/**
 * The Packs and Pool tabs of the Homebrew Build & Battle builder tab (design 078): 30 packs of the
 * Homebrew set, a 60-card deck built from them, played with the Standard 6 Prizes. The unboxing is
 * the Elite Trainer Box scene (native-deck-builder-unboxing.js) dressed as the Scarlet & Violet—151
 * Ultra-Premium Collection exterior. The deck pane, library, Play and autosave stay with
 * native-deck-builder.js; this module only owns the box, the pool and which cards the deck may use.
 */

const MEMORY_ONLY_TEXT = 'Your packs will not survive a reload';
const UNSAVED_DECK_TEXT =
  'My Decks is full, so this deck is kept with your packs in this browser only. ' +
  `Delete a deck in My Decks, then press Save As and keep the name starting "${HOMEBREW_DECK_PREFIX}".`;
const STALE_SET_TEXT = 'Your saved packs no longer match the Homebrew set, so they were put away.';
const NO_BOX_PLAY_TEXT = 'Open your packs on the Packs tab to play';
const OPENING_PLAY_TEXT = 'Finish opening your packs to play';
const EMPTY_POOL_TEXT = 'Open your packs first: the Packs tab holds the box.';

const button = (className, text, onClick) => {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
};

const loadHomebrewSet = () =>
  fetch(HOMEBREW_SET_PATH).then((response) => {
    if (!response.ok) throw new Error(`Homebrew set: ${response.status}`);
    return response.json().then(hydrateHomebrewSet);
  });

/**
 * @param {object} options
 * @param {HTMLElement|null} options.boxPanelEl `#buildBattleBoxPanel`, labelled "Packs"
 * @param {HTMLElement|null} options.poolPanelEl `#buildBattlePoolPanel`
 * @param {object|null} options.deckLibrary the My Decks controller
 * @param {() => 'self'|'opp'} options.getTarget the player the editor is building for
 * @param {() => object} options.getDeck the editor deck map
 * @param {(card: object) => void} options.addToDeck adds one copy to the editor deck
 * @param {(cards: object) => void} options.showUnsavedDeck puts cards in the editor with no library deck bound
 * @param {() => void} options.detachEditor unbinds and empties the editor
 * @param {() => void} options.showPool switches the left pane to the Pool tab
 * @param {(imageUrl: string, card: object, sourceEl: Element) => void} options.onPreviewCard
 * @returns {{poolErrors: (deck: object) => string[], initialMode: () => 'box'|'pool',
 *   refresh: () => void, setRoom: () => void, playBlock: () => string, onPlay: () => void}}
 */
export const initializeHomebrewBattle = ({
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
  const energyCards = unlimitedEnergyCards();
  // `?seed=` fixes the first box only; a second box in the same page load draws its own.
  let urlSeed = parseSeed(new URLSearchParams(window.location.search).get('seed') ?? '');

  let loaded = null; // { setInfo, cards, cardsById } once the set's cards are in
  let loadError = null;
  let session = loadHomebrewSession(storage);
  let pool = [];
  let memoryOnly = false;
  let staleSetNote = false;
  let confirmingRestart = false;
  let scene = null;
  // The session's deck is rebound once per page load, after the set's cards are in.
  let deckBound = false;
  const stage = createStage(boxPanelEl?.closest('.db-live') || null);

  const unboxingDone = () => !session || session.unboxing.stage === 'done';

  // ── Session record ────────────────────────────────────────────────────────
  const updateSession = (next) => {
    session = next;
    memoryOnly = !saveHomebrewSession(storage, session);
  };

  // ── Pool ──────────────────────────────────────────────────────────────────
  const computePool = () => {
    pool = session && loaded ? poolFromPacks({ cards: loaded.cards, packs: session.packs }) : [];
  };

  // Every card an unsaved deck may name: the pool and the unlimited Energy.
  const knownCards = () => [...pool.map((entry) => entry.card), ...energyCards];

  // The session's deck goes into My Decks as an empty deck named for the box and opens in the
  // editor. At the deck limit it still opens, unsaved, and the session keeps its cards so edits
  // survive a reload.
  const openBoxDeck = (cards = {}) => {
    const deckId =
      deckLibrary?.createAndOpenDeck?.(getTarget(), homebrewDeckName(session.seed), cards, { sprites: [] }) || null;
    if (!deckId) showUnsavedDeck(cards);
    updateSession({ ...session, deckId, unsavedDeck: deckId ? null : deckCardCounts(cards) });
  };

  // Runs after every editor change. While no My Decks record is bound, the edits go into the
  // session; once the player saves a deck named for the box, the session binds to it.
  const trackUnsavedDeck = () => {
    if (!session || !deckBound || session.deckId) return;
    const target = getTarget();
    const activeId = deckLibrary?.getActiveDeckId?.(target) || null;
    if (activeId) {
      const name = deckLibrary?.getActiveDeckName?.(target) || '';
      if (!name.startsWith(HOMEBREW_DECK_PREFIX)) return; // another My Decks deck is open: leave the box alone
      updateSession({ ...session, deckId: activeId, unsavedDeck: null });
      renderBox();
      return;
    }
    const unsavedDeck = deckCardCounts(getDeck());
    if (JSON.stringify(unsavedDeck) === JSON.stringify(session.unsavedDeck)) return;
    updateSession({ ...session, unsavedDeck });
  };

  // ── Loading and resuming ──────────────────────────────────────────────────
  // A saved box resumes once the set's cards are in: the pool is built and its deck reopens from My
  // Decks (or, unsaved at the deck limit, from the session). Cards the set no longer has put it away.
  const resumeLoadedSession = () => {
    if (!session || deckBound || !loaded) return;
    if (!verifyHomebrewSession(session, loaded.cards)) {
      clearHomebrewSession(storage);
      session = null;
      staleSetNote = true;
      return;
    }
    deckBound = true;
    computePool();
    const reopened = session.deckId && deckLibrary?.openDeckById?.(getTarget(), session.deckId);
    if (!reopened) {
      // A bound deck deleted from My Decks is built again from the session's own edits.
      openBoxDeck(session.unsavedDeck ? deckFromCardCounts(session.unsavedDeck, knownCards()) : {});
    }
  };

  loadHomebrewSet().then(
    ({ setInfo, cards }) => {
      loaded = { setInfo, cards, cardsById: new Map(cards.map((card) => [card.id, card])) };
      resumeLoadedSession();
      renderAll();
    },
    (error) => {
      loadError = error;
      renderAll();
    }
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const openBox = () => {
    if (session || !loaded) return;
    // A second builder tab may have opened a box since this screen was drawn: never overwrite it.
    const existing = loadHomebrewSession(storage);
    if (existing) {
      adopt(existing);
      return;
    }
    const seed = urlSeed ?? randomSeed();
    urlSeed = null;
    const packs = openHomebrewBox({ cards: loaded.cards, rng: createRng(seed) });
    session = createHomebrewSession({ seed, packs });
    memoryOnly = !saveHomebrewSession(storage, session);
    staleSetNote = false;
    deckBound = true;
    computePool();
    clearPoolStatus();
    openBoxDeck();
    renderAll();
  };

  // Done on the summary: the box goes; the decks built from it stay in My Decks.
  const startOver = () => {
    clearHomebrewSession(storage);
    session = null;
    deckBound = false;
    pool = [];
    memoryOnly = false;
    confirmingRestart = false;
    clearPoolStatus();
    detachEditor();
    renderAll();
  };

  // Re-points the tab at the box another tab opened.
  function adopt(stored) {
    session = stored;
    deckBound = false;
    pool = [];
    resumeLoadedSession();
    renderAll();
  }

  // ── Unboxing ──────────────────────────────────────────────────────────────
  // The scene's beats: a refused event returns null and the scene does nothing.
  const dispatchUnboxing = (event) => {
    if (!session) return null;
    const next = advanceUnboxing(session.unboxing, event);
    if (next === session.unboxing) return null;
    updateSession({ ...session, unboxing: next });
    return next;
  };

  const finishOpening = () => {
    if (stage.el) stage.close();
    renderBox();
    showPool();
  };

  const onScenePreview = (event) => {
    const image = event.target.closest('[data-preview-card-id]');
    const card = image && loaded.cardsById.get(image.dataset.previewCardId);
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    onPreviewCard(cardImage(card, 'large'), card, image);
  };

  const renderOpening = (parent) => {
    const { setInfo, cards, cardsById } = loaded;
    const look = homebrewLook();
    const root = el('div', 'bb-scene');
    root.id = 'bbUnboxing';
    root.dataset.era = look.skin.palette;
    root.addEventListener('contextmenu', onScenePreview);
    const options = {
      root,
      getUnboxing: () => session.unboxing,
      dispatch: dispatchUnboxing,
      packs: session.packs.map((pack) => pack.map((id) => cardsById.get(id) || null)),
      packModel: buildHomebrewPackModel(cards),
      classOf: (card) => homebrewCardClass(card, setInfo),
      look,
      seed: session.seed,
      promo: null,
      contents: homebrewContents(),
      presentation: homebrewPresentation(),
      onFinish: finishOpening,
    };
    // Without a workspace to host the stage the scene plays inline.
    const stageEl = stage.open('Opening your Homebrew packs');
    if (stageEl) {
      parent.append(el('p', 'bb-note', 'Your box is being opened.'));
      root.classList.add('bb-scene--stage');
      stageEl.replaceChildren(root);
    } else {
      parent.append(root);
    }
    scene = mountUnboxingScene(options);
  };

  // ── Packs tab ─────────────────────────────────────────────────────────────
  const renderBanner = (parent) => {
    if (staleSetNote && !session) parent.append(el('p', 'bb-banner', STALE_SET_TEXT));
    if (memoryOnly) parent.append(el('p', 'bb-banner', MEMORY_ONLY_TEXT));
    if (session && !session.deckId) parent.append(el('p', 'bb-banner', UNSAVED_DECK_TEXT));
  };

  const boxShot = () => {
    const img = el('img', 'bb-boxshot');
    img.alt = 'Scarlet & Violet—151 Ultra-Premium Collection';
    img.width = HOMEBREW_BOX_RENDER.width;
    img.height = HOMEBREW_BOX_RENDER.height;
    img.draggable = false;
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = `/${HOMEBREW_BOX_RENDER.src}`;
    return img;
  };

  const renderBuyIn = (parent) => {
    const screen = el('div', 'bnb-screen bnb-buyin');
    screen.append(el('h2', 'bnb-title', 'Homebrew Build & Battle'), boxShot());
    const note = el(
      'p',
      'bb-note',
      loadError
        ? 'Could not load the Homebrew set. Reload to try again.'
        : !loaded
          ? 'Loading the Homebrew set…'
          : `${HOMEBREW_PACK_COUNT} Homebrew booster packs, every pack with at least one Trainer and one Energy. ` +
            `Build a ${HOMEBREW_DECK_SIZE}-card deck from your pull; games use 6 Prizes.`
    );
    note.id = 'homebrewBoxNote';
    note.setAttribute('role', 'status');
    if (loadError) note.classList.add('is-error');
    const open = button('bb-primary', `Open ${HOMEBREW_PACK_COUNT} packs`, openBox);
    open.id = 'homebrewOpenBox';
    open.disabled = !loaded;
    screen.append(note, open);
    parent.append(screen);
  };

  const poolLine = () => {
    const total = pool.reduce((sum, entry) => sum + entry.count, 0);
    const by = (supertype) =>
      pool.filter((entry) => entry.card.supertype === supertype).reduce((sum, entry) => sum + entry.count, 0);
    return (
      `${total} cards · ${pool.length} different · ${by('Pokémon')} Pokémon · ${by('Trainer')} Trainer · ` +
      `${by('Energy')} Energy, plus unlimited Basic Energy`
    );
  };

  const renderReady = (parent) => {
    const screen = el('div', 'bnb-screen bnb-lobby');
    screen.append(
      el('h2', 'bnb-title', 'Homebrew Build & Battle'),
      el('p', 'bb-note', `Box #${session.seed} · ${HOMEBREW_PACK_COUNT} packs opened`),
      el('p', 'bb-note', poolLine()),
      el('p', 'bb-note', `Build exactly ${HOMEBREW_DECK_SIZE} cards from your pool, then press Play. Games use 6 Prizes.`)
    );
    if (confirmingRestart) {
      screen.append(el('p', 'bb-note', 'Starting over removes these packs and this pool. Decks stay in My Decks.'));
    }
    const actions = el('div', 'bnb-actions');
    actions.append(button('bb-primary', 'Build your deck', () => showPool()));
    if (confirmingRestart) {
      actions.append(
        button('bb-secondary bnb-forfeit', 'Yes, start over', startOver),
        button('bb-secondary', 'Keep my packs', () => {
          confirmingRestart = false;
          renderBox();
        })
      );
    } else {
      actions.append(
        button('bb-secondary bnb-forfeit', 'Start over', () => {
          confirmingRestart = true;
          renderBox();
        })
      );
    }
    screen.append(actions);
    parent.append(screen);
  };

  const renderBox = () => {
    if (!boxPanelEl) return;
    scene?.unmount();
    scene = null;
    if (unboxingDone()) stage.close();
    boxPanelEl.replaceChildren();
    renderBanner(boxPanelEl);
    if (!session) {
      renderBuyIn(boxPanelEl);
      return;
    }
    if (loadError) {
      boxPanelEl.append(el('p', 'bb-note is-error', 'Could not load the Homebrew set. Reload to try again.'));
      return;
    }
    if (!loaded || !deckBound) {
      boxPanelEl.append(el('p', 'bb-note', 'Loading your packs…'));
      return;
    }
    if (!unboxingDone()) {
      renderOpening(boxPanelEl);
      return;
    }
    renderReady(boxPanelEl);
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
    hasPool: () => Boolean(session),
    emptyText: EMPTY_POOL_TEXT,
    renderBanner,
    getDeck,
    addToDeck,
    onPreviewCard,
  });

  function renderAll() {
    renderBox();
    renderPool();
  }

  // Another builder tab opened, finished or cleared the box.
  window.addEventListener('storage', (event) => {
    if (event.storageArea && event.storageArea !== storage) return;
    if (event.key !== HOMEBREW_STORAGE_KEY && event.key !== null) return;
    const stored = loadHomebrewSession(storage);
    if (!stored && !session) return;
    if (stored && session && JSON.stringify(stored) === JSON.stringify(session)) return;
    if (stored && stored.createdAt !== session?.createdAt) {
      adopt(stored);
      return;
    }
    session = stored;
    if (!session) {
      deckBound = false;
      pool = [];
      detachEditor();
    }
    renderAll();
  });

  return {
    poolErrors: (deck) => (session ? validatePoolDeck(deck, pool) : []),
    // The box is the Packs tab; the pool is one press away.
    initialMode: () => 'box',
    refresh: () => {
      trackUnsavedDeck();
      refreshPoolCounts();
    },
    // The box is not tied to a room: it spans matches and rematches.
    setRoom: () => {},
    // Why the deck pane's Play must stay disabled whatever the deck looks like.
    playBlock: () => {
      if (!session) return NO_BOX_PLAY_TEXT;
      return unboxingDone() ? '' : OPENING_PLAY_TEXT;
    },
    onPlay: () => {},
  };
};
