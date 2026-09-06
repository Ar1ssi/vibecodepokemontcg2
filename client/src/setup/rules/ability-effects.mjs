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
//   - `classifyAbilityFamilies` returns a LIST of all matching families.
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
  'damage-reduce',    // take less damage (passive reduction)
  'damage-bonus',     // deal more damage (passive bonus)
  'hand-protect',     // shield cards in hand from effects
  'opponent-disrupt', // disrupt / limit the opponent
  'energy-redirect',  // move energy between Pokémon
  'move-energy',      // move energy (active)
  'move-damage',      // move/place damage counters
  'recursion',        // KO-trigger: return/search
  'evolve',           // evolve this Pokémon
  'look-at-top',      // look at top N of deck
  'status',           // apply/remove Special Conditions
  'ko-prevention',    // prevent KO (coin flip)
  'retreat-cost',     // modify Retreat Cost
  'cost-discount',    // reduce attack cost
  'hp-bonus',         // increase HP
  'weakness',         // modify Weakness
  'setup',            // face-down placement
  'tool-cap',         // extra Tool slot
  'prize-modify',     // modify prize count on KO
  'effect-prevent',   // negate effects/abilities
  'energy-multiplier',// energy ×N
  'thorns',           // damage-on-attacker
  'checkup',          // During Pokémon Checkup triggers
  'attack-inheritance', // use attacks from previous Evolutions
  'on-opponent-evolve', // damage when opponent evolves
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

// ─── Family detection predicates ───────────────────────────────────────────
// Each predicate returns true if the text matches that family.
// Order matters for the single-family `classifyAbility` (most specific first).

const isSearch = (t) =>
  t.includes('search') ||
  t.includes('look through') ||
  (t.includes('up to') && t.includes('from your deck') && t.includes('into your hand')) ||
  (t.includes('find') && t.includes('from your deck'));

const isDraw = (t) =>
  t.includes('draw') && (t.includes('card') || t.includes('until you have'));

const isSwitch = (t) =>
  t.includes('bring in') ||
  (t.includes('switch') && !t.includes('retreat')) ||
  (t.includes('switch') &&
    (t.includes('benched') || t.includes('bench')) &&
    t.includes('active'));

const isHeal = (t) =>
  (t.includes('remove') && t.includes('damage counter')) || t.includes('heal');

// FIXED: require "attach" as a verb (word boundary), not "attached" describing state.
// Also catches the common "Put an Energy card ... onto a Pokémon" attach wording.
const isAttach = (t) =>
  t.includes('energy') &&
  ((t.includes('attach') && !t.includes('attached')) || (t.includes('put') && t.includes('onto')));

// True if `w` appears as a whole word (not a substring of a longer word).
// Fixes the 'remove' ⊃ 'move' false-positive (split on non-letters, no regex).
const hasWord = (t, w) => t.split(/[^a-z]/).includes(w);

const hasPromotionTrigger = (t) =>
  t.includes('moves from your bench to the active spot') ||
  t.includes('move from your bench to the active spot');

const hasDamageCounterPlacement = (t) =>
  /\bdamage counters?\s+(?:on|to|onto)\b/.test(t) ||
  /(?:place|move)\s+(?:up to\s+)?\d+\s+damage counters?\s+on\b/.test(t);

const isSelfHandDiscardCost = (t) =>
  t.includes('discard') &&
  t.includes('from your hand') &&
  !t.includes("opponent's hand") &&
  !t.includes('from your opponent');

const isMoveEnergy = (t) => {
  const movesEnergy =
    hasWord(t, 'move') &&
    t.includes('energy') &&
    (t.includes('to 1 of your') ||
      t.includes('to another') ||
      t.includes('to a different') ||
      t.includes('to your active') ||
      (t.includes('benched') && t.includes('active')));
  const unlimited =
    t.includes('as often as you like') && hasWord(t, 'move') && t.includes('energy');
  const onPromotion =
    hasPromotionTrigger(t) && hasWord(t, 'move') && t.includes('energy');
  return movesEnergy || unlimited || onPromotion;
};

const isMoveDamage = (t) => {
  const betweenOwn =
    hasWord(t, 'move') &&
    t.includes('damage counter') &&
    t.includes('from') &&
    (t.includes('to another') || t.includes('onto another'));
  return (
    betweenOwn ||
    ((hasWord(t, 'move') || t.includes('place') || hasWord(t, 'put')) &&
      t.includes('damage counter') &&
      (hasDamageCounterPlacement(t) ||
        t.includes('on 1 of your opponent') ||
        t.includes('on this pokémon') ||
        t.includes('on this pokemon')))
  );
};

const isOpponentDisrupt = (t) =>
  t.includes('opponent') &&
  !isSelfHandDiscardCost(t) &&
  (t.includes('discard') || t.includes('shuffle') || t.includes('can\'t') || t.includes('cannot') || t.includes('lose') || (t.includes('put') && t.includes('into their hand')));

const isSelfKoOnUse = (t) =>
  /if you use this ability.*knocked out/i.test(t) ||
  (/this pokémon is knocked out/i.test(t) && t.includes('if you'));

const isRecursion = (t) => {
  if (isSelfKoOnUse(t)) return false;
  return (
    (t.includes('knocked out') &&
      (t.includes('search') || t.includes('put') || t.includes('return') || t.includes('add'))) ||
    (t.includes('discard pile') &&
      t.includes('into your hand') &&
      (t.includes('put') || t.includes('return') || t.includes('add')))
  );
};

const isEvolve = (t) =>
  t.includes('evolve') && (t.includes('this pokémon') || t.includes('onto this pokémon'));

const isLookAtTop = (t) => t.includes('look at the top');

const isWhenPlayed = (t) => t.includes('when you play');

const isEndOfTurn = (t) => t.includes('end of your turn') || t.includes('at the end of your turn');

const isDamagePrevent = (t) =>
  (t.includes('prevent') && t.includes('damage')) || t.includes("can't be damaged") || t.includes('immune to damage');

const isDamageReduce = (t) =>
  t.includes('less damage') || (t.includes('reduce') && t.includes('damage'));

const isDamageBonus = (t) =>
  t.includes('more damage') && (t.includes('attack') || t.includes('this pokémon'));

const isHandProtect = (t) =>
  t.includes("hand can't be reduced") ||
  t.includes('hand cannot be reduced') ||
  t.includes("cards in your hand can't") ||
  t.includes('cards in your hand cannot') ||
  t.includes("can't be discarded from your hand") ||
  t.includes('cannot be discarded from your hand') ||
  t.includes("cards in hand can't") ||
  t.includes('cards in hand cannot') ||
  (t.includes('your hand') &&
    (t.includes("can't be affected") || t.includes('cannot be affected'))) ||
  (t.includes('in hand') && t.includes('immune'));

const isStatus = (t) => {
  const conditionalPoisonOnSwitch =
    t.includes('switch') &&
    (t.includes('benched') || t.includes('bench')) &&
    t.includes('active') &&
    t.includes('if you do') &&
    t.includes('poisoned');
  if (conditionalPoisonOnSwitch) return false;
  return (
    t.includes('confused') ||
    t.includes('burned') ||
    t.includes('poisoned') ||
    t.includes('asleep') ||
    t.includes('now poisoned') ||
    (t.includes('make') && t.includes('opponent')) ||
    (t.includes('special condition') && !t.includes('recover'))
  );
};

const isKoPrevention = (t) =>
  t.includes('knocked out') && (t.includes('prevent') || t.includes("can't") || t.includes('coin') || t.includes('flip'));

const isRetreatCost = (t) => t.includes('retreat cost');

// Narrow passive-qualified check: "While this Pokémon is in play, …" or
// "As long as this Pokémon is in play, …" is the canonical passive signal.
// Placed before the passive-style modifier families (retreat-cost,
// cost-discount, hp-bonus, weakness, damage-reduce, damage-bonus) so that
// explicitly-qualified passives classify as 'passive' rather than leaking
// into a modifier family.
const isPassiveQualified = (t) =>
  t.includes('while this pokémon') || t.includes('as long as this pokémon');

const isCostDiscount = (t) =>
  (t.includes('cost') || t.includes('energy')) && (t.includes('less') || t.includes('ignore') || t.includes('reduce')) && t.includes('attack');

const isHpBonus = (t) =>
  t.includes('hp') && (t.includes('more') || t.includes('increase') || t.includes('treated as'));

const isWeakness = (t) => t.includes('weakness');

const isSetup = (t) => t.includes('face-down') || t.includes('face down');

const isToolCap = (t) =>
  t.includes('tool') && (t.includes('attach') || t.includes('slot') || t.includes('more'));

const isPrizeModify = (t) =>
  t.includes('prize card') && (t.includes('less') || t.includes('fewer') || t.includes('more') || t.includes('extra'));

const isAbilityUsageLimit = (t) =>
  /can't use more than \d+/.test(t) ||
  /cannot use more than \d+/.test(t);

const isEffectPrevent = (t) =>
  !isAbilityUsageLimit(t) &&
  (t.includes('prevent') || t.includes("can't") || t.includes('have no effect') || t.includes('have no abilities')) &&
  (t.includes('effect') || t.includes('ability') || t.includes('attack'));

const isEnergyMultiplier = (t) =>
  t.includes('energy') &&
  (t.includes('×') ||
    t.includes('x2') ||
    t.includes('counts as') ||
    t.includes('treated as') ||
    (t.includes('provides') &&
      (/\{[a-z]\}\{[a-z]\}/.test(t) || t.includes('basic'))));

const isCheckup = (t) => t.includes('checkup') && t.includes('damage counter');

const isAttackInheritance = (t) =>
  (t.includes('previous evolution') || t.includes('previous evolutions')) &&
  (t.includes('attack') || t.includes('attacks'));

const isOnOpponentEvolve = (t) =>
  t.includes('opponent') && t.includes('evolve') && t.includes('damage counter');

const isThorns = (t) =>
  t.includes('damage counter') && (t.includes('put') || t.includes('place')) && (t.includes('attacker') || t.includes('attacking pokémon'));

// Broadened passive detection: catches all the common passive phrasings.
// This is the LAST check in FAMILY_ORDER, so it only fires when no more
// specific family matched. Being broad here is intentional (catch-all).
const isPassive = (t) =>
  t.includes('while this pokémon') ||
  t.includes('as long as this pokémon') ||
  t.includes('while it is') ||
  t.includes('in play') ||
  t.includes('if this pokémon is in the active spot') ||
  t.includes('if this pokémon is active') ||
  t.includes('when your opponent') ||
  t.includes("your opponent's active pokémon") ||
  (t.includes('takes') && t.includes('less damage')) ||
  (t.includes('deals') && t.includes('more damage')) ||
  t.includes("can't be") ||
  t.includes('immune to') ||
  t.includes('retreat cost') ||
  t.includes('hp') ||
  t.includes('weakness') ||
  t.includes('tool') ||
  t.includes('this pokémon');

// ─── Single-family classifier (dominant / most specific) ───────────────────
// Precedence: most distinctive / specific keyword wins.
// Returns the FIRST matching family from the ordered list below.

const FAMILY_ORDER = [
  // Most specific first (compound / multi-keyword matches)
  ['on-opponent-evolve', isOnOpponentEvolve],
  ['attack-inheritance', isAttackInheritance],
  ['checkup', isCheckup],
  ['energy-redirect', isMoveEnergy],
  ['move-damage', isMoveDamage],
  ['recursion', isRecursion],
  ['ko-prevention', isKoPrevention],
  ['damage-prevent', isDamagePrevent],
  // Bench↔Active switch before status (Pecharunt ex: switch + conditional Poison)
  ['switch', isSwitch],
  // Active actions before hand-protect (avoids "your hand" + "can't use" false positives)
  ['search', isSearch],
  ['status', isStatus],
  ['heal', isHeal],
  ['hand-protect', isHandProtect],
  ['opponent-disrupt', isOpponentDisrupt],
  ['end-of-turn', isEndOfTurn],
  ['draw', isDraw],
  ['look-at-top', isLookAtTop],
  ['evolve', isEvolve],
  ['setup', isSetup],
  ['tool-cap', isToolCap],
  ['prize-modify', isPrizeModify],
  ['effect-prevent', isEffectPrevent],
  ['energy-multiplier', isEnergyMultiplier],
  ['thorns', isThorns],
  // Passive-qualified: "While this Pokémon is in play, X" → passive.
  // Must come before the passive-style modifier families below.
  ['passive', isPassiveQualified],
  ['retreat-cost', isRetreatCost],
  ['cost-discount', isCostDiscount],
  ['hp-bonus', isHpBonus],
  ['weakness', isWeakness],
  ['damage-reduce', isDamageReduce],
  ['damage-bonus', isDamageBonus],
  ['attach', isAttach],
  // 'when-played' is a trigger, not an effect: it loses to any more
  // specific action (draw/search/…) and only wins when no action matched.
  ['when-played', isWhenPlayed],
  // Passive (broad catch-all — last)
  ['passive', isPassive],
];

export function classifyAbility(card) {
  if (!isAbilityCard(card)) return 'unknown';

  const text = textOf(card);
  const name = nameOf(card);
  const t = text || name;

  for (const [family, predicate] of FAMILY_ORDER) {
    if (predicate(t)) return family;
  }
  return 'unknown';
}

// Returns a LIST of all matching families (for compound effects).
export function classifyAbilityFamilies(card) {
  if (!isAbilityCard(card)) return ['unknown'];

  const text = textOf(card);
  const name = nameOf(card);
  const t = text || name;

  const matched = [];
  for (const [family, predicate] of FAMILY_ORDER) {
    if (predicate(t)) matched.push(family);
  }
  return matched.length > 0 ? matched : ['unknown'];
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
    case 'damage-reduce':
      return `${name}: damage reduction — takes less damage from attacks (see card text).`;
    case 'damage-bonus':
      return `${name}: damage bonus — deals more damage with attacks (see card text).`;
    case 'hand-protect':
      return `${name}: protection ability — shields cards in your hand (see card text).`;
    case 'opponent-disrupt':
      return `${name}: disruption ability — limits or disrupts the opponent (see card text).`;
    case 'energy-redirect':
    case 'move-energy':
      return `${name}: energy movement — move Energy between your Pokémon (see card text).`;
    case 'move-damage':
      return `${name}: damage counter movement — move/place damage counters (see card text).`;
    case 'recursion':
      return `${name}: recursion — when Knocked Out, return/search a card (see card text).`;
    case 'evolve':
      return `${name}: evolution — evolve this Pokémon using a card from hand (see card text).`;
    case 'look-at-top':
      return `${name}: look at top — inspect the top of your deck (see card text).`;
    case 'status':
      return `${name}: status condition — apply or remove Special Conditions (see card text).`;
    case 'ko-prevention':
      return `${name}: KO prevention — avoid being Knocked Out (see card text).`;
    case 'retreat-cost':
      return `${name}: retreat cost modifier — changes Retreat Cost (see card text).`;
    case 'cost-discount':
      return `${name}: cost discount — reduce the cost of attacks (see card text).`;
    case 'hp-bonus':
      return `${name}: HP bonus — this Pokémon has more HP (see card text).`;
    case 'weakness':
      return `${name}: weakness modifier — changes this Pokémon's Weakness (see card text).`;
    case 'setup':
      return `${name}: setup — face-down placement (see card text).`;
    case 'tool-cap':
      return `${name}: tool capacity — extra Pokémon Tool slot (see card text).`;
    case 'prize-modify':
      return `${name}: prize modifier — changes prizes taken on KO (see card text).`;
    case 'effect-prevent':
      return `${name}: effect prevention — negate effects/abilities (see card text).`;
    case 'energy-multiplier':
      return `${name}: energy multiplier — Energy counts as more (see card text).`;
    case 'thorns':
      return `${name}: thorns — damage counters on the attacker (see card text).`;
    case 'checkup':
      return `${name}: checkup ability — an effect during Pokémon Checkup (see card text).`;
    case 'attack-inheritance':
      return `${name}: attack inheritance — can use attacks from previous Evolutions (see card text).`;
    case 'on-opponent-evolve':
      return `${name}: on-opponent-evolve — puts damage counters when the opponent evolves (see card text).`;
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
