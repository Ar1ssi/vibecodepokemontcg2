// Secondary reference (user, 2026-10-08): the Generation 7 video (USUL, else SL) for each move in
// moves/manifest.json, sheeted as moves/<slug>/gen7-<n>.png; recorded as manifest[slug].gen7.
// Resumable: entries that already have `gen7` (or `gen7: null` = none on Poképédia) are skipped.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const ROOT = path.resolve('moves');
const MANIFEST = path.join(ROOT, 'manifest.json');
const GEN7 = ['USUL', 'SL'];
const SHEET_FRAMES = 30;
const SHEET_COLS = 6;
const MAX_SHEETS = 4;

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const save = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const curl = (url, out = null) => {
  const args = ['-sS', '-L', '--fail', '--http1.1', '-m', '180', '-A', UA];
  if (out) args.push('-o', out);
  args.push(url);
  return execFileSync('curl', args, { encoding: out ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
};

const findGen7 = (html) => {
  const found = new Map();
  for (const m of html.matchAll(/\/images\/(?!thumb\/)[0-9a-f]\/[0-9a-f]{2}\/[^"' ]+?_(USUL|SL)\.mp4/g)) {
    if (!found.has(m[1])) found.set(m[1], m[0]);
  }
  for (const gen of GEN7) if (found.has(gen)) return { gen, href: found.get(gen) };
  return null;
};

const probe = (file) => {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,avg_frame_rate', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  ).trim();
  const [rate, frames] = out.split(',');
  const [num, den] = rate.split('/').map(Number);
  if (!(Number(frames) > 5)) throw new Error(`unreadable media (${frames} frames)`);
  return { fps: Math.round((den ? num / den : num) * 100) / 100, frames: Number(frames) };
};

const sheets = (media, dir) => {
  const info = probe(media);
  const parts = Math.max(1, Math.min(MAX_SHEETS, Math.ceil(info.frames / SHEET_FRAMES)));
  const per = Math.ceil(info.frames / parts);
  const names = [];
  for (let i = 0; i < parts; i += 1) {
    const from = i * per;
    const to = Math.min(info.frames, from + per);
    if (to <= from) break;
    const step = Math.max(1, Math.ceil((to - from) / SHEET_FRAMES));
    const rows = Math.max(1, Math.ceil(Math.min(SHEET_FRAMES, Math.ceil((to - from) / step)) / SHEET_COLS));
    const label = `,drawtext=text='%{eif\\:n*${step}+${from}\\:d}':x=4:y=4:fontsize=18:fontcolor=white:borderw=2:bordercolor=black`;
    const vf = `select='between(n\\,${from}\\,${to - 1})*not(mod(n-${from}\\,${step}))',scale=320:-1:flags=neighbor,setpts=N/FRAME_RATE/TB${label},tile=${SHEET_COLS}x${rows}:padding=4:color=white`;
    const out = path.join(dir, `gen7-${i + 1}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', media, '-vsync', '0', '-vf', vf, '-frames:v', '1', out], { stdio: ['ignore', 'pipe', 'pipe'] });
    names.push(path.basename(out));
  }
  return { ...info, durationMs: Math.round((info.frames / info.fps) * 1000), sheets: names };
};

for (const entry of Object.values(manifest)) {
  if ('gen7' in entry) continue;
  if (!entry.page) {
    entry.gen7 = null;
    continue;
  }
  const dir = path.join(ROOT, entry.slug);
  try {
    const hit = findGen7(curl(entry.page));
    sleep(250);
    if (!hit) {
      entry.gen7 = null;
      console.log(`${entry.slug}: no gen 7 video`);
    } else {
      const file = path.join(dir, `${entry.slug}_${hit.gen}.mp4`);
      let info = null;
      for (let attempt = 0; attempt < 3 && !info; attempt += 1) {
        rmSync(file, { force: true });
        curl(`https://www.pokepedia.fr${hit.href}`, file);
        sleep(300);
        try {
          info = sheets(file, dir);
        } catch (err) {
          if (attempt === 2) throw err;
        }
      }
      entry.gen7 = { gen: hit.gen, file: path.basename(file), ...info };
      console.log(`${entry.slug}: ${hit.gen} ${info.frames}f/${info.durationMs}ms`);
    }
  } catch (err) {
    console.log(`${entry.slug}: ERROR ${String(err.message || err).slice(0, 160)}`);
  }
  save();
}
const all = Object.values(manifest);
console.log('done', all.filter((e) => e.gen7).length, 'with gen 7 ·', all.filter((e) => e.gen7 === null).length, 'none ·', all.filter((e) => !('gen7' in e)).length, 'pending');
