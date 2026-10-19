import test from 'node:test';
import assert from 'node:assert/strict';

import { SERVER_RENDERED_ZONES, legacyDomSuppressed } from '../server-rendered-zones.mjs';

const authoritative2p = { serverAuthoritative: true, isTwoPlayer: true };

test('server-authoritative 2P suppresses legacy DOM in every server-drawn zone', () => {
  for (const zoneId of ['hand', 'prizes', 'active', 'bench', 'discard', 'lostZone', 'board']) {
    assert.equal(legacyDomSuppressed(zoneId, authoritative2p), true, zoneId);
  }
});

test('the deck stays legacy-rendered: the server only sends its count', () => {
  assert.equal(legacyDomSuppressed('deck', authoritative2p), false);
  assert.equal(SERVER_RENDERED_ZONES.includes('deck'), false);
});

test('popup and non-card zones are never suppressed', () => {
  for (const zoneId of ['attachedCards', 'viewCards', 'stadium', 'deckCover', undefined]) {
    assert.equal(legacyDomSuppressed(zoneId, authoritative2p), false, String(zoneId));
  }
});

test('legacy rendering is untouched without server authority', () => {
  assert.equal(legacyDomSuppressed('hand', { serverAuthoritative: false, isTwoPlayer: true }), false);
  assert.equal(legacyDomSuppressed('hand', { serverAuthoritative: false, isTwoPlayer: false }), false);
  assert.equal(legacyDomSuppressed('hand', undefined), false);
});

test('design 074 D7: authority alone suppresses the legacy DOM, so a solo room renders from views', () => {
  const soloRoom = { serverAuthoritative: true, isTwoPlayer: true, solo: true };
  for (const zoneId of SERVER_RENDERED_ZONES) {
    assert.equal(legacyDomSuppressed(zoneId, soloRoom), true, zoneId);
    assert.equal(legacyDomSuppressed(zoneId, { serverAuthoritative: true }), true, zoneId);
  }
  assert.equal(legacyDomSuppressed('deck', soloRoom), false);
});
