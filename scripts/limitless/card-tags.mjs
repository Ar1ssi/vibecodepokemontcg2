/**
 * Goal tags for the deck-suggestion dataset (design 069, Option 9): regex rules over a card's printed
 * text, run at bake time on TCGdex records. Ids must match client/src/setup/deck-builder/core/
 * deck-suggest/goals.mjs (`budget` is price-based and never a tag).
 *
 * Text is lowercased, accents and curly quotes flattened first, so "Pokémon" / "opponent’s" match
 * "pokemon" / "opponent's". Rules cover each wording era found in out/pkmn-*-cards.json.
 */

// "[^.]" keeps a rule inside one sentence; "(?:(?!energy)[^.])*?" stops at the word "energy".
const GOAL_RULES = {
  setup: [
    /search your deck for (?:(?!energy)[^.])*?pokemon(?! tool)/,
    /stage 2 card[^.]*evolves from/,
    /put (?:(?!energy)[^.])*?basic pokemon[^.]*onto your bench/,
  ],
  draw: [
    /\bdraws? (?:\d+|a|an|that many|up to \d+|cards?|until)\b/,
    /search your deck for (?:a|an|any|up to \d+) (?:[\w'{}-]+ ){0,3}cards?\b/,
  ],
  disruption: [
    /each player shuffles (?:their|his or her) hand/,
    /your opponent (?:shuffles|reveals) (?:their|his or her) hand/,
    /from your opponent's hand/,
    /switch in 1 of your opponent's benched/,
    /switch 1 of your opponent's benched pokemon with (?:their|his or her|the) (?:active|defending)/,
    /discard (?:an?|\d+|up to \d+|all) [^.]*energy (?:cards? )?(?:from|attached to) (?:1 of )?your opponent's/,
    /your opponent can't play any item/,
  ],
  acceleration: [
    /attach [^.]*?energy (?:cards? )?from your (?:hand|deck|discard pile)/,
    /search your deck for [^.]*energy[^.]*attach/,
    /energy cards?[^.]*\. attach (?:it|them|the other|that card)\b/,
  ],
  recovery: [
    /\bheal (?:\d+|all) damage/,
    /from your discard pile[^.]*into your (?:hand|deck)/,
  ],
  mobility: [
    /switch your active pokemon with 1 of your benched/,
    /switch 1 of your (?:own )?benched [^.]*with your active/,
    /switch this pokemon with 1 of your benched/,
    /has no retreat cost/,
    /retreat cost is 0/,
    /retreat cost [^.]*\bless\b/,
  ],
};

export const TAG_IDS = Object.keys(GOAL_RULES);

export function normalizeCardText(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Goal ids whose rules match `text`, in TAG_IDS order. */
export function tagsForText(text = '') {
  const normalized = normalizeCardText(text);
  if (!normalized) return [];
  return TAG_IDS.filter((id) => GOAL_RULES[id].some((rule) => rule.test(normalized)));
}

/** Every printed effect on a TCGdex record: abilities, attack effects, Trainer/Energy effect. */
export function cardText(card = {}) {
  const parts = [];
  for (const ability of card.abilities || []) parts.push(ability?.effect);
  for (const attack of card.attacks || []) parts.push(attack?.effect);
  parts.push(card.effect);
  return parts.filter(Boolean).join('\n');
}
