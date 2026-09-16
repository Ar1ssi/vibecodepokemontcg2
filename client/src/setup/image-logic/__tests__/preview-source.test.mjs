import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hidePreviewSource } from '../preview-source.mjs';

test('hides the source card and restores it on close', () => {
  const card = { style: { visibility: '' } };

  const restore = hidePreviewSource(card);
  assert.equal(card.style.visibility, 'hidden');

  restore();
  assert.equal(card.style.visibility, '');
});

test('restore keeps a non-default visibility and is safe to call twice', () => {
  const card = { style: { visibility: 'visible' } };

  const restore = hidePreviewSource(card);
  restore();
  card.style.visibility = 'hidden'; // hidden again by something else later
  restore();

  assert.equal(card.style.visibility, 'hidden', 'second call is a no-op');
});

test('a card left hidden by an earlier preview comes back visible', () => {
  const card = { style: { visibility: 'hidden' } };

  hidePreviewSource(card)();

  assert.equal(card.style.visibility, '');
});

test('no source element is a no-op', () => {
  assert.doesNotThrow(() => hidePreviewSource(null)());
  assert.doesNotThrow(() => hidePreviewSource({})());
});
