import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isReverseHoloId, tcgdexApiBase, tcgdexApiUrl, tcgdexLookupId } from '../tcgdex-url.mjs';

const hadLocation = Object.prototype.hasOwnProperty.call(globalThis, 'location');
const originalLocation = globalThis.location;
afterEach(() => {
  if (hadLocation) globalThis.location = originalLocation;
  else delete globalThis.location;
});

test('node (no page origin) calls TCGdex directly', () => {
  delete globalThis.location;
  assert.equal(tcgdexApiUrl('/cards/xy7-97'), 'https://api.tcgdex.net/v2/en/cards/xy7-97');
});

test('a browser page goes through the same-origin proxy', () => {
  globalThis.location = { origin: 'https://ptcg-sim.onrender.com' };
  assert.equal(tcgdexApiBase(), 'https://ptcg-sim.onrender.com/api/tcgdex/v2/en');
  assert.equal(
    tcgdexApiUrl('/cards?name=Groudon'),
    'https://ptcg-sim.onrender.com/api/tcgdex/v2/en/cards?name=Groudon'
  );
});

test('an opaque origin ("null", e.g. file://) falls back to direct', () => {
  globalThis.location = { origin: 'null' };
  assert.equal(tcgdexApiBase(), 'https://api.tcgdex.net/v2/en');
});

test('a Reverse Holo copy looks up its base print; other ids pass through', () => {
  assert.equal(isReverseHoloId('bw1-111-reverse'), true);
  assert.equal(tcgdexLookupId('bw1-111-reverse'), 'bw1-111');
  assert.equal(tcgdexLookupId('swsh12.5-152-reverse'), 'swsh12.5-152');
  assert.equal(isReverseHoloId('bw1-111'), false);
  assert.equal(tcgdexLookupId('bw1-111'), 'bw1-111');
  assert.equal(isReverseHoloId(undefined), false);
  assert.equal(isReverseHoloId(42), false);
});
