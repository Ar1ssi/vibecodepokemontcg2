#!/usr/bin/env node
/**
 * Server-behaviour gate for Trainer cards (design 035 slice 12). Classifies every unique
 * Trainer in out/pkmn-trainer-cards.json (scripts/lib/trainer-behaviour.mjs): parse outcome,
 * parsed step kinds with no server executor, and the parsed play condition. Compares with
 * scripts/trainer-behaviour-baseline.json and exits 1 when a baseline card gains a gap or loses
 * its play condition. Runs in a few seconds.
 *
 * Run: pnpm audit:trainers [--update-baseline]
 *   --update-baseline  rewrite the baseline from this run (after a legit change), exit 0
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  classifyCorpus,
  baselineOf,
  gapTally,
  checkTrainerGate,
} from './lib/trainer-behaviour.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = path.join(ROOT, 'out/pkmn-trainer-cards.json');
const BASELINE = path.join(ROOT, 'scripts/trainer-behaviour-baseline.json');

function readJson(file) {
  if (!fs.existsSync(file)) return { error: `${file} missing` };
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: `${file} unreadable: ${e.message}` };
  }
}

function main() {
  const update = process.argv.includes('--update-baseline');
  const corpus = readJson(CORPUS);
  if (corpus.error) {
    console.error(corpus.error);
    return 1;
  }
  const classified = classifyCorpus(corpus.value);
  const tally = gapTally(classified);
  const withCondition = classified.filter((c) => c.playCondition).length;
  console.log(`Unique Trainer cards: ${classified.length} (${corpus.value.length} printings)`);
  console.log(`With a parsed play condition: ${withCondition}`);
  console.log('\nGap tag                                               cards');
  for (const [tag, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`${tag.padEnd(52)} ${String(n).padStart(5)}`);
  }

  if (update) {
    fs.writeFileSync(BASELINE, `${JSON.stringify(baselineOf(classified), null, 1)}\n`, 'utf8');
    console.log(`\nbaseline written: ${BASELINE}`);
    return 0;
  }
  const baseline = readJson(BASELINE);
  if (baseline.error) {
    console.error(`\n${baseline.error} — run with --update-baseline to create it.`);
    return 1;
  }
  const { failures, improvements, added } = checkTrainerGate(classified, baseline.value);
  if (added.length) console.log(`\n${added.length} card(s) not in the baseline (new to the corpus).`);
  if (improvements.length) {
    console.log(`\n${improvements.length} improvement(s) — refresh with --update-baseline:`);
    for (const line of improvements.slice(0, 40)) console.log(`  ${line}`);
  }
  if (failures.length) {
    console.log(`\nFAILED: ${failures.length} regression(s)`);
    for (const line of failures) console.log(`  ${line}`);
    console.log('Legit change (card text edited, step renamed)? Refresh with --update-baseline.');
    return 1;
  }
  console.log('\nPASSED');
  return 0;
}

process.exitCode = main();
