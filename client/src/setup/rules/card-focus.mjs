/**
 * @file Card focus (design 067) — the TCG Live Active-card popup, the DOM half.
 *
 * Clicking your own Active lifts the card in perspective from its slot to a fixed pose, dims the
 * board, drops the hand, and opens the 013 inspector's attack/ability/Retreat panels on the card.
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
  tiltFromPointer,
} from './card-focus-geometry.mjs';

const HAND_LOWERED_CLASS = 'hand-lowered';
const CLOSE_EVENTS = ['rules-turn-began', 'rules-session-reset'];
// Clicks on the backdrop and on the card's panels are ignored for this long after the view opens, so
// the second click of a double-click cannot close it or fire an attack: the Active's slot sits under
// the landed card, and `event.detail` cannot tell (the two clicks land in different frames, so the
// browser reports a click count of 1 for each). 500 ms is the usual OS double-click interval; it
// outlasts the flight (250 ms) and the list reveal (300 ms).
const CLICK_GUARD_MS = 500;
const DECODE_CAP_MS = 1500;
const TILT_MAX_DEG = 6;
const TILT_EASE_PER_FRAME = 0.18;
const TILT_REST_DEG = 0.02;
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

const applyHostRect = (host, rect) => {
  Object.assign(host.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
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

const hudButton = (className, label, text, onClick) => {
  const button = el('button', className);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = text;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
};

/** Rigid pointer tilt: eases the tilt element toward the cursor and back to rest on leave. */
const wireTilt = (state) => {
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let raf = null;

  const frame = () => {
    current.x += (target.x - current.x) * TILT_EASE_PER_FRAME;
    current.y += (target.y - current.y) * TILT_EASE_PER_FRAME;
    state.tiltEl.style.setProperty('--focus-tilt-x', `${current.x.toFixed(3)}deg`);
    state.tiltEl.style.setProperty('--focus-tilt-y', `${current.y.toFixed(3)}deg`);
    const settled =
      Math.abs(target.x - current.x) < TILT_REST_DEG &&
      Math.abs(target.y - current.y) < TILT_REST_DEG;
    raf = settled ? null : requestAnimationFrame(frame);
  };
  const kick = () => {
    if (raf == null) raf = requestAnimationFrame(frame);
  };
  const onMove = (event) => {
    const { rotateX, rotateY } = tiltFromPointer(
      state.host.getBoundingClientRect(),
      event.clientX,
      event.clientY,
      TILT_MAX_DEG
    );
    target.x = rotateX;
    target.y = rotateY;
    kick();
  };
  const onLeave = () => {
    target.x = 0;
    target.y = 0;
    kick();
  };
  state.host.addEventListener('pointermove', onMove, { passive: true });
  state.host.addEventListener('pointerleave', onLeave, { passive: true });
  return () => {
    state.host.removeEventListener('pointermove', onMove);
    state.host.removeEventListener('pointerleave', onLeave);
    if (raf != null) cancelAnimationFrame(raf);
  };
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

const buildHud = ({ attachedCount, onClose, onStack }) => {
  const hud = el('div', 'card-focus__hud');
  hud.appendChild(hudButton('card-focus__close', 'Close', '✕', onClose));
  if (attachedCount > 0 && onStack) {
    hud.appendChild(
      hudButton('card-focus__stack', 'Attached cards', String(attachedCount), onStack)
    );
  }
  return hud;
};

const onResize = () => {
  const state = focusState;
  if (!state || state.closing) return;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const rect = focusRect(viewport);
  if (!(rect.width > 0)) return;
  state.to = rect;
  state.stage.style.perspective = `${perspectiveFor(viewport.height)}px`;
  applyHostRect(state.host, rect);
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
 * @param {number} [options.attachedCount] shows the Stack button when > 0
 * @param {(index: number) => void} [options.onAttack] caller closes the focus, then fires
 * @param {() => void} [options.onAbility] defaults to the inspector's ability dispatch
 * @param {() => void} [options.onRetreat] caller closes the focus, then retreats
 * @param {() => void} [options.onOpenStack] opens the attached-cards carousel
 */
export function openCardFocus({
  card,
  zone = 'active',
  attachedCount = 0,
  onAttack = null,
  onAbility,
  onRetreat = null,
  onOpenStack = null,
} = {}) {
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
    const backdrop = el('div', 'card-focus__backdrop');
    state.stage = el('div', 'card-focus__stage');
    state.stage.style.perspective = `${perspectiveFor(viewport.height)}px`;
    state.host = el('div', 'card-focus__card');
    applyHostRect(state.host, to);
    // Hidden until the flight starts, so the card never shows at its resting pose first.
    state.host.style.visibility = 'hidden';
    state.inspectorWrap = content;
    state.tiltEl = el('div', 'card-focus__tilt');
    state.tiltEl.appendChild(content);
    state.host.appendChild(state.tiltEl);
    state.stage.appendChild(state.host);

    const hud = buildHud({
      attachedCount,
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
      if (isArmed(state)) closeCardFocus();
    });
    backdrop.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (isArmed(state)) closeCardFocus();
    });

    document.body.appendChild(state.root);
    lowerHand(state);
    hideSource(state);
    state.cleanups = [
      wireTilt(state),
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
