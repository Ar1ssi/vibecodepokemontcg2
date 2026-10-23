import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_ROOT, checkCustomSets } from '../check.mjs';
import { sampleSet } from '../../../shared/custom-sets/__tests__/fixtures.mjs';

function writeSet(root, set, { images = true } = {}) {
  const dir = path.join(root, set.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'set.json'), JSON.stringify(set));
  if (!images) return;
  for (const card of set.cards) {
    fs.mkdirSync(path.join(dir, card.localId), { recursive: true });
    fs.writeFileSync(path.join(dir, card.localId, 'high.webp'), 'x');
    fs.writeFileSync(path.join(dir, card.localId, 'low.webp'), 'x');
  }
}

test('a complete set passes; missing images and bad json are reported', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-check-'));
  writeSet(root, sampleSet());
  const noArt = sampleSet({ id: 'customabc', code: 'ABC' });
  noArt.cards = noArt.cards.map((card) => ({
    ...card,
    id: card.id.replace('customhbw', 'customabc'),
    image: card.image.replace('customhbw', 'customabc'),
  }));
  writeSet(root, noArt, { images: false });
  fs.mkdirSync(path.join(root, 'custombad'));
  fs.writeFileSync(path.join(root, 'custombad', 'set.json'), '{');
  fs.mkdirSync(path.join(root, 'customnone'));
  const { sets, problems } = checkCustomSets(root);
  assert.deepEqual(sets, ['customhbw (HBW, 2 cards)']);
  assert.deepEqual(
    problems.sort(),
    [
      'customabc/001/high.webp: missing',
      'customabc/001/low.webp: missing',
      'customabc/002/high.webp: missing',
      'customabc/002/low.webp: missing',
      'custombad/set.json: not valid JSON (Expected property name or \'}\' in JSON at position 1 (line 1 column 2))',
      'customnone: no set.json',
    ].sort()
  );
});

test('a missing root is fine', () => {
  assert.deepEqual(checkCustomSets(path.join(os.tmpdir(), 'no-such-custom-sets')), { sets: [], problems: [] });
});

test('the sets committed in this repo are valid', () => {
  const { problems } = checkCustomSets(DEFAULT_ROOT);
  assert.deepEqual(problems, []);
});
