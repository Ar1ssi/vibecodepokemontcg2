// One spelling per phrase, before any effect parser reads a card's text.
//
// The parsers match the wording printed cards use ("1 of your Pokémon", "put it onto your
// Bench", "can't"). Hand-written text (custom sets) and some older printings say the same
// thing in other words ("one of your Pokémon", "place it on your Bench", "cannot"), and each
// such phrase used to need its own branch in every parser. This leaf module (no imports)
// rewrites those phrases to the printed spelling; every parser entry calls it, so a synonym
// is taught here once. It never changes a number, a kind or a type: only the words around them.

const NUMBER_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const NUMBER_WORD_RE = new RegExp(
  `\\b(${Object.keys(NUMBER_WORDS).join('|')})(?= (?:(?:more|fewer|other|basic|special|different|of|or more|or fewer|damage|prize|energy|cards?|coins?|pok[ée]mon|\\{[a-z]\\})\\b|\\{))`,
  'gi'
);

const REWRITES = [
  // "one of your Benched Pokémon", "one of their Pokémon", "one of your opponent's Pokémon".
  [/\bone of (your|their|his or her|the|those|them)\b/gi, '1 of $1'],
  [NUMBER_WORD_RE, (word) => String(NUMBER_WORDS[word.toLowerCase()])],
  // "place them on your Bench" / "put it on your Bench" → "put … onto your Bench".
  [/\bplace (it|them|that card|those cards|that pok[ée]mon|those pok[ée]mon) (?:on|onto|in|into) your\b/gi, 'put $1 onto your'],
  [/\b(put (?:it|them|that card|those cards|that pok[ée]mon|those pok[ée]mon)) on your bench\b/gi, '$1 onto your Bench'],
  [/\bput (it|them|that card|those cards) onto your hand\b/gi, 'put $1 into your hand'],
  // Missing apostrophe: "your opponents Active Pokémon".
  [/\b(your|their) opponents (?=active|bench|pok[ée]mon|hand|deck|discard|prize|next|turn|attack)/gi, "$1 opponent's "],
  [/\bactive (?:slot|position)\b/gi, 'Active Spot'],
  [/\bcannot\b/gi, "can't"],
  [/\bcan no longer\b/gi, "can't"],
  [/\b(\d+)hp\b/gi, '$1 HP'],
  [/\bpokemon\b/g, 'pokémon'],
  [/\bPokemon\b/g, 'Pokémon'],
];

/** The text with every known synonym rewritten to the printed spelling. Idempotent. */
export function canonicalEffectWording(text) {
  let out = String(text ?? '');
  for (const [pattern, replacement] of REWRITES) out = out.replace(pattern, replacement);
  return out;
}
