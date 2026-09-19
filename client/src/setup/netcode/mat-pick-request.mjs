/**
 * @file Maps a server PendingChoice whose options are all in-play Pokémon onto
 * the mat picker (the legacy click-the-card UI, D19).
 *
 * Pure and DOM-free so it runs under `node --test`; the browser adapter
 * (`mat-picker-adapter.js`) only forwards the result to `openMatPick`. The
 * registry is apply-view.js's `cardRegistry` (instanceId -> rendered record),
 * passed in so this module never touches the DOM itself.
 */

const PLAY_ZONES = new Set(['active', 'bench']);

const clampCount = (value, fallback) =>
  Number.isInteger(value) && value >= 0 ? value : fallback;

// An in-play Pokémon root: a board-zone card that is not attached under another
// card. Attached Energy/Tools share the zone array but are not mat targets (the
// hit-test would resolve an attachment click to its host, i.e. the wrong id).
function isInPlayPokemon(record) {
  if (!record?.element || !PLAY_ZONES.has(record.zone)) return false;
  return record.card?.attachedTo == null;
}

/**
 * @param {object} choice PendingChoice from the authoritative view
 * @param {Map<number, {instanceId:number, element:any, zone:string, card?:object, holoCard?:object}>} registry
 * @returns {{title:string, candidates:Array, cancellable:boolean, min:number, max:number}|null}
 *   mat-picker args, or null when the choice is not an in-play-Pokémon pick.
 */
export function buildMatPickerRequest(choice, registry) {
  const options = Array.isArray(choice?.options) ? choice.options : [];
  if (options.length === 0) return null;

  const records = options.map((opt) => registry?.get?.(opt.instanceId));
  if (records.some((record) => !isInPlayPokemon(record))) {
    return null;
  }

  const minRaw = clampCount(choice.min, 1);
  const maxRaw = clampCount(choice.max, 1);
  const min = Math.min(minRaw, options.length);
  // The mat picker toggles cards and confirms; a multi-pick is allowed here, so
  // the same request shape covers both single-click and choose-N choices.
  const max = Math.max(min, Math.min(Math.max(maxRaw, 1), options.length));

  return {
    title: choice.prompt || 'Choose a Pokémon',
    candidates: records.map((record, i) => ({
      instanceId: record.instanceId ?? options[i].instanceId,
      name: record.card?.name || options[i].name || '',
      image: record.element,
      wrapper: record.holoCard?.wrapper,
    })),
    // A required pick (min ≥ 1) cannot be declined; only an optional choice gets
    // the Cancel affordance and reports an empty selection.
    cancellable: min === 0,
    min,
    max,
  };
}
