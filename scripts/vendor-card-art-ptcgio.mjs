// Vendors card fronts for sets TCGdex has no image for (sm3.5 Shining Legends, swsh4.5sv Shining Fates
// Shiny Vault) from the pokemontcg.io API/CDN into client/src/assets/card-art/<series>/<set>/<localId>/
// {high,low}.webp, the layout shared/tcgdex/card-art.mjs serves. Existing files are kept (sm3.5 69–70 are
// TCG Live art). Needs ImageMagick `convert`. Usage: node scripts/vendor-card-art-ptcgio.mjs [tcgdexSetId...]
import { execFile } from 'node:child_process';
import { mkdir, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/src/assets/card-art');

// TCGdex set id → pokemontcg.io set id + series folder (TCGdex asset layout)
const SETS = {
  'sm3.5': { ptcgio: 'sm35', series: 'sm' },
  'swsh4.5sv': { ptcgio: 'swsh45sv', series: 'swsh' },
};
const SIZES = [
  ['high', '600x839'],
  ['low', '245x343'],
];

async function fetchJson(url, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) return res.json();
    await new Promise((r) => setTimeout(r, 2000 * i)); // the API intermittently answers 5xx
  }
  throw new Error(`GET ${url} kept failing`);
}

async function exists(file) {
  return access(file).then(
    () => true,
    () => false
  );
}

async function vendorSet(tcgdexId) {
  const { ptcgio, series } = SETS[tcgdexId];
  const { data } = await fetchJson(
    `https://api.pokemontcg.io/v2/cards?q=set.id:${ptcgio}&pageSize=250&select=id,number,images`
  );
  let written = 0;
  for (const card of data) {
    if (!/^[A-Za-z]*\d+$/.test(card.number)) continue; // 10a, 68a, 77a have no TCGdex record
    const localId = card.number;
    const dir = path.join(ROOT, series, tcgdexId, localId);
    if (await exists(path.join(dir, 'high.webp'))) continue;
    const source = card.images?.large;
    if (!source) throw new Error(`${card.id} has no image`);
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${source} → ${res.status}`);
    const png = path.join(tmpdir(), `vendor-${ptcgio}-${localId}.png`);
    await writeFile(png, Buffer.from(await res.arrayBuffer()));
    await mkdir(dir, { recursive: true });
    for (const [name, size] of SIZES) {
      await run('convert', [png, '-resize', `${size}!`, '-quality', '82', path.join(dir, `${name}.webp`)]);
    }
    await rm(png);
    written++;
  }
  console.log(`${tcgdexId}: ${written} new, ${data.length} on pokemontcg.io`);
}

const wanted = process.argv.slice(2);
for (const id of wanted.length ? wanted : Object.keys(SETS)) {
  if (!SETS[id]) throw new Error(`unknown set ${id}; known: ${Object.keys(SETS).join(', ')}`);
  await vendorSet(id);
}
