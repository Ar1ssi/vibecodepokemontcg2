// Loads the TCG Live foil manifest and texture host once (design 069). Until both arrive, or when either cannot
// be loaded, every card takes the CSS holo path, so a missing manifest.json or an unconfigured texture host
// (/api/tcgl-foil/config answers textureBase: null) disables the feature without code changes.
import { FOIL_ASSET_ROOT, parseFoilManifest } from './tcgl-foil-manifest.mjs';

export const FOIL_CONFIG_URL = '/api/tcgl-foil/config';

let parsedManifest = null;
let textureBase = null;
let manifestPromise = null;

const getJson = (fetchImpl, url) =>
  fetchImpl(url).then((response) => {
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  });

/** @returns {Promise<object|null>} the parsed manifest, or null when it or the texture host is unavailable. */
export function loadFoilManifest(fetchImpl = globalThis.fetch) {
  if (manifestPromise) return manifestPromise;
  if (typeof fetchImpl !== 'function') return Promise.resolve(null);
  manifestPromise = Promise.all([getJson(fetchImpl, FOIL_CONFIG_URL), getJson(fetchImpl, `${FOIL_ASSET_ROOT}/manifest.json`)])
    .then(([config, json]) => {
      const base = config?.textureBase;
      if (typeof base !== 'string' || !base) throw new Error('no texture host configured');
      const parsed = parseFoilManifest(json);
      textureBase = base.replace(/\/+$/, '');
      parsedManifest = parsed;
      return parsedManifest;
    })
    .catch((error) => {
      console.warn(`TCG Live foil disabled: ${error.message}`);
      return null;
    });
  return manifestPromise;
}

/** The parsed manifest if it has already loaded, else null (callers then use the CSS holo). */
export const foilManifestNow = () => parsedManifest;

/** Where card and material textures are fetched from; null until the manifest has loaded. */
export const foilTextureBase = () => textureBase;
