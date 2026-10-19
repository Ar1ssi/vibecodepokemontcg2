// Design 074 D5 "Drag": the page-side half of a 3D board drag — the same side effects and calls
// drag.js makes for an HTML5 drag (dragStart :62-97, drop :256-456), driven by board-input.js
// with the held card's board-mirror <img>. Browser-only (state.js): board3d.js loads it.
import { closePopups } from '../../actions/general/close-popups.js';
import { moveCardBundle } from '../../actions/move-card-bundle/move-card-bundle.js';
import { moveToDeckTop } from '../../actions/zones/deck-actions.js';
import { retreat } from '../../actions/chat-buttons/chat-buttons.js';
import { mouseClick, systemState } from '../../state.js';
import { rulesState } from '/shared/engine/rules/rules-state.mjs';
import { isEnergy, isPokemon, isTrainer } from '/shared/engine/cards.mjs';
import { getZone } from '../zones/get-zone.js';
import { identifyCardElement } from '../image-logic/click-events.js';
import { findZoneCardIndex } from '../image-logic/zone-card-lookup.js';
import {
  clearBoardReady,
  heldCardBoardRefuses,
  markBoardReady,
  refuseBoardDrop,
  refuseManualDeckAction,
} from '../image-logic/drag.js';
import { uiCue } from '../netcode/mat-fx/ui-cue.mjs';

const CALLS = { retreat, deckTop: moveToDeckTop, move: moveCardBundle };

/** drag.js `notSpectator` (:288-291). */
const isSpectating = () =>
  Boolean(document.getElementById('spectatorModeCheckbox')?.checked && systemState.isTwoPlayer);

/** @returns {import('./drop-router.mjs').DragState} */
const dragState = () => ({
  initiator: systemState.initiator === 'opp' ? 'opp' : 'self',
  isSpectator: isSpectating(),
  rulesEnabled: Boolean(rulesState.enabled),
  solo: Boolean(systemState.solo),
});

/**
 * Picks the card up as dragStart does: closes popups, identifies it into `mouseClick`, lights
 * the Trainer board for an Item/Supporter, plays the pick-up cue. Null when no drag may start
 * (a replay outside a two-player room, as dragStart refuses, or a spectator, whose drop
 * drag.js refuses).
 * @param {HTMLImageElement} image the card's mirror <img>
 * @returns {import('./drop-router.mjs').Dragging|null}
 */
const begin = (image) => {
  if (!image) return null;
  if (systemState.isReplay && !systemState.isTwoPlayer) return null;
  if (isSpectating()) return null;
  closePopups({ target: image });
  identifyCardElement(image);
  markBoardReady(image);
  uiCue('card-from-hand');
  const card = image.card ?? null;
  return {
    instanceId: mouseClick.cardInstanceId,
    side: mouseClick.cardUser,
    zone: mouseClick.zoneId,
    index: mouseClick.cardIndex,
    attached: Boolean(image.attached),
    isTrainer: Boolean(card && isTrainer(card)),
    isEnergy: Boolean(card && isEnergy(card)),
    isPokemon: Boolean(card && isPokemon(card)),
    boardRefuses: heldCardBoardRefuses(image),
  };
};

/** The legacy index drag.js passes for a dropped-on card (`findZoneCardIndex`, :322-325). */
const targetIndexOf = (image, side, zone) => findZoneCardIndex(getZone(side, zone), image);

/**
 * Runs a routed drop (drop-router.mjs `routeDrop`): its rules gates, then the cue and the call;
 * a refused drop only says why.
 * @param {{ kind: 'retreat'|'deckTop'|'move'|'refuse', args: any[], gates: string[] }} route
 * @returns {boolean} whether the call went out
 */
const perform = (route) => {
  if (route?.kind === 'refuse') {
    refuseBoardDrop();
    return false;
  }
  const call = CALLS[route?.kind];
  if (!call) return false;
  if ((route.gates ?? []).some((action) => refuseManualDeckAction(action))) return false;
  if (route.kind !== 'retreat') uiCue('card-place');
  call(...route.args);
  return true;
};

export function createBoardDragActions() {
  return { state: dragState, begin, targetIndexOf, perform, end: clearBoardReady };
}
