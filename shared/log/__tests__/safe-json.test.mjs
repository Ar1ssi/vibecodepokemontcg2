import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeStringify } from '../safe-json.mjs';

test('cyclic object contains [Circular]', () => {
  const a = { name: 'a' };
  a.self = a;
  assert.match(safeStringify(a), /"\[Circular\]"/);
});

test('5 MB string is capped', () => {
  assert.ok(safeStringify('x'.repeat(5e6)).length <= 2048 + 64);
});

test('throwing getter becomes [Threw]', () => {
  assert.equal(
    safeStringify({
      get a() {
        throw 1;
      },
    }),
    '{"a":"[Threw]"}'
  );
});

test('undefined at top level is null, undefined properties omitted', () => {
  assert.equal(safeStringify(undefined), 'null');
  assert.equal(safeStringify({ a: undefined, b: 1 }), '{"b":1}');
});

test('depth, arrays, strings are bounded with a (+n) marker', () => {
  assert.equal(safeStringify({ a: { b: { c: 1 } } }, { maxDepth: 1 }), '{"a":{"b":"[Depth]"}}');
  assert.equal(safeStringify([1, 2, 3, 4], { maxArray: 2 }), '[1,2,"…(+2)"]');
  assert.equal(safeStringify('abcdef', { maxString: 3 }), '"abc…(+3)"');
});

test('Error serializes name, message, stack, cause', () => {
  const err = new Error('boom', { cause: new TypeError('inner') });
  const out = JSON.parse(safeStringify(err, { maxBytes: 1e6 }));
  assert.equal(out.name, 'Error');
  assert.equal(out.message, 'boom');
  assert.equal(typeof out.stack, 'string');
  assert.equal(out.cause.name, 'TypeError');
  assert.equal('cause' in JSON.parse(safeStringify(new Error('x'), { maxBytes: 1e6 })), false);
});

test('Map, Set, bigint, symbol, function, Date', () => {
  assert.equal(safeStringify(new Map([['k', 1]])), '[["k",1]]');
  assert.equal(safeStringify(new Set([1, 2])), '[1,2]');
  assert.equal(safeStringify({ n: 5n }), '{"n":"5"}');
  assert.equal(safeStringify(Symbol('s')), '"[Symbol s]"');
  assert.equal(safeStringify({ f: function foo() {} }), '{"f":"[Function foo]"}');
  assert.equal(safeStringify(new Date(0)), '"1970-01-01T00:00:00.000Z"');
  assert.equal(safeStringify(new Date(NaN)), '"[Invalid Date]"');
});

test('DOM-like node becomes a description', () => {
  const el = { nodeType: 1, tagName: 'DIV', id: 'x', className: 'a' };
  assert.equal(safeStringify(el), '"div#x.a"');
});

test('oversize output is replaced by a truncation stub with first 20 keys', () => {
  const big = {};
  for (let i = 0; i < 30; i++) big[`k${i}`] = 'y'.repeat(100);
  const out = JSON.parse(safeStringify(big, { maxBytes: 500 }));
  assert.equal(out._truncated, true);
  assert.ok(out.bytes > 500);
  assert.equal(out.keys.length, 20);
  assert.deepEqual(JSON.parse(safeStringify(['a'.repeat(100)], { maxBytes: 10 })).keys, []);
});

test('output never contains a raw line break', () => {
  assert.equal(/[\r\n]/.test(safeStringify({ s: 'a\nb\r\nc' })), false);
});
