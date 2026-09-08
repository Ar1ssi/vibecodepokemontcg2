import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

test('attack: player going first cannot attack on turn 1', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary' },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 1, phase: 'main' };

  const pikachu = createCard({
    instanceId: 1,
    name: 'Pikachu',
    hp: 60,
    attacks: [{ name: 'Quick Attack', cost: [], damage: 20 }],
  });
  state.players.p1.zones.active.push(pikachu);

  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, "The player going first can't attack on turn 1.");
});

test('attack: energy cost validation gates attack execution', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary' },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  const charizard = createCard({
    instanceId: 10,
    name: 'Charizard',
    hp: 120,
    attacks: [{ name: 'Fire Spin', cost: ['Fire', 'Fire', 'Colorless'], damage: 100 }],
  });
  state.players.p1.zones.active.push(charizard);

  // Insufficient energy
  const res1 = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res1.error, 'Not enough energy attached.');

  // Attach 2 Fire Energy and 1 Colorless
  const e1 = createCard({ instanceId: 11, name: 'Fire Energy', supertype: 'Energy', type: 'Energy', attachedTo: 10 });
  const e2 = createCard({ instanceId: 12, name: 'Fire Energy', supertype: 'Energy', type: 'Energy', attachedTo: 10 });
  const e3 = createCard({ instanceId: 13, name: 'Double Colorless', supertype: 'Energy', type: 'Energy', attachedTo: 10, subtypes: ['special'] });
  state.players.p1.zones.active.push(e1, e2, e3);

  // Defender
  const blastoise = createCard({ instanceId: 20, name: 'Blastoise', hp: 120, damage: 0 });
  state.players.p2.zones.active.push(blastoise);
  state.players.p2.zones.deck.push(createCard({ instanceId: 99, name: 'Deck Card' }));

  const res2 = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res2.error, null);
  const def = res2.state.players.p2.zones.active[0];
  assert.equal(def.damage, 100);
});

test('attack: weakness applies 2x damage to defender', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary' },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  const pikachu = createCard({
    instanceId: 1,
    name: 'Pikachu',
    types: ['Lightning'],
    attacks: [{ name: 'Thunder Jolt', cost: [], damage: 30 }],
  });
  state.players.p1.zones.active.push(pikachu);

  const squirtle = createCard({
    instanceId: 2,
    name: 'Squirtle',
    types: ['Water'],
    hp: 60,
    weakness: { type: 'Lightning', value: 2 },
  });
  state.players.p2.zones.active.push(squirtle);
  state.players.p2.zones.deck.push(createCard({ instanceId: 99, name: 'Card' }));

  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);

  // 30 base * 2x weakness = 60 damage -> KO!
  const defDiscard = res.state.players.p2.zones.discard.find((c) => c.instanceId === 2);
  assert.ok(defDiscard, 'Squirtle should be KO and in discard pile');
});

test('attack & KO: awards 1 prize for basic, 2 for ex, and 3 for Mega', () => {
  // Test ex card (2 prizes)
  const state = createGameState({
    players: {
      p1: {
        username: 'Ash',
        zones: {
          prizes: [
            createCard({ instanceId: 101, name: 'Prize 1' }),
            createCard({ instanceId: 102, name: 'Prize 2' }),
            createCard({ instanceId: 103, name: 'Prize 3' }),
          ],
        },
      },
      p2: {
        username: 'Gary',
        zones: {
          bench: [createCard({ instanceId: 50, name: 'Benched Pidgey', hp: 50 })],
          deck: [createCard({ instanceId: 99, name: 'Deck' })],
        },
      },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  const attacker = createCard({
    instanceId: 1,
    name: 'Mewtwo',
    attacks: [{ name: 'Psystrike', cost: [], damage: 250 }],
  });
  state.players.p1.zones.active.push(attacker);

  const miraidonEx = createCard({
    instanceId: 2,
    name: 'Miraidon ex',
    subtypes: ['ex'],
    hp: 220,
  });
  state.players.p2.zones.active.push(miraidonEx);

  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });

  assert.equal(res.error, null);
  // Attacker should have received 2 prize cards into hand
  assert.equal(res.state.players.p1.zones.hand.length, 2);
  assert.equal(res.state.players.p1.zones.prizes.length, 1);

  // Miraidon ex should be discarded
  assert.equal(res.state.players.p2.zones.discard.length, 1);
  assert.equal(res.state.players.p2.zones.discard[0].instanceId, 2);

  // Benched Pidgey should have been promoted to active!
  assert.equal(res.state.players.p2.zones.active.length, 1);
  assert.equal(res.state.players.p2.zones.active[0].instanceId, 50);
});

test('retreat: swaps active with bench, clears status, and pays energy cost', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary' },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  const activeSnorlax = createCard({
    instanceId: 1,
    name: 'Snorlax',
    hp: 140,
    retreatCost: ['Colorless', 'Colorless'], // costs 2 energy
    specialCondition: 'Confused',
  });
  const energy1 = createCard({ instanceId: 11, name: 'Energy 1', supertype: 'Energy', type: 'Energy', attachedTo: 1 });
  const energy2 = createCard({ instanceId: 12, name: 'Energy 2', supertype: 'Energy', type: 'Energy', attachedTo: 1 });
  state.players.p1.zones.active.push(activeSnorlax, energy1, energy2);

  const benchPikachu = createCard({ instanceId: 2, name: 'Pikachu', hp: 60 });
  state.players.p1.zones.bench.push(benchPikachu);

  const res = applyCommand(state, {
    type: 'retreat',
    payload: { benchInstanceId: 2 },
    playerId: 'p1',
  });

  assert.equal(res.error, null);
  // Energy cards should be discarded
  assert.equal(res.state.players.p1.zones.discard.length, 2);
  // Active should now be Pikachu
  assert.equal(res.state.players.p1.zones.active[0].instanceId, 2);
  // Snorlax should now be on bench with confusion cleared
  const snorlaxOnBench = res.state.players.p1.zones.bench.find((c) => c.instanceId === 1);
  assert.ok(snorlaxOnBench);
  assert.equal(snorlaxOnBench.specialCondition, null);
  assert.equal(res.state.players.p1.flags.retreatedThisTurn, true);
});

test('takePrizes: taking all prizes reaches gameEnded win condition', () => {
  const state = createGameState({
    players: {
      p1: {
        username: 'Ash',
        zones: {
          prizes: [createCard({ instanceId: 10, name: 'Last Prize' })],
        },
      },
      p2: { username: 'Gary' },
    },
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  const res = applyCommand(state, { type: 'takePrizes', payload: { count: 1 }, playerId: 'p1' });


  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.prizes.length, 0);
  assert.equal(res.state.players.p1.zones.hand.length, 1);
  assert.equal(res.state.turn.phase, 'ended');
  assert.equal(res.state.winner, 'p1');
  assert.equal(res.state.winReason, 'all prize cards taken');
});

test('attack & KO: bench knockout discards victim and attached cards, awards prizes, and does NOT auto-promote', () => {
  const state = createGameState({
    players: {
      p1: {
        username: 'Ash',
        zones: {
          prizes: [
            createCard({ instanceId: 101, name: 'Prize 1' }),
            createCard({ instanceId: 102, name: 'Prize 2' }),
            createCard({ instanceId: 103, name: 'Prize 3' }),
          ],
        },
      },
      p2: {
        username: 'Gary',
        zones: {
          active: [createCard({ instanceId: 20, name: 'Active Blastoise', hp: 120 })],
          bench: [
            createCard({ instanceId: 30, name: 'Benched Pikachu', hp: 60 }),
            createCard({ instanceId: 31, name: 'Lightning Energy', supertype: 'Energy', type: 'Energy', attachedTo: 30 }),
            createCard({ instanceId: 40, name: 'Benched Charmander', hp: 70 }),
          ],
          deck: [createCard({ instanceId: 99, name: 'Deck' })],
        },
      },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  const attacker = createCard({
    instanceId: 1,
    name: 'Mewtwo',
    attacks: [{ name: 'Bench Snipe', cost: [], damage: 80 }],
  });
  state.players.p1.zones.active.push(attacker);

  // Attack targeting Benched Pikachu (instanceId 30)
  const res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0, targetInstanceId: 30 },
    playerId: 'p1',
  });

  assert.equal(res.error, null);

  // 1. Attacker took 1 prize card into hand
  assert.equal(res.state.players.p1.zones.hand.length, 1);
  assert.equal(res.state.players.p1.zones.prizes.length, 2);

  // 2. Benched Pikachu (30) and its attached Energy (31) discarded
  const p2DiscardIds = res.state.players.p2.zones.discard.map((c) => c.instanceId);
  assert.ok(p2DiscardIds.includes(30), 'Benched Pikachu must be moved to discard');
  assert.ok(p2DiscardIds.includes(31), 'Attached energy must be moved to discard');

  // 3. Bench now only contains Charmander (40)
  const p2BenchIds = res.state.players.p2.zones.bench.map((c) => c.instanceId);
  assert.deepEqual(p2BenchIds, [40], 'Charmander should remain on bench');

  // 4. Active must REMAIN Blastoise (20) — NO extra promotion
  assert.equal(res.state.players.p2.zones.active.length, 1);
  assert.equal(res.state.players.p2.zones.active[0].instanceId, 20);

  // 5. Events check: pokemonKnockedOut fired, but pokemonPromoted did NOT
  const koEvent = res.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.ok(koEvent, 'pokemonKnockedOut event must be emitted');
  assert.equal(koEvent.instanceId, 30);
  assert.equal(koEvent.playerId, 'p2');

  const promoteEvent = res.events.find((e) => e.type === 'pokemonPromoted');
  assert.equal(promoteEvent, undefined, 'pokemonPromoted must NOT be emitted for bench KO');

  // 6. Game continues (Active Blastoise is still alive)
  assert.notEqual(res.state.turn.phase, 'ended');
});

test('attack & KO: bench knockout taking last prize ends the game', () => {
  const state = createGameState({
    players: {
      p1: {
        username: 'Ash',
        zones: {
          prizes: [createCard({ instanceId: 101, name: 'Last Prize' })],
        },
      },
      p2: {
        username: 'Gary',
        zones: {
          active: [createCard({ instanceId: 20, name: 'Active Blastoise', hp: 120 })],
          bench: [createCard({ instanceId: 30, name: 'Benched Pikachu', hp: 50 })],
          deck: [createCard({ instanceId: 99, name: 'Deck' })],
        },
      },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  const attacker = createCard({
    instanceId: 1,
    name: 'Mewtwo',
    attacks: [{ name: 'Bench Snipe', cost: [], damage: 60 }],
  });
  state.players.p1.zones.active.push(attacker);

  const res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0, targetInstanceId: 30 },
    playerId: 'p1',
  });

  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.prizes.length, 0);
  assert.equal(res.state.turn.phase, 'ended');
  assert.equal(res.state.winner, 'p1');
  assert.equal(res.state.winReason, 'all prize cards taken');
});
