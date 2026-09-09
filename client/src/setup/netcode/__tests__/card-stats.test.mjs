import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCardStatsPayload } from '../card-stats.js';

// Design 002 I26: loadDeck's rows carry identity only, so the server's cards have
// hp: null / attacks: [] and can never adjudicate a knockout. This payload is what
// closes that gap.
test('I26: builds stats from enriched client cards', () => {
  const { stats } = buildCardStatsPayload([
    {
      syncInstance: 0,
      hp: 60,
      attacks: [{ name: 'Tackle', damage: '10', text: '' }],
      types: ['Colorless'],
      weakness: { type: 'Fighting', value: 2 },
      resistance: null,
      retreatCost: ['Colorless'],
      stage: 'Basic',
    },
  ]);

  assert.equal(stats.length, 1);
  assert.equal(stats[0].syncInstance, 0);
  assert.equal(stats[0].hp, 60);
  assert.deepEqual(stats[0].attacks, [{ name: 'Tackle', damage: '10', text: '' }]);
  assert.deepEqual(stats[0].types, ['Colorless']);
  assert.deepEqual(stats[0].weakness, { type: 'Fighting', value: 2 });
  assert.deepEqual(stats[0].retreatCost, ['Colorless']);
  assert.equal(stats[0].stage, 'Basic');
  // resistance was null — omitted rather than sent, so it can't overwrite a real value
  assert.equal('resistance' in stats[0], false);
});

test('I26: hp is coerced from a printed string and rejected when not a positive number', () => {
  const { stats } = buildCardStatsPayload([
    { syncInstance: 0, hp: '130' },
    { syncInstance: 1, hp: 'N/A' },
    { syncInstance: 2, hp: 0 },
  ]);

  assert.equal(stats.length, 1);
  assert.deepEqual(stats[0], { syncInstance: 0, hp: 130 });
});

test('I26: unenriched and malformed cards are dropped, not sent as empty entries', () => {
  const { stats } = buildCardStatsPayload([
    { syncInstance: 0, hp: null, attacks: [] },
    { syncInstance: 1 },
    { hp: 60 },
    { syncInstance: -1, hp: 60 },
    null,
    { syncInstance: 2, hp: 60 },
  ]);

  assert.deepEqual(stats, [{ syncInstance: 2, hp: 60 }]);
});

test('I26: an entirely unenriched deck yields no entries, so no command is sent', () => {
  const { stats } = buildCardStatsPayload([
    { syncInstance: 0, name: 'Pikachu' },
    { syncInstance: 1, name: 'Bulbasaur' },
  ]);
  assert.deepEqual(stats, []);
});
