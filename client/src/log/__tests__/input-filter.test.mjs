import test from 'node:test';
import assert from 'node:assert/strict';
import { describeKey, describeChange, isEditable } from '../input-filter.mjs';
import { describeElement } from '../../../../shared/log/describe-element.mjs';

const input = { tagName: 'INPUT' };
const div = { tagName: 'DIV' };

test('describeKey hides typed text in editable targets only', () => {
  assert.deepEqual(describeKey({ key: 'a', target: input }), { key: '[text]', mods: '' });
  assert.equal(describeKey({ key: 'Enter', target: input }).key, 'Enter');
  assert.equal(describeKey({ key: 'a', target: div }).key, 'a');
  assert.equal(describeKey({ key: 'x', target: div, ctrlKey: true, shiftKey: true }).mods, 'cs');
  assert.equal(describeKey({ key: 'x', composedPath: () => [input], target: div }).key, '[text]');
  assert.equal(isEditable({ tagName: 'div', isContentEditable: true }), true);
});

test('describeChange never leaks free text', () => {
  assert.deepEqual(describeChange({ type: 'checkbox', checked: true }), { checked: true });
  assert.deepEqual(describeChange({ tagName: 'SELECT', value: 'x'.repeat(100) }), { value: 'x'.repeat(80) });
  assert.deepEqual(describeChange({ tagName: 'INPUT', type: 'text', value: 'secret' }), { length: 6 });
});

test('describeElement on a card image', () => {
  const attrs = [
    { name: 'data-instance-id', value: '12' },
    { name: 'data-zone', value: 'hand' },
    { name: 'data-side', value: 'you' },
  ];
  const img = {
    tagName: 'IMG',
    classList: ['card'],
    attributes: attrs,
    parentElement: { tagName: 'DIV', id: 'selfBoard' },
  };
  assert.equal(describeElement(img), 'img.card[data-instance-id=12][data-zone=hand][data-side=you]<div#selfBoard');
});
