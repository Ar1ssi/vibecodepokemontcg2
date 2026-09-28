import { createRng } from '../../../../../shared/engine/rng.mjs';
import { packModelFor } from '../../../setup/deck-builder/core/build-battle/box-catalog.mjs';
import { productArt } from '../../../setup/deck-builder/core/build-battle/box-textures.mjs';
import {
  BUILD_BATTLE_SET_CARDS,
  ETB_PROMOS,
} from '../../../setup/deck-builder/core/build-battle/build-battle.generated.mjs';
import {
  deckCardCounts,
  parseSeed,
  randomSeed,
} from '../../../setup/deck-builder/core/build-battle/build-battle-session.mjs';
import { advanceUnboxing } from '../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import {
  addProduct,
  clearCollection,
  collectionPool,
  collectionStats,
  createCollection,
  loadCollection,
  withFreshCollection,
} from '../../../setup/deck-builder/core/elite-trainer-box/collection.mjs';
import { availableEtbs, getEtb } from '../../../setup/deck-builder/core/elite-trainer-box/etb-catalog.mjs';
import { etbContents, openEtb } from '../../../setup/deck-builder/core/elite-trainer-box/etb-opening.mjs';
import {
  clearEtbSession,
  createEtbSession,
  loadEtbSession,
  saveEtbSession,
} from '../../../setup/deck-builder/core/elite-trainer-box/etb-session.mjs';
import {
  EMPTY_COLLECTION_TEXT,
  MEMORY_ONLY_TEXT,
  RESET_COLLECTION_CONFIRM,
  collectionHeadline,
  inFlightLine,
  ownedBadge,
  parseEtbQuery,
  shelfLine,
} from '../../../setup/deck-builder/core/elite-trainer-box/etb-view.mjs';
import { buildModernBasicEnergy } from '../../../setup/deck-builder/core/modern-energy.mjs';
import { createStage } from './native-deck-builder-stage.js';
import { mountUnboxingScene } from './native-deck-builder-unboxing.js';

/**
 * The Shelf and Collection tabs of the Standard deck builder tab (design 055). An Elite Trainer
 * Box is not a format: opening one adds its contents to the collection at once (the scene is
 * cosmetic), and the collection only badges what the player owns — Standard rules decide the deck.
 *
 * The opening plays on the fullscreen stage (native-deck-builder-stage.js) and hands back to the
 * Collection tab, or to the Shelf for another box.
 */

const POOL_GROUPS = [
  ['Pokémon', 'Pokémon'],
  ['Trainer', 'Trainers'],
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

// Every card an owned id may name: every baked set plus the ETB promos.
const knownCardsById = () =>
  new Map(
    [...Object.values(BUILD_BATTLE_SET_CARDS).flat(), ...Object.values(ETB_PROMOS)].map((card) => [
      card.id,
      card,
    ])
  );

const energyCard = (label) => {
  const { qty: _qty, ...card } = buildModernBasicEnergy(label, 1);
  return card;
};

/**
 * @param {object} options
 * @param {HTMLElement|null} options.shelfPanelEl `#etbShelfPanel`
 * @param {HTMLElement|null} options.collectionPanelEl `#etbCollectionPanel`
 * @param {() => object} options.getDeck the editor deck map (`{ [name]: { cards, totalCount } }`)
 * @param {(card: object) => void} options.addToDeck adds one copy to the editor deck
 * @param {() => void} options.showShelf switches the left pane to the Shelf tab
 * @param {() => void} options.showCollection switches the left pane to the Collection tab
 * @param {(imageUrl: string, card: object, sourceEl: Element) => void} options.onPreviewCard
 * @returns {{refresh: () => void, ownedCounts: () => Record<string, number>,
 *   initialMode: () => 'shelf'|null}}
 */
export const initializeEliteTrainerBox = ({
  shelfPanelEl,
  collectionPanelEl,
  getDeck,
  addToDeck,
  showShelf,
  showCollection,
  onPreviewCard,
}) => {
  const storage = browserStorage();
  const cardsById = knownCardsById();
  const query = parseEtbQuery(window.location.search);

  let session = loadEtbSession(storage);
  let collection = loadCollection(storage);
  let memoryOnly = false;
  let scene = null;
  let stage = null;

  // Storage is the truth (another builder tab may have opened a box), unless it refused a write:
  // then the boxes live only in this tab's memory and a re-read would lose them.
  const reloadCollection = () => {
    if (!memoryOnly) collection = loadCollection(storage);
  };

  const inFlight = () => Boolean(session) && session.unboxing.stage !== 'done';
  const sessionEtb = () => (session ? getEtb(session.etbKey) : null);

  const banner = (parent) => {
    if (memoryOnly) parent.append(el('p', 'bb-banner', MEMORY_ONLY_TEXT));
  };

  // ── Opening ─────────────────────────────────────────────────────────────
  // One atomic step: the box goes into the collection before the scene plays, so a skipped or
  // abandoned scene still counts (design 055 Options 3).
  const openNew = (etb, seedText) => {
    if (inFlight()) return;
    const packModel = packModelFor(etb.setId);
    const cards = BUILD_BATTLE_SET_CARDS[etb.setId] || [];
    if (!packModel || !cards.length) return;
    const seed = parseSeed(seedText.trim()) ?? randomSeed();
    const { packs } = openEtb({ etb, cards, packModel, rng: createRng(seed) });
    const contents = etbContents(etb, ETB_PROMOS);
    const add = (current) => addProduct(current, { etb, seed, packs, contents, now: Date.now() });
    const written = memoryOnly
      ? { collection: add(collection), saved: false }
      : withFreshCollection(storage, add);
    collection = written.collection;
    session = createEtbSession({ etbKey: etb.key, seed, packs, packModel, now: Date.now() });
    const sessionSaved = saveEtbSession(storage, session);
    memoryOnly = !written.saved || !sessionSaved;
    playScene();
    renderAll();
  };

  // The scene's beats: a refused event returns null and the scene does nothing.
  const dispatchUnboxing = (event) => {
    if (!session) return null;
    const next = advanceUnboxing(session.unboxing, event);
    if (next === session.unboxing) return null;
    session = { ...session, unboxing: next };
    if (!saveEtbSession(storage, session)) memoryOnly = true;
    return next;
  };

  const closeScene = () => {
    scene?.unmount();
    scene = null;
    stage?.close();
    stage = null;
  };

  const handOver = (panelEl, show) => {
    show();
    if (!panelEl) return;
    panelEl.classList.remove('bb-enter');
    void panelEl.offsetWidth;
    panelEl.classList.add('bb-enter');
  };

  // The scene ended: the box is already in the collection, so the session is done with.
  const finishOpening = (destination) => {
    closeScene();
    session = null;
    clearEtbSession(storage);
    reloadCollection();
    renderAll();
    if (destination === 'collection') handOver(collectionPanelEl, showCollection);
    else handOver(shelfPanelEl, showShelf);
  };

  const onScenePreview = (event) => {
    const image = event.target.closest('[data-preview-card-id]');
    const card = image && cardsById.get(image.dataset.previewCardId);
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    onPreviewCard(cardImage(card, 'large'), card, image);
  };

  function playScene() {
    const etb = sessionEtb();
    if (!etb || !inFlight() || scene) return;
    stage = createStage(shelfPanelEl?.closest('.db-live') || null, `Opening your ${etb.name}`);
    const stageEl = stage.open();
    if (!stageEl) {
      stage = null;
      return;
    }
    const root = el('div', 'bb-scene bb-scene--stage');
    root.id = 'bbUnboxing';
    root.addEventListener('contextmenu', onScenePreview);
    stageEl.replaceChildren(root);
    const contents = etbContents(etb, ETB_PROMOS);
    scene = mountUnboxingScene({
      root,
      getUnboxing: () => session.unboxing,
      dispatch: dispatchUnboxing,
      packs: session.packs.map((pack) => pack.map((id) => cardsById.get(id) || null)),
      packModel: packModelFor(etb.setId),
      seed: session.seed,
      promo: contents.promo,
      product: productArt(etb.art),
      contents,
      onFinish: finishOpening,
    });
  }

  // ── Shelf ───────────────────────────────────────────────────────────────
  const miniBox = (etb) => {
    const box = el('div', 'etb-shelf__box');
    const keyArt = cardsById.get(etb.keyArtCardId);
    const img = el('img', 'etb-shelf__art');
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = cardImage(keyArt, 'large');
    box.append(img, el('span', 'etb-shelf__plate', 'Elite Trainer Box'));
    return box;
  };

  const shelfCard = (etb) => {
    const card = el('article', 'etb-shelf__card');
    card.dataset.etb = etb.key;
    const body = el('div', 'etb-shelf__body');
    body.append(el('h3', 'bb-title', etb.name), el('p', 'bb-note', shelfLine(etb)));

    const seedLabel = el('label', 'bb-seed-label', 'Box #');
    const seedInput = el('input', 'bb-seed-input');
    seedInput.id = `etbSeed-${etb.key}`;
    seedInput.type = 'text';
    seedInput.inputMode = 'numeric';
    seedInput.placeholder = 'random';
    const prefill = query?.etbKey === etb.key ? query.seed : null;
    seedInput.value = prefill === null ? '' : String(prefill);
    seedLabel.append(seedInput);

    const openButton = el('button', 'bb-primary', 'Open');
    openButton.id = `etbOpen-${etb.key}`;
    openButton.type = 'button';
    openButton.disabled = inFlight();
    openButton.addEventListener('click', () => {
      if (openButton.disabled) return;
      openButton.disabled = true;
      openNew(etb, seedInput.value);
    });
    const actions = el('div', 'etb-shelf__actions');
    actions.append(seedLabel, openButton);
    body.append(actions);
    card.append(miniBox(etb), body);
    return card;
  };

  const renderShelf = () => {
    if (!shelfPanelEl) return;
    // A finished opening is done with once the Shelf shows again.
    if (session && !inFlight()) {
      session = null;
      clearEtbSession(storage);
    }
    shelfPanelEl.replaceChildren();
    banner(shelfPanelEl);
    const etb = sessionEtb();
    if (etb) {
      const note = el('div', 'etb-shelf__inflight');
      const resume = el('button', 'bb-primary', 'Resume');
      resume.id = 'etbResume';
      resume.type = 'button';
      resume.addEventListener('click', playScene);
      note.append(el('p', 'bb-note', inFlightLine(etb)), resume);
      shelfPanelEl.append(note);
    }
    const list = el('div', 'etb-shelf');
    for (const row of availableEtbs()) list.append(shelfCard(row));
    shelfPanelEl.append(list);
  };

  // ── Collection ──────────────────────────────────────────────────────────
  const tile = (card, key) => {
    const node = el('button', 'bb-pool-card etb-owned-card');
    node.type = 'button';
    node.dataset.cardId = card.id;
    node.dataset.ownedKey = key;
    node.title = `${card.name} · ${card.set?.name || ''}`;
    const img = el('img', 'bb-pool-card-image');
    img.src = cardImage(card);
    img.alt = card.name;
    img.loading = 'lazy';
    node.append(img, el('span', 'bb-pool-badge'));
    return node;
  };

  const group = (label, tiles) => {
    const section = el('section', 'bb-pool-group');
    const grid = el('div', 'bb-pool-grid');
    grid.append(...tiles);
    section.append(el('h4', 'bb-pool-group-title', label), grid);
    return section;
  };

  const ownedEnergy = () =>
    Object.entries(collection.energy).filter(([, count]) => count > 0);

  const renderCollection = () => {
    if (!collectionPanelEl) return;
    reloadCollection();
    collectionPanelEl.replaceChildren();
    banner(collectionPanelEl);
    const stats = collectionStats(collection);
    const header = el('div', 'bb-box-header');
    header.append(el('h3', 'bb-title', collectionHeadline(stats)));
    const reset = el('button', 'bb-secondary', 'Reset collection');
    reset.id = 'etbResetCollection';
    reset.type = 'button';
    reset.addEventListener('click', resetCollection);
    const actions = el('div', 'bb-box-actions');
    actions.append(reset);
    header.append(actions);
    collectionPanelEl.append(header);

    const pool = collectionPool(collection, cardsById);
    const energy = ownedEnergy();
    if (!pool.length && !energy.length) {
      reset.disabled = true;
      collectionPanelEl.append(el('p', 'bb-pool-status', EMPTY_COLLECTION_TEXT));
      return;
    }
    for (const [supertype, label] of POOL_GROUPS) {
      const entries = pool.filter((entry) => entry.card.supertype === supertype);
      if (entries.length) {
        collectionPanelEl.append(group(label, entries.map(({ card }) => tile(card, card.id))));
      }
    }
    const energyTiles = [
      ...pool
        .filter((entry) => entry.card.supertype === 'Energy')
        .map(({ card }) => tile(card, card.id)),
      ...energy.map(([energyLabel]) => tile(energyCard(energyLabel), energyLabel)),
    ];
    if (energyTiles.length) collectionPanelEl.append(group('Energy', energyTiles));
    refreshCounts();
  };

  // Badges only: re-rendering every image on each deck edit would flicker the grid.
  function refreshCounts() {
    if (!collectionPanelEl) return;
    const deck = getDeck();
    const inDeckById = new Map(deckCardCounts(deck));
    collectionPanelEl.querySelectorAll('.etb-owned-card').forEach((node) => {
      const key = node.dataset.ownedKey;
      const isEnergyLabel = Object.hasOwn(collection.energy, key);
      const owned = isEnergyLabel ? collection.energy[key] : collection.cards[key] || 0;
      const inDeck = isEnergyLabel ? deck?.[key]?.totalCount || 0 : inDeckById.get(key) || 0;
      const badge = ownedBadge(owned, inDeck);
      node.querySelector('.bb-pool-badge').textContent = badge.text;
      node.classList.toggle('is-over', badge.over);
    });
  }

  function resetCollection() {
    if (!window.confirm(RESET_COLLECTION_CONFIRM)) return;
    clearCollection(storage);
    collection = createCollection();
    renderCollection();
  }

  const cardOfTile = (node) =>
    Object.hasOwn(collection.energy, node.dataset.ownedKey)
      ? energyCard(node.dataset.ownedKey)
      : cardsById.get(node.dataset.cardId) || null;

  collectionPanelEl?.addEventListener('click', (event) => {
    const node = event.target.closest('.etb-owned-card');
    const card = node && cardOfTile(node);
    if (card) addToDeck(card);
  });

  collectionPanelEl?.addEventListener('contextmenu', (event) => {
    const node = event.target.closest('.etb-owned-card');
    const card = node && cardOfTile(node);
    if (!card) return;
    event.preventDefault();
    // The document-level contextmenu listener runs closePopups, which would
    // shut the preview in the same event that opened it.
    event.stopPropagation();
    onPreviewCard(cardImage(card, 'large'), card, node);
  });

  function renderAll() {
    renderShelf();
    renderCollection();
  }

  renderAll();
  // A reload mid-opening lands back on the stage, settled at the saved beat.
  playScene();

  return {
    refresh: refreshCounts,
    ownedCounts: () => ({ ...collection.cards }),
    // A box being opened, or a `?etb=` link, opens on the Shelf; otherwise the builder keeps Search.
    initialMode: () => (inFlight() || query ? 'shelf' : null),
  };
};
