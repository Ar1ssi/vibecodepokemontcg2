#!/usr/bin/env node
/**
 * Audit Standard-legal Stadium cards against stadium-effects.mjs parsers.
 * Run: node scripts/audit-stadiums.mjs
 */
import {
  classifyStadiumEffect,
  applyStadiumEffect,
  parseStadiumSetupDraw,
  parseStadiumOncePerTurn,
  parseStadiumDamagePrevention,
  isStadiumRetreatPrevention,
  isStadiumHandProtect,
  parseStadiumCostModifier,
  parseStadiumHpModifier,
  parseStadiumEvolutionSpeed,
  parseStadiumRetreatModifier,
  parseStadiumBenchDamageOnPlay,
  parseStadiumAttackDamageBonus,
  isStadiumStatusImmunity,
  isStadiumConfusedPersist,
  parseStadiumBenchLimit,
  isStadiumToolNegation,
  isStadiumAbilityNegation,
  parseStadiumCheckupPoisonBonus,
  parseStadiumAttackCostIncrease,
  parseStadiumDamageReduction,
} from '../client/src/setup/rules/stadium-effects.mjs';

const BASE = 'https://api.tcgdex.net/v2/en';

function cardText(card) {
  return card.effect || card.text || card.cardText || '';
}

function toSimCard(tcgdex) {
  return {
    name: tcgdex.name,
    type: 'Stadium',
    subtypes: ['Stadium'],
    text: cardText(tcgdex),
    regulationMark: tcgdex.regulationMark,
    id: tcgdex.id,
  };
}

function executionStatus(card, family, applied) {
  const t = card.text.toLowerCase();
  const passive = {
    damagePrevention: parseStadiumDamagePrevention(card),
    damageReduction: parseStadiumDamageReduction(card),
    retreatPrevention: isStadiumRetreatPrevention(card),
    handProtect: isStadiumHandProtect(card),
    costModifier: parseStadiumCostModifier(card),
    hpModifier: parseStadiumHpModifier(card),
    evolutionSpeed: parseStadiumEvolutionSpeed(card),
    retreatModifier: parseStadiumRetreatModifier(card),
    benchDamage: parseStadiumBenchDamageOnPlay(card),
    attackBonus: parseStadiumAttackDamageBonus(card),
    statusImmunity: isStadiumStatusImmunity(card),
    confusedPersist: isStadiumConfusedPersist(card),
    benchLimit: parseStadiumBenchLimit(card),
    toolNegation: isStadiumToolNegation(card),
    abilityNegation: isStadiumAbilityNegation(card),
    checkupPoison: parseStadiumCheckupPoisonBonus(card),
    costIncrease: parseStadiumAttackCostIncrease(card),
  };

  const hasPassive =
    passive.damagePrevention !== null ||
    passive.damageReduction > 0 ||
    passive.retreatPrevention ||
    passive.handProtect ||
    passive.costModifier > 0 ||
    passive.hpModifier !== 0 ||
    passive.evolutionSpeed.relaxTurnGate ||
    passive.evolutionSpeed.costReduce > 0 ||
    passive.retreatModifier !== 0 ||
    passive.benchDamage !== null ||
    passive.attackBonus > 0 ||
    passive.statusImmunity ||
    passive.confusedPersist ||
    passive.benchLimit !== null ||
    passive.toolNegation ||
    passive.abilityNegation ||
    passive.checkupPoison > 0 ||
    passive.costIncrease > 0;

  const setupDraw = parseStadiumSetupDraw(card);
  const oncePerTurn = parseStadiumOncePerTurn(card);

  if (family === 'unknown' || family === 'none') {
    if (hasPassive) return 'passive-parsed-but-unknown-family';
    if (/when you play/.test(t)) return 'setup-unparsed';
    if (/once per turn|once during/.test(t)) return 'active-unparsed';
    return 'announce-only';
  }

  if (family === 'setup-once') {
    if (setupDraw) return 'active-setup-draw';
    return 'setup-announce-only';
  }

  if (family === 'once-per-turn') {
    if (!oncePerTurn) return 'active-unparsed';
    if (oncePerTurn.kind === 'energy') return 'active-energy-guidance-only';
    if (oncePerTurn.kind === 'search-evolve') return 'active-search-evolve-guided';
    return `active-${oncePerTurn.kind}`;
  }

  if (family === 'continuous-both' || family === 'opponent-affected') {
    if (hasPassive || applied.results.length > 0) return 'passive-wired';
    return 'continuous-unparsed';
  }

  return 'other';
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function main() {
  const list = await fetchJson(`${BASE}/cards?trainerType=Stadium`);
  console.error(`Fetching details for ${list.length} stadium cards…`);

  const cards = [];
  const batchSize = 20;
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    const details = await Promise.all(
      batch.map((c) => fetchJson(`${BASE}/cards/${c.id}`).catch(() => null))
    );
    for (const d of details) {
      if (!d) continue;
      if (d.legal?.standard !== true) continue;
      cards.push(toSimCard(d));
    }
    process.stderr.write(`  ${Math.min(i + batchSize, list.length)}/${list.length}\r`);
  }
  console.error(`\nStandard-legal stadiums: ${cards.length}`);

  const byStatus = new Map();
  const byFamily = new Map();
  const gaps = [];

  for (const card of cards) {
    const family = classifyStadiumEffect(card);
    const applied = applyStadiumEffect(card);
    const status = executionStatus(card, family, applied);

    byStatus.set(status, (byStatus.get(status) || 0) + 1);
    byFamily.set(family, (byFamily.get(family) || 0) + 1);

    const isGap =
      status.includes('unparsed') ||
      status.includes('unknown-family') ||
      status === 'announce-only' ||
      status === 'setup-announce-only' ||
      status === 'continuous-unparsed' ||
      status === 'active-energy-guidance-only';

    if (isGap) {
      gaps.push({ id: card.id, name: card.name, reg: card.regulationMark, family, status, text: card.text.slice(0, 120) });
    }
  }

  console.log('\n=== By family ===');
  for (const [k, v] of [...byFamily.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  console.log('\n=== By execution status ===');
  for (const [k, v] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  console.log(`\n=== Gaps (${gaps.length}) ===`);
  for (const g of gaps.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`\n[${g.reg}] ${g.name} (${g.id})`);
    console.log(`  family=${g.family} status=${g.status}`);
    console.log(`  ${g.text}${g.text.length >= 120 ? '…' : ''}`);
  }

  console.log('\n=== Working (sample) ===');
  const working = [];
  for (const card of cards) {
    const family = classifyStadiumEffect(card);
    const applied = applyStadiumEffect(card);
    const status = executionStatus(card, family, applied);
    if (!status.includes('unparsed') && status !== 'announce-only' && status !== 'setup-announce-only') {
      working.push({ name: card.name, reg: card.regulationMark, family, status, text: card.text.slice(0, 100) });
    }
  }
  for (const w of working.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`\n[${w.reg}] ${w.name} — ${w.status}`);
    console.log(`  ${w.text}${w.text.length >= 100 ? '…' : ''}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
