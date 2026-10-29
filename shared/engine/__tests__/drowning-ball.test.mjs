// Araquanid Drowning Ball (customhb set.json): "Flip a coin. If heads, your opponent's Active
// Pokémon is now Paralyzed, and discard an Energy from that Pokémon."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { hasCondition } from '../rules/special-conditions.mjs';

const TEXT = "Flip a coin. If heads, your opponent’s Active Pokémon is now Paralyzed, and discard an Energy from that Pokémon.";

let nextId = 1;
const filler = () => createCard({ instanceId: nextId++, name: 'Card', supertype: 'Trainer', type: 'Item' });

function board(foeEnergies) {
  nextId = 1000;
  const state = createGameState({ gameId: 'drowning-ball', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) {
      state.players[id].zones.prizes.push(filler());
      state.players[id].zones.deck.push(filler());
    }
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1, name: 'Araquanid', supertype: 'Pokémon', stage: 'Stage 1', hp: 90,
      attacks: [{ name: 'Drowning Ball', cost: [], damage: '20', text: TEXT }],
    })
  );
  state.players.p2.zones.active.push(createCard({ instanceId: 2, name: 'Foe', supertype: 'Pokémon', stage: 'Basic', hp: 300 }));
  for (const [name, subtypes] of foeEnergies) {
    state.players.p2.zones.active.push(
      createCard({ instanceId: nextId++, name, supertype: 'Energy', type: 'Energy', subtypes, attachedTo: 2 })
    );
  }
  state.players.p2.zones.bench.push(createCard({ instanceId: 3, name: 'Bench', supertype: 'Pokémon', stage: 'Basic', hp: 100 }));
  return state;
}

// Heads and tails are fixed by the rng stub: next() < 0.5 reads as heads.
const run = (state, face) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, { ...createRng(5), next: () => (face === 'heads' ? 0 : 0.9) });

const attachedNames = (res) =>
  res.state.players.p2.zones.active.filter((c) => c.attachedTo === 2).map((c) => c.name);

function settle(res) {
  // The attacker may be asked which Energy to discard when several qualify.
  if (res.pendingChoice) {
    return applyCommand(res.state, {
      type: 'resolveChoice',
      payload: { choiceId: res.pendingChoice.choiceId, selection: [res.pendingChoice.options[0].instanceId] },
      playerId: res.pendingChoice.player || 'p1',
    }, createRng(5));
  }
  return res;
}

test('Drowning Ball heads: Paralyzes and discards a basic Energy', () => {
  const res = settle(run(board([['Water Energy', ['Basic']]]), 'heads'));
  assert.equal(res.error, null);
  assert.deepEqual(attachedNames(res), []);
  assert.ok(hasCondition(res.state.players.p2.zones.active.find((c) => c.instanceId === 2), 'Paralyzed'));
});

test('Drowning Ball heads: a special Energy (Double Colorless) is discardable too', () => {
  const res = settle(run(board([['Double Colorless Energy', ['Special']]]), 'heads'));
  assert.equal(res.error, null);
  assert.deepEqual(attachedNames(res), []);
  assert.ok(res.state.players.p2.zones.discard.some((c) => c.name === 'Double Colorless Energy'));
});

test('Drowning Ball heads: only one Energy goes when several are attached', () => {
  const res = settle(run(board([['Water Energy', ['Basic']], ['Double Colorless Energy', ['Special']]]), 'heads'));
  assert.equal(attachedNames(res).length, 1);
});

test('Drowning Ball tails: nothing is discarded', () => {
  const res = run(board([['Water Energy', ['Basic']]]), 'tails');
  assert.equal(res.error, null);
  assert.deepEqual(attachedNames(res), ['Water Energy']);
});
