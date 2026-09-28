// Typography fuzz for the behaviour gates. The corpora are pkmncards text (ASCII apostrophes,
// {X} type symbols) but the game parses TCGdex text, which prints typographic apostrophes on
// some cards and spells types as words on older sets. Dusk Shot (curly opponent's) and the
// Gen 6 special Energy (type words) parsed to nothing in play while every gate stayed green.
// `parseDrift` re-parses a text in each TCGdex shape and names every parser whose output moves.

const TYPE_WORDS = {
  G: 'Grass',
  R: 'Fire',
  W: 'Water',
  L: 'Lightning',
  P: 'Psychic',
  F: 'Fighting',
  D: 'Darkness',
  M: 'Metal',
  Y: 'Fairy',
  N: 'Dragon',
  C: 'Colorless',
};

/** The TCGdex spellings of one pkmncards text: `{ curly, typeWords }` (only the ones that differ). */
export function tcgdexVariants(text) {
  const source = String(text || '');
  const variants = {
    curly: source.replace(/'/g, '’'),
    typeWords: source.replace(/\{([A-Za-z])\}/g, (m, letter) => TYPE_WORDS[letter.toUpperCase()] || m),
  };
  return Object.fromEntries(Object.entries(variants).filter(([, v]) => v !== source));
}

// Player-facing prose (guidance, prompts) echoes the printed text and may keep either spelling;
// only the structure the engine acts on is compared.
const COSMETIC_KEYS = new Set(['guidance', 'label', 'description', 'prompt', 'text', 'desc', 'summary']);

/**
 * One comparable string for a parser's output. Curly quotes fold to ASCII, type symbols and type
 * words fold to one lowercase word, and case is dropped: the parsers echo printed fragments into
 * notes in whichever case the text used, and the engine's type comparisons are case-insensitive.
 */
export function comparableOutput(value) {
  let json;
  try {
    json = JSON.stringify(value, (key, v) => (COSMETIC_KEYS.has(key) ? undefined : v)) ?? 'undefined';
  } catch (e) {
    json = `UNSERIALIZABLE ${e.message}`;
  }
  return json
    .replace(/[‘’]/g, "'")
    .replace(/\{([A-Za-z])\}/g, (m, letter) => TYPE_WORDS[letter.toUpperCase()] || m)
    .toLowerCase();
}

function run(parse, text) {
  try {
    return comparableOutput(parse(text));
  } catch (e) {
    return `THROW ${e.message}`;
  }
}

/**
 * `parsers` maps a label to `(text) => output`. Returns `['<variant>:<parser>', …]` for every
 * parser whose output on a TCGdex spelling differs from its output on the corpus text.
 */
export function parseDrift(text, parsers) {
  const drift = [];
  const variants = tcgdexVariants(text);
  for (const [label, parse] of Object.entries(parsers)) {
    const reference = run(parse, text);
    for (const [variant, variantText] of Object.entries(variants)) {
      if (run(parse, variantText) !== reference) drift.push(`${variant}:${label}`);
    }
  }
  return drift;
}
