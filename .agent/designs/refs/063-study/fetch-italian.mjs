// Fill pass: for every move whose manifest entry has no sprite-era reference, look the move up on
// Pokémon Central (wiki.pokemoncentral.it), which hosts the Gen V animation as an APNG named
// `<Nome>5.png` (older pixel gens as `<Nome>4.png`, `<Nome>3.png`). Italian names come from PokéAPI.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const ROOT = path.resolve('moves');
const MANIFEST = path.join(ROOT, 'manifest.json');
const SHEET_FRAMES = 30;
const SHEET_COLS = 6;
const GEN_PREF = ['5', '4', '3'];

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const save = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));

const curl = (url, out = null) => {
  const args = ['-sS', '-L', '--fail', '-m', '120', '-A', UA];
  if (out) args.push('-o', out);
  args.push(url);
  return execFileSync('curl', args, { encoding: out ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
};
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const probe = (file) => {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height,avg_frame_rate', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  ).trim();
  const [width, height, rate, frames] = out.split(',');
  const [num, den] = rate.split('/').map(Number);
  return { width: Number(width), height: Number(height), fps: den ? num / den : num, frames: Number(frames) };
};

const sheet = (media, out, { from, to, tileWidth }) => {
  const span = Math.max(1, to - from);
  const step = Math.max(1, Math.ceil(span / SHEET_FRAMES));
  const shown = Math.min(SHEET_FRAMES, Math.ceil(span / step));
  const rows = Math.max(1, Math.ceil(shown / SHEET_COLS));
  const label = `,drawtext=text='%{eif\\:n*${step}+${from}\\:d}':x=4:y=4:fontsize=18:fontcolor=white:borderw=2:bordercolor=black`;
  const vf = `select='between(n\\,${from}\\,${to - 1})*not(mod(n-${from}\\,${step}))',scale=${tileWidth}:-1:flags=neighbor,setpts=N/FRAME_RATE/TB${label},tile=${SHEET_COLS}x${rows}:padding=4:color=white`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', media, '-vsync', '0', '-vf', vf, '-frames:v', '1', out], { stdio: ['ignore', 'pipe', 'pipe'] });
  return path.basename(out);
};

const sheetsFor = (media, dir, prefix, tileWidth) => {
  const info = probe(media);
  const durationMs = Math.round((info.frames / info.fps) * 1000);
  const sheets = [];
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

const letters = (s) => decodeURIComponent(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const findItalian = (html, nome) => {
  const want = letters(nome);
  const found = new Map();
  for (const m of html.matchAll(/https:\/\/media\.pokemoncentral\.it\/wiki\/[0-9a-f]\/[0-9a-f]{2}\/([^"' ]+?)\.(png|gif)/g)) {
    const [href, name] = m;
    const n = letters(name);
    if (!n.startsWith(want)) continue;
    const tail = n.slice(want.length);
    const tag = tail.match(/^(\d)(\d*)$/);
    if (!tag) continue;
    const gen = tag[1];
    const variant = tag[2] || '';
    const key = gen;
    if (!found.has(key) || (variant === '' && found.get(key).variant !== '')) found.set(key, { href, variant });
  }
  for (const gen of GEN_PREF) if (found.has(gen)) return { gen: `IT${gen}`, href: found.get(gen).href };
  return null;
};

const targets = Object.values(manifest).filter((e) => e.status === 'ok' && !e.sprite);
console.log(`${targets.length} moves without a sprite reference`);
for (const entry of targets) {
  const dir = path.join(ROOT, entry.slug);
  try {
    const json = JSON.parse(curl(`https://pokeapi.co/api/v2/move/${entry.slug}`));
    const it = json.names.find((n) => n.language.name === 'it')?.name;
    sleep(250);
    if (!it) throw new Error('no Italian name');
    entry.it = it;
    const page = `https://wiki.pokemoncentral.it/${encodeURIComponent(it.replace(/ /g, '_'))}`;
    const html = curl(page);
    sleep(250);
    const hit = findItalian(html, it);
    if (!hit) {
      entry.italianPage = page;
      entry.italianNote = 'no Gen 3–5 animation on Pokémon Central';
      console.log(`${entry.slug}: ${it} -> none`);
      save();
      continue;
    }
    const ext = hit.href.split('.').pop();
    const file = path.join(dir, `${entry.slug}_${hit.gen}.${ext}`);
    rmSync(file, { force: true });
    curl(hit.href, file);
    sleep(250);
    entry.sprite = { gen: hit.gen, source: hit.href, ...sheetsFor(file, dir, 'sprite', 256) };
    entry.italianPage = page;
    console.log(`${entry.slug}: ${it} -> ${hit.gen} ${entry.sprite.frames}f/${entry.sprite.durationMs}ms`);
  } catch (err) {
    entry.italianNote = String(err.message || err).slice(0, 160);
    console.log(`${entry.slug}: ERROR ${entry.italianNote}`);
  }
  save();
}
const still = Object.values(manifest).filter((e) => e.status === 'ok' && !e.sprite).map((e) => e.slug);
console.log('done; still no sprite:', still.join(', ') || 'none');
