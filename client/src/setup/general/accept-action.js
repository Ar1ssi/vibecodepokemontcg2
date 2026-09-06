import { attack, pass, retreat, stadiumEffect } from '../../actions/chat-buttons/chat-buttons.js';
import { removeAbilityCounter } from '../../actions/counters/ability-counter.js';
import {
  addDamageCounter,
  removeDamageCounter,
  updateDamageCounter,
} from '../../actions/counters/damage-counter.js';
import {
  addSpecialCondition,
  removeSpecialCondition,
  updateSpecialCondition,
} from '../../actions/counters/special-condition.js';
import { useAbility } from '../../actions/counters/use-ability.js';
import { VSTARGXFunction } from '../../actions/general/VSTAR-GX.js';
import {
  discardBoard,
  handBoard,
  lostZoneBoard,
  shuffleBoard,
} from '../../actions/general/board-actions.js';
import { changeType } from '../../actions/general/change-type.js';
import { reset } from '../../actions/general/reset.js';
import { restartGame } from '../../actions/general/restart.js';
import {
  hideCards,
  hideShortcut,
  lookAtCards,
  lookShortcut,
  playRandomCardFaceDown,
  revealCards,
  revealShortcut,
  stopLookingAtCards,
  stopLookingShortcut,
} from '../../actions/general/reveal-and-hide.js';
import { rotateCard } from '../../actions/general/rotate-card.js';
import { readyUp } from '../../actions/general/ready.js';
import { setup, setupPrizes } from '../../actions/general/setup.js';
import { takeTurn } from '../../actions/general/take-turn.js';
import { undo } from '../../actions/general/undo.js';
import { moveCardBundle } from '../../actions/move-card-bundle/move-card-bundle.js';
import {
  draw,
  moveToDeckTop,
  shuffleIntoDeck,
  switchWithDeckTop,
  viewDeck,
} from '../../actions/zones/deck-actions.js';
import {
  discardAll,
  handAll,
  leaveAll,
  lostZoneAll,
  shuffleAll,
  shuffleBottom,
} from '../../actions/zones/general.js';
import {
  discardAndDraw,
  shuffleAndDraw,
  shuffleBottomAndDraw,
} from '../../actions/zones/hand-actions.js';
import { shufflePrizesToDeckBottom, takePrizes, takePrizesByIndex } from '../../actions/zones/prizes-actions.js';
import { shuffleZone } from '../../actions/zones/shuffle-zone.js';
import { exchangeData } from '../deck-constructor/exchange-data.js';
import { changeCardBack, loadDeckData } from '../deck-constructor/import.js';
import { changePlaymat } from '../sizing/apply-mat-layout.js';
import { isBlockedByReplay } from './replay-block.js';
import { logSyncAction } from './sync-logger-bridge.js';
import { systemState } from '../../state.js';

const functions = {
  exchangeData: exchangeData,
  loadDeckData: loadDeckData,
  changeCardBack: changeCardBack,
  changePlaymat: changePlaymat,
  reset: reset,
  restartGame: restartGame,
  setup: setup,
  setupPrizes: setupPrizes,
  readyUp: readyUp,
  takeTurn: takeTurn,
  draw: draw,
  moveCardBundle: moveCardBundle,
  shuffleIntoDeck: shuffleIntoDeck,
  moveToDeckTop: moveToDeckTop,
  switchWithDeckTop: switchWithDeckTop,
  viewDeck: viewDeck,
  shuffleAll: shuffleAll,
  shuffleBottom: shuffleBottom,
  discardAll: discardAll,
  lostZoneAll: lostZoneAll,
  handAll: handAll,
  leaveAll: leaveAll,
  discardAndDraw: discardAndDraw,
  shuffleAndDraw: shuffleAndDraw,
  shuffleBottomAndDraw: shuffleBottomAndDraw,
  shufflePrizesToDeckBottom: shufflePrizesToDeckBottom,
  takePrizes: takePrizes,
  takePrizesByIndex: takePrizesByIndex,
  shuffleZone: shuffleZone,
  useAbility: useAbility,
  removeAbilityCounter: removeAbilityCounter,
  addDamageCounter: addDamageCounter,
  updateDamageCounter: updateDamageCounter,
  removeDamageCounter: removeDamageCounter,
  addSpecialCondition: addSpecialCondition,
  updateSpecialCondition: updateSpecialCondition,
  removeSpecialCondition: removeSpecialCondition,
  discardBoard: discardBoard,
  handBoard: handBoard,
  shuffleBoard: shuffleBoard,
  lostZoneBoard: lostZoneBoard,
  lookAtCards: lookAtCards,
  stopLookingAtCards: stopLookingAtCards,
  revealCards: revealCards,
  hideCards: hideCards,
  revealShortcut: revealShortcut,
  hideShortcut: hideShortcut,
  lookShortcut: lookShortcut,
  stopLookingShortcut: stopLookingShortcut,
  playRandomCardFaceDown: playRandomCardFaceDown,
  rotateCard: rotateCard,
  changeType: changeType,
  attack: attack,
  pass: pass,
  retreat: retreat,
  'stadium-effect': stadiumEffect,
  VSTARGXFunction: VSTARGXFunction,
  undo: undo,
};

const actionToFunction = (action) => {
  const selectedFunction = functions[action];

  if (typeof selectedFunction === 'function') {
    return selectedFunction;
  } else {
    return null;
  }
};

export const acceptAction = async (
  user,
  action,
  parameters,
  isStateImport = false,
  isFromReplay = false
) => {
  if (isBlockedByReplay('action', action, isFromReplay)) {
    return false;
  }
  const selectedFunction = actionToFunction(action);
  if (typeof selectedFunction !== 'function') {
    console.warn('acceptAction: unknown action', action);
    return false;
  }
  const emit = user === 'self' || isStateImport ? true : false;
  if (systemState.isTwoPlayer && !isStateImport && user === 'opp') {
    logSyncAction(action, parameters, 'in');
  }
  try {
    const result = parameters
      ? selectedFunction(user, ...parameters, emit)
      : selectedFunction(user, emit);
    const resolved = await Promise.resolve(result);
    return resolved !== false;
  } catch (err) {
    console.error('acceptAction failed', action, err);
    return false;
  }
};
