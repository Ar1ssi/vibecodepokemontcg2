import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { wireEndTurnButton } from '../end-turn-button.mjs';

const board = () =>
  new JSDOM(
    '<button id="p2PassButton">Pass</button><button id="endTurnButton">End Turn</button>'
  ).window.document;

test('End Turn routes through the Pass button, so its capture hooks run too', () => {
  const doc = board();
  const seen = [];
  const pass = doc.getElementById('p2PassButton');
  pass.addEventListener('click', () => seen.push('capture'), true);
  pass.addEventListener('click', () => seen.push('bubble'));
  assert.equal(wireEndTurnButton(doc), true);
  doc.getElementById('endTurnButton').click();
  assert.deepEqual(seen, ['capture', 'bubble']);
});

test('End Turn wiring is a no-op when either button is missing', () => {
  const doc = new JSDOM('<button id="endTurnButton"></button>').window.document;
  assert.equal(wireEndTurnButton(doc), false);
});

test('End Turn is wired once even if initialisation runs twice', () => {
  const doc = board();
  let passes = 0;
  doc.getElementById('p2PassButton').addEventListener('click', () => (passes += 1));
  wireEndTurnButton(doc);
  wireEndTurnButton(doc);
  doc.getElementById('endTurnButton').click();
  assert.equal(passes, 1);
});
