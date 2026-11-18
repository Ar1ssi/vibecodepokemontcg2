import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutDamageCounter } from '../damage-counter-layout.mjs';

const cardRect = { left: 130, top: 80, width: 90, height: 126 };
const zoneRect = { left: 10, top: 20 };

test('layout places the counter at the card corner and sizes it from the card width', () => {
  const counter = { style: {} };
  layoutDamageCounter(counter, cardRect, zoneRect, false);
  assert.deepEqual(counter.style, {
    display: 'inline-block',
    left: `${130 - 10 + 90 / 1.5}px`,
    top: `${80 - 20 + 126 / 4}px`,
    width: '30px',
    height: '30px',
    lineHeight: '30px',
    fontSize: '15px',
    zIndex: '1',
  });
});

test('a card in full view keeps its counter hidden but still laid out', () => {
  const counter = { style: {} };
  layoutDamageCounter(counter, cardRect, zoneRect, true);
  assert.equal(counter.style.display, 'none');
  assert.equal(counter.style.width, '30px');
});

// Resize used to call addDamageCounter(user, zone, index, false, false), whose `false` amount
// meant "10": every window resize overwrote card.damage with 10 while the counter kept showing
// its real value, and the rules-damage-changed event it fired reported 10 to the KO check.
// damage-counter.js cannot be imported under node (it pulls in the browser globals), so the
// handler's body is checked in the source.
test('the resize handler only re-lays-out the counter and never writes the card model', () => {
  const source = readFileSync(
    new URL('../damage-counter.js', import.meta.url),
    'utf8'
  );
  const start = source.indexOf('const handleResize = () => {');
  assert.notEqual(start, -1);
  const body = source.slice(start, source.indexOf('\n  };', start));
  assert.match(body, /layoutDamageCounter\(/);
  assert.doesNotMatch(body, /addDamageCounter|\.damage\b/);
});
