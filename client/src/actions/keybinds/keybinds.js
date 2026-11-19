import { mouseClick, systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { manualDeckActionAllowed } from '/shared/engine/rules/rules-state.mjs';

import { determineUsername } from '../../setup/general/determine-username.js';
import { doubleClick } from '../../setup/image-logic/click-events.js';
import { refreshBoardImages } from '../../setup/sizing/refresh-board.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { dispatchServerCardKey } from '../../setup/netcode/manual-card-dispatch.js';
import { beginServerAttach } from '../../setup/netcode/server-card-select.js';
import { isInFullView } from '../../setup/deck-constructor/hydrate-holo.js';
import { isCardPreviewOpen } from '../../setup/image-logic/full-view.js';
import { addDamageCounter } from '../counters/damage-counter.js';
import { addSpecialCondition } from '../counters/special-condition.js';
import {
  getSpecialConditionCode,
  setSpecialConditionCode,
} from '../../setup/counters/special-condition-code.mjs';
import { useAbility } from '../counters/use-ability.js';
import {
  discardBoard,
  handBoard,
  shuffleBoard,
} from '../general/board-actions.js';
import { changeType } from '../general/change-type.js';
import {
  closeFullView,
  closePopups,
  deselectCard,
  hideZoneElements,
} from '../general/close-popups.js';
import { closeCardFocus, isCardFocusOpen } from '../../setup/rules/card-focus.mjs';
import { closeStatusPopup, isStatusPopupOpen } from '../../setup/rules/status-popup.mjs';
import { flipBoard } from '../general/flip-board.js';
import { flipCoin } from '../general/flip-coin.js';
import { reset } from '../general/reset.js';
import {
  hideShortcut,
  lookShortcut,
  revealShortcut,
  stopLookingShortcut,
} from '../general/reveal-and-hide.js';
import { rotateCard } from '../general/rotate-card.js';
import { readyUp } from '../general/ready.js';
import { undo } from '../general/undo.js';
import { moveCardBundle } from '../move-card-bundle/move-card-bundle.js';
import {
  draw,
  moveToDeckBottom,
  moveToDeckTop,
  shuffleIntoDeck,
  switchWithDeckTop,
  viewDeck,
} from '../zones/deck-actions.js';
import { shuffleAll } from '../zones/general.js';
import {
  discardAndDraw,
  shuffleAndDraw,
  shuffleBottomAndDraw,
} from '../zones/hand-actions.js';

import { areKeybindsSleeping } from './keybindSleep.js';

// Gates a manual (keybind-triggered) deck action through the rules layer; on refusal it also
// posts the reason to chat, so callers only `return`.
function gate(actionKey, initiator) {
  const check = manualDeckActionAllowed(actionKey);
  if (!check.allowed) {
    appendMessage(initiator, '⛔ ' + check.reason, 'announcement', false);
    return false;
  }
  return true;
}

const isAltKeyPressed = (event) => {
  return event.altKey || event.getModifierState('Alt');
};

// Special-condition cycle (Poisoned > Burned > Paralyzed > Confused > Asleep), keyed by the
// upper-cased code the marker currently shows.
const NEXT_SPECIAL_CONDITION_CODE = {
  P: 'B',
  B: 'Pa',
  PA: 'C',
  C: 'A',
  A: 'P',
};

const isNonZeroDigitKeyPressed = (event) => {
  return (
    (event.key >= '1' && event.key <= '9') ||
    (event.code >= 'Digit1' && event.code <= 'Digit9')
  );
};

const convertDigitEventCodeToKey = (event) => {
  const digitMap = {
    Digit1: '1',
    Digit2: '2',
    Digit3: '3',
    Digit4: '4',
    Digit5: '5',
    Digit6: '6',
    Digit7: '7',
    Digit8: '8',
    Digit9: '9',
  };
  return digitMap[event.code] || event.key;
};

export const keyUp = (event) => {
  if (
    event.key === 'Shift' ||
    event.code === 'ShiftLeft' ||
    event.code === 'ShiftRight'
  ) {
    document.getElementById('keybindModal').style.display = 'none';
  }
};
export const keyDown = (event) => {
  const notSpectator = !(
    document.getElementById('spectatorModeCheckbox').checked &&
    systemState.isTwoPlayer
  );
  const blockedClasses = ['self-circle', 'opp-circle', 'self-tab', 'opp-tab'];
  if (
    event.target.tagName === 'INPUT' ||
    event.target.tagName === 'TEXTAREA' ||
    event.target.tagName === 'TD' ||
    blockedClasses.some((className) =>
      event.target.classList.contains(className)
    ) ||
    areKeybindsSleeping
  ) {
    return;
  }
  if (event.key === 'Escape' || event.code === 'Escape') {
    // The card focus closes with its own fly-back; closePopups() would not (it must not close the
    // focus at all: it also runs on every card move and document click). The status popup sits on
    // top of the focus, so Escape closes it first.
    if (isStatusPopupOpen()) {
      closeStatusPopup();
      return;
    }
    if (isCardFocusOpen()) {
      closeCardFocus();
      return;
    }
    hideZoneElements();
    closePopups();
    document.getElementById('keybindModal').style.display = 'none';
  }
  if (
    event.key === 'Shift' ||
    event.code === 'ShiftLeft' ||
    event.code === 'ShiftRight'
  ) {
    document.getElementById('keybindModal').style.display = 'block';
  }
  if ((event.key === 'f' || event.code === 'KeyF') && isAltKeyPressed(event)) {
    event.preventDefault();
    if (systemState.coachingMode || !systemState.isTwoPlayer || !notSpectator) {
      flipBoard();
    }
  }
  if (!mouseClick.selectingCard) {
    if (event.key === 'r' || event.code === 'KeyR') {
      refreshBoardImages();
    }
    if (event.key === 'v' || event.code === 'KeyV') {
      const selectedDeckElement = getZone(
        systemState.initiator,
        'deck'
      ).element;
      selectedDeckElement.style.display = 'block';

      if (notSpectator) {
        appendMessage(
          systemState.initiator,
          determineUsername(systemState.initiator) +
            ' is looking through ' +
            determineUsername(systemState.initiator) +
            "'s deck",
          'player'
        );
      }
    }
  }
  if (mouseClick.selectingCard) {
    if (event.key === 'v' || event.code === 'KeyV') {
      doubleClick(null);
    }
  }
  if (mouseClick.selectingCard && notSpectator) {
    event.preventDefault();
    // Design 012: a server-drawn card has no legacy zone entry for the handlers below.
    if (dispatchServerCardKey(event)) return;

    const keyBinds = {
      h: 'hand',
      KeyH: 'hand',
      d: 'discard',
      KeyD: 'discard',
      b: 'bench',
      KeyB: 'bench',
      a: 'active',
      KeyA: 'active',
      g: 'stadium',
      KeyG: 'stadium',
      l: 'lostZone',
      KeyL: 'lostZone',
      p: 'prizes',
      KeyP: 'prizes',
      ' ': 'board',
      KeySpace: 'board',
      ArrowUp: 'deck',
      ArrowDown: 'deck',
      ArrowRight: 'deck',
      s: 'deck',
      KeyS: 'deck',
    };
    const bind = keyBinds[event.key] || keyBinds[event.code];
    if (bind && !isAltKeyPressed(event)) {
      const dZoneId = bind;
      deselectCard();
      if (event.key === 'ArrowUp' || event.code === 'ArrowUp') {
        if (!gate('moveToDeck', systemState.initiator)) return;
        moveToDeckTop(
          mouseClick.cardUser,
          systemState.initiator,
          mouseClick.zoneId,
          mouseClick.cardIndex
        );
      } else if (event.key === 'ArrowDown' || event.code === 'ArrowDown') {
        if (!gate('moveToDeck', systemState.initiator)) return;
        moveToDeckBottom(
          mouseClick.cardUser,
          systemState.initiator,
          mouseClick.zoneId,
          mouseClick.cardIndex
        );
      } else if (event.key === 'ArrowRight' || event.code === 'ArrowRight') {
        if (!gate('switchWithDeck', systemState.initiator)) return;
        switchWithDeckTop(
          mouseClick.cardUser,
          systemState.initiator,
          mouseClick.zoneId,
          mouseClick.cardIndex
        );
      } else if (event.key === 's' || event.code === 'KeyS') {
        if (!gate('moveToDeck', systemState.initiator)) return;
        shuffleIntoDeck(
          mouseClick.cardUser,
          systemState.initiator,
          mouseClick.zoneId,
          mouseClick.cardIndex
        );
      } else {
        // A server-drawn card moves by its instance id (null for a legacy card: unchanged).
        moveCardBundle(
          mouseClick.cardUser,
          systemState.initiator,
          mouseClick.zoneId,
          dZoneId,
          mouseClick.cardIndex,
          false,
          'move',
          true,
          null,
          { moving: mouseClick.cardInstanceId }
        );
      }
    }
    if (
      (event.key === 'e' ||
        event.code === 'KeyE' ||
        event.key === 'q' ||
        event.code === 'KeyQ') &&
      !isAltKeyPressed(event) &&
      !mouseClick.card &&
      beginServerAttach()
    ) {
      closeFullView(event);
      hideZoneElements();
    } else if (
      (event.key === 'e' ||
        event.code === 'KeyE' ||
        event.key === 'q' ||
        event.code === 'KeyQ') &&
      !isAltKeyPressed(event) &&
      mouseClick.card &&
      (!['active', 'bench'].includes(mouseClick.zoneId) ||
        mouseClick.card.image.attached)
    ) {
      closeFullView(event);
      hideZoneElements();
      deselectCard();
      const highlightedZones = ['active', 'bench'];
      highlightedZones.forEach((zoneId) => {
        getZone(mouseClick.cardUser, zoneId).array.forEach((card) => {
          if (!card.image.attached) {
            card.image.classList.add('selectHighlight');
          }
        });
      });
    }
    if (
      (event.key === 'w' || event.code === 'KeyW') &&
      ['active', 'bench', 'stadium', 'discard'].includes(mouseClick.zoneId)
    ) {
      deselectCard();
      event.preventDefault();
      if (mouseClick.card?.image?.abilityCounter) {
        mouseClick.card.image.abilityCounter.handleRemove();
      } else {
        useAbility(
          mouseClick.cardUser,
          systemState.initiator,
          mouseClick.zoneId,
          mouseClick.cardIndex,
          true,
          undefined,
          mouseClick.cardInstanceId
        );
      }
    }
    if (
      isNonZeroDigitKeyPressed(event) &&
      ['active', 'bench'].includes(mouseClick.zoneId)
    ) {
      const numberPressed = convertDigitEventCodeToKey(event);
      if (!mouseClick.card.image.damageCounter) {
        const damageAmount = parseInt(numberPressed * 10).toString();
        addDamageCounter(
          mouseClick.cardUser,
          mouseClick.zoneId,
          mouseClick.cardIndex,
          damageAmount
        );
      } else {
        let damageAmount = parseInt(
          mouseClick.card.image.damageCounter.textContent
        );
        const adjustment = parseInt(numberPressed * 10);
        if (isAltKeyPressed(event)) {
          damageAmount -= adjustment;
        } else {
          damageAmount += adjustment;
        }
        mouseClick.card.image.damageCounter.textContent =
          damageAmount.toString();
        if (damageAmount <= 0) {
          deselectCard();
          mouseClick.card.image.damageCounter.handleRemove(true);
        } else {
          mouseClick.card.image.damageCounter.handleInput();
        }
      }
    }
    if (
      (event.key === '0' || event.code === 'Digit0') &&
      mouseClick.card.image.damageCounter
    ) {
      deselectCard();
      mouseClick.card.image.damageCounter.textContent = event.key;
      mouseClick.card.image.damageCounter.handleRemove(true);
    }
    if (
      (event.key === 'y' || event.code === 'KeyY') &&
      mouseClick.zoneId === 'active'
    ) {
      if (!mouseClick.card.image.specialCondition) {
        addSpecialCondition(
          mouseClick.cardUser,
          mouseClick.zoneId,
          mouseClick.cardIndex
        );
      } else {
        if (!isAltKeyPressed(event)) {
          const sc = mouseClick.card.image.specialCondition;
          const nextCode = NEXT_SPECIAL_CONDITION_CODE[getSpecialConditionCode(sc).toUpperCase()];
          if (nextCode) {
            setSpecialConditionCode(sc, nextCode);
            sc.handleColor();
          }
        } else {
          setSpecialConditionCode(mouseClick.card.image.specialCondition, '');
          mouseClick.card.image.specialCondition.handleRemove(true);
          deselectCard();
        }
      }
    }
    if (event.key === 'c' || event.code === 'KeyC') {
      if (
        [
          systemState.cardBackSrc,
          systemState.p1OppCardBackSrc,
          systemState.p2OppCardBackSrc,
        ].includes(mouseClick.card.image.src)
      ) {
        lookShortcut(
          mouseClick.cardUser,
          systemState.initiator,
          mouseClick.zoneId,
          mouseClick.cardIndex
        );
      } else {
        stopLookingShortcut(
          mouseClick.cardUser,
          systemState.initiator,
          mouseClick.zoneId,
          mouseClick.cardIndex
        );
      }
    }
    if (
      (event.key === 'z' || event.code === 'KeyZ') &&
      !isAltKeyPressed(event)
    ) {
      if (
        ![
          systemState.cardBackSrc,
          systemState.p1OppCardBackSrc,
          systemState.p2OppCardBackSrc,
        ].includes(mouseClick.card.image.src)
      ) {
        hideShortcut(
          mouseClick.cardUser,
          systemState.initiator,
          mouseClick.zoneId,
          mouseClick.cardIndex
        );
      }
    }
    if (
      (event.key === 'z' || event.code === 'KeyZ') &&
      isAltKeyPressed(event)
    ) {
      revealShortcut(
        mouseClick.cardUser,
        systemState.initiator,
        mouseClick.zoneId,
        mouseClick.cardIndex
      );
    }
    if (
      (event.key === 'e' || event.code === 'KeyE') &&
      isAltKeyPressed(event)
    ) {
      changeType(
        mouseClick.cardUser,
        systemState.initiator,
        mouseClick.zoneId,
        mouseClick.cardIndex,
        'Energy'
      );
    }
    if (
      (event.key === 't' || event.code === 'KeyT') &&
      isAltKeyPressed(event)
    ) {
      changeType(
        mouseClick.cardUser,
        systemState.initiator,
        mouseClick.zoneId,
        mouseClick.cardIndex,
        'Trainer'
      );
      return; // otherwise it will also takeTurn
    }
    if (
      (event.key === 'p' || event.code === 'KeyP') &&
      isAltKeyPressed(event)
    ) {
      changeType(
        mouseClick.cardUser,
        systemState.initiator,
        mouseClick.zoneId,
        mouseClick.cardIndex,
        'Pokémon'
      );
    }
    if (
      (event.key === 'r' || event.code === 'KeyR') &&
      !isAltKeyPressed(event) &&
      ['stadium', 'active', 'bench'].includes(mouseClick.zoneId) &&
      !isInFullView(mouseClick.card.image) &&
      !isCardPreviewOpen()
    ) {
      rotateCard(mouseClick.cardUser, mouseClick.zoneId, mouseClick.cardIndex);
    }
    if (
      (event.key === 'r' || event.code === 'KeyR') &&
      isAltKeyPressed(event) &&
      ['active', 'bench'].includes(mouseClick.zoneId) &&
      !isInFullView(mouseClick.card.image) &&
      !isCardPreviewOpen()
    ) {
      rotateCard(
        mouseClick.cardUser,
        mouseClick.zoneId,
        mouseClick.cardIndex,
        true
      );
    }
  }
  if (notSpectator) {
    if (
      (event.key === 'Enter' || event.code === 'Enter') &&
      !isAltKeyPressed(event)
    ) {
      discardBoard(systemState.initiator, systemState.initiator);
    }
    if (
      (event.key === 'Enter' || event.code === 'Enter') &&
      isAltKeyPressed(event)
    ) {
      handBoard(systemState.initiator, systemState.initiator);
    }
    if (event.key === '/' || event.code === 'Slash') {
      shuffleBoard(systemState.initiator, systemState.initiator);
    }
    if (
      (event.key === 'f' || event.code === 'KeyF') &&
      !isAltKeyPressed(event)
    ) {
      flipCoin(systemState.initiator);
    }
  }
  if (!mouseClick.selectingCard && notSpectator) {
    if (
      isNonZeroDigitKeyPressed(event) &&
      !isAltKeyPressed(event) &&
      !event.ctrlKey
    ) {
      draw(
        systemState.initiator,
        systemState.initiator,
        convertDigitEventCodeToKey(event)
      );
    }
    if (
      (event.key === 's' || event.code === 'KeyS') &&
      !isAltKeyPressed(event)
    ) {
      if (!gate('shuffleDeck', systemState.initiator)) return;
      shuffleAll(systemState.initiator, systemState.initiator, 'deck');
    }
    if (isNonZeroDigitKeyPressed(event) && isAltKeyPressed(event)) {
      if (!gate('viewDeck', systemState.initiator)) return;
      const selectedDeckCount = getZone(
        systemState.initiator,
        'deck'
      ).getCount();
      const viewAmount = Math.min(
        convertDigitEventCodeToKey(event),
        selectedDeckCount
      );
      viewDeck(
        systemState.initiator,
        systemState.initiator,
        viewAmount,
        true,
        selectedDeckCount,
        false
      );
    }
    if (isNonZeroDigitKeyPressed(event) && event.ctrlKey) {
      if (!gate('viewDeck', systemState.initiator)) return;
      const selectedDeckCount = getZone(
        systemState.initiator,
        'deck'
      ).getCount();
      const viewAmount = Math.min(
        convertDigitEventCodeToKey(event),
        selectedDeckCount
      );
      viewDeck(
        systemState.initiator,
        systemState.initiator,
        viewAmount,
        false,
        selectedDeckCount,
        false
      );
    }
    if (
      (event.key === 'n' || event.code === 'KeyN') &&
      isAltKeyPressed(event)
    ) {
      readyUp(systemState.initiator);
    }
    if (
      (event.key === 'r' || event.code === 'KeyR') &&
      isAltKeyPressed(event)
    ) {
      reset(systemState.initiator);
    }
    if (
      (event.key === 't' || event.code === 'KeyT') &&
      isAltKeyPressed(event)
    ) {
      // "End turn": route through the button click so the rules-mode
      // capture hook (hookTurnButton in rules-bridge.js) ends the current
      // turn and suppresses the legacy takeTurn bubble handler. In
      // non-rules mode the capture hook no-ops and the button's bubble
      // handler runs takeTurn as before.
      const turnButton = document.getElementById('p2PassButton');
      if (turnButton) turnButton.click();
    }
    if (event.key === 'm' || event.code === 'KeyM') {
      appendMessage(
        '',
        determineUsername(systemState.initiator) + ' mulligans',
        'announcement'
      );
    }
    if (
      (event.key === 'd' || event.code === 'KeyD') &&
      isAltKeyPressed(event)
    ) {
      event.preventDefault();
      if (!gate('discardAndDraw', systemState.initiator)) return;
      discardAndDraw(systemState.initiator, systemState.initiator);
    }
    if (
      (event.key === 's' || event.code === 'KeyS') &&
      isAltKeyPressed(event)
    ) {
      if (!gate('shuffleAndDraw', systemState.initiator)) return;
      shuffleAndDraw(systemState.initiator, systemState.initiator);
    }
    if (
      (event.key === 'ArrowDown' || event.code === 'ArrowDown') &&
      isAltKeyPressed(event)
    ) {
      if (!gate('shuffleBottomAndDraw', systemState.initiator)) return;
      shuffleBottomAndDraw(systemState.initiator, systemState.initiator);
    }
    if (event.key === 'u' || event.code === 'KeyU') {
      if (systemState.isTwoPlayer) {
        return;
      }
      undo(systemState.initiator);
    }
  }
};
