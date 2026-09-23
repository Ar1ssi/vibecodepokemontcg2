// "Draw, then shuffle this Pokémon and all attached cards into your deck" (Dudunsparce, Run Away Draw).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const TEXT =
  "Run Away Draw: Once during your turn, you may draw 3 cards. If you drew any cards in this way, shuffle this Pokémon and all attached cards into your deck. You can't use more than 1 Run Away Draw Ability each turn.";

function setup({ deckSize = 10, zone = 'bench' } = {}) {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'run-away-draw', seed: 42, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const p1 = state.players.p1;
  const dudunsparce = createCard({
    instanceId: 10,
    name: 'Dudunsparce',
    hp: 140,
    supertype: 'Pokémon',
    stage: 'Stage 1',
    abilityText: TEXT,
    abilities: [{ name: 'Run Away Draw', type: 'Ability', text: TEXT }],
  });
  dudunsparce.damage = 30;
  const energy = createCard({ instanceId: 11, name: 'Basic Colorless Energy', supertype: 'Energy', attachedTo: 10 });
  const other = createCard({ instanceId: 12, name: 'Dunsparce', hp: 60, supertype: 'Pokémon', stage: 'Basic' });
  p1.zones[zone].push(dudunsparce, energy);
  p1.zones.bench.push(other);
  if (zone !== 'active') p1.zones.active.push(createCard({ instanceId: 13, name: 'Active', hp: 100, supertype: 'Pokémon' }));
  for (let i = 0; i < deckSize; i++) p1.zones.deck.push(createCard({ instanceId: 100 + i, name: `Deck ${i}` }));
  return { state, rng };
}

const use = ({ state, rng }) =>
  applyCommand(state, { type: 'useAbility', payload: { instanceId: 10 }, playerId: 'p1' }, rng);
const allIds = (zones) => Object.values(zones).flat().map((c) => c.instanceId);

test('Run Away Draw: draws 3 then shuffles the Pokémon and attached cards into the deck', () => {
  const res = use(setup());
  assert.equal(res.error, null);
  const { zones } = res.state.players.p1;
  assert.equal(zones.hand.length, 3);
  assert.ok(!zones.bench.some((c) => c.instanceId === 10 || c.instanceId === 11), 'left the Bench');
  const deckIds = zones.deck.map((c) => c.instanceId);
  assert.ok(deckIds.includes(10) && deckIds.includes(11), 'Pokémon and Energy are in the deck');
  assert.equal(zones.deck.length, 9);
  assert.equal(zones.deck.find((c) => c.instanceId === 10).damage, 0);
  assert.equal(zones.deck.find((c) => c.instanceId === 11).attachedTo, null);
  assert.equal(new Set(allIds(zones)).size, allIds(zones).length, 'no duplicated cards');
});

test('Run Away Draw: an empty deck draws nothing, so the Pokémon stays in play', () => {
  const res = use(setup({ deckSize: 0 }));
  assert.equal(res.error, null);
  const { zones } = res.state.players.p1;
  assert.equal(zones.hand.length, 0);
  assert.ok(zones.bench.some((c) => c.instanceId === 10), 'still on the Bench');
  assert.ok(zones.bench.some((c) => c.attachedTo === 10), 'Energy still attached');
});

test('Run Away Draw from the Active Spot promotes the lone Benched Pokémon', () => {
  const res = use(setup({ zone: 'active' }));
  assert.equal(res.error, null);
  const { zones } = res.state.players.p1;
  assert.ok(zones.deck.some((c) => c.instanceId === 10));
  assert.deepEqual(zones.active.map((c) => c.instanceId), [12]);
  assert.equal(res.state.winner ?? null, null);
});
