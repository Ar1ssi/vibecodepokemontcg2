// D202: WotC Trainer wordings rewritten into the modern wording parseTrainerEffect already reads,
// so a WotC card runs the same steps as its modern twin. Input and output are normalized
// (lower-cased, straight apostrophes) card text. Every pattern is anchored on WotC-only phrasing.

export const LEGACY_TRAINER_REWRITES = [
  // Pokémon Trader base1-77 / base4-106 ≡ Pokémon Communication (Team Up 152).
  [
    /^trade 1 of the basic pokémon or evolution cards in your hand for 1 of the basic pokémon or evolution cards from your deck\. show both cards to your opponent\. shuffle your deck afterward\.$/,
    'reveal a pokémon from your hand and put it into your deck. if you do, search your deck for a pokémon, reveal it, and put it into your hand. then, shuffle your deck.',
  ],
  // Erika's Maids gym1-109: WotC "Trade N of the other cards" is a hand discard cost (Energy Retrieval).
  [
    /^trade (\d+) of the other cards in your hand for up to (\d+) basic pokémon and\/or evolution cards with (\w+) in their names from your deck\. show those cards to your opponent, then put them into your hand\. shuffle your deck afterward\.$/,
    'discard $1 other cards from your hand. search your deck for up to $2 pokémon with $3 in their names, reveal them, and put them into your hand. then, shuffle your deck.',
  ],
  // Lt. Surge's Treaty gym1-112 ≡ Lt. Surge's Bargain (Mega Evolution 185) drawing 1. The Prizes
  // are face down, so "chooses 1 of his or her own Prizes" is the same blind take.
  [
    /^your opponent chooses 1 of the following: everyone chooses 1 of (?:his or her|their) own prizes and put it into (?:his or her|their) hand, or you draw a card\.$/,
    'ask your opponent if each player may take a prize card. if yes, each player takes a prize card. if no, you draw 1 card.',
  ],
];

/**
 * @param {string} lower normalized Trainer text
 * @returns {string} the modern wording when a rewrite matches, else the input
 */
export function rewriteLegacyTrainerWording(lower) {
  const text = typeof lower === 'string' ? lower.trim() : '';
  for (const [pattern, modern] of LEGACY_TRAINER_REWRITES) {
    if (pattern.test(text)) return text.replace(pattern, modern);
  }
  return typeof lower === 'string' ? lower : '';
}
