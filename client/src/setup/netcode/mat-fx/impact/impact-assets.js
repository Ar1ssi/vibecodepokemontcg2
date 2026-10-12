// Design 068: fetch and decode the attack-impact assets the importer wrote to
// client/src/assets/fx/attack (pnpm fx:import-attack). The shared tables load once, each
// TCG type's prefabs and textures on first need; everything stays cached for the session.
// A failed load is forgotten, so the next attack tries again (design 068 edge 6).

const BASE_URL = '/src/assets/fx/attack/';
const CARD_ART_CACHE = 12;
// Textures hold data (masks, flow maps) as well as colour: no alpha premultiply, no colour
// conversion, and flipped so UV (0, 0) is the bottom-left texel as it is in Unity.
const BITMAP_OPTIONS = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

let sharedPromise = null;
const typePromises = new Map();
const loadedTypes = new Map();
const images = new Map();
const cardArt = new Map();

const fetchOk = async (url, init) => {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
};
const fetchJson = async (name) => (await fetchOk(`${BASE_URL}${name}`)).json();
const fetchBitmap = async (url, init) => createImageBitmap(await (await fetchOk(url, init)).blob(), BITMAP_OPTIONS);

const loadShared = () => {
  sharedPromise ??= Promise.all([fetchJson('shaders.json'), fetchJson('meshes.json'), fetchJson('textures.json')])
    .then(([shaders, meshes, textures]) => ({ shaders, meshes, textures }))
    .catch((error) => {
      sharedPromise = null;
      throw error;
    });
  return sharedPromise;
};

const loadTexture = async (name, entry) => {
  if (!images.has(name)) images.set(name, await fetchBitmap(`${BASE_URL}textures/${encodeURIComponent(entry.file)}`));
};

/**
 * Everything one TCG type's impacts need: `{file, shaders, meshes, textures, images}` where
 * `file` is the type's JSON, `textures` the manifest and `images` a Map name → ImageBitmap.
 * Rejects when any part fails; a later call retries.
 * @param {string} type a TCG type id ('fire', 'darkness', …)
 */
export function loadImpactAssets(type) {
  if (!typePromises.has(type)) {
    const promise = Promise.all([loadShared(), fetchJson(`${encodeURIComponent(type)}.json`)])
      .then(async ([shared, file]) => {
        await Promise.all(file.textures.map((name) => loadTexture(name, shared.textures[name])));
        const assets = { file, ...shared, images };
        loadedTypes.set(type, assets);
        return assets;
      })
      .catch((error) => {
        typePromises.delete(type);
        throw error;
      });
    typePromises.set(type, promise);
  }
  return typePromises.get(type);
}

/** The assets of a type that has finished loading, else null. */
export const loadedImpactAssets = (type) => loadedTypes.get(type) ?? null;

/**
 * A card's art as an ImageBitmap for the refraction materials, or null when the image host
 * does not allow cross-origin reads (the effect then bends only its own particles).
 * Resolves at once from the cache; never rejects.
 */
export function loadCardArt(src) {
  if (!src) return Promise.resolve(null);
  if (!cardArt.has(src)) {
    if (cardArt.size >= CARD_ART_CACHE) cardArt.delete(cardArt.keys().next().value);
    cardArt.set(
      src,
      fetchBitmap(src, { mode: 'cors' }).catch(() => null)
    );
  }
  return cardArt.get(src);
}
