// Chat announcements when a search/look effect reveals picked cards to the opponent.

import {
  closeDeckSearchAccess,
  deckSearchAccessReason,
  sourceNameFromDeckSearchReason,
} from './deck-search-access.mjs';

let lastSearchShuffleAt = 0;
const SEARCH_SHUFFLE_DEDUPE_MS = 400;

/** Post a broadcast chat line naming revealed card(s). */
export function announceSearchReveal(user, sourceName, picked, appendMessage) {
  const cards = (Array.isArray(picked) ? picked : [picked]).filter(Boolean);
  const names = cards.map((c) => c.name || 'Card');
  if (!names.length) return;
  appendMessage(
    user,
    `👁️ Revealed (${sourceName}): ${names.join(', ')}`,
    'announcement',
    true
  );
}

/** Discard picks are always public — broadcast without requiring "reveal" in text. */
export function announceDiscardPick(user, sourceName, picked, appendMessage) {
  announceSearchReveal(user, sourceName, picked, appendMessage);
}

/** Shuffle after a deck search/look and post a rules-style chat line (not the generic player-action shuffle). */
export function shuffleDeckAfterSearch(
  user,
  appendMessage,
  shuffleZone,
  { sourceName, message } = {}
) {
  const now = Date.now();
  if (now - lastSearchShuffleAt < SEARCH_SHUFFLE_DEDUPE_MS) return;
  lastSearchShuffleAt = now;

  const label = sourceName || sourceNameFromDeckSearchReason(deckSearchAccessReason());

  shuffleZone(user, user, 'deck', undefined, false);
  closeDeckSearchAccess();
  if (message === null) return;
  const text =
    message ??
    (label ? `  🔀 ${label} — deck shuffled` : '  🔀 deck shuffled');
  appendMessage(user, text, 'announcement', false);
}

/** Reveal when the parsed step or source text calls for it. */
export function maybeAnnounceSearchReveal(
  user,
  sourceName,
  picked,
  appendMessage,
  { step, sourceText } = {}
) {
  const text = String(sourceText || '').toLowerCase();
  const shouldReveal = step?.reveal === true || /\breveal\b/.test(text);
  if (!shouldReveal) return;
  announceSearchReveal(user, sourceName, picked, appendMessage);
}
