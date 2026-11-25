import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { applyView } from '../apply-view.js';
import { setupMockDom, testInBothBoardModes as test } from './apply-view-fixture.mjs';

const CHOICE = {
  choiceId: 'choice_p1_9',
  player: 'p1',
  prompt: 'Pick one',
  options: [{ instanceId: 1, name: 'Pikachu', src: 'pika.png' }],
  min: 1,
  max: 1,
};

const choiceView = (stateVersion, pendingChoice) => ({
  stateVersion,
  pendingChoice,
  you: { playerId: 'p1', zones: {} },
  them: { playerId: 'p2', zones: {} },
});

const quietErrors = async (fn) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

test('choice: a card picker that fails to open after open() returned falls back to the modal', async () => {
  const { doc, mockGetZone } = setupMockDom();
  const picker = { opened: 0, open: () => { picker.opened += 1; return Promise.reject(new Error('no candidates')); }, close() {} };
  const opts = { document: doc, getZone: mockGetZone, choicePicker: picker };

  await quietErrors(async () => {
    applyView(choiceView(1, CHOICE), [], opts);
    assert.equal(doc.getElementById('netcodeChoiceModal'), null, 'the picker owns it until it fails');
    await new Promise(setImmediate);
  });

  assert.ok(doc.getElementById('netcodeChoiceModal'), 'the player is given the modal, not left waiting');
  applyView(choiceView(2, CHOICE), [], opts);
  assert.equal(picker.opened, 1, 'a failed picker is not retried for the same choice');
});

test('choice: a picker that opens fine stays the owner', async () => {
  const { doc, mockGetZone } = setupMockDom();
  const picker = { open: () => Promise.resolve(), close() {} };
  const opts = { document: doc, getZone: mockGetZone, choicePicker: picker };
  applyView(choiceView(1, CHOICE), [], opts);
  await new Promise(setImmediate);
  assert.equal(doc.getElementById('netcodeChoiceModal'), null);
});
