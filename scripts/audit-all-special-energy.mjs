#!/usr/bin/env node
/**
 * Audit special-energy parse coverage over out/pkmn-special-energy-cards.json.
 *
 * Runs every unique (name + text) card through parseSpecialEnergyEffects() and
 * classifies the outcome, then writes out/special-energy-full-audit.txt.
 *
 * Buckets:
 *   guided      parses to effect steps that imply a player choice / trigger
 *   passive     parses to continuous provision / modifier steps only
 *   unrecognized parser returns no steps, or leaves effect text unparsed
 *
 * Run: node scripts/audit-all-special-energy.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSpecialEnergyEffects, describeSpecialEnergyStep } from '../shared/engine/rules/special-energy-parse.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(__dirname, '..', 'out', 'pkmn-special-energy-cards.json');
const REPORT = path.join(__dirname, '..', 'out', 'special-energy-full-audit.txt');

const cards = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));

const unique = new Map();
for (const c of cards) {
  const key = `${c.name}\u0000${c.text}`;
  if (!unique.has(key)) unique.set(key, c);
}

const PASSIVE_STEP_TYPES = new Set([
  'attachRestriction',
  'attachCost',
  'deckLimit',
  'discardAtEndOfTurn',
  'endOfTurnDamageCounter',
  'discardWhenConditionLost',
  'hpBonus',
  'damageBonus',
  'attackDamagePenalty',
  'damageReduction',
  'noWeakness',
  'ignoresResistance',
  'freeRetreat',
  'retreatReduction',
  'cannotRetreat',
  'statusImmunity',
  'effectShield',
  'abilityShield',
  'benchDamageShield',
  'canUseEvolutionAttacks',
  'ignoredOn',
  'onceAtATime',
  'oncePerGame',
  'noExtraEffect',
  'officialIllegal',
]);

// Steps that a non-provision clause produced but do not require a choice.
const STRUCTURAL_STEP_TYPES = new Set(['provide', 'attachRestriction', 'attachCost', 'deckLimit']);

// A card is only "unrecognized" when its text contains an effect keyword that
// produced no effect step. Restriction/provision-only cards are complete.
const EFFECT_HINT_RE =
  /\+\d+ hp|do \d+ more damage|do \d+ less damage|reduced by \d+|no weakness|no retreat cost|retreat cost is|can't retreat|special condition|prevent all|knocked out|discard .*end of|discarded (from play|by)|draw (a card|\d+)|search your deck|heal \d+|damage counter|switch|fewer prize|face-down prize|previous evolutions|isn't affected by resistance|return a basic energy|put 1 damage counter/i;

const buckets = { guided: [], passive: [], unrecognized: [] };

for (const card of unique.values()) {
  const parsed = parseSpecialEnergyEffects(card);
  const stepTypes = parsed ? parsed.steps.map((s) => s.type) : [];
  const hasProvide = stepTypes.includes('provide');
  const effectSteps = stepTypes.filter((t) => !STRUCTURAL_STEP_TYPES.has(t));
  const hintsEffect = EFFECT_HINT_RE.test(String(card.text));

  if (!parsed || !parsed.steps.length || !hasProvide || (hintsEffect && effectSteps.length === 0)) {
    buckets.unrecognized.push({ card, stepTypes });
  } else if (effectSteps.some((t) => !PASSIVE_STEP_TYPES.has(t))) {
    buckets.guided.push({ card, stepTypes });
  } else {
    buckets.passive.push({ card, stepTypes });
  }
}

const lines = [];
lines.push('# Special-energy parse coverage');
lines.push(`Corpus: ${cards.length} printings → ${unique.size} unique (name+text)`);
lines.push('');
lines.push(
  `guided ${buckets.guided.length} / passive ${buckets.passive.length} / unrecognized ${buckets.unrecognized.length}`
);
lines.push('');

lines.push('## Unrecognized');
for (const { card, stepTypes } of buckets.unrecognized) {
  lines.push(`- ${card.name} [${stepTypes.join(',') || 'none'}]`);
  lines.push(`    text: ${card.text}`);
}

lines.push('');
lines.push('## Guided (effect steps)');
for (const { card, stepTypes } of buckets.guided) {
  lines.push(`- ${card.name}: ${stepTypes.join(', ')}`);
}

lines.push('');
lines.push('## Passive');
for (const { card, stepTypes } of buckets.passive) {
  lines.push(`- ${card.name}: ${stepTypes.join(', ')}`);
}

lines.push('');
lines.push('## Per-card description');
for (const card of unique.values()) {
  const parsed = parseSpecialEnergyEffects(card);
  lines.push(`### ${card.name}`);
  for (const step of parsed.steps) lines.push(`  - ${describeSpecialEnergyStep(step)}`);
}

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, lines.join('\n'), 'utf8');

process.stderr.write(
  `special-energy: guided ${buckets.guided.length} / passive ${buckets.passive.length} / unrecognized ${buckets.unrecognized.length}\n`
);
process.stderr.write(`Report -> ${REPORT}\n`);
if (buckets.unrecognized.length) {
  process.stderr.write('Unrecognized:\n');
  for (const { card, stepTypes } of buckets.unrecognized) {
    process.stderr.write(`  ${card.name} [${stepTypes.join(',') || 'none'}]\n`);
  }
}
