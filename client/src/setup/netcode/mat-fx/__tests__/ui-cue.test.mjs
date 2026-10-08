import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SOURCE_MAP } from '../../../../../../scripts/sfx/source-map.mjs';
import { UI_CUES } from '../sfx-cues.mjs';
import { createUiCue, uiCue, withUiCue, wireButtonCues } from '../ui-cue.mjs';

const HOOKED_UI_KEYS = [
  'end-turn',
  'attack-button',
  'button-click',
  'choose-first-second',
  'big-card-in',
  'big-card-out',
  'card-view',
  'pile-search',
  'card-slot-drop',
  'search-to-hand',
  'menu-pop-in',
  'card-from-hand',
  'card-place',
  'card-no-match',
  'card-to-board',
];

test('every UI chrome cue is a ui-bus cue backed by an importer source file', () => {
  const importerKeys = new Set(Object.values(SOURCE_MAP).map((entry) => entry.key));
  for (const key of HOOKED_UI_KEYS) {
    assert.ok(UI_CUES.has(key), `${key} must be in UI_CUES`);
    // card-place is a variant group the importer lists by prefix rather than by file name.
    if (key !== 'card-place') assert.ok(importerKeys.has(key), `${key} must have a source file`);
  }
});

test('createUiCue plays the named cue through the loaded audio module', async () => {
  const played = [];
  const cue = createUiCue(() => Promise.resolve({ playUiCue: (key) => played.push(key) }));
  cue('end-turn');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(played, ['end-turn']);
});

test('a failing audio load or play never throws or rejects (best-effort)', async () => {
  createUiCue(() => Promise.reject(new Error('no audio')))('button-click');
  createUiCue(() => {
    throw new Error('sync load failure');
  })('button-click');
  createUiCue(() => Promise.resolve({ playUiCue: () => { throw new Error('boom'); } }))('button-click');
  await new Promise((resolve) => setImmediate(resolve));
});

test('the default uiCue is inert under node (fx-audio needs a window)', async () => {
  uiCue('button-click');
  await new Promise((resolve) => setImmediate(resolve));
});

test('withUiCue sounds first, then forwards arguments and the result', () => {
  const order = [];
  const wrapped = withUiCue(
    (a, b) => {
      order.push('handler');
      return a + b;
    },
    'attack-button',
    (key) => order.push(key)
  );
  assert.equal(wrapped(2, 3), 5);
  assert.deepEqual(order, ['attack-button', 'handler']);
});

test('wireButtonCues sounds each present button on click and skips missing ids', () => {
  const doc = new JSDOM('<button id="a"></button><button id="b"></button>').window.document;
  const played = [];
  const wired = wireButtonCues(['a', 'missing', 'b'], { doc, play: (key) => played.push(key) });
  assert.equal(wired, 2);
  doc.getElementById('a').click();
  doc.getElementById('b').click();
  assert.deepEqual(played, ['button-click', 'button-click']);
});

test('wireButtonCues takes a custom cue key', () => {
  const doc = new JSDOM('<button id="atk"></button>').window.document;
  const played = [];
  wireButtonCues(['atk'], { key: 'attack-button', doc, play: (key) => played.push(key) });
  doc.getElementById('atk').click();
  assert.deepEqual(played, ['attack-button']);
});
