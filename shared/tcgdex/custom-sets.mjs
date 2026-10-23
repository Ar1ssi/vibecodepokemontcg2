// Client-side knowledge of custom sets (design 075): id shapes, the image-path → id mapping and the
// `/api/custom-sets` manifest the server builds from client/src/assets/custom-sets/*/set.json.
// The card records themselves come through the TCGdex proxy like every other card.

import {
  CUSTOM_CARD_ID_RE,
  CUSTOM_SETS_IMAGE_ROOT,
  isCustomCardId,
  isCustomSetId,
} from '../custom-sets/custom-set-schema.mjs';

export { isCustomCardId, isCustomSetId };

export const CUSTOM_SETS_MANIFEST_PATH = '/api/custom-sets';

const PLACEHOLDER_ORIGIN = 'http://custom-sets.invalid';

/**
 * `/src/assets/custom-sets/customhbw/001/high.webp` → "customhbw-001", else null. Relative URLs and this page's own
 * origin only: another host's copy of the path is not one of our cards.
 */
export function customCardIdFromImageUrl(src, pageOrigin = globalThis.location?.origin) {
  if (typeof src !== 'string' || !src) return null;
  let url;
  try {
    url = new URL(src, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN && url.origin !== pageOrigin) return null;
  const { pathname } = url;
  if (!pathname.startsWith(`${CUSTOM_SETS_IMAGE_ROOT}/`)) return null;
  const [setId, localId] = pathname.slice(CUSTOM_SETS_IMAGE_ROOT.length + 1).split('/');
  const id = `${setId}-${localId}`;
  return CUSTOM_CARD_ID_RE.test(id) ? id : null;
}

const EMPTY_MANIFEST = Object.freeze({ sets: [] });

function normalizeManifest(value) {
  const sets = Array.isArray(value?.sets) ? value.sets : [];
  return {
    sets: sets
      .filter((set) => isCustomSetId(set?.id) && typeof set.code === 'string' && typeof set.name === 'string')
      .map((set) => ({
        id: set.id,
        code: set.code,
        name: set.name,
        cardCount: Number.isInteger(set.cardCount) ? set.cardCount : 0,
        releaseDate: typeof set.releaseDate === 'string' ? set.releaseDate : '',
      })),
  };
}

let manifestPromise = null;

/**
 * The installed custom sets, fetched once per page (a failed fetch is not remembered, so the next
 * call retries). Outside a browser (no `location`), or on any failure, resolves to `{ sets: [] }`.
 * @param {{ fetchImpl?: typeof fetch, force?: boolean }} [options]
 */
export function fetchCustomSetManifest({ fetchImpl = globalThis.fetch, force = false } = {}) {
  if (manifestPromise && !force) return manifestPromise;
  const origin = globalThis.location?.origin;
  if (typeof fetchImpl !== 'function' || typeof origin !== 'string' || !/^https?:\/\//.test(origin)) {
    return Promise.resolve(EMPTY_MANIFEST);
  }
  const attempt = (async () => {
    const response = await fetchImpl(`${origin}${CUSTOM_SETS_MANIFEST_PATH}`);
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    return normalizeManifest(await response.json());
  })().catch(() => {
    // forget this attempt only if it is still the one being shared (a sync throw settles before the assignment below)
    if (manifestPromise === attempt) manifestPromise = null;
    return EMPTY_MANIFEST;
  });
  manifestPromise = attempt;
  return attempt;
}

/** `{ HBW: "customhbw", … }` — the decklist set codes a manifest adds. */
export function customSetCodes(manifest) {
  const codes = {};
  for (const set of normalizeManifest(manifest).sets) codes[set.code] = set.id;
  return codes;
}
