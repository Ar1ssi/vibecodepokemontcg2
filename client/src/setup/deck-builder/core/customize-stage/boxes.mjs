// The TCG Live deck box catalog (design 071): lookup and filtering over assets/deckbox/boxes.json.
// Pure over a catalog value; `loadBoxCatalog` is the only fetch.
import { nextIndex } from './stage-math.mjs';

export const BOX_ASSET_DIR = '/src/assets/deckbox/';

let catalogPromise = null;

/** The catalog file, loaded once; a failed load is retried next time. */
export const loadBoxCatalog = () => {
  catalogPromise ??= fetch(`${BOX_ASSET_DIR}boxes.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`boxes.json: HTTP ${response.status}`);
      return response.json();
    })
    .catch((error) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
};

/** The default box entry; a catalog always lists it (the importer refuses one that does not). */
export const defaultBox = (catalog) => catalog.boxes.find((box) => box.id === catalog.default) ?? catalog.boxes[0];

/** The box with `id`, or the default for null, undefined and an id the catalog does not list. */
export const boxById = (catalog, id) => catalog.boxes.find((box) => box.id === id) ?? defaultBox(catalog);

export const boxAtlasUrl = (box) => `${BOX_ASSET_DIR}${box.atlas}`;
export const boxThumbUrl = (box) => `${BOX_ASSET_DIR}${box.thumb}`;

/** Boxes whose name or id contains every word of `term` (case-insensitive); an empty term keeps all. */
export function filterBoxes(boxes, term = '') {
  const words = String(term).toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return boxes;
  return boxes.filter((box) => {
    const haystack = `${box.name} ${box.id}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * The id `dir` (±1) steps from `currentId` through [default, ...boxes], wrapping. The default box is
 * stored as null, so stepping onto it returns null. An unknown current id steps from the default.
 */
export function stepBoxId(catalog, currentId, dir) {
  const ids = [null, ...catalog.boxes.filter((box) => box.id !== catalog.default).map((box) => box.id)];
  const at = Math.max(0, ids.indexOf(currentId ?? null));
  return ids[nextIndex(at, dir, ids.length)];
}
