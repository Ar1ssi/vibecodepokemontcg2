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
  if (typeof card.syncInstance === 'number') {
    hint.syncInstance = card.syncInstance;
  }
  if (
    !src &&
    !name &&
    typeof hint.syncInstance !== 'number'
  ) {
    return null;
  }
  return hint;
}

export function cardMatchesHint(card, hint) {
  if (!card || !hint) return false;

  if (
    typeof hint.syncInstance === 'number' &&
    card.syncInstance === hint.syncInstance
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

  if (hint && typeof hint.syncInstance === 'number') {
    const byInstance = arr.findIndex((c) => c.syncInstance === hint.syncInstance);
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
  if (typeof index !== 'number' || index < 0 || index >= zone.array.length) {
    return false;
  }
  return cardMatchesHint(zone.array[index], hint);
}
