/**
 * Active/bench zones keep the full evolution stack in `array`. After evolving,
 * energies point at the evolved card's <img>, but `array[0]` may still be the
 * base — attack/retreat energy checks must use the top of the stack.
 */
export function getActivePokemonCard(zone) {
  const arr = zone?.array;
  if (!arr?.length) return null;

  const inPlay = arr.filter(
    (c) => c.type === 'Pokémon' && !c.image?.attached
  );
  if (!inPlay.length) return arr[0] || null;

  const top = inPlay.find((candidate) =>
    inPlay.some(
      (other) =>
        other !== candidate && other.image?.relative === candidate.image
    )
  );
  return top || inPlay[0] || arr[0];
}

/** Energies attach to this image (top of evolution stack when evolved). */
export function pokemonEnergyHostImage(zone, fallbackCard) {
  const top = getActivePokemonCard(zone);
  return top?.image || fallbackCard?.image || null;
}

export function energiesAttachedToPokemon(zone, hostImage) {
  if (!hostImage || !zone?.array) return [];
  return zone.array.filter(
    (c) => c.type === 'Energy' && c.image?.relative === hostImage
  );
}

/** Top-level Pokémon in a zone (excludes attached cards and evolution bases). */
export function isBoardPokemon(card) {
  return (card?.type2 || card?.type) === 'Pokémon' && !card?.image?.attached;
}

/** Count benched Pokémon — attached Energy/Tools must not inflate the bench limit. */
export function countBenchPokemon(zone) {
  if (!zone?.array) return 0;
  return zone.array.filter(isBoardPokemon).length;
}
