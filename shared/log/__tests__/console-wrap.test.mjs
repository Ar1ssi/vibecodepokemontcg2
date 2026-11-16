import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapConsole } from '../console-wrap.mjs';
import { createLogger } from '../logger.mjs';

function setup() {
  const printed = [];
  const consoleRef = {
    log: (...args) => printed.push(['log', ...args]),
    warn: (...args) => printed.push(['warn', ...args]),
    error: (...args) => printed.push(['error', ...args]),
  };
  const lines = [];
  const logger = createLogger({ now: () => 1000, sink: (entry) => lines.push(JSON.parse(entry.line)) });
  return { printed, consoleRef, lines, logger };
}

test('a wrapped method prints once and logs once at the mapped level', () => {
  const { printed, consoleRef, lines, logger } = setup();
  wrapConsole(consoleRef, logger);
  consoleRef.warn('careful', { a: 1 });
  assert.deepEqual(printed, [['warn', 'careful', { a: 1 }]]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].lvl, 'warn');
  assert.equal(lines[0].cat, 'console');
  assert.equal(lines[0].ev, 'warn');
  assert.deepEqual(lines[0].d, { args: ['careful', { a: 1 }] });
});

test('console.log maps to info', () => {
  const { consoleRef, lines, logger } = setup();
  wrapConsole(consoleRef, logger);
  consoleRef.log('hello');
  assert.equal(lines[0].lvl, 'info');
  assert.equal(lines[0].ev, 'log');
});

test('console output raised while an entry is being recorded is printed but not re-recorded', () => {
  const printed = [];
  const consoleRef = { error: (...args) => printed.push(args) };
  let sinkCalls = 0;
  const logger = createLogger({
    now: () => 1000,
    sink: () => {
      sinkCalls += 1;
      consoleRef.error('from inside the sink');
    },
  });
  wrapConsole(consoleRef, logger);
  consoleRef.error('outer');
  assert.equal(sinkCalls, 1);
  assert.deepEqual(printed, [['outer'], ['from inside the sink']]);
});

test('restore puts the original methods back, and a missing method is skipped', () => {
  const { consoleRef, lines, logger } = setup();
  const originalWarn = consoleRef.warn;
  const restore = wrapConsole(consoleRef, logger);
  assert.notEqual(consoleRef.warn, originalWarn);
  assert.equal(consoleRef.debug, undefined);
  restore();
  assert.equal(consoleRef.warn, originalWarn);
  consoleRef.warn('after restore');
  assert.equal(lines.length, 0);
});

test('a missing console or logger is a no-op', () => {
  assert.equal(typeof wrapConsole(null, null), 'function');
  wrapConsole(null, null)();
});
