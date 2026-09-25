import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docForSide } from '../side-doc.mjs';

const selfDoc = { id: 'self' };
const oppDoc = { id: 'opp' };

test('docForSide: resolves each known side to its own mat', () => {
  assert.equal(docForSide('self', selfDoc, oppDoc), selfDoc);
  assert.equal(docForSide('opp', selfDoc, oppDoc), oppDoc);
});

test('docForSide: an unknown side draws nothing rather than guessing', () => {
  // advisoryAnimationPlan yields user:null whenever the event has no playerId
  // or selfPlayerId is not known yet. The old ternary sent every one of those
  // to the opponent's mat — silently the wrong side of the board.
  for (const user of [null, undefined, '', 'spectator', 0, false, 'SELF']) {
    assert.equal(docForSide(user, selfDoc, oppDoc), null, `guessed for ${String(user)}`);
  }
});

test('docForSide: a mat that does not exist yet is null, not undefined', () => {
  assert.equal(docForSide('self', null, oppDoc), null);
  assert.equal(docForSide('self', undefined, oppDoc), null);
  assert.equal(docForSide('opp', selfDoc, undefined), null);
});
