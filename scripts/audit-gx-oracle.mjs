#!/usr/bin/env node
/**
 * GX-scoped execution oracle: every printed attack and ability of every Pokémon-GX in
 * out/pkmn-gx-cards.json runs through the engine via scripts/lib/oracle-harness.mjs — the same
 * board/seeds/state-diff oracle as scripts/audit-oracle.mjs — and each entry is reported as
 * executed / no-effect / engine-error. Per-family rates ratchet against
 * scripts/gx-oracle-baseline.json (--update-baseline rewrites it, like audit-oracle).
 *
 * Corpus:
 *   node scripts/scrape-pkmncards.mjs
 *     --url="https://pkmncards.com/?s=is%3Agx&sort=date&ord=auto&display=text"
 *     --out=out/pkmn-gx-cards.json
 * Run: node scripts/audit-gx-oracle.mjs [--update-baseline]
 * Writes: out/gx-oracle-audit.txt, out/gx-oracle-rows.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { oracleCorpus, DEFAULT_SEEDS } from './lib/oracle-harness.mjs';
import { familyRates, checkGate, rowObserved } from './lib/oracle-gate.mjs';
import {
  EXECUTED_ATTACK_FAMILIES,
  EXECUTED_ABILITY_FAMILIES,
  ORACLE_BLIND_FAMILIES,
} from './lib/executed-families.mjs';
import { isGxAttack } from '../shared/engine/rules/damage-parser.mjs';
import { PASSIVE_ABILITY_STEP_TYPES } from '../shared/engine/rules/ability-step-plan.mjs';
import { splitCard } from './lib/split-card-text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = path.join(ROOT, 'out/pkmn-gx-cards.json');
const BASELINE = path.join(ROOT, 'scripts/gx-oracle-baseline.json');
const GLOBAL_BASELINE = path.join(ROOT, 'scripts/oracle-baseline.json');
const REPORT = path.join(ROOT, 'out/gx-oracle-audit.txt');
const ROWS_OUT = path.join(ROOT, 'out/gx-oracle-rows.json');

if (!fs.existsSync(CORPUS)) {
  throw new Error(
    `Corpus not found: ${CORPUS}\nRun: node scripts/scrape-pkmncards.mjs --url="https://pkmncards.com/?s=is%3Agx&sort=date&ord=auto&display=text" --out=out/pkmn-gx-cards.json`
  );
}
const corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
if (!Array.isArray(corpus) || corpus.length === 0) {
  throw new Error(`Corpus is empty or malformed: ${CORPUS}`);
}

const split = corpus.map((card) => ({ card, ...splitCard(card) }));
const emptyCards = split.filter((c) => c.items.length === 0);
const unparsedCards = split.filter((c) => c.unparsed.length);

const started = Date.now();
const rows = oracleCorpus(corpus);
const rates = familyRates(rows);
const globalFamilies = fs.existsSync(GLOBAL_BASELINE)
  ? JSON.parse(fs.readFileSync(GLOBAL_BASELINE, 'utf8')).families
  : {};

// A family that never shows an effect in this subset alone is not a regression when the full
// corpus oracle still observes it — the state diff just cannot see it on GX cards (markers,
// passive modifiers). Those become warnings (checkGate `blind`), not failures.
const blind = new Map(ORACLE_BLIND_FAMILIES);
for (const [key, r] of Object.entries(rates)) {
  if (r.observed > 0) continue;
  const g = globalFamilies[key];
  if (g && g.observed > 0) {
    blind.set(key, `0/${r.n} in the GX corpus; full-corpus oracle observes ${g.observed}/${g.n}`);
  }
}

const familyKey = (row) => `${row.kind}:${row.family}`;
// An ability whose parsed steps are all passive (readers, markers) never changes state on
// activation, so the one-shot oracle cannot see it whatever its family.
const allPassiveSteps = (row) =>
  row.kind === 'ability' &&
  row.stepTypes?.length > 0 &&
  row.stepTypes.every((t) => PASSIVE_ABILITY_STEP_TYPES.has(t));
const result = (row) =>
  row.errors.length
    ? 'engine-error'
    : rowObserved(row)
      ? 'executed'
      : blind.has(familyKey(row))
        ? 'blind'
        : allPassiveSteps(row)
          ? 'passive'
          : 'no-effect';

const gxAttacks = rows.filter((r) => r.kind === 'attack' && isGxAttack(r.name));
const counts = {
  attacks: rows.filter((r) => r.kind === 'attack').length,
  abilities: rows.filter((r) => r.kind === 'ability').length,
  gxAttacks: gxAttacks.length,
  executed: rows.filter((r) => result(r) === 'executed').length,
  blind: rows.filter((r) => result(r) === 'blind').length,
  passive: rows.filter((r) => result(r) === 'passive').length,
  noEffect: rows.filter((r) => result(r) === 'no-effect').length,
  engineErrors: rows.filter((r) => result(r) === 'engine-error').length,
  gxAttacksExecuted: gxAttacks.filter((r) => result(r) === 'executed').length,
};

const lines = [];
const out = (s = '') => lines.push(s);
out('# Pokémon-GX oracle audit');
out(`Source: out/pkmn-gx-cards.json (${corpus.length} printings, ${new Set(corpus.map((c) => c.name)).size} unique card names)`);
out(`Oracle: scripts/lib/oracle-harness.mjs, seeds ${DEFAULT_SEEDS.join(',')}; observed = rowObserved (oracle-gate.mjs)`);
out('blind = family whose state change the oracle cannot see on these cards (marker/passive families); not a failure');
out();
out(
  `Entries: ${rows.length} — ${counts.attacks} attacks (${counts.gxAttacks} GX) / ${counts.abilities} abilities`
);
out(
  `executed ${counts.executed} / blind ${counts.blind} / passive ${counts.passive} / no-effect ${counts.noEffect} / engine-error ${counts.engineErrors}`
);
out(
  `GX attacks: executed ${counts.gxAttacksExecuted}/${counts.gxAttacks}, blind ${gxAttacks.filter((r) => result(r) === 'blind').length}, no-effect ${gxAttacks.filter((r) => result(r) === 'no-effect').length}, engine-error ${gxAttacks.filter((r) => result(r) === 'engine-error').length}`
);
out(`Run: ${((Date.now() - started) / 1000).toFixed(0)}s`);
out();

out('## By family');
for (const [key, r] of Object.entries(rates).sort((a, b) => b[1].n - a[1].n)) {
  const pct = r.n ? ((100 * r.observed) / r.n).toFixed(0) : '0';
  out(`- ${key}: ${r.observed}/${r.n} (${pct}%)`);
}

out();
out(`## Engine errors (${counts.engineErrors})`);
if (!counts.engineErrors) out('(none)');
for (const r of rows.filter((r) => result(r) === 'engine-error')) {
  out(`- [${r.kind}] ${r.card} [${r.set} #${r.number}] ${r.name}: ${r.errors.join(' | ')}`);
}

out();
out(`## Oracle-blind families in this corpus (${blind.size})`);
for (const [key, why] of [...blind.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  out(`- ${key}: ${why}`);
}

out();
out(`## Passive ability rows (${counts.passive} — expected invisible to a one-shot oracle)`);
const passiveByFamily = {};
for (const r of rows.filter((r) => result(r) === 'passive')) {
  passiveByFamily[r.family] = (passiveByFamily[r.family] || 0) + 1;
}
for (const [family, n] of Object.entries(passiveByFamily).sort((a, b) => b[1] - a[1])) {
  out(`- ${family}: ${n}`);
}

out();
out(`## No observed effect (${counts.noEffect})`);
for (const r of rows.filter((r) => result(r) === 'no-effect')) {
  out(
    `- [${r.kind}]${r.kind === 'attack' && isGxAttack(r.name) ? ' [GX]' : ''} ${r.card} [${r.set} #${r.number}] ${r.name} (${r.family})`
  );
}

out();
out(`## Cards with no parsed attack/ability (${emptyCards.length})`);
for (const { card } of emptyCards) out(`- ${card.name} [${card.set} #${card.number}]`);

out();
out(`## Unattributed lines (${unparsedCards.length} cards)`);
for (const { card, unparsed } of unparsedCards) {
  out(`- ${card.name} [${card.set} #${card.number}]`);
  for (const line of unparsed) out(`    ? ${line}`);
}

out();
out('## Per-entry results');
const sortedRows = [...rows].sort(
  (a, b) =>
    a.card.localeCompare(b.card) ||
    a.set.localeCompare(b.set) ||
    a.kind.localeCompare(b.kind) ||
    a.name.localeCompare(b.name)
);
for (const r of sortedRows) {
  const tags = r.tags?.length ? ` {${r.tags.join(',')}}` : '';
  const steps = r.kind === 'ability' && r.stepTypes?.length ? ` [${r.stepTypes.join(',')}]` : '';
  const delta = (r.deltas || []).some((d) => d > 0) ? ` Δ${Math.max(...r.deltas)}` : '';
  out(
    `- [${r.kind}]${r.kind === 'attack' && isGxAttack(r.name) ? ' [GX]' : ''} ${r.card} [${r.set} #${r.number}] ${r.name} (${r.family}) → ${result(r)}${delta}${steps}${tags}`
  );
}

fs.writeFileSync(REPORT, lines.join('\n'), 'utf8');
fs.writeFileSync(ROWS_OUT, JSON.stringify(rows));

function printTable() {
  for (const [key, r] of Object.entries(rates).sort((a, b) => b[1].n - a[1].n)) {
    const pct = r.n ? ((100 * r.observed) / r.n).toFixed(0) : '0';
    console.log(`${key.padEnd(36)} ${`${r.observed}/${r.n}`.padStart(11)} ${pct.padStart(4)}%`);
  }
}
console.log(
  `gx-oracle: ${corpus.length} printings, ${rows.length} rows (${counts.engineErrors} engine errors) in ${((Date.now() - started) / 1000).toFixed(0)}s\n`
);
printTable();

const update = process.argv.includes('--update-baseline');
if (update) {
  const sorted = Object.fromEntries(
    Object.entries(rates).sort(([a], [b]) => a.localeCompare(b))
  );
  fs.writeFileSync(
    BASELINE,
    JSON.stringify({ corpusRows: rows.length, printings: corpus.length, families: sorted }, null, 2) + '\n'
  );
  console.log(`\nbaseline written: ${BASELINE}`);
}

const baseline = update
  ? rates
  : fs.existsSync(BASELINE)
    ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).families
    : null;
if (!baseline) {
  console.error(`\n${BASELINE} missing — run with --update-baseline to create it.`);
  process.exit(1);
}
const { failures, warnings } = checkGate(rates, baseline, {
  executedAttack: EXECUTED_ATTACK_FAMILIES,
  executedAbility: EXECUTED_ABILITY_FAMILIES,
  blind,
});
for (const w of warnings) console.log(`WARN ${w}`);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(
  `\n${failures.length || counts.engineErrors ? 'FAILED' : 'PASSED'}: ${failures.length} gate failure(s), ${counts.engineErrors} engine error(s), ${warnings.length} warning(s)`
);
console.log(`Report -> ${REPORT}\nRows -> ${ROWS_OUT}`);
if (failures.length || counts.engineErrors) process.exit(1);
