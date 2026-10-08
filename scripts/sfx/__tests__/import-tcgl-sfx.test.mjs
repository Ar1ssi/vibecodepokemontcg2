import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildManifest,
  contentHash,
  importSfx,
  missingTools,
  outputName,
  parseArgs,
  parseLufs,
  parseProbe,
  peakMsFromPcm,
} from '../import-tcgl-sfx.mjs';

/** Mono s16le at 8 kHz: `ms` of quiet with one loud 10 ms burst starting at `peakAt`. */
function pcmWithBurst(ms, peakAt, { quiet = 100, loud = 20000 } = {}) {
  const samples = (ms * 8000) / 1000;
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = (i * 1000) / 8000;
    pcm.writeInt16LE(t >= peakAt && t < peakAt + 10 ? loud : quiet, i * 2);
  }
  return pcm;
}

const EBUR_SUMMARY = `  Integrated loudness:\n    I:         -23.4 LUFS\n    Threshold: -36.1 LUFS\n\n  Loudness range:\n    LRA:        20.1 LU`;

// A stand-in for ffmpeg/ffprobe: records calls, "encodes" by writing the requested output file.
function fakeRun({ missing = [], channels = 2, failEncodeOn = null } = {}) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (missing.includes(command)) return { error: new Error('ENOENT'), status: null };
    if (args[0] === '-version') return { status: 0 };
    if (command === 'ffprobe')
      return { status: 0, stdout: JSON.stringify({ streams: [{ channels }], format: { duration: '1.23456' } }) };
    if (args.includes('ebur128=framelog=quiet')) return { status: 0, stderr: EBUR_SUMMARY };
    if (args.includes('s16le')) return { status: 0, stdout: pcmWithBurst(500, 250), stderr: '' };
    const input = args[args.indexOf('-i') + 1];
    if (failEncodeOn && input.endsWith(failEncodeOn)) return { status: 1, stderr: 'encoder exploded' };
    writeFileSync(args.at(-1), 'ogg');
    return { status: 0 };
  };
  return { run, calls };
}

function workspace(files) {
  const root = mkdtempSync(join(tmpdir(), 'sfx-import-'));
  const src = join(root, 'src');
  mkdirSync(src);
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(src, name), bytes);
  return { src, out: join(root, 'out'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const FILES = {
  'sfx_rain_victory.wav': 'victory-bytes',
  'sfx_rainier_shuffle_01.wav': 'shuffle-1',
  'sfx_rainier_shuffle_02.wav': 'shuffle-2',
  'sfx_rain_fire_jumbotron_intro.wav': 'excluded',
  'notes.txt': 'ignored',
};

test('parseArgs requires --src and rejects stray flags', () => {
  assert.equal(parseArgs([], '/o').error, '--src <extract dir> is required');
  assert.equal(parseArgs(['--src'], '/o').error, '--src needs a directory');
  assert.equal(parseArgs(['--src', 'a', '--nope'], '/o').error, 'unknown argument --nope');
  assert.deepEqual(parseArgs(['--src', 'a', '--check'], '/o'), { src: 'a', out: '/o', check: true });
  assert.equal(parseArgs(['--src', 'a', '--out', 'b'], '/o').out, 'b');
});

test('parseProbe and parseLufs read ffprobe/ffmpeg output; silence reads -70', () => {
  assert.deepEqual(parseProbe('{"streams":[{"channels":1}],"format":{"duration":"3.36"}}'), { channels: 1, dur: 3.36 });
  assert.throws(() => parseProbe('{"streams":[],"format":{}}'), /no usable/);
  assert.equal(parseLufs(EBUR_SUMMARY), -23.4);
  assert.equal(parseLufs('    I:         -inf LUFS'), -70);
  assert.throws(() => parseLufs('nothing'), /no integrated loudness/);
});

test('hashed names change with the audio and the channel layout', () => {
  const a = contentHash(Buffer.from('x'), 2);
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(a, contentHash(Buffer.from('x'), 2));
  assert.notEqual(a, contentHash(Buffer.from('y'), 2));
  assert.notEqual(a, contentHash(Buffer.from('x'), 1));
  assert.equal(outputName('shuffle', 2, a), `shuffle-2.${a}.ogg`);
  assert.equal(outputName('victory', undefined, a), `victory.${a}.ogg`);
});

test('peakMsFromPcm finds the loudest 10 ms window; silence and empty audio read 0', () => {
  assert.equal(peakMsFromPcm(pcmWithBurst(500, 250)), 250);
  assert.equal(peakMsFromPcm(pcmWithBurst(500, 0)), 0);
  assert.equal(peakMsFromPcm(pcmWithBurst(1000, 780)), 780);
  assert.equal(peakMsFromPcm(pcmWithBurst(300, 100, { quiet: 0, loud: 0 })), 0);
  assert.equal(peakMsFromPcm(Buffer.alloc(0)), 0);
  assert.equal(peakMsFromPcm(undefined), 0);
});

test('buildManifest groups variants and sorts keys; peaks stay per file', () => {
  const manifest = buildManifest([
    { key: 'shuffle', variant: 2, file: 'shuffle-2.b.ogg', dur: 2, channels: 1, lufs: -20, peakMs: 40 },
    { key: 'shuffle', variant: 1, file: 'shuffle-1.a.ogg', dur: 1, channels: 2, lufs: -21, peakMs: 10 },
    { key: 'defeat', file: 'defeat.c.ogg', dur: 3, channels: 2, lufs: -18, peakMs: 300 },
  ]);
  assert.deepEqual(Object.keys(manifest.cues), ['defeat', 'shuffle']);
  assert.deepEqual(manifest.cues.shuffle, {
    files: ['shuffle-1.a.ogg', 'shuffle-2.b.ogg'],
    dur: 2,
    channels: 2,
    lufs: -20.5,
    peaks: [10, 40],
  });
  assert.equal(manifest.version, 1);
});

test('row 13: missing ffmpeg or ffprobe exits 1 naming the tool', () => {
  const { run } = fakeRun({ missing: ['ffprobe'] });
  assert.deepEqual(missingTools(run), ['ffprobe']);
  const ws = workspace(FILES);
  try {
    const result = importSfx({ src: ws.src, out: ws.out, run });
    assert.equal(result.exitCode, 1);
    assert.match(result.messages[0], /ffprobe not found on PATH/);
    assert.equal(existsSync(ws.out), false);
  } finally {
    ws.cleanup();
  }
});

test('row 14: a file outside SOURCE_MAP and EXCLUDED exits 1, listing it, and writes nothing', () => {
  const ws = workspace({ ...FILES, 'sfx_brand_new_sound.wav': 'x' });
  try {
    const { run, calls } = fakeRun();
    const result = importSfx({ src: ws.src, out: ws.out, run });
    assert.equal(result.exitCode, 1);
    assert.ok(result.messages.includes('sfx_brand_new_sound.wav'));
    assert.equal(existsSync(ws.out), false);
    assert.equal(calls.filter(([, ...args]) => args.includes('-i')).length, 0);
  } finally {
    ws.cleanup();
  }
});

test('imports mapped files only, writes hashed names and a manifest', () => {
  const ws = workspace(FILES);
  try {
    const { run } = fakeRun();
    const result = importSfx({ src: ws.src, out: ws.out, run });
    assert.equal(result.exitCode, 0);
    const oggs = readdirSync(ws.out).filter((f) => f.endsWith('.ogg'));
    assert.equal(oggs.length, 3);
    assert.ok(oggs.every((f) => /^(victory|shuffle-[12])\.[0-9a-f]{8}\.ogg$/.test(f)), oggs.join());
    const manifest = JSON.parse(readFileSync(join(ws.out, 'manifest.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.cues), ['shuffle', 'victory']);
    assert.equal(manifest.cues.shuffle.files.length, 2);
    assert.deepEqual([manifest.cues.victory.dur, manifest.cues.victory.channels, manifest.cues.victory.lufs], [1.235, 2, -23.4]);
    assert.deepEqual(manifest.cues.victory.peaks, [250]);
  } finally {
    ws.cleanup();
  }
});

test('row 15: a re-run is deterministic, skips existing files and removes stale ones', () => {
  const ws = workspace(FILES);
  try {
    const first = importSfx({ src: ws.src, out: ws.out, run: fakeRun().run });
    const manifestBefore = readFileSync(join(ws.out, 'manifest.json'), 'utf8');
    writeFileSync(join(ws.out, 'gone.deadbeef.ogg'), 'old');
    writeFileSync(join(ws.out, 'half.cafe.ogg.part'), 'old');

    const again = fakeRun();
    const second = importSfx({ src: ws.src, out: ws.out, run: again.run });
    assert.equal(second.written.length, 0);
    assert.equal(again.calls.filter(([cmd, ...a]) => cmd === 'ffmpeg' && a.includes('-c:a')).length, 0);
    assert.deepEqual(second.removed, ['gone.deadbeef.ogg', 'half.cafe.ogg.part']);
    assert.equal(readFileSync(join(ws.out, 'manifest.json'), 'utf8'), manifestBefore);
    assert.deepEqual(readdirSync(ws.out).sort(), [...first.manifest.cues.shuffle.files, ...first.manifest.cues.victory.files, 'manifest.json'].sort());

    writeFileSync(join(ws.src, 'sfx_rain_victory.wav'), 'changed-bytes');
    const changed = importSfx({ src: ws.src, out: ws.out, run: fakeRun().run });
    assert.equal(changed.written.length, 1);
    assert.equal(changed.removed.length, 1);
  } finally {
    ws.cleanup();
  }
});

test('--check reports drift without writing, and passes when in sync', () => {
  const ws = workspace(FILES);
  try {
    const drift = importSfx({ src: ws.src, out: ws.out, check: true, run: fakeRun().run });
    assert.equal(drift.exitCode, 1);
    assert.equal(drift.messages.filter((m) => m.startsWith('missing ')).length, 3);
    assert.equal(existsSync(ws.out), false);

    importSfx({ src: ws.src, out: ws.out, run: fakeRun().run });
    assert.equal(importSfx({ src: ws.src, out: ws.out, check: true, run: fakeRun().run }).exitCode, 0);
  } finally {
    ws.cleanup();
  }
});

test('an encoder failure exits 1 and leaves no partial file', () => {
  const ws = workspace(FILES);
  try {
    const result = importSfx({ src: ws.src, out: ws.out, run: fakeRun({ failEncodeOn: 'sfx_rain_victory.wav' }).run });
    assert.equal(result.exitCode, 1);
    assert.match(result.messages[0], /encoder exploded/);
    assert.equal(readdirSync(ws.out).some((f) => f.endsWith('.part')), false);
  } finally {
    ws.cleanup();
  }
});

test('a missing source directory exits 1', () => {
  const result = importSfx({ src: join(tmpdir(), 'sfx-no-such-dir-064'), run: fakeRun().run });
  assert.equal(result.exitCode, 1);
  assert.match(result.messages[0], /does not exist/);
});
