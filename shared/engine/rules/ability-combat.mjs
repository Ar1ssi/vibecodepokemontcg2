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
//   stadium            stadium card, when a condition names one
//   zone               where the target Pokémon sits: 'active' | 'bench'
//   isActive           target sits in the Active Spot
//   attackerIsActive   the attacker sits in the Active Spot (default true)
//   attackerIsEx       the attacker is a Pokémon ex (KO conditions)
//   turnNumber         current turn number
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
} from './ability-executors.mjs';
import {
  reductionForCard,
  preventionForCard,
  isEvolutionCard,
  TYPE_LETTER,
  attackerTypes,
} from './tool-combat.mjs';
import { isRuleBoxPokemon, isExCard, isMegaCard } from './card-classify.mjs';

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
  return rootsOf(ctx.sideCards || ctx.inPlayCards || []);
}

function opponentInPlay(ctx = {}) {
  return rootsOf(ctx.opponentSideCards || []);
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
  if (!pokemon) return 0;
  let total = 0;
  for (const holder of nonStackingOnce(dedupe([pokemon, ...sideInPlay(ctx)]))) {
    const t = cardAbilityText(holder);
    if (!t || !parseHpBonus(holder).bonus) continue;
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
    const less = t.match(/active pok[eé]mon's retreat cost is (\d+) less/);
    if (less && ctx.isActive !== false) delta -= Number(less[1] || 1);
  }
  for (const card of dedupe(opponentInPlay(ctx))) {
    const t = cardAbilityText(card);
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
  const t = cardAbilityText(card);
  if (!t) return [];
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
  for (const card of nonStackingOnce(dedupe(cards))) {
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
