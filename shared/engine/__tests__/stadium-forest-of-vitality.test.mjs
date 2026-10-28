// Forest of Vitality (customhb-117, homebrew text from client/src/assets/custom-sets/customhb/set.json):
// "During either player's turn, if a player evolves a {G} Pokémon, that player may search their deck
// for a Basic {G} Energy card and attach it to that Pokémon. Then, that player must shuffle their deck."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, findCard } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { createRng } from '../rng.mjs';
import { stadiumEvolveSearchEnergy, stadiumOnEvolveTriggers } from '../rules/stadium-triggers.mjs';
import { stadiumAllowsSameTurnEvolution } from '../rules/stadium-effects.mjs';

const TEXT =
  'During either player’s turn, if a player evolves a {G} Pokémon, that player may search their deck for a Basic {G} Energy card and attach it to that Pokémon. Then, that player must shuffle their deck.';

let nextId = 4000;
const card = (props) => createCard({ instanceId: nextId++, ...props });
const forest = () => card({ name: 'Forest of Vitality', type: 'Trainer', trainerType: 'Stadium', text: TEXT });
const mon = (name, props = {}) => card({ name, supertype: 'Pokémon', hp: 100, stage: 'Basic', ...props });
const basicEnergy = (name, type) =>
  card({ name, type: 'Energy', subtypes: ['Basic'], types: [type], energyType: type });

function setup({ types = ['Grass'], evolveTypes = types } = {}) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const { p1, p2 } = state.players;
  const base = mon('Bulbasaur', { types, enteredPlayTurn: 1 });
  p1.zones.active.push(base);
  p2.zones.active.push(mon('Riolu'));
  for (let i = 0; i < 6; i++) {
    p1.zones.prizes.push(card({ name: `p1p${i}` }));
    p2.zones.prizes.push(card({ name: `p2p${i}` }));
  }
  const grass = basicEnergy('Grass Energy', 'Grass');
  const fire = basicEnergy('Fire Energy', 'Fire');
  const special = card({ name: 'Jet Energy', type: 'Energy', subtypes: ['Special'], types: ['Colorless'] });
  p1.zones.deck.push(card({ name: 'filler a' }), fire, special, grass, card({ name: 'filler b' }));
  const evolution = mon('Ivysaur', { types: evolveTypes, stage: 'Stage 1', evolvesFrom: 'Bulbasaur' });
  p1.zones.hand.push(evolution);
  state.stadium = forest();
  return { state, base, evolution, grass, fire, special, rng: createRng(7) };
}

const evolve = ({ state, base, evolution, rng }) =>
  applyCommand(
    state,
    { type: 'attachCard', payload: { instanceId: evolution.instanceId, targetInstanceId: base.instanceId }, playerId: 'p1' },
    rng
  );
const choose = (res, selection, rng) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: res.state.pendingChoice.player, payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    rng
  );

test('stadiumEvolveSearchEnergy reads the Pokémon and Energy types from the printed text', () => {
  assert.equal(stadiumEvolveSearchEnergy(forest(), { hostTop: mon('Ivysaur', { types: ['Grass'] }) }), 'grass');
  assert.equal(stadiumEvolveSearchEnergy(forest(), { hostTop: mon('Charmeleon', { types: ['Fire'] }) }), null);
  assert.equal(stadiumEvolveSearchEnergy(forest(), {}), null);
  assert.equal(stadiumEvolveSearchEnergy(card({ name: 'Other', text: 'Heal 10 damage.' }), { hostTop: mon('X', { types: ['Grass'] }) }), null);
});

test('the homebrew text no longer relaxes the evolve gate and adds no evolve damage/heal trigger', () => {
  const s = forest();
  assert.equal(
    stadiumAllowsSameTurnEvolution(s, { playerId: 'p1', pokemon: mon('A', { types: ['Grass'] }), evolution: mon('B', { types: ['Grass'] }) }),
    false
  );
  assert.deepEqual(stadiumOnEvolveTriggers(s, { evolvedCard: mon('B'), hostTop: mon('A') }), []);
});

test('evolving a {G} Pokémon offers only Basic {G} Energy; the pick is attached and the deck shuffled', () => {
  const b = setup();
  const res = evolve(b);
  assert.equal(res.error, null);
  const choice = res.state.pendingChoice;
  assert.equal(choice.player, 'p1');
  assert.deepEqual(choice.options.map((o) => o.instanceId), [b.grass.instanceId]);
  assert.equal(choice.min, 0);

  const done = choose(res, [b.grass.instanceId], b.rng);
  assert.equal(done.error, null);
  assert.equal(findCard(done.state, b.grass.instanceId).card.attachedTo, b.base.instanceId);
  assert.ok(done.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p1'));
  assert.equal(done.state.pendingChoice, null);
});

test('declining the search attaches nothing and does not shuffle', () => {
  const b = setup();
  const res = evolve(b);
  const done = choose(res, [], b.rng);
  assert.equal(done.error, null);
  assert.equal(findCard(done.state, b.grass.instanceId).zoneId, 'deck');
  assert.ok(!done.events.some((e) => e.type === 'deckShuffled'));
});

test('a non-{G} evolution gets no offer', () => {
  const b = setup({ types: ['Fire'] });
  const res = evolve(b);
  assert.equal(res.error, null);
  assert.equal(res.state.pendingChoice ?? null, null);
});

test('no Basic {G} Energy in the deck: no offer', () => {
  const b = setup();
  b.state.players.p1.zones.deck = b.state.players.p1.zones.deck.filter((c) => c !== b.grass);
  const res = evolve(b);
  assert.equal(res.error, null);
  assert.equal(res.state.pendingChoice ?? null, null);
});
