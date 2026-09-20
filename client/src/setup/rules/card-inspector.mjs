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
import {
  isStadiumCard,
  stadiumExtraAttacksFromZone,
} from '../../../../shared/engine/rules/stadium-effects.mjs';
import {
  rulesState,
  ensureCardData,
  getStadium,
  abilityUsed,
} from '../../../../shared/engine/rules/rules-state.mjs';
import { resolveAttackContext } from '../../../../shared/engine/rules/resolve-attack-context.mjs';
import {
  attachedEnergiesFor,
  stadiumCardFor,
  abilityUsedFor,
} from './attack-preview-sources.mjs';
import {
  isAuthoritativeDispatchActive,
  dispatchAuthoritativeUseAbility,
} from '../netcode/authoritative-dispatch.js';
import { getZone } from '../zones/get-zone.js';
import { getAuthoritativeStadiumArray } from '../netcode/apply-view.js';
import { runAbilitySteps } from './rules-bridge.js';
import { computeContentBox } from './attack-zone-geometry.js';
import { buildInspectorModel } from './card-inspector-model.mjs';
import {
  openCarouselViewer,
  closeCarouselViewer,
} from '../image-logic/card-picker.js';
import { orderAttachedForCarousel } from '../image-logic/carousel-order.mjs';

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

// The ability banner is deliberately not the Pokémon's type colour: on the card the ability
// name prints beside a red "Ability" badge that is the same on every card, and keying it to
// type would make an ability panel look like an attack panel of a different cost.
const ABILITY_BANNER = '#a52834';

// A Stadium prints no type, so its panel uses one fixed slate banner regardless of card.
const STADIUM_BANNER = '#5a6070';

const stadiumEl = (model) => {
  const section = el(
    'section',
    `ptcg-stadium${model.recede ? ' ptcg-stadium--recede' : ''}`
  );
  section.dataset.ptcgStadium = '1';
  section.style.setProperty('--ptcg-banner', STADIUM_BANNER);

  const head = el('div', 'ptcg-atk__head');
  head.appendChild(el('span', 'ptcg-atk__badge', 'Stadium'));
  head.appendChild(el('span', 'ptcg-atk__name', model.name));
  if (model.actionable) {
    head.appendChild(
      el('span', 'ptcg-atk__use', model.usable ? 'Use' : 'Unusable')
    );
  }
  section.appendChild(head);

  if (model.text) {
    const body = el('p', 'ptcg-atk__text');
    textWithOrbs(body, model.text, 'ptcg-orb ptcg-orb--inline');
    section.appendChild(body);
  }
  // `reason` explains a receded panel; `applyAffordances` gates the click off `usable` alone,
  // so the tooltip is the only place the "why not" surfaces.
  if (model.reason) section.title = model.reason;
  return section;
};

const abilityEl = (ability) => {
  const section = el(
    'section',
    `ptcg-ability${ability.recede ? ' ptcg-ability--recede' : ''}`
  );
  section.style.setProperty('--ptcg-banner', ABILITY_BANNER);

  const head = el('div', 'ptcg-atk__head');
  head.appendChild(el('span', 'ptcg-atk__badge', 'Ability'));
  head.appendChild(el('span', 'ptcg-atk__name', ability.name));
  section.appendChild(head);

  if (ability.text) {
    const body = el('p', 'ptcg-atk__text');
    textWithOrbs(body, ability.text, 'ptcg-orb ptcg-orb--inline');
    section.appendChild(body);
  }
  if (ability.reason) section.title = ability.reason;
  return section;
};

const attackEl = (attack) => {
  const section = el(
    'section',
    `ptcg-atk${attack.recede ? ' ptcg-atk--recede' : ''}`
  );
  // The delegated click handler resolves which attack was hit from this, so the panel stays
  // addressable across re-renders that replace the whole chrome subtree.
  section.dataset.ptcgAttack = String(attack.index);
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
 * The overlay pieces.
 *
 * The stack is anchored at `blockTopPct` (the ability band when the card has an ability, since
 * that text prints above the attacks) and sized by its own content — it no longer stretches to
 * the stat band, because a one-attack card used to leave a foot of empty white where the print
 * should show through. The stat band is positioned separately on the printed weakness strip.
 *
 * `blockTopPct` is null when there is nothing to lay out (no attacks and no ability), in which
 * case no stack is drawn at all.
 */
const buildChrome = (model) => {
  const chrome = el('div', 'ptcg-chrome');

  // A Stadium has no HP row, attack panels or stat strip — just its effect text, laid out as a
  // content-sized panel anchored over the printed effect box.
  if (model.kind === 'stadium') {
    const stack = el('div', 'ptcg-stack');
    stack.style.top = `${model.blockTopPct}%`;
    stack.appendChild(stadiumEl(model));
    chrome.appendChild(stack);
    return chrome;
  }

  const hp = el('div', 'ptcg-hp');
  hp.appendChild(el('span', 'ptcg-hp__num', model.hp));
  if (model.type) hp.appendChild(orb(model.type, 'ptcg-orb ptcg-hp__orb'));
  hp.title = model.damage
    ? `${model.hp} HP · ${model.damage} damage on it`
    : `${model.hp} HP`;
  chrome.appendChild(hp);

  if (model.blockTopPct != null) {
    const stack = el('div', 'ptcg-stack');
    stack.style.top = `${model.blockTopPct}%`;
    if (model.ability) stack.appendChild(abilityEl(model.ability));
    const atks = el('div', 'ptcg-atks');
    for (const attack of model.attacks) atks.appendChild(attackEl(attack));
    stack.appendChild(atks);
    chrome.appendChild(stack);
  }

  const stats = el('footer', 'ptcg-stats');
  stats.style.bottom = `${model.footH}%`;
  stats.appendChild(typeValueTile('weakness', model.weakness, (v) => `x${v}`));
  stats.appendChild(
    typeValueTile('resistance', model.resistance, (v) => `-${v}`)
  );
  stats.appendChild(retreatTile(model.retreat));
  chrome.appendChild(stats);

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
  const model = buildInspectorModel(
    state.card,
    state.context || state.getContext()
  );
  const next = buildChrome(model);
  state.wrap.replaceChild(next, state.chrome);
  state.chrome = next;
  // The delegated handler reads state.model, so refreshing it here is what keeps a click after
  // a refresh event firing against current payability rather than the paint it opened with.
  state.model = model;
  applyDim(state.wrap, model);
  placeChrome(next, state.wrap);
  applyAffordances(state, model);
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

  const state = {
    card,
    wrap,
    chrome,
    getContext,
    actions,
    context: null,
    model,
  };
  state.refresh = () => rerender(state);
  states.add(state);
  wireBoundary();
  applyDim(wrap, model);
  applyAffordances(state, model);
  wirePanelClicks(state);
  hydrateContext(state);

  // Positioned after layout, once the image has its natural size and the slide its final box.
  requestAnimationFrame(() => {
    if (state.wrap.isConnected) placeChrome(state.chrome, state.wrap);
  });
  return wrap;
};

/**
 * Paint the affordances — which panels look clickable. The click itself is delegated from the
 * wrap (see `wirePanelClicks`), so a re-render that replaces the whole chrome subtree cannot
 * silently drop a handler.
 */
const applyAffordances = (state, model) => {
  const handlers = state.actions;

  state.wrap
    .querySelector('.ptcg-stadium')
    ?.classList.toggle(
      'ptcg-stadium--usable',
      Boolean(handlers?.onUse) && Boolean(model.usable)
    );

  state.wrap
    .querySelector('.ptcg-ability')
    ?.classList.toggle(
      'ptcg-ability--usable',
      Boolean(handlers?.onAbility) && Boolean(model.ability?.usable)
    );

  state.wrap.querySelectorAll('.ptcg-atk').forEach((panel) => {
    const attack = model.attacks[Number(panel.dataset.ptcgAttack)];
    panel.classList.toggle(
      'ptcg-atk--usable',
      Boolean(handlers?.onAttack) && Boolean(attack?.usable)
    );
  });
};

/**
 * One delegated listener for the whole slide. `usable` already folds in payability,
 * once-per-turn, rules-off and "a benched Pokémon cannot attack" — the model is the only place
 * that decision is made, so nothing is re-derived here.
 */
const wirePanelClicks = (state) => {
  state.wrap.addEventListener('click', (event) => {
    const stadiumPanel = event.target.closest?.('.ptcg-stadium[data-ptcg-stadium]');
    if (stadiumPanel) {
      if (!state.model.usable) return;
      event.stopPropagation();
      state.actions?.onUse?.();
      return;
    }
    const attackPanel = event.target.closest?.('.ptcg-atk[data-ptcg-attack]');
    if (attackPanel) {
      const attack =
        state.model.attacks[Number(attackPanel.dataset.ptcgAttack)];
      if (!attack?.usable) return;
      event.stopPropagation();
      state.actions?.onAttack?.(attack.index);
      return;
    }
    if (event.target.closest?.('.ptcg-ability')) {
      if (!state.model.ability?.usable) return;
      event.stopPropagation();
      state.actions?.onAbility?.();
    }
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
const stampContextFor = (card, zone = 'active') => ({
  energyTypes: energyTypesFor(card),
  attacker: card,
  zone,
  damageCtx: {
    attackerDamage: Math.max(0, Math.round(Number(card?.damage) || 0) / 10),
  },
  rulesEnabled: true,
});

/**
 * The context a Stadium panel needs: the live per-player flags the pure model reads. Unlike a
 * Pokémon this resolves nothing async, so `getContext` is authoritative from first paint and the
 * model stays current across REFRESH_EVENT re-renders.
 */
export const stadiumContextFor = ({
  rulesEnabled = false,
  yourTurn = false,
  usedThisTurn = false,
  flags = {},
} = {}) => ({
  rulesEnabled: Boolean(rulesEnabled),
  yourTurn: Boolean(yourTurn),
  stadiumUsed: Boolean(usedThisTurn),
  flags: flags || {},
});

/**
 * The authoritative context the model needs, resolved through the same shared helper the engine
 * path uses so the panel cannot drift from it.
 *
 * `defender` is deliberately absent: this panel reports what an attack DOES, not what it would
 * deal to the current target. Applying the defender's weakness here would print 500 on a card
 * that says 250 and read as a bug.
 */
async function resolveLiveContext(card, zone = 'active') {
  try {
    await ensureCardData(card);
  } catch {
    /* card data not resolved yet — fall back on whatever the stamp carries */
  }
  const zoneId = zone === 'bench' ? 'bench' : 'active';
  const zoneCards = getZone('self', zoneId).array;
  const attachedEnergyCards = attachedEnergiesFor(card, zoneCards);
  const stadiumCard = stadiumCardFor(
    getStadium(),
    getAuthoritativeStadiumArray()
  );
  // Stadium-granted / inherited attacks (Shrine of Memories, Meteor Falls,
  // Holon Lake, Rocket's Tricky Gym) rendered alongside the printed ones. The
  // same merge order is used by the server, so an `attackIndex` picked here
  // resolves to the same attack there.
  const extraAttacks = stadiumExtraAttacksFromZone(stadiumCard, {
    zoneCards,
    card,
    isActive: zoneId === 'active',
  });
  const {
    energyTypes,
    stadiumCostModifier,
    abilityUsedFlag,
    priorAttacks,
    extraAttacks: resolvedExtra,
  } = await resolveAttackContext({
    activeCard: card,
    attachedEnergyCards,
    ensureCardData,
    stadiumCard,
    extraAttacks,
    abilityUsed: (c) =>
      abilityUsedFor(
        c,
        abilityUsed('self', c),
        rulesState.flags?.self?.abilitiesUsed
      ),
  });

  return {
    energyTypes,
    stadiumCostModifier,
    abilityUsed: abilityUsedFlag,
    priorAttacks,
    extraAttacks: resolvedExtra,
    attacker: card,
    zone,
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
  // A Stadium has nothing async to resolve — its context is the live rules flags, which
  // `getContext` re-reads on every REFRESH_EVENT, so the panel stays accurate while open.
  if (isStadiumCard(state.card)) return;
  resolveLiveContext(state.card, state.getContext().zone).then(
    (context) => {
      if (!state.wrap.isConnected) return;
      state.context = context;
      rerender(state);
    },
    () => {
      /* resolution failed — the stamp-derived first paint stays on screen */
    }
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
 * @param {() => void} [options.onAbility] uses the card's ability
 * @param {'active'|'bench'} [options.zone] where the card sits, for the ability dispatch
 */
export function openCardInspector({
  card,
  attachedSlides = [],
  zone = 'active',
  getContext = () => stampContextFor(card, zone),
  onAttack = null,
  onAbility = () => useAbility(card, zone),
  onUse = null,
} = {}) {
  if (!card?.image) return false;

  // Carousel slide N sits to the right of slide N+1, so the attached cards go BEFORE the main
  // card and initialIndex points at the main card's slot.
  const slides = [...orderAttachedForCarousel(attachedSlides), card];
  const mainIndex = slides.length - 1;

  const decorate = (built, slideCard, index) =>
    index === mainIndex
      ? decorateInspectorSlide(built, slideCard, getContext, {
          onAttack,
          onAbility,
          onUse,
        })
      : built.node;

  openCarouselViewer({
    title: card.name || 'Card',
    candidates: slides,
    initialIndex: mainIndex,
    decorate,
  });
  return true;
}

/**
 * Use the card's ability — the dispatch design 008's ability zone used, unchanged. Under server
 * authority the SERVER runs it (and asks for any picks through a pendingChoice); the local step
 * runner would mutate legacy zone arrays the server never sees.
 *
 * Unlike an attack this does not end the turn, so the inspector stays open and re-renders on the
 * resulting board event — a once-per-turn ability flips to spent, and one that attached Energy
 * can make a previously unpayable attack payable.
 */
const useAbility = (card, zone) => {
  // `dispatchAuthoritativeUseAbility` fails OPEN by contract: a false return means "this action
  // was not dispatched", and the gated call site must then run its legacy body (see
  // emitAuthoritativeCommand in authoritative-dispatch.js). Returning regardless discarded every
  // refused dispatch — no command sent, no chat line, nothing on the board, which is
  // indistinguishable from a dead click.
  if (
    card?.instanceId != null &&
    isAuthoritativeDispatchActive() &&
    dispatchAuthoritativeUseAbility({
      user: 'self',
      emit: true,
      oInitiator: 'opp',
      zoneId: zone,
      index: 0,
      authoritativeId: card.instanceId,
    })
  ) {
    return;
  }
  runAbilitySteps('self', card);
};

export const closeCardInspector = () => {
  teardownAll();
  // Tearing down the state alone leaves the carousel open, and a modal over the board is exactly
  // how a dispatched attack looks like it never happened. The attack path closes before it fires;
  // the ability path does not close at all, since using an ability does not end the turn.
  closeCarouselViewer(null, true);
};
export const isCardInspectorOpen = () => states.size > 0;
