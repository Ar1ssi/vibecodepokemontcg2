#!/usr/bin/env node
/**
 * Audit parseTrainerEffect() against every Supporter, Item, and Pokémon Tool
 * in the Standard 2026–27 rotation (LEGAL_SET_REGISTRY, category !== 'other').
 *
 * Usage: node trainer-rotation-audit.mjs [--json]
 */

import { getLegalSetRegistry } from './client/src/setup/deck-builder/core/set-browser.mjs';
import { parseTrainerEffect } from './client/src/setup/rules/trainer-effects.mjs';

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
const TARGET_TYPES = new Set(['Supporter', 'Item', 'Tool']);
const CONCURRENCY = 8;

const AUTO_STEP_TYPES = new Set([
  'discardHandThenDraw',
  'shuffleHandThenDraw',
  'countShuffleDrawPlus',
  'draw',
  'drawUntil',
  'variableDraw',
  'opponentDraw',
  'ionoShuffle',
  'opponentShuffleHandDraw',
  'millSelf',
]);

const GUIDED_STEP_TYPES = new Set(['searchDeck', 'discardCost', 'coinFlip']);

const RECOGNIZED_ANNOUNCE_ONLY = new Set([
  'lookAtTop',
  'lookAtBottom',
  'switchOwn',
  'switchOpponent',
  'recursion',
  'heal',
  'healAmount',
  'attachFromDiscard',
  'attachMultipleFromDiscard',
  'evolveStage2',
  'moveEnergy',
  'moveEnergyToActive',
  'devolve',
  'discardTools',
  'discardFromOpponent',
  'discardToolAndSpecialEnergy',
  'switchOpponentOut',
  'shuffleFromDiscard',
  'applyStatus',
  'fossilItem',
  'returnPokemonToHand',
  'swapWithDiscard',
  'massDiscardAttached',
  'reshufflePrizes',
  'revealOpponentDeckBench',
  'revealOpponentHandDiscard',
  'opponentHandBottom',
  'opponentDiscardUntil',
  'eachPlayerDiscardUntil',
  'opponentCountShuffleDraw',
  'discardEnergyFromOpponent',
  'damageCounters',
  'opponentPrizeHandSwap',
  'putHandOnBottom',
  'passive',
]);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function mapPool(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function classifyOutcome(parsed) {
  if (!parsed.recognizable) return 'unrecognizable';
  const types = parsed.steps.map((s) => s.type);
  if (types.length === 0) return 'unrecognizable';
  if (types.some((t) => AUTO_STEP_TYPES.has(t))) return 'auto';
  if (types.some((t) => GUIDED_STEP_TYPES.has(t))) return 'guided';
  if (types.every((t) => RECOGNIZED_ANNOUNCE_ONLY.has(t))) return 'announce-only';
  return 'mixed';
}

function stepSummary(steps) {
  return steps.map((s) => s.type).join(' + ') || '(none)';
}

async function fetchSetTrainers(setId) {
  const summaries = await fetchJson(
    `${TCGDEX_BASE}/cards?category=Trainer&set.id=${encodeURIComponent(setId)}`
  );
  const filtered = (summaries || []).filter((c) => c?.id && c?.name);
  const details = await mapPool(filtered, CONCURRENCY, async (summary) => {
    try {
      const card = await fetchJson(`${TCGDEX_BASE}/cards/${summary.id}`);
      return card;
    } catch (err) {
      return { id: summary.id, name: summary.name, _fetchError: String(err.message || err) };
    }
  });
  return details.filter((c) => TARGET_TYPES.has(c.trainerType));
}

async function main() {
  const jsonOut = process.argv.includes('--json');
  const sets = getLegalSetRegistry().filter((s) => (s.category || 'standard') !== 'other');

  const allCards = [];
  for (const entry of sets) {
    const cards = await fetchSetTrainers(entry.setId);
    for (const card of cards) {
      allCards.push({
        setId: entry.setId,
        setName: entry.name || entry.setId,
        ...card,
      });
    }
    process.stderr.write(`  ${entry.setId}: ${cards.length} trainers\n`);
  }

  const byId = new Map();
  for (const card of allCards) {
    if (!byId.has(card.id)) byId.set(card.id, card);
  }
  const unique = [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const rows = unique.map((card) => {
    const text = card.effect || '';
    const parsed = parseTrainerEffect(text);
    const outcome = classifyOutcome(parsed);
    return {
      id: card.id,
      name: card.name,
      setId: card.setId,
      setName: card.setName,
      trainerType: card.trainerType,
      regulationMark: card.regulationMark || '',
      legalStandard: card.legal?.standard ?? null,
      effect: text,
      recognizable: parsed.recognizable,
      steps: parsed.steps,
      stepSummary: stepSummary(parsed.steps),
      outcome,
      fetchError: card._fetchError || null,
      missingEffect: !String(text).trim(),
    };
  });

  const stats = {
    totalSets: sets.length,
    totalCards: rows.length,
    byType: {},
    byOutcome: {},
    missingEffect: rows.filter((r) => r.missingEffect).length,
    fetchErrors: rows.filter((r) => r.fetchError).length,
    unrecognizable: rows.filter((r) => r.outcome === 'unrecognizable' && !r.missingEffect),
    notStandardLegal: rows.filter((r) => r.legalStandard === false).length,
  };

  for (const row of rows) {
    stats.byType[row.trainerType] = (stats.byType[row.trainerType] || 0) + 1;
    stats.byOutcome[row.outcome] = (stats.byOutcome[row.outcome] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    rotation: 'Standard 2026-27 (LEGAL_SET_REGISTRY, excluding category=other)',
    stats,
    unrecognizable: stats.unrecognizable.map(({ id, name, setId, trainerType, effect, regulationMark }) => ({
      id,
      name,
      setId,
      trainerType,
      regulationMark,
      effect,
    })),
    missingEffect: rows
      .filter((r) => r.missingEffect)
      .map(({ id, name, setId, trainerType }) => ({ id, name, setId, trainerType })),
    announceOnlyByStep: {},
  };

  for (const row of rows.filter((r) => r.outcome === 'announce-only' || r.outcome === 'mixed')) {
    const key = row.stepSummary;
    if (!report.announceOnlyByStep[key]) report.announceOnlyByStep[key] = [];
    report.announceOnlyByStep[key].push({
      id: row.id,
      name: row.name,
      trainerType: row.trainerType,
      setId: row.setId,
    });
  }

  if (jsonOut) {
    console.log(JSON.stringify({ stats, rows, unrecognizable: report.unrecognizable }, null, 2));
    return;
  }

  console.log('=== Standard 2026-27 Trainer Effect Audit ===\n');
  console.log(`Sets scanned: ${stats.totalSets}`);
  console.log(`Unique Supporter/Item/Tool cards: ${stats.totalCards}`);
  console.log(`  Supporter: ${stats.byType.Supporter || 0}`);
  console.log(`  Item: ${stats.byType.Item || 0}`);
  console.log(`  Tool: ${stats.byType.Tool || 0}`);
  console.log('');
  console.log('Parser coverage:');
  for (const [k, v] of Object.entries(stats.byOutcome).sort()) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('');
  console.log(`Missing effect text: ${stats.missingEffect}`);
  console.log(`Fetch errors: ${stats.fetchErrors}`);
  console.log(`TCGdex legal.standard=false (in rotation sets): ${stats.notStandardLegal}`);
  console.log('');

  if (report.unrecognizable.length) {
    console.log(`--- UNRECOGNIZABLE (${report.unrecognizable.length}) ---`);
    for (const c of report.unrecognizable) {
      console.log(`\n[${c.trainerType}] ${c.name} (${c.id}, ${c.setId}, mark ${c.regulationMark || '?'})`);
      console.log(`  ${c.effect.replace(/\n/g, ' ')}`);
    }
    console.log('');
  } else {
    console.log('No unrecognizable cards (all parsed successfully).\n');
  }

  if (report.missingEffect.length) {
    console.log(`--- MISSING EFFECT TEXT (${report.missingEffect.length}) ---`);
    for (const c of report.missingEffect) {
      console.log(`  [${c.trainerType}] ${c.name} (${c.id}, ${c.setId})`);
    }
    console.log('');
  }

  console.log('--- ANNOUNCE-ONLY GROUPS (recognized, not auto/guided) ---');
  const groups = Object.entries(report.announceOnlyByStep).sort((a, b) => b[1].length - a[1].length);
  for (const [step, cards] of groups) {
    console.log(`\n${step} (${cards.length} cards)`);
    for (const c of cards.slice(0, 8)) {
      console.log(`  • ${c.name} (${c.id})`);
    }
    if (cards.length > 8) console.log(`  … +${cards.length - 8} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
