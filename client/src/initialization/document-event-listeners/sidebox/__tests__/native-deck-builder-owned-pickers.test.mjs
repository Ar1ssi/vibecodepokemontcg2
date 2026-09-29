import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Design 057 slice 5: sleeves and coins the player's Elite Trainer Boxes gave them lead their
// picker with an "Owned" tag; without a collection the pickers keep their catalog order.
const dom = new JSDOM('<div id="sleeves"></div><div id="coins"></div>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

const { initializeDeckBuilderSleevePicker } = await import('../native-deck-builder-sleeve-picker.js');
const { initializeDeckBuilderCoinPicker } = await import('../native-deck-builder-coin-picker.js');
const { getSleeves } = await import('../../../../setup/deck-builder/core/sleeves.mjs');
const { getCoins } = await import('../../../../setup/deck-builder/core/coins.mjs');

const ETB_SLEEVE = '08266b9d-1d37-4ddb-a458-9adc302edb62';
const ETB_COIN = 'PFLETB_Mega_Charizard_X_Coin';

const mount = (id) => {
  const panelEl = document.getElementById(id);
  panelEl.innerHTML = '';
  return panelEl;
};

test('the sleeve picker lists owned sleeves first, tagged, and refreshes when ownership changes', () => {
  let owned = [];
  const panelEl = mount('sleeves');
  const picker = initializeDeckBuilderSleevePicker({ panelEl, onChange: () => {}, getOwnedIds: () => owned });
  const catalogIds = () => [...panelEl.querySelectorAll('[data-sleeve-id]')].map((b) => b.dataset.sleeveId).slice(1);
  assert.deepEqual(catalogIds(), getSleeves().map((sleeve) => sleeve.id), 'no collection: catalog order');
  assert.equal(panelEl.querySelectorAll('.native-deck-builder-owned-tag').length, 0);

  owned = [ETB_SLEEVE];
  picker.refreshOwned();
  const first = panelEl.querySelectorAll('[data-sleeve-id]')[1];
  assert.equal(first.dataset.sleeveId, ETB_SLEEVE, 'after the default back, the owned sleeve leads');
  assert.ok(first.classList.contains('is-owned'));
  assert.equal(first.querySelector('.native-deck-builder-owned-tag').textContent, 'Owned');
  assert.equal(panelEl.querySelectorAll('.is-owned').length, 1);
});

test('the coin picker lists owned coins first, tagged', () => {
  const panelEl = mount('coins');
  initializeDeckBuilderCoinPicker({ panelEl, onChange: () => {}, getOwnedIds: () => [ETB_COIN] });
  const cells = panelEl.querySelectorAll('[data-coin-id]');
  assert.equal(cells.length, getCoins().length);
  assert.equal(cells[0].dataset.coinId, ETB_COIN);
  assert.equal(cells[0].querySelector('.native-deck-builder-owned-tag').textContent, 'Owned');
  assert.equal(panelEl.querySelectorAll('.is-owned').length, 1);
});
