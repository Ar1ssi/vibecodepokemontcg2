import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VOLUME,
  FX_OFF_KEY,
  SFX_OFF_KEY,
  VOLUME_KEY,
  normalizeVolume,
  AMBIENCE_OFF_KEY,
  CROWD_OFF_KEY,
  HOVER_PREVIEW_OFF_KEY,
  STADIUM_BOARDS_OFF_KEY,
  HOLO_SHAPES_OFF_KEY,
  CAMERA_PRESET_KEY,
  normalizeCameraPreset,
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
    ambienceOff: false,
    crowdOff: true,
    hoverPreviewOff: false,
    stadiumBoardsOff: false,
    holoShapesOff: false,
    cameraPreset: 'tilt12',
  });
});

test('fx-settings: reads each stored flag', () => {
  const storage = fakeStorage({
    [FX_OFF_KEY]: '1',
    [SFX_OFF_KEY]: '1',
    [VOLUME_KEY]: '0.25',
  });
  assert.deepEqual(readSettings(storage), {
    fxOff: true,
    sfxOff: true,
    volume: 0.25,
    ambienceOff: false,
    crowdOff: true,
    hoverPreviewOff: false,
    stadiumBoardsOff: false,
    holoShapesOff: false,
    cameraPreset: 'tilt12',
  });
});

test('fx-settings: status ambience is on by default and off only for the stored "1"', () => {
  assert.equal(readSettings(fakeStorage()).ambienceOff, false);
  assert.equal(readSettings(fakeStorage({ [AMBIENCE_OFF_KEY]: '1' })).ambienceOff, true);
  assert.equal(readSettings(fakeStorage({ [AMBIENCE_OFF_KEY]: 'yes' })).ambienceOff, false);
});

test('fx-settings: only the exact "1" string means off', () => {
  assert.equal(readSettings(fakeStorage({ [FX_OFF_KEY]: 'true' })).fxOff, false);
  assert.equal(readSettings(fakeStorage({ [FX_OFF_KEY]: '0' })).fxOff, false);
});

test('fx-settings: a missing or throwing storage yields defaults, not a throw', () => {
  assert.deepEqual(readSettings(null), {
    fxOff: false,
    sfxOff: false,
    volume: DEFAULT_VOLUME,
    ambienceOff: false,
    crowdOff: true,
    hoverPreviewOff: false,
    stadiumBoardsOff: false,
    holoShapesOff: false,
    cameraPreset: 'tilt12',
  });
  assert.deepEqual(readSettings(undefined).volume, DEFAULT_VOLUME);
  assert.deepEqual(readSettings(throwingStorage), {
    fxOff: false,
    sfxOff: false,
    volume: DEFAULT_VOLUME,
    ambienceOff: false,
    crowdOff: true,
    hoverPreviewOff: false,
    stadiumBoardsOff: false,
    holoShapesOff: false,
    cameraPreset: 'tilt12',
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
  assert.deepEqual(readSettings(storage), { fxOff: false, sfxOff: false, ambienceOff: false, crowdOff: true, hoverPreviewOff: false, stadiumBoardsOff: false, holoShapesOff: false, cameraPreset: 'tilt12', volume: 1 });
});

test('fx-settings: writeSetting reports failure instead of throwing', () => {
  assert.equal(writeSetting(throwingStorage, FX_OFF_KEY, true), false, 'a refused write');
  assert.equal(writeSetting(null, FX_OFF_KEY, true), false, 'nowhere to write');
  assert.equal(writeSetting(undefined, FX_OFF_KEY, true), false);
  assert.equal(writeSetting({}, FX_OFF_KEY, true), false, 'not a storage at all');
});

test('fx-settings: the crowd is off by default and on only for the stored "0"', () => {
  assert.equal(readSettings(fakeStorage()).crowdOff, true);
  assert.equal(readSettings(fakeStorage({ [CROWD_OFF_KEY]: '0' })).crowdOff, false);
  assert.equal(readSettings(fakeStorage({ [CROWD_OFF_KEY]: '1' })).crowdOff, true);
  assert.equal(readSettings(fakeStorage({ [CROWD_OFF_KEY]: 'no' })).crowdOff, true);
  assert.equal(readSettings(throwingStorage).crowdOff, true);
});

test('fx-settings: the hover preview (design 069) is on by default and off only for the stored "1"', () => {
  assert.equal(readSettings(fakeStorage()).hoverPreviewOff, false);
  assert.equal(readSettings(fakeStorage({ [HOVER_PREVIEW_OFF_KEY]: '1' })).hoverPreviewOff, true);
  assert.equal(readSettings(fakeStorage({ [HOVER_PREVIEW_OFF_KEY]: '0' })).hoverPreviewOff, false);
  assert.equal(readSettings(fakeStorage({ [HOVER_PREVIEW_OFF_KEY]: 'off' })).hoverPreviewOff, false);
  assert.equal(readSettings(throwingStorage).hoverPreviewOff, false);
});

test('fx-settings: the hover preview toggle round-trips through writeSetting', () => {
  const storage = fakeStorage();
  writeSetting(storage, HOVER_PREVIEW_OFF_KEY, true);
  assert.equal(readSettings(storage).hoverPreviewOff, true);
  writeSetting(storage, HOVER_PREVIEW_OFF_KEY, false);
  assert.equal(readSettings(storage).hoverPreviewOff, false);
});

test('fx-settings: the holo sparkle shapes are on by default and off only for the stored "1"', () => {
  assert.equal(readSettings(fakeStorage()).holoShapesOff, false);
  assert.equal(readSettings(fakeStorage({ [HOLO_SHAPES_OFF_KEY]: '1' })).holoShapesOff, true);
  assert.equal(readSettings(fakeStorage({ [HOLO_SHAPES_OFF_KEY]: '0' })).holoShapesOff, false);
  assert.equal(readSettings(fakeStorage({ [HOLO_SHAPES_OFF_KEY]: 'true' })).holoShapesOff, false);
  assert.equal(readSettings(throwingStorage).holoShapesOff, false);
});

test('fx-settings: the holo sparkle toggle round-trips through writeSetting', () => {
  const storage = fakeStorage();
  writeSetting(storage, HOLO_SHAPES_OFF_KEY, true);
  assert.equal(storage.data[HOLO_SHAPES_OFF_KEY], '1');
  assert.equal(readSettings(storage).holoShapesOff, true);
  writeSetting(storage, HOLO_SHAPES_OFF_KEY, false);
  assert.equal(readSettings(storage).holoShapesOff, false);
});

test('fx-settings: the camera preset (design 074 H3) defaults to tilt12 and is tcgl only for the stored "tcgl"', () => {
  assert.equal(readSettings(fakeStorage()).cameraPreset, 'tilt12');
  assert.equal(readSettings(fakeStorage({ [CAMERA_PRESET_KEY]: 'tcgl' })).cameraPreset, 'tcgl');
  assert.equal(readSettings(fakeStorage({ [CAMERA_PRESET_KEY]: 'tilt12' })).cameraPreset, 'tilt12');
  assert.equal(readSettings(fakeStorage({ [CAMERA_PRESET_KEY]: 'TCGL' })).cameraPreset, 'tilt12');
  assert.equal(readSettings(fakeStorage({ [CAMERA_PRESET_KEY]: '1' })).cameraPreset, 'tilt12');
  assert.equal(readSettings(throwingStorage).cameraPreset, 'tilt12');
  assert.equal(normalizeCameraPreset(undefined), 'tilt12');
});

test('fx-settings: the camera preset round-trips through writeSetting and rejects junk', () => {
  const storage = fakeStorage();
  writeSetting(storage, CAMERA_PRESET_KEY, 'tcgl');
  assert.equal(storage.data[CAMERA_PRESET_KEY], 'tcgl');
  assert.equal(readSettings(storage).cameraPreset, 'tcgl');
  writeSetting(storage, CAMERA_PRESET_KEY, 'tilt12');
  assert.equal(readSettings(storage).cameraPreset, 'tilt12');
  writeSetting(storage, CAMERA_PRESET_KEY, true);
  assert.equal(storage.data[CAMERA_PRESET_KEY], 'tilt12');
});

test('fx-settings: Stadium boards are on by default and off only for the stored "1" (design 077)', () => {
  assert.equal(STADIUM_BOARDS_OFF_KEY, 'ptcg-stadium-boards-off');
  assert.equal(readSettings(fakeStorage()).stadiumBoardsOff, false);
  assert.equal(readSettings({ getItem: (key) => (key === 'ptcg-stadium-boards-off' ? '1' : null) }).stadiumBoardsOff, true);
  assert.equal(readSettings(fakeStorage({ [STADIUM_BOARDS_OFF_KEY]: '0' })).stadiumBoardsOff, false);
  assert.equal(readSettings(throwingStorage).stadiumBoardsOff, false);
  const storage = fakeStorage();
  writeSetting(storage, STADIUM_BOARDS_OFF_KEY, true);
  assert.equal(readSettings(storage).stadiumBoardsOff, true);
});
