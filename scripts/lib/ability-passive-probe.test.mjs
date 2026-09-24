// Passive "behave" probes (design 034 slice 7b): an engine reader consumes a passive ability when
// its answer changes with the text stripped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passiveReads, namedPartners } from './ability-passive-probe.mjs';

test('passiveReads names the readers each passive family reaches', () => {
  assert.ok(passiveReads('Your Pokémon in play get +30 HP.').some((r) => r.startsWith('active:hp:')));
  assert.ok(passiveReads("This Pokémon can't be affected by any Special Conditions.").includes('bench:statusImmune'));
  const retreatLock = passiveReads(
    "As long as this Pokémon is in the Active Spot, your opponent's Active Pokémon can't retreat."
  );
  assert.ok(retreatLock.includes('active:retreatLock:p2'));
  assert.ok(!retreatLock.some((r) => r.startsWith('bench')), 'an Active-Spot lock is not read from the Bench');
  assert.ok(
    passiveReads(
      "As long as this Pokémon is in the Active Spot, your opponent can't play any Item cards from their hand."
    ).includes('active:playLock:p2:Probe Item')
  );
});

test('the probe board meets "no Energy attached" and "if you have X in play" conditions', () => {
  assert.deepEqual(
    namedPartners('If you have Simisage, Simisear, and Simipour in play, ignore all {C} Energy.'),
    ['Simisage', 'Simisear', 'Simipour']
  );
  // Full-HP KO prevention needs the bare (undamaged) holder board.
  assert.ok(
    passiveReads(
      'If this Pokémon has full HP and would be Knocked Out by damage from an attack, it is not Knocked Out, and its remaining HP becomes 10.'
    ).includes('active-bare:koPrevention:Probe Holder')
  );
});

test('passiveReads is empty for a passive no reader enforces', () => {
  assert.deepEqual(
    passiveReads(
      "As long as this Pokémon is in the Active Spot, each Supporter card in your opponent's hand has the effect \"Draw 3 cards.\""
    ),
    []
  );
});

test('passiveReads ignores answers that only echo the holder card', () => {
  // The holder differs from the control only by its printed ability; a reader returning the
  // card itself (or its id) is not a read.
  assert.deepEqual(passiveReads('This text means nothing to any reader.'), []);
});
