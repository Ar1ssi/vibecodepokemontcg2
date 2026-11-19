// One table for the printed energy letters ({G}, {R}, …). Readers that need another casing
// derive it from here, so a letter added or fixed in one place reaches every parser.

export const SYMBOL_TO_TYPE = Object.freeze({
  c: 'colorless',
  g: 'grass',
  r: 'fire',
  w: 'water',
  l: 'lightning',
  p: 'psychic',
  f: 'fighting',
  d: 'darkness',
  m: 'metal',
  n: 'dragon',
  y: 'fairy',
});

/** Lowercase type name for a printed letter in either case, or null for an unknown letter. */
export function typeForSymbol(letter) {
  return SYMBOL_TO_TYPE[String(letter ?? '').toLowerCase()] ?? null;
}

/** Title-case type name ('Fire') for a printed letter, or null for an unknown letter. */
export function titleTypeForSymbol(letter) {
  const type = typeForSymbol(letter);
  return type ? type[0].toUpperCase() + type.slice(1) : null;
}

/** Regex character class of every known letter, for patterns like /\{([cgrwlpfdmny])\}/. */
export const SYMBOL_LETTERS = Object.keys(SYMBOL_TO_TYPE).join('');
