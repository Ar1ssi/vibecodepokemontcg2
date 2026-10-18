// Design 074 D3: the browser half of select-to-move for server-drawn cards (both boards). A
// click selects the card's registry <img> (`.highlight`, which keybinds then act on); `e`/`q`
// rings the attach targets (`.selectHighlight`) and the next click on one attaches the held
// card through moveCardBundle with server identities. Legacy-rendered games never reach here:
// every entry point answers false when no authoritative card is selected.
import { mouseClick } from '../../state.js';
import { getCardRegistry } from './apply-view.js';
import { isAuthoritativeDispatchActive } from './authoritative-dispatch.js';
import { attachCandidateIds, canStartAttach } from './server-card-select.mjs';

const SELECTION_CLASSES = ['highlight', 'selectHighlight'];

/** The card attach mode started from, kept apart from `mouseClick` (the next click rewrites it). */
let attachFrom = null;

const selectedRecord = () => {
  if (!isAuthoritativeDispatchActive() || mouseClick.cardInstanceId == null) return null;
  const record = getCardRegistry().get(mouseClick.cardInstanceId);
  return record && !record.isRedacted && record.element ? record : null;
};

/** Selects the card `identifyCard` just named; false when it is not a server-drawn card. */
export function selectServerCard() {
  const record = selectedRecord();
  if (!record) return false;
  record.element.classList.add('highlight');
  mouseClick.selectingCard = true;
  return true;
}

/** Clears every server card's selection and attach-target rings. */
export function clearServerSelection() {
  for (const record of getCardRegistry().values()) {
    record.element?.classList?.remove(...SELECTION_CLASSES);
  }
}

/**
 * `e`/`q` on a selected server card: rings its owner's Pokémon in play as attach targets.
 * False when no server card is selected or it cannot attach from where it is.
 */
export function beginServerAttach() {
  const record = selectedRecord();
  if (!record || !canStartAttach(record)) return false;
  attachFrom = {
    instanceId: record.instanceId,
    user: mouseClick.cardUser,
    zoneId: mouseClick.zoneId,
    index: mouseClick.cardIndex,
  };
  clearServerSelection();
  mouseClick.selectingCard = false;
  const registry = getCardRegistry();
  for (const id of attachCandidateIds(registry.values(), { cardUser: mouseClick.cardUser })) {
    registry.get(id)?.element?.classList.add('selectHighlight');
  }
  return true;
}

/**
 * A click on a ringed attach target: the held card and the target's instance id, once.
 * Null when the click is not on a ring or attach mode was not started on a server card.
 * @param {Element} target the clicked card <img>
 */
export function takeServerAttach(target) {
  if (!attachFrom || !target?.classList?.contains('selectHighlight')) return null;
  const targetId = Number(target.dataset?.instanceId);
  if (!Number.isFinite(targetId)) return null;
  const from = attachFrom;
  attachFrom = null;
  return { from, targetId };
}
