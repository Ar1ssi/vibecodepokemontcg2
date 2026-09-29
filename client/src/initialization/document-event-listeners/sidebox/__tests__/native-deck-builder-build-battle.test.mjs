import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createRng } from '../../../../../../shared/engine/rng.mjs';
import { loadBoxData } from '../../../../setup/deck-builder/core/build-battle/box-data.mjs';
import { openBox } from '../../../../setup/deck-builder/core/build-battle/pack-opening.mjs';
import {
  BUILD_BATTLE_STORAGE_KEY,
  createSession,
} from '../../../../setup/deck-builder/core/build-battle/build-battle-session.mjs';
import { finishedUnboxing } from '../../../../setup/deck-builder/core/build-battle/unboxing.mjs';

// The scene's audio settings reach global-variables.js, which uses browser globals (`window`,
// `Image`, …) and opens a socket (`io()`) as it loads: a page's globals and a socket stand-in exist
// before the controller is imported.
const firstPage = new JSDOM('<!doctype html>', { url: 'http://localhost/build-and-battle', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(firstPage.window)) {
  if (key in globalThis) continue;
  try {
    globalThis[key] = firstPage.window[key];
  } catch {
    // a read-only global stays Node's own
  }
}
globalThis.window = firstPage.window;
globalThis.document = firstPage.window.document;
globalThis.io = () => ({ on() {}, off() {}, emit() {} });
after(() => firstPage.window.close());
const { initializeBuildBattle } = await import('../native-deck-builder-build-battle.js');

// The builder tab's box controller (design 054 § Builder tab) on a jsdom page with the real baked
// boxes. Every box a test touches is loaded first, so the controller's loads settle in microtasks:
// a test acts synchronously right after a pick, before any load lands, then `settle()`s.
const BOX_KEYS = ['phantasmal-flames', 'mega-evolution', 'perfect-order', 'temporal-forces', 'scarlet-violet'];
await Promise.all(BOX_KEYS.map((key) => loadBoxData(key)));

const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

function boot(t, { box = 'phantasmal-flames', saved = null } = {}) {
  const dom = new JSDOM('<!doctype html><div class="db-live"><div id="box"></div><div id="pool"></div></div>', {
    url: `http://localhost/build-and-battle?box=${box}`,
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  if (saved) dom.window.localStorage.setItem(BUILD_BATTLE_STORAGE_KEY, JSON.stringify(saved));
  const boxEl = document.getElementById('box');
  const controller = initializeBuildBattle({
    boxPanelEl: boxEl,
    poolPanelEl: document.getElementById('pool'),
    deckLibrary: null,
    getTarget: () => 'self',
    getDeck: () => ({}),
    addToDeck() {},
    showUnsavedDeck() {},
    detachEditor() {},
    showPool() {},
    showBox() {},
    onPreviewCard() {},
  });
  const stored = () => JSON.parse(dom.window.localStorage.getItem(BUILD_BATTLE_STORAGE_KEY) || 'null');
  const pick = (key) => {
    const select = boxEl.querySelector('#buildBattleBox');
    if (!select) return false;
    select.value = key;
    select.dispatchEvent(new dom.window.Event('change'));
    return true;
  };
  const text = (selector) => boxEl.querySelector(selector)?.textContent ?? null;
  return { dom, boxEl, controller, stored, pick, text };
}

// A finished Temporal Forces box, as a reload would find it in storage.
async function savedTemporalForces(extra = {}) {
  const loaded = await loadBoxData('temporal-forces');
  const opened = openBox({ ...loaded, rng: createRng(7) });
  return { ...createSession({ boxKey: 'temporal-forces', seed: 7, ...opened, ...extra }), unboxing: finishedUnboxing() };
}

test('row 6: switching back to the loaded box drops a load still in flight', async (t) => {
  const page = boot(t);
  await settle();
  page.pick('mega-evolution');
  page.pick('phantasmal-flames');
  await settle();
  assert.equal(page.boxEl.querySelector('#buildBattleBox')?.value, 'phantasmal-flames');
  assert.doesNotMatch(page.text('#buildBattleBoxNote'), /Loading/);
  assert.equal(page.boxEl.querySelector('#buildBattleOpenBox')?.disabled, false);
});

test('a saved box still loading hides the picker, so a click cannot put it away; it resumes', async (t) => {
  const saved = await savedTemporalForces();
  const page = boot(t, { saved });
  assert.equal(page.boxEl.querySelector('#buildBattleBox'), null, 'no picker while the saved box loads');
  assert.match(page.text('#buildBattleBoxNote'), /^Loading your Temporal Forces Build & Battle Box/);
  page.pick('scarlet-violet');
  await settle();
  assert.equal(page.stored()?.boxKey, 'temporal-forces');
  assert.match(page.text('.bb-title'), /^Temporal Forces Build & Battle Box · /);
});

test('a room change while a saved box loads puts that box away', async (t) => {
  const saved = await savedTemporalForces({ roomId: 'room-a' });
  const page = boot(t, { saved });
  page.controller.setRoom('room-b');
  await settle();
  assert.equal(page.stored(), null);
  assert.ok([...page.boxEl.querySelectorAll('.bb-banner')].some((node) => /new room/.test(node.textContent)));
  assert.ok(page.boxEl.querySelector('#buildBattleBox'), 'the picker is back for a fresh box');
});

test('the Box # field keeps a typed seed and its focus through a load', async (t) => {
  const page = boot(t);
  await settle();
  page.pick('perfect-order');
  const seed = page.boxEl.querySelector('#buildBattleSeed');
  seed.focus();
  seed.value = '1234';
  seed.dispatchEvent(new page.dom.window.Event('input'));
  await settle();
  const after = page.boxEl.querySelector('#buildBattleSeed');
  assert.equal(after.value, '1234');
  assert.equal(document.activeElement, after);
});
