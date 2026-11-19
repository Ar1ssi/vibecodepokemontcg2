// Steven's Metagross ex X-Boot, printed text from out/pkmn-pokemon-cards.json (Destined Rivals 145,
// Ascended Heroes 289).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAbility } from '../rules/abilities.mjs';

const X_BOOT =
  'Once during your turn, you may search your deck for a Basic {P} Energy card, a Basic {M} Energy card, or 1 of each and attach them to your {P} Pokémon and {M} Pokémon in any way you like. Then, shuffle your deck.';
const rng = createRng(4);

const mon = (instanceId, name, types, extra = {}) =>
  createCard({ instanceId, name, hp: 200, supertype: 'Pokémon', stage: 'Basic', types, ownerId: 'p1', ...extra });
const energy = (instanceId, type) =>
  createCard({ instanceId, name: `Basic ${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], types: [type], ownerId: 'p1' });

// Metagross (70, {M}) Active; Gardevoir (72, {P}) and Charmander (73, {R}) on the Bench.
// Deck: Psychic 81, 82 · Metal 83, 84 · Fire 85.
function board() {
  const state = createGameState({ gameId: 'x-boot', seed: 4, rulesEnabled: true });
  for (const p of ['p1', 'p2']) {
    state.players[p] = { playerId: p, username: p, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const z = state.players.p1.zones;
  z.active.push(
    mon(70, "Steven's Metagross ex", ['Metal'], { abilities: [{ name: 'X-Boot', type: 'Ability', text: X_BOOT }] })
  );
  z.bench.push(mon(72, 'Gardevoir', ['Psychic']), mon(73, 'Charmander', ['Fire']));
  z.deck.push(energy(81, 'Psychic'), energy(82, 'Psychic'), energy(83, 'Metal'), energy(84, 'Metal'), energy(85, 'Fire'));
  state.players.p2.zones.active.push(mon(71, 'Opp', ['Water'], { ownerId: 'p2' }));
  return state;
}

const ids = (cards) => cards.map((c) => c.instanceId).sort((a, b) => a - b);
const use = (state) => applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
const pick = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', payload: { choiceId: res.pendingChoice.choiceId, selection }, playerId: res.pendingChoice.player },
    rng
  );
const attachedTo = (state, id) => state.players.p1.zones[['active', 'bench'].find((z) =>
  state.players.p1.zones[z].some((c) => c.instanceId === id))]?.find((c) => c.instanceId === id)?.attachedTo ?? null;

test('parses to one deck search: up to 2, one each of {P} and {M}, no stray attach step', () => {
  const steps = parseAbility(X_BOOT);
  assert.deepEqual(steps.map((s) => s.type), ['searchAbility']);
  assert.equal(steps[0].count, 2);
  assert.equal(steps[0].upTo, true);
  assert.deepEqual(steps[0].oneEachOf, ['Psychic', 'Metal']);
  assert.equal(steps[0].attachEach, true);
});

test('offers only Basic {P} and {M} Energy, up to 2', () => {
  const res = use(board());
  assert.equal(res.error, null);
  assert.deepEqual(ids(res.pendingChoice.options), [81, 82, 83, 84]);
  assert.equal(res.pendingChoice.max, 2);
  assert.equal(res.pendingChoice.min, 0);
});

test('1 of each: the {P} Energy goes on Gardevoir and the {M} Energy on Metagross', () => {
  const asked = pick(use(board()), [81, 83]);
  assert.equal(asked.error, null);
  // Only {P} and {M} Pokémon are targets: Charmander is not.
  assert.deepEqual(ids(asked.pendingChoice.options), [70, 72]);
  const second = pick(asked, [72]);
  assert.deepEqual(ids(second.pendingChoice.options), [70, 72]);
  const done = pick(second, [70]);
  assert.equal(done.error, null);
  assert.equal(done.pendingChoice, null);
  assert.equal(attachedTo(done.state, 81), 72);
  assert.equal(attachedTo(done.state, 83), 70);
  assert.equal(done.state.players.p1.zones.deck.length, 3);
});

test('just a {M} Energy is allowed', () => {
  const asked = pick(use(board()), [84]);
  const done = pick(asked, [72]);
  assert.equal(done.error, null);
  assert.equal(attachedTo(done.state, 84), 72);
  assert.equal(done.state.players.p1.zones.deck.length, 4);
});

test('two of the same type is not "1 of each": only one of them is taken', () => {
  const asked = pick(use(board()), [81, 82]);
  const done = asked.pendingChoice ? pick(asked, [72]) : asked;
  assert.equal(done.error, null);
  assert.equal(done.pendingChoice, null);
  const attached = [81, 82].filter((id) => attachedTo(done.state, id) != null);
  assert.equal(attached.length, 1);
  assert.equal(done.state.players.p1.zones.deck.length, 4);
});
