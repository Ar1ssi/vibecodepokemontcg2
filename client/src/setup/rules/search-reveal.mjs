// Chat announcements when a search/look effect reveals picked cards to the opponent.

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
  shuffleZone(user, user, 'deck', undefined, false);
  if (message === null) return;
  const text =
    message ??
    (sourceName ? `  🔀 ${sourceName} — deck shuffled` : '  🔀 deck shuffled');
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
