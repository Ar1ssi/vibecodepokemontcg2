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
