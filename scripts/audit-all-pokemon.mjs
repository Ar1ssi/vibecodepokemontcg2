#!/usr/bin/env node
/**
 * Full-corpus Pokémon attack + ability audit (source: pkmncards.com, extracted
 * to out/pkmn-pokemon-cards.json by scripts/scrape-pkmncards.mjs).
 *
 * Mirrors scripts/audit-all-stadiums.mjs: it splits each printing's printed text
 * into attack / ability entries, runs the real pure parsers
 * (classifyAttackEffect, parseAttackDamage, parseAbility, classifyAbility), and
 * flags unknown families and plausible-but-wrong mis-parses. Every suspicious
 * entry is then fed through the actual engine via applyCommand
 * ({ type: 'attack' } / { type: 'useAbility' }) to catch execution throws.
 *
 * Run: node scripts/audit-all-pokemon.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyAttackEffect, ATTACK_FAMILIES } from '../shared/engine/rules/attack-effects.mjs';
import { parseAttackDamage } from '../shared/engine/rules/damage-parser.mjs';
import { parseAbility } from '../shared/engine/rules/abilities.mjs';
import { classifyAbility, classifyAbilityFamilies } from '../shared/engine/rules/ability-effects.mjs';
import { createGameState, createPlayerZones } from '../shared/engine/state.mjs';
import { createCard } from '../shared/engine/cards.mjs';
import { createRng } from '../shared/engine/rng.mjs';
import { applyCommand } from '../shared/engine/reduce.mjs';
import { splitCard } from './lib/split-card-text.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'out', 'pkmn-pokemon-cards.json');
const TXT_PATH = path.join(ROOT, 'out', 'pokemon-attacks-abilities-full-audit.txt');
const ROWS_PATH = path.join(ROOT, 'out', 'pokemon-attacks-abilities-audit.json');

function pattern(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\{[a-z]\}/g, '{e}')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

const attackerStub = { name: 'Attacker', hp: 120, types: ['Colorless'] };
const defenderStub = { name: 'Defender', hp: 200, types: ['Colorless'] };
const ATTACK_CTX = {
  energyCount: 2,
  opponentPrizes: 4,
  turnCount: 2,
  attackerHp: 120,
  defenderHp: 200,
  coin: 'heads',
  headsCount: 2,
};

function analyzeAttack(card, attack) {
  const issues = [];
  const text = String(attack.text || '').trim();

  let family = 'ERR';
  let classifyError = null;
  try {
    family = classifyAttackEffect(attack);
  } catch (e) {
    classifyError = e.message;
    issues.push({ kind: 'classify-throw', severity: 'high', detail: e.message });
  }

  let parsed = null;
  let parseError = null;
  try {
    parsed = parseAttackDamage(attack, attackerStub, defenderStub, ATTACK_CTX);
  } catch (e) {
    parseError = e.message;
    issues.push({ kind: 'parse-throw', severity: 'high', detail: e.message });
  }

  if (family === 'unknown' && text.length > 0) {
    issues.push({ kind: 'unknown-family', severity: 'high' });
  }
  if (family === 'flat' && text.length > 8) {
    issues.push({ kind: 'flat-with-effect-text', severity: 'high' });
  }
  if (parsed && parsed.resolved === false && !(parsed.notes || []).length && text.length > 0) {
    issues.push({ kind: 'unresolved-no-notes', severity: 'low' });
  }

  return { family, parsed, classifyError, parseError, issues };
}

function analyzeAbility(card, ability) {
  const issues = [];
  const cardForClassify = {
    name: card.name,
    abilities: [{ name: ability.name, type: ability.abilityType, text: ability.text }],
  };
  const text = String(ability.text || '').trim();

  let steps = [];
  let parseError = null;
  try {
    steps = parseAbility(text);
  } catch (e) {
    parseError = e.message;
    issues.push({ kind: 'parse-throw', severity: 'high', detail: e.message });
  }
  if (!Array.isArray(steps)) steps = [];

  let family = 'ERR';
  let families = [];
  try {
    family = classifyAbility(cardForClassify);
    families = classifyAbilityFamilies(cardForClassify);
  } catch (e) {
    issues.push({ kind: 'classify-throw', severity: 'high', detail: e.message });
  }

  const stepTypes = steps.map((s) => s.type);
  if (family === 'unknown') issues.push({ kind: 'unknown-family', severity: 'high' });
  if (stepTypes.length === 1 && stepTypes[0] === 'passiveAbility' && text.length > 30) {
    issues.push({ kind: 'unrecognized-passive-fallback', severity: 'high' });
  }
  if (stepTypes.length === 0 && text.length > 0) {
    issues.push({ kind: 'no-steps', severity: 'medium' });
  }

  return { family, families, stepTypes, parseError, issues };
}

function makeState() {
  const state = createGameState({ gameId: 'pokemon-audit', seed: 7, rulesEnabled: false });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 12; i++) {
      state.players[pid].zones.deck.push(createCard({ instanceId: 1000 + i, name: 'Energy', supertype: 'Energy' }));
    }
    for (let i = 0; i < 6; i++) {
      state.players[pid].zones.prizes.push(createCard({ instanceId: 2000 + i, name: 'Prize' }));
    }
  }
  return state;
}

function runAttackInEngine(cardName, attack) {
  try {
    const state = makeState();
    const attacker = createCard({
      instanceId: 1,
      name: cardName,
      supertype: 'Pokémon',
      types: ['Colorless'],
      stage: 'Basic',
      hp: 120,
      attacks: [attack],
    });
    const defender = createCard({
      instanceId: 2,
      name: 'Defender',
      supertype: 'Pokémon',
      types: ['Colorless'],
      stage: 'Basic',
      hp: 300,
    });
    state.players.p1.zones.active.push(attacker);
    state.players.p2.zones.active.push(defender);
    const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, createRng(7));
    return {
      error: res?.error ?? null,
      reason: res?.reason ?? null,
      eventTypes: (res?.events || []).map((e) => e.type),
      pendingChoice: !!res?.pendingChoice,
    };
  } catch (e) {
    return { error: 'THROW', reason: e.message, eventTypes: [], pendingChoice: false };
  }
}

function runAbilityInEngine(cardName, ability) {
  try {
    const state = makeState();
    const card = createCard({
      instanceId: 1,
      name: cardName,
      supertype: 'Pokémon',
      types: ['Colorless'],
      stage: 'Basic',
      hp: 120,
      abilities: [{ name: ability.name, type: ability.abilityType, text: ability.text }],
      abilityText: ability.text,
    });
    state.players.p1.zones.active.push(card);
    const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 1 }, playerId: 'p1' }, createRng(7));
    return {
      error: res?.error ?? null,
      reason: res?.reason ?? null,
      eventTypes: (res?.events || []).map((e) => e.type),
      pendingChoice: !!res?.pendingChoice,
    };
  } catch (e) {
    return { error: 'THROW', reason: e.message, eventTypes: [], pendingChoice: false };
  }
}

const GAP = (r) => r.issues.some((i) => i.kind === 'unknown-family' || i.kind === 'flat-with-effect-text' || i.kind === 'unrecognized-passive-fallback' || i.severity === 'high');

function groupRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.entryType}|${r.family}|${pattern(r.text)}`;
    if (!groups.has(key)) {
      groups.set(key, { family: r.family, text: r.text, cards: [], issues: new Set() });
    }
    const g = groups.get(key);
    g.cards.push(`${r.card} [${r.set} #${r.number}] ${r.entryName}`);
    for (const i of r.issues) g.issues.add(i.kind);
  }
  return [...groups.values()].sort((a, b) => b.cards.length - a.cards.length);
}

function tally(rows, get) {
  const m = new Map();
  for (const r of rows) m.set(get(r), (m.get(get(r)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function main() {
  const raw = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const attackRows = [];
  const abilityRows = [];
  const unmatchedLines = [];
  let splitHeaderOk = 0;

  for (const c of raw) {
    const { items, unparsed } = splitCard(c);
    if (unparsed.length) unmatchedLines.push({ card: c.name, set: c.set, number: c.number, lines: unparsed });
    for (const entry of items) {
      splitHeaderOk++;
      if (entry.kind === 'attack') {
        const a = analyzeAttack(c, entry);
        attackRows.push({
          entryType: 'attack',
          card: c.name,
          set: c.set,
          number: c.number,
          entryName: entry.name,
          cost: entry.cost,
          damage: entry.damage,
          damageText: entry.damageText,
          text: entry.text,
          ...a,
        });
      } else {
        const a = analyzeAbility(c, entry);
        abilityRows.push({
          entryType: 'ability',
          card: c.name,
          set: c.set,
          number: c.number,
          entryName: entry.name,
          abilityType: entry.abilityType,
          text: entry.text,
          ...a,
        });
      }
    }
  }

  const attackGaps = attackRows.filter(GAP);
  const abilityGaps = abilityRows.filter(GAP);

  for (const r of attackGaps) {
    r.engine = runAttackInEngine(r.card, {
      name: r.entryName,
      cost: r.cost,
      damage: r.damage,
      text: r.text,
    });
  }
  for (const r of abilityGaps) {
    r.engine = runAbilityInEngine(r.card, { name: r.entryName, abilityType: r.abilityType, text: r.text });
  }

  const engineFailures = [...attackGaps, ...abilityGaps].filter((r) => r.engine?.error);

  const lines = [];
  const out = (s = '') => lines.push(s);
  out('Pokémon attacks + abilities full audit — pkmncards linked query corpus');
  out(`Source: out/pkmn-pokemon-cards.json (${raw.length} printings)`);
  out(`Entries parsed: ${attackRows.length} attacks, ${abilityRows.length} abilities`);
  out();

  out('=== Attack families ===');
  for (const [k, v] of tally(attackRows, (r) => r.family)) out(`  ${String(v).padStart(5)}  ${k}`);
  out();
  out('=== Ability families ===');
  for (const [k, v] of tally(abilityRows, (r) => r.family)) out(`  ${String(v).padStart(5)}  ${k}`);
  out();

  out('=== Issue counts ===');
  for (const [k, v] of tally([...attackRows, ...abilityRows].flatMap((r) => r.issues), (i) => i.kind)) {
    out(`  ${String(v).padStart(5)}  ${k}`);
  }
  out();
  out(`Gaps: ${attackGaps.length} attacks, ${abilityGaps.length} abilities`);
  out(`Engine-run failures (error/throw): ${engineFailures.length}`);
  out(`Lines not attributed to any attack/ability: ${unmatchedLines.reduce((s, u) => s + u.lines.length, 0)} on ${unmatchedLines.length} cards`);
  out();

  const section = (title, rows) => {
    out();
    out(`=== ${title} (${rows.length}) ===`);
    for (const g of groupRows(rows)) {
      out();
      out(`[${g.family}] x${g.cards.length} issues=${[...g.issues].join(',')}`);
      out(`  ${g.text.replace(/\n/g, ' ⏎ ').slice(0, 260)}`);
      for (const c of g.cards.slice(0, 4)) out(`  • ${c}`);
      if (g.cards.length > 4) out(`  … +${g.cards.length - 4} more`);
    }
  };

  section('ATTACK GAPS — unknown / flat-with-text', attackGaps);
  section('ABILITY GAPS — unknown / unrecognized passive', abilityGaps);

  out();
  out(`=== ENGINE ERRORS (${engineFailures.length}) ===`);
  for (const r of engineFailures) {
    out(`\n[${r.entryType}] ${r.card} [${r.set} #${r.number}] ${r.entryName}`);
    out(`  error=${r.engine.error}${r.engine.reason ? ` (${r.engine.reason})` : ''}`);
    out(`  ${r.text.replace(/\n/g, ' ⏎ ').slice(0, 200)}`);
  }

  out();
  out(`=== UNATTRIBUTED LINES (${unmatchedLines.length} cards) ===`);
  for (const u of unmatchedLines.slice(0, 60)) {
    out(`\n${u.card} [${u.set} #${u.number}]`);
    for (const l of u.lines) out(`  ? ${l}`);
  }

  fs.writeFileSync(TXT_PATH, lines.join('\n'));
  fs.writeFileSync(
    ROWS_PATH,
    JSON.stringify(
      {
        meta: {
          printings: raw.length,
          attacks: attackRows.length,
          abilities: abilityRows.length,
          attackGaps: attackGaps.length,
          abilityGaps: abilityGaps.length,
          engineFailures: engineFailures.length,
          splitEntries: splitHeaderOk,
        },
        attackFamilyCounts: Object.fromEntries(tally(attackRows, (r) => r.family)),
        abilityFamilyCounts: Object.fromEntries(tally(abilityRows, (r) => r.family)),
        engineFailures,
        attackGaps,
        abilityGaps,
      },
      null,
      2
    )
  );

  process.stdout.write(
    `printings=${raw.length} attacks=${attackRows.length} abilities=${abilityRows.length} ` +
      `attackGaps=${attackGaps.length} abilityGaps=${abilityGaps.length} engineFailures=${engineFailures.length}\n` +
      `wrote ${TXT_PATH}\nwrote ${ROWS_PATH}\n`
  );
}

main();
