// Which deck box (or other cosmetic) id the builder shows, saves and imports (design 071). Pure, so the
// rules that decide between a loaded deck's own record and the "nothing loaded" mirror are tested.

/**
 * The id the editor shows: the loaded deck's own record, else the mirror of the last pick.
 *
 * @param {{ loadedDeckId: string|null|undefined, activeId: string|null|undefined, mirrored: string|null|undefined }} state
 * @returns {string|null}
 */
export const effectiveCosmeticId = ({ loadedDeckId, activeId, mirrored }) =>
  (loadedDeckId ? activeId : mirrored) ?? null;

/**
 * The `deckBoxId` a Save passes to the snapshot. With a deck loaded the library record already holds
 * every pick (each one commits at once), so `undefined` leaves it: another builder tab's newer pick is
 * never overwritten by this tab's copy. With nothing loaded the mirror seeds the new deck.
 *
 * @returns {string|null|undefined}
 */
export const deckBoxIdForSave = ({ loadedDeckId, mirrored }) => (loadedDeckId ? undefined : (mirrored ?? null));

/**
 * A CSV's `#DECKBOX` id as the value to apply: `null` for the default box (stored as null, never as its
 * id), the id for a listed box, `undefined` to ignore it (absent, unknown to this build, or the catalog
 * has not loaded).
 *
 * @param {{ default: string, boxes: { id: string }[] }|null} catalog
 * @returns {string|null|undefined}
 */
export function importedDeckBoxId(catalog, id) {
  if (!id || !catalog) return undefined;
  if (id === catalog.default) return null;
  return catalog.boxes.some((box) => box.id === id) ? id : undefined;
}
