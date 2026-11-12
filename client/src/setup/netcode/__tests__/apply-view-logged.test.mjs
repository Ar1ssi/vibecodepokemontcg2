import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../../../../../shared/log/logger.mjs';
import { applyViewLogged, resetApplyViewLog } from '../apply-view-logged.js';

const makeLog = (level = 'debug') => {
  const lines = [];
  const log = createLogger({ now: () => 1000, sink: (e) => lines.push(JSON.parse(e.line)), level });
  return { log, lines };
};

const viewWith = (stateVersion, zones, extra = {}) => ({
  stateVersion,
  you: { playerId: 'p1', zones },
  them: { playerId: 'p2', zones: {} },
  ...extra,
});

const emptyView = (sv, extra) => viewWith(sv, { hand: [], active: [] }, extra);

beforeEach(() => resetApplyViewLog());

test('applied view logs one view/apply entry and returns the stub result', () => {
  const { log, lines } = makeLog();
  const stubResult = { applied: true, stateVersion: 9 };
  const result = applyViewLogged(() => stubResult, emptyView(9), [{ type: 'draw' }], {}, log);
  assert.equal(result, stubResult);
  const entries = lines.filter((l) => l.cat === 'view' && l.ev === 'apply');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].sv, 9);
  assert.equal(entries[0].d.applied, true);
  assert.equal(entries[0].d.initial, true);
  assert.deepEqual(entries[0].d.events, ['draw']);
});

test('a moved card is reported with its from and to zones', () => {
  const { log, lines } = makeLog();
  const ok = () => ({ applied: true });
  applyViewLogged(ok, viewWith(1, { hand: [{ instanceId: 5 }], active: [] }), [], {}, log);
  applyViewLogged(ok, viewWith(2, { hand: [], active: [{ instanceId: 5 }] }), [], {}, log);
  const second = lines.filter((l) => l.ev === 'apply')[1];
  assert.equal(second.d.you.moved, 1);
  assert.deepEqual(second.d.moves, [{ id: 5, from: 'you.hand', to: 'you.active' }]);
});

test('out_of_order logs at debug, other refusals at warn', () => {
  const { log, lines } = makeLog();
  applyViewLogged(() => ({ applied: false, reason: 'out_of_order' }), emptyView(3), [], {}, log);
  applyViewLogged(() => ({ applied: false, reason: 'invalid_view' }), emptyView(4), [], {}, log);
  assert.equal(lines[0].lvl, 'debug');
  assert.equal(lines[0].d.reason, 'out_of_order');
  assert.equal(lines[1].lvl, 'warn');
  assert.equal(lines[1].d.reason, 'invalid_view');
});

test('a throwing apply logs view/apply.threw and rethrows the same error', () => {
  const { log, lines } = makeLog();
  const boom = new Error('boom');
  assert.throws(
    () =>
      applyViewLogged(() => {
        throw boom;
      }, emptyView(5), [], {}, log),
    (error) => error === boom
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].ev, 'apply.threw');
  assert.equal(lines[0].lvl, 'error');
});

test('a pending choice logs open then closed', () => {
  const { log, lines } = makeLog();
  const ok = () => ({ applied: true });
  applyViewLogged(ok, emptyView(1, { pendingChoice: { choiceId: 'c1', player: 'p1', options: [1, 2] } }), [], {}, log);
  applyViewLogged(ok, emptyView(2), [], {}, log);
  const open = lines.find((l) => l.cat === 'choice' && l.ev === 'open');
  assert.equal(open.d.options, 2);
  assert.equal(open.d.choiceId, 'c1');
  const closed = lines.find((l) => l.cat === 'choice' && l.ev === 'closed');
  assert.equal(closed.d.choiceId, 'c1');
});

test('trace level also logs the full diff', () => {
  const { log, lines } = makeLog('trace');
  applyViewLogged(() => ({ applied: true }), emptyView(1), [], {}, log);
  assert.ok(lines.some((l) => l.cat === 'view' && l.ev === 'diff'));
});

test('a logger that throws never changes the result', () => {
  const stubResult = { applied: true };
  const throwing = () => {
    throw new Error('log down');
  };
  const log = { debug: throwing, warn: throwing, info: throwing, error: throwing, trace: throwing, enabled: () => true };
  assert.equal(applyViewLogged(() => stubResult, emptyView(1), [], {}, log), stubResult);
});
