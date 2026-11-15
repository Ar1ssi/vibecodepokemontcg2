// Word-form Pokémon types ("a Water Pokémon", "Basic Psychic Pokémon") as they
// appear on trainer/attack search clauses. Kept in sync with pokemonMatchesEnergyType,
// which understands both 'Darkness' and the data's 'Dark' spelling.
//
// A leaf module with no imports: trainer-effects reads it while the search grammar is
// itself imported by special-energy-parse, which search-match reaches through
// energy-effects. Importing it from search-match closed that loop and broke module order.
export const WORD_POKEMON_TYPES = {
  grass: 'Grass',
  fire: 'Fire',
  water: 'Water',
  lightning: 'Lightning',
  psychic: 'Psychic',
  fighting: 'Fighting',
  darkness: 'Darkness',
  dark: 'Darkness',
  metal: 'Metal',
  dragon: 'Dragon',
  colorless: 'Colorless',
  fairy: 'Fairy',
};
