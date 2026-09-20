// Pokémon Tool combat hooks — contextual application of parsed tool text during
// attacks, retreat, KO, and on-damage triggers. Pure + DOM-free where possible;
// execution callbacks are passed in from chat-buttons.js.

import {
  isPokemonToolCard,
  attachedTools,
  parseDamagePrevention,
  parseDamageReduction,
  parseDamageBonus,
  parseHpBonus,
  parseRetreatCostModifier,
  applyRetreatCostModifier,
  parsePrizeModify,
  parseKoPrevention,
  parseThorns,
  mergeDamagePrevention,
} from './ability-executors.mjs';
import {
  isExCard,
  isGxCard,
  isMegaCard,
  isVCard,
  isTeraCard,
  isRuleBoxPokemon,
} from './card-classify.mjs';
import { stadiumBlocksToolEffects } from './stadium-effects.mjs';
import { isSpecialEnergyCard } from './special-energy-parse.mjs';

const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

const textOf = (card) =>
  lower(
    card?.ability?.text ?? card?.abilityText ?? card?.text ?? card?.effect ?? ''
  );

const TYPE_LETTER = {
  g: 'grass',
  r: 'fire',
  w: 'water',
  l: 'lightning',
  p: 'psychic',
  f: 'fighting',
  d: 'darkness',
  m: 'metal',
  y: 'fairy',
  n: 'dragon',
  c: 'colorless',
};

export {
  isExCard,
  isGxCard,
  isMegaCard,
  isVCard,
  isTeraCard,
  isPokemonToolCard,
  attachedTools,
};

export function attackerTypes(attacker) {
  return (attacker?.types || []).map((t) => String(t).toLowerCase());
}

export function cardHasAbility(card = {}) {
  if (!card) return false;
  if (card.ability && (card.ability.name || card.ability.text)) return true;
  if (card.abilityName || card.abilityText) return true;
  if (Array.isArray(card.abilities) && card.abilities.length > 0) return true;
  return false;
}

export function isEvolutionCard(card = {}) {
  if (!card) return false;
  const stage = String(card.stage || '').toLowerCase();
  if (stage === 'stage 1' || stage === 'stage 2' || stage === 'evolution')
    return true;
  const subs = (card.subtypes || []).map((s) => String(s).toLowerCase());
  if (
    subs.includes('stage 1') ||
    subs.includes('stage 2') ||
    subs.includes('evolution') ||
    subs.includes('vmax') ||
    subs.includes('vstar')
  ) {
    return true;
  }
  return false;
}

export function isBasicCard(card = {}) {
  if (!card) return false;
  const stage = String(card.stage || '').toLowerCase();
  const subs = (card.subtypes || []).map((s) => String(s).toLowerCase());
  return stage === 'basic' || subs.includes('basic');
}

export function isStage1Card(card = {}) {
  if (!card) return false;
  const stage = String(card.stage || '').toLowerCase();
  const subs = (card.subtypes || []).map((s) => String(s).toLowerCase());
  return (
    stage === 'stage 1' || subs.includes('stage 1') || subs.includes('stage1')
  );
}

export function isStage2Card(card = {}) {
  if (!card) return false;
  const stage = String(card.stage || '').toLowerCase();
  const subs = (card.subtypes || []).map((s) => String(s).toLowerCase());
  return (
    stage === 'stage 2' || subs.includes('stage 2') || subs.includes('stage2')
  );
}

export function attachedCards(pokemon, zoneCards = []) {
  if (!pokemon) return [];
  return (zoneCards || []).filter((c) => {
    if (c === pokemon) return false;
    if (pokemon.instanceId != null && c.attachedTo === pokemon.instanceId)
      return true;
    if (pokemon.image && c.image?.relative === pokemon.image) return true;
    return false;
  });
}

function toolBlocked(blockTools, stadium = null) {
  return Boolean(blockTools || stadiumBlocksToolEffects(stadium));
}

export function preventionForCard(card, attacker) {
  if (!card) return { preventAll: false, reduce: 0 };
  const t = textOf(card);
  const base = parseDamagePrevention(card);
  if (!base.preventAll && !base.reduce) return base;

  if (base.preventAll) {
    if (/pokémon ex\b|pokemon ex\b/i.test(t)) {
      if (!isExCard(attacker)) return { preventAll: false, reduce: 0 };
    }
    if (/pokémon v\b|pokemon v\b/i.test(t)) {
      if (!isVCard(attacker)) return { preventAll: false, reduce: 0 };
    }
    if (/have an ability|has an ability|that have an ability/i.test(t)) {
      if (!cardHasAbility(attacker)) return { preventAll: false, reduce: 0 };
    }
    if (/evolution pokémon|evolution pokemon/i.test(t)) {
      if (!isEvolutionCard(attacker)) return { preventAll: false, reduce: 0 };
    }
    if (/basic pokémon|basic pokemon/i.test(t)) {
      if (!isBasicCard(attacker)) return { preventAll: false, reduce: 0 };
    }
  }
  return base;
}

export function reductionForCard(card, defender, attacker) {
  if (!card) return 0;
  const t = textOf(card);
  const red = parseDamageReduction(card).reduce;
  if (!red) return 0;

  // Attacker requirements
  const sym = t.match(/opponent's \{([a-z])\}/i);
  if (sym) {
    const need = TYPE_LETTER[sym[1].toLowerCase()];
    if (need && !attackerTypes(attacker).includes(need)) return 0;
  }
  if (/non-\{d\}/i.test(t)) {
    if (attackerTypes(attacker).includes('darkness')) return 0;
  }
  if (/have an ability|has an ability/i.test(t) && !cardHasAbility(attacker)) {
    return 0;
  }
  if (/pokémon v\b|pokemon v\b/i.test(t) && !isVCard(attacker)) {
    return 0;
  }
  if (/pokémon ex\b|pokemon ex\b/i.test(t) && !isExCard(attacker)) {
    return 0;
  }
  if (/\{g\}|\{r\}|\{w\}|\{l\}/i.test(t)) {
    const letters = [...t.matchAll(/\{([a-z])\}/gi)]
      .map((m) => TYPE_LETTER[m[1].toLowerCase()])
      .filter(Boolean);
    if (
      letters.length &&
      !letters.some((ty) => attackerTypes(attacker).includes(ty))
    )
      return 0;
  }

  // Defender requirements (e.g. "The Fighting Pokémon this card is attached to takes 30 less damage")
  if (/the fighting pokémon|the \{f\} pokémon/i.test(t)) {
    if (!attackerTypes(defender).includes('fighting')) return 0;
  }
  if (/the metal pokémon|the \{m\} pokémon/i.test(t)) {
    if (!attackerTypes(defender).includes('metal')) return 0;
  }
  if (/the grass pokémon|the \{g\} pokémon/i.test(t)) {
    if (!attackerTypes(defender).includes('grass')) return 0;
  }
  if (/the stage 1 pokémon|the stage 1 pokemon/i.test(t)) {
    if (!isStage1Card(defender)) return 0;
  }
  if (/the stage 2 pokémon|the stage 2 pokemon/i.test(t)) {
    if (!isStage2Card(defender)) return 0;
  }

  return red;
}

function bonusForTool(
  tool,
  {
    defender,
    defenderIsActive = true,
    attacker,
    defenderPoisoned = false,
    attackerTrailingPrizes = false,
  }
) {
  const t = textOf(tool);
  const bonus = parseDamageBonus(tool).bonus;
  if (!bonus) return 0;
  if (/active pokémon ex|active pokemon ex/i.test(t) && !isExCard(defender))
    return 0;
  if (/active pokémon ex|active pokemon ex/i.test(t) && !defenderIsActive)
    return 0;
  if (/active pokémon v\b|active pokemon v\b/i.test(t) && !isVCard(defender))
    return 0;
  if (/active pokémon v\b|active pokemon v\b/i.test(t) && !defenderIsActive)
    return 0;
  if (
    /more prize cards remaining than your opponent/i.test(t) &&
    !attackerTrailingPrizes
  )
    return 0;
  if (
    /doesn'?t have a rule box|do not have a rule box/i.test(t) &&
    isRuleBoxPokemon(attacker)
  )
    return 0;
  const attackerPoisoned = (attacker?.conditions || []).includes('Poisoned');
  if (
    /this pokémon is poisoned|pokémon this card is attached to is poisoned/i.test(
      t
    ) &&
    !attackerPoisoned
  )
    return 0;
  if (
    /poisoned pokémon|poisoned pokemon/i.test(t) &&
    !/this pokémon is poisoned|pokémon this card is attached to is poisoned/i.test(
      t
    ) &&
    !defenderPoisoned
  ) {
    return 0;
  }
  if (
    /hop's pokémon|hop's pokemon/i.test(t) &&
    !/hop's/i.test(defender?.name || '')
  )
    return 0;
  if (/pikachu ex/i.test(t) && !/pikachu ex/i.test(attacker?.name || ''))
    return 0;
  if (/tera pokémon|tera pokemon/i.test(t) && !isTeraCard(attacker)) return 0;
  return bonus;
}

/** Defender-side prevention from Pokémon + attached Tools. */
export function combinedToolDamagePrevention(
  defender,
  zoneCards,
  attacker,
  { blockTools = false, stadium = null } = {}
) {
  let out = preventionForCard(defender, attacker);
  if (toolBlocked(blockTools, stadium)) return out;
  for (const tool of attachedTools(defender, zoneCards)) {
    out = mergeDamagePrevention(out, preventionForCard(tool, attacker));
  }
  return out;
}

/** Apply typed/tool damage reduction after prevention. */
export function applyToolDamageReduction(
  incoming,
  defender,
  zoneCards,
  attacker,
  { blockTools = false, stadium = null, inPlayCards = [] } = {}
) {
  let total = incoming;
  if (total <= 0) return 0;

  // 1. Defender's own ability reduction
  const selfRed = reductionForCard(defender, defender, attacker);
  if (selfRed > 0) total = Math.max(0, total - selfRed);

  // 2. Team-wide bench/in-play passive ability reductions (e.g. Radiant Gardevoir)
  for (const card of inPlayCards) {
    if (card === defender || card.attachedTo) continue;
    const t = textOf(card);
    if (/your pokémon take|your pokemon take/i.test(t)) {
      const red = reductionForCard(card, defender, attacker);
      if (red > 0) total = Math.max(0, total - red);
    }
  }

  // 3. Attached tools reduction
  if (!toolBlocked(blockTools, stadium)) {
    for (const tool of attachedTools(defender, zoneCards)) {
      const red = reductionForCard(tool, defender, attacker);
      if (red > 0) total = Math.max(0, total - red);
    }
  }

  return total;
}

/** Attacker-side damage bonus from attached Tools. */
export function combinedToolAttackBonus(
  attacker,
  zoneCards,
  defender,
  {
    blockTools = false,
    defenderIsActive = true,
    defenderPoisoned = false,
    attackerTrailingPrizes = false,
    stadium = null,
  } = {}
) {
  let bonus = 0;
  if (toolBlocked(blockTools, stadium)) return bonus;
  for (const tool of attachedTools(attacker, zoneCards)) {
    bonus += bonusForTool(tool, {
      defender,
      defenderIsActive,
      attacker,
      defenderPoisoned,
      attackerTrailingPrizes,
    });
  }
  return bonus;
}

/** HP bonus from attached Tools (stadium bonus applied separately). */
export function combinedToolHpBonus(
  pokemon,
  zoneCards,
  { blockTools = false } = {}
) {
  let bonus = 0;
  if (toolBlocked(blockTools)) return bonus;
  for (const tool of attachedTools(pokemon, zoneCards)) {
    bonus += parseHpBonus(tool).bonus || 0;
  }
  return bonus;
}

/** Retreat cost delta from Pokémon + attached Tools. */
export function combinedToolRetreatCost(
  baseRetreat,
  pokemon,
  zoneCards,
  { blockTools = false, stadium = null } = {}
) {
  let cost = baseRetreat || 0;
  const mod = parseRetreatCostModifier(pokemon);
  cost = applyRetreatCostModifier(cost, mod?.delta || 0);
  if (toolBlocked(blockTools, stadium)) return cost;
  for (const tool of attachedTools(pokemon, zoneCards)) {
    const tmod = parseRetreatCostModifier(tool);
    cost = applyRetreatCostModifier(cost, tmod?.delta || 0);
    const t = textOf(tool);
    if (/remaining hp is 30 or less/i.test(t)) {
      const dmg =
        typeof pokemon?.damage === 'number'
          ? pokemon.damage
          : (parseInt(pokemon?.image?.damageCounter?.textContent || '0', 10) ||
              0) * 10;
      const hp = pokemon?.hp || 0;
      if (hp > 0 && hp - dmg <= 30) cost = 0;
    }
  }
  return cost;
}

/**
 * If a Tool or Ability prevents this KO, return adjusted total damage.
 * Supports both counter units (legacy tests) and HP units (inHp: true).
 */
export function evaluateToolKoPrevention(
  defender,
  zoneCards,
  {
    currentDamage = 0,
    incomingDamage = 0,
    baseHp = 0,
    blockTools = false,
    stadium = null,
    inHp = false,
  } = {}
) {
  const isBlocked = toolBlocked(blockTools, stadium);
  const totalAfter = currentDamage + incomingDamage;

  if (!defender) {
    return {
      prevented: false,
      totalDamage: inHp ? totalAfter : Math.ceil(totalAfter / 10),
      damageHp: totalAfter,
    };
  }

  const candidates = [];
  const selfKo = parseKoPrevention(defender);
  if (selfKo.fullHpOnly || selfKo.surviveHp != null) {
    candidates.push({ source: defender, ko: selfKo, isTool: false });
  }

  if (!isBlocked) {
    for (const tool of attachedTools(defender, zoneCards)) {
      const ko = parseKoPrevention(tool);
      if (ko.fullHpOnly || ko.surviveHp != null) {
        candidates.push({ source: tool, ko, isTool: true });
      }
    }
  }

  const hpThreshold = inHp ? baseHp || 0 : Math.ceil((baseHp || 0) / 10);
  const dmgCurrent = currentDamage;
  const dmgTotal = totalAfter;

  for (const { source, ko, isTool } of candidates) {
    if (!ko.fullHpOnly && ko.surviveHp == null) continue;
    if (ko.fullHpOnly && dmgCurrent > 0) continue;
    if (dmgTotal < hpThreshold) continue;

    const surviveHp = ko.surviveHp ?? 10;
    const hp = baseHp || 0;
    const maxDamageHp = Math.max(0, hp - surviveHp);
    const maxDamageCounters = Math.max(
      0,
      Math.ceil(hp / 10) - Math.ceil(surviveHp / 10)
    );
    const discardOnUse = /discard this card/i.test(textOf(source));

    return {
      prevented: true,
      totalDamage: inHp ? maxDamageHp : maxDamageCounters,
      damageHp: maxDamageHp,
      tool: source.name,
      toolCard: isTool ? source : null,
      surviveHp,
      discardOnUse,
    };
  }

  return {
    prevented: false,
    totalDamage: inHp ? totalAfter : Math.ceil(totalAfter / 10),
    damageHp: totalAfter,
  };
}

/** Adjust prize count when defender is KO'd (e.g. Lillie's Pearl, Legacy Energy). */
export function toolPrizeCountAdjust(
  defender,
  zoneCards,
  baseCount,
  { blockTools = false, stadium = null, skipSpecialEnergy = false } = {}
) {
  let count = baseCount;
  if (!defender) return count;
  const toolsBlocked = toolBlocked(blockTools, stadium);
  for (const card of attachedCards(defender, zoneCards)) {
    if (isPokemonToolCard(card) && toolsBlocked) continue;
    // Legacy Energy's once-per-game reduction can be spent; when it is, its
    // (generic) prize-modify text must be ignored.
    if (skipSpecialEnergy && isSpecialEnergyCard(card)) continue;
    const delta = parsePrizeModify(card).delta;
    if (delta) count = Math.max(0, count + delta);
  }
  return count;
}

/** Parse reactive tool effects when the host is damaged by an attack. */
export function parseToolOnDamageEffect(tool) {
  const t = textOf(tool);
  if (
    !t.includes('damaged by an attack') &&
    !t.includes('knocked out by damage')
  ) {
    return null;
  }
  const out = {
    draw: 0,
    damageAttacker: 0,
    searchDeckOnKo: 0,
    moveDamage: 0,
    discardTool: false,
    requiresActive: /active spot/.test(t),
  };
  const dm = t.match(/draw (\d+) cards?/);
  if (dm) out.draw = parseInt(dm[1], 10) || 2;
  const atk = t.match(/put (\d+) damage counters on the attacking pokémon/);
  if (atk) {
    out.damageAttacker = parseInt(atk[1], 10) || 0;
    out.discardTool = /discard this card/.test(t);
  }
  const mv = t.match(/move (\d+) damage counters?/);
  if (mv) out.moveDamage = parseInt(mv[1], 10) || 1;
  const search = t.match(/search your deck for up to (\d+) cards?/);
  if (search && t.includes('knocked out'))
    out.searchDeckOnKo = parseInt(search[1], 10) || 1;
  const th = parseThorns(tool);
  if (th.count && !out.damageAttacker) out.damageAttacker = th.count;
  if (out.draw || out.damageAttacker || out.searchDeckOnKo || out.moveDamage)
    return out;
  return null;
}

export function attachedToolOnDamageEffects(
  defender,
  zoneCards,
  { blockTools = false, stadium = null, isActive = true } = {}
) {
  if (toolBlocked(blockTools, stadium) || !defender) return [];
  const effects = [];
  for (const tool of attachedTools(defender, zoneCards)) {
    const parsed = parseToolOnDamageEffect(tool);
    if (!parsed) continue;
    if (parsed.requiresActive && !isActive) continue;
    effects.push({ tool, ...parsed });
  }
  return effects;
}
