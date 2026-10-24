// Loads the TCG Live foil manifest and texture host once (design 069). Until both arrive, or when either cannot
// be loaded, every card takes the CSS holo path, so a missing manifest.json or an unconfigured texture host
// (/api/tcgl-foil/config answers textureBase: null) disables the feature without code changes.
import { FOIL_ASSET_ROOT, mergeCustomFoil, parseCustomFoil, parseFoilManifest } from './tcgl-foil-manifest.mjs';

export const FOIL_CONFIG_URL = '/api/tcgl-foil/config';

let parsedManifest = null;
let textureBase = null;
let manifestPromise = null;

const getJson = (fetchImpl, url) =>
  fetchImpl(url).then((response) => {
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  });

// The config names each custom set that ships a foil.json (design 075): `customFoil: [{ setId, url }]`. A set whose
// file is missing or malformed is skipped with a warning; it never takes the TCG Live foil down with it.
const mergeCustomSets = (fetchImpl, parsed, sets) =>
  Promise.all(
    (Array.isArray(sets) ? sets : []).map(({ setId, url } = {}) =>
      getJson(fetchImpl, url)
        .then((json) => mergeCustomFoil(parsed, parseCustomFoil(setId, json)))
        .catch((error) => console.warn(`custom set foil ${setId} skipped: ${error.message}`))
    )
  );

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
      return mergeCustomSets(fetchImpl, parsed, config.customFoil).then(() => {
        parsedManifest = parsed;
        return parsedManifest;
      });
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
