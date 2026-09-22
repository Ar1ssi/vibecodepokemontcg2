import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createViewBoardButton } from '../view-board-toggle.mjs';

const setup = () => {
  const doc = new JSDOM('<div id="overlay"></div>').window.document;
  const overlay = doc.getElementById('overlay');
  const button = createViewBoardButton(doc, overlay);
  overlay.appendChild(button);
  return { overlay, button };
};

test('View Board hides the menu over the board and Back restores it', () => {
  const { overlay, button } = setup();
  assert.equal(button.textContent, 'View Board');
  button.click();
  assert.ok(overlay.classList.contains('is-viewing-board'));
  assert.equal(button.textContent, 'Back');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  button.click();
  assert.ok(!overlay.classList.contains('is-viewing-board'));
  assert.equal(button.textContent, 'View Board');
});

test('View Board clicks do not reach the menu behind it', () => {
  const { overlay, button } = setup();
  let reached = false;
  overlay.addEventListener('click', () => (reached = true));
  button.click();
  assert.equal(reached, false);
});
