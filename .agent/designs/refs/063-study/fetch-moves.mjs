// Reference pipeline: English move slug -> PokéAPI (French name, type, class, gen)
// -> Poképédia page -> (a) sprite-era animation GIF (N2B2, else NB) and (b) the newest 3D
// video (EV = Scarlet/Violet, else LPA/EB/USUL/SL/ROSA/XY/LGPE) -> contact sheets per move.
// Output under ./moves/<slug>/ plus moves/manifest.json. Videos are deleted after sheeting.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const ROOT = path.resolve('moves');
const MANIFEST = path.join(ROOT, 'manifest.json');
// FILL=1 re-processes entries that errored or have no sprite reference, with a wider sprite-era
// list (older pixel games, then the GameCube 3D games) so every move gets the closest reference.
const FILL = process.env.FILL === '1';
const SPRITE_GENS = (process.env.SPRITE_GENS || (FILL ? 'N2B2,NB,HGSS,Pt,DP,OA,E,RS,RFVF,Colo,XD,PBR' : 'N2B2,NB')).split(',');
const MODERN_GENS = ['EV', 'LPA', 'EB', 'USUL', 'SL', 'ROSA', 'XY', 'LGPE'];
const SHEET_FRAMES = 30;
const SHEET_COLS = 6;

const slugs = readFileSync('move-list.txt', 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith('#'));

mkdirSync(ROOT, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const save = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));

const curl = (url, out = null) => {
  const args = ['-sS', '-L', '--fail', '-m', '120', '-A', UA];
  if (out) args.push('-o', out);
  args.push(url);
  return execFileSync('curl', args, { encoding: out ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
};
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

let drawtext = false;
try {
  drawtext = /drawtext/.test(execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }));
} catch {}

const pokeapi = (slug) => {
  const json = JSON.parse(curl(`https://pokeapi.co/api/v2/move/${slug}`));
  const fr = json.names.find((n) => n.language.name === 'fr')?.name;
  const en = json.names.find((n) => n.language.name === 'en')?.name || slug;
  return { en, fr, type: json.type?.name, damageClass: json.damage_class?.name, generation: json.generation?.name, power: json.power };
};

// Poképédia page titles use the straight apostrophe; PokéAPI gives the curly one.
const nameVariants = (fr) => {
  const base = fr.replace(/ /g, '_');
  return [...new Set([base, base.replace(/’/g, "'"), base.replace(/'/g, '’')])];
};

const fetchPage = (fr) => {
  let lastErr = null;
  for (const title of nameVariants(fr)) {
    const url = `https://www.pokepedia.fr/${encodeURIComponent(title)}`;
    try {
      const html = curl(url);
      return { url, html, title };
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
  const byGen = new Map();
  for (const m of html.matchAll(/\/images\/(?!thumb\/)[0-9a-f]\/[0-9a-f]{2}\/([^"' ]+?)_([A-Za-z0-9]+)\.(gif|png|webm|mp4)/g)) {
    const [href, name, gen] = m;
    if (norm(name) !== want) continue;
    if (!byGen.has(gen)) byGen.set(gen, href);
  }
  const pick = (gens) => {
    for (const gen of gens) if (byGen.has(gen)) return { gen, href: byGen.get(gen) };
    return null;
  };
  return { sprite: pick(SPRITE_GENS), modern: pick(MODERN_GENS), all: [...byGen.keys()] };
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
  return { width: Number(width), height: Number(height), fps, frames: Number(frames) };
};

const sheet = (media, out, { from, to, tileWidth }) => {
  const span = Math.max(1, to - from);
  const step = Math.max(1, Math.ceil(span / SHEET_FRAMES));
  const shown = Math.min(SHEET_FRAMES, Math.ceil(span / step));
  const rows = Math.max(1, Math.ceil(shown / SHEET_COLS));
  const label = drawtext ? `,drawtext=text='%{eif\\:n*${step}+${from}\\:d}':x=4:y=4:fontsize=18:fontcolor=white:borderw=2:bordercolor=black` : '';
  const vf = `select='between(n\\,${from}\\,${to - 1})*not(mod(n-${from}\\,${step}))',scale=${tileWidth}:-1:flags=neighbor,setpts=N/FRAME_RATE/TB${label},tile=${SHEET_COLS}x${rows}:padding=4:color=white`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', media, '-vsync', '0', '-vf', vf, '-frames:v', '1', out], { stdio: ['ignore', 'pipe', 'pipe'] });
  return path.basename(out);
};

const sheetsFor = (media, dir, prefix, tileWidth) => {
  const info = probe(media);
  const durationMs = Math.round((info.frames / info.fps) * 1000);
  const sheets = [];
  // Up to 3 sheets of 30 tiles: a 130-frame GIF is then sampled every other frame.
  const parts = Math.max(1, Math.min(3, Math.ceil(info.frames / SHEET_FRAMES)));
  const per = Math.ceil(info.frames / parts);
  for (let i = 0; i < parts; i += 1) {
    const from = i * per;
    const to = Math.min(info.frames, from + per);
    if (to <= from) break;
    sheets.push(sheet(media, path.join(dir, `${prefix}-${i + 1}.png`), { from, to, tileWidth }));
  }
  return { ...info, durationMs, sheets };
};

const grab = (hit, dir, slug, kind, tileWidth, keepMedia) => {
  if (!hit) return null;
  const ext = hit.href.split('.').pop();
  const file = path.join(dir, `${slug}_${hit.gen}.${ext}`);
  const source = `https://www.pokepedia.fr${hit.href}`;
  // A cut-off transfer leaves a short file ffprobe rejects: fetch again once, from scratch.
  let info = null;
  for (let attempt = 0; attempt < 2 && !info; attempt += 1) {
    if (!existsSync(file) || attempt > 0) {
      rmSync(file, { force: true });
      curl(source, file);
      sleep(250);
    }
    try {
      info = sheetsFor(file, dir, kind, tileWidth);
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  const result = { gen: hit.gen, source, ...info };
  if (!keepMedia) rmSync(file, { force: true });
  return result;
};

for (const slug of slugs) {
  const done = manifest[slug]?.status === 'ok';
  if (FILL ? done && manifest[slug].sprite : done) continue;
  const dir = path.join(ROOT, slug);
  mkdirSync(dir, { recursive: true });
  const entry = { slug, status: 'pending' };
  try {
    Object.assign(entry, pokeapi(slug));
    sleep(250);
    if (!entry.fr) throw new Error('no French name');
    const page = fetchPage(entry.fr);
    entry.page = page.url;
    sleep(250);
    const media = findMedia(page.html, page.title);
    entry.available = media.all;
    entry.sprite = grab(media.sprite, dir, slug, 'sprite', 256, true);
    entry.modern = grab(media.modern, dir, slug, 'modern', 320, true);
    entry.status = entry.sprite || entry.modern ? 'ok' : 'no-animation';
    const s = entry.sprite ? `${entry.sprite.gen} ${entry.sprite.frames}f/${entry.sprite.durationMs}ms` : 'no sprite';
    const m = entry.modern ? `${entry.modern.gen} ${entry.modern.frames}f/${entry.modern.durationMs}ms` : 'no modern';
    console.log(`${slug}: ${entry.fr} | ${s} | ${m}`);
  } catch (err) {
    entry.status = 'error';
    entry.error = String(err.message || err).slice(0, 200);
    console.log(`${slug}: ERROR ${entry.error}`);
  }
  manifest[slug] = entry;
  save();
}

const counts = Object.values(manifest).reduce((acc, e) => ((acc[e.status] = (acc[e.status] || 0) + 1), acc), {});
const noSprite = Object.values(manifest).filter((e) => e.status === 'ok' && !e.sprite).map((e) => e.slug);
const noModern = Object.values(manifest).filter((e) => e.status === 'ok' && !e.modern).map((e) => e.slug);
console.log('done', JSON.stringify(counts), 'no sprite:', noSprite.join(','), '| no modern:', noModern.join(','));
