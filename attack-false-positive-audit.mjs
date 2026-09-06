#!/usr/bin/env node
/**
 * Deep audit: find attack false positives like Call for Family (placeholder stub
 * text blocks real effects, or classified effects have no live execution).
 *
 * Usage: node attack-false-positive-audit.mjs [--json] [--sets=me01,sv08]
 */
import { getLegalSetRegistry, fetchSetCards } from './client/src/setup/deck-builder/core/set-browser.mjs';
import { classifyAttackEffect, ATTACK_FAMILIES } from './client/src/setup/rules/attack-effects.mjs';
import {
  parseAttackDamage,
  parseAttackSearchClause,
  drawCount,
  attachEnergyCount,
  switchClause,
  shuffleDrawClause,
  oncePerTurnClause,
  allBenchDamage,
  discardCost,
  healTarget,
} from './client/src/setup/rules/damage-parser.mjs';

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
const detailCache = new Map();

// Mirror rules-state.mjs — stub board cards often carry damage as `text`.
function isPlaceholderAttackText(text, damage) {
  if (text == null || text === '') return true;
  const t = String(text).trim();
  if (!t) return true;
  if (/^\d+\+?$/.test(t)) return true;
  if (/^\d+\s*[×x]\s*$/i.test(t)) return true;
  if (/^[—–-]+$/.test(t)) return true;
  if (damage != null && String(damage) === t) return true;
  return false;
}

// Families with *some* live execution path in chat-buttons.js (Sep 2026).
const EXECUTED_FAMILIES = new Set([
  'flat',
  'per-energy',
  'per-prize',
  'per-turn',
  'multi-target',
  'extra-by-type',
  'conditional-damage',
  'bench-damage',
  'discard-cost',
  'shuffle-cost',
  'status-asleep',
  'status-paralyzed',
  'status-poisoned',
  'status-burned',
  'status-confused',
  'dual-status',
  'self-status',
  'coin-flip',
  'per-heads-coin',
  'heal',
  'draw-attach',
  'search-deck',
  'switch',
  'once-per-turn',
  'self-damage',
]);

const NO_EXECUTION_FAMILIES = ATTACK_FAMILIES.filter((f) => !EXECUTED_FAMILIES.has(f));

function parseDamage(raw) {
  if (raw == null || raw === '') return 0;
  const m = String(raw).trim().match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
}

function tcgAttackToSim(detail) {
  return (detail.attacks || []).map((a) => ({
    name: a.name || '',
    cost: a.cost || [],
    damage: parseDamage(a.damage),
    text: a.effect || a.text || '',
  }));
}

function stubAttack(attack, mode) {
  const base = {
    name: attack.name,
    cost: attack.cost || [],
    damage: attack.damage,
  };
  if (mode === 'empty') return { ...base, text: '' };
  if (mode === 'damage-as-text') {
    const d = attack.damage;
    return { ...base, text: d != null && d !== '' ? String(d) : '' };
  }
  return attack;
}

function effectSignals(text) {
  const t = String(text || '');
  return {
    search: !!parseAttackSearchClause(t),
    draw: drawCount(t) > 0,
    attach: attachEnergyCount(t) > 0,
    switch: switchClause(t),
    shuffleHand: shuffleDrawClause(t).draw > 0,
    oncePerTurn: oncePerTurnClause(t),
    allBench: allBenchDamage(t) > 0,
    discardCost: discardCost(t).energy > 0 || discardCost(t).hand > 0,
    healTarget: healTarget(t),
    parsedHeal: (parseAttackDamage({ text: t, damage: 0 }).heal || 0) > 0,
    parsedBench: (parseAttackDamage({ text: t, damage: 0 }).bench || 0) > 0,
  };
}

function hasActionableSignal(signals) {
  return (
    signals.search ||
    signals.draw ||
    signals.attach ||
    signals.switch ||
    signals.shuffleHand ||
    signals.oncePerTurn ||
    signals.allBench ||
    signals.discardCost ||
    signals.parsedHeal ||
    signals.parsedBench
  );
}

async function fetchCardDetail(id) {
  if (detailCache.has(id)) return detailCache.get(id);
  const res = await fetch(`${TCGDEX_BASE}/cards/${id}`);
  if (!res.ok) throw new Error(`Failed ${id}: ${res.status}`);
  const detail = await res.json();
  detailCache.set(id, detail);
  return detail;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSetFilter(argv) {
  const setsArg = argv.find((a) => a.startsWith('--sets='));
  if (!setsArg) return null;
  return setsArg
    .slice('--sets='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function groupRows(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (!m.has(key)) {
      m.set(key, { key, sample: r, cards: [] });
    }
    m.get(key).cards.push(`${r.name} (${r.setName}) — ${r.attackName}`);
  }
  return [...m.values()].sort((a, b) => b.cards.length - a.cards.length);
}

async function main() {
  const jsonOut = process.argv.includes('--json');
  const setFilter = parseSetFilter(process.argv.slice(2));

  let registry = getLegalSetRegistry().filter((e) => (e.category || 'standard') !== 'other');
  if (setFilter?.length) {
    registry = registry.filter((e) => setFilter.includes(e.setId));
  }

  process.stderr.write(
    `False-positive audit: ${registry.length} set(s)...\n`
  );

  const allCards = [];
  for (const entry of registry) {
    process.stderr.write(`  ${entry.setId}...\n`);
    try {
      const cards = await fetchSetCards(entry.setId);
      allCards.push(...cards.map((c) => ({ ...c, setId: entry.setId, setName: entry.name || entry.setId })));
    } catch (err) {
      process.stderr.write(`  WARN ${entry.setId}: ${err.message}\n`);
    }
    await sleep(60);
  }

  const rows = [];
  let fetchErrors = 0;

  for (let i = 0; i < allCards.length; i++) {
    const stub = allCards[i];
    if (i > 0 && i % 120 === 0) {
      process.stderr.write(`  detail ${i}/${allCards.length}\n`);
      await sleep(120);
    }
    try {
      const detail = await fetchCardDetail(stub.id);
      if (detail.category !== 'Pokemon') continue;
      for (const attack of tcgAttackToSim(detail)) {
        const realText = attack.text;
        if (!realText || isPlaceholderAttackText(realText, attack.damage)) continue;

        const family = classifyAttackEffect(attack);
        const realSignals = effectSignals(realText);
        const stubDamageText = stubAttack(attack, 'damage-as-text');
        const stubEmpty = stubAttack(attack, 'empty');

        const stubDamageSignals = effectSignals(stubDamageText.text);
        const stubEmptySignals = effectSignals('');

        const placeholderWouldBreak =
          hasActionableSignal(realSignals) &&
          (!hasActionableSignal(stubDamageSignals) || !hasActionableSignal(stubEmptySignals));

        const zeroDamageEffectOnly =
          (attack.damage === 0 || attack.damage == null) &&
          hasActionableSignal(realSignals);

        const noExecutionFamily = NO_EXECUTION_FAMILIES.includes(family);

        const misclassifyOnStub =
          family !== 'flat' &&
          family !== 'unknown' &&
          classifyAttackEffect(stubDamageText) !== family;

        if (
          placeholderWouldBreak ||
          zeroDamageEffectOnly ||
          noExecutionFamily ||
          misclassifyOnStub
        ) {
          rows.push({
            id: detail.id,
            name: detail.name,
            setName: stub.setName,
            attackName: attack.name,
            damage: attack.damage,
            family,
            realText: realText.slice(0, 220),
            realSignals,
            stubDamageText: stubDamageText.text,
            placeholderWouldBreak,
            zeroDamageEffectOnly,
            noExecutionFamily,
            misclassifyOnStub,
            stubFamily: classifyAttackEffect(stubDamageText),
          });
        }
      }
    } catch {
      fetchErrors++;
    }
  }

  const placeholderBreaks = rows.filter((r) => r.placeholderWouldBreak);
  const zeroDmgEffects = rows.filter((r) => r.zeroDamageEffectOnly);
  const noExec = rows.filter((r) => r.noExecutionFamily);
  const misclass = rows.filter((r) => r.misclassifyOnStub);

  const report = {
    meta: {
      sets: registry.length,
      cardsListed: allCards.length,
      flaggedAttacks: rows.length,
      fetchErrors,
      noExecutionFamilies: NO_EXECUTION_FAMILIES,
    },
    counts: {
      placeholderWouldBreak: placeholderBreaks.length,
      zeroDamageEffectOnly: zeroDmgEffects.length,
      classifiedButNotExecuted: noExec.length,
      misclassifyOnStubText: misclass.length,
    },
    placeholderBreakGroups: groupRows(placeholderBreaks, (r) => {
      const bits = [];
      if (r.realSignals.search) bits.push('search');
      if (r.realSignals.draw) bits.push('draw');
      if (r.realSignals.switch) bits.push('switch');
      if (r.realSignals.attach) bits.push('attach');
      if (r.realSignals.shuffleHand) bits.push('shuffle-hand');
      return `${bits.join('+') || r.family}|${r.realText.slice(0, 100)}`;
    }).slice(0, 40),
    zeroDamageEffectGroups: groupRows(zeroDmgEffects, (r) => r.family + '|' + r.realText.slice(0, 100)).slice(0, 30),
    noExecutionGroups: groupRows(noExec, (r) => r.family + '|' + r.realText.slice(0, 100)).slice(0, 30),
    misclassGroups: groupRows(misclass, (r) => `${r.family}->${r.stubFamily}|${r.realText.slice(0, 80)}`).slice(0, 20),
    // Actionable search-deck rotation list (0 dmg, would break on stub)
    searchDeckZeroDamage: placeholderBreaks
      .filter((r) => r.realSignals.search)
      .map((r) => ({
        card: r.name,
        set: r.setName,
        attack: r.attackName,
        text: r.realText,
      })),
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('=== Attack False-Positive Audit (Standard 2026-27) ===\n');
  console.log(`Flagged attacks: ${rows.length} (${fetchErrors} fetch errors)\n`);
  console.log('Counts:');
  for (const [k, v] of Object.entries(report.counts)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`\nFamilies classified but NOT executed live: ${NO_EXECUTION_FAMILIES.join(', ')}\n`);

  if (report.placeholderBreakGroups.length) {
    console.log(`--- PLACEHOLDER STUB WOULD SILENCE EFFECT (${placeholderBreaks.length}) ---`);
    for (const g of report.placeholderBreakGroups.slice(0, 15)) {
      const r = g.sample;
      console.log(`\n[${r.family}] "${r.attackName}" (${g.cards.length} cards)`);
      console.log(`  Real: ${r.realText.replace(/\n/g, ' ').slice(0, 180)}`);
      console.log(`  Stub text would be: "${r.stubDamageText}"`);
      const sig = Object.entries(r.realSignals)
        .filter(([, v]) => v && v !== 'attacker')
        .map(([k]) => k);
      console.log(`  Lost signals: ${sig.join(', ') || 'see family'}`);
      for (const c of g.cards.slice(0, 4)) console.log(`  • ${c}`);
      if (g.cards.length > 4) console.log(`  … +${g.cards.length - 4}`);
    }
  }

  if (report.noExecutionGroups.length) {
    console.log(`\n--- CLASSIFIED BUT NO LIVE EXECUTION (${noExec.length}) ---`);
    for (const g of report.noExecutionGroups.slice(0, 12)) {
      const r = g.sample;
      console.log(`\n[${r.family}] (${g.cards.length}) ${r.realText.replace(/\n/g, ' ').slice(0, 160)}`);
    }
  }

  if (report.zeroDamageEffectGroups.length) {
    console.log(`\n--- ZERO-DAMAGE EFFECT-ONLY ATTACKS (${zeroDmgEffects.length}) ---`);
    const byFam = {};
    for (const r of zeroDmgEffects) {
      byFam[r.family] = (byFam[r.family] || 0) + 1;
    }
    console.log('  By family:', JSON.stringify(byFam));
  }

  console.log(`\nSearch-deck 0-damage attacks at risk if stubbed: ${report.searchDeckZeroDamage.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
