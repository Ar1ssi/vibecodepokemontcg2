/** Face-up image URL for sync hints (hidden hands store the face in src2). */
export function cardFaceSrc(card) {
  const img = card?.image;
  if (!img) return '';
  return img.src2 || img.src || '';
}

export function buildCardHint(card) {
  if (!card) return null;
  const src = cardFaceSrc(card);
  const name = card.name || '';
  const hint = { src, name };
  if (card.number) hint.number = card.number;
  if (card.set) hint.set = card.set;
  if (card.id) hint.id = card.id;
  if (card.cardId != null) {
    hint.cardId = card.cardId;
  }
  if (card.syncInstance != null) {
    hint.syncInstance = card.syncInstance;
  }
  if (
    !src &&
    !name &&
    hint.syncInstance == null &&
    hint.cardId == null
  ) {
    return null;
  }
  return hint;
}

export function cardMatchesHint(card, hint) {
  if (!card || !hint) return false;

  if (hint.cardId != null && card.cardId != null && hint.cardId === card.cardId) {
    return true;
  }

  if (
    hint.syncInstance != null &&
    card.syncInstance != null &&
    String(card.syncInstance) === String(hint.syncInstance)
  ) {
    return true;
  }

  const src = cardFaceSrc(card);
  if (hint.src && src && hint.src === src) {
    if (hint.number && card.number && String(hint.number) !== String(card.number)) {
      return false;
    }
    if (hint.set && card.set && hint.set !== card.set) return false;
    if (hint.id && card.id && hint.id !== card.id) return false;
    return true;
  }

  if (hint.name && card.name === hint.name) {
    if (hint.number && card.number && String(hint.number) !== String(card.number)) {
      return false;
    }
    if (hint.set && card.set && hint.set !== card.set) return false;
    if (hint.id && card.id && hint.id !== card.id) return false;
    if (!hint.src) return true;
  }

  return false;
}

/** Resolve a zone index from an optional sync hint, falling back to the relayed index. */
export function resolveCardIndex(zone, hint, fallbackIndex) {
  const arr = zone?.array;
  if (!arr?.length) return typeof fallbackIndex === 'number' ? fallbackIndex : -1;

  // Support direct card reference as fallbackIndex
  if (typeof fallbackIndex === 'object' && fallbackIndex !== null) {
    const directIdx = arr.indexOf(fallbackIndex);
    if (directIdx >= 0) return directIdx;
    hint = hint || buildCardHint(fallbackIndex);
  } else if (typeof fallbackIndex === 'string' && isNaN(Number(fallbackIndex))) {
    // fallbackIndex is a cardId/syncInstance string
    const byId = arr.findIndex((c) => c.cardId === fallbackIndex || String(c.syncInstance) === fallbackIndex);
    if (byId >= 0) return byId;
  }

  // Support string or number ID passed directly as hint
  if (typeof hint === 'string' || typeof hint === 'number') {
    const byId = arr.findIndex((c) => c.cardId === hint || String(c.syncInstance) === String(hint));
    if (byId >= 0) return byId;
  }

  if (hint && hint.cardId != null) {
    const byCardId = arr.findIndex((c) => c.cardId === hint.cardId);
    if (byCardId >= 0) return byCardId;
  }

  if (hint && hint.syncInstance != null) {
    const byInstance = arr.findIndex(
      (c) => c.syncInstance != null && String(c.syncInstance) === String(hint.syncInstance)
    );
    if (byInstance >= 0) return byInstance;
  }

  // Trust the relay index when it still identifies the intended card (handles
  // duplicate printings that share the same image URL).
  if (
    typeof fallbackIndex === 'number' &&
    fallbackIndex >= 0 &&
    fallbackIndex < arr.length &&
    (!hint || cardMatchesHint(arr[fallbackIndex], hint))
  ) {
    return fallbackIndex;
  }

  if (hint) {
    const matches = arr
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => cardMatchesHint(c, hint));
    if (matches.length === 1) return matches[0].i;
    if (matches.length > 1 && typeof fallbackIndex === 'number') {
      const nearest = matches.reduce((best, cur) =>
        Math.abs(cur.i - fallbackIndex) < Math.abs(best.i - fallbackIndex)
          ? cur
          : best
      );
      return nearest.i;
    }
    if (matches.length > 0) return matches[0].i;
  }

  if (
    typeof fallbackIndex === 'number' &&
    fallbackIndex >= 0 &&
    fallbackIndex < arr.length
  ) {
    return fallbackIndex;
  }

  return typeof fallbackIndex === 'number' ? fallbackIndex : -1;
}

/** True when the card at index satisfies the relay hint (used before mirror replay). */
export function hintMatchesAtIndex(zone, index, hint) {
  if (!hint || !zone?.array?.length) return false;
  let idx = index;
  if (typeof idx === 'object' && idx !== null) {
    idx = zone.array.indexOf(idx);
  } else if (typeof idx === 'string' && isNaN(Number(idx))) {
    idx = zone.array.findIndex((c) => c.cardId === idx || String(c.syncInstance) === idx);
  }
  if (typeof idx !== 'number' || idx < 0 || idx >= zone.array.length) {
    return false;
  }
  return cardMatchesHint(zone.array[idx], hint);
}
