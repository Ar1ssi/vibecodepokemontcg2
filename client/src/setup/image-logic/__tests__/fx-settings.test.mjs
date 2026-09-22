import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VOLUME,
  FX_OFF_KEY,
  SFX_OFF_KEY,
  VOLUME_KEY,
  normalizeVolume,
  readSettings,
  writeSetting,
} from '../fx-settings.mjs';

const fakeStorage = (seed = {}) => {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => (Object.hasOwn(data, k) ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
};

const throwingStorage = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
};

test('fx-settings: defaults when nothing is stored', () => {
  assert.deepEqual(readSettings(fakeStorage()), {
    fxOff: false,
    sfxOff: false,
    volume: DEFAULT_VOLUME,
  });
});

test('fx-settings: reads each stored flag', () => {
  const storage = fakeStorage({
    [FX_OFF_KEY]: '1',
    [SFX_OFF_KEY]: '1',
    [VOLUME_KEY]: '0.25',
  });
  assert.deepEqual(readSettings(storage), { fxOff: true, sfxOff: true, volume: 0.25 });
});

test('fx-settings: only the exact "1" string means off', () => {
  assert.equal(readSettings(fakeStorage({ [FX_OFF_KEY]: 'true' })).fxOff, false);
  assert.equal(readSettings(fakeStorage({ [FX_OFF_KEY]: '0' })).fxOff, false);
});

test('fx-settings: a missing or throwing storage yields defaults, not a throw', () => {
  assert.deepEqual(readSettings(null), { fxOff: false, sfxOff: false, volume: DEFAULT_VOLUME });
  assert.deepEqual(readSettings(undefined).volume, DEFAULT_VOLUME);
  assert.deepEqual(readSettings(throwingStorage), {
    fxOff: false,
    sfxOff: false,
    volume: DEFAULT_VOLUME,
  });
});

test('fx-settings: normalizeVolume clamps and rejects junk', () => {
  assert.equal(normalizeVolume(0.5), 0.5);
  assert.equal(normalizeVolume('0.5'), 0.5);
  assert.equal(normalizeVolume(2), 1);
  assert.equal(normalizeVolume(-1), 0);
  assert.equal(normalizeVolume(0), 0);
  assert.equal(normalizeVolume('loud'), DEFAULT_VOLUME);
  assert.equal(normalizeVolume(NaN), DEFAULT_VOLUME);
  assert.equal(normalizeVolume(null), DEFAULT_VOLUME);
  assert.equal(normalizeVolume(undefined), DEFAULT_VOLUME);
});

test('fx-settings: a corrupt stored volume falls back to the default', () => {
  assert.equal(readSettings(fakeStorage({ [VOLUME_KEY]: '{}' })).volume, DEFAULT_VOLUME);
  assert.equal(readSettings(fakeStorage({ [VOLUME_KEY]: '9' })).volume, 1);
});

test('fx-settings: writeSetting stores flags as 1/0 and volume as a number', () => {
  const storage = fakeStorage();
  assert.equal(writeSetting(storage, FX_OFF_KEY, true), true);
  assert.equal(storage.data[FX_OFF_KEY], '1');
  writeSetting(storage, FX_OFF_KEY, false);
  assert.equal(storage.data[FX_OFF_KEY], '0');
  writeSetting(storage, VOLUME_KEY, 3);
  assert.equal(storage.data[VOLUME_KEY], '1');
  assert.deepEqual(readSettings(storage), { fxOff: false, sfxOff: false, volume: 1 });
});

test('fx-settings: writeSetting reports failure instead of throwing', () => {
  assert.equal(writeSetting(throwingStorage, FX_OFF_KEY, true), false, 'a refused write');
  assert.equal(writeSetting(null, FX_OFF_KEY, true), false, 'nowhere to write');
  assert.equal(writeSetting(undefined, FX_OFF_KEY, true), false);
  assert.equal(writeSetting({}, FX_OFF_KEY, true), false, 'not a storage at all');
});
