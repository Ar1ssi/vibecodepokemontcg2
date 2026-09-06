import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { determineUsername } from '../../setup/general/determine-username.js';
import { processAction } from '../../setup/general/process-action.js';
import { shuffleIndices } from '../../setup/general/shuffle.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { moveCard } from '../move-card-bundle/move-card.js';
import { shuffleZone } from './shuffle-zone.js';
import { setupDealPlan } from '../general/setup-deal.mjs';

// Draw starting hand of 7 and prize 6.
// moveCard is async (ensureCardData). Firing the loop without await raced
// every deal off deck[0]; the sync log sometimes showed only 3 prize moves.
export const drawHand = async (user, initiator) => {
  const moveOpts = systemState.syncReplaying ? { syncReplay: true } : {};
  const plan = setupDealPlan(getZone(user, 'deck').getCount());
  for (let i = 0; i < plan.hand; i++) {
    await moveCard(user, initiator, 'deck', 'hand', 0, false, moveOpts);
  }
  for (let i = 0; i < plan.prizes; i++) {
    await moveCard(user, initiator, 'deck', 'prizes', 0, false, moveOpts);
  }
};

export const discardAndDraw = async (user, initiator, drawAmount, emit = true) => {
  drawAmount =
    typeof drawAmount === 'number'
      ? drawAmount
      : parseInt(window.prompt('Draw how many cards?', '0'));
  const selectedDeckCount = getZone(user, 'deck').getCount();
  const discardAmount = getZone(user, 'hand').getCount();
  drawAmount = Math.min(drawAmount, selectedDeckCount);

  const oInitiator = initiator === 'self' ? 'opp' : 'self';
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'discardAndDraw', [oInitiator, drawAmount]);
    return;
  }

  if (!isNaN(drawAmount) && drawAmount >= 0) {
    for (let i = 0; i < discardAmount; i++) {
      await moveCard(user, initiator, 'hand', 'discard', 0);
    }
    for (let i = 0; i < drawAmount; i++) {
      await moveCard(user, initiator, 'deck', 'hand', 0);
    }

    let message;
    if (drawAmount > 0) {
      message =
        determineUsername(initiator) +
        ' discarded hand and drew ' +
        drawAmount +
        ' card(s)';
    } else {
      message = determineUsername(initiator) + ' discarded hand';
    }
    appendMessage(initiator, message, 'player', false);
  } else {
    window.alert('Please enter a valid number for the draw amount.');
    emit = false;
  }

  processAction(user, emit, 'discardAndDraw', [oInitiator, drawAmount]);
};

export const shuffleAndDraw = async (
  user,
  initiator,
  drawAmount,
  indices,
  emit = true
) => {
  drawAmount =
    typeof drawAmount === 'number'
      ? drawAmount
      : parseInt(window.prompt('Draw how many cards?', '0'));
  const selectedDeckCount = getZone(user, 'deck').getCount();
  const shuffleAmount = getZone(user, 'hand').getCount();
  drawAmount = Math.min(drawAmount, selectedDeckCount + shuffleAmount);

  const oInitiator = initiator === 'self' ? 'opp' : 'self';
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'shuffleAndDraw', [
      oInitiator,
      drawAmount,
      indices,
    ]);
    return;
  }

  if (!isNaN(drawAmount) && drawAmount >= 0) {
    for (let i = 0; i < shuffleAmount; i++) {
      await moveCard(user, initiator, 'hand', 'deck', 0);
    }
    const newDeckCount = getZone(user, 'deck').getCount();
    indices = indices ? indices : shuffleIndices(newDeckCount);
    shuffleZone(user, initiator, 'deck', indices, false, false);
    for (let i = 0; i < drawAmount; i++) {
      await moveCard(user, initiator, 'deck', 'hand', 0);
    }
    let message;
    if (drawAmount > 0) {
      message =
        determineUsername(initiator) +
        ' shuffled hand into deck and drew ' +
        drawAmount +
        ' card(s)';
    } else {
      message = determineUsername(initiator) + ' shuffled hand into deck';
    }
    appendMessage(initiator, message, 'player', false);
  } else {
    window.alert('Please enter a valid number for the draw amount.');
    emit = false;
  }

  processAction(user, emit, 'shuffleAndDraw', [
    oInitiator,
    drawAmount,
    indices,
  ]);
};

export const shuffleBottomAndDraw = async (
  user,
  initiator,
  drawAmount,
  indices,
  emit = true
) => {
  drawAmount =
    typeof drawAmount === 'number'
      ? drawAmount
      : parseInt(window.prompt('Draw how many cards?', '0'));
  const selectedDeckCount = getZone(user, 'deck').getCount();
  const shuffleAmount = getZone(user, 'hand').getCount();
  drawAmount = Math.min(drawAmount, selectedDeckCount + shuffleAmount);

  const oInitiator = initiator === 'self' ? 'opp' : 'self';
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'shuffleBottomAndDraw', [
      oInitiator,
      drawAmount,
      indices,
    ]);
    return;
  }

  if (!isNaN(drawAmount) && drawAmount >= 0) {
    indices = indices ? indices : shuffleIndices(shuffleAmount);
    shuffleZone(user, initiator, 'hand', indices, false, false);
    for (let i = 0; i < shuffleAmount; i++) {
      await moveCard(user, initiator, 'hand', 'deck', 0);
    }
    for (let i = 0; i < drawAmount; i++) {
      await moveCard(user, initiator, 'deck', 'hand', 0);
    }
    let message;
    if (drawAmount > 0) {
      message =
        determineUsername(initiator) +
        ' shuffled hand to bottom of deck and drew ' +
        drawAmount +
        ' card(s)';
    } else {
      message =
        determineUsername(initiator) + ' shuffled hand to bottom of deck';
    }
    appendMessage(initiator, message, 'player', false);
  } else {
    window.alert('Please enter a valid number for the draw amount.');
    emit = false;
  }

  processAction(user, emit, 'shuffleBottomAndDraw', [
    oInitiator,
    drawAmount,
    indices,
  ]);
};
