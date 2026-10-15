import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createRng } from '../../../../../../shared/engine/rng.mjs';
import { loadBoxData } from '../../../../setup/deck-builder/core/build-battle/box-data.mjs';
import { openBox } from '../../../../setup/deck-builder/core/build-battle/pack-opening.mjs';
import { createSession } from '../../../../setup/deck-builder/core/build-battle/build-battle-session.mjs';
import { finishedUnboxing } from '../../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import {
  RUN_STORAGE_KEY,
  createRun,
  recordResult,
} from '../../../../setup/deck-builder/core/build-battle-run/run-state.mjs';

// Same page-globals dance as native-deck-builder-build-battle.test.mjs: the scene's audio settings
// reach global-variables.js, which needs browser globals and a socket stand-in before import.
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
const { initializeBuildBattleRun } = await import('../native-deck-builder-bnb-run.js');

// The Run tab's controller (design 071) on a jsdom page with the real baked box.
const loadedBox = await loadBoxData('phantasmal-flames');
await loadBoxData('mega-evolution');

const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

// A finished, opened Phantasmal Flames box, as a reload would find it.
function openedSession(extra = {}) {
  const opened = openBox({ ...loadedBox, rng: createRng(11) });
  return { ...createSession({ boxKey: 'phantasmal-flames', seed: 11, ...opened }), unboxing: finishedUnboxing(), ...extra };
}

function boot(t, { run = null, play = { disabled: false, reason: '' } } = {}) {
  const dom = new JSDOM('<!doctype html><div class="db-live"><div id="run"></div><div id="pool"></div></div>', {
    url: 'http://localhost/build-and-battle?box=phantasmal-flames',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  if (run) dom.window.localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(run));
  const calls = { detach: 0, play: 0, showPool: 0, unsaved: 0 };
  const playState = { ...play };
  const runEl = document.getElementById('run');
  const controller = initializeBuildBattleRun({
    runPanelEl: runEl,
    poolPanelEl: document.getElementById('pool'),
    deckLibrary: null,
    getTarget: () => 'self',
    getDeck: () => ({}),
    addToDeck() {},
    showUnsavedDeck() {
      calls.unsaved += 1;
    },
    detachEditor() {
      calls.detach += 1;
    },
    showPool() {
      calls.showPool += 1;
    },
    showRun() {},
    onPreviewCard() {},
    getPlayState: () => playState,
    requestPlay() {
      calls.play += 1;
    },
  });
  const stored = () => JSON.parse(dom.window.localStorage.getItem(RUN_STORAGE_KEY) || 'null');
  const text = (selector) => runEl.querySelector(selector)?.textContent ?? null;
  const click = (selector) => runEl.querySelector(selector).click();
  const buttonByText = (label) => [...runEl.querySelectorAll('button')].find((node) => node.textContent === label);
  return { dom, runEl, controller, stored, text, click, buttonByText, calls, playState };
}

const savedRun = (extra = {}) => ({ ...createRun({ session: openedSession(), now: 5000 }), ...extra });

test('no run: the buy-in names the mode, offers a box and the classic opener', async (t) => {
  const page = boot(t);
  await settle();
  assert.equal(page.text('.bnb-title'), 'Build & Battle Mode');
  assert.equal(page.runEl.querySelector('.bnb-carousel-caption').textContent, 'Build a deck with a Build & Battle Box.');
  assert.equal(page.runEl.querySelector('#bnbStartRun').disabled, false);
  assert.equal(page.runEl.querySelector('.bnb-legacy-link').getAttribute('href'), '/build-and-battle-legacy');
  assert.equal(page.controller.playBlock(), 'Start a run on the Run tab to play');
});

test('Start run asks first, then stores a run and opens the box on the stage', async (t) => {
  const page = boot(t);
  await settle();
  page.click('#bnbStartRun');
  assert.equal(page.stored(), null, 'nothing is stored before the confirmation');
  assert.match(page.text('.bnb-dialog-body'), /begin Build & Battle Mode/);
  page.buttonByText('Cancel').click();
  assert.equal(page.runEl.querySelector('.bnb-dialog'), null);
  assert.equal(page.stored(), null);
  page.click('#bnbStartRun');
  page.runEl.querySelector('.bnb-dialog .bb-primary').click();
  await settle();
  const run = page.stored();
  assert.equal(run.status, 'in-progress');
  assert.deepEqual(run.results, []);
  assert.equal(run.boxKey, 'phantasmal-flames');
  assert.ok(page.dom.window.document.getElementById('bbUnboxingStage'), 'the opening plays on the stage');
});

test('a saved run opens on the lobby: meter, five nodes, Play follows the deck pane', async (t) => {
  const page = boot(t, { run: savedRun(), play: { disabled: true, reason: 'Deck must contain exactly 40 cards.' } });
  await settle();
  assert.equal(page.text('.bnb-meter-label'), '0/5 Matches');
  const states = [...page.runEl.querySelectorAll('.bnb-node')].map((node) => node.dataset.state);
  assert.deepEqual(states, ['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(page.runEl.querySelector('[data-bnb-play]').disabled, true);
  assert.equal(page.text('[data-bnb-deck-invalid]'), 'Deck must contain exactly 40 cards.');
  page.playState.disabled = false;
  page.playState.reason = '';
  page.controller.refresh();
  assert.equal(page.runEl.querySelector('[data-bnb-play]').disabled, false);
  assert.equal(page.text('[data-bnb-deck-invalid]'), '');
  page.click('[data-bnb-play]');
  assert.equal(page.calls.play, 1);
});

test('Play arms the run once, and keeps results another tab recorded', async (t) => {
  const run = savedRun();
  const page = boot(t, { run });
  await settle();
  // The game tab recorded a win while this tab sat open.
  page.dom.window.localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(recordResult(run, true)));
  page.controller.onPlay();
  const after = page.stored();
  assert.deepEqual(after.results, [true]);
  assert.equal(typeof after.armedAt, 'number');
});

test('a result the game tab stores shows up through the storage event', async (t) => {
  const run = savedRun();
  const page = boot(t, { run });
  await settle();
  page.dom.window.localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(recordResult(run, false)));
  page.dom.window.dispatchEvent(new page.dom.window.StorageEvent('storage', { key: RUN_STORAGE_KEY }));
  assert.equal(page.text('.bnb-meter-label'), '1/5 Matches');
  assert.equal(page.runEl.querySelector('.bnb-node').dataset.state, 'loss');
});

test('Forfeit confirms, ends the run early and shows the summary', async (t) => {
  const page = boot(t, { run: savedRun() });
  await settle();
  page.buttonByText('Forfeit').click();
  assert.equal(page.stored().status, 'in-progress', 'the confirmation comes first');
  page.runEl.querySelector('.bnb-dialog .bb-primary').click();
  assert.equal(page.stored().status, 'ended');
  assert.equal(page.stored().endedEarly, true);
  assert.equal(page.text('.bnb-title'), 'Run forfeited · 0–0');
  assert.equal(page.controller.playBlock(), 'This run is over');
});

test('recording a result by hand fills the next node', async (t) => {
  const page = boot(t, { run: savedRun() });
  await settle();
  page.buttonByText('Record a win').click();
  assert.deepEqual(page.stored().results, [true]);
  assert.equal(page.text('.bnb-meter-label'), '1/5 Matches');
});

test('the fifth result ends the run and Done returns to the buy-in', async (t) => {
  let run = savedRun();
  for (const won of [true, true, false, true]) run = recordResult(run, won);
  const page = boot(t, { run });
  await settle();
  page.buttonByText('Record a loss').click();
  assert.equal(page.text('.bnb-title'), 'Run complete · 3–2');
  assert.equal(page.runEl.querySelectorAll('.bnb-results li').length, 5);
  page.click('#bnbDone');
  assert.equal(page.stored(), null);
  assert.equal(page.calls.detach, 1);
  assert.ok(page.runEl.querySelector('#bnbStartRun'), 'the buy-in is back');
});

test('a run whose cards the box data no longer has is put away with a note', async (t) => {
  const session = openedSession();
  const stale = { ...savedRun(), session: { ...session, packs: session.packs.map((pack) => pack.map(() => 'zz-0')) } };
  const page = boot(t, { run: stale });
  await settle();
  assert.equal(page.stored(), null);
  assert.match(page.text('.bb-banner'), /no longer matches/);
  assert.ok(page.runEl.querySelector('#bnbStartRun'));
});

test('Start run never overwrites a run another tab started since the buy-in was drawn', async (t) => {
  const page = boot(t);
  await settle();
  const other = recordResult(savedRun({ startedAt: 9000 }), true);
  page.dom.window.localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(other));
  page.click('#bnbStartRun');
  page.runEl.querySelector('.bnb-dialog .bb-primary').click();
  await settle();
  assert.equal(page.stored().startedAt, 9000);
  assert.deepEqual(page.stored().results, [true]);
  assert.equal(page.text('.bnb-meter-label'), '1/5 Matches');
});

test('a different run appearing in storage replaces the one on screen', async (t) => {
  const page = boot(t, { run: savedRun() });
  await settle();
  const other = recordResult(recordResult(savedRun({ startedAt: 9000 }), true), true);
  page.dom.window.localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(other));
  page.dom.window.dispatchEvent(new page.dom.window.StorageEvent('storage', { key: RUN_STORAGE_KEY }));
  await settle();
  assert.equal(page.text('.bnb-meter-label'), '2/5 Matches');
  // This tab now works on that run: a change goes into it, not into the old one.
  page.buttonByText('Record a loss').click();
  assert.equal(page.stored().startedAt, 9000);
  assert.deepEqual(page.stored().results, [true, true, false]);
});

test('Escape closes a dialog', async (t) => {
  const page = boot(t, { run: savedRun() });
  await settle();
  page.buttonByText('Forfeit').click();
  const cancel = page.runEl.querySelector('.bnb-dialog button');
  cancel.dispatchEvent(new page.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(page.runEl.querySelector('.bnb-dialog'), null);
  assert.equal(page.stored().status, 'in-progress');
});

test('I207 parity: an editor refresh before the run resumes does not wipe the unsaved deck', async (t) => {
  const cardId = openedSession().packs[0][0];
  const session = openedSession({ deckId: null, unsavedDeck: [[cardId, 2]] });
  const page = boot(t, { run: savedRun({ session }) });
  // The deck pane renders (and refreshes the controller) while the box data is still loading.
  page.controller.refresh();
  assert.deepEqual(page.stored().session.unsavedDeck, [[cardId, 2]]);
  await settle();
  assert.deepEqual(page.stored().session.unsavedDeck, [[cardId, 2]]);
});

test('row 13: a run saved mid-opening reopens the stage on load', async (t) => {
  const sealed = createSession({ boxKey: 'phantasmal-flames', seed: 11, ...openBox({ ...loadedBox, rng: createRng(11) }) });
  const page = boot(t, { run: createRun({ session: sealed, now: 5000 }) });
  await settle();
  assert.ok(page.dom.window.document.getElementById('bbUnboxingStage'));
  assert.equal(page.runEl.querySelector('.bnb-lobby'), null);
});

test('row 11: with storage blocked the run lives in memory and says so', async (t) => {
  const dom = new JSDOM('<!doctype html><div class="db-live"><div id="run"></div><div id="pool"></div></div>', {
    url: 'http://localhost/build-and-battle?box=phantasmal-flames',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  Object.defineProperty(dom.window, 'localStorage', {
    get() {
      throw new Error('SecurityError');
    },
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const runEl = document.getElementById('run');
  initializeBuildBattleRun({
    runPanelEl: runEl,
    poolPanelEl: document.getElementById('pool'),
    deckLibrary: null,
    getTarget: () => 'self',
    getDeck: () => ({}),
    addToDeck() {},
    showUnsavedDeck() {},
    detachEditor() {},
    showPool() {},
    showRun() {},
    onPreviewCard() {},
  });
  await settle();
  runEl.querySelector('#bnbStartRun').click();
  runEl.querySelector('.bnb-dialog .bb-primary').click();
  await settle();
  assert.match(runEl.querySelector('.bb-banner').textContent, /will not survive a reload/);
  assert.ok(document.getElementById('bbUnboxingStage'), 'the run still starts');
});

test('a run that fails to parse is ignored: the buy-in shows', async (t) => {
  const page = boot(t, { run: { version: 99 } });
  await settle();
  assert.ok(page.runEl.querySelector('#bnbStartRun'));
});
