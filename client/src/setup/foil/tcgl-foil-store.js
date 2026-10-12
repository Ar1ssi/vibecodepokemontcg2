// Loads the TCG Live foil manifest once (design 069). Until it arrives, or when it cannot be loaded, every card
// takes the CSS holo path, so a missing manifest.json disables the feature without code changes.
import { FOIL_ASSET_ROOT, parseFoilManifest } from './tcgl-foil-manifest.mjs';

let parsedManifest = null;
let manifestPromise = null;

/** @returns {Promise<object|null>} the parsed manifest, or null when it is missing or malformed. */
export function loadFoilManifest(fetchImpl = globalThis.fetch) {
  if (manifestPromise) return manifestPromise;
  if (typeof fetchImpl !== 'function') return Promise.resolve(null);
  manifestPromise = fetchImpl(`${FOIL_ASSET_ROOT}/manifest.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((json) => {
      parsedManifest = parseFoilManifest(json);
      return parsedManifest;
    })
    .catch((error) => {
      console.warn(`TCG Live foil disabled: manifest not loaded (${error.message})`);
      return null;
    });
  return manifestPromise;
}

/** The parsed manifest if it has already loaded, else null (callers then use the CSS holo). */
export const foilManifestNow = () => parsedManifest;
