import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverBattleLogLines } from '../server-battle-log.mjs';

const SELF = 'p1';
const OTHER = 'p2';
const names = {
  1: 'Pikachu',
  2: 'Raichu',
  3: 'Squirtle',
  4: 'Water Energy',
  5: 'Blastoise',
};
const resolveName = (instanceId) => names[instanceId] || null;

const lines = (event, selfPlayerId = SELF) =>
  serverBattleLogLines(event, selfPlayerId, resolveName);

test('turnStarted is phrased by whose turn it is', () => {
  assert.deepEqual(lines({ type: 'turnStarted', player: SELF, number: 4 }), [
    'Turn 4 — your turn.',
  ]);
  assert.deepEqual(lines({ type: 'turnStarted', player: OTHER, number: 4 }), [
    "Turn 4 — your opponent's turn.",
  ]);
});

test('trainerPlayed uses the event name and marks a Stadium', () => {
  assert.deepEqual(
    lines({ type: 'trainerPlayed', playerId: SELF, instanceId: 7, name: 'Ultra Ball' }),
    ['You played Ultra Ball.']
  );
  assert.deepEqual(
    lines({
      type: 'trainerPlayed',
      playerId: OTHER,
      instanceId: 8,
      name: 'Artazon',
      stadium: true,
    }),
    ['Your opponent played Artazon (Stadium).']
  );
});

test('abilityUsed prefers the event name, falls back to the registry', () => {
  assert.deepEqual(
    lines({ type: 'abilityUsed', playerId: SELF, instanceId: 1, name: 'Static' }),
    ["✦ You used Static's ability."]
  );
  assert.deepEqual(
    lines({ type: 'abilityUsed', playerId: OTHER, instanceId: 1 }),
    ["✦ Your opponent used Pikachu's ability."]
  );
});

test('pokemonEvolved names the evolution and its host', () => {
  assert.deepEqual(
    lines({ type: 'pokemonEvolved', playerId: SELF, instanceId: 2, targetInstanceId: 1 }),
    ['✨ Raichu evolved onto Pikachu.']
  );
});

test('pokemonDevolved names the base that stayed and the card returned', () => {
  assert.deepEqual(
    lines({ type: 'pokemonDevolved', playerId: SELF, instanceId: 2, targetInstanceId: 1 }),
    ['⬇ Pikachu devolved — Raichu returned.']
  );
});

test('cardAttached names the attached card and its host', () => {
  assert.deepEqual(
    lines({ type: 'cardAttached', playerId: SELF, instanceId: 4, targetInstanceId: 3 }),
    ['⚡ You attached Water Energy to Squirtle.']
  );
});

test('cardRetreated and cardSwitched name both Pokémon', () => {
  assert.deepEqual(
    lines({ type: 'cardRetreated', playerId: SELF, activeId: 1, promotedId: 2 }),
    ['🔄 Pikachu retreated — Raichu promoted to the Active Spot.']
  );
  assert.deepEqual(
    lines({ type: 'cardSwitched', playerId: OTHER, activeId: 5, benchId: 3 }),
    ['🔄 Blastoise switched with Squirtle.']
  );
});

test('a knockout is possessive of the victim side', () => {
  assert.deepEqual(
    lines({ type: 'pokemonKnockedOut', playerId: SELF, instanceId: 1 }),
    ['💀 Your Pikachu was Knocked Out.']
  );
  assert.deepEqual(
    lines({ type: 'pokemonKnockedOut', playerId: OTHER, instanceId: 1 }),
    ["💀 Your opponent's Pikachu was Knocked Out."]
  );
});

test('promotion and prizes read correctly, singular and plural', () => {
  assert.deepEqual(lines({ type: 'pokemonPromoted', playerId: SELF, instanceId: 2 }), [
    '⬆️ Raichu was promoted to the Active Spot.',
  ]);
  assert.deepEqual(lines({ type: 'prizesTaken', playerId: SELF, count: 1 }), [
    '🏆 You took 1 prize card.',
  ]);
  assert.deepEqual(lines({ type: 'prizeTaken', playerId: OTHER, count: 3 }), [
    '🏆 Your opponent took 3 prize cards.',
  ]);
  assert.deepEqual(lines({ type: 'prizesTaken', playerId: SELF, count: 0 }), []);
});

test('draws count from count or the cards array and stay silent on zero', () => {
  assert.deepEqual(lines({ type: 'cardsDrawn', playerId: SELF, count: 2 }), [
    'You drew 2 cards.',
  ]);
  assert.deepEqual(
    lines({ type: 'cardsDrawn', playerId: OTHER, cards: [{ instanceId: 1 }] }),
    ['Your opponent drew 1 card.']
  );
  assert.deepEqual(lines({ type: 'cardsDrawn', playerId: SELF, count: 0 }), []);
});

test('discards name a lone card and count a group', () => {
  assert.deepEqual(
    lines({ type: 'cardsDiscarded', playerId: SELF, cards: [{ name: 'Fire Energy' }] }),
    ['You discarded Fire Energy.']
  );
  assert.deepEqual(
    lines({
      type: 'cardsDiscarded',
      playerId: OTHER,
      cards: [{ name: 'A' }, { name: 'B' }],
    }),
    ['Your opponent discarded 2 cards.']
  );
  assert.deepEqual(lines({ type: 'cardsDiscarded', playerId: SELF, cards: [] }), []);
});

test('shuffles say whose deck, looks and reveals name what was seen', () => {
  assert.deepEqual(lines({ type: 'zoneShuffled', playerId: SELF, zoneId: 'deck' }), [
    '🔀 You shuffled your deck.',
  ]);
  assert.deepEqual(lines({ type: 'deckShuffled', playerId: OTHER }), [
    '🔀 Your opponent shuffled their deck.',
  ]);
  assert.deepEqual(lines({ type: 'cardsLookedAt', playerId: SELF, count: 3 }), [
    '👀 You looked at 3 cards.',
  ]);
  assert.deepEqual(
    lines({ type: 'cardsRevealed', playerId: OTHER, cards: [{ name: 'Rare Candy' }] }),
    ['👀 Your opponent revealed Rare Candy.']
  );
});

test('status applied and cleared read naturally', () => {
  assert.deepEqual(
    lines({ type: 'statusApplied', playerId: SELF, instanceId: 1, condition: 'Asleep' }),
    ['☠️ Pikachu is now Asleep.']
  );
  assert.deepEqual(
    lines({ type: 'statusCleared', playerId: OTHER, instanceId: 1, condition: 'Asleep' }),
    ['☠️ Pikachu recovered from Asleep.']
  );
  assert.deepEqual(
    lines({ type: 'statusCleared', playerId: SELF, instanceId: 1 }),
    ['☠️ Pikachu recovered from its Special Conditions.']
  );
});

test('coins and once-per-game moves are announced', () => {
  assert.deepEqual(lines({ type: 'coinFlipped', playerId: SELF, face: 'heads' }), [
    '🪙 You flipped Heads.',
  ]);
  assert.deepEqual(lines({ type: 'coinFlipped', playerId: OTHER, heads: 2 }), [
    '🪙 Your opponent flipped 2 heads.',
  ]);
  assert.deepEqual(
    lines({ type: 'gxAttackUsed', playerId: SELF, attackName: 'Turbo Bolt' }),
    ['💥 You used the GX attack Turbo Bolt.']
  );
  assert.deepEqual(lines({ type: 'vstarUsed', playerId: OTHER }), [
    '💥 Your opponent used a VSTAR Power.',
  ]);
});

test('attack events delegate to attackAnnouncementLines', () => {
  assert.deepEqual(
    lines({
      type: 'attackCoinFlipped',
      playerId: SELF,
      attackName: 'Peck',
      flips: ['heads'],
    }),
    ['🪙 Peck: Heads!']
  );
});

test('unknown names fall back to generic nouns', () => {
  assert.deepEqual(lines({ type: 'pokemonKnockedOut', playerId: SELF, instanceId: 999 }), [
    '💀 Your Pokémon was Knocked Out.',
  ]);
  assert.deepEqual(lines({ type: 'cardAttached', playerId: SELF, instanceId: 999 }), [
    '⚡ You attached a card.',
  ]);
  // No resolver at all degrades the same way.
  assert.deepEqual(
    serverBattleLogLines({ type: 'cardAttached', playerId: SELF, instanceId: 1 }, SELF),
    ['⚡ You attached a card.']
  );
});

test('malformed, identity-less and out-of-scope events say nothing', () => {
  assert.deepEqual(serverBattleLogLines(null, SELF, resolveName), []);
  assert.deepEqual(serverBattleLogLines({ playerId: SELF }, SELF, resolveName), []);
  assert.deepEqual(lines({ type: 'turnStarted', number: 1 }), []);
  assert.deepEqual(serverBattleLogLines({ type: 'turnStarted', number: 1 }, null, resolveName), []);
  assert.deepEqual(lines({ type: 'somethingElse', playerId: SELF }), []);
});
