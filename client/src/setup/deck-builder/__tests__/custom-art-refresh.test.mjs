// The deck builder's custom-set art follows a live set change (design 075): images on screen and images drawn later
// point at the set's `?v=` URL; nothing is observed before the first change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { noteCustomSetsChanged, onCustomSetsChanged } from '../../../../../shared/tcgdex/custom-sets.mjs';
import { versionCustomArtIn, watchCustomArt } from '../core/custom-art-refresh.mjs';

const ART = '/src/assets/custom-sets/customhb/001/high.webp';
const TCGDEX = 'https://assets.tcgdex.net/en/sv/sv01/001/high.webp';

function fakeImg(src) {
  const attrs = new Map(src === null ? [] : [['src', src]]);
  return {
    nodeType: 1,
    tagName: 'IMG',
    getAttribute: (name) => attrs.get(name) ?? null,
    setAttribute: (name, value) => attrs.set(name, value),
    querySelectorAll: () => [],
  };
}

function fakeRoot(imgs) {
  return { nodeType: 1, tagName: 'DIV', querySelectorAll: (selector) => (selector === 'img' ? imgs : []) };
}

class FakeObserver {
  static made = [];
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    FakeObserver.made.push(this);
  }
  observe(target, options) {
    this.targets.push({ target, options });
  }
  disconnect() {
    this.disconnected = true;
  }
}

test('images under the roots follow a change to their set, now and when drawn later', async (t) => {
  const savedLocation = globalThis.location;
  globalThis.location = { origin: 'http://localhost:4000' };
  t.after(() => {
    if (savedLocation === undefined) delete globalThis.location;
    else globalThis.location = savedLocation;
  });
  const shown = fakeImg(ART);
  const other = fakeImg(TCGDEX);
  const empty = fakeImg(null);
  const root = fakeRoot([shown, other, empty]);
  const stop = watchCustomArt([root, null], { MutationObserverImpl: FakeObserver, subscribe: onCustomSetsChanged });
  t.after(stop);

  assert.equal(versionCustomArtIn(root), 0, 'no change yet');
  assert.equal(FakeObserver.made.length, 0, 'nothing observed before a change');

  const manifest = async () => ({ ok: true, json: async () => ({ sets: [], revision: 'r2' }) });
  await noteCustomSetsChanged({ version: 2, sets: ['customhb'] }, { fetchImpl: manifest });
  assert.equal(shown.getAttribute('src'), `${ART}?v=1`);
  assert.equal(other.getAttribute('src'), TCGDEX);
  assert.equal(empty.getAttribute('src'), null);

  const [observer] = FakeObserver.made;
  assert.deepEqual(observer.targets.map((entry) => entry.target), [root]);
  const drawn = fakeImg(ART);
  const nested = fakeImg('/src/assets/custom-sets/customhb/002/low.webp');
  const reassigned = fakeImg(ART);
  observer.callback([
    { type: 'childList', addedNodes: [drawn, fakeRoot([nested]), { nodeType: 3 }] },
    { type: 'attributes', target: reassigned },
  ]);
  assert.equal(drawn.getAttribute('src'), `${ART}?v=1`);
  assert.equal(nested.getAttribute('src'), '/src/assets/custom-sets/customhb/002/low.webp?v=1');
  assert.equal(reassigned.getAttribute('src'), `${ART}?v=1`);

  await noteCustomSetsChanged({ version: 3, sets: ['customhb'] }, { fetchImpl: manifest });
  assert.equal(shown.getAttribute('src'), `${ART}?v=2`);
  assert.equal(FakeObserver.made.length, 1, 'one observer for the page');

  stop();
  assert.equal(observer.disconnected, true);
});
