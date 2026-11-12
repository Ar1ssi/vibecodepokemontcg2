// Dodrio Three of a Kind (homebrew customhb): usable only with exactly 3 Pokémon of one name in play.
// Card text: the user's scan, verbatim; same text in customhb/set.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const THREE_OF_A_KIND = 'Once during your turn, if you have exactly 3 Pokémon with the same name in play, you may draw 3 cards.';

const mon = (instanceId, name, extra = {}) =>
  createCard({ instanceId, name, hp: 100, supertype: 'Pokémon', stage: 'Basic', ...extra });
const dodrio = (instanceId) =>
  mon(instanceId, 'Dodrio', { abilities: [{ name: 'Three of a Kind', type: 'Ability', text: THREE_OF_A_KIND }] });

/** p1 has Dodrio Active plus the named Pokémon on the Bench. */
function board(benchNames) {
  const state = createGameState({ gameId: 'three-kind', seed: 7, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(dodrio(70));
  benchNames.forEach((name, i) => state.players.p1.zones.bench.push(mon(80 + i, name)));
  state.players.p2.zones.active.push(mon(71, 'Opp'));
  for (let i = 0; i < 10; i++) state.players.p1.zones.deck.push(mon(200 + i, `Deck ${i}`));
  return state;
}

const use = (state) => applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, createRng(7));

test('Three of a Kind draws 3 with exactly 3 same-name Pokémon (this one and two on the Bench)', () => {
  const res = use(board(['Dodrio', 'Dodrio', 'Pidgey']));
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 3);
});

for (const [label, bench] of [
  ['two of a kind', ['Dodrio', 'Pidgey']],
  ['four of a kind', ['Dodrio', 'Dodrio', 'Dodrio']],
  ['all different names', ['Pidgey', 'Rattata']],
]) {
  test(`Three of a Kind is refused with ${label}, and nothing is drawn or spent`, () => {
    const state = board(bench);
    const res = use(state);
    assert.match(res.error, /exactly 3 Pokémon with the same name/);
    assert.equal(res.state.players.p1.zones.hand.length, 0);
    assert.equal(res.state.players.p1.flags.abilitiesUsed[70] ?? false, false, 'the once-per-turn use is not consumed');
  });
}

test('Three of a Kind counts a different name that has exactly 3 (not only Dodrio)', () => {
  const res = use(board(['Pidgey', 'Pidgey', 'Pidgey']));
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 3);
});
