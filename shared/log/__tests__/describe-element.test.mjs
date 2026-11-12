import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeElement } from '../describe-element.mjs';

const el = (tagName, props = {}) => ({ tagName, id: '', ...props });

test('stub card img with data attributes and id ancestor', () => {
  const board = el('DIV', { id: 'selfBoard' });
  const wrap = el('SECTION', { parentElement: board });
  const img = el('IMG', {
    classList: ['card'],
    attributes: [
      { name: 'src', value: 'a.png' },
      { name: 'data-instance-id', value: '12' },
      { name: 'data-zone', value: 'hand' },
      { name: 'data-side', value: 'you' },
    ],
    parentElement: wrap,
  });
  assert.equal(describeElement(img), 'img.card[data-instance-id=12][data-zone=hand][data-side=you]<div#selfBoard');
});

test('limits: 3 classes, 6 data attrs, 40-char values; dataset form', () => {
  const dataset = { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', longKey: 'v'.repeat(60) };
  const out = describeElement(el('P', { id: 'p', className: 'a b c d', dataset }));
  assert.equal(out, 'p#p.a.b.c[data-a=1][data-b=2][data-c=3][data-d=4][data-e=5][data-f=6]');
  const long = describeElement(el('P', { dataset: { k: 'v'.repeat(60) } }));
  assert.equal(long, `p[data-k=${'v'.repeat(40)}]`);
  assert.equal(describeElement(el('P', { dataset: { longKey: 'x' } })), 'p[data-long-key=x]');
});

test('ancestor search stops after 4 hops and crosses a shadow root via host', () => {
  const root = el('MAIN', { id: 'root' });
  let node = root;
  for (let i = 0; i < 4; i++) node = el('DIV', { parentElement: node });
  assert.equal(describeElement(el('B', { parentElement: node })), 'b');
  const host = el('X-WIDGET', { id: 'w' });
  const shadowRoot = { host };
  assert.equal(describeElement(el('B', { parentNode: shadowRoot })), 'b<x-widget#w');
});

test('null, invalid, and throwing input yield [none] without throwing', () => {
  assert.equal(describeElement(null), '[none]');
  assert.equal(describeElement({}), '[none]');
  assert.equal(describeElement('div'), '[none]');
  const evil = {
    tagName: 'DIV',
    get id() {
      throw new Error('x');
    },
  };
  assert.equal(describeElement(evil), '[none]');
});
