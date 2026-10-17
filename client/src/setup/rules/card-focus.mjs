/**
 * @file Card focus (design 067) — the TCG Live Active-card popup, the DOM half.
 *
 * Clicking your own Active lifts the card in perspective from its slot to a fixed pose, covers the
 * board (TableCoverPanel), drops the hand, and opens the inspector's TCG Live option rows on the card.
 * The HUD is AttackOverlayHUD's (design 074): Buff / Debuff (the status popup), Stack, Close.
 * Pose, timings and curves are TCG Live's own (card-focus-geometry.mjs). The card is a
 * `buildSlideContent` holo wrapper decorated by the inspector, so payability, affordances and
 * live re-rendering are the inspector's, unchanged.
 *
 * The stage is a CSS perspective container (FOV 20°, as the game's camera). The card is never
 * faded or filtered: opacity or a filter would flatten its preserve-3d tilt (013 C2).
 */

import { uiCue } from '../netcode/mat-fx/ui-cue.mjs';
import { selfContainerDocument } from '../../state.js';
import { buildSlideContent } from '../image-logic/card-picker.js';
import { viewportRectOf } from '../image-logic/card-pop.mjs';
import {
  energyTypeKeyFor,
  getEnergyTokenSrcForType,
} from '../../actions/move-card-bundle/energy-token-assets.mjs';
import { DEFAULT_TILT_DEG } from '../sizing/table-tilt.mjs';
import {
  MAT_HOLO_OPTIONS,
  startHoloAnimation,
  stopHoloAnimation,
} from '../deck-builder/core/holo.mjs';
import {
  buildInspectorCard,
  releaseInspectorCard,
} from './card-inspector.mjs';
import {
  COLLAPSED_FRACTION,
  COLLAPSE_EASE,
  EXPAND_EASE,
  FLIGHT_EASE,
  FLIGHT_MS,
  collapseDurationMs,
  expandDurationMs,
  flightTransform,
  focusRect,
  perspectiveFor,
} from './card-focus-geometry.mjs';
import { suppressHoverPreview } from '../image-logic/hover-preview-bus.mjs';
import { closeStatusPopup, openStatusPopup } from './status-popup.mjs';

const HAND_LOWERED_CLASS = 'hand-lowered';
const CLOSE_EVENTS = ['rules-turn-began', 'rules-session-reset'];
// Clicks on the backdrop and on the card's panels are ignored for this long after the view opens, so
// the second click of a double-click cannot close it or fire an attack: the Active's slot sits under
// the landed card, and `event.detail` cannot tell (the two clicks land in different frames, so the
// browser reports a click count of 1 for each). 500 ms is the usual OS double-click interval; it
// outlasts the flight (250 ms) and the list reveal (300 ms).
const CLICK_GUARD_MS = 500;
const DECODE_CAP_MS = 1500;
// A picker opened by an ability must not sit under this popup (z-index 2400 > the picker's 410).
const PICKER_SELECTOR = '#cardPickerOverlay, .mat-pick-banner';
const LIFT_SHADOW_FROM = '0 0.6vh 1.2vh rgba(0, 0, 0, 0.4)';
const LIFT_SHADOW_TO = '0 3.2vh 6.4vh rgba(0, 0, 0, 0.62)';
const REVEAL_START = `${COLLAPSED_FRACTION * 100}%`;
const REVEAL_END = '100%';
const REVEALING_CLASS = 'card-focus__card--revealing';

/** @type {null | object} */
let focusState = null;

export const isCardFocusOpen = () => focusState !== null;

const el = (tag, className) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

const transformString = ({ translateX, translateY, scale, rotateX }) =>
  `translate(${translateX}px, ${translateY}px) scale(${scale}) rotateX(${rotateX}deg)`;

const decodeWithin = (root, capMs) => {
  const img = root.querySelector('img');
  if (!img || typeof img.decode !== 'function') return Promise.resolve();
  return Promise.race([
    img.decode().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, capMs)),
  ]);
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// The card's pose in px, on the host and on the root: the HUD and the Energy row position themselves
// from the root's copy (card-focus.css), so they follow a resize with no JS layout of their own.
const applyPose = (state, rect) => {
  Object.assign(state.host.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  state.root.style.setProperty('--focus-left', `${rect.left}px`);
  state.root.style.setProperty('--focus-top', `${rect.top}px`);
  state.root.style.setProperty('--focus-w', `${rect.width}px`);
  state.root.style.setProperty('--focus-h', `${rect.height}px`);
};

const lowerHand = (state) => {
  const doc = selfContainerDocument?.documentElement ?? null;
  if (!doc) return;
  doc.classList.add(HAND_LOWERED_CLASS);
  state.handDoc = doc;
};

const raiseHand = (state) => state.handDoc?.classList.remove(HAND_LOWERED_CLASS);

const hideSource = (state) => {
  const target = state.sourceImg.closest?.('.mat-holo') ?? state.sourceImg;
  state.hidden = { target, visibility: target.style.visibility };
  target.style.visibility = 'hidden';
};

const restoreSource = (state) => {
  if (!state.hidden) return;
  state.hidden.target.style.visibility = state.hidden.visibility;
  state.hidden = null;
};

// One HUD button: shadow, the raised face and its icon (card-focus.css draws the sprites).
const hudButton = (className, label, onClick, { enabled = true, filled = false } = {}) => {
  const button = el('button', `card-focus__btn ${className}`);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = !enabled;
  const face = el('span', 'card-focus__btn-face');
  face.appendChild(el('span', 'card-focus__btn-icon'));
  if (filled) face.appendChild(el('span', 'card-focus__btn-fill'));
  button.appendChild(face);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!button.disabled) onClick();
  });
  return button;
};

const startOpenAnimations = (state, from, to) => {
  const { host, root } = state;
  host.style.visibility = '';
  root.classList.add('card-focus--open');
  // A source with no box (hidden, collapsed) has nowhere to fly from: grow in place instead.
  const fromStart =
    from.width > 0 && from.height > 0
      ? transformString(flightTransform(from, to, { tiltDeg: DEFAULT_TILT_DEG }))
      : 'scale(0.85)';
  state.flight = host.animate(
    [
      { transform: fromStart, boxShadow: LIFT_SHADOW_FROM },
      { transform: 'none', boxShadow: LIFT_SHADOW_TO },
    ],
    { duration: FLIGHT_MS, easing: FLIGHT_EASE, fill: 'both' }
  );
  host.classList.add(REVEALING_CLASS);
  state.reveal = host.animate(
    { '--focus-reveal': [REVEAL_START, REVEAL_END] },
    {
      duration: expandDurationMs(COLLAPSED_FRACTION, 1),
      easing: EXPAND_EASE,
      fill: 'both',
    }
  );
  state.reveal.finished
    .then(() => {
      if (focusState === state && !state.closing) host.classList.remove(REVEALING_CLASS);
    })
    .catch(() => {});
  state.opened = true;
};

/**
 * AttackOverlayHUD: Buff and Debuff (both ShowAllStatusesInPopup; each interactable, and its coloured
 * arrow lit, only while the card has such effects), then Stack, then Close at the bottom.
 */
const buildHud = ({ statuses, onStatus, onClose, onStack }) => {
  const hud = el('div', 'card-focus__hud');
  if (statuses) {
    const hasBuffs = statuses.positive.length > 0;
    const hasDebuffs = statuses.negative.length > 0;
    hud.appendChild(
      hudButton('card-focus__btn--buff', 'Positive effects', onStatus, {
        enabled: hasBuffs,
        filled: hasBuffs,
      })
    );
    hud.appendChild(
      hudButton('card-focus__btn--debuff', 'Negative effects', onStatus, {
        enabled: hasDebuffs,
        filled: hasDebuffs,
      })
    );
  }
  if (onStack) hud.appendChild(hudButton('card-focus__stack', 'Stack view', onStack));
  hud.appendChild(hudButton('card-focus__close', 'Close', onClose));
  return hud;
};

const buildCover = () => {
  const backdrop = el('div', 'card-focus__backdrop');
  for (const part of ['top', 'middle', 'bottom']) {
    backdrop.appendChild(el('div', `card-focus__cover card-focus__cover--${part}`));
  }
  return backdrop;
};

// The attached Energy as big tokens under the card, like the game draws it. Anything that is not an
// Energy with a token (a Tool, a Special Energy with no type) stays reachable behind the Stack button.
const isEnergyCard = (attached) =>
  attached?.type === 'Energy' || /energy/i.test(String(attached?.name ?? ''));

const buildEnergyRow = (card) => {
  const row = el('div', 'card-focus__energies');
  for (const attached of card.attachedCards || []) {
    if (!isEnergyCard(attached)) continue;
    const key = energyTypeKeyFor({
      types: attached.types ?? (attached.energyType ? [attached.energyType] : undefined),
      name: attached.name,
    });
    const src = key ? getEnergyTokenSrcForType(key) : null;
    if (!src) continue;
    const img = el('img', 'card-focus__energy');
    img.src = src;
    img.alt = String(attached.name ?? 'Energy');
    img.draggable = false;
    row.appendChild(img);
  }
  return row.childElementCount > 0 ? row : null;
};

const onResize = () => {
  const state = focusState;
  if (!state || state.closing) return;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const rect = focusRect(viewport);
  if (!(rect.width > 0)) return;
  state.to = rect;
  state.stage.style.perspective = `${perspectiveFor(viewport.height)}px`;
  applyPose(state, rect);
};

const watchForPickers = () => {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && node.matches?.(PICKER_SELECTOR)) {
          closeCardFocus({ immediate: true });
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true });
  return () => observer.disconnect();
};

/**
 * Open the focus view for one of your own Active Pokémon. Returns false (and changes nothing)
 * when it is already open, the card has no element to fly from, or the build fails — the caller
 * then keeps its old behaviour.
 *
 * @param {object} options
 * @param {object} options.card a preview card with `.image`
 * @param {'active'|'bench'} [options.zone]
 * @param {{ positive: object[], negative: object[] }|null} [options.statuses] the card's effects
 *   (attack-ui-model statusEffectsFor); null hides the Buff / Debuff buttons
 * @param {(index: number) => void} [options.onAttack] caller closes the focus, then fires
 * @param {() => void} [options.onAbility] defaults to the inspector's ability dispatch
 * @param {() => void} [options.onRetreat] caller closes the focus, then retreats
 * @param {() => void} [options.onOpenStack] opens the stack view; null hides the Stack button
 */
export function openCardFocus({
  card,
  zone = 'active',
  statuses = null,
  onAttack = null,
  onAbility,
  onRetreat = null,
  onOpenStack = null,
} = {}) {
  suppressHoverPreview('modal');
  if (focusState) return false;
  const sourceImg = card?.image;
  if (!sourceImg?.isConnected) return false;

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const to = focusRect(viewport);
  if (!(to.width > 0)) return false;
  const from = viewportRectOf(sourceImg);

  const state = {
    card,
    sourceImg,
    to,
    closing: false,
    opened: false,
    openedAt: performance.now(),
  };
  focusState = state;

  try {
    const built = buildSlideContent(card);
    state.holoWrapper = built.holoWrapper;
    const content = buildInspectorCard({
      built,
      card,
      zone,
      onAttack,
      ...(onAbility ? { onAbility } : {}),
      onRetreat,
    });

    state.root = el('div', 'card-focus');
    const backdrop = buildCover();
    state.stage = el('div', 'card-focus__stage');
    state.stage.style.perspective = `${perspectiveFor(viewport.height)}px`;
    state.host = el('div', 'card-focus__card');
    applyPose(state, to);
    // Hidden until the flight starts, so the card never shows at its resting pose first.
    state.host.style.visibility = 'hidden';
    state.inspectorWrap = content;
    state.tiltEl = el('div', 'card-focus__tilt');
    state.tiltEl.appendChild(content);
    const energies = buildEnergyRow(card);
    if (energies) state.tiltEl.appendChild(energies);
    state.host.appendChild(state.tiltEl);
    state.stage.appendChild(state.host);

    const hud = buildHud({
      statuses,
      // The overlay stays up under the popup; its backdrop click is off until the popup closes
      // (AttackOverlay.ToggleBackgroundHitbox).
      onStatus: () => {
        if (!statuses) return;
        state.popupOpen = openStatusPopup({
          ...statuses,
          onClose: () => {
            state.popupOpen = false;
          },
        });
      },
      onClose: () => closeCardFocus(),
      onStack: onOpenStack
        ? () => {
            closeCardFocus({ immediate: true });
            onOpenStack();
          }
        : null,
    });
    state.root.append(backdrop, state.stage, hud);

    // Capture phase, before the inspector's delegated click handler on the card: panels only see
    // clicks once the guard window has passed.
    state.host.addEventListener(
      'click',
      (event) => {
        if (isArmed(state)) return;
        event.stopPropagation();
        event.preventDefault();
      },
      true
    );

    backdrop.addEventListener('click', (event) => {
      event.stopPropagation();
      if (isArmed(state) && !state.popupOpen) closeCardFocus();
    });
    backdrop.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (isArmed(state) && !state.popupOpen) closeCardFocus();
    });

    document.body.appendChild(state.root);
    lowerHand(state);
    hideSource(state);
    state.cleanups = [
      watchForPickers(),
    ];
    window.addEventListener('resize', onResize);
    CLOSE_EVENTS.forEach((name) =>
      document.addEventListener(name, closeImmediately)
    );
    if (state.holoWrapper) startHoloAnimation(state.holoWrapper, MAT_HOLO_OPTIONS);
    uiCue('big-card-in');
  } catch (error) {
    console.error('card focus failed to open', error);
    teardown(state);
    return false;
  }

  start(state, from);
  return true;
}

const closeImmediately = () => closeCardFocus({ immediate: true });

const isArmed = (state) => performance.now() - state.openedAt >= CLICK_GUARD_MS;

// Runs after the card is mounted: wait for the art and for the inspector's first chrome
// placement (its own rAF), so the chrome is sized on the unscaled box before the flight scales it.
const start = async (state, from) => {
  try {
    await decodeWithin(state.root, DECODE_CAP_MS);
    await nextFrame();
    if (focusState !== state || state.closing) return;
    startOpenAnimations(state, from, state.to);
  } catch (error) {
    console.error('card focus failed to start', error);
    closeCardFocus({ immediate: true });
  }
};

const teardown = (state) => {
  if (state.popupOpen) closeStatusPopup();
  releaseInspectorCard(state.inspectorWrap);
  state.cleanups?.forEach((cleanup) => cleanup());
  state.cleanups = null;
  window.removeEventListener('resize', onResize);
  CLOSE_EVENTS.forEach((name) =>
    document.removeEventListener(name, closeImmediately)
  );
  raiseHand(state);
  if (state.holoWrapper) stopHoloAnimation(state.holoWrapper);
  restoreSource(state);
  state.root?.remove();
  if (focusState === state) focusState = null;
};

const sourceIsReachable = (state) => {
  if (!state.sourceImg.isConnected) return false;
  const rect = viewportRectOf(state.sourceImg);
  return rect.width > 0 && rect.height > 0;
};

/**
 * Close the focus view. By default the list collapses, the card flies back to its slot and the
 * hand rises; `immediate` skips all of it (an attack or retreat fires at the slot, a picker or a
 * turn change must not wait). Idempotent.
 *
 * @param {{ immediate?: boolean }} [options]
 */
export function closeCardFocus({ immediate = false } = {}) {
  const state = focusState;
  if (!state || state.closing) return;
  state.closing = true;
  uiCue('big-card-out');
  if (state.popupOpen) closeStatusPopup();

  if (immediate || !state.opened) {
    teardown(state);
    return;
  }

  // Everything but the visuals stops now: no more inspector refreshes, tilt, or backdrop clicks.
  releaseInspectorCard(state.inspectorWrap);
  state.cleanups?.forEach((cleanup) => cleanup());
  state.cleanups = null;
  raiseHand(state);
  state.root.classList.add('card-focus--closing');
  state.host.classList.add(REVEALING_CLASS);

  const animations = [];
  // Closed mid-way: play what is running backward from where it is, rather than restarting it.
  if (state.reveal.playState === 'running') {
    state.reveal.reverse();
    animations.push(state.reveal);
  } else {
    state.reveal.cancel();
    animations.push(
      state.host.animate(
        { '--focus-reveal': [REVEAL_END, REVEAL_START] },
        {
          duration: collapseDurationMs(1, COLLAPSED_FRACTION),
          easing: COLLAPSE_EASE,
          fill: 'forwards',
        }
      )
    );
  }

  const rect = sourceIsReachable(state) ? viewportRectOf(state.sourceImg) : null;
  if (rect && state.flight.playState === 'running') {
    state.flight.reverse();
    animations.push(state.flight);
  } else {
    state.flight.cancel();
    const back = rect
      ? transformString(flightTransform(rect, state.to, { tiltDeg: DEFAULT_TILT_DEG }))
      : 'scale(0.85)';
    animations.push(
      state.host.animate(
        [
          { transform: 'none', boxShadow: LIFT_SHADOW_TO },
          { transform: back, boxShadow: LIFT_SHADOW_FROM },
        ],
        {
          duration: rect ? FLIGHT_MS : collapseDurationMs(1, COLLAPSED_FRACTION),
          easing: rect ? FLIGHT_EASE : COLLAPSE_EASE,
          fill: 'forwards',
        }
      )
    );
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    teardown(state);
  };
  Promise.all(animations.map((animation) => animation.finished)).then(finish, finish);
  // Backstop: a cancelled or throttled animation must not leave the popup on screen.
  setTimeout(finish, FLIGHT_MS + 200);
}
