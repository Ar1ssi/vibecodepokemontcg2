import test from 'node:test';
import assert from 'node:assert/strict';

import { advanceUnboxing, createUnboxing } from '../../unboxing.mjs';
import {
  createCosmetic,
  finishCosmetic,
  logicalOfVisual,
  nextStep,
  parseCosmetic,
  reconcileCosmetic,
  tableView,
  tearPackAction,
} from '../flow.mjs';

const play = (u, ...events) => events.reduce((state, event) => advanceUnboxing(state, event), u);
const opened = () =>
  play(createUnboxing(), { type: 'tearWrap' }, { type: 'openLid' }, { type: 'unwrapDeck' });

test('the next step walks the physical order of an opening', () => {
  const sealed = createUnboxing();
  const cosmetic = createCosmetic(42);
  assert.equal(nextStep(tableView(sealed, cosmetic)), 'tearWrap');
  const unwrapped = play(sealed, { type: 'tearWrap' });
  assert.equal(nextStep(tableView(unwrapped, cosmetic)), 'openLid');
  const lidUp = play(unwrapped, { type: 'openLid' });
  assert.equal(nextStep(tableView(lidUp, cosmetic)), 'takeOut');
  assert.equal(nextStep(tableView(lidUp, { ...cosmetic, itemsOut: true })), 'unwrapDeck');
  const deck = play(lidUp, { type: 'unwrapDeck' });
  assert.equal(nextStep(tableView(deck, cosmetic)), 'openPack');
});

test('a pack torn out of on-table order takes the next logical pack', () => {
  const u = opened();
  const first = tearPackAction(u, createCosmetic(42), 2);
  assert.deepEqual(first.event, { type: 'tearPack', packIndex: 0 });
  assert.deepEqual(first.cosmetic.packOrder, [2]);
  const torn = advanceUnboxing(u, first.event);
  const view = tableView(torn, first.cosmetic);
  assert.equal(view.currentLogical, 0);
  assert.equal(view.currentVisual, 2);
  assert.deepEqual(view.untornVisual, [0, 1, 3]);
  assert.equal(nextStep(view), 'revealCard');
  assert.equal(logicalOfVisual(first.cosmetic, 2), 0);
  assert.equal(logicalOfVisual(first.cosmetic, 0), -1);
});

test('no pack tears while one is mid-reveal, twice, or before the deck is unwrapped', () => {
  const u = opened();
  const first = tearPackAction(u, createCosmetic(42), 1);
  const torn = advanceUnboxing(u, first.event);
  assert.equal(tearPackAction(torn, first.cosmetic, 0), null, 'mid-reveal');
  const revealed = play(torn, { type: 'revealAll', packIndex: 0 });
  assert.equal(tearPackAction(revealed, first.cosmetic, 1), null, 'already torn');
  assert.equal(tearPackAction(revealed, first.cosmetic, 9), null, 'no such pack');
  const second = tearPackAction(revealed, first.cosmetic, 0);
  assert.deepEqual(second.event, { type: 'tearPack', packIndex: 1 });
  const wrapped = play(createUnboxing(), { type: 'tearWrap' }, { type: 'openLid' });
  assert.equal(tearPackAction(wrapped, createCosmetic(42), 0), null, 'deck still wrapped');
});

test('a reload view puts revealed cards on the table and the rest in hand', () => {
  const u = opened();
  const first = tearPackAction(u, createCosmetic(42), 3);
  const midPack = play(
    advanceUnboxing(u, first.event),
    { type: 'revealCard', packIndex: 0 },
    { type: 'revealCard', packIndex: 0 },
    { type: 'revealCard', packIndex: 0 }
  );
  const view = tableView(midPack, first.cosmetic);
  assert.equal(view.revealed, 3);
  assert.equal(view.currentVisual, 3);
  assert.equal(view.itemsOut, true);
  assert.equal(view.deckUnwrapped, true);
});

test('a stored record from another box or malformed is replaced', () => {
  const good = { v: 1, seed: 42, itemsOut: true, packOrder: [2, 0] };
  assert.deepEqual(parseCosmetic(good, { seed: 42, packCount: 4 }), good);
  assert.deepEqual(parseCosmetic(good, { seed: 43, packCount: 4 }), createCosmetic(43));
  for (const bad of [
    null,
    'x',
    { ...good, v: 2 },
    { ...good, itemsOut: 'yes' },
    { ...good, packOrder: [0, 0] },
    { ...good, packOrder: [4] },
    { ...good, packOrder: [0, 1, 2, 3, 0] },
  ]) {
    assert.deepEqual(parseCosmetic(bad, { seed: 42, packCount: 4 }), createCosmetic(42));
  }
});

test('reconciling fills missing torn packs and trims extra ones', () => {
  const u = opened();
  const torn = play(u, { type: 'tearPack', packIndex: 0 }, { type: 'revealAll', packIndex: 0 }, {
    type: 'tearPack',
    packIndex: 1,
  });
  assert.deepEqual(reconcileCosmetic(createCosmetic(42), torn).packOrder, [0, 1]);
  assert.deepEqual(reconcileCosmetic({ ...createCosmetic(42), packOrder: [3] }, torn).packOrder, [3, 0]);
  assert.deepEqual(
    reconcileCosmetic({ ...createCosmetic(42), packOrder: [3, 2, 1] }, torn).packOrder,
    [3, 2]
  );
});

test('skipping tears every remaining pack in on-table order', () => {
  const record = finishCosmetic({ ...createCosmetic(42), packOrder: [2] }, 4);
  assert.deepEqual(record.packOrder, [2, 0, 1, 3]);
  assert.equal(record.itemsOut, true);
  const done = advanceUnboxing(opened(), { type: 'finish' });
  assert.equal(nextStep(tableView(done, record)), 'done');
});

test('a record from an earlier opening of the same box number lays nothing beside a sealed box', () => {
  const stale = { v: 1, seed: 42, itemsOut: true, packOrder: [1, 3] };
  const again = reconcileCosmetic(stale, createUnboxing());
  assert.equal(again.itemsOut, false);
  assert.deepEqual(again.packOrder, []);
  assert.equal(tableView(createUnboxing(), stale).itemsOut, false);
  const lidUp = play(createUnboxing(), { type: 'tearWrap' }, { type: 'openLid' });
  assert.equal(reconcileCosmetic(again, lidUp).itemsOut, false, 'still in the box once the lid opens');
});

