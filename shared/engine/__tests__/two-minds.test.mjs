// Doduo Two Minds (homebrew customhb): look at the bottom 2 cards of the deck, may move 1 to the top.
// Card text: the user's scan, verbatim; same text in customhb/set.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAbility } from '../rules/abilities.mjs';

const TWO_MINDS =
  'Once during your turn, you may look at the bottom 2 cards of your deck. You may move 1 of those cards to the top of your deck.';

const mon = (instanceId, name, extra = {}) =>
  createCard({ instanceId, name, hp: 100, supertype: 'Pokémon', stage: 'Basic', ...extra });
const card = (instanceId, name) => createCard({ instanceId, name, supertype: 'Trainer', subtypes: ['Item'] });

function board(deckSize = 5) {
  const state = createGameState({ gameId: 'two-minds', seed: 7, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    mon(70, 'Doduo', { abilities: [{ name: 'Two Minds', type: 'Ability', text: TWO_MINDS }] })
  );
  state.players.p2.zones.active.push(mon(71, 'Opp'));
  for (let i = 1; i <= deckSize; i++) state.players.p1.zones.deck.push(card(100 + i, `Card ${i}`));
  return state;
}

const use = (state) => applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, createRng(7));
const choose = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', payload: { choiceId: res.state.pendingChoice.choiceId, selection }, playerId: 'p1' },
    createRng(8)
  );
const deckNames = (state) => state.players.p1.zones.deck.map((c) => c.name);

test('Two Minds parses to bottomCardToTopAbility with count 2', () => {
  const [step] = parseAbility(TWO_MINDS);
  assert.equal(step.type, 'bottomCardToTopAbility');
  assert.equal(step.count, 2);
});

test('Two Minds offers only the bottom 2 cards and moves the chosen one to the top', () => {
  const res = use(board());
  assert.equal(res.error, null);
  assert.deepEqual(res.state.pendingChoice.options.map((o) => o.name), ['Card 4', 'Card 5']);
  assert.equal(res.state.pendingChoice.min, 0);
  assert.equal(res.state.pendingChoice.max, 1);
  const done = choose(res, [104]);
  assert.deepEqual(deckNames(done.state), ['Card 4', 'Card 1', 'Card 2', 'Card 3', 'Card 5']);
});

test('Two Minds declining leaves the deck unchanged but still uses the ability', () => {
  const res = use(board());
  const done = choose(res, []);
  assert.deepEqual(deckNames(done.state), ['Card 1', 'Card 2', 'Card 3', 'Card 4', 'Card 5']);
  assert.equal(use(done.state).error !== null, true, 'once during your turn');
});

test('Two Minds with a 1-card deck looks at that one card; an empty deck does nothing', () => {
  const one = use(board(1));
  assert.equal(one.state.pendingChoice.options.length, 1);
  const empty = use(board(0));
  assert.equal(empty.error, null);
  assert.equal(empty.state.pendingChoice ?? null, null);
});
