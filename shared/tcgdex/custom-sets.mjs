// Client-side knowledge of custom sets (design 075): id shapes, the image-path → id mapping and the
// `/api/custom-sets` manifest the server builds from client/src/assets/custom-sets/*/set.json.
// The card records themselves come through the TCGdex proxy like every other card.

import {
  CUSTOM_CARD_ID_RE,
  CUSTOM_SETS_CHANGED_EVENT,
  CUSTOM_SETS_IMAGE_ROOT,
  CUSTOM_SET_GROUPS,
  DEFAULT_CUSTOM_SET_GROUP,
  isCustomCardId,
  isCustomSetId,
} from '../custom-sets/custom-set-schema.mjs';

export { CUSTOM_SETS_CHANGED_EVENT, isCustomCardId, isCustomSetId };

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
        group: CUSTOM_SET_GROUPS.includes(set.group) ? set.group : DEFAULT_CUSTOM_SET_GROUP,
      })),
  };
}

let manifestPromise = null;

/**
 * The installed custom sets, fetched once per page (a failed fetch is not remembered, so the next
 * call retries). Outside a browser (no `location`), or on any failure, resolves to `{ sets: [] }` — except a
 * forced refetch, which keeps the manifest it was replacing when it fails.
 * @param {{ fetchImpl?: typeof fetch, force?: boolean }} [options]
 */
export function fetchCustomSetManifest({ fetchImpl = globalThis.fetch, force = false } = {}) {
  if (manifestPromise && !force) return manifestPromise;
  const origin = globalThis.location?.origin;
  if (typeof fetchImpl !== 'function' || typeof origin !== 'string' || !/^https?:\/\//.test(origin)) {
    return Promise.resolve(EMPTY_MANIFEST);
  }
  const previous = manifestPromise;
  const attempt = (async () => {
    const response = await fetchImpl(`${origin}${CUSTOM_SETS_MANIFEST_PATH}`);
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    return normalizeManifest(await response.json());
  })().catch(() => {
    // only if this attempt is still the one being shared (a sync throw settles before the assignment below)
    if (manifestPromise === attempt) manifestPromise = previous;
    return previous || EMPTY_MANIFEST;
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

// ---------------------------------------------------------------- live changes
// The server reloads a set folder the card editor rewrote and broadcasts CUSTOM_SETS_CHANGED_EVENT; panels
// showing custom cards subscribe here instead of to the socket.
const changeListeners = new Set();

/**
 * Called with `{ version, sets }` after a set changed on the server, once the manifest has been refetched.
 * @returns {() => void} unsubscribe
 */
export function onCustomSetsChanged(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/**
 * The socket handler for CUSTOM_SETS_CHANGED_EVENT: refetch the manifest (codes, pills, card counts), then
 * tell every listener. A listener that throws does not stop the others.
 * @param {{ version?: number, sets?: string[] }} change
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function noteCustomSetsChanged(change, { fetchImpl } = {}) {
  const sets = Array.isArray(change?.sets) ? change.sets.filter(isCustomSetId) : [];
  const notice = { version: Number.isInteger(change?.version) ? change.version : 0, sets };
  await fetchCustomSetManifest({ fetchImpl, force: true });
  for (const listener of [...changeListeners]) {
    try {
      listener(notice);
    } catch (error) {
      console.error('custom set change listener failed', error);
    }
  }
  return notice;
}
