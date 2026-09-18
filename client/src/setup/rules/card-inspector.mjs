/**
 * @file Card inspector (design 013) — the DOM half.
 *
 * Double-clicking one of your own board Pokémon enlarges the card scan and overlays the
 * TCG Live readout on top of it: an HP pill over the printed HP slot, attack panels over the
 * printed attack text box, and three tiles over the printed weakness strip. Attached Energy
 * rides along as further carousel slides.
 *
 * The card scan is the background and stays visible. Every piece is opaque only where it
 * replaces print, and dimming uses `filter` rather than `opacity` so a panel never becomes
 * translucent enough for the print underneath to ghost back through (013 C1/C2).
 *
 * The chrome mounts in the main document, inside the carousel (`card-picker.js`) via its
 * `decorate` hook — the playmat boards are separate iframe documents that never load index.css,
 * and only the carousel can carry attached-Energy slides (013 C3/C5).
 */

import { getEnergyTokenSrcForType } from '../../actions/move-card-bundle/energy-token-assets.mjs';
import { ENERGY_SYMBOL_TO_TYPE } from '../../../../shared/engine/rules/energy-effects.mjs';
import { rulesState, ensureCardData, getStadium, abilityUsed } from '../../../../shared/engine/rules/rules-state.mjs';
import { resolveAttackContext } from '../../../../shared/engine/rules/resolve-attack-context.mjs';
import { attachedEnergiesFor, stadiumCardFor, abilityUsedFor } from './attack-preview-sources.mjs';
import { getZone } from '../zones/get-zone.js';
import { getAuthoritativeStadiumArray } from '../netcode/apply-view.js';
import { computeContentBox } from './attack-zone-geometry.js';
import { buildInspectorModel } from './card-inspector-model.mjs';
import { openCarouselViewer } from '../image-logic/card-picker.js';

// Events that can change what the inspector reports while it is open. Owned here because this
// module outlives attack-preview.js — slice 3 deletes that file and its copy of this list.
const REFRESH_EVENTS = [
  'rules-energy-attached',
  'rules-card-moved',
  'rules-damage-changed',
  'rules-status-changed',
  'action-processed',
  'rules-mode-changed',
];
const CLOSE_EVENTS = ['rules-turn-began', 'rules-session-reset'];

// Last-resort glyphs for a type the token art does not cover — the same "data we don't
// recognise" path attack-preview.js takes.
const TYPE_GLYPHS = {
  Colorless: '⚪',
  Fire: '🔥',
  Water: '💧',
  Grass: '🌿',
  Lightning: '⚡',
  Psychic: '🔮',
  Fighting: '🥊',
  Metal: '⚙️',
  Dark: '🌑',
  Dragon: '🐉',
  Fairy: '✨',
};

// Banner colour keyed to the attack's dominant cost type.
const BANNER = {
  Fire: '#c0392b',
  Water: '#2d7dd2',
  Grass: '#3f9b4f',
  Lightning: '#e0a51f',
  Psychic: '#9b59b6',
  Fighting: '#cf6a1c',
  Dark: '#4a4a5e',
  Metal: '#7f8792',
  Dragon: '#5b6ee1',
  Fairy: '#e07fa8',
  Colorless: '#8e8e93',
};
const BANNER_DEFAULT = '#8e8e93';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};

const orb = (type, className) => {
  const src = getEnergyTokenSrcForType(type);
  if (src) {
    const img = el('img', className);
    img.src = src;
    img.alt = String(type ?? '');
    img.title = String(type ?? '');
    img.draggable = false;
    return img;
  }
  return el(
    'span',
    `${className} ${className}--missing`,
    TYPE_GLYPHS[type] || String(type ?? '?')
  );
};

/**
 * Printed card text carries energy as curly glyphs ("Discard 2 {R} Energy"), resolved through
 * the exported ENERGY_SYMBOL_TO_TYPE rather than a copy of it (013 C7). That map is lowercase
 * and carries no dragon/fairy, so an unmatched glyph falls back to the letter rather than
 * rendering an empty circle.
 */
const textWithOrbs = (target, text, className) => {
  for (const part of String(text ?? '').split(/(\{[a-z]\})/gi)) {
    const match = /^\{([a-z])\}$/i.exec(part);
    if (!match) {
      if (part) target.appendChild(document.createTextNode(part));
      continue;
    }
    const named = ENERGY_SYMBOL_TO_TYPE[match[1].toLowerCase()];
    const type = named
      ? named[0].toUpperCase() + named.slice(1)
      : match[1].toUpperCase();
    target.appendChild(
      orb(TYPE_GLYPHS[type] ? type : match[1].toUpperCase(), className)
    );
  }
};

const attackEl = (attack) => {
  const section = el(
    'section',
    `ptcg-atk${attack.recede ? ' ptcg-atk--recede' : ''}`
  );
  section.style.setProperty(
    '--ptcg-banner',
    BANNER[attack.cost[0]] || BANNER_DEFAULT
  );

  const head = el('div', 'ptcg-atk__head');
  head.appendChild(el('span', 'ptcg-atk__name', attack.name));
  const right = el('span', 'ptcg-atk__right');
  for (const symbol of attack.cost)
    right.appendChild(orb(symbol, 'ptcg-orb ptcg-orb--cost'));
  if (attack.damageLabel != null) {
    right.appendChild(el('span', 'ptcg-atk__dmg', attack.damageLabel));
  }
  head.appendChild(right);
  section.appendChild(head);

  if (attack.text) {
    const body = el('p', 'ptcg-atk__text');
    textWithOrbs(body, attack.text, 'ptcg-orb ptcg-orb--inline');
    section.appendChild(body);
  }
  if (attack.reason) section.title = attack.reason;
  return section;
};

const valueTile = (label, render) => {
  const tile = el('div', 'ptcg-stat');
  tile.appendChild(el('span', 'ptcg-stat__k', label));
  const val = el('span', 'ptcg-stat__v');
  render(val);
  tile.appendChild(val);
  return tile;
};

const typeValueTile = (label, tv, suffix) =>
  valueTile(label, (val) => {
    if (tv?.type) {
      val.appendChild(orb(tv.type, 'ptcg-orb ptcg-orb--sm'));
      val.appendChild(el('span', 'ptcg-stat__n', suffix(tv.value)));
    } else {
      val.appendChild(el('span', 'ptcg-stat__n ptcg-stat__n--none', '—'));
    }
  });

const retreatTile = (symbols) =>
  valueTile('retreat', (val) => {
    if (symbols.length) {
      for (const symbol of symbols)
        val.appendChild(orb(symbol, 'ptcg-orb ptcg-orb--sm'));
    } else {
      val.appendChild(el('span', 'ptcg-stat__n ptcg-stat__n--none', '—'));
    }
  });

/**
 * The overlay pieces. `bandTopPct` is null when the card has no attacks (attackZoneBounds
 * returns null for a zero-attack layout), so the lower block is not drawn at all rather than
 * collapsed into a zero-height strip sitting on the print.
 */
const buildChrome = (model) => {
  const chrome = el('div', 'ptcg-chrome');

  const hp = el('div', 'ptcg-hp');
  hp.appendChild(el('span', 'ptcg-hp__num', model.hp));
  if (model.type) hp.appendChild(orb(model.type, 'ptcg-orb ptcg-hp__orb'));
  hp.title = model.damage
    ? `${model.hp} HP · ${model.damage} damage on it`
    : `${model.hp} HP`;
  chrome.appendChild(hp);

  if (model.attacks.length && model.bandTopPct != null) {
    const lower = el('div', 'ptcg-lower');
    lower.style.top = `${model.bandTopPct}%`;
    lower.style.bottom = `${model.footH}%`;

    const atks = el('div', 'ptcg-atks');
    for (const attack of model.attacks) atks.appendChild(attackEl(attack));
    lower.appendChild(atks);

    const stats = el('footer', 'ptcg-stats');
    stats.appendChild(
      typeValueTile('weakness', model.weakness, (v) => `x${v}`)
    );
    stats.appendChild(
      typeValueTile('resistance', model.resistance, (v) => `-${v}`)
    );
    stats.appendChild(retreatTile(model.retreat));
    lower.appendChild(stats);

    chrome.appendChild(lower);
  }

  if (model.damage > 0) chrome.appendChild(el('div', 'ptcg-dmg', model.damage));
  return chrome;
};

/**
 * The card image may letterbox inside its box (the plain, non-holo slide path uses
 * object-fit: contain), so percentages resolve against the rendered content box rather than
 * the slide box — the same correction design 008 R4 made for its zones.
 */
const contentBoxFor = (wrap) => {
  const rect = wrap.getBoundingClientRect();
  const fallback = { left: 0, top: 0, width: rect.width, height: rect.height };
  const img =
    wrap.querySelector('img.discard-pile-card') ||
    wrap.querySelector('img.ptcg-card');
  if (!img || !img.naturalWidth || !img.naturalHeight) return fallback;
  return (
    computeContentBox({
      boxWidth: rect.width,
      boxHeight: rect.height,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      fit: 'contain',
    }) || fallback
  );
};

const placeChrome = (chrome, wrap) => {
  const box = contentBoxFor(wrap);
  chrome.style.left = `${box.left}px`;
  chrome.style.top = `${box.top}px`;
  chrome.style.width = `${box.width}px`;
  chrome.style.height = `${box.height}px`;
  // Every piece sizes itself as a multiple of --u so the panel scales with the slide instead
  // of being tuned to one card width. 1% of the rendered card width.
  chrome.style.setProperty('--u', `${box.width / 100}px`);
};

// One inspector state per decorated slide, plus the boundary listeners that outlive any single
// slide. Subscribed on first open and released when the last state goes away, so importing this
// module costs no permanent document listeners.
const states = new Set();
let boundaryWired = false;

const teardownAll = () => {
  states.forEach((state) => {
    REFRESH_EVENTS.forEach((name) =>
      document.removeEventListener(name, state.refresh)
    );
  });
  states.clear();
  if (boundaryWired) {
    CLOSE_EVENTS.forEach((name) =>
      document.removeEventListener(name, teardownAll)
    );
    boundaryWired = false;
  }
};

const wireBoundary = () => {
  if (boundaryWired) return;
  CLOSE_EVENTS.forEach((name) => document.addEventListener(name, teardownAll));
  boundaryWired = true;
};

// The dim goes on the wrap rather than the chrome so the card and its pieces darken together,
// which is what "the window is dimmed" means. Only the card box dims — Retreat and Pass Turn
// stay legal at any energy count, so greying them would lie about the game state.
const applyDim = (wrap, model) => {
  wrap.classList.toggle('ptcg-inspector--locked', model.dimLevel === 'full');
};

/**
 * Rebuild the chrome in place. Runs on mount and on every REFRESH_EVENT, because using an
 * ability can attach Energy and make an unpayable attack payable while the inspector is open
 * (008 R12) — a stale dim would tell the player the opposite of the truth.
 */
const rerender = (state) => {
  if (!state.wrap.isConnected) return;
  const model = buildInspectorModel(state.card, state.context || state.getContext());
  const next = buildChrome(model);
  state.wrap.replaceChild(next, state.chrome);
  state.chrome = next;
  applyDim(state.wrap, model);
  placeChrome(next, state.wrap);
  applyActions(state, model);
};

/**
 * The `decorate` implementation for the carousel (see card-picker.js). Wraps the built slide
 * node in a positioned container and hangs the chrome off it, keeping `holoWrapper` inside the
 * returned node so slideWrapper() and the holo hover sync still resolve.
 */
export const decorateInspectorSlide = (
  built,
  card,
  getContext,
  actions = null
) => {
  const model = buildInspectorModel(card, getContext());
  // A non-Pokémon (or unresolved card) gets the bare scan: wrapping it would change the slide's
  // layout box for no benefit.
  if (model.kind === 'plain') return built.node;

  const wrap = el('div', 'ptcg-inspector');
  wrap.appendChild(built.node);
  const chrome = buildChrome(model);
  wrap.appendChild(chrome);

  const state = { card, wrap, chrome, getContext, actions, context: null };
  state.refresh = () => rerender(state);
  states.add(state);
  wireBoundary();
  applyDim(wrap, model);
  applyActions(state, model);
  hydrateContext(state);

  // Positioned after layout, once the image has its natural size and the slide its final box.
  requestAnimationFrame(() => {
    if (state.wrap.isConnected) placeChrome(state.chrome, state.wrap);
  });
  return wrap;
};

/**
 * Click a payable attack panel to fire it. Unpayable and spent panels stay inert, carrying the
 * engine's own reason as a tooltip — the same treatment design 008 D4 gave its zones.
 */
const applyActions = (state, model) => {
  const handlers = state.actions;
  const panels = [...state.wrap.querySelectorAll('.ptcg-atk')];
  panels.forEach((panel, index) => {
    panel.onclick = null;
    panel.classList.remove('ptcg-atk--usable');
    const attack = model.attacks[index];
    if (!handlers?.onAttack || !attack?.payable || attack.onceUsed) return;
    panel.classList.add('ptcg-atk--usable');
    panel.onclick = (event) => {
      event.stopPropagation();
      handlers.onAttack(index);
    };
  });
};

const energyTypesFor = (card) =>
  attachedEnergiesFor(card, [])
    .map((energy) => energy?.types?.[0] || null)
    .filter(Boolean);

/**
 * First paint only. The card stamp carries attached Energy and damage but not the Stadium cost
 * modifier or the once-per-turn flags, so it over-reports unpayable attacks.
 * `resolveLiveContext` replaces it as soon as the async data lands.
 */
const stampContextFor = (card) => ({
  energyTypes: energyTypesFor(card),
  attacker: card,
  damageCtx: {
    attackerDamage: Math.max(0, Math.round(Number(card?.damage) || 0) / 10),
  },
  rulesEnabled: true,
});

/**
 * The authoritative context the model needs, resolved through the same shared helper the engine
 * path uses so the panel cannot drift from it.
 *
 * `defender` is deliberately absent: this panel reports what an attack DOES, not what it would
 * deal to the current target. Applying the defender's weakness here would print 500 on a card
 * that says 250 and read as a bug.
 */
async function resolveLiveContext(card) {
  try {
    await ensureCardData(card);
  } catch {
    /* card data not resolved yet — fall back on whatever the stamp carries */
  }
  const attachedEnergyCards = attachedEnergiesFor(card, getZone('self', 'active').array);
  const stadiumCard = stadiumCardFor(getStadium(), getAuthoritativeStadiumArray());
  const { energyTypes, stadiumCostModifier, abilityUsedFlag, priorAttacks } =
    await resolveAttackContext({
      activeCard: card,
      attachedEnergyCards,
      ensureCardData,
      stadiumCard,
      abilityUsed: (c) =>
        abilityUsedFor(c, abilityUsed('self', c), rulesState.flags?.self?.abilitiesUsed),
    });

  return {
    energyTypes,
    stadiumCostModifier,
    abilityUsed: abilityUsedFlag,
    priorAttacks,
    attacker: card,
    damageCtx: {
      attackerDamage: Math.max(0, Math.round(Number(card?.damage) || 0) / 10),
      energyCount: energyTypes.length,
    },
    rulesEnabled: Boolean(rulesState.enabled),
  };
}

/**
 * Hydrate the context once the async data is in, then re-render in place. Guarded on the state
 * still being mounted — the player can close the inspector during the fetch (008 R12).
 */
const hydrateContext = (state) => {
  resolveLiveContext(state.card).then(
    (context) => {
      if (!state.wrap.isConnected) return;
      state.context = context;
      rerender(state);
    },
    () => {
      /* resolution failed — the stamp-derived first paint stays on screen */
    },
  );
};

/**
 * Open the inspector for one of your own board Pokémon.
 *
 * @param {object} options
 * @param {object} options.card a preview card — a server stamp or a legacy zone card
 * @param {object[]} [options.attachedSlides] further carousel slides, prepared by the caller.
 *   The caller owns this because turning a board token back into full card art is a playmat
 *   concern (attach-card.js swaps the img src and stashes the real art in a dataset key).
 *   Everything attached rides along — Energy and Tools — as it does today.
 * @param {() => object} [options.getContext] overrides the first-paint context; the authoritative
 *   one always arrives via `hydrateContext`, so this only changes what shows before then.
 * @param {(attackIndex: number) => void} [options.onAttack] fires a payable attack
 */
export function openCardInspector({
  card,
  attachedSlides = [],
  getContext = () => stampContextFor(card),
  onAttack = null,
} = {}) {
  if (!card?.image) return false;

  // Carousel slide N sits to the right of slide N+1, so the attached cards go BEFORE the main
  // card and initialIndex points at the main card's slot.
  const slides = [...attachedSlides, card];
  const mainIndex = slides.length - 1;

  const decorate = (built, slideCard, index) =>
    index === mainIndex
      ? decorateInspectorSlide(built, slideCard, getContext, { onAttack })
      : built.node;

  openCarouselViewer({
    title: card.name || 'Card',
    candidates: slides,
    initialIndex: mainIndex,
    decorate,
  });
  return true;
}

export const closeCardInspector = teardownAll;
export const isCardInspectorOpen = () => states.size > 0;
