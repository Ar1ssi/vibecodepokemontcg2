// Deslop round 2, reduce/: an attack whose attacker vanished while it waited on a choice still
// ends the turn; a turn player's Stadium coins obey Malamar Contrary like every other flip; a
// non-numeric cardStats hp never overwrites a card's HP with NaN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones, findCard } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { applyCommand } from '../../reduce.mjs';
import { createPendingChoice } from '../../effects/executor.mjs';

// out/pkmn-ancient-trait-cards.json, Malamar "Ability => Contrary".
const CONTRARY =
  'If this Pokémon is your Active Pokémon, whenever your opponent flips a coin during his or her turn, treat it as tails.';
// out/pkmn-wotc-cards.json, Rocket's Minefield Gym.
const MINEFIELD =
  'Whenever a player puts a Basic Pokémon onto his or her Bench from his or her hand, he or she flips a coin. If tails, put damage counters on that Pokémon.';
// Chaos Gym and Mirage Stadium: the wording stadium-triggers.test.mjs pins.
const CHAOS =
  "Whenever a player plays a Trainer card other than a Stadium card, he or she flips a coin. If heads, that player plays that card normally. If tails, the player can't play that card.";
const MIRAGE =
  "Whenever a player tries to retreat a Pokémon during his or her turn, that player flips a coin. If heads, that player retreats that Pokémon (and discards Energy normally). If tails, that Pokémon can't retreat this turn (the player doesn't discard any Energy).";

let nextId = 1;
const card = (props) => createCard({ instanceId: nextId++, ...props });
const pokemon = (name, props = {}) => card({ name, supertype: 'Pokémon', hp: 100, stage: 'Basic', ...props });
const stadium = (name, text) => card({ name, type: 'Trainer', trainerType: 'Stadium', text });

// Every flip the rng produces is heads, so only a forced face can turn one to tails.
const alwaysHeads = { next: () => 0.1, shuffle: (a) => [...a] };

function board({ contrary = true } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'deslop2', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(card({ name: `${id} prize ${i}` }));
    for (let i = 0; i < 6; i++) state.players[id].zones.deck.push(card({ name: `${id} deck ${i}` }));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(pokemon('Ralts'));
  state.players.p2.zones.active.push(
    pokemon('Malamar', contrary ? { abilities: [{ name: 'Contrary', type: 'Ability', text: CONTRARY }] } : {})
  );
  return state;
}

test("Rocket's Minefield Gym: Contrary turns the benching player's flip to tails", () => {
  const state = board();
  state.stadium = stadium("Rocket's Minefield Gym", MINEFIELD);
  const basic = pokemon('Pikachu');
  state.players.p1.zones.hand.push(basic);
  const res = applyCommand(
    state,
    { type: 'moveCard', payload: { instanceId: basic.instanceId, from: 'hand', to: 'bench' }, playerId: 'p1' },
    alwaysHeads
  );
  assert.equal(res.error, null);
  assert.equal(res.events.find((e) => e.type === 'coinFlipped').face, 'tails');
  assert.equal(findCard(res.state, basic.instanceId).card.damage, 20);
});

test("Rocket's Minefield Gym: without Contrary the same rng still flips heads", () => {
  const state = board({ contrary: false });
  state.stadium = stadium("Rocket's Minefield Gym", MINEFIELD);
  const basic = pokemon('Pikachu');
  state.players.p1.zones.hand.push(basic);
  const res = applyCommand(
    state,
    { type: 'moveCard', payload: { instanceId: basic.instanceId, from: 'hand', to: 'bench' }, playerId: 'p1' },
    alwaysHeads
  );
  assert.equal(res.events.find((e) => e.type === 'coinFlipped').face, 'heads');
  assert.equal(findCard(res.state, basic.instanceId).card.damage ?? 0, 0);
});

test('Chaos Gym: Contrary makes the turn player\'s Tool play flip tails', () => {
  const state = board();
  state.stadium = stadium('Chaos Gym', CHAOS);
  const tool = card({
    name: 'Test Tool',
    type: 'Trainer',
    trainerType: 'Tool',
    subtypes: ['Pokémon Tool'],
    text: 'The Pokémon this card is attached to gets +10 HP.',
  });
  state.players.p1.zones.hand.push(tool);
  const host = state.players.p1.zones.active[0];
  const res = applyCommand(
    state,
    { type: 'attachCard', payload: { instanceId: tool.instanceId, targetInstanceId: host.instanceId }, playerId: 'p1' },
    alwaysHeads
  );
  assert.equal(res.error, null);
  assert.equal(res.events.find((e) => e.type === 'coinFlipped').face, 'tails');
  assert.ok(res.events.some((e) => e.type === 'trainerPlayBlocked'));
});

test('Mirage Stadium: Contrary makes the retreat flip tails', () => {
  const state = board();
  state.stadium = stadium('Mirage Stadium', MIRAGE);
  const active = state.players.p1.zones.active[0];
  const bench = pokemon('Bench');
  state.players.p1.zones.bench.push(bench);
  const res = applyCommand(
    state,
    { type: 'retreat', payload: { benchInstanceId: bench.instanceId }, playerId: 'p1' },
    alwaysHeads
  );
  assert.equal(res.error, null);
  assert.equal(res.events.find((e) => e.type === 'coinFlipped').face, 'tails');
  assert.equal(findCard(res.state, active.instanceId).card.cannotRetreatUntilTurn, 3);
});

test('an attack whose attacker left the Active Spot while a choice was pending still ends the turn', () => {
  const state = board({ contrary: false });
  state.players.p1.zones.hand.push(card({ name: 'Hand card' }));
  const handCard = state.players.p1.zones.hand[0];
  state.pendingChoice = createPendingChoice({
    player: 'p1',
    prompt: 'Reduce the damage?',
    options: [{ instanceId: handCard.instanceId, name: 'Hand card', type: 'option' }],
    min: 0,
    max: 1,
    resumeToken: {
      effectType: 'attackCharityReduction',
      initiatorPlayerId: 'p1',
      attackName: 'Gone',
      attackerId: 999999,
    },
  });
  const res = applyCommand(
    state,
    { type: 'resolveChoice', payload: { choiceId: state.pendingChoice.choiceId, selection: [] }, playerId: 'p1' },
    alwaysHeads
  );
  assert.equal(res.error, null);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(res.state.turn.player, 'p2');
});

test('cardStats ignores a non-numeric hp instead of storing NaN', () => {
  const state = board({ contrary: false });
  state.turn = { player: null, number: 1, phase: 'setup' };
  const loaded = applyCommand(
    state,
    { type: 'loadDeck', payload: { deckData: [[1, 'Pikachu', 'Pokémon', '', '1', 'base1', 'base1-1']] }, playerId: 'p1' },
    alwaysHeads
  );
  assert.equal(loaded.error, null);
  const deckCard = loaded.state.players.p1.zones.deck[0];
  const stat = (hp) =>
    applyCommand(
      loaded.state,
      { type: 'cardStats', payload: { stats: [{ syncInstance: deckCard.syncInstance, hp }] }, playerId: 'p1' },
      alwaysHeads
    );
  const set = stat(60);
  assert.equal(set.state.players.p1.zones.deck[0].hp, 60);
  const bad = applyCommand(
    set.state,
    { type: 'cardStats', payload: { stats: [{ syncInstance: deckCard.syncInstance, hp: 'abc' }] }, playerId: 'p1' },
    alwaysHeads
  );
  assert.equal(bad.error, null);
  assert.equal(bad.state.players.p1.zones.deck[0].hp, 60);
});
