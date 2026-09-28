import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { packModelFor } from '../../build-battle/box-catalog.mjs';
import { BUILD_BATTLE_SET_CARDS } from '../../build-battle/build-battle.generated.mjs';
import { advanceUnboxing, createUnboxing } from '../../build-battle/unboxing.mjs';
import { getEtb } from '../etb-catalog.mjs';
import { openEtb } from '../etb-opening.mjs';
import {
  ETB_STORAGE_KEY,
  clearEtbSession,
  createEtbSession,
  loadEtbSession,
  parseEtbSession,
  saveEtbSession,
} from '../etb-session.mjs';

const etb = getEtb('phantasmal-flames-etb');
const packModel = packModelFor(etb.setId);
const { packs } = openEtb({ etb, cards: BUILD_BATTLE_SET_CARDS.me02, packModel, rng: createRng(42) });
const fresh = () => createEtbSession({ etbKey: etb.key, seed: 42, packs, packModel, now: 1000 });

function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const throwingStorage = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
  removeItem() {
    throw new Error('denied');
  },
};

test('createEtbSession starts sealed with a scene sized to the box', () => {
  const session = fresh();
  assert.equal(session.version, 1);
  assert.equal(session.etbKey, etb.key);
  assert.deepEqual(session.unboxing, createUnboxing({ packCount: 9, cardsPerPack: 10 }));
  assert.deepEqual(session.packs, packs);
  assert.notEqual(session.packs[0], packs[0], 'packs are copied');
});

test('a session survives a save/parse round trip at every stage', () => {
  const session = fresh();
  assert.deepEqual(parseEtbSession(JSON.stringify(session)), session);
  const events = [{ type: 'tearWrap' }, { type: 'openLid' }, { type: 'unwrapDeck' }];
  events.push({ type: 'tearPack', packIndex: 0 }, { type: 'revealCard', packIndex: 0 });
  const midPack = { ...session, unboxing: events.reduce(advanceUnboxing, session.unboxing) };
  assert.deepEqual(parseEtbSession(JSON.stringify(midPack)), midPack);
});

test('row 2: parseEtbSession refuses anything this version cannot trust', () => {
  const good = fresh();
  const bad = (patch) => parseEtbSession(JSON.stringify({ ...good, ...patch }));
  assert.equal(parseEtbSession('{'), null);
  assert.equal(parseEtbSession('null'), null);
  assert.equal(bad({ version: 2 }), null);
  assert.equal(bad({ etbKey: 'nope' }), null, 'unknown ETB');
  assert.equal(bad({ seed: -1 }), null);
  assert.equal(bad({ seed: 2 ** 31 }), null);
  assert.equal(bad({ packs: packs.slice(0, 8) }), null, 'pack count ≠ etb.packCount');
  assert.equal(bad({ packs: [[], ...packs.slice(1)] }), null, 'empty pack');
  assert.equal(bad({ packs: [[...packs[0], 'me02-001'], ...packs.slice(1)] }), null, 'pack over size');
  assert.equal(bad({ packs: [['zz-001'], ...packs.slice(1)] }), null, 'id not in the set');
  assert.equal(bad({ unboxing: undefined }), null);
  assert.equal(bad({ unboxing: createUnboxing() }), null, 'a four-pack scene for nine packs');
  assert.equal(bad({ unboxing: createUnboxing({ packCount: 9, cardsPerPack: 5 }) }), null);
  const torn = { ...createUnboxing({ packCount: 9 }), stage: 'packs', wrapTorn: true };
  torn.packsTorn = [true, ...Array(8).fill(false)];
  torn.revealed = [11, ...Array(8).fill(0)];
  assert.equal(bad({ unboxing: torn }), null, 'revealed[i] > cardsPerPack');
  assert.equal(bad({ createdAt: 'yesterday' }), null);
});

test('row 5: a throwing storage reports memory-only and never throws', () => {
  assert.equal(saveEtbSession(throwingStorage, fresh()), false);
  assert.equal(saveEtbSession(undefined, fresh()), false);
  assert.equal(loadEtbSession(throwingStorage), null);
  assert.equal(clearEtbSession(throwingStorage), false);

  const storage = memoryStorage();
  assert.equal(loadEtbSession(storage), null);
  assert.equal(saveEtbSession(storage, fresh()), true);
  assert.deepEqual(loadEtbSession(storage), fresh());
  assert.equal(clearEtbSession(storage), true);
  assert.equal(storage.items.has(ETB_STORAGE_KEY), false);
});
