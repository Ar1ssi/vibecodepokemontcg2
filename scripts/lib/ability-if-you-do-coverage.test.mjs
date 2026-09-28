// Gate (parse-hole sweep D4): an activated Ability printing "If you do," has a cost and a
// follow-up. It must parse to at least two steps, or to one step type that runs both halves
// itself. A dropped half (Samurott Torrential Whirlpool once switched only its own Active)
// fails here by name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitCard } from './split-card-text.mjs';
import { parseAbility } from '../../shared/engine/rules/abilities.mjs';

const CORPORA = ['out/pkmn-pokemon-cards.json', 'out/pkmn-gx-cards.json'];

// Step types whose handler performs the cost and the "If you do," half together.
const COMPOUND_STEPS = new Set([
  'selfLeavesAbility', // Misty's Psyduck: bottom card discarded, then onto the deck
  'switchAbility', // Pecharunt ex: the new Active is Poisoned
  'transformAbility', // Form Change / Temperament / Transformative Start / Phantom Transformation
  'stadiumManipAbility', // Teleport Room / Resetting Hole
  'winGameAbility', // Unown MISSING / HAND / DAMAGE
  'prizeToHand', // Azelf Time Walk: look, take a Pokémon, set a hand card as a Prize
]);

// Known open rows, each with its reason (journal flag).
const KNOWN_GAPS = new Map([
  ['Flygon ex — Psychic Protector', 'a damage-time hand discard needs a defender prompt mid-attack'],
]);

test('every "If you do," Ability parses both halves', () => {
  const dropped = [];
  const seen = new Set();
  for (const file of CORPORA) {
    for (const card of JSON.parse(fs.readFileSync(file, 'utf8'))) {
      for (const item of splitCard(card).items) {
        if (item.kind !== 'ability' || !/if you do,/i.test(item.text || '') || seen.has(item.text)) continue;
        seen.add(item.text);
        const label = `${card.name} — ${item.name}`;
        if (KNOWN_GAPS.has(label)) continue;
        const steps = parseAbility(item.text).filter((step) => !step.trait);
        if (steps.length >= 2 || (steps.length === 1 && COMPOUND_STEPS.has(steps[0].type))) continue;
        dropped.push(`${label} (${card.set} ${card.number}): ${steps.map((s) => s.type).join(',') || 'none'}`);
      }
    }
  }
  assert.deepEqual(dropped, []);
});
