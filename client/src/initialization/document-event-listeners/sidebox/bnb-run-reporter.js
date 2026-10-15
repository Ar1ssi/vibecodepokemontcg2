import { reportMatchResult } from '../../../setup/deck-builder/core/build-battle-run/run-reporter.mjs';
import { deckFormatOf } from '../../../setup/deck-constructor/deck-format-args.mjs';
import { systemState } from '../../../state.js';

// Reading `window.localStorage` itself throws when site data is blocked.
const browserStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * Game tab only (design 071): a finished game fills the next node of a Build & Battle run that the
 * builder's lobby armed. `rules-game-ended` fires once per game from the netcode end screen.
 * @param {{document?: Document, storage?: Storage|null, getDeckFormat?: () => string}} [options]
 *   `getDeckFormat` is the format the local player's deck was dealt under.
 * @returns {() => void} removes the listener
 */
export const installRunReporter = ({
  document: doc = document,
  storage = browserStorage(),
  getDeckFormat = () => deckFormatOf(systemState, 'self'),
} = {}) => {
  const onGameEnded = (event) => {
    reportMatchResult(storage, event.detail, { deckFormat: getDeckFormat() });
  };
  doc.addEventListener('rules-game-ended', onGameEnded);
  return () => doc.removeEventListener('rules-game-ended', onGameEnded);
};
