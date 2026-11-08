/**
 * Vendors the Scarlet & Violet—151 booster front and Ultra-Premium Collection render that skin the Homebrew
 * Build & Battle opening (Bulbapedia Archives, found with the MediaWiki API on 2026-11-08:
 * `File:151 Booster.png`, 780 × 1429 RGBA; `File:151 Ultra-Premium Collection.jpg`, 3786 × 2670).
 * Run: node scripts/build-battle/vendor-homebrew-skin.mjs   (needs network on first run; files are cached)
 * Node's fetch gets a 403 from the archive host on some networks: seed ART_CACHE with the two files (curl
 * works) named as in the URLs and rerun.
 * Env: ART_CACHE (download cache) · CHROMIUM (a browser binary when Playwright's own is not installed)
 *
 * Both files are re-encoded as WebP in Chromium (no image library is added, as in vendor-box-art.mjs).
 * The booster is kept at its own size (never upscaled, alpha kept); the render is only downscaled.
 * The lid is the render's front panel cut out as it stands (the photo's perspective is left as shot).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'client/src/assets/build-battle/homebrew');
const CACHE = process.env.ART_CACHE || join(tmpdir(), 'ptcg-homebrew-skin');
const USER_AGENT = 'PTCG-sim/1.0 (Homebrew skin vendoring)';
const RENDER_MAX_HEIGHT = 1400;

export const HOMEBREW_SKIN_SOURCES = Object.freeze([
  {
    out: 'sv03.5-booster.webp',
    file: 'File:151 Booster.png',
    url: 'https://archives.bulbagarden.net/media/upload/2/24/151_Booster.png',
    maxHeight: null,
  },
  {
    out: 'sv03.5-ultra-premium.webp',
    file: 'File:151 Ultra-Premium Collection.jpg',
    url: 'https://archives.bulbagarden.net/media/upload/2/2e/151_Ultra-Premium_Collection.jpg',
    maxHeight: RENDER_MAX_HEIGHT,
  },
  {
    out: 'sv03.5-ultra-premium-lid.webp',
    file: 'File:151 Ultra-Premium Collection.jpg',
    url: 'https://archives.bulbagarden.net/media/upload/2/2e/151_Ultra-Premium_Collection.jpg',
    // The front panel in the 3786 × 2670 source, measured on a 2000-px preview of it.
    crop: { x: 322, y: 110, width: 3464, height: 2480 },
    maxHeight: 900,
  },
]);

async function download(url) {
  mkdirSync(CACHE, { recursive: true });
  const path = join(CACHE, decodeURIComponent(url.split('/').pop()));
  if (existsSync(path)) return readFileSync(path);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, bytes);
  return bytes;
}

const toWebp = async (page, bytes, maxHeight, crop) =>
  page.evaluate(
    async ({ base64, maxHeight: limit, crop: area }) => {
      const blob = await (await fetch(`data:application/octet-stream;base64,${base64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const from = area || { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
      const scale = limit && from.height > limit ? limit / from.height : 1;
      const width = Math.round(from.width * scale);
      const height = Math.round(from.height * scale);
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext('2d').drawImage(bitmap, from.x, from.y, from.width, from.height, 0, 0, width, height);
      const out = await canvas.convertToBlob({ type: 'image/webp', quality: 0.92 });
      const buffer = new Uint8Array(await out.arrayBuffer());
      let binary = '';
      for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
      return { base64: btoa(binary), width, height };
    },
    { base64: bytes.toString('base64'), maxHeight, crop: crop || null }
  );

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>homebrew skin</title>');
    for (const source of HOMEBREW_SKIN_SOURCES) {
      const { base64, width, height } = await toWebp(page, await download(source.url), source.maxHeight, source.crop);
      writeFileSync(join(OUT, source.out), Buffer.from(base64, 'base64'));
      console.log(source.out.padEnd(22), `${width}x${height}`, source.file);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) await main();
