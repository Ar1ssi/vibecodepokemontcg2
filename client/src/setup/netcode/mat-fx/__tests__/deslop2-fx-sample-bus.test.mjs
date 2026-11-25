import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSampleBank } from '../sample-bank.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('sample-bank: a bus named like an Object.prototype member plays on the sfx bus', async () => {
  const gains = [];
  const ctx = {
    state: 'running',
    currentTime: 0,
    addEventListener() {},
    removeEventListener() {},
    createGain: () => {
      const node = { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} };
      gains.push(node);
      return node;
    },
    createBufferSource: () => ({ connect() {}, disconnect() {}, start() {}, stop() {} }),
    decodeAudioData: async () => ({}),
  };
  const routes = {
    '/src/assets/sfx/manifest.json': { json: { version: 1, cues: { 'your-turn': { files: ['t.aaaaaaaa.ogg'], dur: 1, channels: 2, lufs: -20 } } } },
    '/src/assets/sfx/t.aaaaaaaa.ogg': {},
  };
  const bank = createSampleBank({
    fetch: async (url) => {
      const hit = routes[url];
      if (!hit) return { ok: false, status: 404 };
      if (hit.json) return { ok: true, json: async () => hit.json };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });
  await bank.init(ctx, { connect() {} });
  await tick();
  assert.equal(bank.playSample('your-turn', { bus: 'toString' }), true);
  const busGains = gains.map((node) => node.gain.value);
  assert.ok(busGains.every((value) => typeof value === 'number'), `a bus gain was ${busGains.map(String)}`);
});
