#!/usr/bin/env node
// Reword drift: rewrites every corpus effect text the way a custom-set edit would (another
// count, another type, "one of" for "1 of", singular for plural) and reports each text whose
// parsed structure moves. A supported effect should survive such an edit; a text listed here
// is matched by a branch that names one exact wording.
//
//   node scripts/reword-drift.mjs <trainer|energy|attack|ability> <numbers|types|oneOf|singular|plural> [limit] [filterRegex]
//
// Numbers, types and `upTo` are folded before comparing, so only a lost, gained or changed
// step counts. `singular` and `plural` produce some ungrammatical texts: read their rows, do
// not gate on their totals. Coin clauses with one outcome per heads move by design.
import fs from 'node:fs';
import { parseTrainerEffect } from '../shared/engine/rules/trainer-effects.mjs';
import { parseSpecialEnergyEffects } from '../shared/engine/rules/special-energy-parse.mjs';
import { parseAttackSteps } from '../shared/engine/rules/attack-steps.mjs';
import { parseAttackDamage } from '../shared/engine/rules/damage-parser.mjs';
import { parseAttackCondition } from '../shared/engine/rules/attack-conditions.mjs';
import { parseAbility } from '../shared/engine/rules/abilities.mjs';
import { resolveAbilitySteps } from '../shared/engine/effects/ability.mjs';
import { splitCard } from './lib/split-card-text.mjs';

const [family, mutation, limitArg, filterArg] = process.argv.slice(2);
const limit = Number(limitArg || 40);
const filter = filterArg ? new RegExp(filterArg, 'i') : null;
const read = (f) => JSON.parse(fs.readFileSync(new URL(`../out/${f}`, import.meta.url), 'utf8'));

const bump = (n) => (n >= 10 && n % 10 === 0 ? n + 10 : n + 1);
const ROT = { G: 'R', R: 'W', W: 'L', L: 'P', P: 'F', F: 'D', D: 'M', M: 'G' };
const MUTATIONS = {
  // every number of 2 or more moves; "1" stays (singular grammar)
  numbers: (t) => t.replace(/(?<![\w{]|stage )(\d+)(?![\w}])/gi, (digits) => (Number(digits) >= 2 ? String(bump(Number(digits))) : digits)),
  types: (t) => t.replace(/\{([GRWLPFDM])\}/g, (m, s) => `{${ROT[s]}}`),
  oneOf: (t) => t.replace(/\b1 of (your|their|his or her)\b/g, 'one of $1'),
  singular: (t) =>
    t
      .replace(/\bup to \d+ ([^,.]*?)cards\b/g, 'a $1card')
      .replace(/\bup to \d+ ((?:basic |evolution |stage [12] )?(?:\{[A-Z]\} )?pokémon)\b/gi, 'a $1')
      .replace(/\breveal them\b/g, 'reveal it')
      .replace(/\bput them\b/g, 'put it')
      .replace(/\battach them\b/g, 'attach it'),
  plural: (t) =>
    t
      .replace(/\bdraw a card\b/gi, (m) => `${m[0]}raw 2 cards`)
      .replace(/\b1 damage counter\b(?!s)/g, '2 damage counters')
      .replace(/\b(discard|attach) an? ((?:basic )?(?:\{[A-Z]\} )?energy)(?: card)?\b/gi, '$1 2 $2 cards'),
};

const TYPE_WORD = /\b(grass|fire|water|lightning|psychic|fighting|darkness|dark|metal)\b/g;
const COSMETIC = new Set(['guidance', 'label', 'description', 'prompt', 'text', 'desc', 'summary', 'note', 'notes', 'raw', 'source', 'upTo', 'clause', 'sentence']);
function shape(value) {
  let json;
  try {
    json = JSON.stringify(value, (k, v) => (COSMETIC.has(k) ? undefined : v)) ?? 'undefined';
  } catch (e) {
    json = `UNSERIALIZABLE ${e.message}`;
  }
  return json
    .toLowerCase()
    .replace(/\{[grwlpfdm]\}/g, 'T')
    .replace(TYPE_WORD, 'T')
    .replace(/"[grwlpfdm]"/g, '"T"')
    .replace(/\d+/g, '#');
}
const safe = (fn) => (t) => {
  try {
    return shape(fn(t));
  } catch (e) {
    return `THROW ${e.message}`;
  }
};

const FAMILIES = {
  trainer: () => ({
    rows: read('pkmn-trainer-cards.json').map((c) => ({ name: c.name, text: c.text })),
    parsers: () => ({ steps: safe((t) => parseTrainerEffect(t)) }),
  }),
  energy: () => ({
    rows: read('pkmn-special-energy-cards.json').map((c) => ({ name: c.name, text: c.text })),
    parsers: (row) => ({
      steps: safe((t) => parseSpecialEnergyEffects({ name: row.name, text: t, supertype: 'Energy', subtypes: ['Special'] }).steps),
    }),
  }),
  attack: () => ({
    rows: read('pkmn-pokemon-cards.json').flatMap((card) =>
      splitCard(card).items.filter((i) => i.kind === 'attack' && i.text).map((i) => ({ name: `${card.name} / ${i.name}`, text: i.text, self: card.name, damageText: i.damageText || '' }))
    ),
    parsers: (row) => ({
      steps: safe((t) => parseAttackSteps(t, { selfName: row.self })),
      damage: safe((t) => {
        const r = parseAttackDamage({ damage: row.damageText, text: t }, {}, {}, {});
        return [r.components, r.notes];
      }),
      condition: safe((t) => parseAttackCondition(t, { selfName: row.self })),
    }),
  }),
  ability: () => ({
    rows: read('pkmn-pokemon-cards.json').flatMap((card) =>
      splitCard(card).items.filter((i) => i.kind === 'ability' && i.text).map((i) => ({ name: `${card.name} / ${i.name}`, text: i.text, self: card.name }))
    ),
    parsers: (row) => ({
      parse: safe((t) => parseAbility(t)),
      plan: safe((t) => resolveAbilitySteps(t, { selfName: row.self }).steps),
    }),
  }),
};

if (!FAMILIES[family] || !MUTATIONS[mutation]) {
  console.error(`usage: node scripts/reword-drift.mjs <${Object.keys(FAMILIES).join('|')}> <${Object.keys(MUTATIONS).join('|')}> [limit] [filterRegex]`);
  process.exit(2);
}
const { rows, parsers } = FAMILIES[family]();
const mutate = MUTATIONS[mutation];
const seen = new Set();
let total = 0;
let mutated = 0;
const drifts = [];
for (const row of rows) {
  const text = String(row.text || '');
  if (!text || seen.has(text)) continue;
  seen.add(text);
  total += 1;
  const reworded = mutate(text);
  if (reworded === text) continue;
  mutated += 1;
  const moved = [];
  for (const [label, parse] of Object.entries(parsers(row))) {
    const before = parse(text);
    const after = parse(reworded);
    if (before !== after) moved.push({ label, before, after });
  }
  if (moved.length) drifts.push({ row, reworded, moved });
}
console.log(`${family}/${mutation}: unique texts ${total}, reworded ${mutated}, structure moved ${drifts.length}`);
const shown = drifts.filter((d) => !filter || filter.test(d.row.text));
for (const d of shown.slice(0, limit)) {
  console.log(`\n# ${d.row.name}\n  was: ${d.row.text.replace(/\n/g, ' / ').slice(0, 300)}\n  now: ${d.reworded.replace(/\n/g, ' / ').slice(0, 300)}`);
  for (const m of d.moved) console.log(`  [${m.label}]\n    - ${m.before.slice(0, 330)}\n    + ${m.after.slice(0, 330)}`);
}
