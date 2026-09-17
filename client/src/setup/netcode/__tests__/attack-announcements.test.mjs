import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackAnnouncementLines } from '../attack-announcements.mjs';

const SELF = 'p1';
const names = { 200: 'Solrock', 201: 'Riolu' };
const resolveName = (instanceId) => names[instanceId] || null;

test('single coin flip reads as heads or tails', () => {
  const heads = attackAnnouncementLines(
    { type: 'attackCoinFlipped', playerId: SELF, attackName: 'Beak Blast', coin: 'heads', flips: ['heads'] },
    SELF
  );
  assert.deepEqual(heads, ['🪙 Beak Blast: Heads!']);

  const tails = attackAnnouncementLines(
    { type: 'attackCoinFlipped', playerId: SELF, attackName: 'Beak Blast', coin: 'tails', flips: ['tails'] },
    SELF
  );
  assert.deepEqual(tails, ['🪙 Beak Blast: Tails!']);
});

test('multi-flip reports the flip count and the heads count', () => {
  const lines = attackAnnouncementLines(
    {
      type: 'attackCoinFlipped',
      playerId: SELF,
      attackName: 'Rock Barrage',
      coin: null,
      headsCount: 1,
      flips: ['heads', 'tails', 'tails', 'tails'],
    },
    SELF
  );
  assert.deepEqual(lines, ['🪙 Rock Barrage: flipped 4 coins — 1 head.']);
});

test('no flips: nothing is announced', () => {
  assert.deepEqual(
    attackAnnouncementLines(
      { type: 'attackCoinFlipped', playerId: SELF, attackName: 'Peck', flips: [] },
      SELF
    ),
    []
  );
});

test('scaling announces the new total and every resolved note', () => {
  const lines = attackAnnouncementLines(
    {
      type: 'attackDamageScaled',
      playerId: SELF,
      attackName: 'Feather Rondo',
      base: 60,
      total: 200,
      notes: ['+ 20 × 7 (Benched Pokémon (both sides))'],
      resolved: true,
    },
    SELF
  );
  assert.deepEqual(lines, [
    '✨ Feather Rondo: 60 → 200 damage.',
    '✨ + 20 × 7 (Benched Pokémon (both sides))',
  ]);
});

test('an unresolved count is flagged rather than presented as applied scaling', () => {
  const lines = attackAnnouncementLines(
    {
      type: 'attackDamageScaled',
      playerId: SELF,
      attackName: 'Mystery Blast',
      base: 30,
      total: 30,
      notes: ['per-Benched Pokémon (both sides) scaling — resolve the printed count'],
      resolved: false,
    },
    SELF
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^❔ Mystery Blast:/);
});

test('bench damage is phrased by whose bench was hit and names the card', () => {
  const theirs = attackAnnouncementLines(
    {
      type: 'benchDamaged',
      playerId: 'p2',
      attackerPlayerId: SELF,
      instanceId: 200,
      attackName: 'Aerial Storm',
      dealt: 20,
      auto: false,
    },
    SELF,
    resolveName
  );
  assert.deepEqual(theirs, ["💥 20 damage to the opponent's benched Solrock."]);

  const mine = attackAnnouncementLines(
    {
      type: 'benchDamaged',
      playerId: SELF,
      attackerPlayerId: 'p2',
      instanceId: 201,
      attackName: 'Aerial Storm',
      dealt: 20,
      auto: false,
    },
    SELF,
    resolveName
  );
  assert.deepEqual(mine, ['💥 20 damage to your benched Riolu.']);
});

test('an auto-picked bench target says so, so the player can correct it', () => {
  const lines = attackAnnouncementLines(
    {
      type: 'benchDamaged',
      playerId: 'p2',
      attackerPlayerId: SELF,
      instanceId: 200,
      attackName: 'Sniping Shot',
      dealt: 30,
      auto: true,
    },
    SELF,
    resolveName
  );
  assert.equal(lines.length, 2);
  assert.match(lines[1], /first benched Pokémon/);
});

test('an unknown card name degrades to a generic phrase', () => {
  const lines = attackAnnouncementLines(
    {
      type: 'benchDamaged',
      playerId: 'p2',
      attackerPlayerId: SELF,
      instanceId: 999,
      attackName: 'Aerial Storm',
      dealt: 20,
      auto: false,
    },
    SELF,
    resolveName
  );
  assert.deepEqual(lines, ["💥 20 damage to the opponent's benched Pokémon."]);
});

test('fizzle is announced', () => {
  assert.deepEqual(
    attackAnnouncementLines(
      { type: 'attackBenchFizzled', playerId: SELF, attackName: 'Aerial Storm', reason: 'no-benched-pokemon' },
      SELF
    ),
    ["💤 Aerial Storm's bench damage fizzles — no benched Pokémon to hit."]
  );
});

test('unrelated, malformed or identity-less events say nothing', () => {
  assert.deepEqual(attackAnnouncementLines({ type: 'cardsDrawn', playerId: SELF }, SELF), []);
  assert.deepEqual(attackAnnouncementLines(null, SELF), []);
  assert.deepEqual(attackAnnouncementLines({ type: 'attackBenchFizzled' }, SELF), []);
  assert.deepEqual(
    attackAnnouncementLines({ type: 'attackBenchFizzled', playerId: SELF }, null),
    []
  );
});
