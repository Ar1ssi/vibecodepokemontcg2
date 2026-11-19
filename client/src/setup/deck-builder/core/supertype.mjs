/**
 * The one reader of a card's supertype string, which records spell 'Pokémon' or 'Pokemon' and any case.
 * @returns {'pokemon'|'trainer'|'energy'|null} null for anything else, so callers decide what an unknown card is.
 */
export function parseSupertype(value) {
  const key = String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  return key === 'pokemon' || key === 'trainer' || key === 'energy' ? key : null;
}
