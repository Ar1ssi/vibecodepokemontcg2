// Trickster moving Head Ringer / Jamming Net onto the opponent's Active Pokémon.
// Card text: out/pkmn-trainer-cards.json rows "Head Ringer Team Flare Hyper Gear" (PHF 97) and
// "Jamming Net Team Flare Hyper Gear" (PHF 98); Trickster text as in trickster-tool-move.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const TRICKSTER =
  "Once during your turn, if this Pokémon is in the Active Spot, you may move the Pokémon Tool attached to this Pokémon to your opponent's Active Pokémon. If that Pokémon already has a Pokémon Tool attached to it, discard that Pokémon Tool and attach the moved Pokémon Tool to it instead.";
const HEAD_RINGER =
  'The attacks of the Pokémon this card is attached to cost {C} more. When this card is removed from a Pokémon for any reason, put this card in its owner’s discard pile.';
const JAMMING_NET =
  'The attacks of the Pokémon this card is attached to do 20 less damage to all Defending Pokémon (before applying Weakness and Resistance). (Don’t apply Weakness and Resistance for Benched Pokémon.) When this card is removed from a Pokémon for any reason, put this card in its owner’s discard pile.';

let nextId = 1;
const id = () => nextId++;
const filler = () => createCard({ instanceId: id(), name: 'Card', supertype: 'Trainer', subtypes: ['Item'] });
const energy = (attachedTo) =>
  createCard({ instanceId: id(), name: 'Colorless Energy', supertype: 'Energy', subtypes: ['Basic'], provides: ['Colorless'], attachedTo });

function board(toolName, toolText) {
  nextId = 1;
  const state = createGameState({ gameId: 'trickster-gear', seed: 3, rulesEnabled: true });
  for (const p of ['p1', 'p2']) {
    state.players[p] = { playerId: p, username: p, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
    for (let i = 0; i < 6; i++) {
      state.players[p].zones.prizes.push(filler());
      state.players[p].zones.deck.push(filler());
    }
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const sableye = createCard({
    instanceId: id(), name: 'Sableye', supertype: 'Pokémon', stage: 'Basic', hp: 200, ownerId: 'p1',
    abilities: [{ name: 'Trickster', type: 'Ability', text: TRICKSTER }],
  });
  const tool = createCard({
    instanceId: id(), name: toolName, supertype: 'Trainer', subtypes: ['Pokémon Tool'], text: toolText,
    rules: [toolText], ownerId: 'p1', attachedTo: sableye.instanceId,
  });
  state.players.p1.zones.active.push(sableye, tool);
  const foe = createCard({
    instanceId: id(), name: 'Foe', supertype: 'Pokémon', stage: 'Basic', hp: 200, ownerId: 'p2',
    attacks: [{ name: 'Hit', cost: ['Colorless'], damage: '60', text: '' }],
  });
  state.players.p2.zones.active.push(foe, energy(foe.instanceId));
  return { state, sableye, tool, foe };
}

const rng = { next: () => 0.1 };
const run = (state, cmd) => {
  const res = applyCommand(state, cmd, rng);
  return res;
};

function trickThenPass(toolName, text) {
  const b = board(toolName, text);
  const used = run(b.state, { type: 'useAbility', payload: { instanceId: b.sableye.instanceId }, playerId: 'p1' });
  assert.equal(used.error, null);
  const passed = run(used.state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(passed.error, null);
  return { ...b, state: passed.state };
}

for (const name of ['Head Ringer', 'Head Ringer Team Flare Hyper Gear']) {
  test(`${name} moved by Trickster: the opponent's attack costs {C} more`, () => {
    const { state } = trickThenPass(name, HEAD_RINGER);
    const res = run(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' });
    assert.ok(res.error, 'one Energy no longer pays for a {C} attack');
  });
}

for (const name of ['Jamming Net', 'Jamming Net Team Flare Hyper Gear']) {
  test(`${name} moved by Trickster: the opponent's attack does 20 less damage`, () => {
    const { state, sableye } = trickThenPass(name, JAMMING_NET);
    const res = run(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' });
    assert.equal(res.error, null);
    const hit = res.state.players.p1.zones.active.find((c) => c.instanceId === sableye.instanceId);
    assert.equal(hit.damage, 40);
  });
}

test('Head Ringer adds exactly {C}: two Energy still pay for the {C} attack', () => {
  const { state, foe } = trickThenPass('Head Ringer', HEAD_RINGER);
  state.players.p2.zones.active.push(energy(foe.instanceId));
  assert.equal(run(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' }).error, null);
});

test('Jamming Tower switches off a Jamming Net moved by Trickster', () => {
  const { state, sableye } = trickThenPass('Jamming Net', JAMMING_NET);
  state.stadium = {
    card: createCard({
      instanceId: 900, name: 'Jamming Tower', supertype: 'Trainer', subtypes: ['Stadium'],
      text: 'Pokémon Tools attached to each Pokémon (both yours and your opponent’s) have no effect.',
    }),
    user: 'p1',
  };
  const res = run(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active.find((c) => c.instanceId === sableye.instanceId).damage, 60);
});

test("a moved Tool goes to its owner's discard pile when its new holder is Knocked Out", () => {
  const { state, foe, tool } = trickThenPass('Jamming Net', JAMMING_NET);
  // Hand the turn back to p1 and Knock Out the Foe holding p1's Jamming Net.
  const back = run(state, { type: 'pass', payload: {}, playerId: 'p2' });
  assert.equal(back.error, null);
  back.state.players.p1.zones.active[0].attacks = [{ name: 'Smash', cost: [], damage: '200', text: '' }];
  const res = run(back.state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.ok(!res.state.players.p2.zones.active.some((c) => c.instanceId === foe.instanceId));
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.instanceId === tool.instanceId));
  assert.ok(!res.state.players.p2.zones.discard.some((c) => c.instanceId === tool.instanceId));
});

test("Trickster discarding a Tool its player owns files it in that player's discard pile", () => {
  const b = board('Head Ringer', HEAD_RINGER);
  // p1's earlier Jamming Net already sits on the opponent's Active.
  const net = createCard({
    instanceId: 500, name: 'Jamming Net', supertype: 'Trainer', subtypes: ['Pokémon Tool'], text: JAMMING_NET,
    ownerId: 'p1', attachedTo: b.foe.instanceId,
  });
  b.state.players.p2.zones.active.push(net);
  const res = run(b.state, { type: 'useAbility', payload: { instanceId: b.sableye.instanceId }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.instanceId === 500));
  assert.equal(res.state.players.p2.zones.active.find((c) => c.instanceId === b.tool.instanceId).attachedTo, b.foe.instanceId);
});
