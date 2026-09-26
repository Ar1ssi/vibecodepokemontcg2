// Pokémon Tool combat hooks — contextual application of parsed tool text during
// attacks, retreat, KO, and on-damage triggers. Pure + DOM-free where possible;
// execution callbacks are passed in from chat-buttons.js.

import {
  isPokemonToolCard,
  attachedTools,
  cardAbilityText,
  parseDamagePrevention,
  parseDamageReduction,
  parseDamageBonus,
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
import {
  holderView,
  parseToolCondition,
  toolConditionMet,
  toolHpBonusFor,
  toolRetreatDeltaFor,
} from './tool-conditions.mjs';

const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'");

export const TYPE_LETTER = {
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

/**
 * Rule-box wording in the attacker clause. Only the "attacks (from|of) your
 * opponent's …" segment counts — a trailing reminder like "(Pokémon V,
 * Pokémon-GX, etc. have Rule Boxes.)" must not gate the effect (Pot Helmet).
 * Within the clause the listed subtypes are any-of: "Pokémon-GX and Pokémon-EX"
 * (Fairy Charm, audit S&M F3) and "Pokémon V or Pokémon-GX" (Pot Helmet) both
 * accept any listed class, while a lone "Pokémon-EX" narrows to EX.
 */
function attackerMatchesPrintedRuleBox(t, attacker) {
  const clauses = [...t.matchAll(/attacks? (?:from|of) your opponent'?s ([^.]*)/gi)]
    .map((m) => m[1])
    .join(' ');
  if (!clauses) {
    // Legacy fallback for wordings without the attacker clause.
    const mentionsEx = /pok[eé]mon[-\s]?ex\b|pokemon[-\s]?ex\b/i.test(t);
    const mentionsGx = /pok[eé]mon[-\s]?gx\b|pokemon[-\s]?gx\b/i.test(t);
    if (mentionsEx && !mentionsGx && !isExCard(attacker)) return false;
    if (mentionsGx && !mentionsEx && !isGxCard(attacker)) return false;
    return true;
  }
  const tokens = new Set(
    [...clauses.matchAll(/\b(gx|ex|vmax|vstar|v)\b/gi)].map((m) => m[1].toLowerCase())
  );
  if (tokens.size === 0) return true;
  return [...tokens].some((token) => {
    if (token === 'gx') return isGxCard(attacker);
    if (token === 'ex') return isExCard(attacker);
    if (token === 'v') return isVCard(attacker);
    const subtypes = (attacker?.subtypes || []).map((s) => String(s).toLowerCase());
    return subtypes.includes(token);
  });
}

export function preventionForCard(card, attacker, ctx = {}) {
  if (!card) return { preventAll: false, reduce: 0, reduceHp: 0 };
  const t = cardAbilityText(card);
  const base = parseDamagePrevention(card);
  if (!base.preventAll && !base.reduce && !base.reduceHp) return base;
  if (!toolConditionMet(parseToolCondition(card), { ...ctx, attacker })) {
    return { preventAll: false, reduce: 0, reduceHp: 0 };
  }

  // The attacker conditions gate every prevention/reduction wording, not just
  // "prevent all damage" (a conditional "damage is reduced by N" must not
  // apply to an unlisted attacker). Legacy printings spell "Pokémon-EX" with a
  // hyphen, so the space-only pattern never matched them.
  if (!attackerMatchesPrintedRuleBox(t, attacker)) {
    return { preventAll: false, reduce: 0, reduceHp: 0 };
  }
  if (/pokémon v\b|pokemon v\b/i.test(t)) {
    if (!isVCard(attacker)) return { preventAll: false, reduce: 0, reduceHp: 0 };
  }
  if (/have an ability|has an ability|that have an ability/i.test(t)) {
    if (!cardHasAbility(attacker))
      return { preventAll: false, reduce: 0, reduceHp: 0 };
  }
  if (/evolution pokémon|evolution pokemon/i.test(t)) {
    if (!isEvolutionCard(attacker))
      return { preventAll: false, reduce: 0, reduceHp: 0 };
  }
  if (/basic pokémon|basic pokemon/i.test(t)) {
    if (!isBasicCard(attacker))
      return { preventAll: false, reduce: 0, reduceHp: 0 };
  }
  return base;
}

export function reductionForCard(card, defender, attacker, { skipSymbolFilter = false, ...ctx } = {}) {
  if (!card) return 0;
  const t = cardAbilityText(card);
  const red = parseDamageReduction(card).reduce;
  if (!red) return 0;
  if (!toolConditionMet(parseToolCondition(card), { ...ctx, defender, attacker })) {
    return 0;
  }

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
  // The clause-scoped rule-box check owns V/GX/EX (a whole-text "Pokémon V"
  // scan made Pot Helmet's "V or Pokémon-GX" fail on GX attackers).
  if (!attackerMatchesPrintedRuleBox(t, attacker)) {
    return 0;
  }
  if (!skipSymbolFilter && /\{g\}|\{r\}|\{w\}|\{l\}/i.test(t)) {
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
    ctx = null,
  }
) {
  const t = cardAbilityText(tool);
  const parsedBonus = parseDamageBonus(tool);
  let bonus = parsedBonus.bonus;
  if (!bonus) return 0;
  if (ctx && !toolConditionMet(parseToolCondition(tool), ctx)) return 0;
  if (/active (?:\{[a-z]\}\s*)?pok[eé]mon/i.test(t) && !defenderIsActive) {
    return 0;
  }
  if (/active pokémon ex|active pokemon ex/i.test(t) && !isExCard(defender))
    return 0;
  if (/active pokémon v\b|active pokemon v\b/i.test(t) && !isVCard(defender))
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
  // Hop's Choice Band: "Attacks used by the Hop's Pokémon this card is
  // attached to" — the name check belongs on the holder, not the defender (A3).
  if (
    /hop's pokémon|hop's pokemon/i.test(t) &&
    !/hop's/i.test(lower(attacker?.name))
  )
    return 0;
  if (/pikachu ex/i.test(t) && !/pikachu ex/i.test(lower(attacker?.name)))
    return 0;
  if (/tera pokémon|tera pokemon/i.test(t) && !isTeraCard(attacker)) return 0;
  // "…for each Prize card you have taken" (Beastite): × taken Prizes, from the
  // attacker's remaining Prizes; unknown remaining fails to 0 (audit S&M F5).
  if (parsedBonus.perPrizeTaken) {
    const remaining = ctx?.flags?.prizesRemaining;
    const taken = Number.isFinite(remaining) ? Math.max(0, 6 - remaining) : 0;
    bonus *= taken;
  }
  return bonus;
}

/** Defender-side prevention from Pokémon + attached Tools. */
export function combinedToolDamagePrevention(
  defender,
  zoneCards,
  attacker,
  { blockTools = false, stadium = null, flags = {}, abilities = true } = {}
) {
  const ctx = {
    holder: holderView(defender, zoneCards),
    attacker,
    defender,
    zoneCards,
    flags,
  };
  let out = abilities
    ? preventionForCard(defender, attacker, ctx)
    : { preventAll: false, reduce: 0, reduceHp: 0 };
  if (toolBlocked(blockTools, stadium)) return out;
  for (const tool of attachedTools(defender, zoneCards)) {
    out = mergeDamagePrevention(out, preventionForCard(tool, attacker, ctx));
  }
  return out;
}

/** Apply typed/tool damage reduction after prevention. */
export function applyToolDamageReduction(
  incoming,
  defender,
  zoneCards,
  attacker,
  { blockTools = false, stadium = null, inPlayCards = [], flags = {}, abilities = true } = {}
) {
  let total = incoming;
  if (total <= 0) return 0;
  const ctx = {
    holder: holderView(defender, zoneCards),
    attacker,
    defender,
    zoneCards,
    flags,
  };

  if (abilities) {
    // 1. Defender's own ability reduction
    const selfRed = reductionForCard(defender, defender, attacker, ctx);
    if (selfRed > 0) total = Math.max(0, total - selfRed);

    // 2. Team-wide bench/in-play passive ability reductions (e.g. Radiant Gardevoir)
    for (const card of inPlayCards) {
      if (card === defender || card.attachedTo) continue;
      const t = cardAbilityText(card);
      if (/your pokémon take|your pokemon take/i.test(t)) {
        const red = reductionForCard(card, defender, attacker, {
          ...ctx,
          holder: card,
        });
        if (red > 0) total = Math.max(0, total - red);
      }
    }
  }

  // 3. Attached tools reduction
  if (!toolBlocked(blockTools, stadium)) {
    for (const tool of attachedTools(defender, zoneCards)) {
      const red = reductionForCard(tool, defender, attacker, ctx);
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
    attackerPrizesRemaining,
    stadium = null,
  } = {}
) {
  let bonus = 0;
  if (toolBlocked(blockTools, stadium)) return bonus;
  const ctx = {
    holder: holderView(attacker, zoneCards),
    attacker,
    defender,
    zoneCards,
    flags: {
      defenderIsActive,
      defenderPoisoned,
      trailingPrizes: attackerTrailingPrizes,
      prizesRemaining: attackerPrizesRemaining,
    },
  };
  for (const tool of attachedTools(attacker, zoneCards)) {
    bonus += bonusForTool(tool, {
      defender,
      defenderIsActive,
      attacker,
      defenderPoisoned,
      attackerTrailingPrizes,
      ctx,
    });
  }
  return bonus;
}

/** HP bonus from attached Tools (stadium bonus applied separately). */
export function combinedToolHpBonus(
  pokemon,
  zoneCards,
  { blockTools = false, stadium = null } = {}
) {
  let bonus = 0;
  if (toolBlocked(blockTools, stadium)) return bonus;
  const holder = holderView(pokemon, zoneCards);
  for (const tool of attachedTools(pokemon, zoneCards)) {
    bonus += toolHpBonusFor(tool, { holder, zoneCards });
  }
  return bonus;
}

/** Retreat cost delta from Pokémon + attached Tools. */
export function combinedToolRetreatCost(
  baseRetreat,
  pokemon,
  zoneCards,
  { blockTools = false, stadium = null, benchCards = null, sideCards = null, opponentSideCards = null } = {}
) {
  let cost = baseRetreat || 0;
  const holder = holderView(pokemon, zoneCards);
  const mod = parseRetreatCostModifier(holder, {
    zoneCards,
    stadium,
    benchCards,
    sideCards,
    opponentSideCards,
  });
  cost = applyRetreatCostModifier(cost, mod?.delta || 0);
  if (toolBlocked(blockTools, stadium)) return cost;
  for (const tool of attachedTools(pokemon, zoneCards)) {
    cost = applyRetreatCostModifier(
      cost,
      toolRetreatDeltaFor(tool, { holder, zoneCards })
    );
    const t = cardAbilityText(tool);
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
    // Focus Band flips a coin; called only for a coin-flip candidate.
    flipCoin = null,
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

  // A tails flip still happened, so it is reported even when nothing prevented the KO.
  let lastCoinFace = null;
  for (const { source, ko, isTool } of candidates) {
    if (!ko.fullHpOnly && ko.surviveHp == null) continue;
    if (ko.fullHpOnly && dmgCurrent > 0) continue;
    if (dmgTotal < hpThreshold) continue;
    let coinFace = null;
    if (ko.coinFlip) {
      coinFace = typeof flipCoin === 'function' ? flipCoin() : null;
      if (coinFace) lastCoinFace = coinFace;
      if (coinFace !== 'heads') continue;
    }

    const surviveHp = ko.surviveHp ?? 10;
    const hp = baseHp || 0;
    const maxDamageHp = Math.max(0, hp - surviveHp);
    const maxDamageCounters = Math.max(
      0,
      Math.ceil(hp / 10) - Math.ceil(surviveHp / 10)
    );
    const discardOnUse = /discard this card|then, discard [a-z]/i.test(cardAbilityText(source));

    return {
      prevented: true,
      totalDamage: inHp ? maxDamageHp : maxDamageCounters,
      damageHp: maxDamageHp,
      tool: source.name,
      toolCard: isTool ? source : null,
      surviveHp,
      discardOnUse,
      coinFace,
    };
  }

  return {
    prevented: false,
    totalDamage: inHp ? totalAfter : Math.ceil(totalAfter / 10),
    damageHp: totalAfter,
    ...(lastCoinFace && { coinFace: lastCoinFace }),
  };
}

/** Adjust prize count when defender is KO'd (e.g. Lillie's Pearl, Legacy Energy). */
export function toolPrizeCountAdjust(
  defender,
  zoneCards,
  baseCount,
  {
    blockTools = false,
    stadium = null,
    skipSpecialEnergy = false,
    holder = null,
    flags = {},
  } = {}
) {
  let count = baseCount;
  if (!defender) return count;
  const toolsBlocked = toolBlocked(blockTools, stadium);
  const ctx = {
    holder: holder || holderView(defender, zoneCards),
    defender,
    zoneCards,
    flags,
  };
  for (const card of attachedCards(defender, zoneCards)) {
    if (isPokemonToolCard(card) && toolsBlocked) continue;
    // Legacy Energy's once-per-game reduction can be spent; when it is, its
    // (generic) prize-modify text must be ignored.
    if (skipSpecialEnergy && isSpecialEnergyCard(card)) continue;
    if (!toolConditionMet(parseToolCondition(card), ctx)) continue;
    // Attacker-side clauses (Beast Bringer) change the holder owner's own Knock Outs.
    const { delta, side } = parsePrizeModify(card);
    if (side !== 'victim') continue;
    count = Math.max(0, count + delta);
  }
  return count;
}

/**
 * Parse reactive tool effects when the host is damaged by an attack or Knocked Out.
 * `phase` is the governing trigger (I139, I140): 'damage' for "is damaged by an
 * attack (even if … Knocked Out)", which resolves on every damaging hit; 'ko' for
 * "is Knocked Out by damage", which resolves only on the Knock Out.
 */
export function parseToolOnDamageEffect(tool) {
  const t = cardAbilityText(tool);
  if (
    !t.includes('damaged by an attack') &&
    !t.includes('knocked out by damage')
  ) {
    return null;
  }
  const out = {
    phase: t.includes('damaged by an attack') ? 'damage' : 'ko',
    draw: 0,
    drawUntil: 0,
    damageAttacker: 0,
    searchDeckOnKo: 0,
    moveDamage: 0,
    discardTool: false,
    requiresActive: /active spot/.test(t),
    // "the Pokémon this card is attached to is Knocked Out" vs "your Active Pokémon
    // is Knocked Out" (Exp. Share / Wishful Baton sit on a Benched Pokémon).
    trigger: /your active pok[eé]mon is knocked out/.test(t) ? 'activeKo' : 'selfKo',
    moveEnergyOnKo: null,
    discardPrizes: false,
    statusAttacker: null,
    millOpponent: null,
    returnSelfToHand: false,
  };
  const dm = t.match(/draw (\d+) cards?/);
  if (dm) out.draw = parseInt(dm[1], 10) || 2;
  const drawUntil = t.match(/draw cards until you have (\d+) cards?/);
  if (drawUntil) out.drawUntil = parseInt(drawUntil[1], 10) || 7;
  const atk = t.match(/put (\d+) damage counters on the attacking pokémon/);
  if (atk) {
    out.damageAttacker = parseInt(atk[1], 10) || 0;
    out.discardTool = /discard this card/.test(t);
  }
  const mv = t.match(/move (\d+) damage counters?/);
  if (mv) out.moveDamage = parseInt(mv[1], 10) || 1;
  const search = t.match(/search your deck for (?:up to (\d+) cards?|a card)/);
  if (search && t.includes('knocked out'))
    out.searchDeckOnKo = search[1] ? parseInt(search[1], 10) : 1;

  // Move/return Energy on Knock Out (Exp. Share, Wishful Baton, Heavy Baton,
  // Energy Pouch, Time Shard, Handheld Fan, Rugged Helmet).
  if (/energy/.test(t) && /(move|put|return)/.test(t)) {
    const countM = t.match(/(?:move|return) (?:up to )?(\d+)/);
    const all = /put all basic energy/.test(t);
    const from =
      /(?:from|attached to) the attacking pokémon/.test(t) ? 'attacker' : 'victim';
    let to = null;
    if (/into your opponent'?s? hand/.test(t)) to = 'opponentHand';
    else if (/to 1 of your opponent'?s? benched pokémon/.test(t)) to = 'opponentBench';
    else if (/to 1 of your benched pokémon|to your benched pokémon/.test(t)) to = 'bench';
    else if (/to the pokémon this card is attached to/.test(t)) to = 'holder';
    else if (/into your hand|to your hand/.test(t)) to = 'hand';
    if (to) {
      out.moveEnergyOnKo = {
        count: all ? 'all' : countM ? parseInt(countM[1], 10) : 1,
        from,
        to,
        basicOnly: /basic energy/.test(t),
      };
    }
  }
  if (/discards any prize cards? they would take/.test(t)) out.discardPrizes = true;
  if (/attacking pokémon is now asleep/.test(t)) out.statusAttacker = 'Asleep';
  if (/discard the top (\d+) cards? of your opponent'?s? deck/.test(t)) {
    const m = t.match(/discard the top (\d+) cards?/);
    out.millOpponent = { deck: parseInt(m[1], 10) || 1, handRandom: 0 };
  }
  if (/discard a random card from your opponent'?s? hand/.test(t)) {
    out.millOpponent = { deck: 0, handRandom: 1 };
  }
  if (/put that pokémon into your hand/.test(t)) out.returnSelfToHand = true;

  const th = parseThorns(tool);
  if (th.count && !out.damageAttacker) out.damageAttacker = th.count;
  if (hasToolOnDamageEffect(out)) return out;
  return null;
}

function hasToolOnDamageEffect(out) {
  return Boolean(
    out.draw ||
      out.drawUntil ||
      out.damageAttacker ||
      out.searchDeckOnKo ||
      out.moveDamage ||
      out.moveEnergyOnKo ||
      out.discardPrizes ||
      out.statusAttacker ||
      out.millOpponent ||
      out.returnSelfToHand
  );
}

// Whether an effect only resolves when the holder is Knocked Out (the on-KO hook
// applies these; the on-damage consumer applies the 'damage' phase).
function isOnKoEffect(parsed) {
  return parsed.phase === 'ko';
}

/**
 * On-Knock-Out tool effects for the victim's side: Tools attached to the Knocked Out
 * Pokémon, plus Tools on the player's other Pokémon whose trigger is "your Active
 * Pokémon is Knocked Out" (Exp. Share / Wishful Baton sit on a Benched Pokémon).
 */
export function attachedToolOnKoEffects(
  victimPlayer,
  victim,
  { blockTools = false, stadium = null, isActive = true, attacker = null } = {}
) {
  if (!victimPlayer || !victim || toolBlocked(blockTools, stadium)) return [];
  const zone = [
    ...(victimPlayer.zones?.active || []),
    ...(victimPlayer.zones?.bench || []),
  ];
  const effects = [];
  for (const holder of zone.filter((c) => !c.attachedTo)) {
    const isVictim = holder.instanceId === victim.instanceId;
    for (const tool of attachedTools(holder, zone)) {
      const parsed = parseToolOnDamageEffect(tool);
      if (!parsed || !isOnKoEffect(parsed)) continue;
      if (parsed.requiresActive && !isActive) continue;
      if (parsed.trigger === 'selfKo' && !isVictim) continue;
      if (parsed.trigger === 'activeKo' && !isActive) continue;
      if (!reactiveToolConditionMet(tool, holder, zone, attacker)) continue;
      effects.push({ tool, holder, isVictim, ...parsed });
    }
  }
  return effects;
}

// The Tool's printed holder/attacker condition (I151): Punk Helmet {D}, Box of Disaster full-HP V,
// Heavy Baton Retreat 4, Farewell Bell VMAX, Adversity Policy Weakness.
function reactiveToolConditionMet(tool, holder, zoneCards, attacker) {
  const zone = zoneCards || [];
  const ctx = { holder: holderView(holder, zone), attacker, zoneCards: zone };
  const cond = parseToolCondition(tool);
  if (!attacker && cond && (cond.attackerTypes || cond.attackerSubtypes || cond.holderWeakToAttacker)) return true;
  return toolConditionMet(cond, ctx);
}

/** Reactive Tools on `defender` for one trigger phase ('damage' by default, or 'ko'). */
export function attachedToolOnDamageEffects(
  defender,
  zoneCards,
  { blockTools = false, stadium = null, isActive = true, phase = 'damage', attacker = null } = {}
) {
  if (toolBlocked(blockTools, stadium) || !defender) return [];
  const effects = [];
  for (const tool of attachedTools(defender, zoneCards)) {
    const parsed = parseToolOnDamageEffect(tool);
    if (!parsed || parsed.phase !== phase) continue;
    if (parsed.requiresActive && !isActive) continue;
    if (!reactiveToolConditionMet(tool, defender, zoneCards, attacker)) continue;
    effects.push({ tool, ...parsed });
  }
  return effects;
}
