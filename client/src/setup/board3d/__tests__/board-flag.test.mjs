import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD3D_KEY, isBoard3dRequested } from '../board-flag.mjs';

const storageWith = (value) => ({ getItem: (key) => (key === BOARD3D_KEY ? value : null) });

test('the storage key', () => {
  assert.equal(BOARD3D_KEY, 'ptcg-board-3d');
});

test('?board=3d asks for the 3D board', () => {
  assert.equal(isBoard3dRequested('?board=3d'), true);
});

test("stored '1' asks for the 3D board", () => {
  assert.equal(isBoard3dRequested('', storageWith('1')), true);
});

test("stored '0' beats ?board=3d and defaultOn", () => {
  assert.equal(isBoard3dRequested('?board=3d', storageWith('0'), { defaultOn: true }), false);
});

test('?board=iframe turns it off even when default on', () => {
  assert.equal(isBoard3dRequested('?board=iframe', null, { defaultOn: true }), false);
});

test('nothing set falls back to defaultOn', () => {
  assert.equal(isBoard3dRequested(), false);
  assert.equal(isBoard3dRequested('', storageWith(null), { defaultOn: true }), true);
  assert.equal(isBoard3dRequested('?other=1', null, { defaultOn: false }), false);
});

test('a storage getter that throws is ignored', () => {
  const throwing = {
    getItem() {
      throw new Error('SecurityError');
    },
  };
  assert.equal(isBoard3dRequested('?board=3d', throwing), true);
  assert.equal(isBoard3dRequested('', throwing, { defaultOn: true }), true);
  assert.equal(isBoard3dRequested('', throwing), false);
});
