// Pure ability-side combat readers (design 034). Each reader answers one
// passive family from the cards' printed text plus the board context the
// caller passes in; none of them mutate state or touch the RNG.
//
// `ctx` contract (all optional, absent fields behave as "no effect"):
//   sideCards          all cards on the target's side (active + bench + attached)
//   opponentSideCards  all cards on the other side
//   inPlayCards        alias of sideCards for callers that only have that
//   sideActive         the target side's Active Spot cards (holder position)
//   sideBench          the target side's Bench cards (holder position)
//   opponentActive     the other side's Active Spot cards (holder position)
//   opponentBench      the other side's Bench cards (holder position)
//   stadium            stadium card, when a condition names one
//   zone               where the target Pokémon sits: 'active' | 'bench'
//   isActive           target sits in the Active Spot
//   attackerIsActive   the attacker sits in the Active Spot (default true)
//   attackerIsEx       the attacker is a Pokémon ex (KO conditions)
//   opponentActiveIsEx the other side's Active is a Pokémon ex (evolve permission)
//   turnNumber         current turn number
//   abilityIndex       ability slot for `abilityActivationBlockReason`
//   used               ability already spent this turn (activation gate)
//   koedLastOppTurn    a Pokémon was KO'd during the opponent's last turn
//   enteredPlayTurn    turn the target was played/evolved (evolve-trigger window)
//   playedToBenchTurn  turn the target was played from hand to the Bench
//
// Returns are plain numbers/structs in HP units. Text is read through
// `cardAbilityText` so the plural `abilities[]` server shape and singular
// fixtures behave the same (I128).

import {
  cardAbilityText,
  parseDamageBonus,
  parseDamageReduction,
  parseDamagePrevention,
  parseHpBonus,
  parsePrizeModify,
  parseEnergyMultiplier,
  attachedTools,
  isActivatedAbility,
  requiresActiveSpot,
  requiresBenchSpot,
  requiresKoOnOpponentTurn,
  isEvolvePlayedTrigger,
  isBenchPlayedTrigger,
} from './ability-executors.mjs';
import {
  reductionForCard,
  preventionForCard,
  isEvolutionCard,
  TYPE_LETTER,
  attackerTypes,
} from './tool-combat.mjs';
import {
  isRuleBoxPokemon,
  isExCard,
  isGxCard,
  isMegaCard,
} from './card-classify.mjs';
import { isBasicPokemon, isPokemon } from '../cards.mjs';
import { parseAbility, isAncientTraitAbility } from './abilities.mjs';
import { isAbilityCard } from './ability-effects.mjs';

const lower = (v) => String(v ?? '').toLowerCase();

const rootsOf = (cards) =>
  (cards || []).filter((c) => c && !c.attachedTo && !c.attached);

/** Unique cards, deduped by instanceId when present, else by identity. */
function dedupe(cards) {
  const out = [];
  for (const card of cards || []) {
    if (!card) continue;
    const seen = out.some((c) =>
      card.instanceId != null && c.instanceId != null
        ? c.instanceId === card.instanceId
        : c === card
    );
    if (!seen) out.push(card);
  }
  return out;
}

/**
 * Cards whose text says "doesn't stack" contribute once per printed effect,
 * however many copies sit in play (keyed by normalised text).
 */
function nonStackingOnce(cards) {
  const seen = new Set();
  return cards.filter((card) => {
    const t = cardAbilityText(card);
    if (!/doesn't stack|does not stack/.test(t)) return true;
    const key = t.replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sideInPlay(ctx = {}) {
  return rootsOf(ctx.sideCards || ctx.inPlayCards || []).filter(isPokemon);
}

function opponentInPlay(ctx = {}) {
  return rootsOf(ctx.opponentSideCards || []).filter(isPokemon);
}

function holderZone(card, ctx = {}) {
  if ((ctx.sideActive || []).some((c) => c === card)) return 'active';
  if ((ctx.sideBench || []).some((c) => c === card)) return 'bench';
  return null;
}

/** Energy cards attached to `pokemon` in a zone list (instanceId or image link). */
function attachedEnergy(pokemon, cards = []) {
  if (!pokemon) return [];
  return (cards || []).filter((c) => {
    if (!c || c === pokemon) return false;
    const supertype = lower(c.supertype || c.type || '');
    if (!supertype.includes('energy') && !/\benergy\b/i.test(String(c.name || '')))
      return false;
    if (pokemon.instanceId != null && c.attachedTo === pokemon.instanceId)
      return true;
    return pokemon.image && c.image?.relative === pokemon.image;
  });
}

function energyTypeOf(card) {
  if (!card) return '';
  return lower(card.energyType || (Array.isArray(card.types) ? card.types[0] : ''));
}

function hasEnergyOfType(pokemon, cards, typeName) {
  const want = lower(typeName);
  return attachedEnergy(pokemon, cards).some((e) => {
    const type = energyTypeOf(e);
    if (type === want) return true;
    if (want === 'darkness' && type === 'dark') return true;
    return lower(e.name).includes(want);
  });
}

/** {X} symbols in a text mapped to type names, in order of appearance. */
function typeSymbols(text) {
  return [...String(text).matchAll(/\{([a-z])\}/g)]
    .map((m) => TYPE_LETTER[m[1]])
    .filter(Boolean);
}

/** Canonical (capitalised) type name for a symbol letter. */
function typeName(letter) {
  const lower = TYPE_LETTER[letter];
  return lower ? lower[0].toUpperCase() + lower.slice(1) : null;
}

/**
 * The printed "from your opponent's {R} and {W} Pokémon" requirement, checked
 * here so `reductionForCard`'s generic symbol scan can be skipped: that scan
 * also fires on defender conditions like "that have any {W} Energy attached".
 */
function attackerTypeRequirementMet(text, attacker) {
  const m = text.match(/opponent's ((?:\{[a-z]\}\s*(?:and|or)?\s*)+)pok[eé]mon/);
  if (!m) return true;
  const need = typeSymbols(m[1]);
  return need.some((ty) => attackerTypes(attacker).includes(lower(ty)));
}

/**
 * The type symbols that filter the attacker ("attacks used by your {F}
 * Pokémon do …"). Symbols elsewhere in the text (in-play conditions, costs)
 * must not be read as attacker requirements.
 */
function attackerFilterSymbols(text) {
  const m = text.match(
    /(?:attacks used by|attacks of|each of your)\s+([^,.]*?pok[eé]mon)(?:'s)?[^.]*?do(?:es)? \d+ more damage/
  );
  return m ? typeSymbols(m[1]) : [];
}

/**
 * The printed "If you have … in play" / "If this Pokémon has … attached"
 * conditions that gate a passive reader. Unverifiable conditions fail closed.
 */
function inPlayConditionMet(text, target, ctx) {
  const anyEnergy = text.match(
    /if (?:this pok[eé]mon|it) has any \{([a-z])\} energy attached/
  );
  if (anyEnergy) {
    const type = TYPE_LETTER[anyEnergy[1]];
    if (!hasEnergyOfType(target, ctx.sideCards || ctx.inPlayCards, type)) return false;
  }
  const teamEnergy = text.match(
    /that (?:has|have) any \{([a-z])\} energy attached/
  );
  if (teamEnergy) {
    const type = TYPE_LETTER[teamEnergy[1]];
    if (!hasEnergyOfType(target, ctx.sideCards || ctx.inPlayCards, type)) return false;
  }
  if (/if (?:this pok[eé]mon|it) has any (?:special )?energy attached/.test(text)) {
    if (attachedEnergy(target, ctx.sideCards || ctx.inPlayCards).length === 0)
      return false;
  }
  const energyCount = text.match(
    /if (?:this pok[eé]mon|it) has (\d+) or more \{([a-z])\} energy attached/
  );
  if (energyCount) {
    const type = lower(TYPE_LETTER[energyCount[2]]);
    const n = attachedEnergy(target, ctx.sideCards || ctx.inPlayCards).filter(
      (e) => energyTypeOf(e) === type
    ).length;
    if (n < Number(energyCount[1])) return false;
  }
  if (/if (?:this pok[eé]mon|it) has full hp/.test(text)) {
    if ((target?.damage || 0) > 0) return false;
  }
  const energyCondition =
    anyEnergy ||
    teamEnergy ||
    energyCount ||
    /if (?:this pok[eé]mon|it) has any (?:special )?energy attached/.test(text);
  const namedTool = energyCondition
    ? null
    : text.match(/has (?:a )?([a-z0-9 .'’-]+?) attached/);
  if (namedTool && !/pok[eé]mon tool/.test(namedTool[1])) {
    const tool = lower(namedTool[1]).trim();
    const attached = attachedTools(target, ctx.sideCards || ctx.inPlayCards);
    if (!attached.some((c) => lower(c.name).includes(tool))) return false;
  }
  const oppHand = text.match(
    /if your opponent has exactly (\d+) cards? in their hand/
  );
  if (oppHand && ctx.opponentHandCount != null) {
    if (Number(ctx.opponentHandCount) !== Number(oppHand[1])) return false;
  }
  const named = text.match(/if you have (.+?) in play/);
  if (named) {
    const family = named[1].trim();
    if (family.includes('{')) {
      const symbols = typeSymbols(family);
      const wantsMega = /mega evolution/.test(family);
      const wantsEx = /pok[eé]mon ex/.test(family);
      const has = sideInPlay(ctx).some((c) => {
        if (symbols.length && !symbols.some((ty) => attackerTypes(c).includes(lower(ty))))
          return false;
        if (wantsMega && !isMegaCard(c)) return false;
        if (wantsEx && !isExCard(c)) return false;
        return true;
      });
      if (!has) return false;
    } else {
      const has = sideInPlay(ctx).some((c) => lower(c.name).includes(family));
      if (!has) return false;
    }
  }
  return true;
}

/**
 * Attacker qualifiers for damage-bonus text: printed type filter, name
 * exclusions, "this Pokémon" scope, defender position and in-play conditions.
 */
function attackerQualifies(text, attacker, holder, ctx) {
  if (!attacker) return false;
  const types = attackerTypes(attacker);

  const excluding = text.match(/excluding ([^.,)]+)/);
  if (excluding) {
    const excluded = lower(excluding[1]).replace(/-ex\b/g, '').trim();
    if (excluded && lower(attacker.name).includes(excluded)) return false;
  }

  const symbols = attackerFilterSymbols(text);
  if (symbols.length && !symbols.some((ty) => types.includes(lower(ty)))) return false;

  if (/this pok[eé]mon/.test(text) && holder !== attacker) return false;

  const named = text.match(/attacks used by your ([a-z0-9 .'’-]+?) pok[eé]mon/);
  if (named && !lower(attacker.name).includes(named[1].trim())) return false;

  if (/to your opponent's active pok[eé]mon|to the active pok[eé]mon/.test(text)) {
    if (ctx.isActive === false) return false;
  }

  return inPlayConditionMet(text, attacker, ctx);
}

/**
 * Conditions on the holder/source side for reduction and prevention: target
 * zone, Rule Box filter, attacker energy/tool requirements, holder position
 * and in-play conditions. Unverifiable holder position fails closed.
 */
function sourceConditionMet(text, holder, target, attacker, ctx) {
  if (/to your benched pok[eé]mon|of your benched pok[eé]mon/.test(text)) {
    if (ctx.zone !== 'bench' && ctx.isActive !== false) return false;
  }
  if (/don't have a rule box/.test(text) && isRuleBoxPokemon(target)) return false;
  const attackerEnergy = text.match(
    /from your opponent's pok[eé]mon that have (\d+) or less energy attached/
  );
  if (attackerEnergy) {
    const count = attachedEnergy(attacker, ctx.opponentSideCards).length;
    if (count > Number(attackerEnergy[1])) return false;
  }
  if (/your opponent's active pok[eé]mon/.test(text) && ctx.attackerIsActive === false) {
    return false;
  }
  if (/that has a pok[eé]mon tool attached/.test(text)) {
    if (attachedTools(attacker, ctx.opponentSideCards).length === 0) return false;
  }
  if (/active evolution pok[eé]mon/.test(text) && !isEvolutionCard(target)) {
    return false;
  }
  if (/as long as this pok[eé]mon is on your bench/.test(text)) {
    if (holderZone(holder, ctx) !== 'bench') return false;
  }
  if (/as long as this pok[eé]mon is in the active spot/.test(text)) {
    if (holderZone(holder, ctx) !== 'active') return false;
  }
  return inPlayConditionMet(text, target, ctx);
}

/** True when the holder itself is the only legal target ("this Pokémon"). */
function isSelfScoped(text) {
  return /this pok[eé]mon takes|this pokemon takes|attacks used by your opponent's active pok[eé]mon do|this pok[eé]mon's attacks do|attacks used by this pok[eé]mon do/.test(
    text
  );
}

// --- damage bonus --------------------------------------------------------

/**
 * Flat damage the attacker's (and its team's) abilities add before Weakness
 * and Resistance. Scaling wordings ("for each …") are skipped: they need live
 * counts and would otherwise be added as a flat number.
 */
export function abilityDamageBonus(attacker, defender, ctx = {}) {
  if (!attacker) return 0;
  let total = 0;
  for (const holder of nonStackingOnce(dedupe([attacker, ...sideInPlay(ctx)]))) {
    const t = cardAbilityText(holder);
    if (!t || !parseDamageBonus(holder).bonus) continue;
    if (isAbilitySuppressed(holder, ctx)) continue;
    if (/for each/.test(t)) continue;
    if (!attackerQualifies(t, attacker, holder, ctx)) continue;
    total += parseDamageBonus(holder).bonus;
  }
  return total;
}

// --- damage reduction ----------------------------------------------------

/**
 * Ability damage reduction for the defender, split by the printed placement:
 * `{ beforeWR, afterWR }`. Reuses tool-combat's conditional filters for the
 * attacker/defender requirements.
 */
export function abilityDamageReduction(defender, attacker, ctx = {}) {
  const out = { beforeWR: 0, afterWR: 0 };
  if (!defender) return out;
  for (const holder of nonStackingOnce(dedupe([defender, ...sideInPlay(ctx)]))) {
    const t = cardAbilityText(holder);
    if (!t || !parseDamageReduction(holder).reduce) continue;
    if (isAbilitySuppressed(holder, ctx)) continue;
    if (isSelfScoped(t) && holder !== defender) continue;
    if (!sourceConditionMet(t, holder, defender, attacker, ctx)) continue;
    if (!attackerTypeRequirementMet(t, attacker)) continue;
    const red = reductionForCard(holder, defender, attacker, {
      skipSymbolFilter: true,
    });
    if (!red) continue;
    if (/before applying weakness and resistance/.test(t)) out.beforeWR += red;
    else out.afterWR += red;
  }
  return out;
}

// --- damage prevention ---------------------------------------------------

/**
 * Ability damage prevention for the defender as `{ preventAll, reduceHp }`,
 * covering the holder and its team (bench/team wordings).
 */
export function abilityDamagePrevention(defender, attacker, ctx = {}) {
  const out = { preventAll: false, reduceHp: 0 };
  if (!defender) return out;
  for (const holder of nonStackingOnce(dedupe([defender, ...sideInPlay(ctx)]))) {
    const t = cardAbilityText(holder);
    if (!t) continue;
    const parsed = parseDamagePrevention(holder);
    if (!parsed.preventAll && !parsed.reduceHp) continue;
    if (isAbilitySuppressed(holder, ctx)) continue;
    if (isSelfScoped(t) && holder !== defender) continue;
    if (/to this pok[eé]mon/.test(t) && holder !== defender) continue;
    if (!sourceConditionMet(t, holder, defender, attacker, ctx)) continue;
    const applied = preventionForCard(holder, attacker);
    if (applied.preventAll) out.preventAll = true;
    else out.reduceHp += applied.reduceHp;
  }
  return out;
}

// --- weakness override ---------------------------------------------------

/**
 * Weakness modification for the defender: `{ none: true }` (no Weakness),
 * `{ multiplier: n }` (Weakness value override), or `{ type }` (Weakness type
 * replacement). Reads both sides: the defender's side can remove its own
 * Weakness, while the attacker's side can rewrite the defender's Weakness.
 * Returns null when nothing modifies it.
 */
export function abilityWeaknessOverride(defender, ctx = {}) {
  if (!defender) return null;
  const groups = [
    {
      cards: dedupe([defender, ...sideInPlay(ctx)]),
      holderSide: 'defender',
      holderCtx: ctx,
    },
    {
      cards: opponentInPlay(ctx),
      holderSide: 'attacker',
      holderCtx: {
        ...ctx,
        sideCards: ctx.opponentSideCards,
        opponentSideCards: ctx.sideCards,
        sideActive: ctx.opponentActive,
        sideBench: ctx.opponentBench,
      },
    },
  ];
  for (const { cards, holderSide, holderCtx } of groups) {
    for (const holder of nonStackingOnce(cards)) {
      const t = cardAbilityText(holder);
      if (!t) continue;
      if (isAbilitySuppressed(holder, holderCtx)) continue;

      if (
        holderSide === 'defender' &&
        /your pok[eé]mon in play have no weakness/.test(t)
      ) {
        return { none: true };
      }

      const both = t.match(
        /apply weakness for both active pok[eé]mon as [x×](\d)/
      );
      if (both) {
        if (!inPlayConditionMet(t, holder, holderCtx)) continue;
        return { multiplier: Number(both[1]) };
      }

      if (holderSide !== 'attacker') continue;

      const opponentActive = t.match(
        /apply weakness for your opponent's active pok[eé]mon as [x×](\d)/
      );
      if (opponentActive) return { multiplier: Number(opponentActive[1]) };

      const replace = t.match(
        /weakness of each of your opponent's \{([a-z])\} pok[eé]mon in play is now \{([a-z])\}/
      );
      if (replace) {
        const from = lower(TYPE_LETTER[replace[1]]);
        if (attackerTypes(defender).includes(from)) {
          return { type: typeName(replace[2]) };
        }
      }
    }
  }
  return null;
}

// --- HP bonus ------------------------------------------------------------

/** Flat HP the card and its team grant it (scaling wordings are skipped). */
export function abilityHpBonus(pokemon, ctx = {}) {
  if (!isPokemon(pokemon)) return 0;
  let total = 0;
  for (const holder of nonStackingOnce(dedupe([pokemon, ...sideInPlay(ctx)]))) {
    const t = cardAbilityText(holder);
    if (!t || !parseHpBonus(holder).bonus) continue;
    if (isAbilitySuppressed(holder, ctx)) continue;
    if (/for each/.test(t)) continue;
    if (/this pok[eé]mon|this pokemon/.test(t) && holder !== pokemon) continue;
    if (!inPlayConditionMet(t, pokemon, ctx)) continue;
    total += parseHpBonus(holder).bonus;
  }
  return total;
}

// --- prize modify --------------------------------------------------------

/**
 * Prize delta the victim's side's abilities apply to this Knock Out
 * ("takes 1 fewer Prize card"). Non-stacking wording contributes once.
 */
export function abilityPrizeModify(victim, ctx = {}) {
  if (!victim) return 0;
  let total = 0;
  for (const holder of nonStackingOnce(dedupe([victim, ...sideInPlay(ctx)]))) {
    const t = cardAbilityText(holder);
    if (!t) continue;
    if (isAbilitySuppressed(holder, ctx)) continue;
    // Only the printed "takes N fewer/more Prize cards" for THIS Knock Out
    // counts; "when your opponent's Active Pokémon is Knocked Out, take 1 more
    // Prize card" is an attacker-side trigger (slice 4), and damage bonuses
    // that merely mention Prize cards (Kingambit) are not prize modifiers.
    const takeClause = t.match(
      /take[s]? (\d+) (fewer|more|less|extra) prize cards?/
    );
    if (!takeClause) continue;
    if (/when your opponent's active pok[eé]mon is knocked out/.test(t)) continue;
    const { delta } = parsePrizeModify(holder);
    if (!delta) continue;

    const typedKo = t.match(
      /if 1 of your \{([a-z])\} pok[eé]mon is knocked out by damage from an attack from your opponent's pok[eé]mon ex/
    );
    if (typedKo) {
      const type = lower(TYPE_LETTER[typedKo[1]]);
      if (!attackerTypes(victim).includes(type)) continue;
      if (!ctx.attackerIsEx) continue;
    }
    total += delta;
  }
  return total;
}

// --- retreat cost --------------------------------------------------------

/**
 * Retreat-cost delta from other in-play abilities. The holder's own printed
 * modifier stays with `combinedToolRetreatCost`; this reader covers the
 * opponent-target increases (A10: "Your opponent's Active Pokémon's Retreat
 * Cost is {C} more" on the opposing bench) and the own-bench "your Active's
 * Retreat Cost is N less" wording.
 */
export function abilityRetreatCost(target, ctx = {}) {
  if (!target) return 0;
  let delta = 0;
  for (const card of dedupe(sideInPlay(ctx))) {
    const t = cardAbilityText(card);
    if (isAbilitySuppressed(card, ctx)) continue;
    const less = t.match(/active pok[eé]mon's retreat cost is (\d+) less/);
    if (less && ctx.isActive !== false) delta -= Number(less[1] || 1);
  }
  for (const card of dedupe(opponentInPlay(ctx))) {
    const t = cardAbilityText(card);
    if (isAbilitySuppressed(card, ctx)) continue;
    const more = t.match(
      /your opponent's active (?:evolution )?pok[eé]mon's retreat cost is \{c\} more/
    );
    if (!more || ctx.zone === 'bench') continue;
    if (/active evolution pok[eé]mon/.test(t) && !isEvolutionCard(target)) continue;
    delta += 1;
  }
  return delta;
}

// --- attack cost ---------------------------------------------------------

/**
 * Attack-cost modification the attacker's abilities grant:
 * `{ ignoreAll, ignoreColorless }`. `ignoreAll` means every Energy symbol in
 * the cost is ignored; `ignoreColorless` means only Colorless symbols are.
 */
export function abilityAttackCostDiscount(attacker, ctx = {}) {
  const out = { ignoreAll: false, ignoreColorless: false };
  if (!attacker) return out;
  for (const holder of nonStackingOnce(dedupe([attacker, ...sideInPlay(ctx)]))) {
    const t = cardAbilityText(holder);
    if (!t) continue;
    if (isAbilitySuppressed(holder, ctx)) continue;
    const all = t.match(
      /ignore all energy in the costs? of attacks used by this pok[eé]mon/
    );
    const colorless = t.match(
      /ignore all \{c\} energy in the costs? of attacks used by this pok[eé]mon/
    );
    if (!all && !colorless) continue;
    if (/this pok[eé]mon/.test(t) && holder !== attacker) continue;
    if (!inPlayConditionMet(t, attacker, ctx)) continue;
    if (all) out.ignoreAll = true;
    else out.ignoreColorless = true;
  }
  return out;
}

// --- ignore defender effects --------------------------------------------

/** "Damage … isn't affected by any effects on your opponent's Active Pokémon." */
export function abilityIgnoresDefenderEffects(attacker) {
  if (!isPokemon(attacker)) return false;
  const t = cardAbilityText(attacker);
  if (!t) return false;
  return (
    /isn't affected by any effects on your opponent's active pok[eé]mon/.test(t) ||
    /ignore (?:any )?effects on the defending pok[eé]mon/.test(t) ||
    /ignore (?:any )?effects of (?:the )?defending pok[eé]mon/.test(t)
  );
}

// --- extra types ---------------------------------------------------------

/** Extra types the card counts as ("it is {F} and {P} type"). */
export function abilityExtraTypes(card, ctx = {}) {
  if (!isPokemon(card)) return [];
  const t = cardAbilityText(card);
  if (!t) return [];
  if (isAbilitySuppressed(card, ctx)) return [];
  if (!/it is .*type|is both .* type/.test(t)) return [];
  if (!inPlayConditionMet(t, card, ctx)) return [];
  const printed = attackerTypes(card);
  return typeSymbols(t)
    .filter((ty) => !printed.includes(lower(ty)))
    .map((ty) => ty[0].toUpperCase() + ty.slice(1));
}

// --- energy multiplier ---------------------------------------------------

/**
 * "Each Basic {X} Energy attached to all of your Pokémon provides {X}{X}."
 * Returns `{ multiplier, energyType }` or null. Non-stacking wording applies
 * once (the first holder wins).
 */
export function abilityEnergyMultiplier(cards = []) {
  for (const card of nonStackingOnce(dedupe(cards).filter(isPokemon))) {
    const parsed = parseEnergyMultiplier(card);
    if (parsed.multiplier > 0 && parsed.energyType) return parsed;
  }
  return null;
}

/**
 * Expand descriptor-like energy entries for the multiplier: a basic Energy of
 * the printed type provides one extra unit. Entries may be strings or
 * `{ type, family }` objects; unknown shapes pass through untouched.
 */
export function applyEnergyMultiplier(entries = [], holders = []) {
  const mult = abilityEnergyMultiplier(holders);
  if (!mult) return entries;
  const want = lower(mult.energyType);
  return entries.flatMap((entry) => {
    const type = typeof entry === 'string' ? entry : entry?.type;
    const family = typeof entry === 'string' ? 'basic' : entry?.family || 'basic';
    if (family === 'basic' && type && lower(type) === want) return [entry, entry];
    return [entry];
  });
}

// --- ability suppression -------------------------------------------------

const SUPPRESSION_CLAUSE = /has no abilities|have no abilities|lose any ability/;
const SELF_KO_ABILITY =
  /knock out (?:this pok[eé]mon|itself)|this pok[eé]mon is knocked out/;

/** Which side of the passed context a card belongs to: 'side', 'opponent', or null. */
function sideOf(card, ctx = {}) {
  if (!card) return null;
  const inSide =
    (ctx.sideCards || []).includes(card) ||
    (ctx.sideActive || []).includes(card) ||
    (ctx.sideBench || []).includes(card);
  if (inSide) return 'side';
  const inOpponent =
    (ctx.opponentSideCards || []).includes(card) ||
    (ctx.opponentActive || []).includes(card) ||
    (ctx.opponentBench || []).includes(card);
  if (inOpponent) return 'opponent';
  return null;
}

/**
 * The holder's own position requirement ("As long as this Pokémon is your
 * Active Pokémon" / "on your Bench"). Fails closed when the context cannot
 * say where the holder sits.
 */
function holderPositionMet(text, holder, ctx) {
  const activeClause =
    /as long as this pok[eé]mon is (?:your active pok[eé]mon|in the active spot)/.test(
      text
    );
  const benchClause = /as long as this pok[eé]mon is on your bench/.test(text);
  if (!activeClause && !benchClause) return true;
  const side = sideOf(holder, ctx);
  if (!side) return false;
  const active = side === 'side' ? ctx.sideActive : ctx.opponentActive;
  const bench = side === 'side' ? ctx.sideBench : ctx.opponentBench;
  if (activeClause) return (active || []).includes(holder);
  return (bench || []).includes(holder);
}

/** "except for <AbilityName>" exempts the holder itself; other exceptions filter targets. */
function selfExemptFromSuppression(text, holder, card) {
  const m = text.match(/except for ([^.]+)/);
  if (!m) return false;
  const clause = m[1].trim();
  if (/[{\u007b]/.test(clause) || /pok[eé]mon/.test(clause) || /rule box/.test(clause)) {
    return false;
  }
  return holder === card;
}

/** True when the suppression text's target filter matches `card`. */
function suppressionTargets(text, holder, card, ctx) {
  const holderSide = sideOf(holder, ctx);
  const targetSide = sideOf(card, ctx);
  const bothSides = /\(both yours and your opponent's\)/.test(text);
  if (!bothSides && /your opponent's/.test(text)) {
    if (!holderSide || !targetSide || targetSide === holderSide) return false;
  }
  if (/pok[eé]mon-gx and pok[eé]mon-ex/.test(text) && !isExCard(card) && !isGxCard(card)) {
    return false;
  }
  if (/\bbasic pok[eé]mon\b/.test(text) && !isBasicPokemon(card)) return false;
  if (/pok[eé]mon break/.test(text) && lower(card?.stage) !== 'break') return false;
  if (/rapid strike/.test(text) && !(card?.subtypes || []).includes('Rapid Strike')) {
    return false;
  }
  if (/benched stage 2 pok[eé]mon/.test(text)) {
    if (ctx.zone !== 'bench' && ctx.isActive !== false) return false;
    if (!/stage 2/i.test(String(card?.stage || ''))) return false;
  }
  if (/your opponent's active pok[eé]mon/.test(text)) {
    const targetActive = holderSide === 'side' ? ctx.opponentActive : ctx.sideActive;
    if (!(targetActive || []).includes(card)) return false;
  }
  const ruleBoxExcept = /except for pok[eé]mon with a rule box/.test(text);
  if (ruleBoxExcept) {
    if (isRuleBoxPokemon(card)) return false;
  } else if (/pok[eé]mon with a rule box/.test(text) && !isRuleBoxPokemon(card)) {
    return false;
  }
  const typeExcept = text.match(/except for \{([a-z])\} pok[eé]mon/);
  if (typeExcept) {
    const type = lower(TYPE_LETTER[typeExcept[1]]);
    if (attackerTypes(card).includes(type)) return false;
  }
  if (
    /except for future pok[eé]mon/.test(text) &&
    (card?.subtypes || []).includes('Future')
  ) {
    return false;
  }
  return true;
}

/**
 * "Each Pokémon … has no Abilities" (design 034 slice 3): true when an in-play
 * source suppresses `card`'s Abilities. Sources on either side are scanned;
 * holder-position conditions fail closed, Ancient Traits are exempt (D72), and
 * Psyduck MEP's narrow "requires the user to Knock Out itself" filter only
 * suppresses self-KO abilities.
 */
export function isAbilitySuppressed(card, ctx = {}) {
  if (!card || !isPokemon(card)) return false;
  if (isAncientTraitAbility(card)) return false;
  const sources = dedupe([
    ...rootsOf(ctx.sideCards || []),
    ...rootsOf(ctx.opponentSideCards || []),
    ...rootsOf(ctx.inPlayCards || []),
  ]).filter(isPokemon);
  for (const holder of sources) {
    const t = cardAbilityText(holder);
    if (!t || !SUPPRESSION_CLAUSE.test(t)) continue;
    if (isAncientTraitAbility(holder)) continue;
    if (!holderPositionMet(t, holder, ctx)) continue;
    if (!suppressionTargets(t, holder, card, ctx)) continue;
    if (selfExemptFromSuppression(t, holder, card)) continue;
    if (
      /requires the pok[eé]mon using it to knock out itself/.test(t) &&
      !SELF_KO_ABILITY.test(cardAbilityText(card))
    ) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Why a card's Ability cannot be activated right now, or null when it can.
 * The single gate shared by the server (`reduce.mjs` validateLegality) and the
 * picker (`collect-usable-abilities.mjs`) so a greyed button and a rejected
 * command carry the same reason. `rulesEnabled: false` skips the once-per-turn
 * and window gates (presence-only callers).
 */
export function abilityActivationBlockReason(card, ctx = {}) {
  if (!card) return 'Unknown card.';
  const {
    rulesEnabled = true,
    used = false,
    abilityIndex = 0,
    zone = 'active',
    turnNumber = 0,
    koedLastOppTurn = true,
    enteredPlayTurn,
    playedToBenchTurn,
    movedToActiveTurn = card.movedToActiveTurn,
  } = ctx;
  if (rulesEnabled && used) return 'Ability already used this turn.';
  if (!isActivatedAbility(card, abilityIndex)) {
    return "This Ability can't be activated; it works on its own.";
  }
  if (isAbilitySuppressed(card, ctx)) {
    return "This Pokémon's Ability is suppressed.";
  }
  if (requiresKoOnOpponentTurn(card) && !koedLastOppTurn) {
    return "None of your Pokémon were Knocked Out during your opponent's last turn.";
  }
  if (rulesEnabled && zone !== 'active' && requiresActiveSpot(card)) {
    return 'This ability can only be used from the Active Spot.';
  }
  if (rulesEnabled && zone !== 'bench' && requiresBenchSpot(card)) {
    return 'This ability can only be used from the Bench.';
  }
  // The window checks only fire when the caller supplies the stamps: a caller
  // without the board history (presence-only pickers) must not turn "unknown"
  // into "blocked".
  if (
    rulesEnabled &&
    isEvolvePlayedTrigger(card) &&
    enteredPlayTurn !== undefined &&
    enteredPlayTurn !== turnNumber
  ) {
    return 'This ability can only be used the turn it evolved.';
  }
  if (rulesEnabled && isBenchPlayedTrigger(card)) {
    if (zone !== 'bench') {
      return "This ability only works the turn it's played from hand to the Bench.";
    }
    if (
      playedToBenchTurn !== undefined &&
      playedToBenchTurn !== turnNumber
    ) {
      return "This ability only works the turn it's played from hand to the Bench.";
    }
  }
  // Bench→Active promotion trigger: legal only on the turn the stamp records
  // (design 034 slice 4b). A caller without the stamp (presence-only pickers,
  // oracle rows that place cards directly in the Active) fails OPEN — only a
  // *stale* stamp is rejected.
  if (rulesEnabled && isOnPromotionTrigger(card)) {
    if (
      movedToActiveTurn !== undefined &&
      movedToActiveTurn !== null &&
      movedToActiveTurn !== turnNumber
    ) {
      return 'This ability can only be used the turn this Pokémon moved to the Active Spot.';
    }
  }
  return null;
}

// "Once during your turn, when this Pokémon moves from your Bench to the Active
// Spot, …" — the parse step that marks a Bench→Active trigger.
function isOnPromotionTrigger(card) {
  const text = cardAbilityText(card);
  if (!text) return false;
  return parseAbility(text).some((s) => s.type === 'onPromotionAbility');
}

// --- play / evolve / retreat / counter locks -----------------------------

/** Trainer/Pokémon categories a play lock can name, read off the played card. */
function playableCategories(card) {
  if (!card) return [];
  const kind = lower(
    `${card.type || ''} ${card.supertype || ''} ${card.trainerType || ''} ` +
      `${Array.isArray(card.subtypes) ? card.subtypes.join(' ') : card.subtypes || ''}`
  );
  const out = [];
  if (isPokemon(card)) out.push('Pokémon');
  if (/stadium/.test(kind)) out.push('Stadium');
  else if (/supporter/.test(kind)) out.push('Supporter');
  else if (/tool/.test(kind)) out.push('Pokémon Tool');
  else if (/item/.test(kind) || /trainer/.test(kind)) out.push('Item');
  if (/ace spec/.test(kind)) out.push('ACE SPEC');
  return out;
}

const PLAY_LOCK_CLAUSE = /can'?t play [^.]*from (?:his or her|their) hand/;
const EACH_PLAYER_LOCK =
  /(?:each player|neither player|each play) can'?t play any/;

/**
 * Ability play locks ("your opponent can't play any Item cards from their
 * hand"): null, or `{ cards, source, reason }` when an in-play Ability stops
 * `card` from being played by the player whose side is `ctx.sideCards`.
 * Supports the Active-Spot, fewer-Pokémon-than-opponent, holder-has-a-Tool and
 * "except for Team Rocket's Pokémon" clauses.
 */
export function abilityPlayLocks(card, ctx = {}) {
  const categories = playableCategories(card);
  if (categories.length === 0) return null;
  const groups = [
    { cards: opponentInPlay(ctx), own: false },
    { cards: sideInPlay(ctx), own: true },
  ];
  for (const { cards, own } of groups) {
    for (const holder of dedupe(cards)) {
      const t = cardAbilityText(holder);
      if (!t || !PLAY_LOCK_CLAUSE.test(t)) continue;
      if (isAbilitySuppressed(holder, ctx)) continue;
      const eachPlayer = EACH_PLAYER_LOCK.test(t);
      if (own && !eachPlayer) continue;
      if (!holderPositionMet(t, holder, ctx)) continue;
      if (/as long as you have fewer pok[eé]mon in play than your opponent/.test(t)) {
        // "you" is the lock holder's controller; the acting player is their opponent.
        if (opponentInPlay(ctx).length >= sideInPlay(ctx).length) continue;
      }
      if (/if this pok[eé]mon has a pok[eé]mon tool attached/.test(t)) {
        const holderCards = own ? ctx.sideCards : ctx.opponentSideCards;
        if (attachedTools(holder, holderCards).length === 0) continue;
      }
      if (
        /except for team rocket's pok[eé]mon/.test(t) &&
        /team rocket's/.test(lower(card.name))
      ) {
        continue;
      }
      const locked = parseAbility(t)
        .filter((s) => s.type === 'playLockAbility')
        .flatMap((s) => s.cards || []);
      const matched = categories.filter((cat) => locked.includes(cat));
      if (matched.length === 0) continue;
      if (
        locked.includes('Pokémon') &&
        /pok[eé]mon that has an ability/.test(t) &&
        (!isAbilityCard(card) || isAncientTraitAbility(card))
      ) {
        continue;
      }
      return {
        cards: matched,
        source: holder.name || 'An Ability',
        reason: `${holder.name || 'An in-play Ability'} prevents playing ${matched.join('/')} cards from hand.`,
      };
    }
  }
  return null;
}

const EVOLVE_LOCK_CLAUSE =
  /can'?t play [^.]*from (?:his or her|their) hand to evolve|neither player can play/;

/**
 * Evolve locks ("your opponent can't play any Pokémon from their hand to
 * evolve their Pokémon", Primal Law): true when the acting player's evolution
 * play is blocked. `card` is the evolution card being played.
 */
export function abilityEvolveLock(card, ctx = {}) {
  const groups = [
    { cards: opponentInPlay(ctx), own: false },
    { cards: sideInPlay(ctx), own: true },
  ];
  for (const { cards, own } of groups) {
    for (const holder of dedupe(cards)) {
      const t = cardAbilityText(holder);
      if (!t || !EVOLVE_LOCK_CLAUSE.test(t)) continue;
      if (!/to evolve/.test(t)) continue;
      if (isAbilitySuppressed(holder, ctx)) continue;
      const eachPlayer = EACH_PLAYER_LOCK.test(t) || /neither player can play/.test(t);
      if (own && !eachPlayer) continue;
      if (!holderPositionMet(t, holder, ctx)) continue;
      if (/to evolve benched|evolve benched pok[eé]mon/.test(t) && ctx.zone !== 'bench') {
        continue;
      }
      return true;
    }
  }
  return false;
}

/**
 * Retreat lock ("your opponent's Active Pokémon can't retreat", Omastar 151):
 * true when `active` cannot retreat. The Snorlax wording stops working while
 * its holder is affected by a Special Condition.
 */
export function abilityRetreatLock(active, ctx = {}) {
  if (!active) return false;
  for (const holder of dedupe(opponentInPlay(ctx))) {
    const t = cardAbilityText(holder);
    if (!t || !/(?:opponent's|defending)[^.]*can'?t retreat/.test(t)) continue;
    if (isAbilitySuppressed(holder, ctx)) continue;
    if (
      /as long as this pok[eé]mon is (?:your active pok[eé]mon|in the active spot)/.test(
        t
      ) &&
      !(ctx.opponentActive || []).includes(holder)
    ) {
      continue;
    }
    if (/special condition/.test(t)) {
      const conditioned =
        Boolean(holder.specialCondition) ||
        holder.poisoned === true ||
        holder.burned === true;
      if (conditioned) continue;
    }
    return true;
  }
  return false;
}

/** Patrat CR: damage counters on any in-play Pokémon can't be moved. */
export function abilityCounterMoveLock(ctx = {}) {
  const cards = dedupe([
    ...rootsOf(ctx.sideCards || []),
    ...rootsOf(ctx.opponentSideCards || []),
    ...rootsOf(ctx.inPlayCards || []),
  ]).filter(isPokemon);
  return cards.some(
    (c) =>
      !isAbilitySuppressed(c, ctx) &&
      /damage counters?[^.]*can'?t be moved/.test(cardAbilityText(c))
  );
}

// --- status / evolve / summon / attack permissions -----------------------

const CONDITION_WORD = {
  Asleep: 'asleep',
  Burned: 'burned',
  Confused: 'confused',
  Paralyzed: 'paralyzed',
  Poisoned: 'poisoned',
};

/** True when the card's own Ability refuses `condition` (Garganacl/Hoothoot). */
export function abilityStatusImmune(card, condition) {
  if (!card) return false;
  const t = cardAbilityText(card);
  if (!t) return false;
  if (/(?:can't|cannot|can not) be affected by (?:any )?special conditions?/.test(t)) {
    return true;
  }
  const word = CONDITION_WORD[condition] || lower(condition);
  if (!word) return false;
  return new RegExp(
    `(?:can't|cannot|can not) be (?:affected by (?:any )?)?${word}\\b`
  ).test(t);
}

/**
 * "This Pokémon can evolve during your first turn or the turn you play it"
 * (Scatterbug/Eevee/Luxio/Shelmet/Karrablast) and Spearow 151's "If you go
 * second … during your first turn". True when the turn-1 / just-played gates
 * must be relaxed for this card.
 */
export function abilityEvolvePermission(card, ctx = {}) {
  if (!card) return false;
  const t = cardAbilityText(card);
  if (!t) return false;
  if (isAbilitySuppressed(card, ctx)) return false;
  const firstTurnOrPlayed = /evolve during your first turn or the turn you play/.test(t);
  const firstTurnOnly =
    /evolve during your first turn\b/.test(t) && /if you go second/.test(t);
  if (!firstTurnOrPlayed && !firstTurnOnly) return false;
  if (
    /as long as this pok[eé]mon is in the active spot/.test(t) &&
    ctx.isActive === false
  ) {
    return false;
  }
  if (/if you go second/.test(t) && ctx.turnNumber != null && Number(ctx.turnNumber) !== 2) {
    return false;
  }
  if (
    /if your opponent's active pok[eé]mon is a pok[eé]mon ex/.test(t) &&
    !ctx.opponentActiveIsEx
  ) {
    return false;
  }
  const named = t.match(/if you have ([a-z0-9 .'’-]+?) in play/);
  if (named) {
    const family = named[1].trim();
    if (!sideInPlay(ctx).some((c) => lower(c.name).includes(family))) return false;
  }
  return true;
}

/** Palafin ex: "Put this Pokémon into play only with the effect of …". */
export function abilitySummonRestricted(card) {
  const t = cardAbilityText(card);
  return /put this pok[eé]mon into play only with the effect/.test(t);
}

/** Meloetta ex: "If you go first, this Pokémon can use attacks during your first turn." */
export function abilityFirstTurnAttack(card, ctx = {}) {
  const t = cardAbilityText(card);
  if (!t) return false;
  if (isAbilitySuppressed(card, ctx)) return false;
  if (!/if you go first/.test(t)) return false;
  if (!/use attacks? during your first turn/.test(t)) return false;
  if (ctx.turnNumber != null && Number(ctx.turnNumber) !== 1) return false;
  return true;
}

/**
 * Extra-attack reader (Dipplin TWM Festival Lead / Ω Barrage). Slice 3 ships
 * the read only: the second attack needs the KO → promotion → attack-again
 * turn flow from slice 4's on-KO hooks, so the attack gate is not relaxed.
 */
export function abilityExtraAttack(card) {
  const t = cardAbilityText(card);
  if (!t) return null;
  if (/may attack twice/.test(t)) return { twice: true, stadium: null, onKo: false };
  if (/may use an attack it has twice/.test(t)) {
    const named = t.match(/if ([a-z0-9 .'’-]+) is in play/);
    return {
      twice: true,
      stadium: named ? named[1].trim() : null,
      onKo: /knocks out your opponent's active/.test(t),
    };
  }
  return null;
}

/**
 * Whether the Active may make an additional attack this turn (Dipplin Festival
 * Lead / Ω Barrage). `ctx`: `{ stadium, attacksThisTurn }`. The second attack is
 * free while the printed Stadium condition holds; the reader caps at two attacks
 * per turn. Returns `{ allowed, reason }`.
 */
export function extraAttackAvailable(card, ctx = {}) {
  const read = abilityExtraAttack(card);
  if (!read) return { allowed: false, reason: null };
  const { stadium = null, attacksThisTurn = 0 } = ctx;
  if (attacksThisTurn >= 2) {
    return { allowed: false, reason: 'Already attacked twice this turn.' };
  }
  if (read.stadium) {
    const stadiumName = lower(stadium?.name || stadium?.card?.name || '');
    if (!stadiumName.includes(read.stadium)) {
      return {
        allowed: false,
        reason: `${read.stadium.replace(/\b\w/g, (c) => c.toUpperCase())} is not in play.`,
      };
    }
  }
  return { allowed: true, reason: null };
}
