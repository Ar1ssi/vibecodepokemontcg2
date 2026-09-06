import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HIDDEN_SNAPSHOT_ZONES,
  SNAPSHOT_ZONES,
  orderSnapshotCards,
  serializeBoardZones,
  serializeCard,
  serializeZoneCards,
  snapshotZoneCounts,
} from '../board-snapshot.mjs';
import { hashBoardSnapshot } from '../zone-hash.mjs';

test('serializeCard uses face URL and keeps sync identity', () => {
  const card = {
    name: 'Pikipek',
    type: 'Pokémon',
    number: '066',
    set: 'me05',
    id: 'me05-066',
    syncInstance: 3,
    image: { src: 'back.png', src2: 'pikipek.png' },
  };
  assert.deepEqual(serializeCard(card), {
    name: 'Pikipek',
    type: 'Pokémon',
    src: 'pikipek.png',
    number: '066',
    set: 'me05',
    id: 'me05-066',
    syncInstance: 3,
    attached: false,
    parentSyncInstance: null,
  });
});

test('serializeCard links attached energy to the parent syncInstance', () => {
  const activeImg = { src: 'darkrai.png' };
  const energyImg = { src: 'dark.png', attached: true, relative: activeImg };
  const zone = [
    { name: 'Mega Darkrai ex', type: 'Pokémon', syncInstance: 1, image: activeImg },
    { name: 'Dark Energy', type: 'Energy', syncInstance: 4, image: energyImg },
  ];
  const energy = serializeCard(zone[1], zone);
  assert.equal(energy.attached, true);
  assert.equal(energy.parentSyncInstance, 1);
});

test('serializeBoardZones keeps hand order so later plays can hint-match', () => {
  const hand = [
    { name: 'Pikipek', syncInstance: 3, image: { src: 'pikipek.png' } },
    { name: 'Toxel', syncInstance: 7, image: { src: 'toxel.png' } },
  ];
  const zones = serializeBoardZones({
    hand,
    deck: [],
    prizes: [],
    active: [],
    bench: [],
    discard: [],
    lostZone: [],
    board: [],
  });
  assert.deepEqual(
    zones.hand.map((c) => c.name),
    ['Pikipek', 'Toxel']
  );
  assert.equal(snapshotZoneCounts(zones).hand, 2);
  assert.equal(
    hashBoardSnapshot({
      hand: serializeZoneCards(hand).map((c) => ({
        name: c.name,
        syncInstance: c.syncInstance,
      })),
    }),
    hashBoardSnapshot({ hand })
  );
});

test('orderSnapshotCards restores parents before attachments', () => {
  const ordered = orderSnapshotCards([
    { name: 'Energy', attached: true, parentSyncInstance: 1 },
    { name: 'Darkrai', attached: false, syncInstance: 1 },
  ]);
  assert.equal(ordered[0].name, 'Darkrai');
  assert.equal(ordered[1].name, 'Energy');
});

test('snapshot omits stadium and hides deck/hand/prizes', () => {
  assert.equal(SNAPSHOT_ZONES.includes('stadium'), false);
  assert.deepEqual(HIDDEN_SNAPSHOT_ZONES, ['deck', 'hand', 'prizes']);
});
