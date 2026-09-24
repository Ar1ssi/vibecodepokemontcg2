#!/usr/bin/env node
/**
 * Ability behaviour gate (design 034 slice 7). Runs every printed ability in
 * out/pkmn-pokemon-cards.json through useAbility (scripts/lib/oracle-harness.mjs), classes each row
 * runs / partial / dead / passive / unparsed (scripts/lib/ability-behaviour.mjs), and ratchets the
 * per-family class shares against scripts/ability-behaviour-baseline.json. Exits 1 when a family's
 * runs share falls or its dead / unparsed share rises.
 *
 * Run: pnpm audit:abilities [--update-baseline] [--rows]
 *   --update-baseline  rewrite the baseline from this run (after a legit change), exit 0
 *   --rows             also write every classed row to out/ability-behaviour-rows.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { oracleCorpus } from './lib/oracle-harness.mjs';
import {
  BEHAVIOUR_CLASSES,
  abilityPlan,
  behaviourClass,
  classCounts,
  totalCounts,
  checkBehaviourGate,
} from './lib/ability-behaviour.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = path.join(ROOT, 'out/pkmn-pokemon-cards.json');
const BASELINE = path.join(ROOT, 'scripts/ability-behaviour-baseline.json');
const ROWS_OUT = path.join(ROOT, 'out/ability-behaviour-rows.json');

function readBaseline() {
  if (!fs.existsSync(BASELINE)) return { error: `${BASELINE} missing` };
  try {
    return { baseline: JSON.parse(fs.readFileSync(BASELINE, 'utf8')).families };
  } catch (e) {
    return { error: `${BASELINE} unreadable: ${e.message}` };
  }
}

function printTable(counts) {
  const header = [
    'family'.padEnd(28),
    'n'.padStart(5),
    ...BEHAVIOUR_CLASSES.map((k) => k.padStart(9)),
  ];
  console.log(header.join(''));
  const line = (name, c) =>
    console.log(
      [
        name.padEnd(28),
        String(c.n).padStart(5),
        ...BEHAVIOUR_CLASSES.map((k) => String(c[k]).padStart(9)),
      ].join('')
    );
  for (const [family, c] of Object.entries(counts).sort(
    (a, b) => b[1].n - a[1].n
  ))
    line(family, c);
  line('TOTAL', totalCounts(counts));
}

function main() {
  const update = process.argv.includes('--update-baseline');
  if (!fs.existsSync(CORPUS)) {
    console.error(
      `${CORPUS} missing — the corpus is produced by scripts/scrape-pkmncards.mjs.`
    );
    process.exit(1);
  }
  const corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
  const started = Date.now();
  const rows = oracleCorpus(corpus, { kinds: ['ability'] }).map((row) => ({
    ...row,
    behaviour: behaviourClass(row),
  }));
  const counts = classCounts(rows);
  console.log(
    `ability behaviour: ${rows.length} rows in ${((Date.now() - started) / 1000).toFixed(0)}s\n`
  );
  printTable(counts);
  if (process.argv.includes('--rows')) {
    const out = rows.map(
      ({ card, set, number, name, family, behaviour, text, tags, errors }) => ({
        card,
        set,
        number,
        name,
        family,
        behaviour,
        unexecutable: abilityPlan(text, card).unexecutable || [],
        tags,
        errors,
      })
    );
    fs.writeFileSync(ROWS_OUT, JSON.stringify(out));
  }

  if (update) {
    const sorted = Object.fromEntries(
      Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
    );
    fs.writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          corpusRows: rows.length,
          totals: totalCounts(counts),
          families: sorted,
        },
        null,
        2
      ) + '\n'
    );
    console.log(`\nbaseline written: ${BASELINE}`);
  }

  const { baseline, error } = update ? { baseline: counts } : readBaseline();
  if (error) {
    console.error(`\n${error} — run with --update-baseline to create it.`);
    process.exit(1);
  }
  const { failures, warnings } = checkBehaviourGate(counts, baseline);
  for (const w of warnings) console.log(`WARN ${w}`);
  for (const f of failures) console.log(`FAIL ${f}`);
  console.log(
    `\n${failures.length ? 'FAILED' : 'PASSED'}: ${failures.length} failure(s), ${warnings.length} warning(s)`
  );
  if (failures.length) process.exit(1);
}

main();
