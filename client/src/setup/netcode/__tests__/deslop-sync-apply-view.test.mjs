import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import {
  applyView,
  getLastRenderedVersion,
  reconcileTurnState,
  viewBackedGetZone,
} from '../apply-view.js';
import {
  setupMockDom,
  testInBothBoardModes as test,
} from './apply-view-fixture.mjs';

const CHOICE = {
  choiceId: 'choice_p1_1',
  player: 'p1',
  prompt: 'Pick one',
  options: [{ instanceId: 1, name: 'Card 1', src: 'c1.png' }],
  min: 1,
  max: 1,
};

const choiceView = (stateVersion, pendingChoice = CHOICE, you = { playerId: 'p1', zones: {} }) => ({
  stateVersion,
  pendingChoice,
  you,
  them: { playerId: 'p2', zones: {} },
});

const fakeSocket = () => {
  const socket = { emitted: [] };
  socket.emit = (event, payload) => socket.emitted.push({ event, payload });
  return socket;
};

function confirmModalSelection(doc) {
  const modal = doc.getElementById('netcodeChoiceModal');
  modal.querySelectorAll('.choice-option-card')[0].dispatchEvent({ type: 'click' });
  modal.querySelector('#choiceConfirmBtn').dispatchEvent({ type: 'click' });
  return modal;
}

test('choice modal: an answer with no socket or room keeps the prompt up and tells the player', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { doc, mockGetZone } = setupMockDom();
  applyView(choiceView(1), [], { document: doc, getZone: mockGetZone });

  const modal = confirmModalSelection(doc);
  await new Promise(setImmediate);

  assert.equal(doc.getElementById('netcodeChoiceModal'), modal, 'modal is not removed');
  assert.equal(modal.querySelector('#choiceConfirmBtn').disabled, false, 'player can send again');
  const notice = doc.getElementById('netcodeChoiceSendError');
  assert.ok(notice, 'the player is told the answer was not sent');
  assert.match(notice.textContent, /could not be sent/);
  assert.equal(console.error.mock.callCount() > 0, true, 'the failure is logged');
});

test('choice modal: an answer with a socket and room is emitted and the modal closes', async () => {
  const { doc, mockGetZone } = setupMockDom();
  const socket = fakeSocket();
  applyView(choiceView(1), [], { document: doc, getZone: mockGetZone, socket, roomId: 'room1' });

  confirmModalSelection(doc);
  await new Promise(setImmediate);

  assert.equal(socket.emitted.length, 1);
  assert.equal(socket.emitted[0].event, 'resolveChoice');
  assert.deepEqual(socket.emitted[0].payload.selection, [1]);
  assert.equal(doc.getElementById('netcodeChoiceModal'), null);
  assert.equal(doc.getElementById('netcodeChoiceSendError'), null);
});

test('choice picker: an answer that cannot be sent reopens the picker', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { doc, mockGetZone } = setupMockDom();
  const choicePicker = { opened: [], close() {} };
  choicePicker.open = (request) => choicePicker.opened.push(request);
  const opts = { document: doc, getZone: mockGetZone, choicePicker };
  applyView(choiceView(1), [], opts);
  assert.equal(choicePicker.opened.length, 1);

  await choicePicker.opened[0].onResolve([1]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(choicePicker.opened.length, 2, 'the prompt is back for another try');
  assert.ok(doc.getElementById('netcodeChoiceSendError'));

  applyView(choiceView(2, null), [], opts);
  assert.equal(doc.getElementById('netcodeChoiceSendError'), null, 'a cleared choice drops the notice');
});

test('choice: a choice that names no player is nobody\'s to answer, even for a spectator', (t) => {
  t.mock.method(console, 'error', () => {});
  const { doc, mockGetZone } = setupMockDom();
  const { player, ...noPlayer } = CHOICE;
  assert.equal(player, 'p1');

  applyView(choiceView(1, noPlayer, null), [], { document: doc, getZone: mockGetZone });

  assert.equal(doc.getElementById('netcodeChoiceModal'), null);
  assert.ok(doc.getElementById('netcodeChoiceBanner'));
});

test('reconcileTurnState: a view turn without a boolean isYourTurn leaves local turn state alone', (t) => {
  t.mock.method(console, 'error', () => {});
  const local = { turnPlayer: 'self', turnNumber: 3, phase: 'main', flags: {} };

  const res = reconcileTurnState(
    { you: { playerId: 'p1' }, turn: { number: 4, phase: 'main' } },
    { rulesState: local }
  );

  assert.deepEqual(res, { applied: false, reason: 'no_turn' });
  assert.equal(local.turnPlayer, 'self');
  assert.equal(local.turnNumber, 3);
});

test('applyView: a render that throws leaves its stateVersion unspent so the resend applies', () => {
  const { doc, mockGetZone } = setupMockDom();
  const view = choiceView(5, null);
  const opts = { document: doc, getZone: mockGetZone };

  assert.throws(
    () =>
      applyView(view, [{ type: 'x' }], {
        ...opts,
        onBeforeApply: () => {
          throw new Error('hook failed');
        },
      }),
    /hook failed/
  );
  assert.equal(getLastRenderedVersion(), -1);

  assert.equal(applyView(view, [], opts).applied, true);
  assert.equal(getLastRenderedVersion(), 5);
});

test('zone counts: a deck without a count leaves its label as it was', (t) => {
  t.mock.method(console, 'error', () => {});
  const { doc, mockGetZone } = setupMockDom();
  const label = doc.registerElement('deckCount', doc.createElement('span'));
  const opts = { document: doc, getZone: mockGetZone };
  const view = (stateVersion, deck) => ({
    stateVersion,
    you: { playerId: 'p1', zones: { deck } },
    them: { playerId: 'p2', zones: {} },
  });

  applyView(view(1, { count: 40 }), [], opts);
  applyView(view(2, {}), [], opts);

  assert.equal(label.textContent, '40');
});

test('viewBackedGetZone reads the last applied view for either seat', () => {
  const { doc, mockGetZone } = setupMockDom();
  applyView(
    {
      stateVersion: 1,
      you: { playerId: 'p1', zones: { active: [{ instanceId: 1, name: 'Pikachu', src: 'p.png' }] } },
      them: { playerId: 'p2', zones: { active: [] } },
    },
    [],
    { document: doc, getZone: mockGetZone }
  );

  assert.equal(viewBackedGetZone('self', 'active').array[0].instanceId, 1);
  assert.deepEqual(viewBackedGetZone('opp', 'active').array, []);
});
