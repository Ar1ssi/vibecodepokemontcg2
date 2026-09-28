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
  loadSession,
  parseSeed,
  randomSeed,
  saveSession,
  validatePoolDeck,
} from '../../../setup/deck-builder/core/build-battle/build-battle-session.mjs';
import {
  boxHeadline,
  buildBattleDeckName,
  deckFromRows,
  poolRefusalMessage,
  poolRemaining,
} from '../../../setup/deck-builder/core/build-battle/build-battle-view.mjs';
import { buildModernBasicEnergy } from '../../../setup/deck-builder/core/modern-energy.mjs';
import { resolveDefaultCardBackSrc } from '../../../setup/deck-constructor/default-card-back.mjs';

/**
 * The Box and Pool tabs of the Build & Battle builder tab (design 051 § Builder-tab controller).
 * The deck pane, library, Play and autosave stay with native-deck-builder.js; this module owns
 * the opened box, the reveal and the pool grid, and reports pool errors back to it.
 */

// The only box today; the catalog is a list so a later box is data, not code.
const BOX = BUILD_BATTLE_BOXES[0];
const REVEAL_STAGGER_MS = 60;
const MEMORY_ONLY_TEXT = 'Your box will not survive a reload';
const NEW_BOX_CONFIRM =
  'Discard this pool and open a new box? Your built deck stays in My Decks.';
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
 * @returns {{poolErrors: (deck: object) => string[], refresh: () => void}}
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
  // Packs whose cards flip on the next Box render; every other opened pack renders face-up.
  let flippingPacks = new Set();

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

  // The box deck goes into My Decks as a Build & Battle record and opens in the editor. At the
  // deck limit it still opens, unsaved, so the box stays playable.
  const openBoxDeck = () => {
    const deckEntry = deckEntryOf(session);
    const cards = deckFromRows(boxDecks[session.deckKey] || []);
    const deckId =
      deckLibrary?.createAndOpenDeck?.(
        getTarget(),
        buildBattleDeckName(deckEntry.name, session.seed),
        cards,
        { format: DECK_FORMAT_BUILD_BATTLE, sprites: deckEntry.sprites }
      ) || null;
    if (!deckId) showUnsavedDeck(cards);
    session = { ...session, deckId };
    persist();
  };

  const resumeSession = () => {
    session = loadSession(storage);
    if (!session) return;
    computePool();
    const reopened = session.deckId && deckLibrary?.openDeckById?.(getTarget(), session.deckId);
    // The bound deck was deleted from My Decks: build it again from the box.
    if (!reopened) openBoxDeck();
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

  const revealPacks = (count) => {
    if (!session) return;
    const next = Math.min(BOX.packCount, Math.max(session.openedPacks, count));
    for (let index = session.openedPacks; index < next; index += 1) flippingPacks.add(index);
    session = { ...session, openedPacks: next };
    persist();
    renderBox();
  };

  const discardBox = () => {
    if (!session || !window.confirm(NEW_BOX_CONFIRM)) return;
    clearSession(storage);
    session = null;
    pool = [];
    poolStatus = '';
    flippingPacks = new Set();
    detachEditor();
    renderAll();
  };

  // ── Box tab ─────────────────────────────────────────────────────────────
  const renderBanner = (parent) => {
    if (!memoryOnly) return;
    parent.append(el('p', 'bb-banner', MEMORY_ONLY_TEXT));
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

  const renderPackCard = (card, index, isOpen) => {
    const tile = el('div', `bb-pack-card${isOpen ? ' is-open' : ''}`);
    tile.style.setProperty('--bb-delay', `${index * REVEAL_STAGGER_MS}ms`);
    tile.dataset.cardId = card.id;
    const inner = el('div', 'bb-pack-card-inner');
    const back = el('img', 'bb-pack-card-back');
    back.src = resolveDefaultCardBackSrc();
    back.alt = '';
    const front = el('img', 'bb-pack-card-front');
    front.src = cardImage(card);
    front.alt = card.name;
    front.loading = 'lazy';
    inner.append(back, front);
    tile.append(inner);
    return tile;
  };

  const renderOpenedBox = () => {
    const cardsById = new Map(setCards.map((card) => [card.id, card]));
    const deckEntry = deckEntryOf(session);
    const header = el('div', 'bb-box-header');
    header.append(el('h3', 'bb-title', boxHeadline(BOX, deckEntry, session.seed)));
    const actions = el('div', 'bb-box-actions');
    const openAll = el('button', 'bb-secondary', 'Open all');
    openAll.type = 'button';
    openAll.disabled = session.openedPacks >= BOX.packCount;
    openAll.addEventListener('click', () => revealPacks(BOX.packCount));
    const build = el('button', 'bb-primary', 'Build your deck');
    build.type = 'button';
    build.addEventListener('click', showPool);
    const newBox = el('button', 'bb-secondary', 'New box');
    newBox.id = 'buildBattleNewBox';
    newBox.type = 'button';
    newBox.addEventListener('click', discardBox);
    actions.append(openAll, build, newBox);
    header.append(actions);
    boxPanelEl.append(header);

    const promo = boxDecks[session.deckKey]?.find((row) => row.id === deckEntry.promoId);
    const deckCard = el('div', 'bb-deck-card');
    const promoImg = el('img', 'bb-deck-promo');
    promoImg.src = cardImage(promo, 'large');
    promoImg.alt = promo?.name || deckEntry.name;
    promoImg.dataset.previewCardId = deckEntry.promoId;
    const deckText = el('div', 'bb-deck-text');
    deckText.append(
      el('strong', '', `${deckEntry.name} deck`),
      el('span', '', '40 cards, ready to play. It is in My Decks; edit it from your pool.')
    );
    deckCard.append(promoImg, deckText);
    boxPanelEl.append(deckCard);

    const packsEl = el('div', 'bb-packs');
    session.packs.forEach((pack, packIndex) => {
      const isOpen = packIndex < session.openedPacks;
      const row = el('div', 'bb-pack-row');
      const packButton = el(
        'button',
        'bb-pack',
        isOpen ? `Pack ${packIndex + 1}` : `Open pack ${packIndex + 1}`
      );
      packButton.type = 'button';
      // Packs open in order: the session stores how many are open, not which.
      packButton.disabled = packIndex !== session.openedPacks;
      packButton.addEventListener('click', () => revealPacks(packIndex + 1));
      const cardsEl = el('div', 'bb-pack-cards');
      pack.forEach((id, cardIndex) => {
        const card = cardsById.get(id);
        if (!card) return;
        const flipsNow = flippingPacks.has(packIndex);
        cardsEl.append(renderPackCard(card, cardIndex, isOpen && !flipsNow));
      });
      row.append(packButton, cardsEl);
      packsEl.append(row);
    });
    boxPanelEl.append(packsEl);

    if (!flippingPacks.size) return;
    const flipping = [...flippingPacks];
    flippingPacks = new Set();
    // Two frames: the face-down tiles must paint once before the flip can transition.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        for (const packIndex of flipping) {
          packsEl.children[packIndex]
            ?.querySelectorAll('.bb-pack-card')
            .forEach((tile) => tile.classList.add('is-open'));
        }
      })
    );
  };

  const renderBox = () => {
    if (!boxPanelEl) return;
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
    const image = event.target.closest('.bb-pack-card.is-open, .bb-deck-promo');
    if (!image) return;
    const id = image.dataset.cardId || image.dataset.previewCardId;
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
    refresh: refreshPoolCounts,
  };
};
