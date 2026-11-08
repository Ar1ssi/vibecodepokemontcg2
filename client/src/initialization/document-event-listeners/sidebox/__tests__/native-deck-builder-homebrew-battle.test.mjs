import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { createRng } from '../../../../../../shared/engine/rng.mjs';
import { finishedUnboxing } from '../../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import {
  HOMEBREW_PACK_COUNT,
  hydrateHomebrewSet,
  openHomebrewBox,
  poolFromPacks,
} from '../../../../setup/deck-builder/core/homebrew-battle/homebrew-pack.mjs';
import {
  HOMEBREW_STORAGE_KEY,
  createHomebrewSession,
} from '../../../../setup/deck-builder/core/homebrew-battle/homebrew-session.mjs';

// Same page-globals dance as native-deck-builder-bnb-run.test.mjs: the scene's audio settings reach
// global-variables.js, which needs browser globals and a socket stand-in before import.
const firstPage = new JSDOM('<!doctype html>', { url: 'http://localhost/homebrew-battle', pretendToBeVisual: true });
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
const { initializeHomebrewBattle } = await import('../native-deck-builder-homebrew-battle.js');

// Source of truth for the cards: the shipped set.json of the Homebrew set (customhb).
const RAW = JSON.parse(
  readFileSync(new URL('../../../../assets/custom-sets/customhb/set.json', import.meta.url), 'utf8')
);
const { cards } = hydrateHomebrewSet(RAW);
const packs = openHomebrewBox({ cards, rng: createRng(9) });

const settle = async () => {
  for (let turn = 0; turn < 8; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

const finishedSession = (extra = {}) => ({
  ...createHomebrewSession({ seed: 9, packs, now: 4000 }),
  unboxing: finishedUnboxing({ packCount: HOMEBREW_PACK_COUNT, cardsPerPack: 10 }),
  ...extra,
});

function boot(t, { session = null, library = {}, query = '?seed=9', rawSet = RAW, fetchStatus = 200 } = {}) {
  const dom = new JSDOM('<!doctype html><div class="db-live"><div id="box"></div><div id="pool"></div></div>', {
    url: `http://localhost/homebrew-battle${query}`,
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.fetch = async () => ({ ok: fetchStatus === 200, status: fetchStatus, json: async () => rawSet });
  if (session) dom.window.localStorage.setItem(HOMEBREW_STORAGE_KEY, JSON.stringify(session));
  const calls = { detach: 0, showPool: 0, unsaved: [], created: [], opened: [] };
  let deck = {};
  const deckLibrary = {
    createAndOpenDeck: (target, name, deckCards, options) => {
      calls.created.push({ target, name, deckCards, options });
      return library.full ? null : 'deck-1';
    },
    openDeckById: (target, id) => {
      calls.opened.push(id);
      return library.has === id;
    },
    getActiveDeckId: () => library.activeId ?? null,
    getActiveDeckName: () => library.activeName ?? null,
  };
  const boxEl = document.getElementById('box');
  const poolEl = document.getElementById('pool');
  const controller = initializeHomebrewBattle({
    boxPanelEl: boxEl,
    poolPanelEl: poolEl,
    deckLibrary,
    getTarget: () => 'self',
    getDeck: () => deck,
    addToDeck() {},
    showUnsavedDeck: (shown) => calls.unsaved.push(shown),
    detachEditor() {
      calls.detach += 1;
    },
    showPool() {
      calls.showPool += 1;
    },
    onPreviewCard() {},
  });
  const stored = () => JSON.parse(dom.window.localStorage.getItem(HOMEBREW_STORAGE_KEY) || 'null');
  const buttonByText = (label) => [...boxEl.querySelectorAll('button')].find((node) => node.textContent === label);
  return { dom, boxEl, poolEl, controller, stored, calls, buttonByText, setDeck: (next) => (deck = next) };
}

const deckOf = (entries) =>
  Object.fromEntries(
    entries.map(([entry, copies]) => [entry.name, { cards: [{ data: entry, count: copies }], totalCount: copies }])
  );

test('no box: the buy-in shows the mode, the 30-pack offer and an enabled Open button; Play is blocked', async (t) => {
  const page = boot(t);
  await settle();
  assert.equal(page.boxEl.querySelector('.bnb-title').textContent, 'Homebrew Build & Battle');
  assert.match(
    page.boxEl.querySelector('#homebrewBoxNote').textContent,
    /30 Homebrew booster packs.*at least one Trainer and one Energy.*60-card.*6 Prizes/
  );
  assert.equal(page.boxEl.querySelector('#homebrewOpenBox').disabled, false);
  assert.equal(page.controller.playBlock(), 'Open your packs on the Packs tab to play');
  assert.deepEqual(page.controller.poolErrors({}), []);
  assert.match(page.poolEl.textContent, /Open your packs first/);
});

test('a set that fails to load says so and offers no box', async (t) => {
  const page = boot(t, { fetchStatus: 500 });
  await settle();
  assert.match(page.boxEl.querySelector('#homebrewBoxNote').textContent, /Could not load the Homebrew set/);
  assert.equal(page.boxEl.querySelector('#homebrewOpenBox').disabled, true);
});

test('Open stores a 30-pack box seeded from ?seed=, makes the deck, and plays the opening on the stage', async (t) => {
  const page = boot(t);
  await settle();
  page.boxEl.querySelector('#homebrewOpenBox').click();
  await settle();
  const session = page.stored();
  assert.equal(session.seed, 9);
  assert.equal(session.packs.length, 30);
  assert.deepEqual(session.packs, packs, 'the same seed opens the same box as the pure opener');
  assert.equal(session.unboxing.stage, 'sealed');
  assert.equal(session.deckId, 'deck-1');
  assert.equal(page.calls.created.length, 1);
  assert.equal(page.calls.created[0].name, 'Homebrew B&B #9');
  assert.ok(page.dom.window.document.getElementById('bbUnboxingStage'), 'the opening plays on the stage');
  assert.equal(page.controller.playBlock(), 'Finish opening your packs to play');
});

test('the opening is the 151 Ultra-Premium exterior alone: the lid is its printed front, nothing drawn over it', async (t) => {
  const page = boot(t, { session: createHomebrewSession({ seed: 9, packs, now: 4000 }) });
  await settle();
  const stage = page.dom.window.document.getElementById('bbUnboxingStage');
  assert.ok(stage);
  assert.match(stage.querySelector('.etb-pf--lid .etb-print__img').getAttribute('src'), /sv03\.5-ultra-premium-lid\.webp$/);
  assert.equal(stage.querySelector('.etb-plate'), null, 'no plate over the print');
  assert.equal(stage.querySelector('.etb-keyart'), null, 'no key art, slashes or set logo over the print');
  assert.equal(stage.querySelector('.etb-pill'), null);
  assert.ok(stage.querySelector('.etb-pf--print-side'), 'the other faces are plain');
});

test('a lifted lid with no promo unwraps itself and shows the 30 packs, with no props or pouch', async (t) => {
  const session = createHomebrewSession({ seed: 9, packs, now: 4000 });
  const page = boot(t, {
    session: { ...session, unboxing: { ...session.unboxing, wrapTorn: true, stage: 'opened' } },
  });
  // The unwrap waits for the tray to rise: 37 places (7 prop slots and 30 packs) at 70 ms each.
  await new Promise((resolve) => setTimeout(resolve, 3600));
  assert.equal(page.stored().unboxing.stage, 'deckShown');
  const stage = page.dom.window.document.getElementById('bbUnboxingStage');
  assert.equal(stage.querySelectorAll('.etb-packs [data-pack]').length, 30);
  assert.equal(stage.querySelector('.etb-prop'), null, 'no sleeves, dice, coin, guide or code card');
  assert.equal(stage.querySelector('.etb-pouch'), null, 'no promo pouch');
});

test('a finished box opens on the ready screen: pool counts, Build your deck, Play is open', async (t) => {
  const page = boot(t, { session: finishedSession({ deckId: 'deck-1' }), library: { has: 'deck-1' } });
  await settle();
  const pool = poolFromPacks({ cards, packs });
  const total = pool.reduce((sum, entry) => sum + entry.count, 0);
  assert.match(page.boxEl.textContent, /Box #9 · 30 packs opened/);
  assert.match(page.boxEl.textContent, new RegExp(`${total} cards · ${pool.length} different`));
  assert.match(page.boxEl.textContent, /Build exactly 60 cards/);
  assert.deepEqual(page.calls.opened, ['deck-1']);
  assert.equal(page.controller.playBlock(), '');
  page.buttonByText('Build your deck').click();
  assert.equal(page.calls.showPool, 1);
  assert.ok(page.poolEl.querySelectorAll('.bb-pool-card').length > pool.length, 'the pool grid and the unlimited Energy');
});

test('the pool limits the deck: a card the packs did not hold, or too many copies, is an error', async (t) => {
  const page = boot(t, { session: finishedSession({ deckId: 'deck-1' }), library: { has: 'deck-1' } });
  await settle();
  const [{ card, count }] = poolFromPacks({ cards, packs });
  const opened = new Set(packs.flat());
  const outside = cards.find((candidate) => !opened.has(candidate.id) && candidate.supertype === 'Pokémon');
  assert.deepEqual(page.controller.poolErrors(deckOf([[card, count]])), []);
  assert.deepEqual(page.controller.poolErrors(deckOf([[card, count + 1]])), [
    `${card.name}: ${count + 1} in deck, ${count} in your pool`,
  ]);
  assert.deepEqual(page.controller.poolErrors(deckOf([[outside, 1]])), [`${outside.name} is not in your pool`]);
});

test('Start over asks first, then clears the box and empties the editor; decks stay in My Decks', async (t) => {
  const page = boot(t, { session: finishedSession({ deckId: 'deck-1' }), library: { has: 'deck-1' } });
  await settle();
  page.buttonByText('Start over').click();
  assert.ok(page.stored(), 'nothing is cleared before the confirmation');
  assert.match(page.boxEl.textContent, /Starting over removes these packs/);
  page.buttonByText('Keep my packs').click();
  assert.ok(page.stored());
  assert.equal(page.calls.detach, 0);
  page.buttonByText('Start over').click();
  page.buttonByText('Yes, start over').click();
  assert.equal(page.stored(), null);
  assert.equal(page.calls.detach, 1);
  assert.ok(page.boxEl.querySelector('#homebrewOpenBox'), 'back on the buy-in');
});

test('a box whose cards the set no longer has is put away with a note', async (t) => {
  const trimmed = { ...RAW, cards: RAW.cards.filter((card) => card.id !== packs[0][0]) };
  const page = boot(t, { session: finishedSession({ deckId: 'deck-1' }), library: { has: 'deck-1' }, rawSet: trimmed });
  await settle();
  assert.equal(page.stored(), null);
  assert.match(page.boxEl.textContent, /no longer match the Homebrew set/);
  assert.ok(page.boxEl.querySelector('#homebrewOpenBox'));
});

test('at the deck limit the box deck opens unsaved and the session keeps the edits', async (t) => {
  const page = boot(t, { library: { full: true } });
  await settle();
  page.boxEl.querySelector('#homebrewOpenBox').click();
  await settle();
  assert.equal(page.calls.unsaved.length, 1);
  assert.equal(page.stored().deckId, null);
  assert.deepEqual(page.stored().unsavedDeck, []);
  assert.match(page.boxEl.textContent, /My Decks is full/);
  const [{ card }] = poolFromPacks({ cards, packs });
  page.setDeck(deckOf([[card, 2]]));
  page.controller.refresh();
  assert.deepEqual(page.stored().unsavedDeck, [[card.id, 2]]);
});

test('saving the unsaved deck under the box name binds the session; another deck does not', async (t) => {
  const library = { full: true };
  const page = boot(t, { library });
  await settle();
  page.boxEl.querySelector('#homebrewOpenBox').click();
  await settle();
  library.activeId = 'deck-7';
  library.activeName = 'My Charizard deck';
  page.controller.refresh();
  assert.equal(page.stored().deckId, null, 'an unrelated deck is left alone');
  library.activeName = 'Homebrew B&B #9';
  page.controller.refresh();
  assert.equal(page.stored().deckId, 'deck-7');
  assert.equal(page.stored().unsavedDeck, null);
});
