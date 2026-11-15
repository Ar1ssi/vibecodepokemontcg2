// tera-skin.js on both boards (design 037 / 074 §D6): the iframe board injects the crystal layers into
// the holo wrapper; under the 3D board flag the scene wears the skin through
// `setUiState(id, { teraSkin: palette | null, teraFormAt })` and the mirror gets nothing. apply-view.js and
// board3d.js are stubbed: the zones, card registry, flag and scene come from globals.
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';

const STUBS = {
  'setup/board3d/board3d.js':
    'export const board3dActive = () => globalThis.__board3dActive === true;' +
    'export const getBoardScene = () => globalThis.__board3dScene ?? null;',
  'setup/netcode/apply-view.js':
    'export const getCardRegistry = () => globalThis.__teraRegistry;' +
    'export const getAuthoritativeZoneArray = (side, zone) => globalThis.__teraZones?.[side]?.[zone] ?? [];' +
    'export const hasAuthoritativeView = () => true;',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    const stub = Object.keys(STUBS).find((suffix) => resolved.url.endsWith(`/client/src/${suffix}`));
    return stub ? { url: `data:text/javascript,${encodeURIComponent(STUBS[stub])}`, shortCircuit: true } : resolved;
  },
});

const { refreshTeraSkins, formTeraSkinAt } = await import('../tera-skin.js');
const { teraPaletteFor } = await import('../tera-palette.mjs');

const teraCard = (instanceId) => ({
  instanceId,
  supertype: 'Pokémon',
  name: 'Terapagos ex',
  subtypes: ['Basic', 'ex', 'Tera'],
  types: ['Water'],
});

const fakeScene = () => {
  const scene = { calls: [], setUiState: (id, patch) => scene.calls.push([id, patch]) };
  return scene;
};

let doc;
let wrapper;

beforeEach(() => {
  doc = new JSDOM('<div id="active"><div class="mat-holo"><div class="card__rotator"><img></div></div></div>').window
    .document;
  wrapper = doc.querySelector('.mat-holo');
});

const putInPlay = (card, element) => {
  globalThis.__teraZones = { you: { active: [card] } };
  globalThis.__teraRegistry = new Map([[card.instanceId, { card, element, holoCard: { wrapper: element } }]]);
};

test('the skin moves from the mirror DOM to the scene when the 3D board takes over, and leaves with the card', () => {
  const card = teraCard(7);
  globalThis.__board3dActive = false;
  putInPlay(card, wrapper);
  refreshTeraSkins();
  assert.ok(wrapper.classList.contains('fx-tera-crystal'));
  assert.equal(wrapper.querySelectorAll('.card__rotator > .fx-tera-crystal__layer').length, 3);
  assert.equal(wrapper.querySelectorAll('.fx-tera-crystal__glint').length, 3);

  const scene = fakeScene();
  globalThis.__board3dActive = true;
  globalThis.__board3dScene = scene;
  refreshTeraSkins();
  assert.equal(wrapper.classList.contains('fx-tera-crystal'), false);
  assert.equal(wrapper.querySelectorAll('.fx-tera-crystal__layer').length, 0);
  assert.deepEqual(scene.calls, [[7, { teraSkin: teraPaletteFor('Water') }]]);

  refreshTeraSkins();
  assert.equal(scene.calls.length, 1, 'an unchanged view re-sends nothing');

  globalThis.__teraZones = { you: { active: [] } };
  refreshTeraSkins();
  assert.deepEqual(scene.calls.at(-1), [7, { teraSkin: null, teraFormAt: null }]);
  assert.equal(wrapper.querySelectorAll('.fx-tera-crystal__layer').length, 0);
});

test('3D board: an entry says when the coat forms; a rebuilt scene gets the skin again; the mirror stays bare', () => {
  const card = teraCard(9);
  globalThis.__board3dActive = true;
  const first = fakeScene();
  globalThis.__board3dScene = first;
  putInPlay(card, wrapper);
  refreshTeraSkins();
  assert.deepEqual(first.calls, [[9, { teraSkin: teraPaletteFor('Water') }]]);

  // The skin stays on; the scene is told the scene-clock time its coat forms at.
  formTeraSkinAt(9, 4200);
  assert.deepEqual(first.calls.at(-1), [9, { teraFormAt: 4200 }]);
  for (const [id, at] of [[null, 100], [9, NaN], [9, undefined]]) formTeraSkinAt(id, at);
  assert.equal(first.calls.length, 2, 'a missing id or time is ignored');
  globalThis.__board3dActive = false;
  formTeraSkinAt(9, 5000);
  assert.equal(first.calls.length, 2, 'without the 3D board there is no coat to time');
  globalThis.__board3dActive = true;

  const second = fakeScene();
  globalThis.__board3dScene = second;
  refreshTeraSkins();
  assert.deepEqual(second.calls, [[9, { teraSkin: teraPaletteFor('Water') }]]);
  assert.deepEqual(first.calls.at(-1), [9, { teraSkin: null, teraFormAt: null }]);
  assert.equal(wrapper.classList.contains('fx-tera-crystal'), false);
  assert.equal(wrapper.querySelectorAll('[class*="fx-tera-crystal"]').length, 0);
});
