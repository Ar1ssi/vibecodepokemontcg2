#!/usr/bin/env node
/**
 * False-positive backlog audit: classified-but-unexecuted families and
 * flat-with-effect-text classifier misses. Builds on attack-audit.mjs output.
 *
 * Usage:
 *   node attack-false-positive-audit.mjs [--json] [--sets=me01,sv08]
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyAttackEffect } from './shared/engine/rules/attack-effects.mjs';
import { EXECUTED_ATTACK_FAMILIES, PARTIAL_ATTACK_FAMILIES } from './scripts/lib/executed-families.mjs';

function main() {
  const jsonOut = process.argv.includes('--json');
  const setsArg = process.argv.find((a) => a.startsWith('--sets='));
  const args = ['attack-audit.mjs', '--json'];
  if (setsArg) args.push(setsArg);

  const proc = spawnSync('node', args, {
    // fileURLToPath, not .pathname: on Windows the pathname is '/C:/…' and spawnSync fails (I114).
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    console.error(proc.error?.message || proc.stderr || proc.stdout);
    process.exit(proc.status || 1);
  }

  const base = JSON.parse(proc.stdout);
  const rows = [];
  for (const [family, count] of Object.entries(base.familyCounts || {})) {
    if (family === 'unknown' || family === 'flat') continue;
    const bucket = EXECUTED_ATTACK_FAMILIES.has(family)
      ? 'executed'
      : PARTIAL_ATTACK_FAMILIES.has(family)
        ? 'partial'
        : 'unexecuted';
    rows.push({ family, count, bucket });
  }

  const unexecuted = rows.filter((r) => r.bucket === 'unexecuted');
  const partial = rows.filter((r) => r.bucket === 'partial');
  const flatGroups = base.flatWithEffectTextGroups || [];

  const report = {
    meta: base.meta,
    classifyCoverage: base.classifyCoverage,
    flatWithEffectText: {
      total: (base.issueCounts || {})['flat-with-effect-text'] ?? 0,
      topGroups: flatGroups.slice(0, 40),
    },
    familyBacklog: {
      unexecuted: unexecuted.sort((a, b) => b.count - a.count),
      partial: partial.sort((a, b) => b.count - a.count),
      unexecutedAttackCount: unexecuted.reduce((s, r) => s + r.count, 0),
    },
    unknownExamples: base.unknownExamples || [],
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('=== Attack False-Positive Backlog ===\n');
  console.log(`Total attacks: ${report.meta.totalAttackEntries}`);
  console.log(`Flat-with-effect-text: ${report.flatWithEffectText.total}`);
  console.log(
    `Classified-but-unexecuted (family count sum): ${report.familyBacklog.unexecutedAttackCount}\n`
  );

  console.log('Unexecuted families:');
  for (const r of report.familyBacklog.unexecuted) {
    console.log(`  ${r.family}: ${r.count}`);
  }
  console.log('\nPartial families:');
  for (const r of report.familyBacklog.partial) {
    console.log(`  ${r.family}: ${r.count}`);
  }

  if (flatGroups.length) {
    console.log(`\nTop flat-with-effect-text patterns (${flatGroups.length} groups shown):`);
    for (const g of flatGroups.slice(0, 15)) {
      console.log(`\n(${g.cards.length} cards) ${g.sampleText.replace(/\n/g, ' ').slice(0, 160)}`);
      console.log(`  → re-classify: ${classifyAttackEffect({ damage: 30, text: g.sampleText })}`);
    }
  }
}

main();
