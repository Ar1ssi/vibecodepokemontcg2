#!/usr/bin/env node
/**
 * Audit Ancient-Trait parse coverage over out/pkmn-ancient-trait-cards.json
 * (pkmncards `has:ancient-trait`, scraped with
 *  `node scripts/scrape-pkmncards.mjs --query="has:ancient-trait" --out=...`).
 *
 * For every Ancient-Trait entry it runs the real parser (`parseAbility` on
 * `name + text`, so the printed marker is seen) and checks that the entry is
 * recognized AND tagged with its trait (App. 23 / D72). Writes
 * out/ancient-trait-full-audit.txt and exits non-zero when any entry is
 * unrecognized, so it can gate a batch.
 *
 * Buckets:
 *   guided       parses to at least one actionable (non-passive) step
 *   passive      parses to continuous / passive steps only
 *   unrecognized no trait marker, no steps, or the passive fallback for a body
 *                longer than 30 chars
 *
 * Run: node scripts/audit-all-ancient-traits.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseAbility, ancientTraitIn } from '../shared/engine/rules/abilities.mjs';
import { PASSIVE_ABILITY_STEP_TYPES } from '../shared/engine/rules/ability-step-plan.mjs';
import { splitCard } from './lib/split-card-text.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(__dirname, '..', 'out', 'pkmn-ancient-trait-cards.json');
const REPORT = path.join(__dirname, '..', 'out', 'ancient-trait-full-audit.txt');

if (!fs.existsSync(CORPUS)) {
  throw new Error(
    `Corpus not found: ${CORPUS}\nRun: node scripts/scrape-pkmncards.mjs --query="has:ancient-trait" --out=out/pkmn-ancient-trait-cards.json`
  );
}

const cards = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
if (!Array.isArray(cards) || cards.length === 0) {
  throw new Error(`Corpus is empty or malformed: ${CORPUS}`);
}

const TRAIT_HEADER = /^ancient trait$/i;

/** One unique Ancient-Trait entry (name + body), with the cards that print it. */
const entries = new Map();
for (const card of cards) {
  const { items, unparsed } = splitCard(card);
  if (unparsed.length) {
    process.stderr.write(`  flag: ${card.name} has ${unparsed.length} unattributed line(s)\n`);
  }
  for (const entry of items) {
    if (entry.kind !== 'ability' || !TRAIT_HEADER.test(entry.abilityType)) continue;
    const key = `${entry.name}\u0000${entry.text}`;
    if (!entries.has(key)) {
      entries.set(key, { name: entry.name, text: entry.text, cards: [] });
    }
    entries.get(key).cards.push(`${card.name} [${card.set} #${card.number}]`);
  }
}

const buckets = { guided: [], passive: [], unrecognized: [] };

for (const entry of entries.values()) {
  const combined = `${entry.name} ${entry.text}`.trim();
  const trait = ancientTraitIn(combined);
  let steps = [];
  let thrown = null;
  try {
    steps = parseAbility(combined);
  } catch (e) {
    thrown = e.message;
  }

  const onlyFallback =
    steps.length === 1 && steps[0].type === 'passiveAbility' && entry.text.length > 30;
  const everyTagged = steps.length > 0 && steps.every((s) => s.trait === trait);

  let bucket;
  if (thrown || !trait || steps.length === 0 || onlyFallback || !everyTagged) {
    bucket = 'unrecognized';
  } else if (steps.some((s) => !PASSIVE_ABILITY_STEP_TYPES.has(s.type))) {
    bucket = 'guided';
  } else {
    bucket = 'passive';
  }
  buckets[bucket].push({ ...entry, trait, steps, thrown });
}

const countBy = (get) => {
  const m = new Map();
  for (const e of entries.values()) m.set(get(e), (m.get(get(e)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

// trait name -> { printings, kinds } across the unique entries.
const traits = new Map();
for (const e of entries.values()) {
  const trait = ancientTraitIn(`${e.name} ${e.text}`) || 'none';
  if (!traits.has(e.name)) traits.set(e.name, { printings: 0, kind: trait, sample: e });
  traits.get(e.name).printings += e.cards.length;
}
const kindCounts = countBy((e) => ancientTraitIn(`${e.name} ${e.text}`) || 'none');

const lines = [];
const out = (s = '') => lines.push(s);
out('# Ancient-trait parse coverage');
out(`Source: out/pkmn-ancient-trait-cards.json (${cards.length} printings)`);
out(`Entries: ${entries.size} unique Ancient-Trait entries (${traits.size} distinct traits)`);
out(`Trait kinds: ${kindCounts.map(([k, v]) => `${k} ${v}`).join(' / ')}`);
out();
out(
  `guided ${buckets.guided.length} / passive ${buckets.passive.length} / unrecognized ${buckets.unrecognized.length}`
);

out();
out('## By trait');
for (const [name, { printings, kind, sample }] of traits) {
  const steps = parseAbility(`${sample.name} ${sample.text}`.trim());
  out(
    `- ${name} (${kind}) x${printings} printings: ${steps
      .map((s) => s.type + (s.trait ? `[${s.trait}]` : ''))
      .join(', ')}`
  );
}

out();
out('## Unrecognized');
if (!buckets.unrecognized.length) out('(none)');
for (const e of buckets.unrecognized) {
  out(`- ${e.name} [trait=${e.trait}] steps=${e.steps.map((s) => s.type).join(',') || 'none'}`);
  if (e.thrown) out(`    throw: ${e.thrown}`);
  out(`    text: ${e.text}`);
}

out();
out('## Per-card description');
for (const { printings, kind, sample } of traits.values()) {
  out(`### ${sample.name} (${kind}) — ${printings} printing${printings !== 1 ? 's' : ''}`);
  out(`  ${sample.cards.slice(0, 3).join(' · ')}${sample.cards.length > 3 ? ` · +${sample.cards.length - 3}` : ''}`);
  for (const step of parseAbility(`${sample.name} ${sample.text}`.trim())) {
    out(`  - [${step.type}] ${step.guidance || ''}`);
  }
}

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, lines.join('\n'), 'utf8');

process.stderr.write(
  `ancient-traits: guided ${buckets.guided.length} / passive ${buckets.passive.length} / unrecognized ${buckets.unrecognized.length}\n`
);
process.stderr.write(`Report -> ${REPORT}\n`);
if (buckets.unrecognized.length) {
  process.stderr.write('Unrecognized:\n');
  for (const e of buckets.unrecognized) process.stderr.write(`  ${e.name} [trait=${e.trait}]\n`);
  process.exit(1);
}
