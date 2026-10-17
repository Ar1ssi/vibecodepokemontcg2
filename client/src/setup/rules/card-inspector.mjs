/**
 * @file Card inspector (designs 013, 067, 074) — the DOM half.
 *
 * Decorates a card slide with its TCG Live readout and keeps it live: a Pokémon gets the
 * AttackOverlay chrome (HP pill, the option rows from attack-options.mjs, the Weakness / Resistance /
 * Retreat bar) that the card-focus view mounts; the in-play Stadium gets its effect panel over the
 * printed box, in the carousel. The 013 print-band panels for Pokémon are retired (design 074 A11).
 *
 * The card scan is the background and stays visible, and dimming uses `filter` rather than
 * `opacity` so a panel never becomes translucent enough for the print underneath to ghost back
 * through (013 C1/C2). The chrome mounts in the main document — the playmat boards are separate
 * iframe documents that never load index.css (013 C5).
 */

import { uiCue } from '../netcode/mat-fx/ui-cue.mjs';
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
import { specialEnergyBoard } from '../../../../shared/engine/rules/special-energy-parse.mjs';
import {
  attachedEnergiesFor,
  stampEnergyTypes,
  stadiumCardFor,
  abilityUsedFor,
} from './attack-preview-sources.mjs';
import {
  isAuthoritativeDispatchActive,
  dispatchAuthoritativeUseAbility,
} from '../netcode/authoritative-dispatch.js';
import { getZone } from '../zones/get-zone.js';
import {
  getAuthoritativeStadiumArray,
  getAuthoritativeAttackExtras,
  getAuthoritativeOncePerGame,
} from '../netcode/apply-view.js';
import { runAbilitySteps } from './rules-bridge.js';
import { computeContentBox } from './attack-zone-geometry.js';
import { buildInspectorModel } from './card-inspector-model.mjs';
import { damagePreviewAgainst } from './attack-ui-model.mjs';
import { liveZoneArray } from '../zones/live-zone-array.js';
import {
  buildAbilityOption,
  buildAttackOption,
  buildWeakResistBar,
} from './attack-options.mjs';
import {
  openCarouselViewer,
  closeCarouselViewer,
} from '../image-logic/card-picker.js';
import { orderAttachedForCarousel } from '../image-logic/carousel-order.mjs';
import { suppressHoverPreview } from '../image-logic/hover-preview-bus.mjs';

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

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};

// Short effect text is set larger so a one-line block fills its panel instead of leaving a
// band of empty white; long text keeps the base size so it still fits the printed box.
const SHORT_TEXT_MAX_CHARS = 90;
const textBody = (text) =>
  el(
    'p',
    String(text).length <= SHORT_TEXT_MAX_CHARS
      ? 'ptcg-atk__text ptcg-atk__text--short'
      : 'ptcg-atk__text'
  );

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

// A Stadium prints no type, so its panel uses one fixed green banner regardless of card.
const STADIUM_BANNER = '#2e8b57';

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
    const body = textBody(model.text);
    textWithOrbs(body, model.text, 'ptcg-orb ptcg-orb--inline');
    section.appendChild(body);
  }
  // `reason` explains a receded panel; `applyAffordances` gates the click off `usable` alone,
  // so the tooltip is the only place the "why not" surfaces.
  if (model.reason) section.title = model.reason;
  return section;
};

/**
 * The overlay pieces. A Pokémon gets the TCG Live overlay chrome (`buildFocusChrome`, design 074 —
 * the 013 print-band panels are retired). A Stadium keeps its own panel: its effect text laid out
 * as a content-sized panel anchored over the printed effect box.
 */
const buildChrome = (model) => {
  if (model.kind !== 'stadium') return buildFocusChrome(model);
  const chrome = el('div', 'ptcg-chrome');
  chrome.dataset.finish = model.finish ?? 'plain';
  chrome.style.setProperty('--ptcg-inset-left', `${model.sideInsetLeftPct ?? 0}%`);
  chrome.style.setProperty('--ptcg-inset-right', `${model.sideInsetRightPct ?? 0}%`);
  const stack = el('div', 'ptcg-stack');
  stack.style.top = `${model.blockTopPct}%`;
  const panel = stadiumEl(model);
  if (model.blockHeightPct != null) {
    // min-height, not height: text longer than the printed box grows the panel, never clips.
    stack.style.minHeight = `${model.blockHeightPct}%`;
    panel.style.flexGrow = '1';
  }
  stack.appendChild(panel);
  chrome.appendChild(stack);
  return chrome;
};

/**
 * The chrome for the card-focus view (design 067), laid out as TCG Live's attack overlay is rather
 * than over the printed bands: the list is anchored to the bottom of the card, a little wider than
 * it, with the Weakness / Resistance / Retreat bar beneath. The rows are the game's option prefabs
 * (attack-options.mjs, design 074); geometry is in card-focus.css, the rows' skin in attack-options.css.
 */
const buildFocusChrome = (model) => {
  const chrome = el('div', 'ptcg-chrome ptcg-chrome--focus');
  chrome.dataset.finish = model.finish ?? 'plain';

  const hp = el('div', 'ptcg-hp');
  hp.appendChild(el('span', 'ptcg-hp__num', model.hp));
  if (model.type) hp.appendChild(orb(model.type, 'ptcg-orb ptcg-hp__orb'));
  hp.title = model.damage
    ? `${model.hp} HP · ${model.damage} damage on it`
    : `${model.hp} HP`;
  chrome.appendChild(hp);

  // The frame is the game's ExpandingRegion: it holds the scrolling list and carries the cap sprite
  // over its top edge, which the list's own overflow clip would cut off.
  const frame = el('div', 'ptcg-frame ptcg-frame--focus');
  const stack = el('div', 'ptcg-stack ptcg-stack--focus');
  if (model.ability) stack.appendChild(buildAbilityOption(model.ability, model.type));
  const options = el('div', 'tcgl-opts');
  if (!model.bench) {
    model.attacks.forEach((attack) => options.appendChild(buildAttackOption(attack, model.type)));
  }
  stack.appendChild(options);
  frame.appendChild(stack);
  chrome.appendChild(frame);
  chrome.appendChild(buildWeakResistBar(model));

  if (model.damage > 0) chrome.appendChild(el('div', 'ptcg-dmg', model.damage));
  return chrome;
};

/**
 * The card image may letterbox inside its box (the plain, non-holo slide path uses
 * object-fit: contain), so percentages resolve against the rendered content box rather than
 * the slide box — the same correction design 008 R4 made for its zones.
 */
const contentBoxFor = (wrap) => {
  // Layout size, not getBoundingClientRect(): the rect includes transforms, and the chrome is a
  // child of `wrap`, so a scaled ancestor (the card-focus flight, design 067) would be applied twice.
  const rect = { width: wrap.offsetWidth, height: wrap.offsetHeight };
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

const detachState = (state) => {
  REFRESH_EVENTS.forEach((name) =>
    document.removeEventListener(name, state.refresh)
  );
  state.observer?.disconnect();
};

const unwireBoundaryIfIdle = () => {
  if (boundaryWired && states.size === 0) {
    CLOSE_EVENTS.forEach((name) =>
      document.removeEventListener(name, teardownAll)
    );
    boundaryWired = false;
  }
};

const teardownAll = () => {
  states.forEach(detachState);
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
  placeChrome(next, state.wrap);
  applyAffordances(state, model);
};

/**
 * The `decorate` implementation for the carousel (see card-picker.js). Wraps the built slide
 * node in a positioned container and hangs the chrome off it, keeping `holoWrapper` inside the
 * returned node so slideWrapper() and the holo hover sync still resolve.
 */
export const decorateInspectorSlide = (built, card, getContext, actions = null) => {
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
  // The chrome is sized from the slide's layout box, so a resize (window, or the focus card's
  // viewport-derived size) must re-place it.
  if (typeof ResizeObserver !== 'undefined') {
    state.observer = new ResizeObserver(() => {
      if (!state.wrap.isConnected) {
        state.observer.disconnect();
        return;
      }
      placeChrome(state.chrome, state.wrap);
    });
    state.observer.observe(wrap);
  }
  states.add(state);
  wireBoundary();
  applyAffordances(state, model);
  wirePanelClicks(state);
  hydrateContext(state);

  // Positioned after layout, once the image has its natural size and the slide its final box.
  requestAnimationFrame(() => {
    if (state.wrap.isConnected) placeChrome(state.chrome, state.wrap);
  });
  return wrap;
};

// Each panel's own "usable" modifier: its block class with `--usable` (ptcg-atk, tcgl-opt, …).
const usableClass = (panel) => `${panel.classList[0]}--usable`;

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

  const abilityPanel = state.wrap.querySelector('[data-ptcg-ability]');
  abilityPanel?.classList.toggle(
    usableClass(abilityPanel),
    Boolean(handlers?.onAbility) && Boolean(model.ability?.usable)
  );

  state.wrap.querySelectorAll('[data-ptcg-attack]').forEach((panel) => {
    const attack = model.attacks[Number(panel.dataset.ptcgAttack)];
    panel.classList.toggle(
      usableClass(panel),
      Boolean(handlers?.onAttack) && Boolean(attack?.usable)
    );
  });

  const retreatPanel = state.wrap.querySelector('[data-ptcg-retreat]');
  retreatPanel?.classList.toggle(
    usableClass(retreatPanel),
    Boolean(handlers?.onRetreat) && Boolean(model.retreatUsable)
  );
};

/**
 * One delegated listener for the whole slide. `usable` already folds in payability,
 * once-per-turn, rules-off and "a benched Pokémon cannot attack" — the model is the only place
 * that decision is made, so nothing is re-derived here.
 */
const ACTION_PANEL_SELECTOR =
  '[data-ptcg-stadium], [data-ptcg-attack], [data-ptcg-ability], [data-ptcg-retreat]';

const wirePanelClicks = (state) => {
  // A press and release that land on different children (cursor drift, hover repaint) make the
  // browser dispatch the click on their common ancestor, where `closest` finds no panel. Fall back
  // to the panel the press started on.
  let pressedTarget = null;
  state.wrap.addEventListener(
    'pointerdown',
    (event) => {
      pressedTarget = event.target;
    },
    true
  );
  state.wrap.addEventListener('click', (rawEvent) => {
    const event = {
      target: rawEvent.target.closest?.(ACTION_PANEL_SELECTOR)
        ? rawEvent.target
        : pressedTarget?.closest?.(ACTION_PANEL_SELECTOR)
          ? pressedTarget
          : rawEvent.target,
      stopPropagation: () => rawEvent.stopPropagation(),
    };
    pressedTarget = null;
    const stadiumPanel = event.target.closest?.('[data-ptcg-stadium]');
    if (stadiumPanel) {
      if (!state.model.usable) return;
      event.stopPropagation();
      state.actions?.onUse?.();
      return;
    }
    const attackPanel = event.target.closest?.('[data-ptcg-attack]');
    if (attackPanel) {
      const attack =
        state.model.attacks[Number(attackPanel.dataset.ptcgAttack)];
      if (!attack?.usable) return;
      uiCue('attack-button');
      event.stopPropagation();
      state.actions?.onAttack?.(attack.index);
      return;
    }
    if (event.target.closest?.('[data-ptcg-ability]')) {
      if (!state.model.ability?.usable) return;
      event.stopPropagation();
      state.actions?.onAbility?.();
      return;
    }
    const retreatPanel = event.target.closest?.('[data-ptcg-retreat]');
    if (retreatPanel) {
      if (!state.model.retreatUsable) return;
      event.stopPropagation();
      state.actions?.onRetreat?.();
    }
  });
};

/**
 * First paint only. The card stamp carries attached Energy and damage but not the Stadium cost
 * modifier or the once-per-turn flags, so it over-reports unpayable attacks.
 * `resolveLiveContext` replaces it as soon as the async data lands.
 */
// The Active zone and the Bench the retreat gate reads, so a Benched team ability (Latias ex
// Skyliner) frees the Active's retreat in the panel exactly as it does for the Retreat button.
const retreatBoardContext = () => ({
  zoneCards: getZone('self', 'active').array,
  benchCards: getZone('self', 'bench').array,
});

const stampContextFor = (card, zone = 'active') => ({
  energyTypes: stampEnergyTypes(card),
  attacker: card,
  zone,
  ...retreatBoardContext(),
  damageCtx: {
    attackerDamage: Math.max(0, Math.round(Number(card?.damage) || 0) / 10),
  },
  rulesEnabled: true,
});

/**
 * The stack view's info panel (design 074): the same model, read-only — the game's deep inspection
 * lists the card's entries but acts on none of them. `energyTypes` feeds the Attached Energy row.
 *
 * @param {object} card a preview card
 * @param {'active'|'bench'} [zone]
 * @returns {{ model: object, energyTypes: Array }}
 */
export const stackViewModelFor = (card, zone = 'active') => {
  const context = { ...stampContextFor(card, zone), readOnly: true };
  return { model: buildInspectorModel(card, context), energyTypes: context.energyTypes };
};

/**
 * BenchController.CanShowActionSelection for one of your Benched Pokémon: whether it has anything
 * usable from the Bench — an Ability, since a Benched Pokémon cannot attack (design 074 A1).
 *
 * @param {object} card a preview card
 * @returns {boolean}
 */
export const benchHasUsableAction = (card) => {
  const context = {
    ...stampContextFor(card, 'bench'),
    rulesEnabled: Boolean(rulesState.enabled),
    abilityUsed: abilityUsedFor(card, abilityUsed('self', card), rulesState.flags?.self?.abilitiesUsed),
  };
  return Boolean(buildInspectorModel(card, context).ability?.usable);
};

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

// The damage tab reads the outcome against the opponent's Active, Weakness and Resistance included,
// as TCG Live's AttackOption.SetAttackDamageValue does (design 074 A6) — tinted, so a Weakness hit
// is told apart from the printed number. A benched Pokémon cannot attack, so it gets none.
const damagePreviewFor = async (card, zoneId, stadiumCard) => {
  if (zoneId !== 'active') return null;
  const defenderZone = liveZoneArray('opp', 'active');
  // The Defending Pokémon's Weakness / Resistance come from its card data.
  await Promise.all(defenderZone.map((c) => ensureCardData(c).catch(() => {})));
  return damagePreviewAgainst({
    attacker: card,
    attackerZone: liveZoneArray('self', 'active'),
    defenderZone,
    stadium: stadiumCard,
    turnNumber: rulesState.turnNumber,
  });
};

/**
 * The authoritative context the model needs, resolved through the same shared helper the engine
 * path uses so the panel cannot drift from it.
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
  // Attacks beyond the printed ones, in the server's `attackIndex` order. Under server
  // authority the view lists them all (Stadium, Tool, Memory Helix and other borrowed or
  // granted attacks; design 049). Without that list, fall back to the Stadium-granted ones
  // (Shrine of Memories, Meteor Falls, Holon Lake, Rocket's Tricky Gym), merged in the same
  // order the server uses.
  const extraAttacks =
    getAuthoritativeAttackExtras(card?.instanceId) ??
    stadiumExtraAttacksFromZone(stadiumCard, {
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
    board: specialEnergyBoard({
      ownPrizes: getZone('self', 'prizes').getCount(),
      opponentPrizes: getZone('opp', 'prizes').getCount(),
      inPlayPokemon: ['active', 'bench'].flatMap((id) =>
        getZone('self', id).array.filter((c) => c?.type === 'Pokémon')
      ),
    }),
    abilityUsed: (c) =>
      abilityUsedFor(
        c,
        abilityUsed('self', c),
        rulesState.flags?.self?.abilitiesUsed
      ),
  });

  const damagePreview = await damagePreviewFor(card, zoneId, stadiumCard).catch(() => null);

  return {
    energyTypes,
    stadiumCostModifier,
    damagePreview,
    abilityUsed: abilityUsedFlag,
    priorAttacks,
    extraAttacks: resolvedExtra,
    oncePerGame: getAuthoritativeOncePerGame(),
    attacker: card,
    zone,
    ...retreatBoardContext(),
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
 * Open the carousel inspector — today only the in-play Stadium routes here (design 018); a
 * Pokémon opens the card-focus overlay instead (design 074).
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
 * @param {() => void} [options.onRetreat] retreats the Active Spot Pokémon (clicking the
 *   retreat tile); the caller closes the inspector before dispatching, as the attack path does
 * @param {'active'|'bench'} [options.zone] where the card sits, for the ability dispatch
 */
export function openCardInspector({
  card,
  attachedSlides = [],
  zone = 'active',
  getContext = () => stampContextFor(card, zone),
  onAttack = null,
  onAbility = () => useAbility(card, zone),
  onRetreat = null,
  onUse = null,
} = {}) {
  suppressHoverPreview('modal');
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
          onRetreat,
          onUse,
        })
      : built.node;

  openCarouselViewer({
    title: card.name || 'Card',
    candidates: slides,
    initialIndex: mainIndex,
    decorate,
  });
  uiCue('big-card-in');
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

/**
 * Decorate a built slide for the card-focus view (design 067): the same chrome, affordances and
 * live-context hydration the carousel inspector uses, without opening the carousel.
 *
 * @param {{ node: Node, holoWrapper: Node|null }} options.built result of buildSlideContent
 */
export const buildInspectorCard = ({
  built,
  card,
  zone = 'active',
  getContext = () => stampContextFor(card, zone),
  onAttack = null,
  onAbility = () => useAbility(card, zone),
  onRetreat = null,
}) =>
  decorateInspectorSlide(
    built,
    card,
    getContext,
    { onAttack, onAbility, onRetreat, onUse: null }
  );

/**
 * Drop the refresh listener and resize observer of ONE card built by buildInspectorCard, leaving
 * any other mounted inspector (a carousel's) alone. A no-op for a card with no state.
 */
export const releaseInspectorCard = (wrap) => {
  for (const state of states) {
    if (state.wrap !== wrap) continue;
    detachState(state);
    states.delete(state);
  }
  unwireBoundaryIfIdle();
};

export const closeCardInspector = () => {
  if (states.size > 0) uiCue('big-card-out');
  teardownAll();
  // Tearing down the state alone leaves the carousel open, and a modal over the board is exactly
  // how a dispatched attack looks like it never happened. The attack path closes before it fires;
  // the ability path does not close at all, since using an ability does not end the turn.
  closeCarouselViewer(null, true);
};
export const isCardInspectorOpen = () => states.size > 0;
