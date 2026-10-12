// Design 069: the committed foil JSON is consistent, and the imported textures (gitignored, on object storage)
// are complete and lossless. Texture checks skip on a checkout that has not run `pnpm foil:import`. Reads only
// file headers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materialTextureUrl, parseFoilManifest, textureUrl } from '../../../client/src/setup/foil/tcgl-foil-manifest.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ASSET_DIR = path.join(REPO_ROOT, 'client', 'src', 'assets', 'tcgl-foil');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ASSET_DIR, file), 'utf8'));
const urlToPath = (url) => path.join(REPO_ROOT, 'client', ...url.split('/').filter(Boolean));

const TEXTURES_SKIP = fs.existsSync(path.join(ASSET_DIR, 'tex')) ? false : 'textures not imported (pnpm foil:import)';
const manifestJson = readJson('manifest.json');
const manifest = parseFoilManifest(manifestJson);
const { shaders } = readJson('shaders.json');
const materials = readJson('materials.json');

const listWebp = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listWebp(full);
    return entry.name.endsWith('.webp') ? [full] : [];
  });

const readAt = (fd, position, length) => {
  const buffer = Buffer.alloc(length);
  const read = fs.readSync(fd, buffer, 0, length, position);
  return buffer.subarray(0, read);
};

/** WebP image chunk kind ('VP8L' lossless, 'VP8 ' lossy) and VP8L size, walking the RIFF chunk headers. */
function webpImageInfo(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const header = readAt(fd, 0, 12);
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WEBP') return { kind: null };
    const end = 8 + header.readUInt32LE(4);
    let offset = 12;
    while (offset + 8 <= end) {
      const chunk = readAt(fd, offset, 13);
      const fourcc = chunk.toString('ascii', 0, 4);
      if (fourcc === 'VP8 ') return { kind: fourcc };
      if (fourcc === 'VP8L') {
        // VP8L: signature 0x2f, then 14-bit width-1, 14-bit height-1 (little-endian bit stream)
        const bits = chunk.readUInt32LE(9);
        return { kind: fourcc, width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      const size = chunk.readUInt32LE(4);
      offset += 8 + size + (size % 2);
    }
    return { kind: null };
  } finally {
    fs.closeSync(fd);
  }
}

describe('TCG Live foil assets', () => {
  it('ships a manifest with thousands of foil cards', () => {
    assert.ok(manifest.records.size > 6000, `only ${manifest.records.size} foil cards`);
    assert.ok(manifest.flat.size > 7000, `only ${manifest.flat.size} flat cards`);
  });

  it('names only shaders and materials that exist', () => {
    for (const name of manifestJson.shaders) assert.ok(shaders[name], `shader ${name}`);
    for (const name of manifestJson.materials) assert.ok(materials.materials[name], `material ${name}`);
  });

  it('names material textures by base-relative tex/ paths', () => {
    const bad = Object.entries(materials.textures).filter(([, meta]) => !materialTextureUrl(meta.url));
    assert.deepEqual(bad.map(([name]) => name), []);
  });

  it('names only textures that exist', { skip: TEXTURES_SKIP }, () => {
    const missing = [];
    for (const [key, record] of manifest.records) {
      for (const texName of [record.front, record.etch, record.wp, record.cf].filter(Boolean)) {
        if (!fs.existsSync(urlToPath(textureUrl(texName)))) missing.push(`${key}: ${texName}`);
      }
      if (record.cc && !materials.textures[record.cc]) missing.push(`${key}: cc ${record.cc}`);
    }
    for (const [name, meta] of Object.entries(materials.textures)) {
      if (!fs.existsSync(urlToPath(materialTextureUrl(meta.url)))) missing.push(`material texture ${name}`);
    }
    assert.deepEqual(missing.slice(0, 20), []);
  });

  it('stores every texture as lossless WebP', { skip: TEXTURES_SKIP }, () => {
    const lossy = listWebp(ASSET_DIR).filter((file) => webpImageInfo(file).kind !== 'VP8L');
    assert.deepEqual(lossy.slice(0, 20).map((file) => path.relative(ASSET_DIR, file)), []);
  });

  it('keeps card fronts at the native 1024 x 1024', { skip: TEXTURES_SKIP }, () => {
    const resized = [];
    for (const record of manifest.records.values()) {
      const { width, height } = webpImageInfo(urlToPath(textureUrl(record.front)));
      if (width !== 1024 || height !== 1024) resized.push(`${record.front} ${width}x${height}`);
    }
    assert.deepEqual(resized.slice(0, 20), []);
  });
});
