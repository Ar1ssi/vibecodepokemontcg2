import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomFormatView } from '../room-format-view.mjs';

const seated = ['Ash', 'Gary'];
const ids = (view) => view.buttons.map((button) => button.id);

test('053 rows 1 and 12: nothing shows until both seats are taken', () => {
  assert.equal(roomFormatView({ format: null, proposal: null, seated: ['Ash'], self: 'Ash' }).mode, 'hidden');
  assert.equal(roomFormatView({ format: null, proposal: null, seated: [], self: '' }).mode, 'hidden');
});

test('053 row 2: both players see the two formats to propose', () => {
  const view = roomFormatView({ format: null, proposal: null, seated, self: 'Gary' });
  assert.equal(view.mode, 'pick');
  assert.deepEqual(ids(view), ['propose-tcg', 'propose-build-battle']);
  assert.deepEqual(view.buttons[1].action, { type: 'propose', format: 'build-battle' });
});

test('053 row 3: the proposer waits and can withdraw; the other player accepts or counters', () => {
  const proposal = { format: 'build-battle', by: 'Ash' };
  const mine = roomFormatView({ format: null, proposal, seated, self: 'Ash' });
  assert.equal(mine.mode, 'waiting');
  assert.equal(mine.text, 'You proposed Build & Battle (40 cards, 4 Prizes). Waiting for Gary to accept.');
  assert.deepEqual(ids(mine), ['withdraw']);

  const theirs = roomFormatView({ format: null, proposal, seated, self: 'Gary' });
  assert.equal(theirs.mode, 'answer');
  assert.equal(theirs.text, 'Ash proposes Build & Battle (40 cards, 4 Prizes).');
  assert.deepEqual(theirs.buttons[0].action, { type: 'accept', format: 'build-battle' });
  assert.equal(theirs.buttons[1].label, 'Play Standard instead');
});

test('053 row 3a: an agreed Build & Battle room offers the box and a switch', () => {
  const view = roomFormatView({ format: 'build-battle', proposal: null, seated, self: 'Gary' });
  assert.equal(view.text, 'Format: Build & Battle (40 cards, 4 Prizes)');
  assert.deepEqual(ids(view), ['open-box', 'propose-tcg']);
  const standard = roomFormatView({ format: 'tcg', proposal: null, seated, self: 'Gary' });
  assert.deepEqual(ids(standard), ['propose-build-battle']);
});

test('053 row 6: once dealt, and for spectators, the agreed format is read-only', () => {
  const dealt = roomFormatView({ format: 'build-battle', proposal: null, seated, self: 'Ash', dealt: true });
  assert.deepEqual([dealt.mode, dealt.buttons], ['agreed', []]);
  const watcher = roomFormatView({ format: null, proposal: { format: 'tcg', by: 'Ash' }, seated, self: 'Misty', spectator: true });
  assert.equal(watcher.mode, 'hidden');
});
