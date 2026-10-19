// status-loop.js on both boards (design 074 §D6): the iframe board builds and places the DOM loop;
// under the 3D board flag every call is a no-op and apply-view's reconcile steps leave the zone empty.
// board3d.js is stubbed so the flag can be set without booting a scene.
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (!resolved.url.endsWith('/client/src/setup/board3d/board3d.js')) return resolved;
    const stub = 'export const board3dActive = () => globalThis.__board3dActive === true;';
    return { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true };
  },
});

const { createStatusLoop, placeStatusLoop, syncStatusLoop } = await import('../status-loop.js');

const BOX = { left: 4, top: 6, width: 300, height: 300, cardWidth: 90, cardHeight: 126, rotation: 90 };
let doc;

beforeEach(() => {
  doc = new JSDOM('<div id="active"></div>').window.document;
  globalThis.__board3dActive = false;
});

/** apply-view.js reconcileStatusLoopOverlay's DOM steps: create, sync, insert into the zone, place. */
function reconcile(zone, keys, slot = {}) {
  slot.loop ??= createStatusLoop(doc);
  syncStatusLoop(slot.loop, keys, doc);
  if (slot.loop.parentNode !== zone) zone.insertBefore(slot.loop, null);
  placeStatusLoop(slot.loop, BOX);
  return slot;
}

test('iframe board: the loop is a node in the zone, one group pair per held condition, placed on the box', () => {
  const zone = doc.getElementById('active');
  const { loop } = reconcile(zone, ['poison', 'burn']);
  assert.equal(zone.querySelectorAll('.status-fx-loop').length, 1);
  assert.deepEqual([...loop.groups.keys()], ['poison', 'burn']);
  assert.equal(loop.card.querySelectorAll('.status-fx-loop__group').length, 2);
  assert.equal(loop.style.left, '4px');
  assert.equal(loop.style.fontSize, '90px');
  assert.equal(loop.card.style.rotate, '90deg');
  syncStatusLoop(loop, ['burn'], doc);
  assert.deepEqual([...loop.groups.keys()], ['burn']);
});

test('3D board: create/sync/place are no-ops and the reconcile leaves no loop node in the mirror zone', () => {
  globalThis.__board3dActive = true;
  const zone = doc.getElementById('active');
  const slot = reconcile(zone, ['poison', 'asleep']);
  reconcile(zone, ['poison'], slot);
  assert.equal(slot.loop.nodeType, doc.DOCUMENT_FRAGMENT_NODE);
  assert.equal(slot.loop.parentNode, null);
  assert.equal(zone.childNodes.length, 0);
  assert.equal(zone.querySelectorAll('.status-fx-loop, [class*="status-fx-loop"]').length, 0);
});

test('3D board: calls on a loop built before the flag went on change nothing', () => {
  const loop = createStatusLoop(doc);
  globalThis.__board3dActive = true;
  syncStatusLoop(loop, ['poison'], doc);
  placeStatusLoop(loop, BOX);
  assert.equal(loop.groups.size, 0);
  assert.equal(loop.style.left, '');
});
