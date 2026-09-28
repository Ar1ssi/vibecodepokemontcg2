import { reset } from '../../actions/general/reset.js';
import {
  oppContainerDocument,
  selfContainerDocument,
} from '../../initialization/global-variables/containers.js';
import { systemState } from '../../initialization/global-variables/global-variables.js';
import { appendMessage } from '../chatbox/append-message.js';
import { determineUsername } from '../general/determine-username.js';
import { processAction } from '../general/process-action.js';
import { resolveDefaultCardBackSrc } from './default-card-back.mjs';
import { shouldResetBoardOnDeckData } from './opp-board-reset.mjs';
import { DECK_FORMAT_BUILD_BATTLE } from '../../../../shared/engine/formats.mjs';
import { deckFormatSlot, resolveFormatAndEmit } from './deck-format-args.mjs';
import { rememberOwnDeck } from './own-deck.mjs';

// Decks are built and loaded in the deck builder's own tab (design 050); this
// module keeps the board-side loaders it calls and the Deck tab's card back.
const changeCardBackButton = document.getElementById('changeCardBackButton');
const mainImportHeaderButton = document.getElementById('mainImportHeaderButton');

// Wire parameters are [deckData, format]; see deck-format-args.mjs for the argument order.
export const loadDeckData = (user, deckData, format, emitArg) => {
  const { format: deckFormat, emit } = resolveFormatAndEmit(format, emitArg);
  systemState.deckFormat[deckFormatSlot(user, systemState.isTwoPlayer)] = deckFormat;
  if (user === 'self') {
    systemState.selfDeckData = deckData;
    // Replays (emit=false) may carry another player's deck; only a local load is ours.
    if (emit) rememberOwnDeck(systemState, deckData, deckFormat);
  } else if (systemState.isTwoPlayer) {
    systemState.p2OppDeckData = deckData;
  } else {
    systemState.p1OppDeckData = deckData;
  }
  if (shouldResetBoardOnDeckData(user, systemState)) {
    reset(user, true, true, false, false);
  }
  if (deckData) {
    appendMessage(
      '',
      determineUsername(user) +
        ' loaded deck' +
        (deckFormat === DECK_FORMAT_BUILD_BATTLE ? ' (Build & Battle: 40 cards, 4 Prizes)' : ''),
      'announcement',
      false
    );
  }
  // Notify the native deck builder so it can sync its state after a load.
  document.dispatchEvent(
    new CustomEvent('native-deck-builder:deck-loaded', {
      detail: { user, deckData },
    })
  );
  processAction(user, emit, 'loadDeckData', [deckData, deckFormat]);
};

// ************ logic for changing cardbacks********************//
export const changeCardBack = (user, userInput, emit = true) => {
  const containerDocument =
    user === 'self' ? selfContainerDocument : oppContainerDocument;
  // `img.src` is always the browser-resolved absolute URL; the tracked
  // systemState values are stored as-typed (often relative, e.g. the
  // default '/src/assets/cardback.png'). Comparing them raw silently never
  // matches, so a stale cover image is never repainted (only a full
  // buildDeck rebuild — e.g. leaving and rejoining the room — ever shows
  // the correct sleeve). Resolve both sides against the iframe's own
  // document before comparing.
  const resolve = (src) => {
    if (!src) return src;
    try {
      return new URL(src, containerDocument.baseURI).href;
    } catch {
      return src;
    }
  };
  const oldSrcs = new Set(
    [
      systemState.cardBackSrc,
      systemState.p1OppCardBackSrc,
      systemState.p2OppCardBackSrc,
    ]
      .map(resolve)
      .filter(Boolean)
  );
  containerDocument.querySelectorAll('img').forEach((img) => {
    if (oldSrcs.has(img.src)) {
      img.src = userInput;
    }
  });
  if (user === 'self') {
    systemState.cardBackSrc = userInput;
  } else if (systemState.isTwoPlayer) {
    systemState.p2OppCardBackSrc = userInput;
  } else {
    systemState.p1OppCardBackSrc = userInput;
  }

  processAction(user, emit, 'changeCardBack', [userInput]);
};

changeCardBackButton.addEventListener('click', () => {
  let userInput = window.prompt("Paste your image URL or type 'default':");
  const user = mainImportHeaderButton.classList.contains('main-select') ? 'self' : 'opp';

  if (
    userInput !== null &&
    userInput.trim() !== '' &&
    userInput.toLowerCase() === 'default'
  ) {
    userInput = resolveDefaultCardBackSrc();
  }
  const img = new Image();
  img.onload = () => {
    if (user === 'self' || !systemState.isTwoPlayer) {
      changeCardBack(user, userInput);
    } else {
      changeCardBack(user, userInput, false);
    }
  };
  img.onerror = () => {
    alert('Please enter a valid image URL.');
  };
  img.src = userInput;
});
