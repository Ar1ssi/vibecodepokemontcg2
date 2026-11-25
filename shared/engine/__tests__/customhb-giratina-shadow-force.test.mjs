// HB 691 Giratina ex (customhb set.json; text from the user's card scan). Shadow Strike: "This attack
// does 40 damage to 2 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched
// Pokémon.)" Shadow Force: "Prevent all damage done to this Pokémon by your opponent's Active Pokémon.
// This Pokémon can't be affected by Trainer cards or Abilities. At the end of your opponent's next
// turn, their Active Pokémon takes 150 damage. This Pokémon cannot use Shadow Force during your next
// turn. This Pokémon cannot retreat during your next turn."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { executeTrainer } from '../effects/trainer.mjs';
import { cardEffectShielded } from '../effects/trainer-steps.mjs';

const SET = JSON.parse(
  fs.readFileSync(new URL('../../../client/src/assets/custom-sets/customhb/set.json', import.meta.url), 'utf8')
);
const printed = SET.cards.find((c) => c.localId === '691');

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
// Costs dropped so the tests need no Energy; the effect text is the printed one.
const giratina = () =>
  mon(printed.name, {
    hp: printed.hp,
    types: printed.types,
    attacks: printed.attacks.map((a) => ({ name: a.name, cost: [], damage: String(a.damage ?? ''), text: a.effect })),
  });

function game({ p2Active = mon('Foe'), p2Bench = [mon('Spare')] } = {}) {
  const state = createGameState({ gameId: 'shadow-force', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) {
      state.players[id].zones.deck.push(createCard({ instanceId: nextId++, name: `${id} deck ${i}`, supertype: 'Trainer', subtypes: ['Item'] }));
    }
  }
  const g = giratina();
  state.players.p1.zones.active.push(g);
  state.players.p1.zones.bench.push(mon('Benched Ally'));
  state.players.p2.zones.active.push(p2Active);
  state.players.p2.zones.bench.push(...p2Bench);
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  return { state, giratina: g };
}

function run(state, command, seed = 4) {
  const result = applyCommand(state, command, createRng(seed));
  assert.equal(result.error ?? null, null);
  return result.state;
}
const attack = (state, playerId, attackIndex) => run(state, { type: 'attack', playerId, payload: { attackIndex } });
const pass = (state, playerId) => run(state, { type: 'pass', playerId, payload: {} });
const p1Giratina = (state) => state.players.p1.zones.active.find((c) => !c.attachedTo);
const p2Active = (state) => state.players.p2.zones.active.find((c) => !c.attachedTo);
const shadowForce = (setup) => attack(game(setup).state, 'p1', 1);

test('Shadow Strike: 40 to 2 Pokémon, Weakness on the Active only', () => {
  const weak = { types: ['Grass'], weakness: { type: 'Dragon', value: 2 } };
  let state = attack(game({ p2Active: mon('Foe', weak), p2Bench: [mon('Benched Foe', weak), mon('Untouched')] }).state, 'p1', 0);
  const pc = state.pendingChoice;
  assert.equal(pc.max, 2);
  const pick = pc.options.filter((o) => o.name !== 'Untouched').map((o) => o.instanceId);
  state = run(state, { type: 'resolveChoice', playerId: pc.player, payload: { choiceId: pc.choiceId, selection: pick } });
  const damage = Object.fromEntries([...state.players.p2.zones.active, ...state.players.p2.zones.bench].map((c) => [c.name, c.damage]));
  assert.deepEqual(damage, { Foe: 80, 'Benched Foe': 40, Untouched: 0 });
});

test("Shadow Force: the opponent's Active Pokémon does no damage to it during their next turn", () => {
  const state = attack(shadowForce(), 'p2', 0);
  assert.equal(p1Giratina(state).damage, 0);
});

test('Shadow Force: their Active Pokémon takes 150 damage at the end of their next turn', () => {
  let state = shadowForce();
  assert.equal(p2Active(state).damage, 0, 'nothing on the attack turn');
  state = pass(state, 'p2');
  assert.equal(p2Active(state).damage, 150);
  // Once only.
  state = pass(pass(state, 'p1'), 'p2');
  assert.equal(p2Active(state).damage, 150);
});

test('Shadow Force: the 150 lands on whichever Pokémon is Active then, and its Knock Out gives Giratina\'s player the Prize', () => {
  let state = shadowForce({ p2Active: mon('Foe'), p2Bench: [mon('Small', { hp: 150 })] });
  const smallId = state.players.p2.zones.bench[0].instanceId;
  state = run(state, { type: 'retreat', playerId: 'p2', payload: { benchInstanceId: smallId, discardEnergyIds: [] } });
  assert.equal(p2Active(state).name, 'Small');
  state = pass(state, 'p2');
  assert.ok(state.players.p2.zones.discard.some((c) => c.name === 'Small'));
  assert.equal(p2Active(state).name, 'Foe', 'promoted after the Knock Out');
  assert.equal(p2Active(state).damage, 0, 'the Pokémon that was Benched is spared');
  assert.equal(state.pendingChoice?.player, 'p1');
  assert.match(state.pendingChoice?.prompt || '', /Prize/);
});

test("Shadow Force: Trainer cards and Abilities can't affect it during the opponent's next turn", () => {
  let state = shadowForce();
  const owner = state.players.p1;
  for (const source of ['Item', 'Supporter', 'Stadium', 'Ability']) {
    assert.equal(cardEffectShielded(state, { owner, root: p1Giratina(state), source }), true, source);
  }
  assert.equal(cardEffectShielded(state, { owner, root: owner.zones.bench[0], source: 'Item' }), false, 'its Bench is not shielded');

  // Enhanced Hammer (Twilight Masquerade 224, out/pkmn-trainer-cards.json).
  const special = createCard({
    instanceId: nextId++,
    name: 'Double Turbo Energy',
    supertype: 'Energy',
    subtypes: ['Special'],
    attachedTo: p1Giratina(state).instanceId,
  });
  owner.zones.active.push(special);
  const hammer = createCard({
    instanceId: nextId++,
    name: 'Enhanced Hammer',
    supertype: 'Trainer',
    type: 'Item',
    trainerType: 'Item',
    text: 'Discard a Special Energy from 1 of your opponent’s Pokémon.',
  });
  state.players.p2.zones.hand.push(hammer);
  executeTrainer(state, { card: hammer, playerId: 'p2', events: [] });
  assert.ok(owner.zones.active.includes(special), 'the Special Energy stays attached');

  // Gone on Giratina's player's next turn.
  state = pass(state, 'p2');
  assert.equal(cardEffectShielded(state, { owner: state.players.p1, root: p1Giratina(state), source: 'Item' }), false);
});

test('Shadow Force: during your next turn it cannot use Shadow Force or retreat, but can use Shadow Strike', () => {
  const state = pass(shadowForce(), 'p2');
  assert.equal(state.turn.player, 'p1');
  assert.equal(validateLegality(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 1 } }).allowed, false);
  assert.equal(validateLegality(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }).allowed, true);
  const benchId = state.players.p1.zones.bench[0].instanceId;
  const retreat = validateLegality(state, { type: 'retreat', playerId: 'p1', payload: { benchInstanceId: benchId, discardEnergyIds: [] } });
  assert.equal(retreat.allowed, false);
});

test('Shadow Force: the damage shield ends after the opponent\'s next turn', () => {
  let state = pass(pass(shadowForce(), 'p2'), 'p1');
  state = attack(state, 'p2', 0);
  assert.equal(p1Giratina(state).damage, 60);
});
