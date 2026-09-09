import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState,
  getZone,
  findCard,
  getAttachedCards,
  hashState,
  hashStateZones,
  cloneGameState,
  PLAYER_ZONES,
} from '../state.mjs';
import { createCard } from '../cards.mjs';

test('createGameState initializes state model with 8 zones per player and top-level stadium', () => {
  const state = createGameState({
    gameId: 'test-game-1',
    seed: 12345,
    players: {
      p1: { username: 'Ash', deckList: [] },
      p2: { username: 'Gary', deckList: [] },
    },
    rulesEnabled: true,
  });

  assert.equal(state.gameId, 'test-game-1');
  assert.equal(state.stateVersion, 0);
  assert.equal(state.seed, 12345);
  assert.equal(state.rulesEnabled, true);
  assert.equal(state.stadium, null);
  assert.equal(state.turn.player, 'p1');
  assert.equal(state.turn.number, 1);
  assert.equal(state.turn.phase, 'setup');
  assert.deepEqual(Object.keys(state.players).sort(), ['p1', 'p2']);

  for (const pid of ['p1', 'p2']) {
    for (const zone of PLAYER_ZONES) {
      assert.ok(Array.isArray(state.players[pid].zones[zone]), `Zone ${zone} should be an array`);
      assert.equal(state.players[pid].zones[zone].length, 0);
    }
  }
});

test('getZone returns correct arrays for player zones and top-level stadium', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' } },
  });

  const card1 = createCard({ instanceId: 1, name: 'Pikachu' });
  const stadiumCard = createCard({ instanceId: 99, name: 'Path to the Peak' });

  state.players.p1.zones.active.push(card1);
  state.stadium = stadiumCard;

  assert.deepEqual(getZone(state, 'p1', 'active'), [card1]);
  assert.deepEqual(getZone(state, 'p1', 'stadium'), [stadiumCard]);
  assert.deepEqual(getZone(state, 'p1', 'bench'), []);
  assert.deepEqual(getZone(state, 'nonexistent', 'active'), []);
});

test('Edge Case 20: findCard disambiguates duplicate card names in the same zone by instanceId', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' } },
  });

  const cardA = createCard({ instanceId: 101, name: 'Double Turbo Energy', set: 'BRS', number: '151' });
  const cardB = createCard({ instanceId: 102, name: 'Double Turbo Energy', set: 'BRS', number: '151' });
  const cardC = createCard({ instanceId: 103, name: 'Double Turbo Energy', set: 'BRS', number: '151' });

  state.players.p1.zones.hand.push(cardA, cardB, cardC);

  const foundB = findCard(state, 102);
  assert.ok(foundB);
  assert.equal(foundB.playerId, 'p1');
  assert.equal(foundB.zoneId, 'hand');
  assert.equal(foundB.index, 1);
  assert.equal(foundB.card.instanceId, 102);
  assert.equal(foundB.card.name, 'Double Turbo Energy');

  const foundC = findCard(state, 103);
  assert.ok(foundC);
  assert.equal(foundC.index, 2);
  assert.equal(foundC.card.instanceId, 103);

  const notFound = findCard(state, 999);
  assert.equal(notFound, null);
});

test('findCard locates cards in stadium', () => {
  const state = createGameState();
  const stadiumCard = createCard({ instanceId: 50, name: 'Lost City' });
  state.stadium = stadiumCard;

  const found = findCard(state, 50);
  assert.ok(found);
  assert.equal(found.zoneId, 'stadium');
  assert.equal(found.card.instanceId, 50);
});

test('getAttachedCards finds attached energy and tools by target instanceId', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' } },
  });

  const pokemon = createCard({ instanceId: 10, name: 'Mew VMAX' });
  const energy1 = createCard({ instanceId: 11, name: 'Psychic Energy', attachedTo: 10 });
  const energy2 = createCard({ instanceId: 12, name: 'Psychic Energy', attachedTo: 10 });
  const unattached = createCard({ instanceId: 13, name: 'Psychic Energy', attachedTo: null });

  state.players.p1.zones.active.push(pokemon, energy1, energy2);
  state.players.p1.zones.hand.push(unattached);

  const attached = getAttachedCards(state, 10);
  assert.equal(attached.length, 2);
  assert.deepEqual(
    attached.map((c) => c.instanceId),
    [11, 12]
  );
});

test('hashState produces identical fingerprints for identical states and detects divergences', () => {
  const stateA = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary' },
    },
  });
  const stateB = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary' },
    },
  });

  const pikaA = createCard({ instanceId: 1, name: 'Pikachu', set: 'base1', number: '25' });
  const pikaB = createCard({ instanceId: 1, name: 'Pikachu', set: 'base1', number: '25' });

  stateA.players.p1.zones.active.push(pikaA);
  stateB.players.p1.zones.active.push(pikaB);

  // Identical hashes
  assert.equal(hashState(stateA, 'p1'), hashState(stateB, 'p1'));
  assert.equal(hashState(stateA), hashState(stateB));

  // Change damage on one board
  pikaB.damage = 30;
  assert.notEqual(hashState(stateA, 'p1'), hashState(stateB, 'p1'));
  assert.notEqual(hashState(stateA), hashState(stateB));
});

test('hashStateZones names the one zone that diverges, matching hashState for the whole player', () => {
  const stateA = createGameState({
    players: { p1: { username: 'Ash' } },
  });
  const stateB = createGameState({
    players: { p1: { username: 'Ash' } },
  });

  const pikaA = createCard({ instanceId: 1, name: 'Pikachu', set: 'base1', number: '25' });
  const pikaB = createCard({ instanceId: 1, name: 'Pikachu', set: 'base1', number: '25' });
  const eeveeA = createCard({ instanceId: 2, name: 'Eevee', set: 'base1', number: '51' });
  const eeveeB = createCard({ instanceId: 2, name: 'Eevee', set: 'base1', number: '51' });

  stateA.players.p1.zones.active.push(pikaA);
  stateB.players.p1.zones.active.push(pikaB);
  stateA.players.p1.zones.bench.push(eeveeA);
  stateB.players.p1.zones.bench.push(eeveeB);

  // Identical boards: every zone hash matches.
  assert.deepEqual(hashStateZones(stateA, 'p1'), hashStateZones(stateB, 'p1'));

  // Diverge only the bench.
  eeveeB.damage = 30;
  const zonesA = hashStateZones(stateA, 'p1');
  const zonesB = hashStateZones(stateB, 'p1');
  assert.equal(zonesA.active, zonesB.active);
  assert.notEqual(zonesA.bench, zonesB.bench);
  assert.notEqual(hashState(stateA, 'p1'), hashState(stateB, 'p1'));
});

test('hashStateZones returns null for an unknown player', () => {
  const state = createGameState({ players: { p1: { username: 'Ash' } } });
  assert.equal(hashStateZones(state, 'p2'), null);
  assert.equal(hashStateZones(null, 'p1'), null);
});

test('cloneGameState creates deep copy without shared references', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' } },
  });
  const card = createCard({ instanceId: 1, name: 'Pikachu' });
  state.players.p1.zones.active.push(card);

  const cloned = cloneGameState(state);
  assert.notEqual(cloned, state);
  assert.notEqual(cloned.players.p1.zones.active, state.players.p1.zones.active);

  cloned.players.p1.zones.active[0].damage = 20;
  assert.equal(state.players.p1.zones.active[0].damage, 0);
});
