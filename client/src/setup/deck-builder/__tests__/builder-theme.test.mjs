import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILDER_THEMES,
  BUILDER_THEME_STORAGE_KEY,
  applyBuilderTheme,
  builderThemeClasses,
  builderThemeToggleLabel,
  loadBuilderTheme,
  normalizeBuilderTheme,
  saveBuilderTheme,
  toggleBuilderTheme,
} from '../core/builder-theme.mjs';

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    _map: map,
  };
}

function makeClassListEl(initial = []) {
  const set = new Set(initial);
  return {
    classList: {
      add: (name) => set.add(name),
      toggle: (name, force) => (force ? set.add(name) : set.delete(name)),
      contains: (name) => set.has(name),
    },
    _set: set,
  };
}

test('normalizeBuilderTheme defaults to dark for anything unrecognised', () => {
  assert.equal(normalizeBuilderTheme('light'), BUILDER_THEMES.LIGHT);
  assert.equal(normalizeBuilderTheme('dark'), BUILDER_THEMES.DARK);
  assert.equal(normalizeBuilderTheme('neon'), BUILDER_THEMES.DARK);
  assert.equal(normalizeBuilderTheme(undefined), BUILDER_THEMES.DARK);
  assert.equal(normalizeBuilderTheme(null), BUILDER_THEMES.DARK);
});

test('loadBuilderTheme reads a persisted theme and defaults when empty', () => {
  assert.equal(loadBuilderTheme(makeStorage()), BUILDER_THEMES.DARK);
  assert.equal(
    loadBuilderTheme(makeStorage({ [BUILDER_THEME_STORAGE_KEY]: 'light' })),
    BUILDER_THEMES.LIGHT
  );
  assert.equal(
    loadBuilderTheme(makeStorage({ [BUILDER_THEME_STORAGE_KEY]: 'garbage' })),
    BUILDER_THEMES.DARK
  );
});

test('loadBuilderTheme survives a storage that throws or is absent', () => {
  const hostile = {
    getItem: () => {
      throw new Error('SecurityError');
    },
  };
  assert.equal(loadBuilderTheme(hostile), BUILDER_THEMES.DARK);
  assert.equal(loadBuilderTheme(undefined), BUILDER_THEMES.DARK);
});

test('saveBuilderTheme writes a normalized value and never throws', () => {
  const storage = makeStorage();
  saveBuilderTheme(storage, 'garbage');
  assert.equal(
    storage._map.get(BUILDER_THEME_STORAGE_KEY),
    BUILDER_THEMES.DARK
  );

  saveBuilderTheme(storage, BUILDER_THEMES.LIGHT);
  assert.equal(
    storage._map.get(BUILDER_THEME_STORAGE_KEY),
    BUILDER_THEMES.LIGHT
  );

  assert.doesNotThrow(() =>
    saveBuilderTheme(
      {
        setItem: () => {
          throw new Error('QuotaExceeded');
        },
      },
      BUILDER_THEMES.DARK
    )
  );
  assert.doesNotThrow(() => saveBuilderTheme(undefined, BUILDER_THEMES.DARK));
});

test('toggleBuilderTheme flips between the two themes', () => {
  assert.equal(toggleBuilderTheme(BUILDER_THEMES.DARK), BUILDER_THEMES.LIGHT);
  assert.equal(toggleBuilderTheme(BUILDER_THEMES.LIGHT), BUILDER_THEMES.DARK);
  assert.equal(toggleBuilderTheme('garbage'), BUILDER_THEMES.LIGHT);
});

test('builderThemeClasses always opts into the Live stylesheet', () => {
  assert.deepEqual(builderThemeClasses(BUILDER_THEMES.DARK), ['db-live']);
  assert.deepEqual(builderThemeClasses(BUILDER_THEMES.LIGHT), [
    'db-live',
    'db-light',
  ]);
});

test('builderThemeToggleLabel advertises the theme it switches to', () => {
  assert.match(builderThemeToggleLabel(BUILDER_THEMES.DARK).title, /light/i);
  assert.match(builderThemeToggleLabel(BUILDER_THEMES.LIGHT).title, /dark/i);
});

test('applyBuilderTheme sets classes, persists, and returns the resolved theme', () => {
  const el = makeClassListEl();
  const storage = makeStorage();

  assert.equal(
    applyBuilderTheme(el, BUILDER_THEMES.LIGHT, storage),
    BUILDER_THEMES.LIGHT
  );
  assert.ok(el.classList.contains('db-live'));
  assert.ok(el.classList.contains('db-light'));
  assert.equal(
    storage._map.get(BUILDER_THEME_STORAGE_KEY),
    BUILDER_THEMES.LIGHT
  );

  assert.equal(
    applyBuilderTheme(el, BUILDER_THEMES.DARK, storage),
    BUILDER_THEMES.DARK
  );
  assert.ok(el.classList.contains('db-live'));
  assert.ok(!el.classList.contains('db-light'));
  assert.equal(
    storage._map.get(BUILDER_THEME_STORAGE_KEY),
    BUILDER_THEMES.DARK
  );
});

test('applyBuilderTheme tolerates a missing element', () => {
  const storage = makeStorage();
  assert.equal(
    applyBuilderTheme(null, BUILDER_THEMES.LIGHT, storage),
    BUILDER_THEMES.LIGHT
  );
  assert.equal(
    storage._map.get(BUILDER_THEME_STORAGE_KEY),
    BUILDER_THEMES.LIGHT
  );
});
