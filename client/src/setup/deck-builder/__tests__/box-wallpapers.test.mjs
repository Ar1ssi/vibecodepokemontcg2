import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BOX_WALLPAPERS,
  DEFAULT_WALLPAPER_ID,
  cycleWallpaper,
  findWallpaper,
} from '../core/box-wallpapers.mjs';

const CLIENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('there are sixteen Gen V wallpapers, each with vendored banner and body art', () => {
  assert.equal(BOX_WALLPAPERS.length, 16);
  for (const wallpaper of BOX_WALLPAPERS) {
    assert.ok(existsSync(path.join(CLIENT_ROOT, wallpaper.banner)), wallpaper.banner);
    assert.ok(existsSync(path.join(CLIENT_ROOT, wallpaper.body)), wallpaper.body);
  }
});

test('an unknown or missing id falls back to the default wallpaper', () => {
  assert.equal(findWallpaper('nope').id, DEFAULT_WALLPAPER_ID);
  assert.equal(findWallpaper(null).id, DEFAULT_WALLPAPER_ID);
  assert.equal(findWallpaper('cave').name, 'Cave');
});

test('cycling wraps at both ends of the list', () => {
  const first = BOX_WALLPAPERS[0].id;
  const last = BOX_WALLPAPERS.at(-1).id;
  assert.equal(cycleWallpaper(last, 1).id, first);
  assert.equal(cycleWallpaper(first, -1).id, last);
  assert.equal(cycleWallpaper(first, 1).id, BOX_WALLPAPERS[1].id);
  assert.equal(cycleWallpaper('nope', 1).id, BOX_WALLPAPERS[1].id);
});
