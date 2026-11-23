// "You can't use more than 1 Quick Search Ability each turn." Each Pokémon tracks its own
// once-per-turn use, so two Pidgeot ex on the Bench each searched once. The clause limits the
// Ability by name across every copy. Texts: customhb-767 Pidgeot ex (set.json), and the
// Dudunsparce Run Away Draw text in ability-shuffle-self.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { abilityNameLimitKey } from '../rules/ability-executors.mjs';

const QUICK_SEARCH =
  "Once during your turn, you may search your deck for a card and put it into your hand. Then, shuffle your deck. You can't use more than 1 Quick Search Ability each turn.";
const RUN_AWAY_DRAW =
  "Once during your turn, you may draw 3 cards. If you drew any cards in this way, shuffle this Pokémon and all attached cards into your deck. You can't use more than 1 Run Away Draw Ability each turn.";
const REFINEMENT = 'Once during your turn, you may draw 2 cards.';

function setup() {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'name-limit', seed: 42, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
    for (let i = 0; i < 10; i++) {
      state.players[id].zones.deck.push(createCard({ instanceId: 500 + (id === 'p2' ? 100 : 0) + i, name: `${id} deck ${i}` }));
    }
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(createCard({ instanceId: 1, name: 'Active', hp: 100, supertype: 'Pokémon' }));
  return { state, rng };
}

const mon = (instanceId, name, abilityName, text, stage = 'Stage 2') =>
  createCard({
    instanceId,
    name,
    hp: 160,
    supertype: 'Pokémon',
    stage,
    abilityText: text,
    abilities: [{ name: abilityName, type: 'Ability', text }],
  });

const useAbility = (state, rng, instanceId) =>
  applyCommand(state, { type: 'useAbility', payload: { instanceId }, playerId: 'p1' }, rng);

function quickSearch(state, rng, instanceId) {
  const res = useAbility(state, rng, instanceId);
  assert.equal(res.error, null);
  assert.ok(res.pendingChoice, 'Quick Search asks for a card');
  const done = applyCommand(
    res.state,
    {
      type: 'resolveChoice',
      payload: { choiceId: res.pendingChoice.choiceId, selection: [res.pendingChoice.options[0].instanceId] },
      playerId: 'p1',
    },
    rng
  );
  assert.equal(done.error, null);
  return done.state;
}

test('Quick Search: a second Pidgeot ex cannot use it the same turn', () => {
  const { state, rng } = setup();
  state.players.p1.zones.bench.push(
    mon(20, 'Pidgeot ex', 'Quick Search', QUICK_SEARCH),
    mon(21, 'Pidgeot ex', 'Quick Search', QUICK_SEARCH)
  );
  const after = quickSearch(state, rng, 20);
  assert.equal(after.players.p1.zones.hand.length, 1);

  const second = useAbility(after, rng, 21);
  assert.equal(second.error, 'Ability already used this turn.');
  assert.equal(second.state.players.p1.zones.hand.length, 1, 'nothing was searched');
});

test('Quick Search: the limit is per Ability name, not for every Ability', () => {
  const { state, rng } = setup();
  state.players.p1.zones.bench.push(
    mon(20, 'Pidgeot ex', 'Quick Search', QUICK_SEARCH),
    mon(22, 'Kirlia', 'Refinement', REFINEMENT, 'Stage 1')
  );
  const after = quickSearch(state, rng, 20);
  assert.equal(useAbility(after, rng, 22).error, null);
});

test('Quick Search: both Pidgeot ex can search again on a later turn', () => {
  const { state, rng } = setup();
  state.players.p1.zones.bench.push(
    mon(20, 'Pidgeot ex', 'Quick Search', QUICK_SEARCH),
    mon(21, 'Pidgeot ex', 'Quick Search', QUICK_SEARCH)
  );
  let current = quickSearch(state, rng, 20);
  current = applyCommand(current, { type: 'pass', payload: {}, playerId: 'p1' }, rng).state;
  current = applyCommand(current, { type: 'pass', payload: {}, playerId: 'p2' }, rng).state;
  assert.equal(current.turn.player, 'p1');
  assert.equal(useAbility(current, rng, 21).error, null);
});

test('Run Away Draw: the copy that left play still counts, so a second Dudunsparce is refused', () => {
  const { state, rng } = setup();
  state.players.p1.zones.bench.push(
    mon(30, 'Dudunsparce', 'Run Away Draw', RUN_AWAY_DRAW, 'Stage 1'),
    mon(31, 'Dudunsparce', 'Run Away Draw', RUN_AWAY_DRAW, 'Stage 1')
  );
  const first = useAbility(state, rng, 30);
  assert.equal(first.error, null);
  assert.ok(first.state.players.p1.zones.deck.some((c) => c.instanceId === 30), 'the first one left play');

  assert.equal(useAbility(first.state, rng, 31).error, 'Ability already used this turn.');
});

test('abilityNameLimitKey: reads the named Ability and the "in its name" form, else null', () => {
  assert.equal(abilityNameLimitKey(QUICK_SEARCH), abilityNameLimitKey(QUICK_SEARCH.toUpperCase()));
  assert.notEqual(abilityNameLimitKey(QUICK_SEARCH), abilityNameLimitKey(RUN_AWAY_DRAW));
  // Fan Rotom / Squawkabilly ex word it "during your turn" (pokemoncards corpus).
  assert.equal(
    abilityNameLimitKey("You can't use more than 1 Fan Call Ability during your turn."),
    abilityNameLimitKey("You can't use more than 1 Fan Call Ability each turn.")
  );
  // Meowth ex (corpus): the limit covers every Ability with "Last-Ditch" in its name.
  const lastDitch = abilityNameLimitKey('You can’t use more than 1 Ability that has "Last-Ditch" in its name each turn.');
  assert.equal(lastDitch, 'abilityName:last-ditch');
  assert.equal(
    abilityNameLimitKey('You can’t use more than 1 Ability that has “Last-Ditch” in its name each turn.'),
    lastDitch
  );
  assert.equal(abilityNameLimitKey(REFINEMENT), null);
  assert.equal(abilityNameLimitKey(undefined), null);
});
