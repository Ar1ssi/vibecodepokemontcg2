import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { finishedUnboxing } from '../../build-battle/unboxing.mjs';
import { HOMEBREW_PACK_COUNT, HOMEBREW_PACK_SIZE, hydrateHomebrewSet, openHomebrewBox } from '../homebrew-pack.mjs';
import { homebrewContents, homebrewLook, homebrewPresentation } from '../homebrew-look.mjs';
import {
  HOMEBREW_DECK_PREFIX,
  HOMEBREW_STORAGE_KEY,
  clearHomebrewSession,
  createHomebrewSession,
  homebrewDeckName,
  loadHomebrewSession,
  parseHomebrewSession,
  saveHomebrewSession,
  verifyHomebrewSession,
} from '../homebrew-session.mjs';

// Source of truth for the cards: the shipped set.json of the Homebrew set (customhb).
const { cards } = hydrateHomebrewSet(
  JSON.parse(readFileSync(new URL('../../../../../assets/custom-sets/customhb/set.json', import.meta.url), 'utf8'))
);
const packs = openHomebrewBox({ cards, rng: createRng(5) });
const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};

test('a new session is a sealed 30-pack box with no deck bound, and round-trips through storage', () => {
  const session = createHomebrewSession({ seed: 5, packs, now: 1000 });
  assert.equal(session.unboxing.stage, 'sealed');
  assert.equal(session.unboxing.packsTorn.length, HOMEBREW_PACK_COUNT);
  assert.equal(session.unboxing.cardsPerPack, HOMEBREW_PACK_SIZE);
  assert.equal(session.deckId, null);
  const storage = memoryStorage();
  assert.equal(saveHomebrewSession(storage, session), true);
  assert.deepEqual(loadHomebrewSession(storage), session);
  assert.equal(clearHomebrewSession(storage), true);
  assert.equal(loadHomebrewSession(storage), null);
});

test('parse refuses anything it cannot trust', () => {
  const good = createHomebrewSession({ seed: 5, packs, now: 1000 });
  const bad = (change) => parseHomebrewSession(JSON.stringify({ ...good, ...change }));
  assert.ok(parseHomebrewSession(JSON.stringify(good)));
  assert.equal(parseHomebrewSession('not json'), null);
  assert.equal(parseHomebrewSession('null'), null);
  assert.equal(bad({ version: 2 }), null);
  assert.equal(bad({ seed: -1 }), null);
  assert.equal(bad({ seed: 1.5 }), null);
  assert.equal(bad({ packs: packs.slice(0, 29) }), null, 'a box has 30 packs');
  assert.equal(bad({ packs: [...packs.slice(1), []] }), null, 'an empty pack');
  assert.equal(bad({ packs: [...packs.slice(1), Array(11).fill('customhb-001')] }), null, 'an 11-card pack');
  assert.equal(bad({ unboxing: finishedUnboxing({ packCount: 4, cardsPerPack: 10 }) }), null, 'a 4-pack scene');
  assert.equal(bad({ unboxing: undefined }), null);
  assert.equal(bad({ deckId: 7 }), null);
  assert.equal(bad({ createdAt: 'now' }), null);
  assert.equal(bad({ deckId: 'deck-1', unsavedDeck: [['customhb-001', 1]] }).unsavedDeck, null, 'a bound deck keeps no copy');
  assert.deepEqual(bad({ unsavedDeck: [['customhb-001', 2]] }).unsavedDeck, [['customhb-001', 2]]);
  assert.equal(bad({ unsavedDeck: [['customhb-001', 0]] }).unsavedDeck, null);
});

test('storage that throws or is missing never throws out of the session helpers', () => {
  const session = createHomebrewSession({ seed: 5, packs });
  const throwing = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(saveHomebrewSession(throwing, session), false);
  assert.equal(loadHomebrewSession(throwing), null);
  assert.equal(clearHomebrewSession(throwing), false);
  assert.equal(saveHomebrewSession(null, session), false);
  assert.equal(loadHomebrewSession(null), null);
  assert.equal(clearHomebrewSession(undefined), false);
});

test('a session whose cards the set no longer has fails verification', () => {
  const session = createHomebrewSession({ seed: 5, packs });
  assert.equal(verifyHomebrewSession(session, cards), true);
  assert.equal(verifyHomebrewSession(session, cards.slice(1).filter((card) => card.id !== packs[0][0])), false);
  assert.equal(verifyHomebrewSession(null, cards), false);
});

test('the deck is named for the box with the prefix the session binds on', () => {
  assert.equal(homebrewDeckName(42), `${HOMEBREW_DECK_PREFIX}42`);
  assert.equal(HOMEBREW_STORAGE_KEY, 'ptcg-sim.homebrew-battle.v1');
});

test('the skin is the box exterior and the packs only: no promo, no props', () => {
  const contents = homebrewContents();
  assert.equal(contents.promo, null);
  assert.equal(contents.sleeveCount, 0);
  assert.deepEqual(contents.energy, []);
  assert.deepEqual(Object.values(contents.props).filter(Boolean), []);
  const look = homebrewLook();
  assert.equal(look.skin.packArts.length, 1);
  assert.match(look.skin.packArts[0].src, /sv03\.5-booster\.webp$/);
  assert.match(look.skin.lidArt, /sv03\.5-ultra-premium-lid\.webp$/);
  assert.equal(look.skin.keyArtUrl, null);
  assert.equal(look.labels.productTitle, 'Ultra-Premium Collection');
  assert.match(look.labels.backLines[0], /^30 /);
  assert.equal(homebrewPresentation().singleExit, true);
  assert.match(homebrewPresentation().doneText, /30 packs/);
});
