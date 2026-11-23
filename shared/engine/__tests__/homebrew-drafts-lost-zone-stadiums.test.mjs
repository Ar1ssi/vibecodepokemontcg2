// Design 091 slice 3: "Put the other card in the Lost Zone" (Comfey Flower Selecting, Crown Zenith GG14 in
// out/pkmn-pokemon-cards.json; customhb draft Morelull Spore Drift prints the same text) and the draft
// Stadiums Proving Grounds (Po Town wording with "his or her", Burning Shadows 121) and Lost Shrine
// (Lost City, Lost Origin 161).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { isStadiumLostCity, isStadiumTriggered } from '../rules/stadium-effects.mjs';
import { stadiumOnEvolveTriggers } from '../rules/stadium-triggers.mjs';

const FLOWER_SELECTING =
  'Once during your turn, if this Pokémon is in the Active Spot, you may look at the top 2 cards of your deck and put 1 of them into your hand. Put the other card in the Lost Zone.';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 100, types: ['Psychic'], ...extra });
const item = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Item'], type: 'Item' });
const stadium = (name, text) => createCard({ instanceId: nextId++, name, type: 'Trainer', trainerType: 'Stadium', text });

function game(holder, deckSize) {
  const state = createGameState({ gameId: 'hb-drafts-091', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
  }
  for (let i = 0; i < deckSize; i++) state.players.p1.zones.deck.push(item(`deck ${i}`));
  state.players.p1.zones.active.push(holder);
  state.players.p2.zones.active.push(mon('Def'));
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  return state;
}

const run = (state, type, payload) => applyCommand(state, { type, playerId: 'p1', payload }, createRng(3));
function useAndKeepFirst(state, holder) {
  let res = run(state, 'useAbility', { instanceId: holder.instanceId, abilityIndex: 0 });
  for (let n = 0; res && !res.error && res.state.pendingChoice && n < 10; n++) {
    const pc = res.state.pendingChoice;
    res = run(res.state, 'resolveChoice', { choiceId: pc.choiceId, selection: [pc.options[0].instanceId] });
  }
  return res;
}
const names = (cards) => cards.map((c) => c.name);

for (const name of ['Comfey', 'Morelull']) {
  test(`${name}: one of the top 2 to hand, the other to the Lost Zone`, () => {
    const holder = mon(name, { abilities: [{ type: 'Ability', name: 'Flower Selecting', text: FLOWER_SELECTING }] });
    const res = useAndKeepFirst(game(holder, 5), holder);
    assert.equal(res.error ?? null, null);
    const zones = res.state.players.p1.zones;
    assert.deepEqual(names(zones.hand), ['deck 0']);
    assert.deepEqual(names(zones.lostZone), ['deck 1']);
    assert.equal(zones.deck.length, 3);
  });
}

test('Flower Selecting with 1 card in the deck: that card to hand, nothing to the Lost Zone', () => {
  const holder = mon('Comfey', { abilities: [{ type: 'Ability', name: 'Flower Selecting', text: FLOWER_SELECTING }] });
  const res = useAndKeepFirst(game(holder, 1), holder);
  assert.deepEqual(names(res.state.players.p1.zones.hand), ['deck 0']);
  assert.deepEqual(res.state.players.p1.zones.lostZone, []);
});

test('Proving Grounds ("his or her hand") is a recognized evolve trigger placing 2 damage counters', () => {
  const proving = stadium(
    'Proving Grounds',
    'Whenever either player plays a Pokémon from his or her hand to evolve 1 of his or her Pokémon, put 2 damage counters on that Pokémon.'
  );
  assert.equal(isStadiumTriggered(proving), true);
  assert.deepEqual(stadiumOnEvolveTriggers(proving, { evolvedCard: mon('Scrafty'), hostTop: mon('Scraggy') }), [
    { kind: 'damage', amount: 20, source: 'Proving Grounds' },
  ]);
});

test('Lost Shrine reads as Lost City', () => {
  const shrine = stadium(
    'Lost Shrine',
    "Whenever a Pokémon (either yours or your opponent's) is Knocked Out, put that Pokémon in the Lost Zone instead of the discard pile. (Discard all attached cards.)"
  );
  assert.equal(isStadiumLostCity(shrine), true);
});
