import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDiskSink } from '../disk-sink.mjs';

test('two stream ids that sanitise to one name do not interleave in one file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disk-names-'));
  const sink = createDiskSink({ dir, bootId: 'b', setIntervalRef: () => ({ unref() {} }) });
  sink.write('room:a b', 'spaced-1');
  sink.write('room:a_b', 'underscored-1');
  sink.write('room:a b', 'spaced-2');
  sink.close();
  const read = (name) => fs.readFileSync(path.join(dir, 'b', name), 'utf8');
  assert.equal(read('room_a_b.ndjson'), 'spaced-1\nspaced-2\n');
  assert.equal(read('room_a_b~2.ndjson'), 'underscored-1\n');
  fs.rmSync(dir, { recursive: true });
});
