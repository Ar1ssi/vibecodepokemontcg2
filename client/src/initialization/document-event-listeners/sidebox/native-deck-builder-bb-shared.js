import {
  BASIC_ENERGY_LABELS,
  BUILD_BATTLE_ERAS,
  BUILD_BATTLE_ERA_NAMES,
  boxesForEra,
  getBuildBattleBox,
} from '../../../setup/deck-builder/core/build-battle/box-catalog.mjs';
import { boxPromoRow } from '../../../setup/deck-builder/core/build-battle/pack-opening.mjs';
import { cardClass, resolvePackModel } from '../../../setup/deck-builder/core/build-battle/pack-models.mjs';
import { canAddFromPool } from '../../../setup/deck-builder/core/build-battle/build-battle-session.mjs';
import {
  poolRefusalMessage,
  poolRemaining,
  showsPlayLevel,
  unboxingLabels,
} from '../../../setup/deck-builder/core/build-battle/build-battle-view.mjs';
import { boxArt } from '../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import { buildModernBasicEnergy } from '../../../setup/deck-builder/core/modern-energy.mjs';
import { mountUnboxingScene } from './native-deck-builder-unboxing.js';
import { mountTabletopUnboxing } from './tabletop/tabletop-scene.js';

/**
 * What the two Build & Battle flows share (design 073 § D): the run flow
 * (native-deck-builder-bnb-run.js, `/build-and-battle`) and the frozen legacy flow
 * (native-deck-builder-build-battle.js, `/build-and-battle-legacy`). Each flow keeps its own state;
 * these pieces read it through the getters they are given.
 */

const POOL_GROUPS = [
  ['Pokémon', 'Pokémon'],
  ['Trainer', 'Trainers'],
  ['Energy', 'Energy'],
];

// Reading `window.localStorage` itself throws when site data is blocked.
export const browserStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const cardImage = (card, size = 'small') =>
  card?.images?.[size] || card?.images?.small || card?.image || '';

export const unlimitedEnergyCards = () =>
  BASIC_ENERGY_LABELS.map((label) => {
    const { qty: _qty, ...card } = buildModernBasicEnergy(label, 1);
    return card;
  });

/** The picked box's product shot (design 055 § Every box's art); a missing file drops out quietly. */
export const boxShot = (box) => {
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

/**
 * Era chips and the era's boxes in release order (design 054 § Builder tab). `onPick` gets the
 * box the player chose; `eraRowId` and `selectId` are the ids each flow's markup has always used.
 */
export const renderBoxPicker = ({ getActiveBox, onPick, eraRowId = null, selectId }) => {
  const picker = el('div', 'bb-picker');
  const eras = el('div', 'bb-era-row');
  if (eraRowId) eras.id = eraRowId;
  eras.setAttribute('role', 'group');
  eras.setAttribute('aria-label', 'Era');
  for (const era of BUILD_BATTLE_ERAS) {
    const chip = el('button', 'bb-era-chip', era.name);
    chip.type = 'button';
    chip.dataset.era = era.key;
    chip.disabled = !era.boxKeys.length;
    chip.setAttribute('aria-pressed', String(era.key === getActiveBox().era));
    chip.addEventListener('click', () => {
      if (era.key !== getActiveBox().era) onPick(getBuildBattleBox(era.boxKeys[0]));
    });
    eras.append(chip);
  }
  const label = el('label', 'bb-box-label', 'Box');
  const select = el('select', 'bb-box-select');
  select.id = selectId;
  for (const box of boxesForEra(getActiveBox().era)) {
    const option = el('option', '', box.shortName);
    option.value = box.key;
    option.selected = box.key === getActiveBox().key;
    select.append(option);
  }
  select.addEventListener('change', () => onPick(getBuildBattleBox(select.value)));
  label.append(select);
  picker.append(eras, label);
  return picker;
};

/**
 * The `mountUnboxingScene` options (design 052) for `opened`, the opened box's session, over the
 * box's loaded data. `skin` is the box's `boxSkin`, which the caller has already put on `root`.
 */
export const boxUnboxingOptions = ({ root, box, loaded, skin, opened, getUnboxing, dispatch, onFinish }) => {
  const cardsById = new Map(loaded.cards.map((card) => [card.id, card]));
  const { setInfo, cards, data } = loaded;
  return {
    root,
    getUnboxing,
    dispatch,
    packs: opened.packs.map((pack) => pack.map((id) => cardsById.get(id) || null)),
    packModel: resolvePackModel(box.packModelKey, cards, setInfo),
    classOf: (card) => cardClass(card, box.era, setInfo),
    look: {
      skin,
      labels: unboxingLabels(box, setInfo.name),
      seriesName: BUILD_BATTLE_ERA_NAMES[box.era],
      setName: setInfo.name,
      playLevel: showsPlayLevel(box),
    },
    seed: opened.seed,
    promo: boxPromoRow({ box, data, deckKey: opened.deckKey }),
    onFinish,
  };
};

/**
 * Plays the opening on the fullscreen stage `stageEl`: the tabletop (design 073-tabletop-unboxing),
 * or the design-052 DOM scene with `?tabletop=0` or when the tabletop cannot run (effects off, no
 * WebGL 2, a lost context), and the box opens all the same. `sceneOptions` are `boxUnboxingOptions`;
 * `deckRows` is the box's starting deck, for the leaflet.
 * @returns {{unmount: () => void}}
 */
export const mountBoxOnStage = ({ stageEl, sceneOptions, box, deckRows, storage }) => {
  const mountDomScene = () => {
    stageEl.classList.remove('bb-stage--tabletop');
    sceneOptions.root.classList.add('bb-scene--stage');
    stageEl.replaceChildren(sceneOptions.root);
    return mountUnboxingScene(sceneOptions);
  };
  // `?tabletop=0` keeps the DOM scene (its recorder, and side-by-side checks).
  if (new URLSearchParams(window.location.search).get('tabletop') === '0') return mountDomScene();
  const table = el('div', 'bb-tabletop');
  stageEl.classList.add('bb-stage--tabletop');
  stageEl.replaceChildren(table);
  return mountTabletopUnboxing({ ...sceneOptions, root: table, box, deckRows, storage, fallback: mountDomScene });
};

/**
 * The Pool tab: the pool grid with its "N left" badges and the unlimited Basic Energy, a click adds
 * one copy when the pool allows it, a right-click previews the card. `hasPool()` is whether a box is
 * open (run or session); `emptyText` is what the tab says before one is.
 * @returns {{render: () => void, refreshCounts: () => void, clearStatus: () => void}}
 */
export const createPoolTab = ({
  poolPanelEl,
  energyCards,
  getPool,
  hasPool,
  emptyText,
  renderBanner,
  getDeck,
  addToDeck,
  onPreviewCard,
}) => {
  let poolStatus = '';

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

  const render = () => {
    if (!poolPanelEl) return;
    poolPanelEl.replaceChildren();
    renderBanner(poolPanelEl);
    const statusEl = el('p', 'bb-pool-status', poolStatus);
    statusEl.setAttribute('role', 'status');
    statusEl.dataset.poolStatus = '';
    poolPanelEl.append(statusEl);
    if (!hasPool()) {
      statusEl.textContent = emptyText;
      return;
    }
    const pool = getPool();
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
    refreshCounts();
  };

  // Badges only: re-rendering every image on each deck edit would flicker the grid.
  const refreshCounts = () => {
    if (!poolPanelEl || !hasPool()) return;
    const left = poolRemaining(getDeck(), getPool());
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
    getPool().find((entry) => entry.card.id === id)?.card ||
    energyCards.find((card) => card.id === id) ||
    null;

  poolPanelEl?.addEventListener('click', (event) => {
    const tile = event.target.closest('.bb-pool-card');
    const card = tile && findPoolCard(tile.dataset.cardId);
    if (!card) return;
    if (!canAddFromPool(getDeck(), getPool(), card)) {
      setPoolStatus(poolRefusalMessage(card, getPool()));
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

  return {
    render,
    refreshCounts,
    // The next render shows no status line (a new or discarded box).
    clearStatus: () => {
      poolStatus = '';
    },
  };
};
