import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CONCURRENT, createSampleBank, startTiming } from '../sample-bank.js';

const manifest = (cues) => ({ version: 1, cues });
const cue = (...files) => ({ files, dur: 1, channels: 2, lufs: -20 });
const manifestUrl = '/src/assets/sfx/manifest.json';
const fileUrl = (name) => `/src/assets/sfx/${name}`;
const master = { connect() {} };
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeContext(state = 'running') {
  const sources = [];
  const ctx = {
    state,
    currentTime: 0,
    listeners: [],
    addEventListener: (_type, fn) => ctx.listeners.push(fn),
    removeEventListener: () => {},
    createGain: () => ({
      gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() {},
      disconnect() {},
    }),
    createBufferSource: () => {
      const source = {
        connect() {},
        disconnect() {},
        start: (when, offset) => {
          source.startedAt = when ?? 0;
          source.offset = offset ?? 0;
        },
        stop: (when) => {
          source.stopped = true;
          source.stoppedAt = when;
        },
      };
      sources.push(source);
      return source;
    },
    decodeAudioData: async (bytes) => {
      if (bytes.byteLength === 0) throw new Error('bad data');
      return { id: bytes.byteLength };
    },
  };
  return { ctx, sources };
}

const fakeFetch = (routes, calls = []) => async (url) => {
  calls.push(url);
  const hit = routes[url];
  if (!hit) return { ok: false, status: 404 };
  if (hit.json !== undefined) return { ok: true, json: async () => hit.json };
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(hit.bytes ?? 8) };
};

test('no manifest: bank stays empty and logs once (row 1)', async () => {
  const logs = [];
  const bank = createSampleBank({ fetch: fakeFetch({}), log: (m) => logs.push(m) });
  const { ctx, sources } = fakeContext();
  await bank.init(ctx, master);
  assert.equal(bank.playSample('your-turn'), false);
  assert.equal(bank.hasSample('your-turn'), false);
  assert.equal(sources.length, 0);
  assert.equal(logs.length, 1);
});

test('malformed or wrong-version manifest is treated as empty (row 2)', async () => {
  for (const json of [{ version: 2, cues: {} }, { version: 1 }, null, 'x']) {
    const bank = createSampleBank({ fetch: fakeFetch({ [manifestUrl]: { json } }), log: () => {} });
    const { ctx } = fakeContext();
    await bank.init(ctx, master);
    assert.equal(bank.playSample('your-turn'), false);
  }
});

test('a preloaded cue plays from the manifest file', async () => {
  const bank = createSampleBank({
    fetch: fakeFetch({
      [manifestUrl]: { json: manifest({ 'your-turn': cue('your-turn.aaaaaaaa.ogg') }) },
      [fileUrl('your-turn.aaaaaaaa.ogg')]: {},
    }),
  });
  const { ctx, sources } = fakeContext();
  await bank.init(ctx, master);
  assert.equal(bank.hasSample('your-turn'), true);
  assert.equal(bank.playSample('your-turn', { gain: 0.5, delayMs: 250 }), true);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].startedAt, 0.25);
});

test('a 404 or undecodable file kills only that cue (rows 3, 12)', async () => {
  const bank = createSampleBank({
    fetch: fakeFetch({
      [manifestUrl]: {
        json: manifest({ 'your-turn': cue('missing.aaaaaaaa.ogg'), 'opp-turn': cue('opp.bbbbbbbb.ogg') }),
      },
      [fileUrl('opp.bbbbbbbb.ogg')]: { bytes: 0 },
    }),
  });
  const { ctx } = fakeContext();
  await bank.init(ctx, master);
  assert.equal(bank.playSample('your-turn'), false);
  assert.equal(bank.playSample('opp-turn'), false);
});

test('a cue requested before it decodes falls back, is not played late, and is kept (row 4)', async () => {
  const bank = createSampleBank({
    fetch: fakeFetch({
      [manifestUrl]: { json: manifest({ 'evolve-card': cue('flip.cccccccc.ogg') }) },
      [fileUrl('flip.cccccccc.ogg')]: {},
    }),
  });
  const { ctx, sources } = fakeContext();
  await bank.init(ctx, master);
  assert.equal(bank.playSample('evolve-card'), false);
  assert.equal(sources.length, 0);
  await tick();
  assert.equal(bank.hasSample('evolve-card'), true);
  assert.equal(bank.playSample('evolve-card'), true);
});

test('preload waits for the context to run (first gesture)', async () => {
  const calls = [];
  const bank = createSampleBank({
    fetch: fakeFetch(
      {
        [manifestUrl]: { json: manifest({ 'your-turn': cue('t.dddddddd.ogg') }) },
        [fileUrl('t.dddddddd.ogg')]: {},
      },
      calls,
    ),
  });
  const { ctx } = fakeContext('suspended');
  const done = bank.init(ctx, master);
  await tick();
  assert.deepEqual(calls, [manifestUrl]);
  ctx.state = 'running';
  ctx.listeners.forEach((fn) => fn());
  await done;
  assert.equal(bank.hasSample('your-turn'), true);
});

test('at most MAX_CONCURRENT instances of a cue at once (row 5)', async () => {
  const bank = createSampleBank({
    fetch: fakeFetch({
      [manifestUrl]: { json: manifest({ 'your-turn': cue('t.eeeeeeee.ogg') }) },
      [fileUrl('t.eeeeeeee.ogg')]: {},
    }),
  });
  const { ctx, sources } = fakeContext();
  await bank.init(ctx, master);
  for (let i = 0; i < 5; i += 1) bank.playSample('your-turn');
  assert.equal(sources.length, MAX_CONCURRENT);
  sources[0].onended();
  bank.playSample('your-turn');
  assert.equal(sources.length, MAX_CONCURRENT + 1);
});

test('variants rotate without immediate repeat', async () => {
  const bank = createSampleBank({
    rng: () => 0,
    fetch: fakeFetch({
      [manifestUrl]: { json: manifest({ 'your-turn': cue('a.11111111.ogg', 'b.22222222.ogg') }) },
      [fileUrl('a.11111111.ogg')]: { bytes: 4 },
      [fileUrl('b.22222222.ogg')]: { bytes: 6 },
    }),
  });
  const { ctx, sources } = fakeContext();
  await bank.init(ctx, master);
  bank.playSample('your-turn');
  bank.playSample('your-turn');
  assert.notEqual(sources[0].buffer.id, sources[1].buffer.id);
});

test('stopAllLoops stops a loop; stop with an outro plays it', async () => {
  const bank = createSampleBank({
    fetch: fakeFetch({
      [manifestUrl]: {
        json: manifest({ 'your-turn': cue('t.ffffffff.ogg'), 'opp-turn': cue('o.99999999.ogg') }),
      },
      [fileUrl('t.ffffffff.ogg')]: {},
      [fileUrl('o.99999999.ogg')]: {},
    }),
  });
  const { ctx, sources } = fakeContext();
  await bank.init(ctx, master);
  assert.ok(bank.startLoop('your-turn', { gain: 0.25, bus: 'status' }));
  assert.equal(sources[0].loop, true);
  bank.stopAllLoops();
  assert.equal(sources[0].stopped, true);

  bank.startLoop('your-turn').stop({ outroKey: 'opp-turn' });
  assert.equal(sources.length, 3);
  assert.equal(bank.startLoop('nope'), null);
});

test('the concurrency cap applies only at delayMs 0; scheduled plays always start', async () => {
  const bank = createSampleBank({
    fetch: fakeFetch({
      [manifestUrl]: { json: manifest({ 'coin-win': cue('w.ffffffff.ogg') }) },
      [fileUrl('w.ffffffff.ogg')]: {},
    }),
  });
  const { ctx, sources } = fakeContext();
  await bank.init(ctx, master);
  assert.equal(bank.playSample('coin-win', { delayMs: 700 }), true);
  assert.equal(bank.playSample('coin-win', { delayMs: 1400 }), true);
  assert.equal(sources.length, 2);
  assert.equal(bank.playSample('coin-win'), true);
  assert.equal(sources.length, 2, 'the immediate third play is capped');
  assert.equal(bank.playSample('coin-win', { delayMs: 2100 }), true);
  assert.equal(sources.length, 3);
});

test('warmSample starts a lazy load once and ignores unknown cues', async () => {
  const calls = [];
  const bank = createSampleBank({
    fetch: fakeFetch(
      {
        [manifestUrl]: { json: manifest({ 'evolve-card': cue('e.11111111.ogg') }) },
        [fileUrl('e.11111111.ogg')]: {},
      },
      calls,
    ),
  });
  const { ctx } = fakeContext();
  await bank.init(ctx, master);
  assert.equal(bank.hasSample('evolve-card'), false);
  bank.warmSample('evolve-card');
  bank.warmSample('evolve-card');
  bank.warmSample('not-a-cue');
  await tick();
  await tick();
  assert.equal(bank.hasSample('evolve-card'), true);
  assert.equal(calls.filter((url) => url === fileUrl('e.11111111.ogg')).length, 1);
});

test('playSequence is all-or-nothing: one cue not ready plays nothing and warms it', async () => {
  const calls = [];
  const bank = createSampleBank({
    fetch: fakeFetch(
      {
        [manifestUrl]: { json: manifest({ 'card-flip': cue('f.11111111.ogg'), 'evolve-card': cue('e.22222222.ogg') }) },
        [fileUrl('f.11111111.ogg')]: {},
        [fileUrl('e.22222222.ogg')]: {},
      },
      calls,
    ),
  });
  const { ctx, sources } = fakeContext();
  await bank.init(ctx, master);
  const sequence = [
    { key: 'card-flip', gain: 0.7, delayMs: 0 },
    { key: 'evolve-card', gain: 0.8, delayMs: 260 },
  ];
  assert.equal(bank.playSequence(sequence), false);
  assert.equal(sources.length, 0);
  await tick();
  await tick();
  assert.ok(calls.includes(fileUrl('e.22222222.ogg')), 'the missing cue started loading');
  assert.equal(bank.playSequence(sequence), true);
  assert.deepEqual(sources.map((source) => source.startedAt), [0, 0.26]);
});

const crowdBank = async (extra = {}) => {
  const bank = createSampleBank({
    fetch: fakeFetch({
      [manifestUrl]: {
        json: manifest({
          'cheer-large': cue('c.aaaaaaaa.ogg'),
          surprise: cue('s.bbbbbbbb.ogg'),
          'crowd-amb-small': { files: ['b.cccccccc.ogg'], dur: 30, channels: 2, lufs: -20 },
        }),
      },
      [fileUrl('c.aaaaaaaa.ogg')]: {},
      [fileUrl('s.bbbbbbbb.ogg')]: {},
    }),
    ...extra,
  });
  const { ctx, sources } = fakeContext();
  await bank.init(ctx, master);
  bank.warmSample('cheer-large');
  bank.warmSample('surprise');
  await tick();
  await tick();
  return { bank, ctx, sources };
};

test('crowd reactions share one slot: dropped inside the cooldown, then the newest replaces and fades the old', async () => {
  const { bank, ctx, sources } = await crowdBank();
  assert.equal(bank.playReaction('cheer-large'), true);
  ctx.currentTime = 1;
  assert.equal(bank.playReaction('surprise'), true, 'consumed, not played');
  assert.equal(sources.length, 1);
  ctx.currentTime = 2;
  assert.equal(bank.playReaction('surprise'), true);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].stoppedAt, 2.3, 'the replaced reaction fades out over 0.3 s');
  assert.equal(sources[1].stopped, undefined);
});

test('a crowd reaction whose cue is not decoded or unknown is not played', async () => {
  const { bank, sources } = await crowdBank();
  assert.equal(bank.playReaction('nope'), false);
  assert.equal(bank.playReaction('crowd-amb-small'), false, 'streamed beds are not one-shot buffers');
  assert.equal(sources.length, 0);
});

test('a loop stops over its fadeSeconds', async () => {
  const { bank, ctx, sources } = await crowdBank();
  ctx.currentTime = 4;
  const handle = bank.startLoop('cheer-large', { gain: 0.5, bus: 'crowd' });
  handle.stop({ fadeSeconds: 3 });
  assert.equal(sources[0].stoppedAt, 7);
});

test('a streamed loop is paused once its fade has run, not at once', async () => {
  const elements = [];
  class FakeAudio {
    constructor(url) {
      this.url = url;
      this.paused = false;
      elements.push(this);
    }
    play() {
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }
  const { bank, ctx } = await crowdBank({ MediaCtor: FakeAudio });
  ctx.createMediaElementSource = () => ({ connect() {} });
  const handle = bank.startLoop('crowd-amb-small', { gain: 0.8, bus: 'crowd' });
  assert.equal(elements[0].url, fileUrl('b.cccccccc.ogg'));
  handle.stop({ fadeSeconds: 0.05 });
  assert.equal(elements[0].paused, false);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(elements[0].paused, true);
});

test('startTiming lands the peak on alignMs: late peak skips the lead-in, early peak waits', () => {
  assert.deepEqual(startTiming(0, 500, 300), { startMs: 200, offsetMs: 0 });
  assert.deepEqual(startTiming(0, 100, 300), { startMs: 0, offsetMs: 200 });
  assert.deepEqual(startTiming(0, 300, 300), { startMs: 0, offsetMs: 0 });
  assert.deepEqual(startTiming(250, undefined, 300), { startMs: 250, offsetMs: 0 });
  assert.deepEqual(startTiming(250, 500, undefined), { startMs: 250, offsetMs: 0 });
  assert.deepEqual(startTiming(-5, undefined, undefined), { startMs: 0, offsetMs: 0 });
  assert.deepEqual(startTiming(undefined, undefined, undefined), { startMs: 0, offsetMs: 0 });
});

test('an aligned cue starts from its manifest peak; a cue without peaks ignores alignMs', async () => {
  const bank = createSampleBank({
    fetch: fakeFetch({
      [manifestUrl]: {
        json: manifest({
          'attack-fire-small': { ...cue('hit.aaaaaaaa.ogg'), peaks: [300] },
          'attack-fire-medium': cue('mid.bbbbbbbb.ogg'),
        }),
      },
      [fileUrl('hit.aaaaaaaa.ogg')]: {},
      [fileUrl('mid.bbbbbbbb.ogg')]: {},
    }),
  });
  const { ctx, sources } = fakeContext();
  await bank.init(ctx, master);
  assert.equal(bank.playSequence([{ key: 'attack-fire-small', gain: 0.8, delayMs: 0, alignMs: 500 }]), true);
  assert.equal(bank.playSequence([{ key: 'attack-fire-small', gain: 0.8, delayMs: 0, alignMs: 100 }]), true);
  assert.equal(bank.playSequence([{ key: 'attack-fire-medium', gain: 0.8, delayMs: 0, alignMs: 500 }]), true);
  assert.deepEqual(
    sources.map((source) => [source.startedAt, source.offset]),
    [
      [0.2, 0],
      [0, 0.2],
      [0, 0],
    ]
  );
});
