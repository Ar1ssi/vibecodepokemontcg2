import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { closeStatusPopup, isStatusPopupOpen, openStatusPopup } from '../status-popup.mjs';

// Design 074 A9: the HUD's Buff / Debuff buttons open TCG Live's status popup — one "Status Effects"
// window, Positive Effects left and Negative Effects right, one entry per effect.

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
afterEach(() => closeStatusPopup());

const effects = {
  positive: [{ title: 'Choice Belt', text: 'More damage.', src: '/cards/belt.png' }],
  negative: [
    { title: 'Asleep', text: 'Cannot attack.' },
    { title: 'Block', text: "This Pokémon can't retreat." },
  ],
};

describe('074 — status popup', () => {
  it('opens one window with both columns and an entry per effect', () => {
    assert.equal(openStatusPopup(effects), true);
    assert.ok(isStatusPopupOpen());
    const root = document.querySelector('.tcgl-modal');
    assert.equal(root.querySelector('.tcgl-modal__title').textContent, 'Status Effects');
    const columns = [...root.querySelectorAll('.tcgl-status__column')];
    assert.deepEqual(
      columns.map((c) => c.querySelector('.tcgl-status__header-text').textContent),
      ['Positive Effects', 'Negative Effects']
    );
    assert.equal(columns[0].querySelectorAll('.tcgl-status__entry').length, 1);
    assert.equal(columns[1].querySelectorAll('.tcgl-status__entry').length, 2);
    assert.equal(columns[0].querySelector('.tcgl-status__thumb').getAttribute('src'), '/cards/belt.png');
    assert.equal(columns[1].querySelector('.tcgl-status__thumb'), null);
  });

  it('never opens with nothing to show, and never twice', () => {
    assert.equal(openStatusPopup({ positive: [], negative: [] }), false);
    assert.equal(document.querySelector('.tcgl-modal'), null);
    assert.equal(openStatusPopup(effects), true);
    assert.equal(openStatusPopup(effects), false);
    assert.equal(document.querySelectorAll('.tcgl-modal').length, 1);
  });

  it('the blocker and the bottom button close it, running onClose once', () => {
    for (const selector of ['.tcgl-modal__blocker', '.tcgl-modal__button']) {
      let closed = 0;
      openStatusPopup({ ...effects, onClose: () => closed++ });
      document.querySelector(selector).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      assert.equal(isStatusPopupOpen(), false, selector);
      assert.equal(document.querySelector('.tcgl-modal'), null, selector);
      closeStatusPopup();
      assert.equal(closed, 1, selector);
    }
  });

  it('clicks inside do not reach the focus view underneath', () => {
    let reached = false;
    const listener = () => {
      reached = true;
    };
    document.body.addEventListener('click', listener);
    openStatusPopup(effects);
    document.querySelector('.tcgl-status__entry').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    document.body.removeEventListener('click', listener);
    assert.equal(reached, false);
    assert.ok(isStatusPopupOpen());
  });

  it('a turn change or session reset closes it', () => {
    for (const name of ['rules-turn-began', 'rules-session-reset']) {
      openStatusPopup(effects);
      document.dispatchEvent(new window.Event(name));
      assert.equal(isStatusPopupOpen(), false, name);
    }
  });
});
