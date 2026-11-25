// Carousel and picker slides are built synchronously, so a card whose rarity isn't loaded yet (deck,
// Prize and search candidates never went through the mat's hydrateHolo) shows as a plain scan. This
// loads the card's data and the foil manifest, then swaps the plain <img> for its holo card.

/** The fields card-data lookup needs, copied so the lookup never mutates the zone's card. */
export const foilLookupCard = (card, src) => ({
  id: card?.id,
  name: card?.name,
  type: card?.type,
  set: card?.set,
  number: card?.number,
  image: { src },
});

/**
 * Resolves to the holo wrapper that replaced `img`, or null when the card has no foil, a lookup
 * failed, or the slide left the page (or was re-rendered) while the lookup ran.
 *
 * @param {object} card the slide's card
 * @param {HTMLImageElement} img the plain slide image to replace
 * @param {object} deps
 * @param {(card: object) => Promise<object>} deps.loadCardData resolves the card's TCGdex data
 * @param {() => Promise<object|null>} deps.loadManifest resolves the TCG Live foil manifest
 * @param {(card: object, manifest: object|null) => string|null} deps.resolveEffect foil effect or null
 * @param {(card: object, effect: string, manifest: object|null) => Element} deps.build the holo wrapper
 */
export async function upgradeSlideToHolo(card, img, { loadCardData, loadManifest, resolveEffect, build }) {
  const src = img?.getAttribute?.('src') ?? img?.src;
  if (!card || !src) return null;
  const lookup = foilLookupCard(card, src);
  let data;
  let manifest;
  try {
    [data, manifest] = await Promise.all([loadCardData(lookup), loadManifest()]);
  } catch {
    return null;
  }
  if (!img.isConnected) return null;
  const foilCard = { ...lookup, ...data, image: { src } };
  const effect = resolveEffect(foilCard, manifest ?? null);
  if (!effect) return null;
  const wrapper = build(foilCard, effect, manifest ?? null);
  if (!wrapper) return null;
  img.replaceWith(wrapper);
  return wrapper;
}
