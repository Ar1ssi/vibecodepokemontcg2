// Signature-move reference pipeline (design 065), adapted from refs/063-study/fetch-moves.mjs.
// move-list.txt line: `slug|French name|vg type|class` (the last three optional; they override
// PokéAPI, which may lack Legends Z-A moves). For each move: Poképédia page -> the Scarlet/Violet
// video (EV); else the newest 3D video (LPZA, LPA, EB, USUL, SL, ROSA, XY, LGPE); else the
// sprite-era GIF (N2B2, NB, then older) -> contact sheets in moves/<slug>/ + moves/manifest.json.
// Resumable: entries with status 'ok' are skipped. RETRY=1 re-runs entries that are not 'ok'.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const ROOT = path.resolve('moves');
const MANIFEST = path.join(ROOT, 'manifest.json');
const RETRY = process.env.RETRY === '1';
const MODERN_GENS = ['EV', 'LPZA', 'LPA', 'EB', 'USUL', 'SL', 'ROSA', 'XY', 'LGPE'];
const SPRITE_GENS = ['N2B2', 'NB', 'HGSS', 'Pt', 'DP', 'E', 'RS', 'Colo', 'XD', 'PBR'];
const SHEET_FRAMES = 30;
const SHEET_COLS = 6;
const MAX_SHEETS = 4;

const rows = readFileSync('move-list.txt', 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith('#'))
  .map((line) => {
    const [slug, fr = '', type = '', damageClass = ''] = line.split('|').map((s) => s.trim());
    return { slug, fr, type, damageClass };
  });

mkdirSync(ROOT, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const save = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));

// Poképédia cuts large transfers over HTTP/2; HTTP/1.1 completes them.
const curl = (url, out = null) => {
  const args = ['-sS', '-L', '--fail', '--http1.1', '-m', '180', '-A', UA];
  if (out) args.push('-o', out);
  args.push(url);
  return execFileSync('curl', args, { encoding: out ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
};
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const pokeapi = (slug) => {
  try {
    const json = JSON.parse(curl(`https://pokeapi.co/api/v2/move/${slug}`));
    return {
      en: json.names.find((n) => n.language.name === 'en')?.name || slug,
      fr: json.names.find((n) => n.language.name === 'fr')?.name || '',
      type: json.type?.name || '',
      damageClass: json.damage_class?.name || '',
      generation: json.generation?.name || '',
      power: json.power,
    };
  } catch {
    return { en: slug, fr: '', type: '', damageClass: '', generation: '', power: null };
  }
};

const nameVariants = (fr) => {
  const base = fr.replace(/ /g, '_');
  return [...new Set([base, base.replace(/’/g, "'"), base.replace(/'/g, '’')])];
};

const fetchPage = (fr) => {
  let lastErr = null;
  for (const title of nameVariants(fr)) {
    const url = `https://www.pokepedia.fr/${encodeURIComponent(title)}`;
    try {
      return { url, html: curl(url), title };
    } catch (err) {
      lastErr = err;
      sleep(200);
    }
  }
  throw lastErr || new Error('page not found');
};

const norm = (s) => decodeURIComponent(s).replace(/’/g, "'").toLowerCase();

const findMedia = (html, title) => {
  const want = norm(title);
  const videos = new Map();
  const sprites = new Map();
  const all = new Set();
  for (const m of html.matchAll(/\/images\/(?!thumb\/)[0-9a-f]\/[0-9a-f]{2}\/([^"' ]+?)_([A-Za-z0-9]+)\.(gif|png|webm|mp4)/g)) {
    const [href, name, gen, ext] = m;
    if (norm(name) !== want) continue;
    all.add(`${gen}.${ext}`);
    if (ext === 'mp4' || ext === 'webm') {
      if (!videos.has(gen)) videos.set(gen, href);
    } else if (ext === 'gif' && !sprites.has(gen)) {
      sprites.set(gen, href);
    }
  }
  const pick = (map, gens) => {
    for (const gen of gens) if (map.has(gen)) return { gen, href: map.get(gen) };
    return null;
  };
  return { modern: pick(videos, MODERN_GENS), sprite: pick(sprites, SPRITE_GENS), all: [...all].sort() };
};

const probe = (file) => {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height,avg_frame_rate', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  ).trim();
  const [width, height, rate, frames] = out.split(',');
  const [num, den] = rate.split('/').map(Number);
  const fps = den ? num / den : num;
  if (!(Number(frames) > 5)) throw new Error(`unreadable media (${frames} frames)`);
  return { width: Number(width), height: Number(height), fps: Math.round(fps * 100) / 100, frames: Number(frames) };
};

const sheet = (media, out, { from, to, tileWidth }) => {
  const span = Math.max(1, to - from);
  const step = Math.max(1, Math.ceil(span / SHEET_FRAMES));
  const shown = Math.min(SHEET_FRAMES, Math.ceil(span / step));
  const rowsN = Math.max(1, Math.ceil(shown / SHEET_COLS));
  const label = `,drawtext=text='%{eif\\:n*${step}+${from}\\:d}':x=4:y=4:fontsize=18:fontcolor=white:borderw=2:bordercolor=black`;
  const vf = `select='between(n\\,${from}\\,${to - 1})*not(mod(n-${from}\\,${step}))',scale=${tileWidth}:-1:flags=neighbor,setpts=N/FRAME_RATE/TB${label},tile=${SHEET_COLS}x${rowsN}:padding=4:color=white`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', media, '-vsync', '0', '-vf', vf, '-frames:v', '1', out], { stdio: ['ignore', 'pipe', 'pipe'] });
  return path.basename(out);
};

const sheetsFor = (media, dir, prefix, tileWidth) => {
  const info = probe(media);
  const durationMs = Math.round((info.frames / info.fps) * 1000);
  const parts = Math.max(1, Math.min(MAX_SHEETS, Math.ceil(info.frames / SHEET_FRAMES)));
  const per = Math.ceil(info.frames / parts);
  const sheets = [];
  for (let i = 0; i < parts; i += 1) {
    const from = i * per;
    const to = Math.min(info.frames, from + per);
    if (to <= from) break;
    sheets.push(sheet(media, path.join(dir, `${prefix}-${i + 1}.png`), { from, to, tileWidth }));
  }
  return { ...info, durationMs, sheets };
};

const grab = (hit, dir, slug, kind, tileWidth) => {
  if (!hit) return null;
  const ext = hit.href.split('.').pop();
  const file = path.join(dir, `${slug}_${hit.gen}.${ext}`);
  const source = `https://www.pokepedia.fr${hit.href}`;
  let info = null;
  for (let attempt = 0; attempt < 3 && !info; attempt += 1) {
    if (!existsSync(file) || attempt > 0) {
      rmSync(file, { force: true });
      curl(source, file);
      sleep(300);
    }
    try {
      info = sheetsFor(file, dir, kind, tileWidth);
    } catch (err) {
      if (attempt === 2) throw new Error(`${kind} ${hit.gen}: ${err.message} (${existsSync(file) ? statSync(file).size : 0} bytes)`);
    }
  }
  return { gen: hit.gen, source, file: path.basename(file), ...info };
};

for (const row of rows) {
  const prev = manifest[row.slug];
  if (prev?.status === 'ok') continue;
  if (prev && !RETRY) continue;
  const dir = path.join(ROOT, row.slug);
  mkdirSync(dir, { recursive: true });
  const api = pokeapi(row.slug);
  sleep(200);
  const entry = {
    slug: row.slug,
    en: api.en,
    fr: row.fr || api.fr,
    type: row.type || api.type,
    damageClass: row.damageClass || api.damageClass,
    generation: api.generation,
    power: api.power,
    status: 'pending',
  };
  try {
    if (!entry.fr) throw new Error('no French name (add it to move-list.txt)');
    const page = fetchPage(entry.fr);
    entry.page = page.url;
    sleep(250);
    const media = findMedia(page.html, page.title);
    entry.available = media.all;
    entry.modern = grab(media.modern, dir, row.slug, 'video', 320);
    entry.sprite = entry.modern ? null : grab(media.sprite, dir, row.slug, 'sprite', 256);
    entry.status = entry.modern || entry.sprite ? 'ok' : 'no-animation';
    const ref = entry.modern ? `video ${entry.modern.gen} ${entry.modern.frames}f/${entry.modern.durationMs}ms` : entry.sprite ? `sprite ${entry.sprite.gen} ${entry.sprite.frames}f` : 'none';
    console.log(`${row.slug}: ${entry.fr} | ${ref} | tags ${entry.available.join(' ')}`);
  } catch (err) {
    entry.status = 'error';
    entry.error = String(err.message || err).slice(0, 240);
    console.log(`${row.slug}: ERROR ${entry.error}`);
  }
  manifest[row.slug] = entry;
  save();
}

const all = Object.values(manifest);
const counts = all.reduce((acc, e) => ((acc[e.status] = (acc[e.status] || 0) + 1), acc), {});
const byGen = all.filter((e) => e.status === 'ok').reduce((acc, e) => {
  const g = e.modern ? e.modern.gen : `sprite:${e.sprite.gen}`;
  acc[g] = (acc[g] || 0) + 1;
  return acc;
}, {});
console.log('done', JSON.stringify(counts), 'refs', JSON.stringify(byGen));
console.log('not ok:', all.filter((e) => e.status !== 'ok').map((e) => `${e.slug}(${e.status})`).join(', ') || 'none');
