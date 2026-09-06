#!/usr/bin/env node
/**
 * Bulk audit: classify + parse every Pokémon attack in Standard 2026-27 rotation sets.
 * Uses TCGdex attack shape (name/cost/damage/effect) and the same mapper that
 * ensureCardData() applies in rules-state.mjs.
 *
 * Usage: node attack-audit.mjs [--json] [--sets=me01,sv08]
 */
import { getLegalSetRegistry, fetchSetCards } from './client/src/setup/deck-builder/core/set-browser.mjs';
import { classifyAttackEffect, ATTACK_FAMILIES } from './client/src/setup/rules/attack-effects.mjs';
import { parseAttackDamage } from './client/src/setup/rules/damage-parser.mjs';

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
const detailCache = new Map();

function parseDamage(raw) {
  if (raw == null || raw === '') return 0;
  const s = String(raw).trim();
  const m = s.match(/^(\d+)/);
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

function analyzeAttack(card, attack) {
  let family = 'ERR';
  let classifyError = null;
  try {
    family = classifyAttackEffect(attack);
  } catch (e) {
    family = 'THROW';
    classifyError = e.message;
  }

  let parsed = null;
  let parseError = null;
  try {
    parsed = parseAttackDamage(attack);
  } catch (e) {
    parseError = e.message;
  }

  const issues = [];
  const text = String(attack.text || '').trim();
  const hasText = text.length > 0;

  if (classifyError) {
    issues.push({ kind: 'classify-throw', severity: 'high', detail: classifyError });
  }
  if (parseError) {
    issues.push({ kind: 'parse-throw', severity: 'high', detail: parseError });
  }
  if (family === 'unknown' && hasText) {
    issues.push({ kind: 'unknown-family', severity: 'high' });
  }
  if (family === 'unknown' && !hasText && !Number.isFinite(attack.damage)) {
    issues.push({ kind: 'no-attack-data', severity: 'medium' });
  }
  if (family === 'flat' && hasText && text.length > 8) {
    // Effect text present but classifier fell through to flat — possible miss.
    issues.push({ kind: 'flat-with-effect-text', severity: 'medium' });
  }
  if (parsed && hasText && parsed.resolved === false && !parsed.notes?.length) {
    issues.push({ kind: 'unresolved-no-notes', severity: 'low' });
  }

  return { family, classifyError, parsed, parseError, issues };
}

function groupByText(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const key = keyFn(r).slice(0, 140);
    if (!m.has(key)) {
      m.set(key, {
        sampleText: keyFn(r),
        family: r.family,
        attackName: r.attackName,
        cards: [],
      });
    }
    m.get(key).cards.push(`${r.name} (${r.setName})`);
  }
  return [...m.values()].sort((a, b) => b.cards.length - a.cards.length);
}

async function main() {
  const jsonOut = process.argv.includes('--json');
  const setFilter = parseSetFilter(process.argv.slice(2));

  let registry = getLegalSetRegistry().filter((e) => (e.category || 'standard') !== 'other');
  if (setFilter?.length) {
    registry = registry.filter((e) => setFilter.includes(e.setId));
    if (registry.length === 0) {
      throw new Error(`No matching sets for filter: ${setFilter.join(', ')}`);
    }
  }

  process.stderr.write(
    `Auditing attacks in ${registry.length} Standard 2026-27 set${registry.length === 1 ? '' : 's'}${setFilter ? ` (${setFilter.join(', ')})` : ''}...\n`
  );

  const allCards = [];
  for (const entry of registry) {
    process.stderr.write(`  Fetching ${entry.setId} (${entry.name || entry.setId})...\n`);
    try {
      const cards = await fetchSetCards(entry.setId);
      allCards.push(...cards.map((c) => ({ ...c, setId: entry.setId, setName: entry.name || entry.setId })));
    } catch (err) {
      process.stderr.write(`  WARN: ${entry.setId}: ${err.message}\n`);
    }
    await sleep(80);
  }

  process.stderr.write(`\n${allCards.length} cards listed. Fetching attack details...\n`);

  const attackRows = [];
  let fetchErrors = 0;

  for (let i = 0; i < allCards.length; i++) {
    const stub = allCards[i];
    if (i > 0 && i % 100 === 0) {
      process.stderr.write(`  ${i}/${allCards.length}...\n`);
      await sleep(150);
    }
    try {
      const detail = await fetchCardDetail(stub.id);
      if (detail.category !== 'Pokemon') continue;

      const attacks = tcgAttackToSim(detail);
      if (attacks.length === 0) continue;

      for (const attack of attacks) {
        const analysis = analyzeAttack({ name: detail.name }, attack);
        attackRows.push({
          id: detail.id,
          name: detail.name,
          setId: stub.setId,
          setName: stub.setName,
          attackName: attack.name,
          attackDamage: attack.damage,
          attackText: attack.text,
          ...analysis,
        });
      }
    } catch {
      fetchErrors++;
    }
  }

  const unknownCount = attackRows.filter((r) => r.family === 'unknown').length;
  const flatWithText = attackRows.filter((r) => r.issues.some((i) => i.kind === 'flat-with-effect-text')).length;
  const high = attackRows.filter((r) => r.issues.some((i) => i.severity === 'high'));

  process.stderr.write(
    `\n${attackRows.length} attacks on ${new Set(attackRows.map((r) => r.id)).size} Pokémon ` +
      `(unknown-family ${unknownCount}, flat-with-effect-text ${flatWithText}, ${fetchErrors} fetch errors)\n`
  );

  const byFamily = {};
  const byIssueKind = {};
  for (const r of attackRows) {
    byFamily[r.family] = (byFamily[r.family] ?? 0) + 1;
    for (const issue of r.issues) {
      byIssueKind[issue.kind] = (byIssueKind[issue.kind] ?? 0) + 1;
    }
  }

  const parsedResolved = attackRows.filter((r) => r.parsed?.resolved === true).length;
  const parsedUnresolved = attackRows.filter((r) => r.parsed && r.parsed.resolved === false).length;

  const report = {
    meta: {
      setsAudited: registry.length,
      setFilter: setFilter || null,
      totalCardsScanned: allCards.length,
      pokemonWithAttacks: new Set(attackRows.map((r) => r.id)).size,
      totalAttackEntries: attackRows.length,
      fetchErrors,
      attackFamiliesInClassifier: ATTACK_FAMILIES.length,
    },
    familyCounts: Object.fromEntries(Object.entries(byFamily).sort((a, b) => b[1] - a[1])),
    issueCounts: byIssueKind,
    parseCoverage: {
      resolved: parsedResolved,
      unresolved: parsedUnresolved,
      pctResolved: attackRows.length
        ? Math.round((100 * parsedResolved) / attackRows.length)
        : 0,
      note: 'Unresolved is expected for scaling/coin attacks without runtime ctx',
    },
    classifyCoverage: {
      recognized: attackRows.length - unknownCount,
      unknown: unknownCount,
      pctRecognized: attackRows.length
        ? Math.round((100 * (attackRows.length - unknownCount)) / attackRows.length)
        : 0,
    },
    highSeverityGroups: groupByText(high, (r) => r.attackText).slice(0, 40),
    flatWithEffectTextGroups: groupByText(
      attackRows.filter((r) => r.issues.some((i) => i.kind === 'flat-with-effect-text')),
      (r) => r.attackText
    ).slice(0, 30),
    unknownExamples: attackRows
      .filter((r) => r.family === 'unknown')
      .slice(0, 50)
      .map((r) => ({
        name: r.name,
        set: r.setName,
        attackName: r.attackName,
        text: r.attackText,
      })),
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('=== Standard 2026-27 Pokémon Attack Audit ===\n');
  console.log(`Sets scanned: ${report.meta.setsAudited}`);
  console.log(`Pokémon with attacks: ${report.meta.pokemonWithAttacks}`);
  console.log(`Total attack entries: ${report.meta.totalAttackEntries}`);
  console.log(`Fetch errors: ${fetchErrors}\n`);

  console.log('Classifier coverage:');
  console.log(
    `  Recognized: ${report.classifyCoverage.recognized} (${report.classifyCoverage.pctRecognized}%)`
  );
  console.log(`  Unknown: ${report.classifyCoverage.unknown}\n`);

  console.log('Damage parser (no runtime ctx):');
  console.log(`  Resolved: ${parsedResolved} (${report.parseCoverage.pctResolved}%)`);
  console.log(`  Unresolved: ${parsedUnresolved}\n`);

  console.log('Family counts:');
  for (const [k, v] of Object.entries(report.familyCounts)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('');

  console.log('Issue counts:');
  for (const [k, v] of Object.entries(report.issueCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('');

  if (report.highSeverityGroups.length) {
    console.log(`--- HIGH SEVERITY (${high.length} attacks, top patterns) ---`);
    for (const g of report.highSeverityGroups.slice(0, 15)) {
      console.log(`\n[${g.family}] "${g.attackName}" (${g.cards.length} cards)`);
      console.log(`  ${g.sampleText.replace(/\n/g, ' ').slice(0, 200)}`);
      for (const c of g.cards.slice(0, 5)) console.log(`  • ${c}`);
      if (g.cards.length > 5) console.log(`  … +${g.cards.length - 5} more`);
    }
    console.log('');
  } else {
    console.log('No high-severity issues.\n');
  }

  if (report.flatWithEffectTextGroups.length) {
    console.log(`--- FLAT WITH EFFECT TEXT (${flatWithText} attacks, top patterns) ---`);
    for (const g of report.flatWithEffectTextGroups.slice(0, 10)) {
      console.log(`\n(${g.cards.length} cards) ${g.sampleText.replace(/\n/g, ' ').slice(0, 180)}`);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
