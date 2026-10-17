import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { buildStackInfoPanel } from '../stack-view-panel.mjs';

// Design 074 A10: the stack view's CardInfoPanel (StackedCardOverlay_Landscape) — name and HP bar,
// Attached Energy / Tools, the attack list in the overlay's prefabs, the Weakness / Resistance /
// Retreat footer and the Status Effects button. Fixtures are minimal model shapes, not card text.

const CSS = readFileSync(fileURLToPath(new URL('../../../css/stack-view.css', import.meta.url)), 'utf8');
const INDEX_CSS = readFileSync(fileURLToPath(new URL('../../../css/index.css', import.meta.url)), 'utf8');

let dom;
before(() => {
  dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
});
after(() => {
  delete globalThis.window;
  delete globalThis.document;
});

const model = {
  kind: 'pokemon',
  name: 'Testmon',
  hp: 120,
  damage: 30,
  types: ['Fire'],
  type: 'Fire',
  ability: null,
  attacks: [
    {
      index: 0,
      name: 'Flare',
      text: '',
      recede: false,
      costIcons: [{ type: 'fire', filled: true }],
      readout: { text: '30', tone: 'plain', mod: null, showTab: true },
    },
  ],
  weakness: { type: 'Water', value: 2 },
  resistance: null,
  retreatIcons: [{ type: 'colorless', filled: true }],
  retreatCount: { attached: 1, needed: 1 },
};
const card = {
  name: 'Testmon',
  attachedCards: [
    { name: 'Basic Fire Energy', type: 'Energy' },
    { name: 'Some Tool', subtypes: ['Pokémon Tool'], src: '/cards/tool.png' },
  ],
};

describe('074 — stack view info panel', () => {
  it('the header reads remaining/max HP with the bar filled to match', () => {
    const panel = buildStackInfoPanel({ card, model });
    assert.equal(panel.querySelector('.tcgl-stack__name').textContent, 'Testmon');
    assert.equal(panel.querySelector('.tcgl-stack__hp-total').textContent, '90/120');
    assert.equal(panel.querySelector('.tcgl-stack__hp-total b').textContent, '120');
    assert.equal(panel.querySelector('.tcgl-stack__hpfill').style.width, '75%');
    assert.equal(panel.querySelector('.tcgl-stack__hp-type').getAttribute('src'), '/src/assets/attack-ui/type-fire.png');
  });

  it('lists the attached Energy as type icons and the Tools as their art', () => {
    const panel = buildStackInfoPanel({ card, model, energyTypes: ['fire', 'water'] });
    const energy = panel.querySelector('.tcgl-stack__attached--energy');
    assert.equal(energy.querySelector('.tcgl-stack__attached-total b').textContent, '2');
    assert.deepEqual(
      [...energy.querySelectorAll('img')].map((img) => img.getAttribute('src')),
      ['/src/assets/attack-ui/type-fire.png', '/src/assets/attack-ui/type-water.png']
    );
    const tools = panel.querySelector('.tcgl-stack__attached--tools');
    assert.equal(tools.querySelector('.tcgl-stack__attached-total b').textContent, '1');
    assert.equal(tools.querySelector('.tcgl-stack__tool-art').getAttribute('src'), '/cards/tool.png');
  });

  it('the attack list and footer are the overlay prefabs', () => {
    const panel = buildStackInfoPanel({ card, model });
    assert.equal(panel.querySelectorAll('.tcgl-stack__list .tcgl-opt--attack').length, 1);
    assert.ok(panel.querySelector('.tcgl-stack__footer .tcgl-wr .tcgl-retreat'));
  });

  it('Status Effects is disabled with nothing to show, and opens the popup otherwise', () => {
    const idle = buildStackInfoPanel({ card, model }).querySelector('.tcgl-stack__status');
    assert.equal(idle.disabled, true);
    let opened = 0;
    const statuses = { positive: [], negative: [{ title: 'Asleep', text: '' }] };
    const button = buildStackInfoPanel({ card, model, statuses, onStatus: () => opened++ }).querySelector(
      '.tcgl-stack__status'
    );
    assert.equal(button.disabled, false);
    assert.ok(button.querySelector('.tcgl-stack__status-icon--debuff.is-on'));
    assert.ok(!button.querySelector('.tcgl-stack__status-icon--buff.is-on'));
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(opened, 1);
  });

  it('every panel class has a rule, and index.css imports the sheet', () => {
    assert.match(INDEX_CSS, /@import url\('\.\/stack-view\.css'\);/);
    const panel = buildStackInfoPanel({ card, model, energyTypes: ['fire'] });
    const names = new Set();
    for (const node of [panel, ...panel.querySelectorAll('*')]) {
      for (const name of node.classList) if (name.startsWith('tcgl-stack')) names.add(name);
    }
    // The two attached-row modifiers only name the rows (tests, e2e); they carry no style.
    const markerOnly = new Set(['tcgl-stack__attached--energy', 'tcgl-stack__attached--tools']);
    const missing = [...names].filter(
      (name) => !markerOnly.has(name) && !new RegExp(`\\.${name}(?![\\w-])`).test(CSS)
    );
    assert.deepEqual(missing, []);
  });
});
