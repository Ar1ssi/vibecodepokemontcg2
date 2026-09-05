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
  if (!src && !name) return null;
  return { src, name };
}

function cardMatchesHint(card, hint) {
  if (!card || !hint) return false;
  const src = cardFaceSrc(card);
  if (hint.src && src && hint.src === src) return true;
  if (hint.name && card.name === hint.name && !hint.src) return true;
  return false;
}

/** Resolve a zone index from an optional sync hint, falling back to the relayed index. */
export function resolveCardIndex(zone, hint, fallbackIndex) {
  const arr = zone?.array;
  if (!arr?.length) return typeof fallbackIndex === 'number' ? fallbackIndex : -1;

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
