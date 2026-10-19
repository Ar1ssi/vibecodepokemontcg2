// hydrateHolo's TCG Live foil on both boards (design 069 / 074 §D6): the iframe board mounts a blit view on
// the board wrapper; under the 3D board flag the wrapper is only marked `deferred` (the card mesh wears the
// foil), unhydrating is a no-op for the foil, and a clone of the wrapper (full-view) still mounts its own
// view. Browser-only imports are stubbed; the foil runtime never finishes loading, so views stay `loading`.
import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

const STUBS = {
  'front-end.js': "export const systemState = { cardBackSrc: '/src/assets/cardback.png' };",
  'setup/board3d/board3d.js':
    'export const board3dActive = () => globalThis.__board3dActive === true;' +
    'export const getBoardScene = () => null;',
  'setup/foil/tcgl-foil-store.js':
    'export const loadFoilManifest = async () => globalThis.__foilManifest;' +
    'export const foilManifestNow = () => globalThis.__foilManifest ?? null;' +
    'export const foilTextureBase = () => null;',
  'setup/foil/tcgl-foil-material.js':
    'export const loadFoilData = () => new Promise(() => {});' +
    "export const createFoilMaterial = () => { throw new Error('not in node'); };",
};
const RULES_STATE_STUB = 'export const ensureCardData = async (card) => ({ ...card, supertype: "Pokémon" });';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '/shared/engine/rules/rules-state.mjs') {
      return { url: `data:text/javascript,${encodeURIComponent(RULES_STATE_STUB)}`, shortCircuit: true };
    }
    if (specifier.startsWith('/shared/')) {
      return { url: pathToFileURL(path.join(repoRoot, specifier)).href, shortCircuit: true };
    }
    const resolved = nextResolve(specifier, context);
    const stub = Object.keys(STUBS).find((suffix) => resolved.url.endsWith(`/client/src/${suffix}`));
    return stub ? { url: `data:text/javascript,${encodeURIComponent(STUBS[stub])}`, shortCircuit: true } : resolved;
  },
});

const dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
for (const name of ['window', 'document', 'CustomEvent', 'HTMLElement', 'Image']) globalThis[name] = dom.window[name];
// jsdom has no 2-D canvas; a view's context is only drawn into once the runtime is ready (never here).
dom.window.HTMLCanvasElement.prototype.getContext = () => null;
// No frames: the holo sweep and the foil loop would otherwise keep the test process alive.
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const { foilRecordFor, parseFoilManifest } = await import('../../foil/tcgl-foil-manifest.mjs');
const { hydrateHolo, unhydrateHolo } = await import('../hydrate-holo.js');
const { remountTcglFoil } = await import('../../foil/tcgl-foil-view.js');

let foilId;

before(() => {
  // The real manifest (tcgl-foil-manifest.mjs shape); its first foil record is the test card.
  const json = JSON.parse(fs.readFileSync(path.join(repoRoot, 'client/src/assets/tcgl-foil/manifest.json'), 'utf8'));
  globalThis.__foilManifest = parseFoilManifest(json);
  foilId = Object.keys(json.cards)[0];
});

let zone;
beforeEach(() => {
  document.body.innerHTML = '<div id="active"></div>';
  zone = document.getElementById('active');
  globalThis.__board3dActive = false;
});

const foilCard = () => {
  const image = document.createElement('img');
  image.src = 'http://localhost/card.png';
  zone.appendChild(image);
  return { id: foilId, name: 'Foil Card', image };
};

test('iframe board: a foil card mounts its blit view on the board wrapper', async () => {
  const wrapper = await hydrateHolo(foilCard());
  assert.ok(wrapper);
  assert.equal(wrapper.dataset.rarity, 'tcgl');
  assert.equal(wrapper.dataset.tcglFoil, 'loading');
  assert.equal(wrapper.querySelectorAll('canvas.tcgl-foil').length, 1);
});

test('3D board: the board wrapper gets no view, unhydrate is a no-op for the foil, a clone still mounts one', async () => {
  globalThis.__board3dActive = true;
  const card = foilCard();
  const wrapper = await hydrateHolo(card);
  assert.ok(wrapper);
  assert.equal(wrapper.dataset.rarity, 'tcgl');
  assert.equal(wrapper.dataset.tcglFoil, 'deferred');
  assert.equal(wrapper.querySelectorAll('canvas.tcgl-foil').length, 0);
  assert.equal(wrapper.parentElement, zone);

  const clone = wrapper.cloneNode(true);
  document.body.appendChild(clone);
  const view = remountTcglFoil(clone, wrapper);
  assert.ok(view, 'the clone mounts a view from the deferred record');
  assert.equal(view.record, foilRecordFor(globalThis.__foilManifest, foilId));
  assert.equal(clone.dataset.tcglFoil, 'loading');
  assert.equal(clone.querySelectorAll('canvas.tcgl-foil').length, 1);

  unhydrateHolo(card);
  assert.equal(card.wrapper, undefined);
  assert.equal(card.image.parentElement, zone);
  assert.equal(clone.querySelectorAll('canvas.tcgl-foil').length, 1, 'the clone keeps its own view');
});
