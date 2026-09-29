// Koraidon ex Dino Cry — card text from out/pkmn-pokemon-cards.json (Koraidon ex, Scarlet & Violet 125).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAbility } from '../rules/abilities.mjs';

const DINO_CRY_TEXT =
  'Once during your turn, you may attach up to 2 Basic {F} Energy cards from your discard pile to your Basic {F} Pokémon in any way you like. If you use this Ability, your turn ends.';

const fightingEnergy = (instanceId) =>
  createCard({ instanceId, name: 'Basic Fighting Energy', supertype: 'Energy', subtypes: ['Basic'] });

function setupDinoCry() {
  const rng = createRng(7);
  const state = createGameState({ gameId: 'dino-cry', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const koraidon = createCard({
    instanceId: 10, name: 'Koraidon ex', hp: 230, supertype: 'Pokémon', stage: 'Basic', types: ['Fighting'],
    abilities: [{ name: 'Dino Cry', type: 'Ability', text: DINO_CRY_TEXT }],
  });
  const ragingBolt = createCard({ instanceId: 11, name: 'Raging Bolt ex', hp: 240, supertype: 'Pokémon', stage: 'Basic', types: ['Dragon'] });
  const sandyShocks = createCard({ instanceId: 12, name: 'Sandy Shocks ex', hp: 220, supertype: 'Pokémon', stage: 'Basic', types: ['Fighting'] });
  const lucario = createCard({ instanceId: 13, name: 'Lucario', hp: 130, supertype: 'Pokémon', stage: 'Stage 1', types: ['Fighting'] });
  state.players.p1.zones.active.push(ragingBolt);
  state.players.p1.zones.bench.push(koraidon, sandyShocks, lucario);
  state.players.p1.zones.discard.push(
    fightingEnergy(20),
    fightingEnergy(21),
    fightingEnergy(22),
    createCard({ instanceId: 23, name: 'Basic Fire Energy', supertype: 'Energy', subtypes: ['Basic'] })
  );
  state.players.p2.zones.active.push(createCard({ instanceId: 30, name: 'Iron Crown ex', hp: 220, supertype: 'Pokémon' }));
  state.players.p2.zones.deck.push(createCard({ instanceId: 31 }), createCard({ instanceId: 32 }));
  return { state, rng };
}

const choose = (res, selection, rng) =>
  applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection },
    playerId: 'p1',
  }, rng);

test('Dino Cry parse: the target keeps its own Basic {F} filter and 2 picks', () => {
  const [step] = parseAbility(DINO_CRY_TEXT);
  assert.equal(step.type, 'attachAbility');
  assert.equal(step.target, 'your basic {f} pokémon');
  assert.equal(step.energyType, 'fighting');
  assert.equal(step.count, 2);
});

test('Dino Cry attaches 2 Basic {F} Energy to Basic {F} Pokémon only, then ends the turn', () => {
  const { state, rng } = setupDinoCry();
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 10 }, playerId: 'p1' }, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(res1.pendingChoice.options.map((c) => c.instanceId), [20, 21, 22], 'Fighting Energy only');

  const res2 = choose(res1, [20], rng);
  assert.deepEqual(
    res2.pendingChoice.options.map((c) => c.instanceId).sort(),
    [10, 12],
    'Basic {F} Pokémon only: not the Dragon Active, not the Stage 1'
  );

  const res3 = choose(res2, [12], rng);
  assert.ok(res3.pendingChoice, 'asks for the second Energy');
  const res4 = choose(res3, [21], rng);
  const res5 = choose(res4, [10], rng);
  assert.equal(res5.error, null);
  assert.equal(res5.pendingChoice, null);

  const bench = res5.state.players.p1.zones.bench;
  assert.equal(bench.find((c) => c.instanceId === 20)?.attachedTo, 12);
  assert.equal(bench.find((c) => c.instanceId === 21)?.attachedTo, 10);
  assert.equal(res5.state.turn.player, 'p2', 'using the Ability ends the turn');
});

test('Dino Cry: stopping after 1 Energy still ends the turn', () => {
  const { state, rng } = setupDinoCry();
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 10 }, playerId: 'p1' }, rng);
  const res2 = choose(res1, [20], rng);
  const res3 = choose(res2, [10], rng);
  const res4 = choose(res3, [], rng);
  assert.equal(res4.error, null);
  assert.equal(res4.pendingChoice, null);
  assert.equal(res4.state.players.p1.zones.bench.filter((c) => c.attachedTo === 10).length, 1);
  assert.equal(res4.state.turn.player, 'p2');
});

test('Dino Cry with no Basic {F} Energy in discard is not spent and keeps the turn', () => {
  const { state, rng } = setupDinoCry();
  state.players.p1.zones.discard = state.players.p1.zones.discard.filter((c) => c.name.includes('Fire'));
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 10 }, playerId: 'p1' }, rng);
  assert.equal(res.pendingChoice, null);
  assert.notEqual(res.state.players.p1.flags.abilitiesUsed[10], true);
  assert.equal(res.state.turn.player, 'p1');
});
