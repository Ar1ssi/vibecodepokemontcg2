#!/usr/bin/env node
/**
 * Attack behaviour gate (design 036 slice 16). Runs every unique effect-text attack in
 * out/pkmn-pokemon-cards.json through the rich-board attack harness and classes it
 * ok / partial / ran-no-effect / engine-error (scripts/lib/attack-behaviour.mjs). Every row is
 * ratcheted against scripts/attack-behaviour-baseline.json, so an attack that stops working (or
 * a new engine error) fails the audit instead of drifting back in silently. Runs in ~2 min.
 *
 * Run: pnpm audit:attacks [--update-baseline] [--rows]
 *   --update-baseline  rewrite the baseline from this run (after a legit change), exit 0
 *   --rows             also write every classed row to out/attack-behaviour-rows.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_SEEDS } from './lib/oracle-harness.mjs';
import {
  ATTACK_CLASSES,
  scanCorpus,
  classCounts,
  totalCounts,
  baselineOf,
  checkAttackGate,
} from './lib/attack-behaviour.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = path.join(ROOT, 'out/pkmn-pokemon-cards.json');
const BASELINE = path.join(ROOT, 'scripts/attack-behaviour-baseline.json');
const ROWS_OUT = path.join(ROOT, 'out/attack-behaviour-rows.json');

function readJson(file) {
  if (!fs.existsSync(file)) return { error: `${file} missing` };
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: `${file} unreadable: ${e.message}` };
  }
}

function printTable(counts) {
  const header = ['family'.padEnd(28), 'n'.padStart(5), ...ATTACK_CLASSES.map((k) => k.padStart(15))];
  console.log(header.join(''));
  const line = (name, c) =>
    console.log(
      [name.padEnd(28), String(c.n).padStart(5), ...ATTACK_CLASSES.map((k) => String(c[k]).padStart(15))].join('')
    );
  for (const [family, c] of Object.entries(counts).sort((a, b) => b[1].n - a[1].n))
    line(family, c);
  line('TOTAL', totalCounts(counts));
}

function main() {
  const update = process.argv.includes('--update-baseline');
  const corpus = readJson(CORPUS);
  if (corpus.error) {
    console.error(`${corpus.error} — the corpus is produced by scripts/scrape-pkmncards.mjs.`);
    return 1;
  }
  const started = Date.now();
  const rows = scanCorpus(corpus.value, {
    seeds: DEFAULT_SEEDS,
    onProgress: (scanned, total, unique) =>
      process.stderr.write(`  ${scanned}/${total} printings, ${unique} unique attacks\n`),
  });
  const counts = classCounts(rows);
  console.log(
    `attack behaviour: ${rows.length} unique effect attacks (${corpus.value.length} printings) in ${(
      (Date.now() - started) / 1000
    ).toFixed(0)}s\n`
  );
  printTable(counts);
  if (process.argv.includes('--rows')) {
    fs.writeFileSync(
      ROWS_OUT,
      JSON.stringify(
        rows.map(({ key, card, set, number, attack, family, verdict, text, dealt, skipped, tags, errors, mismatches, printings }) => ({
          key,
          card,
          set,
          number,
          attack,
          family,
          verdict,
          text,
          dealt,
          skipped,
          tags,
          errors,
          mismatches,
          printings,
        }))
      )
    );
    console.log(`\nrows written: ${ROWS_OUT}`);
  }

  const baselineName = 'out/pkmn-pokemon-cards.json';
  if (update) {
    fs.writeFileSync(
      BASELINE,
      `${JSON.stringify(baselineOf(rows, { seeds: DEFAULT_SEEDS, corpus: baselineName }), null, 1)}\n`,
      'utf8'
    );
    console.log(`\nbaseline written: ${BASELINE}`);
    return 0;
  }
  const baseline = readJson(BASELINE);
  if (baseline.error) {
    console.error(`\n${baseline.error} — run with --update-baseline to create it.`);
    return 1;
  }
  if (
    baseline.value.corpus !== baselineName ||
    JSON.stringify(baseline.value.seeds) !== JSON.stringify(DEFAULT_SEEDS)
  ) {
    console.error(
      `\nbaseline is for ${baseline.value.corpus} seeds ${JSON.stringify(baseline.value.seeds)} — ` +
        `this run is ${baselineName} seeds ${JSON.stringify(DEFAULT_SEEDS)}; refresh with --update-baseline.`
    );
    return 1;
  }
  const { failures, improvements, warnings } = checkAttackGate(rows, baseline.value);
  if (improvements.length) {
    console.log(`\n${improvements.length} improvement(s) — refresh with --update-baseline:`);
    for (const line of improvements.slice(0, 40)) console.log(`  ${line}`);
  }
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const line of warnings.slice(0, 40)) console.log(`  ${line}`);
  }
  if (failures.length) {
    console.log(`\nFAILED: ${failures.length} regression(s)`);
    for (const line of failures) console.log(`  ${line}`);
    console.log('Legit change (card text edited, new wording implemented)? Refresh with --update-baseline.');
    return 1;
  }
  console.log('\nPASSED');
  return 0;
}

process.exitCode = main();
