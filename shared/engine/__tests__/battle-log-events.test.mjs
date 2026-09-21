// Design 021 / I71: drive real commands through applyCommand and feed the emitted events to the
// client's pure battle-log mapper. Proves the server payloads carry the fields the mapper phrases
// from (actor, names, counts) instead of mocking the events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { serverBattleLogLines } from '../../../client/src/setup/netcode/server-battle-log.mjs';

const NAME_BY_ID = {
  1: 'Pikachu',
  2: 'Raichu',
  3: 'Squirtle',
  4: 'Water Energy',
  5: 'Air Balloon',
  7: 'Potion',
  20: 'Blastoise',
};
const resolveName = (instanceId) => NAME_BY_ID[instanceId] || null;

const eventLines = (events, selfPlayerId) =>
  (events || []).flatMap((event) =>
    serverBattleLogLines(event, selfPlayerId, resolveName)
  );

function makeState() {
  const state = createGameState({
    gameId: 'battle-log',
    seed: 1,
    rulesEnabled: true,
  });
  state.players.p1 = {
    playerId: 'p1',
    username: 'Ash',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {}, supporterPlayed: false },
  };
  state.players.p2 = {
    playerId: 'p2',
    username: 'Gary',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {}, supporterPlayed: false },
  };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return state;
}

test('playing an Item emits trainerPlayed, phrased for each player', () => {
  const state = makeState();
  state.players.p1.zones.hand.push(
    createCard({
      instanceId: 7,
      name: 'Potion',
      supertype: 'Trainer',
      trainerType: 'Item',
      text: 'Heal 30 damage from 1 of your Pokémon.',
    })
  );

  const res = applyCommand(
    state,
    { type: 'playTrainer', payload: { instanceId: 7 }, playerId: 'p1' },
    createRng(1)
  );

  const playEvent = res.events.find((e) => e.type === 'trainerPlayed');
  assert.ok(playEvent, 'a trainerPlayed event is emitted');
  assert.equal(playEvent.name, 'Potion');
  assert.deepEqual(eventLines([playEvent], 'p1'), ['You played Potion.']);
  assert.deepEqual(eventLines([playEvent], 'p2'), [
    'Your opponent played Potion.',
  ]);
});

test('attaching Energy emits a cardAttached line naming card and host', () => {
  const state = makeState();
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, name: 'Pikachu', hp: 60, types: ['Lightning'] })
  );
  state.players.p1.zones.hand.push(
    createCard({
      instanceId: 4,
      name: 'Water Energy',
      supertype: 'Energy',
      type: 'Energy',
    })
  );

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 4, targetInstanceId: 1 },
    playerId: 'p1',
  });

  assert.equal(res.error, null);
  const lines = eventLines(res.events, 'p1');
  assert.ok(
    lines.includes('⚡ You attached Water Energy to Pikachu.'),
    `got: ${JSON.stringify(lines)}`
  );
});

test('a played Tool emits cardAttached, not trainerPlayed', () => {
  const state = makeState();
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, name: 'Pikachu', hp: 60, types: ['Lightning'] })
  );
  state.players.p1.zones.hand.push(
    createCard({
      instanceId: 5,
      name: 'Air Balloon',
      supertype: 'Trainer',
      trainerType: 'Item',
      subtypes: ['Pokémon Tool'],
    })
  );

  const res = applyCommand(
    state,
    {
      type: 'playTrainer',
      payload: { instanceId: 5, targetInstanceId: 1 },
      playerId: 'p1',
    },
    createRng(1)
  );

  assert.equal(res.error, null);
  assert.ok(
    !res.events.some((e) => e.type === 'trainerPlayed'),
    'a Tool must not emit trainerPlayed'
  );
  assert.ok(
    res.events.some((e) => e.type === 'cardAttached'),
    'a Tool is announced by cardAttached'
  );
  assert.deepEqual(eventLines(res.events, 'p1'), [
    '⚡ You attached Air Balloon to Pikachu.',
  ]);
});

test('evolving a Pokémon emits pokemonEvolved and NOT cardAttached', () => {
  const state = makeState();
  state.turn.number = 3; // the server blocks evolution on turn numbers 1 and 2
  const pikachu = createCard({
    instanceId: 1,
    name: 'Pikachu',
    hp: 60,
    types: ['Lightning'],
    enteredPlayTurn: 1,
  });
  const raichu = createCard({
    instanceId: 2,
    name: 'Raichu',
    hp: 120,
    types: ['Lightning'],
    stage: 'Stage 1',
    evolvesFrom: 'Pikachu',
  });
  state.players.p1.zones.active.push(pikachu);
  state.players.p1.zones.hand.push(raichu);

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 2, targetInstanceId: 1 },
    playerId: 'p1',
  });

  assert.equal(res.error, null);
  assert.ok(
    res.events.some((e) => e.type === 'pokemonEvolved'),
    'pokemonEvolved is emitted'
  );
  assert.ok(
    !res.events.some((e) => e.type === 'cardAttached'),
    'cardAttached is suppressed for a Pokémon attach'
  );
  assert.deepEqual(eventLines(res.events, 'p1'), ['✨ Raichu evolved onto Pikachu.']);
});

// Resolves every pending choice (prizes, promotion) so the tail-of-command events are collected.
function settleChoices(res, rng) {
  let events = [...(res.events || [])];
  let current = res;
  while (current.state?.pendingChoice) {
    const choice = current.state.pendingChoice;
    const selection = choice.options
      .slice(0, choice.min || 1)
      .map((o) => o.instanceId);
    current = applyCommand(
      current.state,
      {
        type: 'resolveChoice',
        payload: { choiceId: choice.choiceId, selection },
        playerId: choice.player,
      },
      rng
    );
    events = events.concat(current.events || []);
  }
  return events;
}

test('a knockout, its prizes and the promotion all narrate', () => {
  const state = makeState();
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Pikachu',
      hp: 60,
      types: ['Lightning'],
      attacks: [{ name: 'Thunder Jolt', cost: [], damage: 60 }],
    })
  );
  state.players.p2.zones.active.push(
    createCard({ instanceId: 3, name: 'Squirtle', hp: 60, types: ['Water'] })
  );
  state.players.p2.zones.bench.push(
    createCard({ instanceId: 20, name: 'Blastoise', hp: 140, types: ['Water'] })
  );
  state.players.p2.zones.deck.push(createCard({ instanceId: 99, name: 'Card' }));
  state.players.p1.zones.prizes.push(
    ...Array.from({ length: 6 }, (_, i) =>
      createCard({ instanceId: 100 + i, name: `P1 Prize ${i}` })
    )
  );
  state.players.p2.zones.prizes.push(
    ...Array.from({ length: 6 }, (_, i) =>
      createCard({ instanceId: 200 + i, name: `P2 Prize ${i}` })
    )
  );

  const rng = createRng(2);
  const res = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rng
  );

  assert.equal(res.error, null);
  const merged = settleChoices(res, rng);
  const p1Lines = eventLines(merged, 'p1');
  assert.ok(
    p1Lines.includes("💀 Your opponent's Squirtle was Knocked Out."),
    `got: ${JSON.stringify(p1Lines)}`
  );
  assert.ok(
    p1Lines.includes('🏆 You took 1 prize card.'),
    `prize line missing: ${JSON.stringify(p1Lines)}`
  );
  assert.ok(
    p1Lines.includes('⬆️ Blastoise was promoted to the Active Spot.'),
    `promotion line missing: ${JSON.stringify(p1Lines)}`
  );

  const p2Lines = eventLines(merged, 'p2');
  assert.ok(
    p2Lines.includes('💀 Your Squirtle was Knocked Out.'),
    `got: ${JSON.stringify(p2Lines)}`
  );
  assert.ok(
    p2Lines.includes('🏆 Your opponent took 1 prize card.'),
    `got: ${JSON.stringify(p2Lines)}`
  );
});

test('a passed turn announces the next player', () => {
  const state = makeState();
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, name: 'Pikachu', hp: 60, types: ['Lightning'] })
  );
  state.players.p2.zones.active.push(
    createCard({ instanceId: 3, name: 'Squirtle', hp: 60, types: ['Water'] })
  );
  state.players.p1.zones.deck.push(createCard({ instanceId: 50, name: 'Card' }));
  state.players.p2.zones.deck.push(createCard({ instanceId: 51, name: 'Card' }));

  const res = applyCommand(
    state,
    { type: 'pass', payload: {}, playerId: 'p1' },
    createRng(3)
  );

  const p2Lines = eventLines(res.events, 'p2');
  assert.ok(
    p2Lines.some((l) => l.includes("turn.") && l.includes("your")),
    `turn line missing for p2: ${JSON.stringify(p2Lines)}`
  );
});
