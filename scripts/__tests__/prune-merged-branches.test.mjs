import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPrunable, parseArgs } from '../prune-merged-branches.mjs';

test('selectPrunable keeps only merged branches and never the base, current or kept ones', () => {
  const picked = selectPrunable({
    remoteBranches: ['main', 'claude/a', 'feature/b', 'fix/c', 'cursor/d', 'work/e'],
    mergedBranches: ['main', 'claude/a', 'feature/b', 'cursor/d', 'work/e'],
    keep: ['cursor/d'],
    base: 'main',
    current: 'work/e',
  });
  assert.deepEqual(picked, ['claude/a', 'feature/b']);
});

test('selectPrunable preserves remote order and tolerates empty inputs', () => {
  assert.deepEqual(selectPrunable({ remoteBranches: [], mergedBranches: [], base: 'main' }), []);
  const picked = selectPrunable({
    remoteBranches: ['z/1', 'a/2', 'm/3'],
    mergedBranches: ['m/3', 'z/1', 'a/2'],
    base: 'main',
    current: 'main',
  });
  assert.deepEqual(picked, ['z/1', 'a/2', 'm/3']);
});

test('parseArgs reads remote, base, keep lists and --yes; rejects unknown flags', () => {
  const options = parseArgs(['--remote', 'upstream', '--base', 'trunk', '--keep', 'a,b c', '--yes']);
  assert.equal(options.remote, 'upstream');
  assert.equal(options.base, 'trunk');
  assert.deepEqual(options.keep, ['a', 'b', 'c']);
  assert.equal(options.yes, true);
  assert.deepEqual(parseArgs([]), { remote: 'origin', base: 'main', keep: [], yes: false });
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});
