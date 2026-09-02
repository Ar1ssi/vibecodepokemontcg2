// Ability effect engine (taxonomy Section C, Gap #2).
//
// Today the sim recognizes that a Pokémon *has* an ability (`parseAbility` in
// `abilities.mjs` splits the text into guidance steps, and the bridge
// auto-executes only `drawAbility`). The broader set of ability *families*
// (search, switch, heal, attach, passive, end-of-turn, prevention, …) is
// recognized and described here, but NOT executed.
//
// This module is pure + DOM-free (node:test friendly) and mirrors
// `energy-effects.mjs`. It deliberately matches the project's
// "announce-only / guidance" convention:
//   - `classifyAbility` buckets a card into a single ability family (from the
//     ability text + name; works before async card data loads).
//   - `describeAbilityFamily` builds a human-readable announcement line.
//   - `applyAbilityEffect` is an announce-only stub: it returns a result
//     object and does NOT mutate any game state. Full per-family execution is
//     deferred pending user confirmation (taxonomy: do not silently build
//     execution).
//
// Note: this is complementary to `abilities.mjs` — that one is text-in /
// multi-step-out guidance; this one is card-in / single-family-out, like
// `classifyEnergyEffect`.

// Effect families a Pokémon ability can be classified into.
export const ABILITY_FAMILIES = [
  'search',           // put a card from deck into hand / play area
  'draw',             // draw cards (on play or per turn)
  'passive',          // always-on modifier while in play
  'switch',           // bring in / switch Pokémon
  'heal',             // remove damage counters
  'attach',           // attach or add energy
  'when-played',      // one-shot effect when the Pokémon is played
  'end-of-turn',      // effect at the end of your turn
  'damage-prevent',   // prevent or reduce damage
  'hand-protect',     // shield cards in hand from effects
  'opponent-disrupt', // disrupt / limit the opponent
  'unknown',          // ability we can't place
];

// Normalize curly quotes to straight so keyword checks work on card text.
const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

const textOf = (card) =>
  lower(card?.ability?.text ?? card?.abilityText ?? card?.text ?? '');

const nameOf = (card) => lower(card?.name ?? '');

const isAbilityCard = (card) => {
  if (!card) return false;
  if (card.ability?.text || card.abilityText) return true;
  if (card.ability) return true;
  return false;
};

export { isAbilityCard };

// Bucket a card into a single ability family. Non-ability / unrecognizable
// cards return 'unknown'. Precedence: the most distinctive keyword wins.
export function classifyAbility(card) {
  if (!isAbilityCard(card)) return 'unknown';

  const text = textOf(card);
  const name = nameOf(card);
  const t = text || name;

  if (t.includes('prevent') || t.includes('immune') || t.includes('can\'t be damaged')) {
    return 'damage-prevent';
  }
  if ((t.includes('in hand') || t.includes('your hand')) && t.includes('can\'t')) {
    return 'hand-protect';
  }
  if (
    t.includes('opponent') &&
    (t.includes('can\'t') || t.includes('cannot') || t.includes('lose') || t.includes('shuffle'))
  ) {
    return 'opponent-disrupt';
  }
  if (t.includes('at the end of your turn') || t.includes('end of your turn')) {
    return 'end-of-turn';
  }
  if (
    t.includes('energy') &&
    (t.includes('redirect') || (t.includes('move') && t.includes('other pokémon')))
  ) {
    return 'energy-redirect';
  }
  if (t.includes('energy') && (t.includes('attach') || t.includes('put') || t.includes('add'))) {
    return 'attach';
  }
  if ((t.includes('remove') && t.includes('damage counter')) || t.includes('heal')) {
    return 'heal';
  }
  if (t.includes('bring in') || t.includes('switch')) {
    return 'switch';
  }
  if (
    t.includes('search') ||
    t.includes('look through') ||
    (t.includes('up to') && t.includes('from your deck') && t.includes('into your hand')) ||
    (t.includes('find') && t.includes('from your deck'))
  ) {
    return 'search';
  }
  if (t.includes('draw') && t.includes('card')) {
    return 'draw';
  }
  if (t.includes('when you play')) {
    return 'when-played';
  }
  // Passive: "while this Pokémon is in play" / "as long as" style text.
  if (
    t.includes('while this pokémon') ||
    t.includes('as long as this pokémon') ||
    t.includes('while it is') ||
    t.includes('in play')
  ) {
    return 'passive';
  }
  return 'unknown';
}

// Determine the card type a search ability is looking for based on the
// card's text. Returns 'Pokémon' (default), 'Energy', or 'Trainer'.
export function searchTargetType(card) {
  if (!card) return 'Pokémon';
  const text = textOf(card);
  const name = nameOf(card);
  const t = text || name;

  if (t.includes('energy')) return 'Energy';
  if (t.includes('trainer') || t.includes('item')) return 'Trainer';
  return 'Pokémon';
}

// Human-readable, guidance-only description of the ability family (for
// announcements). Complements (not duplicates) the per-step guidance from
// `abilities.mjs` — use for a single-line family summary.
export function describeAbilityFamily(card) {
  const family = classifyAbility(card);
  const name = card?.name || 'This Pokémon';

  switch (family) {
    case 'search':
      return `${name}: search ability — move cards from the deck into hand or the play area (see card text for limits).`;
    case 'draw':
      return `${name}: draw ability — draw extra cards (see card text for when and how many).`;
    case 'passive':
      return `${name}: passive ability — an always-on modifier while this Pokémon is in play.`;
    case 'switch':
      return `${name}: switch ability — bring in or switch Pokémon (see card text for conditions).`;
    case 'heal':
      return `${name}: heal ability — remove damage counters (see card text for limits).`;
    case 'attach':
      return `${name}: energy ability — attach or add energy (see card text for limits).`;
    case 'when-played':
      return `${name}: when-you-play ability — a one-shot effect when this Pokémon is played.`;
    case 'end-of-turn':
      return `${name}: end-of-turn ability — an effect that triggers at the end of your turn.`;
    case 'damage-prevent':
      return `${name}: prevention ability — prevent or reduce damage/effects (see card text).`;
    case 'hand-protect':
      return `${name}: protection ability — shields cards in your hand (see card text).`;
    case 'opponent-disrupt':
      return `${name}: disruption ability — limits or disrupts the opponent (see card text).`;
    case 'unknown':
    default:
      return `${name}: ability present (no specific family recognized — read the card text).`;
  }
}

// Announce-only stub. Returns a result describing the recognized family and a
// message, but performs NO game-state mutation. `executed` is always false
// until a family's execution is explicitly built + user-confirmed.
export function applyAbilityEffect(card) {
  const family = classifyAbility(card);
  const description = describeAbilityFamily(card);
  return {
    family,
    executed: false,
    message: `✦ ${description} (announce-only — effect execution not yet implemented)`,
  };
}
