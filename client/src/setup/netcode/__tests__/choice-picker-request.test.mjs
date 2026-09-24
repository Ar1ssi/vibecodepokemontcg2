import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChoicePickerRequest } from '../choice-picker-request.mjs';

const options = [
  { instanceId: 1, name: 'Pikachu', src: 'pika.png', type: 'Pokémon' },
  { instanceId: 2, name: 'Mew', src: 'mew.png', type: 'Pokémon' },
  { instanceId: 3, name: 'Eevee', src: 'eevee.png', type: 'Pokémon' },
];

test('single required pick reports the chosen instanceId', () => {
  const picks = [];
  const req = buildChoicePickerRequest({ prompt: 'Pick', options, min: 1, max: 1 }, (s) => picks.push(s));

  assert.equal(req.title, 'Pick');
  assert.equal(req.multiSelect, false);
  assert.equal(req.upTo, false);
  assert.equal(req.pickOnly, true);
  assert.deepEqual(req.candidates[1], { instanceId: 2, name: 'Mew', type: 'Pokémon', image: { src: 'mew.png' } });

  req.onPick(req.candidates[2]);
  assert.deepEqual(picks, [[3]]);
});

test('optional single pick can be declined with an empty selection', () => {
  const picks = [];
  const req = buildChoicePickerRequest({ options, min: 0, max: 1 }, (s) => picks.push(s));

  assert.equal(req.upTo, true);
  assert.equal(req.minCount, 0);
  req.onPick(undefined);
  assert.deepEqual(picks, [[]]);
});

test('multi pick clamps counts to the option list and maps every card', () => {
  const picks = [];
  const req = buildChoicePickerRequest({ options, min: 5, max: 9 }, (s) => picks.push(s));

  assert.equal(req.multiSelect, true);
  assert.equal(req.minCount, 3);
  assert.equal(req.maxCount, 3);
  req.onConfirm([req.candidates[0], req.candidates[2]]);
  assert.deepEqual(picks, [[1, 3]]);
});

test('missing or invalid counts default to one; no options means no request', () => {
  const req = buildChoicePickerRequest({ options, min: -1, max: 'x' }, () => {});
  assert.equal(req.minCount, 1);
  assert.equal(req.maxCount, 1);
  assert.equal(buildChoicePickerRequest({ options: [] }, () => {}), null);
  assert.equal(buildChoicePickerRequest(null, () => {}), null);
});

test('face-down options show the card back and no name', () => {
  const choice = { options: [{ instanceId: 7, faceDown: true }, options[0]], min: 0, max: 1 };
  const req = buildChoicePickerRequest(choice, () => {}, { cardBackSrc: 'back.png' });

  assert.deepEqual(req.candidates[0], { instanceId: 7, name: 'Face-down card', type: '', image: { src: 'back.png' } });
  assert.equal(req.candidates[1].name, 'Pikachu');
});
