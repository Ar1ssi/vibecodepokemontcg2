// Small rules the deck builder's closures and the unboxing scene would otherwise each restate.
// No DOM imports, so each one is tested directly.

/** The mirror / library side a load target names; anything but 'opp' is 'self'. */
export const sideOf = (target) => (target === 'opp' ? 'opp' : 'self');

/** `value` as text safe inside HTML markup and quoted attribute values. */
export const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** The picture a card shows at `size`, falling back to its small image, then its single `image`. */
export const cardImage = (card, size = 'small') =>
  card?.images?.[size] || card?.images?.small || card?.image || '';

/**
 * The image a preview opens on: the tile's own `data-preview-image`, else the card's large art,
 * else whatever `<img>` the tile shows.
 *
 * @param {{ dataset: { previewImage?: string }, querySelector: (selector: string) => { src?: string }|null }} tile
 */
export const cardPreviewImage = (tile, card) =>
  tile.dataset.previewImage || cardImage(card, 'large') || tile.querySelector('img')?.src;

/**
 * A name search that asks TCGdex once per name. A failed search is forgotten, so the next ask
 * retries instead of replaying the failure.
 *
 * @param {(query: { term: string }) => Promise<{ results: object[] }>} queryCards
 * @returns {(name: string) => Promise<object[]>}
 */
export const createNameSearch = (queryCards) => {
  const searches = new Map();
  return (name) => {
    if (!searches.has(name)) {
      const search = queryCards({ term: name }).then((found) => found.results);
      search.catch(() => searches.delete(name));
      searches.set(name, search);
    }
    return searches.get(name);
  };
};
