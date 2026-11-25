import test from 'node:test';
import assert from 'node:assert/strict';
import { patchMethod } from '../patch-method.mjs';
import { wrapConsole } from '../console-wrap.mjs';

test('uninstall restores the original only while the wrapper is still current', () => {
  const target = { run: () => 'original' };
  const original = target.run;
  const uninstall = patchMethod(target, 'run', (inner) => () => `wrapped ${inner()}`);
  assert.equal(target.run(), 'wrapped original');
  uninstall();
  assert.equal(target.run, original);

  const uninstallInner = patchMethod(target, 'run', (inner) => () => `inner ${inner()}`);
  const outer = patchMethod(target, 'run', (inner) => () => `outer ${inner()}`);
  uninstallInner();
  assert.equal(target.run(), 'outer inner original', 'a patch layered on top is not undone');
  outer();
});

test('a missing method is left alone', () => {
  const target = {};
  patchMethod(target, 'nope', () => assert.fail('no wrapper for a missing method'))();
  assert.deepEqual(Object.keys(target), []);
});

test('restoring the console does not undo a wrapper another module put on top', () => {
  const consoleRef = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
  const restore = wrapConsole(consoleRef, { log() {} });
  const layered = () => {};
  consoleRef.warn = layered;
  restore();
  assert.equal(consoleRef.warn, layered);
});
