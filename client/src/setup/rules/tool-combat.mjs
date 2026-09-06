// Pokémon Tool combat hooks — contextual application of parsed tool text during
// attacks, retreat, KO, and on-damage triggers. Pure + DOM-free where possible;
// execution callbacks are passed in from chat-buttons.js.

import {
  attachedTools,
  parseDamagePrevention,
  parseDamageReduction,
  parseDamageBonus,
  parseHpBonus,
  applyHpBonus,
  parseRetreatCostModifier,
  applyRetreatCostModifier,
  parsePrizeModify,
  parseKoPrevention,
  parseThorns,
  mergeDamagePrevention,
  applyDamagePrevention,
} from './ability-executors.mjs';
import { isExCard, isGxCard, isMegaCard } from './ko-flow.mjs';
import { stadiumBlocksToolEffects } from './stadium-effects.mjs';

const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

const textOf = (card) =>
  lower(card?.ability?.text ?? card?.abilityText ?? card?.text ?? card?.effect ?? '');

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

export function cardHasRuleBox(card) {
  if (!card) return false;
  return isExCard(card) || isGxCard(card) || isMegaCard(card);
}

export function attackerTypes(attacker) {
  return (attacker?.types || []).map((t) => String(t).toLowerCase());
}

function toolBlocked(blockTools) {
  return blockTools || stadiumBlocksToolEffects();
}

function preventionForTool(tool, attacker) {
  const t = textOf(tool);
  const base = parseDamagePrevention(tool);
  if (base.preventAll && /pokémon ex/.test(t)) {
    return isExCard(attacker) ? base : { preventAll: false, reduce: 0 };
  }
  if (base.preventAll && /pokémon v/.test(t)) {
    const subs = (attacker?.subtypes || []).map((s) => String(s).toLowerCase());
    const isV = subs.includes('v') || subs.includes('vstar') || subs.includes('vmax');
    return isV ? base : { preventAll: false, reduce: 0 };
  }
  return base;
}

function reductionForTool(tool, attacker) {
  const t = textOf(tool);
  const red = parseDamageReduction(tool).reduce;
  if (!red) return 0;
  const sym = t.match(/opponent's \{([a-z])\}/);
  if (sym) {
    const need = TYPE_LETTER[sym[1].toLowerCase()];
    if (need && !attackerTypes(attacker).includes(need)) return 0;
  }
  if (/non-\{d\}/.test(t)) {
    if (attackerTypes(attacker).includes('darkness')) return 0;
  }
  if (/have an ability/.test(t) && !(attacker?.ability?.text || attacker?.abilityText)) {
    return 0;
  }
  if (/\{g\}|\{r\}|\{w\}|\{l\}/.test(t)) {
    const letters = [...t.matchAll(/\{([a-z])\}/g)].map((m) => TYPE_LETTER[m[1].toLowerCase()]).filter(Boolean);
    if (letters.length && !letters.some((ty) => attackerTypes(attacker).includes(ty))) return 0;
  }
  return red;
}

function bonusForTool(tool, { defender, defenderIsActive, attacker, defenderPoisoned = false }) {
  const t = textOf(tool);
  const bonus = parseDamageBonus(tool).bonus;
  if (!bonus) return 0;
  if (/active pokémon ex/.test(t) && !isExCard(defender)) return 0;
  if (/active pokémon ex/.test(t) && !defenderIsActive) return 0;
  if (/doesn'?t have a rule box|do not have a rule box/.test(t) && cardHasRuleBox(attacker)) return 0;
  if (/poisoned pokémon/.test(t) && !defenderPoisoned) return 0;
  if (/hop's pokémon/.test(t) && !/hop's/i.test(defender?.name || '')) return 0;
  if (/pikachu ex/.test(t) && !/pikachu ex/i.test(attacker?.name || '')) return 0;
  if (/tera pokémon/.test(t)) {
    const subs = (attacker?.subtypes || []).map((s) => String(s).toLowerCase());
    if (!subs.includes('tera')) return 0;
  }
  return bonus;
}

/** Defender-side prevention from Pokémon + attached Tools. */
export function combinedToolDamagePrevention(defender, zoneCards, attacker, { blockTools = false } = {}) {
  let out = parseDamagePrevention(defender);
  if (toolBlocked(blockTools)) return out;
  for (const tool of attachedTools(defender, zoneCards)) {
    out = mergeDamagePrevention(out, preventionForTool(tool, attacker));
  }
  return out;
}

/** Apply typed/tool damage reduction after prevention. */
export function applyToolDamageReduction(incoming, defender, zoneCards, attacker, { blockTools = false } = {}) {
  let total = incoming;
  if (toolBlocked(blockTools)) return total;
  for (const tool of attachedTools(defender, zoneCards)) {
    const red = reductionForTool(tool, attacker);
    if (red > 0) total = Math.max(0, total - red);
  }
  return total;
}

/** Attacker-side damage bonus from attached Tools. */
export function combinedToolAttackBonus(
  attacker,
  zoneCards,
  defender,
  { blockTools = false, defenderIsActive = true, defenderPoisoned = false } = {}
) {
  let bonus = 0;
  if (toolBlocked(blockTools)) return bonus;
  for (const tool of attachedTools(attacker, zoneCards)) {
    bonus += bonusForTool(tool, { defender, defenderIsActive, attacker, defenderPoisoned });
  }
  return bonus;
}

/** HP bonus from attached Tools (stadium bonus applied separately). */
export function combinedToolHpBonus(pokemon, zoneCards, { blockTools = false } = {}) {
  let bonus = 0;
  if (toolBlocked(blockTools)) return bonus;
  for (const tool of attachedTools(pokemon, zoneCards)) {
    bonus += parseHpBonus(tool).bonus || 0;
  }
  return bonus;
}

/** Retreat cost delta from Pokémon + attached Tools. */
export function combinedToolRetreatCost(baseRetreat, pokemon, zoneCards, { blockTools = false } = {}) {
  let cost = baseRetreat || 0;
  const mod = parseRetreatCostModifier(pokemon);
  cost = applyRetreatCostModifier(cost, mod?.delta || 0);
  if (toolBlocked(blockTools)) return cost;
  for (const tool of attachedTools(pokemon, zoneCards)) {
    const tmod = parseRetreatCostModifier(tool);
    cost = applyRetreatCostModifier(cost, tmod?.delta || 0);
    const t = textOf(tool);
    if (/remaining hp is 30 or less/.test(t) && pokemon?.image?.damageCounter) {
      const dmg = parseInt(pokemon.image.damageCounter.textContent || '0', 10) || 0;
      const hp = pokemon.hp || 0;
      if (hp > 0 && hp - dmg * 10 <= 30) cost = 0;
    }
  }
  return cost;
}

/**
 * If a Tool prevents this KO, return adjusted total damage (in counters).
 * `currentDamage` / `incomingDamage` are damage-counter units (10 HP each).
 */
export function evaluateToolKoPrevention(
  defender,
  zoneCards,
  { currentDamage = 0, incomingDamage = 0, baseHp = 0, blockTools = false } = {}
) {
  if (toolBlocked(blockTools) || !defender) return { prevented: false, totalDamage: currentDamage + incomingDamage };
  const totalAfter = currentDamage + incomingDamage;
  const hpCounters = Math.ceil((baseHp || 0) / 10);
  for (const tool of attachedTools(defender, zoneCards)) {
    const ko = parseKoPrevention(tool);
    if (!ko.fullHpOnly && ko.surviveHp == null) continue;
    if (ko.fullHpOnly && currentDamage > 0) continue;
    if (totalAfter < hpCounters) continue;
    const surviveHp = ko.surviveHp ?? 10;
    const surviveCounters = Math.ceil(surviveHp / 10);
    const maxDamageCounters = Math.max(0, hpCounters - surviveCounters);
    return { prevented: true, totalDamage: maxDamageCounters, tool: tool.name, surviveHp };
  }
  return { prevented: false, totalDamage: totalAfter };
}

/** Adjust prize count when defender is KO'd (e.g. Lillie's Pearl). */
export function toolPrizeCountAdjust(defender, zoneCards, baseCount, { blockTools = false } = {}) {
  let count = baseCount;
  if (toolBlocked(blockTools) || !defender) return count;
  for (const tool of attachedTools(defender, zoneCards)) {
    const delta = parsePrizeModify(tool).delta;
    if (delta) count = Math.max(0, count + delta);
  }
  return count;
}

/** Parse reactive tool effects when the host is damaged by an attack. */
export function parseToolOnDamageEffect(tool) {
  const t = textOf(tool);
  if (!t.includes('damaged by an attack') && !t.includes('knocked out by damage')) {
    return null;
  }
  const out = { draw: 0, damageAttacker: 0, searchDeckOnKo: 0, moveDamage: 0, discardTool: false, requiresActive: /active spot/.test(t) };
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
  if (search && t.includes('knocked out')) out.searchDeckOnKo = parseInt(search[1], 10) || 1;
  const th = parseThorns(tool);
  if (th.count && !out.damageAttacker) out.damageAttacker = th.count;
  if (out.draw || out.damageAttacker || out.searchDeckOnKo || out.moveDamage) return out;
  return null;
}

export function attachedToolOnDamageEffects(defender, zoneCards, { blockTools = false, isActive = true } = {}) {
  if (toolBlocked(blockTools) || !defender) return [];
  const effects = [];
  for (const tool of attachedTools(defender, zoneCards)) {
    const parsed = parseToolOnDamageEffect(tool);
    if (!parsed) continue;
    if (parsed.requiresActive && !isActive) continue;
    effects.push({ tool, ...parsed });
  }
  return effects;
}
