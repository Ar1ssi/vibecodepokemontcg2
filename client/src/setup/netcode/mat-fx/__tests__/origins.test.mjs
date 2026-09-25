import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureOrigins, discardOrigins, takeOrigin, visibleStackRecord } from '../origins.mjs';

// A Basic (1) with a Stage 1 (2) under it on the board, and a lone Basic (5).
const card = (instanceId, name, stage, attachedTo) => ({
  instanceId,
  name,
  stage,
  supertype: 'Pokémon',
  ...(attachedTo != null ? { attachedTo } : {}),
});
const board = () => {
  const stage1 = { card: card(2, 'Kakuna', 'Stage 1', 1), element: { id: 'kakuna' } };
  const energy = {
    card: { instanceId: 3, name: 'Grass Energy', supertype: 'Energy', attachedTo: 1 },
    element: { id: 'energy' },
  };
  const basic = {
    card: card(1, 'Weedle', 'Basic'),
    element: { id: 'weedle' },
    stackAttached: [
      { cardData: stage1.card, record: stage1 },
      { cardData: energy.card, record: energy },
    ],
  };
  const lone = { card: card(5, 'Makuhita', 'Basic'), element: { id: 'makuhita' } };
  return new Map([
    [1, basic],
    [2, stage1],
    [3, energy],
    [5, lone],
  ]);
};
const capture = (user, el) => ({ rect: { left: 0, top: 0, width: 79, height: 110 }, src: `${el.id}.png`, user });

test('visibleStackRecord: the top Pokémon of the stack, from the root or any attached card', () => {
  const registry = board();
  assert.equal(visibleStackRecord(registry, 1).card.name, 'Kakuna', 'root');
  assert.equal(visibleStackRecord(registry, 2).card.name, 'Kakuna', 'the top card itself');
  assert.equal(visibleStackRecord(registry, 3).card.name, 'Kakuna', 'an attached Energy');
  assert.equal(visibleStackRecord(registry, 5).card.name, 'Makuhita', 'an unevolved Pokémon');
  assert.equal(visibleStackRecord(registry, 99), null);
  assert.equal(visibleStackRecord(null, 1), null);
});

test('origins: an evolution snapshots the visible pre-evolution card under the NEW id', () => {
  const registry = board();
  // Beedrill (7) evolves the Weedle stack; the client sent the root as target.
  captureOrigins(
    [{ type: 'pokemonEvolved', playerId: 'p2', instanceId: 7, targetInstanceId: 1 }],
    registry,
    capture,
    () => 'opp'
  );
  const origin = takeOrigin(7);
  assert.equal(origin.src, 'kakuna.png', 'the top of the stack, not the root Basic');
  assert.equal(origin.user, 'opp');
  assert.equal(takeOrigin(7), undefined, 'consumed');
});

test('origins: two evolutions in one batch are captured separately', () => {
  const registry = board();
  captureOrigins(
    [
      { type: 'pokemonEvolved', playerId: 'p1', instanceId: 7, targetInstanceId: 2 },
      { type: 'pokemonEvolved', playerId: 'p1', instanceId: 8, targetInstanceId: 5 },
    ],
    registry,
    capture,
    () => 'self'
  );
  assert.equal(takeOrigin(8).src, 'makuhita.png');
  assert.equal(takeOrigin(7).src, 'kakuna.png');
});

test('origins: an unknown evolution target or a failed capture stores nothing', () => {
  const registry = board();
  captureOrigins(
    [
      { type: 'pokemonEvolved', playerId: 'p1', instanceId: 7, targetInstanceId: 99 },
      { type: 'pokemonEvolved', playerId: 'p1', targetInstanceId: 1 },
    ],
    registry,
    capture,
    () => 'self'
  );
  assert.equal(takeOrigin(7), undefined);
  captureOrigins(
    [{ type: 'pokemonEvolved', playerId: 'p1', instanceId: 7, targetInstanceId: 1 }],
    registry,
    () => null,
    () => 'self'
  );
  assert.equal(takeOrigin(7), undefined);
});

test('origins: discard drops a skipped evolution snapshot', () => {
  const event = { type: 'pokemonEvolved', playerId: 'p1', instanceId: 7, targetInstanceId: 5 };
  captureOrigins([event], board(), capture, () => 'self');
  discardOrigins(event);
  assert.equal(takeOrigin(7), undefined);
});
