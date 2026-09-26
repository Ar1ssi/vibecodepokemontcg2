// Design 035 (I133): one pure condition layer for Pokémon Tool modifiers.
//
// A tool's printed condition ("The Basic Pokémon this card is attached to…",
// "…if you have more Prize cards remaining than your opponent") used to be
// re-guessed by every consumer; each copy missed a different clause. This
// module parses the condition once and evaluates it from a single ctx:
//
//   ctx = { holder, attacker, defender, flags, zoneCards }
//     holder   — the in-play view of the tool's host (top evolution)
//     attacker — the attacking Pokémon view (damage/prevention consumers)
//     defender — the defending Pokémon view (damage bonus consumers)
//     flags    — { trailingPrizes, prizesRemaining } from the caller's state
//
// `parseToolCondition` returns null when the card prints no condition; a null
// descriptor is always true, so unconditional tools keep working unchanged.

import { getRetreatCostCount, isEnergy } from '../cards.mjs';
import {
  isExCard,
  isGxCard,
  isVCard,
  isMegaCard,
  isTeraCard,
  isRuleBoxPokemon,
  isUltraBeastCard,
} from './card-classify.mjs';
import { normalizeStage } from './evolution.mjs';
import { topPokemonCard } from './evolved-pokemon.mjs';
import {
  parseHpBonus,
  parseRetreatCostModifier,
} from './ability-executors.mjs';

const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

const textOf = (card) =>
  lower(
    card?.ability?.text ?? card?.abilityText ?? card?.text ?? card?.effect ?? ''
  );

const TYPE_WORDS = {
  g: 'grass',
  r: 'fire',
  w: 'water',
  l: 'lightning',
  p: 'psychic',
  f: 'fighting',
  d: 'darkness',
  m: 'metal',
  n: 'dragon',
  y: 'fairy',
  c: 'colorless',
};

function hasAbility(card) {
  if (!card) return false;
  if (card.ability && (card.ability.name || card.ability.text)) return true;
  if (card.abilityName || card.abilityText) return true;
  return Array.isArray(card.abilities) && card.abilities.length > 0;
}

function isPoisoned(card) {
  if (!card) return false;
  if (card.poisoned) return true;
  const conditions = card.conditions || card.specialConditions || [];
  return Array.isArray(conditions) && conditions.includes('Poisoned');
}

function stageLabel(card) {
  if (!card) return null;
  return normalizeStage(card?.stage) || 'Basic';
}

/** Any-of subtype match across subtypes/stage/name and the rule-box families. */
function hasSubtype(card, word) {
  if (!card) return false;
  const w = String(word || '').toLowerCase();
  const subs = String(card.subtypes || '').toLowerCase();
  if (subs.split(/[,\s]+/).includes(w)) return true;
  if (stageLabel(card).toLowerCase() === w) return true;
  const name = lower(card.name);
  switch (w) {
    case 'ex':
      return isExCard(card);
    case 'gx':
      return isGxCard(card);
    case 'v':
      return isVCard(card);
    case 'mega':
      return isMegaCard(card);
    case 'tera':
      return isTeraCard(card);
    case 'vmax':
      return /vmax/.test(subs) || /vmax/.test(name);
    case 'vstar':
      return /vstar/.test(subs) || /vstar/.test(name);
    case 'ancient':
      return /ancient/.test(subs) || /ancient/.test(name);
    case 'future':
      return /future/.test(subs) || /future/.test(name);
    case 'ultra beast':
      return isUltraBeastCard(card);
    default:
      // Strike / Team tags: subtype when present, name fragment otherwise.
      return subs.includes(w) || name.includes(w);
  }
}

function pokemonHasTypeWord(card, word) {
  const wanted = lower(word);
  if (!wanted) return false;
  return (card?.types || []).some((type) => {
    const t = lower(type);
    return t === wanted || (wanted === 'darkness' && t === 'dark');
  });
}

function remainingHp(card) {
  const hp = card?.hp;
  if (!hp) return null;
  return hp - (card.damage || 0);
}

function holderHasEnergy(holder, zoneCards) {
  if (!holder) return false;
  return (zoneCards || []).some(
    (c) =>
      isEnergy(c) &&
      (c.attachedTo === holder.instanceId ||
        (holder.image && c.image?.relative === holder.image))
  );
}

// The holder phrase: "The <X> this card is attached to", where X is a stage,
// a subtype or the Pokémon's name. "…of the Pokémon this card is attached to"
// (Heavy Boots) must not be read as a name, hence the `of` guard.
function parseHolderPhrase(t, out) {
  const m = t.match(/\bthe ((?:(?!\bof\b).)+?) this card is attached to/);
  const what = m?.[1]?.trim() || '';
  if (!what) return;
  if (/^(?:basic|stage 1|stage 2) pok[eé]mon$/.test(what)) {
    out.holderStage = {
      'basic pokémon': 'Basic',
      'stage 1 pokémon': 'Stage 1',
      'stage 2 pokémon': 'Stage 2',
    }[what];
  } else if (what === 'pokémon vmax') {
    out.holderSubtypes = ['vmax'];
  } else if (what === 'pokémon vstar') {
    out.holderSubtypes = ['vstar'];
  } else if (what === 'pokémon v') {
    out.holderSubtypes = ['v'];
  } else if (what === 'pokémon-gx or pokémon-ex' || what === 'pokémon-ex or pokémon-gx') {
    out.holderSubtypes = ['gx', 'ex'];
  } else if (what === 'pokémon-gx') {
    out.holderSubtypes = ['gx'];
  } else if (what === 'pokémon-ex') {
    out.holderSubtypes = ['ex'];
  } else if (what === 'ancient pokémon') {
    out.holderSubtypes = ['ancient'];
  } else if (what === 'future pokémon') {
    out.holderSubtypes = ['future'];
  } else if (what === 'tera pokémon') {
    out.holderSubtypes = ['tera'];
  } else if (what === 'ultra beast') {
    out.holderSubtypes = ['ultra beast'];
  } else if (what === 'poisoned pokémon') {
    out.holderPoisoned = true;
  } else if (/^\{([a-z])\} pok[eé]mon$/.test(what)) {
    const symbol = what.match(/^\{([a-z])\} pok[eé]mon$/)[1];
    if (TYPE_WORDS[symbol]) out.holderType = TYPE_WORDS[symbol];
  } else if (
    /^(?:grass|fire|water|lightning|psychic|fighting|darkness|dark|metal|fairy|dragon|colorless) pok[eé]mon$/.test(
      what
    )
  ) {
    // "The Fighting Pokémon this card is attached to" (Rock Chestplate, …)
    out.holderType = what === 'dark pokémon' ? 'darkness' : what.replace(' pokémon', '');
  } else if (
    /^(?:single strike|rapid strike|team aqua|team magma|team plasma|team rocket's) pok[eé]mon$/.test(
      what
    )
  ) {
    out.holderSubtypes = [what.slice(0, -' pokémon'.length)];
  } else if (what === 'pokémon') {
    // generic "the Pokémon this card is attached to" — no condition
  } else {
    // "The Cynthia's Pokémon this card is attached to" / "The Zamazenta V this
    // card is attached to" / "The Regirock, Regice, Registeel, or Regigigas
    // this card is attached to" (Ancient Crystal, audit S&M F4). Comma/“or”
    // name lists must split — matching the whole list as one literal name
    // meant the condition could never hold for a real Regi holder.
    const base = what.endsWith(' pokémon')
      ? what.slice(0, -' pokémon'.length).trim()
      : what;
    const names = base
      .split(/\s*,\s*(?:or\s+)?|\s+or\s+/)
      .map((n) => n.trim())
      .filter(Boolean);
    out.holderNames = names.length ? names : [base];
  }
}

/**
 * Parse the printed condition of a Tool into a descriptor. Every field is
 * optional; returns null when the text carries no condition at all.
 */
export function parseToolCondition(card) {
  const t = textOf(card);
  if (!t) return null;
  const out = {};

  parseHolderPhrase(t, out);

  if (/doesn'?t have a rule box|does not have a rule box/.test(t)) {
    out.holderNoRuleBox = true;
  }
  if (/\bhas no abilities\b|\bdoesn'?t have an ability\b/.test(t)) {
    out.holderNoAbility = true;
  }
  const retreatAtLeast = t.match(/retreat cost[^.]*?(?:is|of)\s+(\d+)\s+or more/);
  if (retreatAtLeast) out.holderRetreatAtLeast = Number(retreatAtLeast[1]);
  const retreatExactly = t.match(/retreat cost of exactly\s+(\d+)/);
  if (retreatExactly) out.holderRetreatExactly = Number(retreatExactly[1]);
  if (/\bhas full hp\b/.test(t)) out.holderFullHp = true;
  // Adversity Policy: "has Weakness to your opponent's Active Pokémon's type".
  if (/has weakness to your opponent'?s active pok[eé]mon'?s type/.test(t)) {
    out.holderWeakToAttacker = true;
  }
  const exceptSub = t.match(/except pok[eé]mon[-\s]?(gx|ex|vmax|vstar|v)\b/);
  if (exceptSub) out.holderExcludeSubtypes = [exceptSub[1]];
  // "…has “Leafeon” or “Glaceon” in its name" (Snow Leaf Badge, Ribbon Badge).
  const nameClause = t.match(
    /has ["“]([^"”]+)["”](?: or ["“]([^"”]+)["”])? in its name/
  );
  if (nameClause) {
    const names = [nameClause[1], nameClause[2]]
      .filter(Boolean)
      .map((n) => lower(n).trim());
    out.holderNames = [...(out.holderNames || []), ...names];
  }

  const attackerHp = t.match(
    /attacks from your opponent'?s pok[eé]mon that have (\d+) hp or less remaining/
  );
  if (attackerHp) out.attackerHpAtMost = Number(attackerHp[1]);
  if (/attacks from your opponent'?s[^.]*that have (?:an )?abilit/.test(t)) {
    out.attackerAbility = true;
  }
  // Attacker clauses ("…by attacks from your opponent's {L} Pokémon-GX and
  // {L} Pokémon-EX"): union every type symbol and subtype word across the
  // sentence so multi-type lists stay any-of.
  const attackerTypes = new Set();
  const attackerSubtypes = new Set();
  for (const m of t.matchAll(/attacks from your opponent'?s ([^.]*)/g)) {
    const segment = m[1];
    for (const sym of segment.matchAll(/\{([a-z])\}/g)) {
      if (TYPE_WORDS[sym[1]]) attackerTypes.add(TYPE_WORDS[sym[1]]);
    }
    for (const sub of segment.matchAll(
      /\b(gx|ex|vmax|vstar|v|ultra beast)\b/g
    )) {
      attackerSubtypes.add(sub[1]);
    }
  }
  if (attackerTypes.size) out.attackerTypes = [...attackerTypes];
  if (attackerSubtypes.size) out.attackerSubtypes = [...attackerSubtypes];
  // "…by attacks from your opponent's Ultra Beast Pokémon-GX and Ultra Beast
  // Pokémon-EX" needs the marker AND a rule-box subtype; `attackerSubtypes`
  // alone is any-of and let a plain EX through (audit S&M F3, Fairy Charm UB).
  if (/attacks from your opponent'?s[^.]*ultra beast/.test(t)) {
    out.attackerUltraBeast = true;
  }

  const defenderClause = t.match(
    /your opponent'?s active ([^.]*?)(?: is knocked out|\.|$)/
  );
  if (defenderClause) {
    const segment = defenderClause[1];
    const types = [...segment.matchAll(/\{([a-z])\}/g)]
      .map((m) => TYPE_WORDS[m[1]])
      .filter(Boolean);
    if (types.length) out.defenderType = types[0];
    const subs = [...segment.matchAll(/\b(gx|ex|vmax|vstar|v|ultra beast)\b/g)].map(
      (m) => m[1]
    );
    if (subs.length) out.defenderSubtypes = subs;
  }

  if (/more prize cards remaining than your opponent/.test(t)) {
    out.trailingPrizes = true;
  }
  const exactlyPrizes = t.match(/exactly (\d+) prize cards? remaining/);
  if (exactlyPrizes) out.exactlyPrizes = Number(exactlyPrizes[1]);

  if (
    /doesn'?t have any energy attached|does not have any energy attached|no energy attached/.test(
      t
    )
  ) {
    out.noEnergyAttached = true;
  }

  return Object.keys(out).length ? out : null;
}

/**
 * Evaluate a condition descriptor against a call context. A null descriptor is
 * unconditionally true; a missing ctx card fails any condition that needs it.
 */
export function toolConditionMet(cond, ctx = {}) {
  if (!cond) return true;
  const holder = ctx.holder || null;
  const attacker = ctx.attacker || null;
  const defender = ctx.defender || null;
  const flags = ctx.flags || {};

  if (cond.holderNames?.length) {
    const name = lower(holder?.name);
    if (!name || !cond.holderNames.some((n) => name.includes(n))) return false;
  }
  if (cond.holderStage && stageLabel(holder) !== cond.holderStage) return false;
  if (cond.holderType && !pokemonHasTypeWord(holder, cond.holderType)) {
    return false;
  }
  if (
    cond.holderSubtypes?.length &&
    !cond.holderSubtypes.some((s) => hasSubtype(holder, s))
  ) {
    return false;
  }
  if (
    cond.holderExcludeSubtypes?.length &&
    cond.holderExcludeSubtypes.some((s) => hasSubtype(holder, s))
  ) {
    return false;
  }
  if (cond.holderNoRuleBox && isRuleBoxPokemon(holder)) return false;
  if (cond.holderNoAbility && hasAbility(holder)) return false;
  if (cond.holderPoisoned && !isPoisoned(holder)) return false;
  if (
    cond.holderRetreatAtLeast != null &&
    getRetreatCostCount(holder) < cond.holderRetreatAtLeast
  ) {
    return false;
  }
  if (
    cond.holderRetreatExactly != null &&
    getRetreatCostCount(holder) !== cond.holderRetreatExactly
  ) {
    return false;
  }
  if (cond.holderFullHp && (holder?.damage || 0) > 0) return false;
  if (cond.holderWeakToAttacker) {
    const weakTo = (holder?.weaknesses || []).map((w) => lower(w?.type ?? w));
    if (!attacker || !(attacker.types || []).some((ty) => weakTo.includes(lower(ty)))) return false;
  }
  if (cond.noEnergyAttached && holderHasEnergy(holder, ctx.zoneCards)) {
    return false;
  }

  if (cond.attackerTypes?.length && !cond.attackerTypes.some((w) => pokemonHasTypeWord(attacker, w))) {
    return false;
  }
  if (
    cond.attackerSubtypes?.length &&
    !cond.attackerSubtypes.some((s) => hasSubtype(attacker, s))
  ) {
    return false;
  }
  if (cond.attackerAbility && !hasAbility(attacker)) return false;
  if (cond.attackerUltraBeast && !isUltraBeastCard(attacker)) return false;
  if (cond.attackerHpAtMost != null) {
    const hp = remainingHp(attacker);
    if (hp == null || hp > cond.attackerHpAtMost) return false;
  }

  if (cond.defenderType && !pokemonHasTypeWord(defender, cond.defenderType)) {
    return false;
  }
  if (
    cond.defenderSubtypes?.length &&
    !cond.defenderSubtypes.some((s) => hasSubtype(defender, s))
  ) {
    return false;
  }

  if (cond.trailingPrizes && !flags.trailingPrizes) return false;
  if (cond.exactlyPrizes != null && flags.prizesRemaining !== cond.exactlyPrizes) {
    return false;
  }

  return true;
}

/** The in-play view of a tool's holder: top evolution when evolved. */
export function holderView(pokemon, zoneCards) {
  if (!pokemon) return null;
  return topPokemonCard(zoneCards, pokemon) || pokemon;
}

/** Gated HP bonus of one Tool (0 when its printed condition fails). */
export function toolHpBonusFor(tool, ctx = {}) {
  if (!toolConditionMet(parseToolCondition(tool), ctx)) return 0;
  return parseHpBonus(tool).bonus || 0;
}

/** Gated retreat-cost delta of one Tool (0 when its condition fails). */
export function toolRetreatDeltaFor(tool, ctx = {}) {
  if (!toolConditionMet(parseToolCondition(tool), ctx)) return 0;
  return parseRetreatCostModifier(tool).delta || 0;
}
