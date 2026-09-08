/**
 * @file Authoritative client DOM renderer for server-authoritative netcode (Slice 7).
 * Reconciles browser DOM directly from authoritative redacted GameState views.
 * Enforces Invariants 1, 4, 5 and Edge Cases 6, 8, 11, 12, 18.
 */

import { diffViews } from './view-diff.mjs';
import { clearInFlightAffordances, emitResolveChoice } from './cmd-emitter.js';

let lastRenderedVersion = -1;
const cardRegistry = new Map(); // instanceId -> { instanceId, element, card, side, zone, container }

let defaultNetcodeContext = {
  socket: null,
  roomId: null,
  systemState: null,
};

const PLAY_ZONES = ['active', 'bench'];

/**
 * Returns the highest stateVersion successfully applied by the renderer.
 *
 * @returns {number}
 */
export function getLastRenderedVersion() {
  return lastRenderedVersion;
}

/**
 * Sets default socket and roomId context for choice resolution.
 *
 * @param {object} [ctx={}]
 * @param {object} [ctx.socket]
 * @param {string|Function} [ctx.roomId]
 * @param {object} [ctx.systemState]
 */
export function setDefaultNetcodeContext(ctx = {}) {
  if (ctx.socket !== undefined) defaultNetcodeContext.socket = ctx.socket;
  if (ctx.roomId !== undefined) defaultNetcodeContext.roomId = ctx.roomId;
  if (ctx.systemState !== undefined) defaultNetcodeContext.systemState = ctx.systemState;
}

/**
 * Returns default netcode context.
 *
 * @returns {{ socket: any, roomId: string|null, systemState: any }}
 */
export function getDefaultNetcodeContext() {
  return {
    socket: defaultNetcodeContext.socket,
    roomId:
      typeof defaultNetcodeContext.roomId === 'function'
        ? defaultNetcodeContext.roomId()
        : defaultNetcodeContext.roomId || defaultNetcodeContext.systemState?.roomId || null,
    systemState: defaultNetcodeContext.systemState,
  };
}

/**
 * Resets renderer state and clears cached registries (used for room teardown or test suites).
 */
export function resetRenderState() {
  lastRenderedVersion = -1;
  cardRegistry.clear();
  clearInFlightAffordances();
  defaultNetcodeContext = {
    socket: null,
    roomId: null,
    systemState: null,
  };
}

/**
 * Returns the live registry of tracked cards.
 *
 * @returns {Map<number, object>}
 */
export function getCardRegistry() {
  return cardRegistry;
}

/**
 * Resolves the DOM document and zone container for a player side ('you' | 'them').
 *
 * @param {string} side 'you' | 'them'
 * @param {string} zoneId Zone name
 * @param {object} [options] Injected overrides for headless tests
 * @returns {{ element: HTMLElement|null, array: object[] }}
 */
function resolveZone(side, zoneId, options = {}) {
  if (typeof options.getZone === 'function') {
    return options.getZone(side, zoneId);
  }

  // Fallback to client getZone module if available
  try {
    const user = side === 'you' ? 'self' : 'opp';
    if (typeof window !== 'undefined' && window.__getZone) {
      return window.__getZone(user, zoneId);
    }
  } catch {
    // Ignore
  }

  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { element: null, array: [] };

  const element = doc.getElementById ? doc.getElementById(zoneId) : null;
  return { element, array: [] };
}

/**
 * Creates or updates an image element for a card representation.
 *
 * @param {object} cardData Pure card data from view
 * @param {string} side 'you' | 'them'
 * @param {string} zoneId Zone name
 * @param {object} options Renderer options
 * @returns {HTMLElement}
 */
function createOrUpdateCardElement(cardData, side, zoneId, options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function') {
    return {
      tagName: 'IMG',
      dataset: {},
      style: {},
      classList: { add: () => {}, remove: () => {} },
      setAttribute: () => {},
      removeAttribute: () => {},
    };
  }

  const instanceId = cardData.instanceId;
  const isRedacted = !cardData.name && !cardData.src;
  const cardBackSrc = options.cardBackSrc || '/src/assets/cardback.png';
  const displaySrc = isRedacted ? cardBackSrc : (cardData.src || cardBackSrc);

  let record = cardRegistry.get(instanceId);
  let img = record?.element;

  if (!img) {
    img = doc.createElement('img');
    img.className = 'card-image';
  }

  img.setAttribute('src', displaySrc);
  img.setAttribute('alt', cardData.name || 'Face-down card');
  img.dataset.instanceId = String(instanceId);
  img.dataset.zone = zoneId;
  img.dataset.side = side;

  // Track damage counter overlay on the element
  if (typeof cardData.damage === 'number' && cardData.damage > 0) {
    img.dataset.damage = String(cardData.damage);
  } else {
    delete img.dataset.damage;
  }

  // Track special condition overlay
  if (cardData.specialCondition) {
    img.dataset.specialCondition = cardData.specialCondition;
  } else {
    delete img.dataset.specialCondition;
  }

  // Track ability used marker
  if (cardData.abilityUsed) {
    img.dataset.abilityUsed = 'true';
  } else {
    delete img.dataset.abilityUsed;
  }

  // Update or insert registry entry
  if (!record) {
    record = {
      instanceId,
      element: img,
      card: { ...cardData },
      side,
      zone: zoneId,
      container: null,
    };
    cardRegistry.set(instanceId, record);
  } else {
    record.card = { ...cardData };
    record.side = side;
    record.zone = zoneId;
  }

  return img;
}

/**
 * Places a card element into its target zone, handling play-containers and attachments.
 *
 * @param {object} cardData
 * @param {string} side
 * @param {string} zoneId
 * @param {object} options
 */
function placeCardInZone(cardData, side, zoneId, options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const zone = resolveZone(side, zoneId, options);
  const record = cardRegistry.get(cardData.instanceId);
  if (!zone.element || !record) return;

  const img = record.element;

  // Handle play zones (active & bench)
  if (PLAY_ZONES.includes(zoneId)) {
    // Check if card is attached to another Pokemon
    if (cardData.attachedTo != null) {
      const parentRecord = cardRegistry.get(cardData.attachedTo);
      if (parentRecord && parentRecord.container) {
        // Append attached card under parent container with attached style
        img.classList.add('attached-card');
        parentRecord.container.appendChild(img);
        return;
      }
    }

    // Top-level active/bench Pokemon: wrap in .play-container
    let container = record.container;
    if (!container || !container.parentNode) {
      container = doc.createElement('div');
      container.className = 'play-container';
      container.dataset.instanceId = String(cardData.instanceId);
      record.container = container;
    }
    if (img.parentNode !== container) {
      container.appendChild(img);
    }
    if (container.parentNode !== zone.element) {
      zone.element.appendChild(container);
    }
    return;
  }

  // If card was previously in a play-container, clean up container
  if (record.container && record.container.parentNode) {
    record.container.parentNode.removeChild(record.container);
    record.container = null;
  }

  img.classList.remove('attached-card');
  if (img.parentNode !== zone.element) {
    zone.element.appendChild(img);
  }
}

/**
 * Reconciles the neutral Stadium card in the top-level document.
 *
 * @param {object|null} stadiumCard
 * @param {object} options
 */
function reconcileStadium(stadiumCard, options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const stadiumElement = doc.getElementById ? doc.getElementById('stadium') : null;
  if (!stadiumElement) return;

  if (!stadiumCard) {
    // Clear stadium
    if (stadiumElement.innerHTML !== undefined) {
      stadiumElement.innerHTML = '';
    }
    return;
  }

  const img = createOrUpdateCardElement(stadiumCard, 'neutral', 'stadium', options);
  if (img.parentNode !== stadiumElement) {
    if (stadiumElement.innerHTML !== undefined) {
      stadiumElement.innerHTML = '';
    }
    stadiumElement.appendChild(img);
  }
}

/**
 * Renders or removes the PendingChoice interactive modal.
 *
 * @param {object|null} pendingChoice
 * @param {string|null} localPlayerId
 * @param {object} options
 */
function reconcilePendingChoice(pendingChoice, localPlayerId, options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const existingModal = doc.getElementById ? doc.getElementById('netcodeChoiceModal') : null;
  const existingBanner = doc.getElementById ? doc.getElementById('netcodeChoiceBanner') : null;

  if (!pendingChoice) {
    if (existingModal?.parentNode) existingModal.parentNode.removeChild(existingModal);
    if (existingBanner?.parentNode) existingBanner.parentNode.removeChild(existingBanner);
    return;
  }

  const isOwner = !pendingChoice.player || pendingChoice.player === localPlayerId;

  if (!isOwner) {
    // Opponent is choosing: show non-interactive waiting banner
    if (existingModal?.parentNode) existingModal.parentNode.removeChild(existingModal);
    let banner = existingBanner;
    if (!banner) {
      banner = doc.createElement('div');
      banner.id = 'netcodeChoiceBanner';
      banner.className = 'choice-waiting-banner';
      doc.body?.appendChild(banner);
    }
    banner.textContent = `Opponent is making a choice: ${pendingChoice.prompt || '...'}`;
    return;
  }

  // Local player must make a choice: mount interactive picker
  if (existingBanner?.parentNode) existingBanner.parentNode.removeChild(existingBanner);

  let modal = existingModal;
  if (!modal) {
    modal = doc.createElement('div');
    modal.id = 'netcodeChoiceModal';
    modal.className = 'choice-modal-overlay';
    doc.body?.appendChild(modal);
  } else if (modal.children) {
    while (modal.children.length > 0) {
      modal.removeChild(modal.children[0]);
    }
  }

  const min = pendingChoice.min ?? 1;
  const max = pendingChoice.max ?? 1;
  const selectedIds = new Set();

  const container = doc.createElement('div');
  container.className = 'choice-modal-container';
  modal.appendChild(container);

  const title = doc.createElement('h3');
  title.className = 'choice-modal-title';
  title.textContent = pendingChoice.prompt || 'Make a choice';
  container.appendChild(title);

  const optionsContainer = doc.createElement('div');
  optionsContainer.id = 'choiceOptionsContainer';
  optionsContainer.className = 'choice-modal-options';
  container.appendChild(optionsContainer);

  const footer = doc.createElement('div');
  footer.className = 'choice-modal-footer';
  container.appendChild(footer);

  const confirmBtn = doc.createElement('button');
  confirmBtn.id = 'choiceConfirmBtn';
  confirmBtn.className = 'choice-confirm-btn';
  confirmBtn.disabled = true;
  confirmBtn.textContent = `Confirm (0/${max})`;
  footer.appendChild(confirmBtn);

  const updateConfirmState = () => {
    const count = selectedIds.size;
    confirmBtn.disabled = count < min || count > max;
    confirmBtn.textContent = `Confirm (${count}/${max})`;
  };

  const optionsList = Array.isArray(pendingChoice.options) ? pendingChoice.options : [];
  for (const opt of optionsList) {
    const optDiv = doc.createElement('div');
    optDiv.className = 'choice-option-card';
    optDiv.dataset.instanceId = String(opt.instanceId);

    const optImg = doc.createElement('img');
    optImg.src = opt.src || '/src/assets/cardback.png';
    optImg.alt = opt.name || 'Card';
    optDiv.appendChild(optImg);

    optDiv.addEventListener?.('click', () => {
      if (selectedIds.has(opt.instanceId)) {
        selectedIds.delete(opt.instanceId);
        optDiv.classList.remove('selected');
      } else if (selectedIds.size < max) {
        selectedIds.add(opt.instanceId);
        optDiv.classList.add('selected');
      }
      updateConfirmState();
    });

    optionsContainer?.appendChild(optDiv);
  }

  confirmBtn?.addEventListener?.('click', async () => {
    confirmBtn.disabled = true;
    const selection = Array.from(selectedIds);
    try {
      if (typeof options.onResolveChoice === 'function') {
        options.onResolveChoice({ choiceId: pendingChoice.choiceId, selection });
      } else {
        const { socket, roomId } = await resolveNetcodeContext(options);
        if (socket && roomId) {
          emitResolveChoice({
            socket,
            roomId,
            choiceId: pendingChoice.choiceId,
            selection,
          });
        }
      }
    } finally {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    }
  });
}

/**
 * Renders or removes the Game Ended modal and dispatches win/loss announcements.
 *
 * @param {object} view Authoritative redacted view
 * @param {object} [options={}]
 */
export function reconcileGameEnded(view, options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const existingModal = doc.getElementById ? doc.getElementById('netcodeEndModal') : null;
  const rulesEndScreen = doc.getElementById ? doc.getElementById('rulesEndScreen') : null;

  if (!view || view.turn?.phase !== 'ended') {
    if (existingModal?.parentNode) {
      existingModal.parentNode.removeChild(existingModal);
    }
    if (rulesEndScreen) {
      rulesEndScreen.hidden = true;
    }
    return;
  }

  // Phase is ended: ensure pending choice overlays are cleared
  const existingChoiceModal = doc.getElementById ? doc.getElementById('netcodeChoiceModal') : null;
  const existingChoiceBanner = doc.getElementById ? doc.getElementById('netcodeChoiceBanner') : null;
  if (existingChoiceModal?.parentNode) existingChoiceModal.parentNode.removeChild(existingChoiceModal);
  if (existingChoiceBanner?.parentNode) existingChoiceBanner.parentNode.removeChild(existingChoiceBanner);

  const localPlayerId = view.you?.playerId || null;
  const isWinner = Boolean(view.winner && localPlayerId && view.winner === localPlayerId);
  const isLoser = Boolean(view.winner && localPlayerId && view.winner !== localPlayerId);

  let titleText = 'Game Over';
  if (isWinner) {
    titleText = 'Victory!';
  } else if (isLoser) {
    titleText = 'Defeat';
  } else if (view.winner) {
    const oppName = view.them?.username || view.winner;
    titleText = `${oppName} Wins!`;
  }

  const reasonText = view.winReason ? `Reason: ${view.winReason}` : 'The game has ended.';

  // If rulesEndScreen exists from HTML/EJS, synchronize and display it
  if (rulesEndScreen) {
    const title = rulesEndScreen.querySelector?.('.rules-end-title');
    const reason = rulesEndScreen.querySelector?.('.rules-end-reason');
    if (title) title.textContent = titleText;
    if (reason) reason.textContent = reasonText;
    rulesEndScreen.hidden = false;
  }

  // Mount or update netcodeEndModal
  let modal = existingModal;
  if (!modal) {
    modal = doc.createElement('div');
    modal.id = 'netcodeEndModal';
    modal.className = 'game-end-modal-overlay';
    doc.body?.appendChild(modal);
  } else if (modal.children) {
    while (modal.children.length > 0) {
      modal.removeChild(modal.children[0]);
    }
  }

  const container = doc.createElement('div');
  container.className = 'game-end-modal-container';
  modal.appendChild(container);

  const titleEl = doc.createElement('h2');
  titleEl.className = `game-end-modal-title ${isWinner ? 'winner' : isLoser ? 'loser' : ''}`.trim();
  titleEl.textContent = titleText;
  container.appendChild(titleEl);

  const reasonEl = doc.createElement('p');
  reasonEl.className = 'game-end-modal-reason';
  reasonEl.textContent = reasonText;
  container.appendChild(reasonEl);

  const closeBtn = doc.createElement('button');
  closeBtn.id = 'netcodeEndCloseBtn';
  closeBtn.className = 'game-end-close-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener?.('click', () => {
    if (modal.parentNode) modal.parentNode.removeChild(modal);
  });
  container.appendChild(closeBtn);

  // Dispatch custom event for DOM / client listeners
  if (typeof doc.dispatchEvent === 'function') {
    try {
      doc.dispatchEvent(
        new CustomEvent('rules-game-ended', {
          detail: {
            winner: view.winner,
            reason: view.winReason,
            isWinner,
            title: titleText,
          },
        })
      );
    } catch {
      // CustomEvent dispatch ignored if environment does not support it
    }
  }

  if (typeof options.onGameEnded === 'function') {
    options.onGameEnded({
      winner: view.winner,
      reason: view.winReason,
      isWinner,
      title: titleText,
    });
  }
}

/**
 * Resolves netcode socket and roomId context from options, defaults, or dynamic state import.
 *
 * @param {object} [options={}]
 * @returns {Promise<{ socket: any, roomId: string|null }>}
 */
async function resolveNetcodeContext(options = {}) {
  const defaultCtx = getDefaultNetcodeContext();
  let socket = options.socket || defaultCtx.socket;
  let roomId = options.roomId || defaultCtx.roomId;

  if (typeof window !== 'undefined') {
    if (!socket && window.socket) socket = window.socket;
    if (!roomId && window.systemState?.roomId) roomId = window.systemState.roomId;
  }

  if ((!socket || !roomId) && typeof window !== 'undefined') {
    try {
      const state = await import('../../state.js');
      if (!socket && state.socket) socket = state.socket;
      if (!roomId && state.systemState?.roomId) roomId = state.systemState.roomId;
    } catch {
      // dynamic import fallback ignored if unavailable
    }
  }

  return { socket, roomId };
}

/**
 * Main authoritative view renderer.
 * Reconciles browser DOM directly from authoritative view snapshot.
 *
 * @param {object} view Authoritative redacted view
 * @param {object[]} [events=[]] Advisory events for animation (Invariant 4)
 * @param {object} [options={}] Overrides and hooks
 * @returns {{ applied: boolean, reason?: string, diff?: object }}
 */
export function applyView(view, events = [], options = {}) {
  if (!view || typeof view !== 'object') {
    return { applied: false, reason: 'invalid_view' };
  }

  // Edge Case 8: Monotonic stateVersion guard (ignore out-of-order or duplicate views)
  if (typeof view.stateVersion === 'number') {
    if (view.stateVersion <= lastRenderedVersion) {
      return {
        applied: false,
        reason: 'out_of_order',
        stateVersion: view.stateVersion,
        lastRenderedVersion,
      };
    }
    lastRenderedVersion = view.stateVersion;
  }

  // Clear in-flight affordances now that server response has landed
  clearInFlightAffordances();

  const diff = diffViews(options.previousView || null, view);

  // Reconcile player sides ('you' and 'them')
  const sides = ['you', 'them'];
  for (const side of sides) {
    const playerView = view[side];
    if (!playerView || !playerView.zones) continue;

    for (const [zoneId, cards] of Object.entries(playerView.zones)) {
      if (!Array.isArray(cards)) continue;

      for (const cardData of cards) {
        createOrUpdateCardElement(cardData, side, zoneId, options);
        placeCardInZone(cardData, side, zoneId, options);
      }
    }
  }

  // Clean up removed cards from registry and DOM
  const liveInstanceIds = new Set();
  for (const side of sides) {
    const playerView = view[side];
    if (!playerView?.zones) continue;
    for (const cards of Object.values(playerView.zones)) {
      if (!Array.isArray(cards)) continue;
      for (const c of cards) {
        if (c.instanceId != null) liveInstanceIds.add(c.instanceId);
      }
    }
  }
  if (view.stadium?.instanceId != null) {
    liveInstanceIds.add(view.stadium.instanceId);
  }

  for (const [id, record] of cardRegistry.entries()) {
    if (!liveInstanceIds.has(id)) {
      if (record.container && record.container.parentNode) {
        record.container.parentNode.removeChild(record.container);
      } else if (record.element && record.element.parentNode) {
        record.element.parentNode.removeChild(record.element);
      }
      cardRegistry.delete(id);
    }
  }

  // Reconcile neutral Stadium
  reconcileStadium(view.stadium || null, options);

  // Reconcile PendingChoice modal / banner
  const localPlayerId = view.you?.playerId || null;
  reconcilePendingChoice(view.pendingChoice || null, localPlayerId, options);

  // Reconcile Game Ended modal / banner (Finding 12)
  reconcileGameEnded(view, options);

  // Play advisory events for UI animations/logs (Invariant 4: deletion leaves client correct)
  if (Array.isArray(events) && typeof options.onAdvisoryEvent === 'function') {
    for (const ev of events) {
      options.onAdvisoryEvent(ev);
    }
  }

  return {
    applied: true,
    stateVersion: view.stateVersion,
    diff,
  };
}
