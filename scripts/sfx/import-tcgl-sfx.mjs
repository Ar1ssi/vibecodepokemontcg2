/**
 * Design 064 § Contract: transcode the TCG Live battle SFX extract into the sampled-SFX assets the
 * client loads. The audio is The Pokémon Company's, so the output directory is gitignored: only
 * this importer and source-map.mjs are committed, and a clone without the extract plays the
 * synthesized palette.
 * Run: node scripts/sfx/import-tcgl-sfx.mjs --src <extract dir>          (writes assets + manifest)
 *      node scripts/sfx/import-tcgl-sfx.mjs --src <extract dir> --check  (exit 1 on drift, writes nothing)
 * Needs ffmpeg (with libopus) and ffprobe on PATH.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isExcluded, keyForFile } from './source-map.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_OUT_DIR = join(ROOT, 'client/src/assets/sfx');
export const MANIFEST_NAME = 'manifest.json';
export const MANIFEST_VERSION = 1;
export const REQUIRED_TOOLS = ['ffmpeg', 'ffprobe'];

/** Opus encode settings by channel count (design O2); part of the content hash. */
const ENCODE = { 1: { bitrate: '64k' }, 2: { bitrate: '96k' } };
const SAMPLE_RATE = 48000;
const SILENT_LUFS = -70;

/** @returns {{ src: string|null, out: string, check: boolean, error?: string }} */
export function parseArgs(argv, outDefault = DEFAULT_OUT_DIR) {
  const args = { src: null, out: outDefault, check: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--check') args.check = true;
    else if (flag === '--src' || flag === '--out') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) return { ...args, error: `${flag} needs a directory` };
      args[flag.slice(2)] = value;
    } else return { ...args, error: `unknown argument ${flag}` };
  }
  if (!args.src) return { ...args, error: '--src <extract dir> is required' };
  return args;
}

/** @returns {string[]} the tools from REQUIRED_TOOLS that cannot be run. */
export function missingTools(run) {
  return REQUIRED_TOOLS.filter((tool) => {
    const result = run(tool, ['-version']);
    return Boolean(result.error) || result.status !== 0;
  });
}

/** Content hash: source bytes plus the encode settings, so a re-import never serves stale audio. */
export function contentHash(bytes, channels) {
  const settings = `opus-${ENCODE[channels].bitrate}-${SAMPLE_RATE}-${channels}ch`;
  return createHash('sha256').update(bytes).update('\0').update(settings).digest('hex').slice(0, 8);
}

export function outputName(key, variant, hash) {
  return `${key}${variant === undefined ? '' : `-${variant}`}.${hash}.ogg`;
}

/** @returns {{ channels: number, dur: number }} from `ffprobe -of json -show_entries stream=channels:format=duration`. */
export function parseProbe(stdout) {
  const probe = JSON.parse(stdout);
  const channels = probe.streams?.[0]?.channels;
  const dur = Number(probe.format?.duration);
  if (!ENCODE[channels] || !Number.isFinite(dur)) throw new Error('ffprobe output has no usable channels/duration');
  return { channels, dur: Math.round(dur * 1000) / 1000 };
}

/** @returns {number} integrated loudness from ffmpeg's ebur128 summary; digital silence reads -70. */
export function parseLufs(stderr) {
  const matches = [...stderr.matchAll(/\bI:\s+(-?\d+(?:\.\d+)?|-inf)\s+LUFS/g)];
  if (!matches.length) throw new Error('ffmpeg ebur128 printed no integrated loudness');
  const value = matches[matches.length - 1][1];
  return value === '-inf' ? SILENT_LUFS : Number(value);
}

/**
 * Splits the extract's file names into mapped, deliberately excluded, and unknown.
 * Non-.wav entries are ignored.
 */
export function classifyFiles(names) {
  const mapped = [];
  const excluded = [];
  const unknown = [];
  for (const name of names.filter((n) => n.toLowerCase().endsWith('.wav')).sort()) {
    if (isExcluded(name)) excluded.push(name);
    else {
      const entry = keyForFile(name);
      if (entry) mapped.push({ name, ...entry });
      else unknown.push(name);
    }
  }
  return { mapped, excluded, unknown };
}

/**
 * Manifest cues from the per-file results. A cue with variants reports its longest duration, widest
 * channel count and mean loudness.
 * @param {{ key: string, variant?: number, file: string, dur: number, channels: number, lufs: number }[]} entries
 */
export function buildManifest(entries) {
  const byKey = new Map();
  for (const entry of entries) byKey.set(entry.key, [...(byKey.get(entry.key) ?? []), entry]);
  const cues = {};
  for (const key of [...byKey.keys()].sort()) {
    const group = byKey.get(key).sort((a, b) => (a.variant ?? 0) - (b.variant ?? 0));
    const lufs = group.reduce((sum, e) => sum + e.lufs, 0) / group.length;
    cues[key] = {
      files: group.map((e) => e.file),
      dur: Math.max(...group.map((e) => e.dur)),
      channels: Math.max(...group.map((e) => e.channels)),
      lufs: Math.round(lufs * 10) / 10,
    };
  }
  return { version: MANIFEST_VERSION, cues };
}

export function realRun(command, args) {
  return spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function failure(...messages) {
  return { exitCode: 1, messages, written: [], removed: [], manifest: null };
}

function probeAndMeasure(run, srcPath) {
  const probe = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=channels:format=duration', '-of', 'json', srcPath]);
  if (probe.status !== 0) throw new Error(`ffprobe failed on ${srcPath}: ${(probe.stderr || '').trim()}`);
  const loudness = run('ffmpeg', ['-hide_banner', '-nostats', '-i', srcPath, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']);
  if (loudness.status !== 0) throw new Error(`ffmpeg loudness pass failed on ${srcPath}: ${(loudness.stderr || '').trim()}`);
  return { ...parseProbe(probe.stdout), lufs: parseLufs(loudness.stderr) };
}

function transcode(run, srcPath, destPath, channels) {
  const partial = `${destPath}.part`;
  const args = [
    '-y', '-v', 'error', '-i', srcPath, '-map_metadata', '-1',
    '-c:a', 'libopus', '-b:a', ENCODE[channels].bitrate, '-ar', String(SAMPLE_RATE), '-ac', String(channels),
    '-f', 'ogg', partial,
  ];
  const result = run('ffmpeg', args);
  if (result.status !== 0) {
    rmSync(partial, { force: true });
    throw new Error(`ffmpeg failed on ${srcPath}: ${(result.stderr || '').trim()}`);
  }
  renameSync(partial, destPath);
}

/**
 * Imports (or with `check`, audits) the extract. Never throws on expected problems: returns
 * { exitCode, messages, written, removed, manifest } so the CLI and tests share one path.
 */
export function importSfx({ src, out = DEFAULT_OUT_DIR, check = false, run = realRun }) {
  const missing = missingTools(run);
  if (missing.length) return failure(`${missing.join(' and ')} not found on PATH (needed to import SFX)`);
  if (!existsSync(src)) return failure(`source directory ${src} does not exist`);

  const { mapped, unknown } = classifyFiles(readdirSync(src));
  if (unknown.length)
    return failure(`${unknown.length} file(s) are neither in SOURCE_MAP nor EXCLUDED; map them in scripts/sfx/source-map.mjs:`, ...unknown);

  const entries = [];
  const written = [];
  try {
    if (!check) mkdirSync(out, { recursive: true });
    for (const { name, key, variant } of mapped) {
      const srcPath = join(src, name);
      const measured = probeAndMeasure(run, srcPath);
      const file = outputName(key, variant, contentHash(readFileSync(srcPath), measured.channels));
      entries.push({ key, variant, file, ...measured });
      if (existsSync(join(out, file))) continue;
      written.push(file);
      if (!check) transcode(run, srcPath, join(out, file), measured.channels);
    }
  } catch (error) {
    return failure(error.message);
  }

  const manifest = buildManifest(entries);
  const wanted = new Set(entries.map((e) => e.file));
  const present = existsSync(out) ? readdirSync(out) : [];
  const removed = present.filter((f) => (f.endsWith('.ogg') && !wanted.has(f)) || f.endsWith('.part')).sort();
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = join(out, MANIFEST_NAME);
  const manifestStale = !existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestText;

  if (check) {
    const drift = [
      ...written.map((f) => `missing ${f}`),
      ...removed.map((f) => `stale ${f}`),
      ...(manifestStale ? [`${MANIFEST_NAME} out of date`] : []),
    ];
    return { exitCode: drift.length ? 1 : 0, messages: drift, written, removed, manifest };
  }

  for (const f of removed) rmSync(join(out, f), { force: true });
  if (manifestStale) writeFileSync(manifestPath, manifestText);
  return {
    exitCode: 0,
    messages: [`${Object.keys(manifest.cues).length} cues, ${entries.length} files (${written.length} new, ${removed.length} removed) -> ${out}`],
    written,
    removed,
    manifest,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`${args.error}\nusage: node scripts/sfx/import-tcgl-sfx.mjs --src <dir> [--out <dir>] [--check]`);
    process.exit(1);
  }
  const result = importSfx(args);
  for (const message of result.messages) (result.exitCode ? console.error : console.log)(message);
  process.exit(result.exitCode);
}
