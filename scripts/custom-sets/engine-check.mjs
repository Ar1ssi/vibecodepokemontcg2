#!/usr/bin/env node
// Runs every attack, ability and Trainer of a custom set through the oracle classifiers
// (attack-behaviour, ability-behaviour, trainer-behaviour) and prints the rows that the rules
// engine does not fully execute. Reprints of the same name + text in the pkmncards corpus are
// listed apart as "printed" (the printed card has the same limit). Design 075 / I272.
//
//   node scripts/custom-sets/engine-check.mjs [setId=customhb] [--all]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyAttackRow } from '../lib/attack-behaviour.mjs';
import { oracleCorpus } from '../lib/oracle-harness.mjs';
import { classifyRow } from '../lib/ability-behaviour.mjs';
import { classifyTrainer } from '../lib/trainer-behaviour.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SYMBOL = {
  Grass: 'G',
  Fire: 'R',
  Water: 'W',
  Lightning: 'L',
  Psychic: 'P',
  Fighting: 'F',
  Darkness: 'D',
  Metal: 'M',
  Fairy: 'Y',
  Dragon: 'N',
  Colorless: 'C',
};
const ENGINE_COST = { Dark: 'Darkness' };
const norm = (s) => String(s || '').replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim().toLowerCase();

function pkmncardsText(card) {
  const lines = [];
  for (const ab of card.abilities || []) lines.push(`${ab.type || 'Ability'} ⇢ ${ab.name}`, '', ab.effect || '', '');
  for (const at of card.attacks || []) {
    const cost = (at.cost || []).map((t) => `{${SYMBOL[t] || t[0]}}`).join('');
    lines.push(`${cost} → ${String(at.name).trim()}${at.damage ? ` : ${at.damage}` : ''}`, '', at.effect || '', '');
  }
  return lines.join('\n').trim();
}

function printedKeys() {
  const file = path.join(ROOT, 'out/pkmn-pokemon-cards.json');
  const keys = new Set();
  if (!fs.existsSync(file)) return keys;
  for (const card of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    const lines = String(card.text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    let name = null;
    let body = [];
    const flush = () => name && keys.add(`${norm(name)}|${norm(body.join(' '))}`);
    for (const line of lines) {
      const header = line.match(/^(?:ability|pok[ée]-power|pok[ée]-body|pok[ée]mon power|ancient trait|held item)\s*⇢\s*(.+)$/i) ||
        line.match(/^[^→]*→\s*([^:]+?)(?:\s*:\s*\S+)?\s*$/);
      if (header) {
        flush();
        name = header[1];
        body = [];
      } else body.push(line);
    }
    flush();
  }
  return keys;
}

export function engineCheck(set) {
  const printed = printedKeys();
  const findings = [];
  let parts = 0;
  const pokemon = set.cards.filter((c) => c.category === 'Pokemon');
  for (const card of pokemon) {
    const where = { name: card.name, set: set.name, number: card.localId };
    const attacks = (card.attacks || []).map((a) => ({
      name: String(a.name).trim(),
      cost: (a.cost || []).map((t) => ENGINE_COST[t] || t),
      damage: a.damage ? String(a.damage) : '',
      text: a.effect || '',
    }));
    attacks.forEach((a, idx) => {
      parts += 1;
      if (!a.text.trim()) return;
      const row = classifyAttackRow(where, { name: a.name, cost: a.cost, damageText: a.damage, text: a.text }, idx, attacks);
      if (row.verdict === 'ok') return;
      const detail = row.mismatches.map((m) => `${m.mech}: ${m.sentence}`).join('; ');
      findings.push({ card, kind: 'attack', name: a.name, verdict: row.verdict, text: a.text, detail, printed: printed.has(`${norm(a.name)}|${norm(a.text)}`) });
    });
    const rows = oracleCorpus([{ ...where, text: pkmncardsText(card) }], { kinds: ['ability'] });
    for (const row of rows) {
      parts += 1;
      const c = classifyRow(row);
      if (c.behaviour === 'runs' || c.behaviour === 'consumed') continue;
      findings.push({ card, kind: 'ability', name: row.name, verdict: c.behaviour, text: row.text, detail: [...c.unexecutable, ...c.flags].join('; '), printed: printed.has(`${norm(row.name)}|${norm(row.text)}`) });
    }
  }
  for (const card of set.cards.filter((c) => c.category === 'Trainer')) {
    parts += 1;
    const r = classifyTrainer({ name: card.name, text: card.effect, subtype: card.trainerType });
    const gaps = r.gaps.filter((g) => !(card.trainerType !== 'Item' && card.trainerType !== 'Supporter' && g === 'passive-only'));
    if (gaps.length) findings.push({ card, kind: 'trainer', name: card.name, verdict: 'gap', text: card.effect, detail: gaps.join('; '), printed: false });
  }
  return { findings, parts };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const setId = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'customhb';
  const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/src/assets/custom-sets', setId, 'set.json'), 'utf8'));
  const { findings, parts } = engineCheck(set);
  const show = (f) =>
    console.log(`HB ${f.card.localId} ${f.card.name} — ${f.kind} ${f.name} [${f.verdict}] ${f.detail ? `(${f.detail}) ` : ''}“${f.text}”`);
  console.log(`parts checked: ${parts}; with a gap: ${findings.length}`);
  console.log('--- homebrew');
  findings.filter((f) => !f.printed).forEach(show);
  console.log('--- printed');
  findings.filter((f) => f.printed).forEach(show);
}
