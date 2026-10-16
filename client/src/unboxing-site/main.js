import { createRng } from '../../../shared/engine/rng.mjs';
import {
  BUILD_BATTLE_ERA_NAMES,
  BUILD_BATTLE_ERAS,
  DEFAULT_BOX_KEY,
  boxesForEra,
  getBuildBattleBox,
} from '../setup/deck-builder/core/build-battle/box-catalog.mjs';
import { loadBoxData } from '../setup/deck-builder/core/build-battle/box-data.mjs';
import { parseSeed, randomSeed } from '../setup/deck-builder/core/build-battle/build-battle-session.mjs';
import { showsPlayLevel, unboxingLabels } from '../setup/deck-builder/core/build-battle/build-battle-view.mjs';
import { cardClass, resolvePackModel } from '../setup/deck-builder/core/build-battle/pack-models.mjs';
import { boxPromoRow, openBox, startingDeckRows } from '../setup/deck-builder/core/build-battle/pack-opening.mjs';
import {
  advanceUnboxing,
  boxArt,
  boxSkin,
  createUnboxing,
  hitTierFor,
  packSlotKind,
  parseUnboxing,
} from '../setup/deck-builder/core/build-battle/unboxing.mjs';
import { mountTabletopUnboxing } from '../initialization/document-event-listeners/sidebox/tabletop/tabletop-scene.js';
import { motionReduced } from '../setup/image-logic/mat-fx.mjs';

/**
 * The standalone unboxing test bench (design 073 § Standalone site, `/unboxing`): pick any of the
 * Build & Battle boxes, a box number (seed), the table, and open it on the tabletop — nothing
 * else of the app is loaded. Progress is saved per browser, so a reload resumes the opening.
 */

const STORAGE_KEY = 'ptcg-sim.unboxing-site.v1';
const PREFS_KEY = 'ptcg-sim.unboxing-site.prefs.v1';
const SURFACES = Object.freeze([
  { key: 'mat', label: 'Black rubber mat', surface: { kind: 'mat' } },
  {
    key: 'charizard',
    label: 'Mega Charizard X mat',
    surface: { kind: 'art', src: 'src/assets/playmats/custom/mega-charizard-x-edge-to-edge.png' },
  },
  {
    key: 'pastel',
    label: 'Pikachu & Eevee mat',
    surface: { kind: 'art', src: 'src/assets/playmats/board/1111-rubber-playmat-rr-pikachu-amp-eevee-1.webp' },
  },
]);

const root = document.getElementById('unboxingSite');
const params = new URLSearchParams(window.location.search);
// `?slowmo=10` plays every animation ten times slower, to study the motion.
const SLOWMO = Math.min(50, Math.max(1, Number(params.get('slowmo')) || 1));

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const readJson = (key) => {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeJson = (key, value) => {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full store: the bench still runs, without resume.
  }
};

const prefs = {
  surface: 'mat',
  quality: 'high',
  sound: true,
  era: getBuildBattleBox(DEFAULT_BOX_KEY).era,
  ...(readJson(PREFS_KEY) || {}),
};
if (params.get('quality') === 'low' || params.get('quality') === 'high') prefs.quality = params.get('quality');
if (SURFACES.some((entry) => entry.key === params.get('surface'))) prefs.surface = params.get('surface');
const savePrefs = () => writeJson(PREFS_KEY, prefs);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let selectedKey = getBuildBattleBox(params.get('box'))?.key || readJson(STORAGE_KEY)?.boxKey || DEFAULT_BOX_KEY;
let seedText = params.get('seed') ?? '';
let scene = null;
let openRun = 0;

/** @returns {{boxKey: string, seed: number, unboxing: object}|null} a well-formed saved opening. */
function savedOpening() {
  const saved = readJson(STORAGE_KEY);
  if (!saved || !getBuildBattleBox(saved.boxKey) || parseSeed(String(saved.seed)) === null) return null;
  const unboxing = parseUnboxing(saved.unboxing);
  return unboxing ? { boxKey: saved.boxKey, seed: Number(saved.seed), unboxing } : null;
}

// ── Picker ────────────────────────────────────────────────────────────────
function renderPicker(note = '') {
  closeScene();
  document.body.classList.remove('ub-opening');
  root.replaceChildren();
  const header = el('header', 'ub-header');
  const titles = el('div', 'ub-titles');
  titles.append(el('h1', 'ub-title', 'Build & Battle unboxing'), el('p', 'ub-sub', 'Pick a box, then open it on the table.'));
  const back = el('a', 'ub-link', 'Back to the simulator');
  back.href = './';
  header.append(titles, back);
  root.append(header);

  const resume = savedOpening();
  if (resume && resume.unboxing.stage !== 'done') {
    const box = getBuildBattleBox(resume.boxKey);
    const banner = el('div', 'ub-resume');
    banner.append(el('span', '', `${box.name} · Box #${resume.seed} is half open.`));
    const go = el('button', 'ub-btn ub-btn--primary', 'Resume');
    go.type = 'button';
    go.addEventListener('click', () => openSelected(resume.boxKey, resume.seed, { resume: true }));
    banner.append(go);
    root.append(banner);
  }

  const eras = el('div', 'ub-eras');
  eras.setAttribute('role', 'tablist');
  for (const era of BUILD_BATTLE_ERAS) {
    const chip = el('button', 'ub-era', BUILD_BATTLE_ERA_NAMES[era.key] || era.name);
    chip.type = 'button';
    chip.setAttribute('role', 'tab');
    chip.setAttribute('aria-selected', String(era.key === prefs.era));
    chip.addEventListener('click', () => {
      prefs.era = era.key;
      savePrefs();
      renderPicker();
    });
    eras.append(chip);
  }
  root.append(eras);

  const grid = el('div', 'ub-grid');
  for (const box of boxesForEra(prefs.era)) {
    const tile = el('button', 'ub-tile');
    tile.type = 'button';
    tile.setAttribute('aria-pressed', String(box.key === selectedKey));
    const render = boxArt(box)?.render;
    if (render) {
      const img = el('img', 'ub-tile__img');
      img.src = render.src;
      img.alt = '';
      img.loading = 'lazy';
      img.width = render.width;
      img.height = render.height;
      tile.append(img);
    }
    tile.append(el('span', 'ub-tile__name', box.shortName));
    tile.addEventListener('click', () => {
      selectedKey = box.key;
      renderPicker();
    });
    tile.addEventListener('dblclick', () => openSelected(box.key, null));
    grid.append(tile);
  }
  root.append(grid);

  const controls = el('div', 'ub-controls');
  const selected = getBuildBattleBox(selectedKey);
  controls.append(el('p', 'ub-chosen', selected ? selected.name : ''));
  const seedLabel = el('label', 'ub-field', 'Box #');
  const seedInput = el('input', 'ub-input');
  seedInput.type = 'text';
  seedInput.inputMode = 'numeric';
  seedInput.placeholder = 'random';
  seedInput.value = seedText;
  seedInput.addEventListener('input', () => {
    seedText = seedInput.value;
  });
  seedLabel.append(seedInput);
  const surfaceLabel = el('label', 'ub-field', 'Table');
  const surfaceSelect = el('select', 'ub-input');
  for (const entry of SURFACES) {
    const option = el('option', '', entry.label);
    option.value = entry.key;
    option.selected = entry.key === prefs.surface;
    surfaceSelect.append(option);
  }
  surfaceSelect.addEventListener('change', () => {
    prefs.surface = surfaceSelect.value;
    savePrefs();
  });
  surfaceLabel.append(surfaceSelect);
  const qualityLabel = el('label', 'ub-field', 'Quality');
  const qualitySelect = el('select', 'ub-input');
  for (const [value, label] of [
    ['high', 'High (shadows)'],
    ['low', 'Low (fast)'],
  ]) {
    const option = el('option', '', label);
    option.value = value;
    option.selected = value === prefs.quality;
    qualitySelect.append(option);
  }
  qualitySelect.addEventListener('change', () => {
    prefs.quality = qualitySelect.value;
    savePrefs();
  });
  qualityLabel.append(qualitySelect);
  const open = el('button', 'ub-btn ub-btn--primary', 'Open the box');
  open.type = 'button';
  open.addEventListener('click', () => openSelected(selectedKey, parseSeed(seedText.trim())));
  controls.append(seedLabel, surfaceLabel, qualityLabel, open);
  root.append(controls);
  if (note) root.append(el('p', 'ub-note', note));
  root.append(
    el(
      'p',
      'ub-fineprint',
      'Fan-made test bench. Product photos and card images belong to their owners; codes shown are never real.'
    )
  );
}

// ── Opening ───────────────────────────────────────────────────────────────
async function openSelected(boxKey, seedValue, { resume = false } = {}) {
  const box = getBuildBattleBox(boxKey);
  if (!box) return;
  const run = (openRun += 1);
  // "Open this box again" comes straight from the results: the last scene goes first.
  closeScene();
  root.replaceChildren(el('p', 'ub-boot', `Unpacking ${box.name}…`));
  let loaded;
  try {
    loaded = await loadBoxData(box.key);
  } catch {
    if (run === openRun) renderPicker(`Could not load ${box.name}. Check the connection and try again.`);
    return;
  }
  if (run !== openRun) return;
  const saved = savedOpening();
  const seed = seedValue ?? (resume && saved ? saved.seed : randomSeed());
  const keep = saved && saved.boxKey === box.key && saved.seed === seed;
  const state = {
    boxKey: box.key,
    seed,
    unboxing: keep ? saved.unboxing : createUnboxing({ packCount: box.packCount }),
  };
  const persist = () => writeJson(STORAGE_KEY, { v: 1, ...state });
  persist();
  selectedKey = box.key;
  seedText = String(seed);
  mountScene(box, loaded, state, persist);
}

function mountScene(box, loaded, state, persist) {
  const { setInfo, cards, data } = loaded;
  const opened = openBox({ box, data, cards, setInfo, rng: createRng(state.seed) });
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const packs = opened.packs.map((pack) => pack.map((id) => cardsById.get(id) || null));
  const packModel = resolvePackModel(box.packModelKey, cards, setInfo);
  const classOf = (card) => cardClass(card, box.era, setInfo);
  const promo = boxPromoRow({ box, data, deckKey: opened.deckKey });
  const deckRows = startingDeckRows({ box, data, opened });
  const look = {
    skin: boxSkin({ box, setInfo, cards, data }),
    labels: unboxingLabels(box, setInfo.name),
    seriesName: BUILD_BATTLE_ERA_NAMES[box.era],
    setName: setInfo.name,
    playLevel: showsPlayLevel(box),
  };
  document.body.classList.add('ub-opening');
  root.replaceChildren();
  const stageEl = el('section', 'ub-stage');
  stageEl.setAttribute('aria-label', `Opening ${box.name}`);
  const sceneRoot = el('div', 'bb-scene bb-scene--stage ub-scene');
  sceneRoot.id = 'bbUnboxing';
  sceneRoot.dataset.era = look.skin.palette;
  const live = el('div', 'db-live ub-live');
  live.append(sceneRoot);
  const exit = el('button', 'ub-btn ub-exit', 'Exit');
  exit.type = 'button';
  exit.addEventListener('click', () => renderPicker());
  stageEl.append(live, exit);
  root.append(stageEl);

  const dispatch = (event) => {
    const next = advanceUnboxing(state.unboxing, event);
    if (next === state.unboxing) return null;
    state.unboxing = next;
    persist();
    return next;
  };
  const onFinish = () => showResults({ box, packs, packModel, classOf, promo, deckRows, setName: setInfo.name, seed: state.seed });
  const common = {
    root: sceneRoot,
    getUnboxing: () => state.unboxing,
    dispatch,
    packs,
    packModel,
    classOf,
    look,
    seed: state.seed,
    promo,
    onFinish,
  };
  scene = mountTabletopUnboxing({
    ...common,
    box,
    deckRows,
    storage,
    quality: prefs.quality,
    surface: SURFACES.find((entry) => entry.key === prefs.surface)?.surface || SURFACES[0].surface,
    finishLabel: 'See what you pulled',
    timeScale: 1 / SLOWMO,
    // `?film` stops the scene clock for frame-by-frame capture (the tabletop api's `advance`).
    manualClock: params.has('film'),
    muted: () => !prefs.sound,
    volume: () => 0.85,
    // The app's own "reduce motion" switch, as the legacy flow honours it.
    instant: motionReduced,
    toggleSound: () => {
      prefs.sound = !prefs.sound;
      savePrefs();
    },
    // The game's DOM opening needs the whole app loaded; the bench says why it cannot run instead.
    fallback: () => {
      sceneRoot.append(
        el(
          'p',
          'ub-boot',
          'This test bench needs WebGL 2 with effects on. Turn on hardware acceleration or try another browser.'
        )
      );
      return null;
    },
  });
}

function closeScene() {
  scene?.unmount();
  scene = null;
}

// ── Results ───────────────────────────────────────────────────────────────
const TIER_LABELS = ['', 'Foil', 'Hit', 'Big hit'];

function showResults({ box, packs, packModel, classOf, promo, deckRows, setName, seed }) {
  document.querySelector('.ub-results')?.remove();
  const panel = el('section', 'ub-results');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'What you pulled');
  const head = el('div', 'ub-results__head');
  head.append(el('h2', 'ub-results__title', `${box.shortName} · Box #${seed}`));
  const close = el('button', 'ub-btn', 'Back to the table');
  close.type = 'button';
  close.addEventListener('click', () => panel.remove());
  head.append(close);
  panel.append(head);
  if (promo) {
    const row = el('div', 'ub-results__row');
    row.append(el('h3', 'ub-results__pack', 'Deck promo'), cardStrip([{ card: promo, tier: 1 }]));
    panel.append(row);
  }
  packs.forEach((pack, packIndex) => {
    const entries = pack.map((card, cardIndex) => {
      const slot = packSlotKind(packModel, cardIndex, card);
      return { card, tier: hitTierFor(card, slot, card ? classOf(card) : null), slot };
    });
    const row = el('div', 'ub-results__row');
    row.append(el('h3', 'ub-results__pack', `${setName} pack ${packIndex + 1}`), cardStrip(entries));
    panel.append(row);
  });
  const deckLine = deckRows.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
  if (deckLine) panel.append(el('p', 'ub-note', `Plus your ${deckLine}-card deck.`));
  const actions = el('div', 'ub-results__actions');
  const again = el('button', 'ub-btn', 'Open this box again');
  again.type = 'button';
  again.addEventListener('click', () => {
    writeJson(STORAGE_KEY, null);
    openSelected(box.key, seed);
  });
  const another = el('button', 'ub-btn ub-btn--primary', 'Open another box');
  another.type = 'button';
  another.addEventListener('click', () => {
    writeJson(STORAGE_KEY, null);
    seedText = '';
    renderPicker();
  });
  actions.append(again, another);
  panel.append(actions);
  document.querySelector('.ub-stage')?.append(panel);
}

function cardStrip(entries) {
  const strip = el('div', 'ub-strip');
  for (const { card, tier } of entries) {
    const figure = el('figure', `ub-card ub-card--t${tier || 0}`);
    const img = el('img', 'ub-card__img');
    img.loading = 'lazy';
    img.alt = card?.name || 'Card';
    img.src = card?.images?.small || card?.image || '';
    const caption = el('figcaption', 'ub-card__name', card?.name || 'Card');
    if (tier) caption.append(el('span', 'ub-card__tier', TIER_LABELS[Math.min(3, tier)]));
    figure.append(img, caption);
    strip.append(figure);
  }
  return strip;
}

// ── Boot ──────────────────────────────────────────────────────────────────
if (params.get('fresh') === '1') writeJson(STORAGE_KEY, null);
const deepLinkBox = getBuildBattleBox(params.get('box'));
if (deepLinkBox && params.has('seed')) {
  openSelected(deepLinkBox.key, parseSeed(params.get('seed') || ''), { resume: true });
} else {
  renderPicker();
}
