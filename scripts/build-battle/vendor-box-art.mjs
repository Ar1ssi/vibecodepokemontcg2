/**
 * Vendor every Build & Battle box's product render (Bulbapedia) and English booster fronts (Bulbapedia
 * or pokesymbols.com, whichever set is sharper) (design 055 § Every box's art) and write
 * `box-art.generated.mjs`.
 * Run: node scripts/build-battle/vendor-box-art.mjs   (needs network on first run; files are cached)
 *
 * Images are processed in Playwright's Chromium (already a devDependency), so no image library is
 * added: a booster JPG's white studio background is keyed out from the border, the pack is trimmed
 * and centred on the 780 : 1426 canvas the 3D pack is built for (never upscaled), and its crimped
 * seals and pinched sides are measured from the alpha for the pillow mesh. Renders are only
 * downscaled. The Mega Evolution renders share Phantasmal Flames's camera, so their front and left
 * faces are cut with its corners (box-textures.mjs) scaled to the render.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { BOX_FACE_TEXTURES } from '../../client/src/setup/deck-builder/core/build-battle/box-textures.mjs';
import { BOX_ART_SOURCES } from './box-art-sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT = join(ROOT, 'client');
const OUT_MODULE = join(CLIENT, 'src/setup/deck-builder/core/build-battle/box-art.generated.mjs');
const CACHE = process.env.ART_CACHE || join(tmpdir(), 'ptcg-box-art');
const USER_AGENT = 'PTCG-sim/1.0 (Build & Battle art vendoring)';

// A pack front narrower than this is too blurry to beat the procedural front (Ultra Prism's are 144 px).
export const MIN_PACK_WIDTH = 240;
export const PACK_MAX_WIDTH = 780;
export const PACK_ASPECT = 1426 / 780;
export const RENDER_MAX_HEIGHT = 1400;
export const FACE_MAX_HEIGHT = 1400;
// Phantasmal Flames's packs were vendored by design 052 under these names; they are kept.
const ME02_PACKS = ['charizard', 'gengar', 'heracross', 'lopunny'];
// Renders taken with Phantasmal Flames's camera (1428 × 1920; checked on an overlay of all five).
const ME_TEMPLATE = { width: 1428, height: 1920, referenceWidth: 1024 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function download(url) {
  mkdirSync(CACHE, { recursive: true });
  const path = join(CACHE, decodeURIComponent(url.split('/').pop()));
  if (existsSync(path)) return readFileSync(path);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) {
      const bytes = Buffer.from(await res.arrayBuffer());
      writeFileSync(path, bytes);
      await sleep(250);
      return bytes;
    }
    if (attempt === 3) throw new Error(`${res.status} ${url}`);
    await sleep(1500 * attempt);
  }
}

// ── In-page image work (Chromium OffscreenCanvas) ─────────────────────────────────────────────
const PAGE_HELPERS = () => {
  const decode = async (b64) => {
    const blob = await (await fetch(`data:application/octet-stream;base64,${b64}`)).blob();
    return createImageBitmap(blob);
  };
  const encode = async (canvas, quality) => {
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  const scaled = (source, width, height) => {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, height);
    return canvas;
  };
  // Flood the near-white studio background in from the border and make it transparent; the light
  // rim it leaves on the pack's edge fades with its whiteness.
  const keyBackground = (data, w, h) => {
    const isBackground = (i) => {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      return Math.min(r, g, b) >= 228 && Math.max(r, g, b) - Math.min(r, g, b) <= 24;
    };
    const keyed = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => {
      const p = y * w + x;
      if (keyed[p] || !isBackground(p * 4)) return;
      keyed[p] = 1;
      stack.push(p);
    };
    for (let x = 0; x < w; x += 1) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y += 1) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p - x) / w;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    for (let p = 0; p < w * h; p += 1) {
      if (keyed[p]) { data[p * 4 + 3] = 0; continue; }
      const x = p % w, y = (p - x) / w;
      const edge = (x > 0 && keyed[p - 1]) || (x < w - 1 && keyed[p + 1]) || (y > 0 && keyed[p - w]) || (y < h - 1 && keyed[p + w]);
      if (!edge) continue;
      const light = Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
      if (light > 200) data[p * 4 + 3] = Math.round(255 * Math.max(0, 255 - light) / 55);
    }
  };
  const hasTransparency = (data, w, h) => {
    for (let x = 0; x < w; x += 1) if (data[x * 4 + 3] < 250 || data[((h - 1) * w + x) * 4 + 3] < 250) return true;
    return false;
  };
  // A studio shot shows its white background beside the wrapper's pinched sides (the silver crimps
  // fill the corners); a flat crop has art at its side edges, and keying it would eat the
  // wrapper's own white edges. Both side edges must be white over the middle 40 % of the height.
  const whiteSides = (data, w, h) => {
    const white = (x, y) => {
      const i = (y * w + x) * 4;
      return Math.min(data[i], data[i + 1], data[i + 2]) >= 228;
    };
    const share = (x) => {
      let hits = 0;
      let total = 0;
      for (let y = Math.floor(h * 0.3); y < Math.floor(h * 0.7); y += 1) {
        total += 1;
        if (white(x, y)) hits += 1;
      }
      return hits / total;
    };
    return share(0) >= 0.8 && share(w - 1) >= 0.8;
  };
  const alphaBox = (data, w, h) => {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  };
  // Seals and pinched sides from the alpha: the body row at mid height gives the side inset; a column
  // halfway into that inset is opaque only across the full-width seals.
  const measureShape = (data, w, h) => {
    const opaque = (x, y) => data[(y * w + x) * 4 + 3] > 128;
    const mid = Math.floor(h / 2);
    let left = 0; while (left < w && !opaque(left, mid)) left += 1;
    let right = w - 1; while (right > 0 && !opaque(right, mid)) right -= 1;
    const inset = Math.min(left, w - 1 - right);
    if (inset < 4) return null;
    const x = Math.max(1, Math.floor(inset / 2));
    let y = 0; while (y < h && !opaque(x, y)) y += 1;
    while (y < h && opaque(x, y)) y += 1;
    const sealTop = y;
    let yb = h - 1; while (yb > 0 && !opaque(x, yb)) yb -= 1;
    while (yb > 0 && opaque(x, yb)) yb -= 1;
    const shape = {
      sealTopV: +(sealTop / h).toFixed(4),
      sealBottomV: +((yb + 1) / h).toFixed(4),
      bodyInsetU: +(inset / w).toFixed(4),
    };
    const sane = shape.sealTopV > 0.03 && shape.sealTopV < 0.2 && shape.sealBottomV > 0.8 && shape.sealBottomV < 0.97;
    return sane ? shape : null;
  };

  window.processBooster = async ({ b64, maxWidth, aspect }) => {
    const bitmap = await decode(b64);
    const w = bitmap.width, h = bitmap.height;
    const src = new OffscreenCanvas(w, h);
    const sctx = src.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(bitmap, 0, 0);
    const image = sctx.getImageData(0, 0, w, h);
    const keyed = !hasTransparency(image.data, w, h) && whiteSides(image.data, w, h);
    if (keyed) keyBackground(image.data, w, h);
    sctx.putImageData(image, 0, 0);
    const box = alphaBox(image.data, w, h);
    let width = box.width;
    let height = Math.round(width * aspect);
    if (height < box.height) { height = box.height; width = Math.round(height / aspect); }
    const scale = Math.min(1, maxWidth / width);
    const outW = Math.round(width * scale), outH = Math.round(height * scale);
    const out = new OffscreenCanvas(outW, outH);
    const octx = out.getContext('2d', { willReadFrequently: true });
    octx.imageSmoothingQuality = 'high';
    const dw = box.width * scale, dh = box.height * scale;
    octx.drawImage(src, box.x, box.y, box.width, box.height, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
    const shape = measureShape(octx.getImageData(0, 0, outW, outH).data, outW, outH);
    return { b64: await encode(out, 0.88), width: outW, height: outH, shape, keyed, sourceWidth: w };
  };

  window.processRender = async ({ b64, maxHeight }) => {
    const bitmap = await decode(b64);
    const scale = Math.min(1, maxHeight / bitmap.height);
    const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
    return {
      b64: await encode(scaled(bitmap, width, height), 0.86),
      width,
      height,
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
    };
  };

  window.cutFace = async ({ b64, crop, maxHeight }) => {
    const bitmap = await decode(b64);
    const scale = Math.min(1, maxHeight / crop.height);
    const width = Math.round(crop.width * scale), height = Math.round(crop.height * scale);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    return { b64: await encode(canvas, 0.88), width, height, scale };
  };
};

const writeAsset = (relative, b64) => {
  const path = join(CLIENT, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(b64, 'base64'));
};

const round = (value) => Math.round(value);

// A rerun may pick the other source for a set: its previous fronts go first.
function clearPackAssets(setId) {
  const dir = join(CLIENT, 'src/assets/build-battle/packs');
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(`${setId}-`) && name.endsWith('.webp')) rmSync(join(dir, name));
  }
}

async function vendorBox(page, key, source) {
  const entry = { render: null, packs: null, faces: null, note: null };
  const renderBytes = await download(source.render.url);
  const render = await page.evaluate((args) => window.processRender(args), {
    b64: renderBytes.toString('base64'),
    maxHeight: RENDER_MAX_HEIGHT,
  });
  const renderSrc = `src/assets/build-battle/boxes/${key}.webp`;
  writeAsset(renderSrc, render.b64);
  entry.render = { src: renderSrc, width: render.width, height: render.height, source: source.render.file };

  if (source.setId === 'me02') {
    entry.packs = ME02_PACKS.map((name) => {
      const booster = source.boosters.find((b) => b.key.endsWith(name === 'charizard' ? 'charizard-x' : name));
      return { key: name, src: `src/assets/build-battle/packs/me02-${name}.webp`, width: 780, height: 1426, shape: null, source: booster?.file ?? null };
    });
  } else {
    const candidates = [];
    for (const [site, list] of [['Bulbapedia', source.boosters], ['pokesymbols.com', source.pokesymbols || []]]) {
      if (!list.length) continue;
      const packs = [];
      for (const booster of list) {
        const bytes = await download(booster.url);
        const out = await page.evaluate((args) => window.processBooster(args), {
          b64: bytes.toString('base64'),
          maxWidth: PACK_MAX_WIDTH,
          aspect: PACK_ASPECT,
        });
        packs.push({ booster, out });
      }
      candidates.push({ site, packs, narrowest: Math.min(...packs.map((p) => p.out.sourceWidth)) });
    }
    // The source whose smallest wrapper is widest; Bulbapedia (listed first) wins a tie.
    const best = candidates.reduce((a, b) => (b.narrowest > a.narrowest ? b : a));
    clearPackAssets(source.setId);
    if (best.narrowest < MIN_PACK_WIDTH) {
      entry.note = `booster fronts are ${best.narrowest} px wide at best (${best.site}; < ${MIN_PACK_WIDTH}): procedural fronts`;
    } else {
      entry.packs = best.packs.map(({ booster, out }) => {
        const src = `src/assets/build-battle/packs/${source.setId}-${booster.key}.webp`;
        writeAsset(src, out.b64);
        const origin = best.site === 'Bulbapedia' ? booster.file : `${best.site}: ${booster.file}`;
        return { key: booster.key, src, width: out.width, height: out.height, shape: out.shape, source: origin };
      });
    }
  }

  // Phantasmal Flames keeps its design-052 faces; every other render on its camera gets them cut.
  const onTemplate =
    render.sourceWidth === ME_TEMPLATE.width && render.sourceHeight === ME_TEMPLATE.height && source.setId !== 'me02';
  if (onTemplate) {
    const k = ME_TEMPLATE.width / ME_TEMPLATE.referenceWidth;
    entry.faces = {};
    for (const [face, texture] of Object.entries(BOX_FACE_TEXTURES)) {
      const crop = {
        x: round(texture.cropInRender.x * k),
        y: round(texture.cropInRender.y * k),
        width: round(texture.cropInRender.width * k),
        height: round(texture.cropInRender.height * k),
      };
      const cut = await page.evaluate((args) => window.cutFace(args), {
        b64: renderBytes.toString('base64'),
        crop,
        maxHeight: FACE_MAX_HEIGHT,
      });
      const src = `src/assets/build-battle/boxes/${key}-${face}.webp`;
      writeAsset(src, cut.b64);
      const s = k * cut.scale;
      entry.faces[face] = {
        src,
        cropInRender: { x: crop.x, y: crop.y, width: cut.width, height: cut.height },
        quad: texture.quad.map(({ x, y }) => ({ x: round(x * s), y: round(y * s) })),
      };
    }
  }
  return entry;
}

const moduleText = (art) => `// Generated by scripts/build-battle/vendor-box-art.mjs from box-art-sources.mjs — do not edit.
// Every box's Bulbapedia product render and vendored booster fronts (design 055 § Every box's art).
// \`packs\` is null when the box keeps procedural pack fronts (see \`note\`); a pack's \`shape\` is its
// measured seals and side inset (null: the Phantasmal Flames defaults in pack3d.mjs). \`faces\`
// maps render crops onto the box cuboid (Mega Evolution camera only; null elsewhere).

const freeze = (value) => {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (!value || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, freeze(v)])));
};
const freezeList = (list) => (list ? freeze(list) : null);

export const BOX_ART = Object.freeze({
${Object.entries(art)
  .map(
    ([key, entry]) => `  ${JSON.stringify(key)}: Object.freeze({
    render: freeze(${JSON.stringify(entry.render)}),
    packs: freezeList(${JSON.stringify(entry.packs)}),
    faces: freeze(${JSON.stringify(entry.faces)}),
    note: ${JSON.stringify(entry.note)},
  }),`
  )
  .join('\n')}
});
`;

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>box art</title>');
    await page.evaluate(PAGE_HELPERS);
    const art = {};
    for (const [key, source] of Object.entries(BOX_ART_SOURCES)) {
      art[key] = await vendorBox(page, key, source);
      const e = art[key];
      console.log(
        key.padEnd(20),
        `render ${e.render.width}x${e.render.height}`,
        e.packs ? `packs ${e.packs.map((p) => `${p.width}${p.shape ? '' : '*'}`).join(' ')}` : `packs - (${e.note})`,
        e.faces ? 'faces' : ''
      );
    }
    writeFileSync(OUT_MODULE, moduleText(art));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
