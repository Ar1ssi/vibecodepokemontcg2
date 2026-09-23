#!/usr/bin/env node
/**
 * Execution gate for Pokémon attacks and abilities (I113). Runs every printed attack / ability in
 * out/pkmn-pokemon-cards.json through the engine (scripts/lib/oracle-harness.mjs), computes per-family
 * observed-execution rates, and compares them with scripts/oracle-baseline.json
 * (scripts/lib/oracle-gate.mjs). Exits 1 when a family regresses or a family listed as executed
 * (scripts/lib/executed-families.mjs) shows no effect at all. Takes ~3 minutes.
 *
 * Run: pnpm audit:oracle [--update-baseline] [--rows]
 *   --update-baseline  rewrite the baseline from this run (after a legit change), exit 0
 *   --rows             also write every row to out/oracle-rows.json for digging
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { oracleCorpus } from './lib/oracle-harness.mjs';
import { familyRates, checkGate } from './lib/oracle-gate.mjs';
import {
  EXECUTED_ATTACK_FAMILIES,
  EXECUTED_ABILITY_FAMILIES,
  ORACLE_BLIND_FAMILIES,
} from './lib/executed-families.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = path.join(ROOT, 'out/pkmn-pokemon-cards.json');
const BASELINE = path.join(ROOT, 'scripts/oracle-baseline.json');
const ROWS_OUT = path.join(ROOT, 'out/oracle-rows.json');

function readBaseline() {
  if (!fs.existsSync(BASELINE)) return { error: `${BASELINE} missing` };
  try {
    return { baseline: JSON.parse(fs.readFileSync(BASELINE, 'utf8')).families };
  } catch (e) {
    return { error: `${BASELINE} unreadable: ${e.message}` };
  }
}

function printTable(rates) {
  const pct = (r) =>
    (r.n ? ((100 * r.observed) / r.n).toFixed(0) : '0').padStart(4) + '%';
  for (const [key, r] of Object.entries(rates).sort(
    (a, b) => b[1].n - a[1].n
  )) {
    console.log(
      `${key.padEnd(36)} ${`${r.observed}/${r.n}`.padStart(11)} ${pct(r)}`
    );
  }
}

function main() {
  const update = process.argv.includes('--update-baseline');
  const corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
  const started = Date.now();
  const rows = oracleCorpus(corpus);
  const rates = familyRates(rows);
  const erroring = rows.filter((r) => r.errors.length).length;
  console.log(
    `oracle: ${rows.length} rows (${erroring} with engine errors) in ${((Date.now() - started) / 1000).toFixed(0)}s\n`
  );
  printTable(rates);
  if (process.argv.includes('--rows'))
    fs.writeFileSync(ROWS_OUT, JSON.stringify(rows));

  if (update) {
    const sorted = Object.fromEntries(
      Object.entries(rates).sort(([a], [b]) => a.localeCompare(b))
    );
    fs.writeFileSync(
      BASELINE,
      JSON.stringify({ corpusRows: rows.length, families: sorted }, null, 2) +
        '\n'
    );
    console.log(`\nbaseline written: ${BASELINE}`);
  }

  const { baseline, error } = update ? { baseline: rates } : readBaseline();
  if (error) {
    console.error(`\n${error} — run with --update-baseline to create it.`);
    process.exit(1);
  }
  const { failures, warnings } = checkGate(rates, baseline, {
    executedAttack: EXECUTED_ATTACK_FAMILIES,
    executedAbility: EXECUTED_ABILITY_FAMILIES,
    blind: ORACLE_BLIND_FAMILIES,
  });
  for (const w of warnings) console.log(`WARN ${w}`);
  for (const f of failures) console.log(`FAIL ${f}`);
  console.log(
    `\n${failures.length ? 'FAILED' : 'PASSED'}: ${failures.length} failure(s), ${warnings.length} warning(s)`
  );
  if (failures.length) process.exit(1);
}

main();
