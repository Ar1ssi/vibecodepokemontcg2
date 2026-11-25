// HB 554 Giratina ex Alpha Rage (customhb set.json): "Choose 1 of your opponent's Pokémon. That Pokémon
// attacks 1 of your opponent's other Pokémon. This Pokémon can't attack during your next turn."
// The chosen Pokémon is the Attacking Pokémon: its own Tools, Energy and printed damage text apply,
// the target's Weakness (Active only) and Tools apply, and Giratina's own attached cards do not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const SET = JSON.parse(
  fs.readFileSync(new URL('../../../client/src/assets/custom-sets/customhb/set.json', import.meta.url), 'utf8')
);
const hbCard = (localId) => SET.cards.find((c) => c.localId === localId);
const alphaRage = hbCard('554').attacks.find((a) => a.name === 'Alpha Rage');

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({
    instanceId: nextId++,
    name,
    supertype: 'Pokémon',
    stage: 'Basic',
    hp: 300,
    types: ['Colorless'],
    attacks: [{ name: 'Hit', cost: [], damage: '60', text: '' }],
    ...extra,
  });
const energy = (type, host) =>
  createCard({ instanceId: nextId++, name: `Basic ${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], energyType: type, attachedTo: host.instanceId });
const trainer = (name, subtype, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: [subtype], type: subtype, ...extra });
/** HB `localId` Tool attached to `host`, with its printed attack. */
const hbTool = (localId, host) => {
  const c = hbCard(localId);
  return trainer(c.name, 'Pokémon Tool', {
    text: c.effect,
    attachedTo: host.instanceId,
    attacks: (c.attacks || []).map((a) => ({ name: a.name, cost: a.cost, damage: String(a.damage ?? ''), text: a.effect })),
  });
};
const giratina = () => mon('Giratina ex', { attacks: [{ name: 'Alpha Rage', cost: [], damage: '', text: alphaRage.effect }] });

function game({ p1 = [], p2 = [], p2Bench = [] }) {
  const state = createGameState({ gameId: 'alpha-rage', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`, 'Item'));
  }
  state.players.p1.zones.active.push(...p1);
  state.players.p2.zones.active.push(...p2);
  state.players.p2.zones.bench.push(...p2Bench);
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  return state;
}

/**
 * Uses Alpha Rage, answering each prompt with the first of `picks` it offers (user, attack, target);
 * stops at a prompt none of them answers (a Prize choice).
 */
function alpha(state, picks) {
  let result = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
  for (let guard = 0; result.state.pendingChoice && guard < 6; guard++) {
    const pc = result.state.pendingChoice;
    const option = picks
      .map((p) => pc.options.find((o) => o.name === p || o.name.startsWith(`${p} (`)))
      .find(Boolean);
    if (!option) break;
    result = applyCommand(
      result.state,
      { type: 'resolveChoice', playerId: pc.player, payload: { choiceId: pc.choiceId, selection: [option.instanceId] } },
      createRng(4)
    );
    assert.equal(result.error ?? null, null);
  }
  return result.state;
}
const damageOf = (state, name) =>
  [...state.players.p2.zones.active, ...state.players.p2.zones.bench].find((c) => c.name === name)?.damage ?? null;

test("the chosen Pokémon's own Tool boosts the hit and the target's Weakness applies (HB 027 Weeding Gloves)", () => {
  const striker = mon('Striker', { types: ['Lightning'], attacks: [{ name: 'Zap', cost: [], damage: '60', text: '' }] });
  const target = mon('Target', { types: ['Grass'], weakness: { type: 'Lightning', value: 2 } });
  const state = alpha(game({ p1: [giratina()], p2: [target], p2Bench: [striker, hbTool('027', striker)] }), ['Striker', 'Target']);
  assert.equal(damageOf(state, 'Target'), (60 + 30) * 2);
});

test("the target's Tool reduces the hit (HB 338 Pot Helmet)", () => {
  const striker = mon('Striker', { attacks: [{ name: 'Zap', cost: [], damage: '90', text: '' }] });
  const target = mon('Target');
  const state = alpha(game({ p1: [giratina()], p2: [target, hbTool('338', target)], p2Bench: [striker] }), ['Striker', 'Target']);
  assert.equal(damageOf(state, 'Target'), 60);
});

test("Giratina's own Tool does not boost the controlled hit", () => {
  const g = giratina();
  const striker = mon('Striker', { attacks: [{ name: 'Zap', cost: [], damage: '60', text: '' }] });
  const target = mon('Target', { types: ['Grass'] });
  const state = alpha(game({ p1: [g, hbTool('027', g)], p2: [target], p2Bench: [striker] }), ['Striker', 'Target']);
  assert.equal(damageOf(state, 'Target'), 60);
});

test("the chosen attack's damage text counts the chosen Pokémon's own Energy", () => {
  const striker = mon('Striker', {
    attacks: [{ name: 'Charge', cost: [], damage: '30×', text: 'This attack does 30 damage for each Energy attached to this Pokémon.' }],
  });
  const target = mon('Target');
  const state = alpha(
    game({ p1: [giratina()], p2: [target], p2Bench: [striker, energy('Fire', striker), energy('Fire', striker), energy('Fire', striker)] }),
    ['Striker', 'Target']
  );
  assert.equal(damageOf(state, 'Target'), 90);
});

test('a Benched target takes no Weakness, and its Knock Out gives Giratina\'s player a Prize', () => {
  const striker = mon('Striker', { types: ['Fire'], attacks: [{ name: 'Burn', cost: [], damage: '120', text: '' }] });
  const survivor = mon('Survivor', { hp: 130, types: ['Grass'], weakness: { type: 'Fire', value: 2 } });
  const notKo = alpha(game({ p1: [giratina()], p2: [mon('Active')], p2Bench: [striker, survivor] }), ['Striker', 'Survivor']);
  assert.equal(damageOf(notKo, 'Survivor'), 120);
  const ko = alpha(game({ p1: [giratina()], p2: [mon('Active')], p2Bench: [striker, mon('Small', { hp: 100 })] }), ['Striker', 'Small']);
  assert.ok(ko.players.p2.zones.discard.some((c) => c.name === 'Small'));
  assert.equal(ko.pendingChoice?.player, 'p1');
  assert.match(ko.pendingChoice?.prompt || '', /Prize/);
});

test('an attack the chosen Pokémon gets from its Tool can be used (HB 509 Technical Machine: Close Combat)', () => {
  const closeCombat = hbCard('509').attacks[0];
  const user = mon('Plain', { attacks: [{ name: 'Tap', cost: [], damage: '10', text: '' }] });
  const target = mon('Target');
  const state = alpha(game({ p1: [giratina()], p2: [target], p2Bench: [user, hbTool('509', user)] }), ['Plain', closeCombat.name, 'Target']);
  assert.equal(damageOf(state, 'Target'), parseInt(closeCombat.damage, 10));
});

// Antique Armor Fossil Protective Armor (corpus: out/pkmn-trainer-cards.json, Pitch Black 072).
const PROTECTIVE_ARMOR =
  "As long as this Pokémon is in the Active Spot, all of your Pokémon take 10 less damage from attacks from your opponent's Pokémon (after applying Weakness and Resistance).";

test('a team Ability shield cuts a controlled hit on a Benched target once, not twice', () => {
  const striker = mon('Striker', { attacks: [{ name: 'Zap', cost: [], damage: '90', text: '' }] });
  const armor = mon('Armor', { abilities: [{ type: 'Ability', name: 'Protective Armor', text: PROTECTIVE_ARMOR }] });
  const state = alpha(game({ p1: [giratina()], p2: [armor], p2Bench: [striker, mon('Target')] }), ['Striker', 'Target']);
  assert.equal(damageOf(state, 'Target'), 80);
});
