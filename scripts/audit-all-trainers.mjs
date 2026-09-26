#!/usr/bin/env node
/**
 * Full-corpus Trainer audit: every Supporter / Item / Pokémon Tool / Technical
 * Machine / Rocket's Secret Machine / Pokémon Tool F printing ever released
 * (source: pkmncards.com, extracted to out/pkmn-trainer-cards.json by
 * scripts/scrape-pkmncards-trainers.mjs) checked against
 * shared/engine/rules/trainer-effects.mjs.
 *
 * This is the trainer counterpart to scripts/audit-all-stadiums.mjs: it does
 * NOT filter to Standard-legal, it dedupes reprints by name+text, and it flags
 * *mis-parses* (a parser returning a plausible but wrong step) alongside cards
 * the parser cannot recognize at all.
 *
 * Run: node scripts/audit-all-trainers.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTrainerEffect, describeStep } from '../shared/engine/rules/trainer-effects.mjs';
import { isExecutableStepType } from '../shared/engine/effects/executor.mjs';
import { classifyTrainer } from './lib/trainer-behaviour.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, '..', 'out', 'pkmn-trainer-cards.json');
const REPORT_PATH = path.join(__dirname, '..', 'out', 'trainer-full-audit.txt');

const raw = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

function toCard(c) {
  return {
    name: c.name,
    subtitle: c.subtype || '',
    type: 'Trainer',
    subtypes: [c.subtype || 'Trainer'],
    text: c.text || '',
    set: c.set,
    number: c.number,
    url: c.url,
  };
}

// Steps that directly mutate game state with no player picker.
const AUTO_STEP_TYPES = new Set([
  'discardHandThenDraw',
  'shuffleHandThenDraw',
  'countShuffleDrawPlus',
  'draw',
  'drawUntil',
  'variableDraw',
  'opponentDraw',
  'ionoShuffle',
  'opponentShuffleHandDraw',
  'millSelf',
  'healAmount',
  'heal',
  'applyStatus',
  'damageCounters',
  'reshufflePrizes',
  'opponentCountShuffleDraw',
  'fossilItem',
  'massDiscardAttached',
]);

// Legacy-client mirror of runTrainerSteps() (client/src/setup/rules/trainer-execution.js).
// Kept for the client-parity test and the `clientMissing` column; the authoritative
// server coverage is `isExecutableStepType` from the effects executor (S9: this used
// to decide the parse outcome, so server gaps looked handled — S279 §I).
const EXECUTED_STEP_TYPES = new Set([
  'passive',
  ...AUTO_STEP_TYPES,
  'discardCost',
  'coinFlip',
  'putHandOnBottom',
  'searchDeck',
  'searchDeckSequence',
  'lookAtTop',
  'lookAtBottom',
  'recursion',
  'shuffleFromDiscard',
  'attachFromDiscard',
  'attachMultipleFromDiscard',
  'switchOpponent',
  'switchOwn',
  'revealOpponentHandDiscard',
  'opponentHandBottom',
  'opponentHandShuffleDeck',
  'opponentActiveEnergyToDeck',
  'opponentHandToBenchBasic',
  'eachPlayerDiscardFromHand',
  'eachPlayerDraw',
  'eachPlayerReturnBench',
  'eachPlayerShuffleHandDraw',
  'eachPlayerHandToFive',
  'eachPlayerRecoverPokemon',
  'discardAnyThenDraw',
  'opponentHandShuffleItemsDraw',
  'discardAllTrainerInPlay',
  'returnStadiumToHand',
  'shuffleDeckOnly',
  'clearAttackEffects',
  'revealUntilCard',
  'lookAtFaceDownPrize',
  'putHandBasicAsActive',
  'healPerHeads',
  'healEachActive',
  'opponentChoosesFromTop',
  'millPerHeads',
  'flipUntilTailsDraw',
  'toolsToHand',
  'switchHandWithTop',
  'putHandBottomThenDraw',
  'shuffleHandCardsThenDraw',
  'drawBottom',
  'moveEnergyOpponent',
  'sendEnergyToDeckBottom',
  'revealTopEnergy',
  'discardAllEnergyFromActive',
  'searchToTop',
  'healAllOwnAndDiscardEnergy',
  'healOneDiscardEnergy',
  'rearrangeTop',
  'shuffleDiscardThenMill',
  'discardRandomOpponentHandIfSupporter',
  'lostZoneCost',
  'toolOrStadiumToLostZone',
  'sendEnergyToLostZone',
  'opponentDiscardToLostZonePerPokemon',
  'opponentDiscardUntil',
  'eachPlayerDiscardUntil',
  'discardEnergyFromOpponent',
  'returnPokemonToHand',
  'moveEnergy',
  'moveEnergyToActive',
  'evolveStage2',
  'devolve',
  'discardTools',
  'discardFromOpponent',
  'discardToolAndSpecialEnergy',
  'swapWithDiscard',
  'revealOpponentDeckBench',
  'opponentPrizeHandSwap',
  'switchOpponentOut',
  'reviveFromDiscard',
  'moveDamageCounters',
  'lookAtOpponentHand',
  'attachFromHand',
  'attachAttackTool',
  'revealPrizes',
  'prizeToHand',
  'clearStatus',
  'discardStadium',
  'putDiscardOnTop',
  'energyToHand',
  'opponentDiscardToHand',
  'opponentDiscardToDeckBottom',
  'shufflePokemonIntoDeck',
  'discardOwnBenchPokemon',
  'shuffleDiscardIntoDeck',
]);

function classifyOutcome(parsed) {
  if (!parsed.recognizable) return 'unrecognizable';
  const types = parsed.steps.map((s) => s.type);
  if (types.length === 0) return 'empty';
  // Authoritative-server coverage decides the outcome (the legacy list used to,
  // which hid the 26 step kinds I154 found).
  if (types.some((t) => t !== 'passive' && !isExecutableStepType(t))) return 'unhandled-step';
  if (types.every((t) => t === 'passive')) return 'passive-only';
  if (types.some((t) => AUTO_STEP_TYPES.has(t))) return 'automated';
  return 'guided';
}

// Legacy client coverage, reported separately (parity information only).
function clientMissingSteps(parsed) {
  return parsed.steps.map((s) => s.type).filter((t) => !EXECUTED_STEP_TYPES.has(t));
}

function stepSummary(steps) {
  return steps.map((s) => s.type).join(' + ') || '(none)';
}

// Heuristic mis-parse detection. Wording that clearly promises a mechanic but
// the parser produced no step for it is worth a human look.
function suspiciousWarnings(parsed, text) {
  const t = String(text || '').toLowerCase();
  const types = parsed.steps.map((s) => s.type);
  const has = (...names) => types.some((x) => names.includes(x));
  const warnings = [];
  if (/search (?:your|their|his or her) deck/.test(t) && !has('searchDeck', 'searchDeckSequence', 'searchEvolve')) {
    warnings.push('deck-search not parsed');
  }
  if (/flip a coin/.test(t) && !has('coinFlip')) warnings.push('coin flip not parsed');
  if (/heal\b/.test(t) && !has('heal', 'healAmount')) warnings.push('heal not parsed');
  if (
    /shuffles? (?:his or her|their|your) hand/.test(t) &&
    !has('ionoShuffle', 'shuffleHandThenDraw', 'opponentShuffleHandDraw')
  ) {
    warnings.push('hand shuffle not parsed');
  }
  if (/discard your hand/.test(t) && !has('discardHandThenDraw')) warnings.push('discard-hand not parsed');
  if (types.includes('passive') && /search (?:your|their|his or her) deck/.test(t)) {
    warnings.push('deck search swallowed as passive');
  }
  if (types.length && types.every((x) => x === 'passive') && /draw \d+ cards?/.test(t)) {
    warnings.push('draw swallowed as passive');
  }
  if (/draw .*card.*for each/.test(t) && !has('variableDraw')) warnings.push('variable draw parsed as flat draw');
  if (
    /(?:attach|move) .*energy/.test(t) &&
    !has(
      'attachFromDiscard',
      'attachMultipleFromDiscard',
      'moveEnergy',
      'moveEnergyToActive',
      'searchAttachEach',
      'shuffleFromDiscard',
      'passive'
    )
  ) {
    warnings.push('energy move/attach not parsed');
  }
  if (
    /onto (?:your|their|his or her) bench/.test(t) &&
    !has('searchDeck', 'lookAtTop', 'lookAtBottom', 'revealOpponentDeckBench', 'fossilItem')
  ) {
    warnings.push('bench placement not parsed');
  }
  if (/prize/.test(t) && !has('reshufflePrizes', 'opponentPrizeHandSwap', 'prizeBargain')) {
    warnings.push('prize interaction not parsed');
  }
  return warnings;
}

function classify(card) {
  const parsed = parseTrainerEffect(card.text);
  const status = classifyOutcome(parsed);
  return {
    parsed,
    status,
    serverMissing: classifyTrainer(card).serverMissing,
    clientMissing: clientMissingSteps(parsed),
    stepSummary: stepSummary(parsed.steps),
    descriptions: parsed.steps.map((s) => describeStep(s)),
    warnings: suspiciousWarnings(parsed, card.text),
  };
}

// Stadiums have their own parse layer (stadium-effects.mjs) and their own audit;
// feeding them to parseTrainerEffect inflated the "unrecognizable" bucket.
const stadiumRows = raw.filter((c) => /stadium/i.test(c.subtype || ''));
const trainerRows = raw.filter((c) => !/stadium/i.test(c.subtype || ''));

// Dedupe reprints (ignore duplicates): identical name + identical text.
const groups = new Map();
for (const c of trainerRows) {
  const card = toCard(c);
  const key = `${card.name}\u0000${card.text}`;
  if (!groups.has(key)) groups.set(key, { card, prints: [] });
  groups.get(key).prints.push(`${card.set} #${card.number}`);
}

const rows = [];
for (const { card, prints } of groups.values()) rows.push({ card, prints, ...classify(card) });

const tally = (get) => {
  const m = new Map();
  for (const r of rows) m.set(get(r), (m.get(get(r)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

log(`Trainer printings scanned : ${trainerRows.length}`);
if (stadiumRows.length > 0) {
  log(`Stadium rows skipped      : ${stadiumRows.length} (see scripts/audit-all-stadiums.mjs)`);
}
log(`Unique (name+text) cards  : ${rows.length}`);
log('');

log('=== By subtype ===');
for (const [k, v] of tally((r) => r.card.subtitle || '(none)')) log(`  ${String(v).padStart(4)}  ${k}`);

log('\n=== By parse outcome ===');
for (const [k, v] of tally((r) => r.status)) log(`  ${String(v).padStart(4)}  ${k}`);

const serverGaps = rows.filter((r) => r.serverMissing.length > 0);
log(`\n=== Server coverage: cards with a parsed step the server cannot execute (${serverGaps.length}) ===`);
log('  (The parse outcome above is now the SERVER view; the legacy client is below.)');
for (const r of serverGaps.sort((a, b) => a.card.name.localeCompare(b.card.name))) {
  log(`  [${r.card.subtitle}] ${r.card.name} — server lacks: ${r.serverMissing.join(', ')}`);
}

const clientGaps = rows.filter((r) => r.clientMissing.length > 0);
log(`\n=== Legacy-client coverage: parsed steps with no client executor (${clientGaps.length}) ===`);
for (const r of clientGaps.sort((a, b) => a.card.name.localeCompare(b.card.name))) {
  log(`  [${r.card.subtitle}] ${r.card.name} — client lacks: ${r.clientMissing.join(', ')}`);
}

const GAP = (r) => r.status === 'unrecognizable' || r.status === 'empty' || r.status === 'unhandled-step';
const gaps = rows.filter(GAP).sort((a, b) => a.card.name.localeCompare(b.card.name));
log(`\n=== Gaps: unrecognizable / empty / unhandled step (${gaps.length}) ===`);
for (const r of gaps) {
  log(`\n[${r.card.subtitle}] ${r.card.name} [${r.card.set} #${r.card.number}]`);
  log(`  ${r.card.text}`);
}

const passiveOnly = rows
  .filter((r) => r.status === 'passive-only')
  .sort((a, b) => a.card.name.localeCompare(b.card.name));
log(`\n=== Passive-only: engine executes nothing (${passiveOnly.length}) ===`);
log('  (Tool modifiers are wired by tool-combat.mjs; Supporter/Item passives are announcements.)');
for (const r of passiveOnly) {
  log(`  [${r.card.subtitle}] ${r.card.name} — ${r.parsed.steps[0]?.detail || ''}`);
}

const SUS = (r) => r.warnings.length > 0;
const suspicious = rows.filter(SUS).sort((a, b) => a.card.name.localeCompare(b.card.name));
log(`\n=== Suspicious mis-parses (${suspicious.length}) ===`);
for (const r of suspicious) {
  log(`\n[${r.card.subtitle}] ${r.card.name} [${r.card.set} #${r.card.number}] — ${r.warnings.join('; ')}`);
  log(`  parsed: ${r.stepSummary}`);
  log(`  ${r.card.text}`);
}

const wired = rows.filter((r) => !GAP(r) && r.status !== 'passive-only' && !SUS(r));
log(`\n=== OK (${wired.length}) ===`);
for (const r of wired.sort((a, b) => a.card.name.localeCompare(b.card.name))) {
  const server = r.serverMissing.length ? 'server: missing' : 'server: ok';
  log(`  [${r.status}] ${r.card.name} — ${r.stepSummary} (${server})`);
}

fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
process.stderr.write(`\nReport written to ${REPORT_PATH}\n`);
