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
//   ownPrizesLeft / opponentPrizesLeft / ownHandCount / opponentHandCount
//                      counts a damage-bonus condition reads (absent = condition unmet)
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
  powerConditionRestriction,
  isHandActivatedAbility,
  requiresFirstTurn,
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
  isVCard,
  isVmaxCard,
} from './card-classify.mjs';
import { isBasicPokemon, isPokemon } from '../cards.mjs';
import { parseAbility, isAncientTraitAbility } from './abilities.mjs';
import { isAbilityCard } from './ability-effects.mjs';
import { topPokemonCard } from './evolved-pokemon.mjs';
import { normalizeStage } from './evolution.mjs';

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
  const scope = bonusScope(text);
  if (!scope) return false;
  if (scope.kind === 'self' && !sameCard(holder, attacker)) return false;
  if (scope.kind === 'team') {
    const except = text.match(/\((?:excluding|except) [^)]*\)|, except any [^,]+,/)?.[0] || '';
    if (!attackerInCategory(`${scope.category} ${except}`, attacker, holder)) return false;
  }
  if (/to your opponent's active pok[eé]mon|to the active pok[eé]mon/.test(text)) {
    if (ctx.isActive === false) return false;
  }
  return true;
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

// A holder's text with its own printed name read as "this pokémon": older cards say "Scizor ex
// does 40 more damage" / "each of Ursaring's attacks" where newer ones say "this Pokémon" (I137).
export function selfNamedText(holder) {
  const t = cardAbilityText(holder);
  const name = lower(holder?.name).trim();
  if (!name) return t;
  const short = name.replace(/ (?:lv\.x|gl|fb|g|c|gx|ex)$/, '').trim();
  let out = t;
  for (const printed of new Set([name, short])) {
    if (printed.length < 3) continue;
    const escaped = printed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\w'])${escaped}(?![\\w-])`, 'g'), 'this pokémon');
  }
  return out;
}

const sameCard = (a, b) =>
  a === b || (a?.instanceId != null && a.instanceId === b?.instanceId);

// Who a damage-bonus Ability boosts: `self` (the holder's own attacks) or `team` with the printed
// attacker category ("your Basic {L} Pokémon's attacks", "attacks used by your Cynthia's
// Pokémon", "your Nidoqueen's attacks"). Null when the wording names no attacker.
function bonusScope(text) {
  if (
    /(?:attacks used by|attacks of|each of) this pok[eé]mon|this pok[eé]mon(?:'s)? attacks?|this pok[eé]mon does|its attacks|the attacks it uses/.test(
      text
    )
  ) {
    return { kind: 'self' };
  }
  const team =
    text.match(/(?:attacks used by|the attacks of|attacks by) (?:each of )?your ([^.]*?pok[eé]mon(?:-gx|-ex| ex| v| vmax)?)/) ||
    text.match(/(?:each of )?your ([^.]*?pok[eé]mon(?:-gx|-ex| ex| v| vmax)?)(?:'s| that)[^.]*? do(?:es)? \d+ more damage/) ||
    text.match(/your ([a-z0-9 .’'-]+?)'s (?:and [a-z0-9 .’'-]+?'s )?attacks/);
  if (team) return { kind: 'team', category: team[0] };
  return null;
}

// The printed attacker category a team bonus is limited to.
function attackerInCategory(category, attacker, holder) {
  const c = lower(category);
  const types = attackerTypes(attacker);
  const symbols = typeSymbols(c);
  if (symbols.length && !symbols.some((ty) => types.includes(lower(ty)))) return false;
  if (/\bbasic\b/.test(c) && !isBasicPokemon(attacker)) return false;
  if (/evolution|evolved/.test(c) && !isEvolutionCard(attacker)) return false;
  if (/stage 2/.test(c) && lower(attacker?.stage) !== 'stage 2') return false;
  if (/pok[eé]mon-gx|pok[eé]mon gx/.test(c) && !isGxCard(attacker)) return false;
  if (/pok[eé]mon-ex|pok[eé]mon ex/.test(c) && !isExCard(attacker)) return false;
  const subtypes = (attacker?.subtypes || []).map(lower);
  for (const style of ['rapid strike', 'single strike', 'fusion strike', 'ancient', 'future']) {
    if (c.includes(style) && !subtypes.includes(style)) return false;
  }
  if (/team plasma/.test(c) && !/plasma/.test(`${lower(attacker?.name)} ${subtypes.join(' ')}`)) {
    return false;
  }
  if (/that evolve from ([a-z]+)/.test(c) && lower(attacker?.evolvesFrom) !== c.match(/that evolve from ([a-z]+)/)[1]) {
    return false;
  }
  if (/δ|delta/.test(c)) return false;
  // A trainer's or a named Pokémon's possessive: "your Hop's Pokémon", "your Registeel's attacks".
  const owners = [...c.matchAll(/(?:your |and )([a-z0-9 .’'-]+?)'s\b/g)]
    .map((m) => m[1].trim())
    .filter((n) => !/pok[eé]mon/.test(n));
  if (owners.length && !owners.some((n) => lower(attacker?.name).includes(n))) return false;
  const except = c.match(/(?:excluding|except any) ([a-z0-9 .’'é-]+?)(?:\)|,|$)/)?.[1].trim();
  // "except any Iron Crown ex" reads "except any this pokémon" once the holder's name is folded.
  if (except === 'this pokémon' && lower(attacker?.name) === lower(holder?.name)) return false;
  if (except && except !== 'this pokémon' && lower(attacker?.name).includes(except.replace(/-ex\b/, '').trim())) {
    return false;
  }
  return true;
}

// Leading conditions a damage bonus is printed behind. Each returns true/false when it can be
// checked from the holder and ctx, or undefined when the wording is not this condition. An
// unrecognised condition fails closed: a bonus that should not apply is worse than a missed one.
const BONUS_CONDITIONS = [
  (c, holder) => {
    const m = c.match(/this pok[eé]mon's remaining hp is (\d+) or less/);
    if (!m) return undefined;
    return (holder?.hp || 0) - (holder?.damage || 0) <= Number(m[1]);
  },
  (c, holder) => {
    const m = c.match(/this pok[eé]mon has (?:any|(\d+) or more) damage counters? on it/);
    if (!m) return undefined;
    return (holder?.damage || 0) >= (m[1] ? Number(m[1]) * 10 : 10);
  },
  (c, holder) => {
    if (!/this pok[eé]mon is affected by a special condition/.test(c)) return undefined;
    return Boolean(holder?.specialCondition) || holder?.poisoned === true || holder?.burned === true;
  },
  (c, holder, ctx) => {
    const m = c.match(/this pok[eé]mon is (on your bench|your active pok[eé]mon|in the active spot)/);
    if (!m) return undefined;
    const zone = holderZone(holder, ctx);
    return /bench/.test(m[1]) ? zone === 'bench' : zone === 'active';
  },
  (c, holder) => {
    if (!/this pok[eé]mon is an evolved pok[eé]mon/.test(c)) return undefined;
    return isEvolutionCard(holder);
  },
  (c, _holder, ctx) => {
    const m = c.match(/your opponent has (\d+) or (?:less|fewer) prize cards? (?:left|remaining)/);
    if (!m) return undefined;
    if (ctx.opponentPrizesLeft == null) return false;
    return ctx.opponentPrizesLeft <= Number(m[1]);
  },
  (c, _holder, ctx) => {
    if (!/you have more prize cards (?:left|remaining) than your opponent/.test(c)) return undefined;
    if (ctx.ownPrizesLeft == null || ctx.opponentPrizesLeft == null) return false;
    return ctx.ownPrizesLeft > ctx.opponentPrizesLeft;
  },
  (c, _holder, ctx) => {
    if (!/you have the same number of cards in your hand as your opponent/.test(c)) return undefined;
    if (ctx.ownHandCount == null || ctx.opponentHandCount == null) return false;
    return ctx.ownHandCount === ctx.opponentHandCount;
  },
  // Energy / Tool / full-HP / "if you have X in play" clauses: inPlayConditionMet reads them.
  (c) =>
    /this pok[eé]mon has (?:any|full|\d+ or more)|(?:has|have) any \{[a-z]\} energy|you have [^,]+ in play|has (?:a )?[a-z0-9 .'’-]+ attached/.test(
      c
    )
      ? true
      : undefined,
];

function bonusConditionMet(text, holder, attacker, ctx) {
  const clause = text.match(/^(?:if|as long as) ([^,]+),/)?.[1];
  if (clause) {
    const verdicts = BONUS_CONDITIONS.map((check) => check(clause, holder, ctx));
    if (verdicts.every((v) => v === undefined)) return false;
    if (verdicts.some((v) => v === false)) return false;
  }
  return inPlayConditionMet(text, attacker, ctx);
}

// The defender a bonus names ("to your opponent's Active Evolution Pokémon", "to {D} Pokémon",
// "… Pokémon VMAX", "… that has an Ability"). Bench-only targets never apply to Active damage.
function defenderQualifies(text, defender) {
  const target = text.match(/more damage to ([^(.]+?)(?:\s*\(|\.|,|$)/)?.[1];
  if (!target) return true;
  const t = lower(target);
  if (/benched/.test(t)) return false;
  if (/that pok[eé]mon/.test(t)) return false;
  if (!defender) return true;
  const symbols = typeSymbols(t);
  if (symbols.length && !symbols.some((ty) => attackerTypes(defender).includes(lower(ty)))) {
    return false;
  }
  if (/evolution pok[eé]mon/.test(t) && !isEvolutionCard(defender)) return false;
  if (/vmax/.test(t) && !isVmaxCard(defender)) return false;
  if (/pok[eé]mon v\b/.test(t) && !isVCard(defender)) return false;
  if (/that has an ability/.test(t) && !cardAbilityText(defender)) return false;
  return true;
}

/**
 * Flat damage the attacker's (and its team's) abilities add before Weakness
 * and Resistance. Scaling wordings ("for each …") are skipped: they need live
 * counts and would otherwise be added as a flat number. The holder's printed
 * attacker scope, leading condition and defender filter must all hold (I137).
 */
export function abilityDamageBonus(attacker, defender, ctx = {}) {
  if (!attacker) return 0;
  let total = 0;
  for (const holder of nonStackingOnce(dedupe([attacker, ...sideInPlay(ctx)]))) {
    const t = selfNamedText(holder);
    if (!t || !parseDamageBonus(holder).bonus) continue;
    if (isAbilitySuppressed(holder, ctx)) continue;
    if (/for each/.test(t)) continue;
    // An activated power's "during your next turn … more damage" is its effect, not a passive.
    if (/^(?:once during your turn|as often as you like)/.test(t)) continue;
    if (!attackerQualifies(t, attacker, holder, ctx)) continue;
    if (!bonusConditionMet(t, holder, attacker, ctx)) continue;
    if (!defenderQualifies(t, defender)) continue;
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
  // "{C}{C} less" / "2 less": the number, or how many Energy symbols are printed.
  const amount = (m) => (m[1] ? Number(m[1]) : (m[2].match(/\{c\}/g) || []).length);
  let delta = 0;
  for (const card of dedupe(sideInPlay(ctx))) {
    const t = selfNamedText(card);
    if (isAbilitySuppressed(card, ctx)) continue;
    if (!holderPositionMet(t, card, ctx)) continue;
    const less =
      t.match(/your active pok[eé]mon's retreat cost is (?:(\d+)|((?:\{c\})+)) less/) ||
      t.match(/you pay (?:(\d+)|((?:\{c\})+)) less to retreat your active pok[eé]mon/);
    if (!less || ctx.isActive === false) continue;
    if (/excluding pok[eé]mon-ex/.test(t) && isExCard(target)) continue;
    delta -= amount(less) || 1;
  }
  for (const card of dedupe(opponentInPlay(ctx))) {
    const t = selfNamedText(card);
    if (isAbilitySuppressed(card, ctx)) continue;
    if (!holderPositionMet(t, card, ctx)) continue;
    const more =
      t.match(/your opponent's active (?:evolution )?pok[eé]mon's retreat cost is (?:(\d+)|((?:\{c\})+)) more/) ||
      t.match(/your opponent pays (?:(\d+)|((?:\{c\})+)) more to retreat (?:his or her|their) active pok[eé]mon/);
    if (!more || ctx.zone === 'bench') continue;
    if (/active evolution pok[eé]mon/.test(t) && !isEvolutionCard(target)) continue;
    // A condition other than the holder's own position is not read here.
    if (/^(?:if|as long as) /.test(t) && !/^as long as this pok[eé]mon is (?:in the active spot|your active pok[eé]mon|on your bench)/.test(t)) continue;
    delta += amount(more) || 1;
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
  if (rulesEnabled && isHandActivatedAbility(card) !== (zone === 'hand')) {
    return zone === 'hand'
      ? 'This ability can only be used while the Pokémon is in play.'
      : 'This ability can only be used from your hand.';
  }
  if (rulesEnabled && zone !== 'bench' && requiresBenchSpot(card)) {
    return 'This ability can only be used from the Bench.';
  }
  // Turn 1 is the first player's first turn and turn 2 the second player's (reduce.mjs).
  if (rulesEnabled && requiresFirstTurn(card) && turnNumber > 2) {
    return 'This ability can only be used during your first turn.';
  }
  // Legacy powers are off while the holder has the printed Special Conditions. Callers
  // without `holderConditions` (presence-only pickers) fail open.
  const restriction = powerConditionRestriction(card);
  const conditions = ctx.holderConditions || [];
  if (
    rulesEnabled &&
    restriction &&
    conditions.some((c) => restriction === 'any' || ['Asleep', 'Confused', 'Paralyzed'].includes(c))
  ) {
    return "This power can't be used while this Pokémon is affected by that Special Condition.";
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

// --- turn-structure permissions (design 034 slice 6) ---------------------

/** The top card of each of the player's in-play stacks (the card whose Ability is printed). */
function sideTops(cards) {
  return rootsOf(cards).filter(isPokemon).map((root) => topPokemonCard(cards, root));
}

/** Magnezone Dual Brains: "During your turn, you may play 2 Supporter cards." → 2, else 1. */
export function abilitySupporterLimit(ctx = {}) {
  const dualBrains = sideTops(ctx.sideCards).some(
    (top) =>
      !isAbilitySuppressed(top, ctx) &&
      /you may play 2 supporter cards/.test(cardAbilityText(top))
  );
  return dualBrains ? 2 : 1;
}

/**
 * Alcremie Additional Order: "As long as this Pokémon is in the Active Spot, your turn does
 * not end when you use Café Master." True when `trainer` is the named card and the holder
 * meets its position clause.
 */
export function abilityTurnNotEnd(trainer, ctx = {}) {
  const name = lower(trainer?.name).replace(/[\u2018\u2019]/g, "'");
  if (!name) return false;
  const activeIds = new Set(rootsOf(ctx.sideActive).map((c) => c.instanceId));
  return rootsOf(ctx.sideCards)
    .filter(isPokemon)
    .some((root) => {
      const top = topPokemonCard(ctx.sideCards, root);
      const text = cardAbilityText(top).replace(/[\u2018\u2019]/g, "'");
      const named = text.match(/your turn does not end when you use ([^.]+?)\./)?.[1];
      if (!named || named.trim() !== name) return false;
      if (/as long as this pok[eé]mon is in the active spot/.test(text) && !activeIds.has(root.instanceId)) {
        return false;
      }
      return !isAbilitySuppressed(top, ctx);
    });
}

/** The top card of the player's Active Pokémon, from their in-play zone cards. */
function activeTop(ctx) {
  const root = rootsOf(ctx.sideActive).find(isPokemon);
  return root ? topPokemonCard(ctx.sideActive, root) : null;
}

/**
 * Malamar Contrary / Shiftry Unlucky Wind: while the holder is its owner's Active Pokémon,
 * "whenever your opponent flips a coin during his or her turn, treat it as tails". `ctx` is
 * the HOLDER's side.
 */
export function abilityForcesOpponentTails(ctx = {}) {
  const top = activeTop(ctx);
  if (!top || isAbilitySuppressed(top, ctx)) return false;
  return /whenever your opponent flips a coin during (?:his or her|their) turn, treat it as tails/.test(
    cardAbilityText(top)
  );
}

/**
 * Spinda Pattern Distraction: "As long as this is your Active Pokémon, whenever your
 * opponent's Basic Pokémon tries to attack, your opponent flips a coin. If tails, that attack
 * does nothing." `ctx` is the DEFENDING side; `attacker` is the attacking Pokémon's top card.
 */
export function abilityAttackFlipGate(attacker, ctx = {}) {
  if (!attacker || (normalizeStage(attacker.stage) || 'Basic') !== 'Basic') return false;
  const top = activeTop(ctx);
  if (!top || isAbilitySuppressed(top, ctx)) return false;
  return /opponent's basic pok[eé]mon tries to attack, your opponent flips a coin\. if tails, that attack does nothing/.test(
    cardAbilityText(top)
  );
}

/**
 * Victini Victory Star: "after you flip any coins for an attack, you may ignore all results of
 * those coin flips and begin flipping those coins again." True when one of the attacker's side
 * has it; the caller enforces "can't use more than 1 Victory Star Ability each turn".
 */
export function abilityVictoryStar(ctx = {}) {
  return sideTops(ctx.sideCards).some(
    (top) =>
      !isAbilitySuppressed(top, ctx) &&
      /after you flip any coins for an attack, you may ignore all (?:results|effects) of those coin flips and begin flipping those coins again/.test(
        cardAbilityText(top)
      )
  );
}

// --- setup / Prize placement (design 034 slice 6) ------------------------

/**
 * Cinderace / Luxray Explosiveness, Manectric Electric Start: "If this Pokémon is in your hand
 * when you are setting up to play, you may put it face down in the Active Spot" — a non-Basic
 * may be the opening Active. `goingSecond` gates the "If you go second" printing.
 */
export function abilitySetupActive(card, { goingSecond = false } = {}) {
  const t = cardAbilityText(card);
  if (
    !/if this pok[eé]mon is in your hand when you are setting up to play, you may put it face down (?:in the active spot|as your active pok[eé]mon)/.test(
      t
    )
  ) {
    return false;
  }
  return !/if you go second/.test(t) || goingSecond;
}

/**
 * Jirachi Prism Star Wish Upon a Star / Chansey Lucky Bonus: "If you took this Pokémon as a
 * face-down Prize card during your turn and your Bench isn't full, before you put it into your
 * hand, you may put it onto your Bench" — `extraPrize` 'always' ("and take 1 more Prize card")
 * or 'coin' ("flip a coin. If heads, take 1 more Prize card"); null when not printed.
 */
export function abilityPrizeToBench(card) {
  const t = cardAbilityText(card);
  if (!/if you took this pok[eé]mon as a face-down prize card during your turn[^.]*you may put it onto your bench/.test(t)) {
    return null;
  }
  if (/flip a coin\. if heads, take 1 more prize card/.test(t)) return { extraPrize: 'coin' };
  if (/and take 1 more prize card/.test(t)) return { extraPrize: 'always' };
  return { extraPrize: null };
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
