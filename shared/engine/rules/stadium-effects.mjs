// Stadium effect engine (taxonomy Section E).
//
// Tracks *which* Stadium is in play (`rules-state.mjs` `markStadiumPlayed` /
// `getStadium` — one-at-a-time rule) and *executes* the effect a Stadium card
// carries. This module is pure + DOM-free (node:test friendly) and mirrors
// `ability-executors.mjs`.

import { rulesState, getStadium } from './rules-state.mjs';
import { attachedTools, applyHpBonus } from './ability-executors.mjs';
import { toolHpBonusFor } from './tool-conditions.mjs';
import { abilityHpBonus } from './ability-combat.mjs';
import { pokemonNamesMatch, normalizeStage } from './evolution.mjs';
import { priorEvolutionCards, topPokemonCard } from './evolved-pokemon.mjs';
import { isPokemon } from '../cards.mjs';
import { getAttachedSpecialEnergies, parseSpecialEnergyEffects } from './special-energy-parse.mjs';
import { isAncientTraitAbility } from './abilities.mjs';
import { isRuleBoxPokemon, isTeraCard, isExCard, isGxCard } from './card-classify.mjs';
import { isDeltaSpecies } from './energy-effects.mjs';
import { getSpecialEnergyHpBonus } from './special-energy-parse.mjs';
import { matchesSearch } from './search-match.mjs';
//
// Layers:
//   - `classifyStadiumEffect` — buckets a card into an effect family.
//   - `describeStadiumEffect` — human-readable announcement.
//   - `parseStadiumSetupDraw` / `parseStadiumOncePerTurn` / `parseStadiumDamagePrevention`
//     / `isStadiumRetreatPrevention` / `isStadiumHandProtect` — pure parsers
//     that extract *what* the card does from its printed text.
//   - `applyStadiumEffect` — orchestrates the above and returns a result
//     object with `{ family, executed, message, results[] }`.

// Effect families a Stadium can be classified into.
export const STADIUM_EFFECT_FAMILIES = [
  'setup-once', // one-shot "when you play this card" effect
  'once-per-turn', // repeatable once per turn (e.g. Safari Zone search)
  'continuous-both', // always-on modifier affecting both players
  'opponent-affected', // ongoing effect primarily aimed at the opponent
  'none', // Stadium with no recognized effect (rare)
  'unknown', // Stadium we can't place
];

// Normalize curly quotes to straight so keyword checks work on card text.
const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

const subtypesOf = (card) =>
  (Array.isArray(card?.subtypes) ? card.subtypes : []).map(lower);

const textOf = (card) =>
  lower(card?.text ?? card?.effect ?? card?.cardText ?? '');

/**
 * Battle Style (Single Strike) is printed as a name prefix ("Single Strike
 * Urshifu V", "Single Strike Energy"); the card data has no dedicated tag
 * field, so the name/subtype is the best available signal.
 */
export function isSingleStrikeCard(card) {
  if (!card) return false;
  if (lower(card.name || '').includes('single strike')) return true;
  return subtypesOf(card).includes('single strike');
}

/** Whether a card is an Evolution Pokémon (has a non-Basic stage). */
export function isEvolutionCard(card) {
  if (!card) return false;
  const stage = lower(card.stage || '');
  if (stage) return stage !== 'basic';
  return subtypesOf(card).some((s) =>
    /^(stage 1|stage 2|stage1|stage2|vmax|vstar|break|evolution)$/.test(s)
  );
}

/**
 * Pokémon Park: a triggered passive that heals 1 damage counter when an Energy
 * attached from hand lands on a Benched Pokémon. It has no activatable effect,
 * so it is recognized as a passive rather than a once-per-turn activation.
 */
export function isStadiumEnergyAttachHeal(card) {
  const t = textOf(card);
  return (
    /attaches an energy card from (?:his or her|their|your) hand to 1 of (?:his or her|their|your) benched pok[eé]mon/.test(
      t
    ) && /removes? 1 damage counter/.test(t)
  );
}

/**
 * Glimwood Tangle: a triggered reflex (not an activation) that lets a player
 * ignore the coins flipped for an attack and re-flip them. The attack resolver
 * in `reduce.mjs` recognizes it and offers the choice before effects resolve.
 */
export function isStadiumGlimwoodReFlip(card) {
  const t = textOf(card);
  return (
    /ignore all results of those coin flips and begin flipping/.test(t) ||
    (/flips? any coins? for an attack/.test(t) &&
      /flipping (?:those|the) coins again/.test(t))
  );
}

/** Lost City: a Knocked Out Pokémon goes to the Lost Zone instead of discard. */
export function isStadiumLostCity(card) {
  const t = textOf(card);
  return /knocked out/.test(t) && /lost zone instead of the discard/.test(t);
}

/** Dyna Tree Hill: Pokémon (both sides) can't be healed. */
export function isStadiumBlocksHealing(card) {
  return /can'?t be healed/.test(textOf(card));
}

/** Whether the in-play Stadium forbids healing (Dyna Tree Hill). */
export function stadiumBlocksHealing(stadiumOverride = null) {
  const card = stadiumOverride
    ? stadiumOverride.card || stadiumOverride
    : null;
  if (card) return isStadiumBlocksHealing(card);
  if (!rulesState.enabled) return false;
  const stadium = getStadium()?.card;
  return stadium ? isStadiumBlocksHealing(stadium) : false;
}

/** Sea of Nothingness: Special Conditions survive evolving/devolving. */
export function isStadiumStatusPersistsOnEvolve(card) {
  const t = textOf(card);
  return (
    /special conditions are not removed/.test(t) &&
    /evolve|devolve/.test(t)
  );
}

// ── Special Energy rewrites (continuous) ───────────────────────────────────
// These rewrite how attached Energy provides/counts (taxonomy §F). They are
// recognized and described here; the deep cost-payment rewrite is guidance-only
// for now, matching energy-effects.mjs's "do not silently build execution".

/** Temple of Sinnoh: Special Energy provides {C} and has no other effect. */
export function isStadiumSpecialEnergyColorless(card) {
  const t = textOf(card);
  return (
    /special energy/.test(t) &&
    /provide \{c\}/.test(t) &&
    /no other effect/.test(t)
  );
}

/** Crystal Beach: Special Energy providing ≥2 now provides only 1 {C}. */
export function isStadiumSpecialEnergyToOne(card) {
  const t = textOf(card);
  return (
    /special energy/.test(t) &&
    /provid(?:es?|ing) only 1 \{c\}/.test(t)
  );
}

/** Holon Research Tower: Basic Energy on Delta Species also provides {M}. */
export function isStadiumBasicEnergyMetal(card) {
  const t = textOf(card);
  return (
    /basic energy/.test(t) && /\{m\}/.test(t) && /delta species/.test(t)
  );
}

// ── Attack inheritance / grants (continuous) ───────────────────────────────

/**
 * Shrine of Memories ("evolved Pokémon can use attacks from its previous
 * Evolutions") and Meteor Falls ("Active Evolved Pokémon can use attacks from
 * its Basic or Stage 1"). Returns the scope, or null.
 */
export function parseStadiumAttackInheritance(card) {
  const t = textOf(card);
  if (!/can use any attack/.test(t)) return null;
  if (/from its previous evolutions/.test(t))
    return { scope: 'evolved', sources: 'previous-evolutions' };
  if (
    /active evolved pokémon/.test(t) &&
    /from its basic pokémon or its stage 1/.test(t)
  )
    return { scope: 'active-evolved', sources: 'basic-or-stage1' };
  return null;
}

/**
 * Holon Lake / Rocket's Tricky Gym: a filtered Pokémon "can use attacks on this
 * card instead of its own". Returns `{ filter }` naming the qualifying Pokémon.
 */
export function parseStadiumAttackGrant(card) {
  const t = textOf(card);
  if (!/can use attacks on this card instead of its own/.test(t)) return null;
  let filter = 'all';
  if (/has \{delta species\}/.test(t)) filter = 'delta-species';
  else if (/dark or rocket's in its name/.test(t)) filter = 'dark-or-rockets';
  return { filter };
}

/** Whether `pokemon` qualifies for a Stadium's granted-attack filter. */
export function stadiumAttackGrantMatches(stadiumCard, pokemon) {
  const parsed = parseStadiumAttackGrant(stadiumCard);
  if (!parsed || !pokemon) return false;
  if (parsed.filter === 'delta-species') return isDeltaSpecies(pokemon);
  if (parsed.filter === 'dark-or-rockets') {
    const name = lower(pokemon?.name || '');
    return name.includes('dark') || name.includes("rocket's") || name.includes('rockets');
  }
  return true;
}

/**
 * The attack(s) a Stadium grants to a qualifying Pokémon:
 * - Holon Lake → Delta Call (search a {Delta Species} Pokémon into hand).
 * - Rocket's Tricky Gym → Feint Attack (20 to any of the opponent's Pokémon,
 *   unaffected by Weakness/Resistance/effects).
 *
 * Returns the same shape as a printed attack (name/cost/damage/text), tagged
 * `granted`, or [] when the card grants nothing / the Pokémon does not qualify.
 */
export function stadiumGrantedAttacks(stadiumCard, pokemon) {
  if (!stadiumAttackGrantMatches(stadiumCard, pokemon)) return [];
  const t = textOf(stadiumCard);
  if (/delta call/.test(t)) {
    return [
      {
        name: 'Delta Call',
        cost: ['Colorless'],
        damage: null,
        text: 'Search your deck for a Pokémon that has {Delta Species} on its card, show it to your opponent, and put it into your hand. Shuffle your deck afterward.',
        granted: true,
      },
    ];
  }
  if (/feint attack/.test(t)) {
    return [
      {
        name: 'Feint Attack',
        cost: ['Colorless'],
        damage: 20,
        text: "Does 20 damage to 1 of your opponent's Pokémon. This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, Poké-Bodies, or any other effects on that Pokémon.",
        granted: true,
      },
    ];
  }
  return [];
}

/**
 * Attacks `pokemon` may use from below its top stage while this Stadium is in
 * play (Shrine of Memories / Meteor Falls). Returns [] when the Stadium does
 * not grant inheritance, the Pokémon is unevolved, or (Meteor Falls) it is not
 * an Active non-ex Pokémon.
 */
export function stadiumInheritedAttacks(
  stadiumCard,
  { zoneCards = [], root = null, isActive = false } = {}
) {
  const parsed = parseStadiumAttackInheritance(stadiumCard);
  if (!parsed || !root) return [];
  const sources = priorEvolutionCards(zoneCards, root);
  if (sources.length === 0) return [];
  if (parsed.scope === 'active-evolved') {
    if (!isActive) return [];
    if (isExCard(topPokemonCard(zoneCards, root))) return [];
  }
  const out = [];
  for (const src of sources) {
    for (const atk of src.attacks || []) out.push({ ...atk, inherited: true });
  }
  return out;
}

/**
 * All extra attacks a Stadium makes available to `pokemon` (inherited +
 * granted), in a stable order shared by the server, the client list builders
 * and the inspector. De-duplicated by name (printed attacks win).
 */
export function stadiumExtraAttacks(
  stadiumCard,
  { zoneCards = [], root = null, isActive = false } = {}
) {
  const inherited = mergeAttacks(
    stadiumInheritedAttacks(stadiumCard, { zoneCards, root, isActive }),
    energyInheritedAttacks({ zoneCards, root })
  );
  const granted = stadiumGrantedAttacks(stadiumCard, root);
  return mergeAttacks(inherited, granted);
}

// Memory Energy (LOT 194): "The Pokémon this card is attached to can use any attack from
// its previous Evolutions" — Shrine of Memories for one Pokémon (audit SE9).
/** Attacks an attached Memory-style Energy lets `root` use from below its top stage. */
export function energyInheritedAttacks({ zoneCards = [], root = null } = {}) {
  if (!root || root.instanceId == null) return [];
  const hasMemory = getAttachedSpecialEnergies(root, zoneCards).some((energy) =>
    parseSpecialEnergyEffects(energy)?.steps.some((s) => s.type === 'canUseEvolutionAttacks')
  );
  if (!hasMemory) return [];
  return priorEvolutionCards(zoneCards, root).flatMap((src) =>
    (src.attacks || []).map((atk) => ({ ...atk, inherited: true }))
  );
}

/**
 * Merge printed attacks with extra ones, de-duplicated by name (first wins).
 * Entries already carrying their own tag keep it; otherwise `inherited`/`granted`
 * is preserved from the source object.
 */
export function mergeAttacks(printed = [], extra = []) {
  const merged = Array.isArray(printed) ? [...printed] : [];
  const seen = new Set(merged.map((a) => String(a?.name ?? '').toLowerCase()));
  for (const atk of extra) {
    const key = String(atk?.name ?? '').toLowerCase();
    if (!key || seen.has(key)) continue;
    merged.push({ ...atk });
    seen.add(key);
  }
  return merged;
}

const STACK_STAGE_RANK = { Basic: 0, 'Stage 1': 1, 'Stage 2': 2, BREAK: 3 };
const stackStageRank = (card) =>
  STACK_STAGE_RANK[normalizeStage(card?.stage) || 'Basic'] ?? 0;

/**
 * The cards in one Pokémon's evolution stack, tolerant of the two client render
 * paths. The authoritative view links an evolution to its Basic by `attachedTo`
 * (so `card` is the Basic root); the legacy board links a pre-evolution to the
 * visible top by `image.relative`/`image.attached` (so `card` is the top). A
 * card that is itself an attached evolution is walked up to its root first.
 * Returns the stack in zone order, or `[card]` for an unevolved Pokémon.
 */
function stackMembersFor(zoneCards, card) {
  const list = (Array.isArray(zoneCards) ? zoneCards : []).filter(isPokemon);
  if (!card) return [];
  let root = card;
  const seen = new Set();
  while (root?.attachedTo != null && !seen.has(root.attachedTo)) {
    seen.add(root.attachedTo);
    const parent = list.find((c) => c.instanceId === root.attachedTo);
    if (!parent) break;
    root = parent;
  }
  // `instanceId != null` guards a malformed card: without it, `attachedTo ===
  // undefined` would sweep in every unrelated unevolved Pokémon in the zone.
  const byAttachedTo =
    root.instanceId == null
      ? []
      : list.filter((c) => c.attachedTo === root.instanceId);
  if (byAttachedTo.length > 0) return [root, ...byAttachedTo];
  const img = root?.image || card?.image;
  if (img) {
    const legacy = list.filter((c) => c === root || c.image?.relative === img);
    if (legacy.length > 1) return legacy;
  }
  return [card];
}

/**
 * Stadium extras for the Pokémon `card` sitting in `zoneCards`, from whichever
 * render path populated the zone. Normalizes the stack to the server shape so
 * `stadiumExtraAttacks` sees the same ordering the engine does — and therefore
 * an `attackIndex` into the merged list resolves alike on both sides.
 */
export function stadiumExtraAttacksFromZone(
  stadiumCard,
  { zoneCards = [], card = null, isActive = true } = {}
) {
  // No Stadium still leaves Memory Energy inheritance (energyInheritedAttacks).
  if (!card) return [];
  const members = stackMembersFor(zoneCards, card);
  if (members.length <= 1) {
    return stadiumExtraAttacks(stadiumCard, { zoneCards, root: card, isActive });
  }
  const base = members.reduce(
    (low, c) => (stackStageRank(c) < stackStageRank(low) ? c : low),
    card
  );
  const normalized = zoneCards.map((c) =>
    members.includes(c)
      ? c === base
        ? { ...c, attachedTo: null }
        : { ...c, attachedTo: base.instanceId }
      : c
  );
  return stadiumExtraAttacks(stadiumCard, {
    zoneCards: normalized,
    root: base,
    isActive,
  });
}

// ── Per-turn energy movement / status (continuous) ─────────────────────────

/**
 * Ultimate Zone, Saffron City Gym and Celadon City Gym give players an
 * unlimited-use turn action ("as often as … likes during his or her turn").
 * Recognized so they are no longer unknown; the actions themselves are played
 * through the table UI rather than a single activation.
 */
export function parseStadiumEnergyMovement(card) {
  const t = textOf(card);
  if (
    /move an energy card attached to 1 of (?:his or her|their) benched pokémon to (?:his or her|their) active arceus/.test(
      t
    )
  )
    return { kind: 'move-to-arceus' };
  if (
    /return 1 basic energy card attached to 1 of (?:his or her|their) pokémon with sabrina in its name/.test(
      t
    )
  )
    return { kind: 'return-sabrina-energy' };
  if (
    /discard an energy card attached to 1 of (?:his or her|their) pokémon with erika in its name/.test(
      t
    )
  )
    return { kind: 'discard-erika-cure' };
  return null;
}

const REPEATABLE_STADIUM_KINDS = new Set([
  'move-to-arceus',
  'return-sabrina-energy',
  'discard-erika-cure',
]);

/**
 * True for the three "as often as … likes during his or her turn" Stadiums
 * (Ultimate Zone, Saffron City Gym, Celadon City Gym). They run through the
 * same activation pipeline as a once-per-turn Stadium but are unlimited: the
 * engine must neither block a repeat activation nor consume
 * `stadiumUsedThisTurn` for them.
 */
export function isRepeatableStadiumAction(card) {
  const opt = parseStadiumOncePerTurn(card);
  return Boolean(opt?.repeatable) && REPEATABLE_STADIUM_KINDS.has(opt.kind);
}

const isStadiumCard = (card) => {
  if (!card) return false;
  if (subtypesOf(card).includes('stadium')) return true;
  if (subtypesOf(card).includes('location')) return true;
  if (lower(card.trainerType) === 'stadium') return true;
  const type = lower(card.type);
  if (type === 'stadium' || type.includes('stadium')) return true;
  const name = lower(card.name);
  // Name fallbacks for deck-import stubs before TCGdex subtypes load.
  // "Grand Tree" is a Stadium but matches none of the older zone/rooftop hints.
  // Pokémon like Magnezone carry hp; a stub without it is still name-matched.
  const looksLikePokemon =
    (card.hp != null && card.hp !== '') || /pok[eé]mon/.test(lower(card.supertype));
  if (
    !looksLikePokemon &&
    (name.includes('zone') || name.includes('rooftop') || name === 'grand tree')
  ) {
    return true;
  }
  const t = textOf(card);
  return (
    t.includes('this stadium stays in play') || t.includes('if another stadium')
  );
};

export { isStadiumCard };

// Matches both the literal "once per turn" and the "once during {each/your/
// either} player's turn" phrasing (e.g. Grand Tree), which is semantically
// the same repeatable-once-per-turn trigger but doesn't contain the literal
// substring "once per turn".
const ONCE_PER_TURN_RE =
  /once per turn|once during (?:each|your|either) player'?s turn/;

const BOTH_PLAYERS_RE =
  /both players|each player|both active pokémon|both yours and your opponent'?s/;

/**
 * Triggered Stadium families owned by stadium-triggers.mjs (Po Town, Wela
 * Volcano Park, Dust Island, Slumbering Forest). Classifying them as 'unknown'
 * made the inspector and audits report them as unimplemented (audit S&M F6).
 */
export function isStadiumTriggered(card) {
  const t = textOf(card);
  if (!t) return false;
  return (
    (/plays a pokémon from their hand to evolve/.test(t) && /damage counter/.test(t)) ||
    (/burned between turns/.test(t) && /isn't removed/.test(t)) ||
    (/switches their poisoned active pokémon/.test(t) && /special condition/.test(t)) ||
    (/is asleep, its owner flips 2 coins/.test(t) && /still asleep/.test(t))
  );
}

/** True when card text names a passive modifier the execution layer can hook. */
export function hasRecognizedPassiveStadiumEffect(card) {
  const t = textOf(card);
  if (!t) return false;
  return (
    parseStadiumDamagePrevention(card) !== null ||
    parseStadiumDamageReduction(card) > 0 ||
    isStadiumRetreatPrevention(card) ||
    isStadiumHandProtect(card) ||
    parseStadiumCostModifier(card) > 0 ||
    parseStadiumHpModifier(card) !== 0 ||
    parseStadiumEvolutionSpeed(card).relaxTurnGate ||
    parseStadiumEvolutionSpeed(card).costReduce > 0 ||
    parseStadiumRetreatModifier(card) !== 0 ||
    parseStadiumBenchDamageOnPlay(card) !== null ||
    parseStadiumAttackDamageBonus(card) > 0 ||
    isStadiumStatusImmunity(card) ||
    isStadiumConfusedPersist(card) ||
    parseStadiumBenchLimit(card) !== null ||
    isStadiumToolNegation(card) ||
    isStadiumAbilityNegation(card) ||
    parseStadiumCheckupPoisonBonus(card) > 0 ||
    parseStadiumAttackCostIncrease(card) > 0 ||
    isStadiumAttackLock(card) ||
    isStadiumTriggered(card) ||
    isStadiumEnergyAttachHeal(card) ||
    isStadiumGlimwoodReFlip(card) ||
    isStadiumNoWeakness(card) ||
    isStadiumWeaknessTimesTwo(card) ||
    isStadiumResistanceIgnore(card) ||
    parseStadiumTypeDamageReduction(card) > 0 ||
    isStadiumBetweenTurnsDamage(card) ||
    isStadiumLostCity(card) ||
    isStadiumBlocksHealing(card) ||
    isStadiumStatusPersistsOnEvolve(card) ||
    isStadiumSpecialEnergyColorless(card) ||
    isStadiumSpecialEnergyToOne(card) ||
    isStadiumBasicEnergyMetal(card) ||
    parseStadiumAttackInheritance(card) !== null ||
    parseStadiumAttackGrant(card) !== null ||
    parseStadiumEnergyMovement(card) !== null
  );
}

/** Stadium text applies to both players (not opponent-only targeting). */
export function stadiumAffectsBothPlayers(card) {
  return BOTH_PLAYERS_RE.test(textOf(card));
}

/** True when the card has a real when-you-play effect, not stay-in-play reminder text. */
export function stadiumHasWhenPlayedEffect(card) {
  const t = textOf(card);
  const clause = t.match(/when you play (?:this card|it),\s*([^.]+)/);
  if (!clause) return false;
  const body = clause[1].trim();
  if (!body) return false;
  if (/^discard (?:this|it) if another stadium/.test(body)) return false;
  if (/^stays in play/.test(body)) return false;
  return true;
}

// Bucket a card into a stadium-effect family. Non-stadium / unrecognizable
// cards return 'unknown'. Precedence: the most restrictive trigger wins.
export function classifyStadiumEffect(card) {
  if (!isStadiumCard(card)) return 'unknown';
  const t = textOf(card);
  if (!t) return 'none';
  // Real "When you play this card, draw 2" — not stay-in-play reminder text.
  if (stadiumHasWhenPlayedEffect(card)) {
    return 'setup-once';
  }
  // Pokémon Park triggers on Energy attachment and Glimwood Tangle on attack
  // coin flips — neither has a "use" action, so they must not be bucketed as a
  // once-per-turn activation.
  if (isStadiumEnergyAttachHeal(card) || isStadiumGlimwoodReFlip(card)) {
    return 'continuous-both';
  }
  // Ultimate Zone / Saffron City Gym / Celadon City Gym are "as often as you
  // like" actions with no "once per turn" phrase — modeled as once-per-turn.
  if (ONCE_PER_TURN_RE.test(t) || parseStadiumEnergyMovement(card)) {
    return 'once-per-turn';
  }
  if (BOTH_PLAYERS_RE.test(t)) {
    return 'continuous-both';
  }
  if (hasRecognizedPassiveStadiumEffect(card)) {
    return 'continuous-both';
  }
  if (t.includes('your opponent')) {
    return 'opponent-affected';
  }
  return 'unknown';
}

// Human-readable, guidance-only description of the effect (for announcements).
export function describeStadiumEffect(card) {
  const family = classifyStadiumEffect(card);
  const name = card?.name || 'This Stadium';
  switch (family) {
    case 'setup-once':
      return `${name}: when-you-play Stadium — a one-shot effect when this card is played (see card text).`;
    case 'once-per-turn':
      return `${name}: once-per-turn Stadium — a repeatable effect available once each turn (see card text).`;
    case 'continuous-both':
      return `${name}: continuous Stadium — an always-on modifier affecting both players while in play.`;
    case 'opponent-affected':
      return `${name}: continuous Stadium — an ongoing effect primarily aimed at your opponent.`;
    case 'none':
      return `${name}: Stadium in play (no effect text recognized).`;
    case 'unknown':
    default:
      return `${name}: Stadium card (no effect family recognized — read the card text).`;
  }
}

// ── Pure parsers (extract WHAT the card does) ──────────────────────────

/**
 * Setup-once: "When you play this card, draw N cards."
 * Returns the number of cards to draw, or null if not a draw effect.
 */
export function parseStadiumSetupDraw(card) {
  const t = textOf(card);
  // Only the when-you-play *sentence* may grant a draw. Official reminder
  // text is "stays in play when you play it" and must not fall through to
  // a default draw of 1, or pick up a later "once per turn, draw N".
  const clause = t.match(/when you play (?:this card|it),\s*([^.]+)/);
  if (!clause) return null;
  const body = clause[1];
  if (/stays in play/.test(body)) return null;
  const m = body.match(/draw (?:up to )?(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Pokémon type words that can appear in a stadium's "each of their … Pokémon"
// heal clause, and the symbol letters TCG text uses in their place ({W}, {L}).
const HEAL_TYPE_WORDS = [
  'grass', 'fire', 'water', 'lightning', 'psychic', 'fighting',
  'darkness', 'metal', 'dragon', 'fairy', 'colorless',
];
const HEAL_TYPE_SYMBOLS = {
  g: 'grass', r: 'fire', w: 'water', l: 'lightning', p: 'psychic', f: 'fighting',
  d: 'darkness', m: 'metal', n: 'dragon', y: 'fairy', c: 'colorless',
};

/** Pokémon types named in a heal clause, e.g. "water pokémon and lightning pokémon". */
export function parseStadiumHealTypes(clause) {
  const body = lower(clause);
  const types = [];
  const add = (type) => {
    if (type && !types.includes(type)) types.push(type);
  };
  for (const m of body.matchAll(/\{([a-z])\}/g)) add(HEAL_TYPE_SYMBOLS[m[1]]);
  const words = body.replace(/\{[a-z]\}/g, ' ');
  for (const word of HEAL_TYPE_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(words)) add(word);
  }
  // "Dark Pokémon" is printed for the Darkness type; never keep both spellings.
  if (types.includes('darkness')) {
    const i = types.indexOf('dark');
    if (i >= 0) types.splice(i, 1);
  }
  return types;
}

/**
 * Build the `searchWhat` string a once-per-turn search should use, preserving
 * the printed qualifiers (type symbols, Evolution, Rule Box, Tool, Ultra Beast)
 * that `matchesSearch` already understands. Without this the deck search was
 * offered with no filter at all and the player could take any card.
 */
function stadiumSearchWhat(t) {
  if (/ultra beast/.test(t)) return 'Ultra Beast';
  if (/restored pok[eé]mon/.test(t)) return 'Restored Pokémon';
  const evo = t.match(/evolution\s*\{([a-z])\}\s*pok[eé]mon/);
  if (evo) return `Evolution {${evo[1].toUpperCase()}} Pokémon`;
  const wordEvo = t.match(/evolution\s+([a-z]+)\s+pok[eé]mon/);
  if (wordEvo) return `Evolution ${wordEvo[1][0].toUpperCase()}${wordEvo[1].slice(1)} Pokémon`;
  const typedBasics = [...t.matchAll(/basic\s*\{([a-z])\}\s*pok[eé]mon/g)].map(
    (m) => `Basic {${m[1].toUpperCase()}} Pokémon`
  );
  if (typedBasics.length) return typedBasics.join(' or ');
  // "search … for a Basic Pokémon" (Artazon, Pokémon Contest Hall) is the
  // primary target even when a Tool search is also printed.
  if (/search[^.]*for (?:a|an|up to \d+) basic pok[eé]mon/.test(t)) {
    return 'Basic Pokémon';
  }
  if (/pok[eé]mon tool/.test(t)) return 'Item + Pokémon Tool';
  if (/basic\b/.test(t) && /pok[eé]mon/.test(t)) return 'Basic Pokémon';
  if (/pok[eé]mon/.test(t)) return 'Pokémon';
  if (/basic\b/.test(t) && /energy/.test(t)) return 'Basic Energy';
  if (/energy/.test(t)) return 'Energy';
  return 'card';
}

/** Append the Rule Box qualifier so `matchesSearch` excludes Rule Box mons. */
function withRuleBoxQualifier(what, t) {
  if (
    /doesn't have a rule box|does not have a rule box|don't have a rule box|do not have a rule box|without a rule box|no rule box/.test(
      t
    )
  ) {
    return `${what} that doesn't have a Rule Box`;
  }
  return what;
}

/**
 * Once-per-turn stadium effect descriptor.
 * Returns {
 *   kind, n, cost?, condition?, typeFilter?, types?, targetType?,
 *   searchFilter?, destination?, turnEnds?, basicOnly?
 * } or null.
 */
export function parseStadiumOncePerTurn(card) {
  const t = textOf(card);
  // Ultimate Zone / Saffron City Gym / Celadon City Gym read "as often as …
  // likes during his or her turn" — no "once per turn" phrase. They are modeled
  // as a once-per-turn activation (a deliberate sim simplification; the paper
  // card allows unlimited uses).
  const movement = parseStadiumEnergyMovement(card);
  if (!ONCE_PER_TURN_RE.test(t) && !movement) return null;

  const base = { n: 1 };
  if (movement) {
    return { ...base, kind: movement.kind, repeatable: true };
  }
  if (/played a supporter card from their hand this turn/.test(t)) {
    base.condition = { type: 'supporter-played' };
  }
  if (/supporter card that has "team rocket" in its name/.test(t)) {
    base.condition = { type: 'named-supporter', contains: 'team rocket' };
  }
  // "...their turn ends" (Lumiose City) — the activation is paid for by ending
  // the turn, so the execution layer must advance the turn once it resolves.
  if (/turn ends/.test(t)) {
    base.turnEnds = true;
  }
  // "flip a coin. If heads, …" — the effect resolves only on heads. The coin is
  // modeled as a step, so the parser still returns the effect body.
  if (/flip a coin|flips? (?:any |those )?coins?/.test(t)) {
    base.coin = true;
  }
  // Statically-checkable conditions ("if that player's Active Pokémon is
  // Asleep", "if that player has 6 Pokémon in play", "no Special Energy cards
  // in their discard pile"). The server guards these before executing.
  if (/active pok[eé]mon is asleep/.test(t)) {
    base.condition = { type: 'active-asleep' };
  }
  if (/has 6 pok[eé]mon in play/.test(t)) {
    base.condition = { type: 'six-pokemon-in-play' };
  }
  if (/no special energy cards? in (?:his or her|their|your) discard pile/.test(t)) {
    base.condition = { type: 'no-special-energy-in-discard' };
  }
  if (/bench isn't full|bench is not full/.test(t)) {
    base.condition = { type: 'bench-not-full' };
  }
  if (/has not played a supporter card/.test(t)) {
    base.condition = { type: 'no-supporter-played' };
  }
  if (/has an evolution card in (?:his or her|their|your) hand/.test(t)) {
    base.condition = { type: 'has-evolution-in-hand' };
  }
  const lostZoneWin = t.match(
    /opponent has (\d+) or more pok[eé]mon in the lost zone/
  );
  if (lostZoneWin) {
    base.condition = {
      type: 'opponent-lost-zone',
      n: parseInt(lostZoneWin[1], 10) || 6,
    };
  }
  // "discard a [Basic] Energy card from your hand" (Cycling Road, Heat Factory,
  // Moonlit Hill). Typed clauses are refined below.
  const discardEnergy = t.match(
    /discard (?:an? )?(basic )?energy card from (?:their|his or her|your) hand/
  );
  if (discardEnergy) {
    base.cost = {
      type: 'discard-energy',
      n: 1,
      ...(discardEnergy[1] ? { basicOnly: true } : {}),
    };
  }
  const discardHand = t.match(/discard (\d+) cards? from their hand/);
  if (discardHand) {
    base.cost = { type: 'discard-hand', n: parseInt(discardHand[1], 10) || 2 };
  }
  // Typed Energy discard, e.g. Scorched Earth: "discard a Fire or Fighting
  // Energy card from his or her hand". The clause between "discard" and
  // "from … hand" must name Energy; extract every type word/symbol in it.
  const typedEnergyClause = t.match(
    /discard ([a-z0-9 {}\s,]+?) from (?:their|his or her|your) hand/
  );
  if (typedEnergyClause && /energy card/.test(typedEnergyClause[1])) {
    const clause = typedEnergyClause[1];
    const types = HEAL_TYPE_WORDS.filter((w) =>
      new RegExp(`\\b${w}\\b`).test(clause)
    );
    for (const m of clause.matchAll(/\{([a-z])\}/g)) {
      const type = HEAL_TYPE_SYMBOLS[m[1]];
      if (type && !types.includes(type)) types.push(type);
    }
    if (types.length) {
      base.cost = { type: 'discard-energy', n: 1, types };
    }
  }

  // "discard a card from their hand" (Giant Hearth, Viridian Forest) — an
  // untyped, one-card discard paid before a deck search.
  if (
    !base.cost &&
    /discard (?:a|an) card from (?:their|his or her|your) hand/.test(t)
  ) {
    base.cost = { type: 'discard-hand', n: 1 };
  }

  // Tower of Darkness: "must discard a Single Strike card from their hand". The
  // battle-style tag is printed as a name prefix (the card data carries no
  // dedicated field), so the executor matches on the name/subtype.
  if (
    !base.cost &&
    /discard a single strike card from (?:their|his or her|your) hand/.test(t)
  ) {
    base.cost = { type: 'discard-single-strike', n: 1 };
  }

  // A printed discard cost we did not capture ("discard a Single Strike card")
  // would otherwise run the whole effect for free. Top-of-deck mills are not a
  // cost — PokéStop handles them below.
  if (
    /(?:^|[^a-z])discard (?:a|an|up to|\d|the top)/.test(t) &&
    !base.cost &&
    !/from the top of (?:their|your|his or her) deck/.test(t)
  ) {
    return null;
  }

  // Gates the executor does not model. Running the body unconditionally would
  // be a silent cheat (a free draw/search that ignores the coin flip or board
  // condition), so these are announce-only until the gate is implemented.
  const UNMODELED_GATE =
    /when that player attaches an energy card/.test(t) ||
    (/attach a .*energy card from (?:their|your|his or her) discard pile/.test(t) &&
      !/to 1 of (?:their|your|his or her) benched/.test(t)) ||
    (/from 1 of (?:his or her|their) benched pok[eé]mon/.test(t) &&
      !/heal \d+ damage/.test(t));
  if (UNMODELED_GATE) return null;

  // PokéStop: mill the top N cards; the Item cards among them go to hand.
  const millItems = t.match(
    /discard (\d+) cards? from the top of (?:their|your|his or her) deck/
  );
  if (millItems && /item/.test(t)) {
    return { ...base, kind: 'mill-items', n: parseInt(millItems[1], 10) || 3 };
  }

  // Speed Stadium: "flip a coin until he or she gets tails. For each heads, …
  // draws a card" — an unbounded number of flips, so a dedicated step.
  if (/flip a coin until .* gets tails/.test(t)) {
    return { ...base, kind: 'coin-draw', n: 1 };
  }
  // Healing Field: "removes 2 damage counters from his or her Active Pokémon".
  const healCounters = t.match(
    /removes? (\d+) damage counters? from (?:his or her|their|your) active/
  );
  if (healCounters) {
    return {
      ...base,
      kind: 'heal',
      n: parseInt(healCounters[1], 10) * 10,
      target: 'active',
    };
  }
  // All-Night Party: cure the Active's Special Condition and heal it.
  if (base.condition?.type === 'active-asleep' && /heal (\d+) damage/.test(t)) {
    const m = t.match(/heal (\d+) damage/);
    return {
      ...base,
      kind: 'heal',
      n: parseInt(m[1], 10),
      target: 'active',
      cure: true,
    };
  }
  // Conductive Quarry / Power Tree: search the discard pile for (typed) Energy.
  if (/search(?:es)? (?:his or her|their|your) discard pile for/.test(t)) {
    const clause = t.match(/discard pile for ([^.]+)/)?.[1] || '';
    const types = [];
    for (const m of clause.matchAll(/\{([a-z])\}/g)) {
      const type = HEAL_TYPE_SYMBOLS[m[1]];
      if (type && !types.includes(type)) types.push(type);
    }
    return {
      ...base,
      kind: 'recover-energy',
      n: 1,
      ...(types.length ? { types } : {}),
      ...(/basic/.test(clause) ? { basicOnly: true } : {}),
    };
  }
  // Shopping Center: return an attached Pokémon Tool to hand.
  if (
    /put a pok[eé]mon tool attached to 1 of (?:their|your) pok[eé]mon into (?:their|your) hand/.test(
      t
    )
  ) {
    return { ...base, kind: 'return-tool', n: 1 };
  }
  // Stark Mountain: move a {R}/{F} Energy between your own Pokémon.
  if (
    /choose a \{r\} or \{f\} energy attached to 1 of (?:his or her|their|your) pok[eé]mon and move/.test(
      t
    )
  ) {
    return { ...base, kind: 'move-energy', n: 1 };
  }
  // Undersea Ruins: coin flip, then devolve an Evolved Pokémon.
  if (/discards the top evolution card from that pok[eé]mon, devolving/.test(t)) {
    return { ...base, kind: 'devolve', n: 1 };
  }
  // Lavender Town: opponent reveals their hand.
  if (/opponent reveal (?:their|his or her) hand/.test(t)) {
    return { ...base, kind: 'reveal-hand', n: 1 };
  }
  // Lost World: win outright when the opponent's Lost Zone is deep enough.
  if (/choose to win the game/.test(t)) {
    return { ...base, kind: 'win-game', n: 1 };
  }
  // Ancient Ruins: reveal your hand, then draw 1 only if it holds no Supporter.
  if (
    /has not played a supporter card/.test(t) &&
    /reveal (?:his or her|their|your) hand/.test(t)
  ) {
    return { ...base, kind: 'ancient-ruins', n: 1 };
  }
  // Mystery Zone: trade a hand Evolution card for a Basic Energy from the deck.
  if (
    /has an evolution card in (?:his or her|their|your) hand/.test(t) &&
    /search(?:es)? (?:his or her|their|your) deck for a basic energy card/.test(t)
  ) {
    return { ...base, kind: 'mystery-zone', n: 1 };
  }
  // Fuchsia City Gym: shuffle a named Pokémon in play (and its attachments)
  // into the deck.
  const shuffleOwn = t.match(
    /shuffle 1 of (?:his or her|their|your) pok[eé]mon in play with ([a-z.' ]+?) in its name/
  );
  if (shuffleOwn) {
    return {
      ...base,
      kind: 'shuffle-own-pokemon',
      n: 1,
      searchFilter: shuffleOwn[1].trim(),
    };
  }
  // Magma Basin: attach a {R} Energy from the discard to a Benched {R} Pokémon,
  // then put 2 damage counters on it.
  if (
    /attach a \{r\} energy card from (?:their|your|his or her) discard pile to 1 of (?:their|your|his or her) benched/.test(
      t
    )
  ) {
    return {
      ...base,
      kind: 'attach-discard-damage',
      n: 1,
      energyType: 'fire',
      damage: 2,
    };
  }
  // Radio Tower: look at the top N cards and put them back in the same order.
  if (
    /look at the top \d+ cards? of (?:his or her|their|your) deck and put (?:them|it) back in the same order/.test(
      t
    )
  ) {
    const m = t.match(/top (\d+) cards?/);
    return { ...base, kind: 'peek-return', n: parseInt(m[1], 10) || 2 };
  }
  // Primordial Altar: look at the top card and optionally discard it.
  if (
    /look at the top card of (?:his or her|their|your) deck.*(?:may|can) discard (?:that|it)/.test(
      t
    )
  ) {
    return { ...base, kind: 'peek-discard', n: 1 };
  }
  // Twist Mountain: put a Restored Pokémon from hand onto the Bench.
  if (
    /puts? a restored pok[eé]mon from (?:his or her|their|your) hand onto (?:his or her|their|your) bench/.test(
      t
    )
  ) {
    return { ...base, kind: 'bench-restored', n: 1 };
  }
  // Strange Cave / Underground Lake: put a named fossil Pokémon onto the Bench.
  if (
    /put an? (?:omanyte|kabuto|aerodactyl|lileep|anorith).*bench/.test(t) ||
    /put an? (?:omanyte|kabuto)[^.]*bench/.test(t)
  ) {
    const fromDiscard = /from (?:his or her|their|your) discard pile/.test(t);
    return {
      ...base,
      kind: 'fossil-bench',
      n: 1,
      source: fromDiscard ? 'discard' : 'hand',
    };
  }
  const drawUntilCount = t.match(
    /draws? cards? until (?:they|you|he or she|that player) (?:has|have) (\d+) cards? in (?:their|your|his or her) hand/
  );
  if (drawUntilCount) {
    return { ...base, kind: 'draw-until-count', n: parseInt(drawUntilCount[1], 10) || 5 };
  }
  const shuffleDraw = t.match(
    /shuffle (?:their|your|his or her) hand into (?:their|your|his or her) deck and draw (\d+) cards?/
  );
  if (shuffleDraw) {
    return { ...base, kind: 'shuffle-draw', n: parseInt(shuffleDraw[1], 10) || 5 };
  }

  if (/put a card from their hand on top of their deck/.test(t)) {
    return { ...base, kind: 'hand-to-deck-top', n: 1 };
  }
  if (
    /switch their active \{w\}/.test(t) ||
    /switch their active.*\{w\}/.test(t)
  ) {
    return { ...base, kind: 'switch-type', typeFilter: 'water' };
  }
  if (
    /put up to (\d+) basic \{l\} energy/.test(t) &&
    /discard.*bench/.test(t)
  ) {
    const m = t.match(/put up to (\d+)/);
    return {
      ...base,
      kind: 'discard-to-bench',
      n: m ? parseInt(m[1], 10) : 2,
      typeFilter: 'lightning',
    };
  }
  // Pokémon Center: "heal 20 damage from 1 of his or her Benched Pokémon".
  const healBench = t.match(
    /heal (\d+) damage from 1 of (?:his or her|their|your) benched pok[eé]mon/
  );
  if (healBench) {
    return {
      ...base,
      kind: 'heal',
      n: parseInt(healBench[1], 10),
      target: 'bench',
    };
  }
  const healEach = t.match(/heal (\d+) damage from each(?: of their)? ([^.]+)/);
  if (healEach) {
    const types = parseStadiumHealTypes(healEach[2]);
    return {
      ...base,
      kind: 'heal-all',
      n: parseInt(healEach[1], 10),
      ...(types.length ? { types } : {}),
    };
  }
  if (/search/.test(t) && /evolv/.test(t)) {
    return {
      ...base,
      kind: 'search-evolve',
      n: 1,
      chainStage2: /stage 2/.test(t),
    };
  }
  if (/search.*basic.*pok[ée]mon.*bench/.test(t)) {
    return {
      ...base,
      kind: 'search-bench',
      n: 1,
      searchWhat: withRuleBoxQualifier(stadiumSearchWhat(t), t),
    };
  }
  const fusion = t.match(/search.*up to (\d+) item cards that have "([^"]+)"/);
  if (fusion) {
    return {
      ...base,
      kind: 'search-hand',
      n: parseInt(fusion[1], 10) || 2,
      searchFilter: fusion[2],
      searchWhat: 'item',
      // Fossil Quarry puts the "Antique" Items directly onto the Bench.
      destination: /onto their bench/.test(t) ? 'bench' : 'hand',
    };
  }
  if (/search.*marnie's pokémon/.test(t)) {
    return {
      ...base,
      kind: 'search-hand',
      n: 1,
      searchFilter: "marnie's",
      searchWhat: 'pokemon',
    };
  }
  if (/attach/.test(t) && /energy/.test(t)) {
    const m = t.match(/up to (\d+)/);
    return { ...base, kind: 'energy', n: m ? parseInt(m[1], 10) : 1 };
  }
  // Discard-pile Energy recovery: Levincia ("up to 2 Basic {L} Energy"),
  // Mt. Coronet ("2 {M} Energy"), Training Court ("a basic Energy card"), etc.
  // Not a deck search — must precede the generic search fallback.
  const recoverEnergy = t.match(
    /puts? (?:up to )?(?:an? )?(\d+ )?(basic )?(\{([a-z])\}\s*)?energy cards? from (?:their|your|his or her) discard pile into (?:their|your|his or her) hand/
  );
  if (recoverEnergy) {
    const type = recoverEnergy[4] ? HEAL_TYPE_SYMBOLS[recoverEnergy[4]] : null;
    return {
      ...base,
      kind: 'recover-energy',
      n: recoverEnergy[1] ? parseInt(recoverEnergy[1], 10) || 1 : 1,
      ...(type ? { typeFilter: type } : {}),
      ...(recoverEnergy[2] ? { basicOnly: true } : {}),
    };
  }
  // Mystery Garden: "discard an Energy card … in order to draw cards until they
  // have as many cards in their hand as they have {P} Pokémon in play." The
  // draw has no printed count — the target is a live board count, so a fixed
  // `n` would silently draw 1.
  const untilHandSize = t.match(
    /draws? cards? until (?:they|you) have as many cards in (?:their|your) hand as (?:they|you) have \{([a-z])\} pok[eé]mon in play/
  );
  if (untilHandSize) {
    const type = HEAL_TYPE_SYMBOLS[untilHandSize[1]];
    return {
      ...base,
      kind: 'draw-until-type',
      n: null,
      ...(type ? { targetType: type } : {}),
      cost: base.cost || { type: 'discard-energy', n: 1 },
    };
  }
  if (/discard/.test(t) && /draw/.test(t)) {
    // Third-person "draws N" (Scorched Earth) as well as "draw N".
    const dm = t.match(/draws? (?:up to )?(\d+|a card)/);
    const n = !dm || dm[1] === 'a card' ? 1 : parseInt(dm[1], 10) || 1;
    return {
      ...base,
      kind: 'discard-draw',
      n,
      cost: base.cost || { type: 'discard-hand', n: 2 },
    };
  }
  if (/draws?\b/.test(t)) {
    // Third-person "draws N" / "draws a card" as well as "draw N" (Scorched
    // Earth class — no discard cost). Missing "draws" here silently drew 1.
    const m = t.match(/draws? (?:up to )?(\d+|a card)/);
    const n = !m || m[1] === 'a card' ? 1 : parseInt(m[1], 10) || 1;
    return { ...base, kind: 'draw', n };
  }
  // Giant Hearth / Viridian Forest: discard a card from hand, then search the
  // deck for typed/deck Energy. Both the cost and the search count/filter are
  // printed, so this composes a discardCost + searchDeck rather than falling
  // through to a free search.
  if (
    /discard (?:a|an) card from (?:their|his or her|your) hand/.test(t) &&
    /search(?:es)? (?:their|your|his or her) deck/.test(t)
  ) {
    const es = t.match(
      /search(?:es)? (?:their|your|his or her) deck for (?:up to )?(\d+|an?|a) (basic )?(\{([a-z])\}\s*)?energy cards?/
    );
    if (es) {
      const n = /^\d+$/.test(es[1]) ? parseInt(es[1], 10) : 1;
      const symbol = es[4] ? es[4].toUpperCase() : null;
      const searchWhat = symbol
        ? `{${symbol}} Energy`
        : es[2]
          ? 'Basic Energy'
          : 'Energy';
      return {
        ...base,
        kind: 'discard-search',
        n,
        searchWhat,
        cost: base.cost || { type: 'discard-hand', n: 1 },
      };
    }
  }
  if (/search|look through|find/.test(t)) {
    return { ...base, kind: 'search', n: 1, searchWhat: stadiumSearchWhat(t) };
  }
  if (/heal/.test(t)) {
    const m = t.match(/heal\s*(\d+)?/);
    return { ...base, kind: 'heal', n: m?.[1] ? parseInt(m[1], 10) : 10 };
  }
  // No modeled effect: stay announce-only rather than defaulting to a deck
  // search, which silently let the player take any card.
  return null;
}

/** Whether a once-per-turn stadium condition is met for this player. */
export function stadiumOnceConditionMet(condition, playerFlags = {}) {
  if (!condition) return true;
  if (condition.type === 'supporter-played')
    return !!playerFlags.supporterPlayed;
  if (condition.type === 'named-supporter') {
    const name = String(playerFlags.lastSupporterName || '').toLowerCase();
    return (
      !!name && name.includes(String(condition.contains || '').toLowerCase())
    );
  }
  if (condition.type === 'no-supporter-played') {
    return !playerFlags.supporterPlayed;
  }
  // The remaining conditions depend on hand/board state the flags object does
  // not carry; the server executor re-checks them against live state.
  return true;
}

/** Whether a deck card evolves from a Pokémon currently in play (Grand Tree). */
export function matchesStadiumEvolveSearch(deckCard, inPlayPokemon = []) {
  if (!deckCard || !inPlayPokemon.length) return false;
  const from = lower(deckCard.evolvesFrom);
  if (!from) return false;
  return inPlayPokemon.some((host) => pokemonNamesMatch(host?.name, from));
}

/** Deck/hand search filter for stadium once-per-turn effects. */
export function matchesStadiumSearch(card, { searchWhat, searchFilter } = {}) {
  if (!card) return false;
  const name = lower(card.name || '');
  if (searchFilter && !name.includes(String(searchFilter).toLowerCase()))
    return false;
  // Delegate to the shared matcher so the richer qualifiers the parser now
  // preserves (type symbols, Evolution, Rule Box, Tool) filter correctly on
  // the legacy client path too.
  return matchesSearch(card, searchWhat || 'basic pokemon');
}

// Tera detection now lives in card-classify.mjs; re-exported for this
// module's existing importers.
export { isTeraCard };

/** Bench limit for a player (5 default; 8 when Area Zero + any Tera in play). */
export function getEffectiveBenchLimit(hasTeraInPlay) {
  if (!rulesState.enabled) return 5;
  const stadium = getStadium()?.card;
  const limit = parseStadiumBenchLimit(stadium);
  if (!limit) return 5;
  // Area Zero's raised limit is gated on a Tera Pokémon being in play; Sky
  // Field's is unconditional. Limits below 5 (Collapsed Stadium, Giant Stump,
  // Narrow Gym) always tighten.
  if (limit > 5 && /tera pok[eé]mon/.test(textOf(stadium))) {
    return hasTeraInPlay ? limit : 5;
  }
  return limit;
}

export function playerHasTeraInPlay(pokemonInPlay = []) {
  return pokemonInPlay.some(isTeraCard);
}

/**
 * Continuous damage prevention: "Prevent all damage …"
 * Returns the number of damage counters prevented (Infinity for "all"),
 * or null if not a prevention effect.
 */
/**
 * Continuous damage prevention: "Prevent all damage …"
 * Returns { amount, zone: 'active'|'bench'|'any', ruleBoxOnly?: bool } or null.
 */
export function parseStadiumDamagePreventionDetail(card) {
  const t = textOf(card);
  if (!t || !/prevent/.test(t) || !/damage/.test(t)) return null;
  let zone = 'any';
  if (/benched pokémon|on the bench|from the bench/.test(t)) zone = 'bench';
  else if (/active pokémon|your active|the active/.test(t)) zone = 'active';
  const ruleBoxOnly =
    /don't have a rule box|without a rule box|non-rule box/.test(t);
  let amount = Infinity;
  if (!/all damage|all\s+damage/.test(t)) {
    const m = t.match(/(\d+)\s*(?:damage|poison|special)/);
    amount = m ? parseInt(m[1], 10) : Infinity;
  }
  return { amount, zone, ruleBoxOnly };
}

/** Back-compat shim: amount only (Infinity = all). */
export function parseStadiumDamagePrevention(card) {
  const d = parseStadiumDamagePreventionDetail(card);
  return d ? d.amount : null;
}

/** Whether stadium prevention applies to a defender in `zoneId`. */
export function stadiumPreventionApplies(
  stadiumCard,
  { zoneId = 'active', defender = null } = {}
) {
  const d = parseStadiumDamagePreventionDetail(stadiumCard);
  if (!d) return false;
  if (d.zone === 'bench' && zoneId !== 'bench') return false;
  if (d.zone === 'active' && zoneId !== 'active') return false;
  if (d.ruleBoxOnly && defender && isRuleBoxPokemon(defender)) return false;
  return true;
}

/**
 * Continuous damage reduction: "take N less damage from attacks"
 * Returns the amount reduced, or 0 if not a reduction effect.
 */
export function parseStadiumDamageReduction(card) {
  const t = textOf(card);
  if (!t || !/take\s+\d+\s+less damage/.test(t)) return 0;
  const m = t.match(/take\s+(\d+)\s+less damage/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Whether a Pokémon matches a stadium's printed name/type filter (e.g. {M}, Hop's). */
export function stadiumFilterMatches(card, stadiumCard) {
  const t = textOf(stadiumCard);
  const name = lower(card?.name || '');
  if (!name) return false;
  if (/steven's pokémon/.test(t) && !name.includes('steven')) return false;
  if (/hop's pokémon/.test(t) && !name.includes('hop')) return false;
  if (/n's pokémon/.test(t) && !/\bn's\b/.test(name) && !name.startsWith('n '))
    return false;
  if (/\{c\} pokémon/.test(t)) {
    const types = (card?.types || []).map(lower);
    if (types.length && !types.includes('colorless')) return false;
  }
  const typeMatches = [...t.matchAll(/\{([wlfmpdgyn])\}/gi)];
  if (typeMatches.length) {
    const typeMap = {
      w: 'water',
      l: 'lightning',
      f: 'fighting',
      m: 'metal',
      p: 'psychic',
      d: 'darkness',
      g: 'grass',
      y: 'fairy',
      n: 'dragon',
    };
    const wanted = typeMatches
      .map((m) => typeMap[m[1].toLowerCase()])
      .filter(Boolean);
    const types = (card?.types || []).map(lower);
    // A multi-type card (Moonlight Stadium's {P}/{D}) matches if the Pokémon
    // has any of the listed types.
    if (wanted.length && types.length && !wanted.some((w) => types.includes(w))) {
      return false;
    }
  }
  if (/stage 2 pokémon/.test(t)) {
    const stage = lower(card?.stage || '').replace(/[^a-z0-9]/g, '');
    if (stage && stage !== 'stage2') return false;
  }
  if (/basic pokémon/.test(t)) {
    const stage = lower(card?.stage || '').replace(/[^a-z0-9]/g, '');
    if (stage && stage !== 'basic') return false;
  }
  if (/evolved pokémon/.test(t)) {
    const stage = lower(card?.stage || '').replace(/[^a-z0-9]/g, '');
    if (stage && stage === 'basic') return false;
  }
  if (/each psyduck/.test(t) && !name.includes('psyduck')) return false;
  if (
    /tera pokémon/.test(t) &&
    !(card?.subtypes || []).map(lower).includes('tera')
  )
    return false;
  return true;
}

// ── Weakness / Resistance modifiers (continuous) ───────────────────────────

/** The energy type a card provides/represents, lowercased ('' if unknown). */
function energyTypeOf(card) {
  if (!card) return '';
  return lower(card.energyType || (Array.isArray(card.types) ? card.types[0] : ''));
}

/** True when `pokemon` has an attached Energy card whose type/name matches. */
function hasAttachedEnergy(pokemon, zoneCards, { type = null, namePart = null } = {}) {
  if (!pokemon) return false;
  const wanted = type ? lower(type) : null;
  for (const c of Array.isArray(zoneCards) ? zoneCards : []) {
    if (c?.attachedTo !== pokemon.instanceId) continue;
    const supertype = lower(c?.supertype || c?.type || '');
    if (!supertype.includes('energy') && !/\benergy\b/i.test(String(c?.name || '')))
      continue;
    if (namePart && String(c?.name || '').toLowerCase().includes(namePart)) return true;
    if (wanted) {
      const et = energyTypeOf(c);
      const nm = lower(c?.name || '');
      const shortWanted = wanted === 'darkness' ? 'dark' : wanted;
      if (
        et === wanted ||
        et === shortWanted ||
        (shortWanted === 'dark' && (et.includes('dark') || nm.includes('darkness')))
      )
        return true;
    }
  }
  return false;
}

/** A Stadium that removes Weakness from some Pokémon ("… has no Weakness"). */
export function isStadiumNoWeakness(card) {
  const t = textOf(card);
  if (!t) return false;
  return /no weakness/.test(t) && !/weakness is now/.test(t);
}

/**
 * Whether the in-play stadium nullifies `defender`'s printed Weakness. Applies
 * to Pokémon matching the card's type filter; the energy-conditioned variants
 * (Shadow Circle / Plasma Frigate) and Glacia's ex exclusion are honored.
 */
export function stadiumNullifiesWeakness(
  stadiumCard,
  defender,
  { defenderZoneCards = [] } = {}
) {
  if (!isStadiumNoWeakness(stadiumCard)) return false;
  const t = textOf(stadiumCard);
  if ((/excluding pokémon-ex|excluding pokemon-ex/.test(t) || /\bnon-ex\b/.test(t)) && isExCard(defender)) {
    return false;
  }
  if (/has any \{d\} energy attached/.test(t)) {
    return hasAttachedEnergy(defender, defenderZoneCards, { type: 'darkness' });
  }
  if (/has any plasma energy attached/.test(t)) {
    return hasAttachedEnergy(defender, defenderZoneCards, { namePart: 'plasma' });
  }
  return stadiumFilterMatches(defender, stadiumCard);
}

/** Lake Boundary: "Apply Weakness … as ×2 instead." */
export function isStadiumWeaknessTimesTwo(card) {
  const t = textOf(card);
  return /apply weakness/.test(t) && /(?:×|x)?\s*2/.test(t);
}

/** A Stadium whose attacks ignore Resistance ("not affected by Resistance"). */
export function isStadiumResistanceIgnore(card) {
  const t = textOf(card);
  if (!t) return false;
  return (
    /resistance/.test(t) &&
    /(?:isn'?t|is not|not)\s+affected by/.test(t) &&
    /attacks?/.test(t)
  );
}

/** Whether a Stadium makes `attacker`'s attack damage ignore Resistance. */
export function stadiumIgnoresResistance(stadiumCard, attacker) {
  if (!isStadiumResistanceIgnore(stadiumCard)) return false;
  return stadiumFilterMatches(attacker, stadiumCard);
}

/** Drake's Stadium: flat −N to damage done to matching Active Pokémon. */
export function parseStadiumTypeDamageReduction(card) {
  const t = textOf(card);
  if (!t || !/reduced by/.test(t) || !/damage/.test(t)) return 0;
  const m = t.match(/reduced by\s+(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Flat damage reduction the Stadium applies to `defender` (0 when N/A). */
export function getStadiumTypeDamageReduction(
  stadiumCard,
  defender,
  { defenderIsActive = true } = {}
) {
  const amount = parseStadiumTypeDamageReduction(stadiumCard);
  if (amount <= 0) return 0;
  const t = textOf(stadiumCard);
  if (/active pokémon/.test(t) && !defenderIsActive) return 0;
  if (!stadiumFilterMatches(defender, stadiumCard)) return 0;
  return amount;
}

/**
 * Opponent retreat prevention: "your opponent's active pokémon can't retreat"
 * Returns true if the stadium prevents opponent retreats.
 */
export function isStadiumRetreatPrevention(card) {
  const t = textOf(card);
  if (!t) return false;
  return /your opponent/.test(t) && /can'?t retreat|cannot retreat/.test(t);
}

/**
 * Cost modifier (continuous): "the energy cost of attacks by your Active
 * Pokémon is reduced by 1" / "attacks cost 1 less Energy" — the stadium
 * equivalent of the Section C `passiveCostDiscount` family (e.g. Lillie's
 * Room–style cost-reduction stadiums).
 * Returns the discount (number of cost symbols removed) or 0 if the
 * stadium does not reduce attack costs. Same parser shape as
 * `passiveCostDiscount` in ability-executors.mjs so the two stack cleanly.
 */
export function parseStadiumCostModifier(card) {
  const t = textOf(card);
  if (!t || !/cost/.test(t)) return 0;
  if (!/(less|reduc|lower)/.test(t)) return 0;
  const m = t.match(/(?:by|less)\s*(\d+)/) || t.match(/(\d+)\s+less/);
  return m ? parseInt(m[1], 10) || 1 : 1;
}

/**
 * Hand protection: "damage counters can't be placed on pokémon in your hand"
 * or "cards in your hand can't be discarded"
 * Returns true if the stadium protects the player's hand.
 */
export function isStadiumHandProtect(card) {
  const t = textOf(card);
  if (!t) return false;
  if (/hand/.test(t) && /(can'?t|cannot|protect|discard)/.test(t)) return true;
  if (/your hand/.test(t) && /can'?t be/.test(t)) return true;
  return false;
}

/**
 * HP modifier (continuous): "Basic Pokémon in play have +20 HP" /
 * "your Pokémon have +20 HP" / "Pokémon in play have 10 less HP".
 * Returns the modifier (positive = +HP, negative = −HP, 0 = none).
 */
export function parseStadiumHpModifier(card) {
  const t = textOf(card);
  if (!t || !/hp/.test(t)) return 0;
  // "N HP or less remaining" is a state condition, not an HP modifier
  // (Blizzard Town: "Pokémon with 40 HP or less remaining … can't attack").
  // Without this guard the negative branch read "40 HP" as −40 HP.
  if (/\b\d+\s*hp\s*or\s+(?:less|fewer)\b/.test(t)) return 0;
  // Negative: "-N HP" / "gets -N HP" / "have N less HP"
  const negSigned = t.match(/(?:gets?\s*)?-\s*(\d+)\s*hp/);
  if (negSigned) return -parseInt(negSigned[1], 10);
  if (/(less|decrease|reduc|lower)/.test(t)) {
    const m = t.match(
      /(\d+)\s*less\s*hp|decreases? by\s*(\d+)|reduced by\s*(\d+)|lowered by\s*(\d+)/
    );
    const n = m ? parseInt(m[1] || m[2] || m[3] || m[4], 10) : 10;
    return -(n || 10);
  }
  const m = t.match(
    /\+\s*(\d+)\s*(?:hp|more hp)|hp\s*(?:increases?|goes? up|raises?)\s*by\s*(\d+)|(\d+)\s*more hp/
  );
  const n = m ? parseInt(m[1] || m[2] || m[3], 10) : 0;
  return n || 0;
}

/**
 * Blizzard Town: "Pokémon with N HP or less remaining (both yours and your
 * opponent's) can't attack." Returns `{ hpAtMost }` or null. This is an
 * attack lock, not an HP modifier — the two must not be conflated.
 */
export function parseStadiumAttackLock(card) {
  const t = textOf(card);
  if (!t) return null;
  if (!/can'?t attack|cannot attack/.test(t)) return null;
  const m = t.match(/with (\d+) hp or less remaining/);
  if (!m) return null;
  return { hpAtMost: Number(m[1]) };
}

export function isStadiumAttackLock(card) {
  return parseStadiumAttackLock(card) !== null;
}

/**
 * Attack-block reason for `pokemon` while `stadiumCard` is in play, or null.
 * Fails open when HP data has not synced (matches the HP-cap search policy).
 */
export function stadiumAttackLockReason(stadiumCard, pokemon) {
  const lock = stadiumCard ? parseStadiumAttackLock(stadiumCard) : null;
  if (!lock || !pokemon) return null;
  const hp = Number(pokemon.hp);
  if (!Number.isFinite(hp)) return null;
  const remaining = hp - (Number(pokemon.damage) || 0);
  if (remaining > lock.hpAtMost) return null;
  return `Pokémon with ${lock.hpAtMost} HP or less remaining can't attack (${
    stadiumCard.name || 'Stadium'
  }).`;
}

/** Stadium HP modifier applies to this Pokémon (stage/name/type filters). */
export function stadiumHpModifierMatches(stadiumCard, pokemon) {
  if (!pokemon) return true;
  return stadiumFilterMatches(pokemon, stadiumCard);
}

/** Who receives a stadium modifier: owner, opponent, or both. */
function stadiumTargetScope(stadiumCard) {
  const t = textOf(stadiumCard);
  if (stadiumAffectsBothPlayers(stadiumCard)) return 'both';
  if (/your opponent|opponent's/.test(t)) return 'opponent';
  if (/your pokémon|your (?!opponent)/.test(t)) return 'owner';
  return 'both';
}

/**
 * Determine the HP bonus applicable to a given player's Pokémon from the
 * current stadium. Returns a number (positive or negative, 0 if none).
 */
export function getStadiumHpBonus(
  targetPlayer,
  pokemon = null,
  stadiumOverride = null
) {
  const stadium = stadiumOverride
    ? stadiumOverride.card
      ? stadiumOverride
      : { card: stadiumOverride, user: stadiumOverride.ownerId }
    : rulesState.enabled
      ? getStadium()
      : null;
  if (!stadium?.card) return 0;
  const bonus = parseStadiumHpModifier(stadium.card);
  if (bonus === 0) return 0;
  if (pokemon && !stadiumHpModifierMatches(stadium.card, pokemon)) return 0;
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent') return targetPlayer !== stadium.user ? bonus : 0;
  if (scope === 'owner') return targetPlayer === stadium.user ? bonus : 0;
  return bonus;
}

/**
 * Compute effective HP for a Pokémon given a base HP and the target player.
 * Optional zoneCards includes attached Tools for HP bonuses (Hero's Cape, etc.).
 * Optional stadiumOverride provides the server draft.stadium without relying on rulesState.
 * Optional sideCards is the whole in-play side, so ability HP bonuses can read
 * the holder's own and team-scope modifiers (design 034); without it the
 * zoneCards list still covers the holder's own ability.
 * Clamped to ≥ 1 so a −HP modifier can't make a Pokémon have 0 HP.
 */
export function effectiveHp(
  baseHp,
  targetPlayer,
  pokemon = null,
  zoneCards = null,
  stadiumOverride = null,
  sideCards = null
) {
  const base = baseHp || 0;
  if (!base) return 0;
  let total = base + getStadiumHpBonus(targetPlayer, pokemon, stadiumOverride);
  // Special-energy +HP modifiers (Growing Grass, Heat, …): taxonomy §F Gap #4c.
  if (zoneCards?.length && pokemon) {
    total += getSpecialEnergyHpBonus(pokemon, zoneCards);
  }
  const blockTools = stadiumOverride
    ? isStadiumToolNegation(stadiumOverride.card || stadiumOverride)
    : stadiumBlocksToolEffects();
  if (zoneCards?.length && pokemon && !blockTools) {
    const holder = topPokemonCard(zoneCards, pokemon) || pokemon;
    for (const tool of attachedTools(pokemon, zoneCards)) {
      total = applyHpBonus(total, toolHpBonusFor(tool, { holder, zoneCards }));
    }
  }
  if (pokemon) {
    const abilityCards = sideCards || zoneCards || [];
    total += abilityHpBonus(pokemon, {
      sideCards: abilityCards,
      inPlayCards: abilityCards,
    });
  }
  return Math.max(1, total);
}

/**
 * Evolution speed (continuous): two recognized sub-effects, mirroring the
 * Section C passive hook shape:
 *   - `relaxTurnGate` — "may evolve as if it had been in play for 1 more
 *     turn" / "as if it were already in play": the Pokémon is not treated
 *     as just-played, so the same-turn evolution gate is relaxed.
 *   - `costReduce` — "evolving costs N less Energy" / "evolutions cost N
 *     less": N energy removed from the evolution cost.
 * Returns `{ relaxTurnGate: bool, costReduce: number }`; both default to
 * their "no effect" values when the card does not grant them.
 */
export function parseStadiumEvolutionSpeed(card) {
  const t = textOf(card);
  const out = { relaxTurnGate: false, costReduce: 0, typeFilter: null };
  if (!t || !/evolv/.test(t)) return out;
  const typeMatch = t.match(/\{([wlfmpdgyn])\}/i);
  if (typeMatch) {
    const typeMap = {
      w: 'water',
      l: 'lightning',
      f: 'fighting',
      m: 'metal',
      p: 'psychic',
      d: 'darkness',
      g: 'grass',
      y: 'fairy',
      n: 'dragon',
    };
    out.typeFilter = typeMap[typeMatch[1].toLowerCase()] || null;
  }
  if (
    /as if (?:it|they) (?:had been|were) (?:in play|already)/.test(t) ||
    /since the start of the (?:game|battle|previous turn)/.test(t) ||
    /even if (?:it|they) (?:had been|were) (?:just )?played/.test(t) ||
    /during the turn (?:they|you) play those pokémon/.test(t) ||
    /can evolve .* during the turn they play/.test(t) ||
    // Forest of Giant Plants: "can evolve during … first turn or the turn …
    // plays those Pokémon".
    /can evolve during (?:his or her|their|your) first turn/.test(t) ||
    /the turn (?:he or she|they|you) plays? those pokémon/.test(t) ||
    // Broken Time-Space: "may evolve a Pokémon that … just played or evolved
    // during that turn".
    /evolve a pokémon that (?:he or she|they|you) just played/.test(t)
  ) {
    out.relaxTurnGate = true;
  }
  if (/cost/.test(t) && /(less|reduc|lower)/.test(t)) {
    const m = t.match(/(?:by|less)\s*(\d+)/) || t.match(/(\d+)\s+less/);
    if (m) out.costReduce = parseInt(m[1], 10) || 1;
  }
  return out;
}

/**
 * Whether the Stadium lets `pokemon` (the top card in play) evolve into `evolution` on a turn it
 * was played or already evolved (Forest of Vitality: a {G} Basic played this turn can evolve to
 * Stage 1 and then Stage 2). Both cards must match the Stadium's type filter when it has one.
 * Pure: the server passes its own Stadium card (ownerId = the player who played it).
 */
export function stadiumAllowsSameTurnEvolution(stadiumCard, { playerId, pokemon, evolution } = {}) {
  if (!stadiumCard) return false;
  const parsed = parseStadiumEvolutionSpeed(stadiumCard);
  if (!parsed.relaxTurnGate) return false;
  if (parsed.typeFilter) {
    const hasType = (card) => (card?.types || []).map(lower).includes(parsed.typeFilter);
    if (!hasType(pokemon)) return false;
    if (evolution && (evolution.types || []).length && !hasType(evolution)) return false;
  }
  const scope = stadiumTargetScope(stadiumCard);
  const owner = stadiumCard.ownerId;
  if (scope === 'opponent' && owner != null) return playerId !== owner;
  if (scope === 'owner' && owner != null) return playerId === owner;
  return true;
}

export function getStadiumEvolutionSpeed(targetPlayer, pokemon = null) {
  const neutral = { relaxTurnGate: false, costReduce: 0, typeFilter: null };
  if (!rulesState.enabled) return neutral;
  const stadium = getStadium();
  if (!stadium?.card) return neutral;
  const parsed = parseStadiumEvolutionSpeed(stadium.card);
  if (!parsed.relaxTurnGate && parsed.costReduce === 0) return neutral;
  if (pokemon && parsed.typeFilter) {
    const types = (pokemon?.types || []).map(lower);
    if (types.length && !types.includes(parsed.typeFilter)) return neutral;
  }
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent') {
    return targetPlayer !== stadium.user ? parsed : neutral;
  }
  if (scope === 'owner') {
    return targetPlayer === stadium.user ? parsed : neutral;
  }
  return parsed;
}

/**
 * Retreat cost modifier: "Retreat Cost … is {C} less" / "have no Retreat Cost".
 * Returns delta applied to printed retreat (negative = cheaper).
 */
export function parseStadiumRetreatModifier(card) {
  const t = textOf(card);
  if (!t || !/retreat cost|retreat/.test(t)) return 0;
  if (/no retreat cost|retreat cost of 0|retreat for free|retreat cost .* is 0/.test(t))
    return -Infinity;
  // "pays {C} more to retreat" (Broken Ground Gym, The Rocket's Training Gym,
  // Team Aqua Hideout) raises the cost.
  if (/\{c\}\s+more to retreat|pays? \{c\} more to retreat|more to retreat/.test(t)) {
    return 1;
  }
  if (/(less|reduc|lower)/.test(t)) {
    const m = t.match(/(?:by|less)\s*(\d+)|(\d+)\s+less/);
    return -(m ? parseInt(m[1] || m[2], 10) || 1 : 1);
  }
  return 0;
}

/** Effective retreat cost for a Pokémon with the current stadium in play. */
export function getStadiumRetreatCost(
  baseRetreat,
  pokemon,
  targetPlayer,
  stadiumOverride = null
) {
  const stadium = stadiumOverride || (rulesState.enabled ? getStadium() : null);
  const card = stadium?.card || stadium;
  if (!card) return baseRetreat;
  const delta = parseStadiumRetreatModifier(card);
  if (delta === 0) return baseRetreat;
  if (!stadiumFilterMatches(pokemon, card)) return baseRetreat;
  const scope = stadiumTargetScope(card);
  const stadiumUser = stadium?.user ?? stadium?.playedBy;
  if (scope === 'opponent' && targetPlayer === stadiumUser) return baseRetreat;
  if (scope === 'owner' && targetPlayer !== stadiumUser) return baseRetreat;
  if (delta === -Infinity) return 0;
  return Math.max(0, baseRetreat + delta);
}

/** Bench play damage (Risky Ruins): damage counters placed when benching Basics. */
export function parseStadiumBenchDamageOnPlay(card) {
  const t = textOf(card);
  if (!t || !/bench/.test(t)) return null;
  if (!/place\s+\d+\s+damage counter/.test(t)) return null;
  const m = t.match(/place\s+(\d+)\s+damage counter/);
  return m ? parseInt(m[1], 10) : null;
}

/** Attack damage bonus from stadium (Postwick-style). */
export function parseStadiumAttackDamageBonus(card) {
  const t = textOf(card);
  if (!t || !/do\s+\d+\s+more damage/.test(t)) return 0;
  const m = t.match(/do\s+(\d+)\s+more damage/);
  return m ? parseInt(m[1], 10) : 0;
}

export function getStadiumAttackDamageBonus(attacker, targetPlayer) {
  if (!rulesState.enabled || !attacker) return 0;
  const stadium = getStadium();
  if (!stadium?.card) return 0;
  const bonus = parseStadiumAttackDamageBonus(stadium.card);
  if (bonus <= 0) return 0;
  if (!stadiumFilterMatches(attacker, stadium.card)) return 0;
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent' && targetPlayer === stadium.user) return 0;
  if (scope === 'owner' && targetPlayer !== stadium.user) return 0;
  return bonus;
}

/** Festival Grounds-style: Energy-attached Pokémon can't gain Special Conditions. */
export function isStadiumStatusImmunity(card) {
  const t = textOf(card);
  if (!t) return false;
  // Festival Grounds-style energy gate, blanket immunity (Steel Shelter), or a
  // named-condition immunity (Sidney's Stadium).
  if (/can'?t be affected by (?:any )?special condition/.test(t)) return true;
  return /can'?t be (?:asleep|confused|paralyzed|poisoned|burned)/.test(t);
}

/** Dizzying Valley: Confused Pokémon don't recover on evolve/devolve. */
export function isStadiumConfusedPersist(card) {
  const t = textOf(card);
  return (
    /confused pokémon/.test(t) &&
    /don'?t recover/.test(t) &&
    /evolve|devolve/.test(t)
  );
}

/** Area Zero Underdepths-style bench limit (null = default 5). */
export function parseStadiumBenchLimit(card) {
  const t = textOf(card);
  let m = t.match(/up to (\d+) pokémon on (?:their|your) bench/);
  if (m) return parseInt(m[1], 10);
  m = t.match(/can'?t have more than (\d+) benched pokémon/);
  if (m) return parseInt(m[1], 10);
  m = t.match(/more than (\d+) pokémon on (?:his or her|their|your) bench/);
  if (m) return parseInt(m[1], 10);
  m = t.match(/can have (\d+) pokémon on (?:his or her|their|your) bench/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Bench play damage applies to this Pokémon (Risky Ruins filters). */
export function stadiumBenchDamageApplies(pokemon, stadiumCard) {
  const amount = parseStadiumBenchDamageOnPlay(stadiumCard);
  if (!amount) return null;
  const t = textOf(stadiumCard);
  const stage = lower(pokemon?.stage || '').replace(/[^a-z0-9]/g, '');
  if (/basic/.test(t) && stage && stage !== 'basic') return null;
  if (/non-\{d\}/.test(t)) {
    const types = (pokemon?.types || []).map(lower);
    if (types.includes('darkness')) return null;
  }
  return amount;
}

/** Festival Grounds: block new Special Conditions on Energy-attached Pokémon. */
export function stadiumBlocksStatusApplication(pokemon, zoneCards = []) {
  if (!rulesState.enabled) return false;
  const stadium = getStadium()?.card;
  if (!stadium || !isStadiumStatusImmunity(stadium)) return false;
  const t = textOf(stadium);
  // Festival Grounds: only Energy-attached Pokémon are protected. Blanket
  // immunity cards are filtered by their printed type/name.
  if (/energy attached/.test(t)) {
    if (!pokemon?.image) return false;
    const attached = (zoneCards || []).filter(
      (c) => c.type === 'Energy' && c.image?.relative === pokemon.image
    );
    return attached.length > 0;
  }
  return stadiumFilterMatches(pokemon, stadium);
}

export function getStadiumDamageReduction(defender, targetPlayer) {
  if (!rulesState.enabled || !defender) return 0;
  const stadium = getStadium();
  if (!stadium?.card) return 0;
  const amount = parseStadiumDamageReduction(stadium.card);
  if (amount <= 0) return 0;
  if (!stadiumFilterMatches(defender, stadium.card)) return 0;
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent' && targetPlayer === stadium.user) return 0;
  if (scope === 'owner' && targetPlayer !== stadium.user) return 0;
  return amount;
}

export function stadiumBlocksToolEffects(stadiumOverride = null) {
  if (stadiumOverride) {
    const card = stadiumOverride.card || stadiumOverride;
    return card ? isStadiumToolNegation(card) : false;
  }
  if (!rulesState.enabled) return false;
  const stadium = getStadium()?.card;
  return stadium ? isStadiumToolNegation(stadium) : false;
}

/** Jamming Tower: Pokémon Tools have no effect. */
export function isStadiumToolNegation(card) {
  const t = textOf(card);
  return /pokémon tools?/.test(t) && /have no effect/.test(t);
}

/** Team Rocket's Watchtower: matching Pokémon have no Abilities. */
export function isStadiumAbilityNegation(card) {
  const t = textOf(card);
  // Modern "have no Abilities" plus the legacy Poké-Power/Poké-Body phrasing
  // (Space Center, Battle Frontier), which maps onto Abilities in this engine.
  return (
    /ha(?:ve|s) no abilities/.test(t) ||
    /can'?t use any pok(?:é|e)-powers|ignore pok(?:é|e)-bodies|ignore pok(?:é|e)-powers/.test(
      t
    )
  );
}

export function stadiumAbilityBlocked(pokemon) {
  if (!rulesState.enabled || !pokemon) return false;
  const stadium = getStadium()?.card;
  return stadiumAbilityBlockedFor(pokemon, stadium);
}

/**
 * Server-pure variant: the caller supplies the Stadium card instead of reading
 * the legacy `rulesState`/`getStadium()` singleton, so `reduce.mjs` can enforce
 * a "have no Abilities" Stadium (Team Rocket's Watchtower, Space Center).
 */
export function stadiumAbilityBlockedFor(pokemon, stadiumCard) {
  if (!pokemon || !stadiumCard) return false;
  if (!isStadiumAbilityNegation(stadiumCard)) return false;
  if (!stadiumFilterMatches(pokemon, stadiumCard)) return false;
  // App. 23: Ancient Traits are not Abilities — a "no Abilities" effect leaves
  // an α-Growth / Ω-Barrier trait alone.
  if (isAncientTraitAbility(pokemon)) return false;
  return true;
}

/** Perilous Jungle: extra poison damage during Pokémon Checkup. */
export function parseStadiumCheckupPoisonBonus(card) {
  const t = textOf(card);
  // Perilous Jungle ("During Pokémon Checkup …") and Virbank City Gym
  // ("… between turns") both add extra poison damage.
  if (!/pokémon checkup|between turns/.test(t) || !/poisoned/.test(t)) return 0;
  const m = t.match(/(\d+)\s+more damage counter/);
  return m ? parseInt(m[1], 10) : 0;
}

export function getStadiumCheckupPoisonBonus(pokemon, targetPlayer) {
  if (!rulesState.enabled || !pokemon) return 0;
  const stadium = getStadium();
  if (!stadium?.card) return 0;
  const bonus = parseStadiumCheckupPoisonBonus(stadium.card);
  if (bonus <= 0) return 0;
  const t = textOf(stadium.card);
  if (/non-\{d\}/.test(t)) {
    const types = (pokemon?.types || []).map(lower);
    if (types.includes('darkness')) return 0;
  }
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent' && targetPlayer === stadium.user) return 0;
  if (scope === 'owner' && targetPlayer !== stadium.user) return 0;
  return bonus;
}

// ── Between-turns damage counters (continuous) ─────────────────────────────

/** Legacy ability "Poké-Power" tag (Cursed Stone's filter). */
function pokemonHasPokePower(pokemon) {
  const abilities = Array.isArray(pokemon?.abilities) ? pokemon.abilities : [];
  return abilities.some(
    (a) =>
      /pok[eé]-power/.test(lower(a?.type || '')) ||
      /pok[eé]-power/.test(lower(a?.text || ''))
  );
}

/**
 * "Between turns, put 1 damage counter on each …" — Shrine of Punishment
 * (GX/EX), Cursed Stone (Pokémon with a Poké-Power), Desert Ruins (ex with
 * ≥100 max HP). Virbank/Perilous poison bonuses are handled separately.
 */
export function parseStadiumBetweenTurnsDamage(card) {
  const t = textOf(card);
  if (!t) return null;
  if (!/(?:between turns|at any time between turns|pokémon checkup)/.test(t))
    return null;
  if (!/puts? \d+ damage counter/.test(t)) return null;
  if (/poisoned/.test(t)) return null;
  const m = t.match(/puts?\s+(\d+)\s+damage counter/);
  const counters = m ? parseInt(m[1], 10) : 1;
  let filter = 'all';
  if (/pokémon-gx and pokémon-ex|pokémon-ex and pokémon-gx/.test(t))
    filter = 'gx-ex';
  else if (/pokémon-ex with maximum hp of at least \d+/.test(t))
    filter = 'ex-high-hp';
  else if (/pokémon that has a poké-power/.test(t)) filter = 'poke-power';
  return { amount: counters * 10, counters, filter };
}

export function isStadiumBetweenTurnsDamage(card) {
  return parseStadiumBetweenTurnsDamage(card) !== null;
}

/** Damage counters this Stadium's between-turns effect places on `pokemon`. */
export function stadiumBetweenTurnsDamageFor(pokemon, card) {
  const parsed = parseStadiumBetweenTurnsDamage(card);
  if (!parsed || !pokemon) return 0;
  switch (parsed.filter) {
    case 'gx-ex':
      return isGxCard(pokemon) || isExCard(pokemon) ? parsed.amount : 0;
    case 'ex-high-hp': {
      if (!isExCard(pokemon)) return 0;
      const hp = parseInt(pokemon.hp, 10) || 0;
      return hp >= 100 ? parsed.amount : 0;
    }
    case 'poke-power':
      return pokemonHasPokePower(pokemon) ? parsed.amount : 0;
    default:
      return parsed.amount;
  }
}

/** Nighttime Mine: attacks cost {C} more for filtered Pokémon. */
export function parseStadiumAttackCostIncrease(card) {
  const t = textOf(card);
  if (!/cost/.test(t) || !/more/.test(t)) return 0;
  const m = t.match(/\{c\}\s+more|cost\s+\{c\}\s+more|(\d+)\s+more/);
  return m ? parseInt(m[1], 10) || 1 : 1;
}

export function getStadiumAttackCostIncrease(attacker, targetPlayer) {
  if (!rulesState.enabled || !attacker) return 0;
  const stadium = getStadium();
  if (!stadium?.card) return 0;
  return getStadiumAttackCostIncreaseFor(
    attacker,
    targetPlayer,
    stadium.card,
    stadium.user
  );
}

/**
 * Server-pure variant of the cost increase: the caller supplies the stadium
 * card and its owner instead of the legacy `rulesState`/`getStadium()` singleton,
 * so `reduce.mjs` prices attacks with the same modifier the client shows.
 */
export function getStadiumAttackCostIncreaseFor(
  attacker,
  targetPlayer,
  stadiumCard,
  stadiumUser
) {
  if (!attacker || !stadiumCard) return 0;
  const increase = parseStadiumAttackCostIncrease(stadiumCard);
  if (increase <= 0) return 0;
  if (!stadiumFilterMatches(attacker, stadiumCard)) return 0;
  const scope = stadiumTargetScope(stadiumCard);
  if (scope === 'opponent' && targetPlayer === stadiumUser) return 0;
  if (scope === 'owner' && targetPlayer !== stadiumUser) return 0;
  return increase;
}

// ── Execution orchestrator ─────────────────────────────────────────────

function collectPassiveStadiumResults(card) {
  const results = [];
  const prevention = parseStadiumDamagePreventionDetail(card);
  if (prevention) results.push({ action: 'damage-prevention', ...prevention });
  const reduction = parseStadiumDamageReduction(card);
  if (reduction > 0)
    results.push({ action: 'damage-reduction', amount: reduction });
  if (isStadiumRetreatPrevention(card)) {
    results.push({ action: 'retreat-prevention', target: 'opponent' });
  }
  if (isStadiumHandProtect(card)) results.push({ action: 'hand-protect' });
  const hpMod = parseStadiumHpModifier(card);
  if (hpMod !== 0) results.push({ action: 'hp-modifier', amount: hpMod });
  const evo = parseStadiumEvolutionSpeed(card);
  if (evo.relaxTurnGate || evo.costReduce > 0)
    results.push({ action: 'evolution-speed', ...evo });
  const retreatMod = parseStadiumRetreatModifier(card);
  if (retreatMod !== 0)
    results.push({ action: 'retreat-modifier', delta: retreatMod });
  const benchDmg = parseStadiumBenchDamageOnPlay(card);
  if (benchDmg)
    results.push({ action: 'bench-damage-on-play', amount: benchDmg });
  const atkBonus = parseStadiumAttackDamageBonus(card);
  if (atkBonus > 0)
    results.push({ action: 'attack-damage-bonus', amount: atkBonus });
  if (isStadiumStatusImmunity(card))
    results.push({ action: 'status-immunity' });
  if (isStadiumConfusedPersist(card))
    results.push({ action: 'confused-persist' });
  const benchLimit = parseStadiumBenchLimit(card);
  if (benchLimit) results.push({ action: 'bench-limit', limit: benchLimit });
  const costMod = parseStadiumCostModifier(card);
  if (costMod > 0) results.push({ action: 'cost-modifier', amount: costMod });
  if (isStadiumToolNegation(card)) results.push({ action: 'tool-negation' });
  if (isStadiumAbilityNegation(card))
    results.push({ action: 'ability-negation' });
  const checkupPoison = parseStadiumCheckupPoisonBonus(card);
  if (checkupPoison > 0)
    results.push({ action: 'checkup-poison', amount: checkupPoison });
  const costInc = parseStadiumAttackCostIncrease(card);
  if (costInc > 0)
    results.push({ action: 'attack-cost-increase', amount: costInc });
  const attackLock = parseStadiumAttackLock(card);
  if (attackLock)
    results.push({ action: 'attack-lock', hpAtMost: attackLock.hpAtMost });
  if (isStadiumTriggered(card)) results.push({ action: 'triggered' });
  if (isStadiumEnergyAttachHeal(card))
    results.push({ action: 'energy-attach-heal', amount: 10 });
  if (isStadiumGlimwoodReFlip(card))
    results.push({ action: 'attack-coin-reflip' });
  if (isStadiumNoWeakness(card)) results.push({ action: 'no-weakness' });
  if (isStadiumWeaknessTimesTwo(card))
    results.push({ action: 'weakness-times-two' });
  if (isStadiumResistanceIgnore(card))
    results.push({ action: 'ignore-resistance' });
  const typeDamageReduction = parseStadiumTypeDamageReduction(card);
  if (typeDamageReduction > 0)
    results.push({ action: 'type-damage-reduction', amount: typeDamageReduction });
  const betweenTurns = parseStadiumBetweenTurnsDamage(card);
  if (betweenTurns)
    results.push({ action: 'between-turns-damage', ...betweenTurns });
  if (isStadiumLostCity(card)) results.push({ action: 'ko-to-lost-zone' });
  if (isStadiumBlocksHealing(card)) results.push({ action: 'block-healing' });
  if (isStadiumStatusPersistsOnEvolve(card))
    results.push({ action: 'status-persist-on-evolve' });
  if (isStadiumSpecialEnergyColorless(card))
    results.push({ action: 'special-energy-colorless' });
  if (isStadiumSpecialEnergyToOne(card))
    results.push({ action: 'special-energy-to-one' });
  if (isStadiumBasicEnergyMetal(card))
    results.push({ action: 'basic-energy-metal-extra' });
  const inheritance = parseStadiumAttackInheritance(card);
  if (inheritance) results.push({ action: 'attack-inheritance', ...inheritance });
  const grant = parseStadiumAttackGrant(card);
  if (grant) results.push({ action: 'attack-grant', ...grant });
  const movement = parseStadiumEnergyMovement(card);
  if (movement)
    results.push({ action: 'energy-movement', ...movement });
  return results;
}

export const STADIUM_ACTION_FAMILIES = ['setup-once', 'once-per-turn'];

/**
 * Whether the in-play Stadium's effect can be activated by `player` right now, plus the reason
 * it cannot. The inspector's Use panel is the only consumer; the click itself still routes
 * through chat-buttons' `stadiumEffect`, which repeats these gates against live zone state —
 * this decides the affordance, not the execution.
 *
 * @returns {{ actionable:boolean, usable:boolean, reason:string|null }} `actionable` is false
 *   when the card has no activatable family at all (continuous/passive/unknown), which is a
 *   permanent property of the card; `usable` folds in the per-turn gates.
 */
export function stadiumActivationStatus(
  card,
  { rulesEnabled = true, yourTurn = true, usedThisTurn = false, flags = {} } = {}
) {
  if (!isStadiumCard(card)) {
    return { actionable: false, usable: false, reason: 'Not a Stadium card.' };
  }
  const applied = applyStadiumEffect(card);
  if (!STADIUM_ACTION_FAMILIES.includes(applied.family)) {
    return {
      actionable: false,
      usable: false,
      reason:
        applied.family === 'continuous-both' ||
        applied.family === 'opponent-affected'
          ? 'Continuous effect — always active while in play.'
          : 'This Stadium has no activatable effect.',
    };
  }
  if (!rulesEnabled) {
    return { actionable: true, usable: false, reason: 'Rules mode is off.' };
  }
  if (!yourTurn) {
    return { actionable: true, usable: false, reason: "It's not your turn." };
  }
  if (
    applied.family === 'once-per-turn' &&
    usedThisTurn &&
    !applied.results[0]?.repeatable
  ) {
    return { actionable: true, usable: false, reason: 'Already used this turn.' };
  }
  const condition = applied.results[0]?.condition;
  if (condition && !stadiumOnceConditionMet(condition, flags)) {
    return {
      actionable: true,
      usable: false,
      reason:
        condition.type === 'named-supporter'
          ? `Play a Supporter with "${condition.contains}" in its name first this turn.`
          : condition.type === 'no-supporter-played'
            ? 'You already played a Supporter this turn.'
            : condition.type === 'has-evolution-in-hand'
              ? 'You need an Evolution card in your hand.'
              : 'Play a Supporter from your hand this turn first.',
    };
  }
  return { actionable: true, usable: true, reason: null };
}

/**
 * Apply (or describe) a stadium effect. Returns:
 *   { family, executed, message, results: [] }
 *
 * For `setup-once` and `once-per-turn` families, `results` contains parsed
 * action descriptors that the *execution layer* (chat-buttons.js) can act on.
 * For `continuous-*` families, `results` describes the ongoing modifier.
 * `executed` is true when the effect is actionable (once-per-turn, setup-once),
 * false for passive/continuous effects (they don't require a player action)
 * or when the card is unparseable.
 */
export function applyStadiumEffect(card) {
  const family = classifyStadiumEffect(card);
  const description = describeStadiumEffect(card);
  const results = [];

  switch (family) {
    case 'setup-once': {
      const drawN = parseStadiumSetupDraw(card);
      if (drawN) results.push({ action: 'draw', n: drawN });
      return {
        family,
        executed: true,
        message: `◈ ${description} → Draw ${drawN ?? 1} card(s).`,
        results,
      };
    }
    case 'once-per-turn': {
      const parsed = parseStadiumOncePerTurn(card);
      if (parsed) results.push({ action: parsed.kind, ...parsed });
      return {
        family,
        executed: true,
        message: `◈ ${description} → ${parsed ? `${parsed.kind} (${parsed.n ?? '—'})` : 'see card text'}.`,
        results,
      };
    }
    case 'continuous-both':
    case 'opponent-affected': {
      const passiveResults = collectPassiveStadiumResults(card);
      results.push(...passiveResults);
      return {
        family,
        executed: results.length > 0,
        message: `◈ ${description} (continuous — always active while in play).`,
        results,
      };
    }
    case 'none':
    case 'unknown':
    default: {
      const passiveResults = collectPassiveStadiumResults(card);
      if (passiveResults.length > 0) {
        return {
          family: 'continuous-both',
          executed: true,
          message: `◈ ${description} (continuous — always active while in play).`,
          results: passiveResults,
        };
      }
      return {
        family,
        executed: false,
        message: `◈ ${description} (no recognized effect to execute)`,
        results: [],
      };
    }
  }
}
