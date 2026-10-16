/**
 * @file Status popup (design 074) — TCG Live's MatchModalPopup carrying a StatusEffectModalOption.
 *
 * The focus HUD's Buff and Debuff buttons both open it (AttackOverlayHUD.ShowAllStatusesInPopup):
 * one window titled "Status Effects", Positive Effects on the left and Negative Effects on the right,
 * one CardDescriptionModalOption entry per effect, and a single bottom button. The blocker behind the
 * window closes it (BlockerState.CLOSE). While it is up, the focus view's own backdrop click is off,
 * as the game toggles the overlay's close hitbox. Entries come from attack-ui-model's statusEffectsFor.
 */

const CLOSE_EVENTS = ['rules-turn-began', 'rules-session-reset'];
const ARROW_SRC = {
  positive: '/src/assets/attack-ui/arrow-up.png',
  negative: '/src/assets/attack-ui/arrow-down.png',
};

/** @type {null | { root: HTMLElement, onClose: (() => void) | null }} */
let popupState = null;

export const isStatusPopupOpen = () => popupState !== null;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};

const arrow = (polarity, className) => {
  const img = el('img', className);
  img.src = ARROW_SRC[polarity];
  img.alt = '';
  img.draggable = false;
  return img;
};

// CardDescriptionModalOption: the source card's art when there is one, its name, the effect text and
// the polarity arrow.
const entryEl = (entry, polarity) => {
  const node = el('li', `tcgl-status__entry tcgl-status__entry--${polarity}`);
  if (entry.src) {
    const thumb = el('img', 'tcgl-status__thumb');
    thumb.src = entry.src;
    thumb.alt = '';
    thumb.draggable = false;
    node.appendChild(thumb);
  }
  const body = el('div', 'tcgl-status__body');
  body.appendChild(el('span', 'tcgl-status__title', entry.title));
  if (entry.text) body.appendChild(el('p', 'tcgl-status__text', entry.text));
  node.appendChild(body);
  node.appendChild(arrow(polarity, 'tcgl-status__arrow'));
  return node;
};

const column = (polarity, label, entries) => {
  const region = el('section', `tcgl-status__column tcgl-status__column--${polarity}`);
  const header = el('header', 'tcgl-status__header');
  header.appendChild(arrow(polarity, 'tcgl-status__header-icon'));
  header.appendChild(el('span', 'tcgl-status__header-text', label));
  region.appendChild(header);
  const list = el('ul', 'tcgl-status__list');
  for (const entry of entries) list.appendChild(entryEl(entry, polarity));
  region.appendChild(list);
  return region;
};

const closeImmediately = () => closeStatusPopup();

/**
 * Open the popup. Returns false (and opens nothing) when one is already up or there are no effects
 * at all — the HUD buttons are not interactable then, so this is only a guard.
 *
 * @param {object} options
 * @param {{title: string, text: string, src?: string}[]} [options.positive]
 * @param {{title: string, text: string, src?: string}[]} [options.negative]
 * @param {string} [options.title]
 * @param {() => void} [options.onClose] runs once when the popup goes away
 */
export function openStatusPopup({
  positive = [],
  negative = [],
  title = 'Status Effects',
  onClose = null,
} = {}) {
  if (popupState) return false;
  if (positive.length === 0 && negative.length === 0) return false;

  const root = el('div', 'tcgl-modal');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', title);
  const blocker = el('div', 'tcgl-modal__blocker');
  const win = el('div', 'tcgl-modal__window');
  const header = el('header', 'tcgl-modal__header');
  header.appendChild(el('h2', 'tcgl-modal__title', title));
  win.appendChild(header);

  const content = el('div', 'tcgl-modal__content tcgl-status');
  content.appendChild(column('positive', 'Positive Effects', positive));
  content.appendChild(column('negative', 'Negative Effects', negative));
  win.appendChild(content);

  const footer = el('footer', 'tcgl-modal__footer');
  const close = el('button', 'tcgl-modal__button', 'Close');
  close.type = 'button';
  footer.appendChild(close);
  win.appendChild(footer);
  root.append(blocker, win);

  // Clicks stop here: the focus view under the popup must not see them.
  root.addEventListener('click', (event) => event.stopPropagation());
  blocker.addEventListener('click', closeImmediately);
  close.addEventListener('click', closeImmediately);

  popupState = { root, onClose };
  CLOSE_EVENTS.forEach((name) => document.addEventListener(name, closeImmediately));
  document.body.appendChild(root);
  close.focus?.({ preventScroll: true });
  return true;
}

/** Close the popup if it is open. Idempotent. */
export function closeStatusPopup() {
  const state = popupState;
  if (!state) return;
  popupState = null;
  CLOSE_EVENTS.forEach((name) => document.removeEventListener(name, closeImmediately));
  state.root.remove();
  state.onClose?.();
}
