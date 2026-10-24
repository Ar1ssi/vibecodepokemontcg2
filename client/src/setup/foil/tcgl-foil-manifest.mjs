// TCG Live card foil manifest (design 069): which of our cards wear the game's own foil, and with which
// shader, material and per-card textures. Pure — shared by the client and the importer (no DOM, no three).
//   manifest.json: { v: 1, uv, shaders: [name], materials: [name],
//                    cards: { key: [tcglId, shaderIdx, materialIdx, front, etch, wp, cf, cc] }, flat: [key],
//                    reverse: { key: [same row, for the reverse-holo printing (TCG Live MaterialManifest_ph)] } }

export const FOIL_MANIFEST_VERSION = 1;
// manifest.json, shaders.json and materials.json are in git and always served by our server from here. The
// textures (~4.7 GB) are not: they live under a texture base the server names (/api/tcgl-foil/config) — an
// object-storage URL in production, or this same folder when a developer has imported them locally.
export const FOIL_ASSET_ROOT = '/src/assets/tcgl-foil';

// TCG Live's card mesh samples the card from this window of the square 1024² front (WebApp foil.js).
export const DEFAULT_FOIL_UV = Object.freeze({ u0: 0.142107, u1: 0.857893, v0: 0, v1: 1 });

/**
 * One key per printed card, independent of zero-padding and case: `sv01-012` → `sv01-12`,
 * `swsh12.5-GG01` → `swsh12.5-gg1`. Null for a falsy id or one without a `-`.
 */
export function normalizeCardKey(id) {
  if (!id) return null;
  const lower = String(id).trim().toLowerCase();
  const dash = lower.lastIndexOf('-');
  if (dash <= 0 || dash === lower.length - 1) return null;
  const set = lower.slice(0, dash);
  const local = lower.slice(dash + 1).replace(/^([a-z]*)0+(?=\d)/, '$1');
  return `${set}-${local}`;
}

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

/** @returns {{uv: object, records: Map<string, object>, flat: Set<string>}} — throws on a malformed manifest. */
export function parseFoilManifest(json) {
  if (!json || typeof json !== 'object') throw new Error('foil manifest: not an object');
  if (json.v !== FOIL_MANIFEST_VERSION) throw new Error(`foil manifest: unsupported version ${json.v}`);
  const shaders = Array.isArray(json.shaders) ? json.shaders : [];
  const materials = Array.isArray(json.materials) ? json.materials : [];
  const readRecords = (rows) => {
    const records = new Map();
    for (const [key, row] of Object.entries(rows && typeof rows === 'object' ? rows : {})) {
      if (!Array.isArray(row)) continue;
      const [tcglId, shaderIdx, materialIdx, front, etch, wp, cf, cc] = row;
      const shader = shaders[shaderIdx];
      const material = materials[materialIdx];
      if (!isNonEmptyString(shader) || !isNonEmptyString(material) || !isNonEmptyString(front)) continue;
      records.set(key, {
        tcglId: String(tcglId ?? ''),
        shader,
        material,
        front,
        etch: isNonEmptyString(etch) ? etch : null,
        wp: isNonEmptyString(wp) ? wp : null,
        cf: isNonEmptyString(cf) ? cf : null,
        cc: isNonEmptyString(cc) ? cc : null,
      });
    }
    return records;
  };
  const records = readRecords(json.cards);
  const reverse = readRecords(json.reverse);
  const flat = new Set((Array.isArray(json.flat) ? json.flat : []).filter(isNonEmptyString));
  const uv = json.uv && Number.isFinite(json.uv.u0) ? { ...json.uv } : { ...DEFAULT_FOIL_UV };
  return { uv, records, flat, reverse };
}

/** The base printing's foil record, or with `reverse` the reverse-holo printing's; null when there is none. */
export function foilRecordFor(parsed, cardId, { reverse = false } = {}) {
  const key = normalizeCardKey(cardId);
  if (!parsed || !key) return null;
  return (reverse ? parsed.reverse : parsed.records)?.get(key) ?? null;
}

/**
 * Base printing: 'foil' — TCG Live foils it; 'flat' — TCG Live prints it without foil; null — not covered.
 * Reverse-holo printing (`reverse`): 'foil' when TCG Live has it, else null (the card keeps the CSS reverse holo).
 */
export function foilCoverage(parsed, cardId, { reverse = false } = {}) {
  const key = normalizeCardKey(cardId);
  if (!parsed || !key) return null;
  if (reverse) return parsed.reverse?.has(key) ? 'foil' : null;
  if (parsed.records.has(key)) return 'foil';
  if (parsed.flat.has(key)) return 'flat';
  return null;
}

/** URL of a card texture by its Unity name; the folder is the TCG Live set (the name up to its first `_`). */
export function textureUrl(texName, base = FOIL_ASSET_ROOT) {
  if (!isNonEmptyString(texName) || !/^[a-z0-9-]+_[a-z0-9_-]+$/i.test(texName)) return null;
  const set = texName.slice(0, texName.indexOf('_'));
  return `${base}/cards/${set}/${texName}.webp`;
}

// ── custom sets (design 075 + I271): a set folder carries its own foil.json and the card textures next to it, so
// they need no TCG Live extract or object storage. foil.json: { v: 1, cards: { "<localId>": { tcgl?, shader,
// material, front, etch?, wp?, cf?, cc? } } } — front/etch/wp/cf are `.webp` files in `<set>/foil/`, cc names a
// pattern in materials.json. The shaders and shared material textures still come from the texture host.
export const CUSTOM_FOIL_VERSION = 1;
const CUSTOM_SET_ID = /^[a-z0-9][a-z0-9-]*$/;
const CUSTOM_TEXTURE_FILE = /^[a-z0-9][a-z0-9._-]*\.webp$/i;

export const CUSTOM_ASSET_ROOT = '/src/assets/custom-sets';

/** URL of a custom card texture: `dir` is the record's folder, `file` a `.webp` name from foil.json. */
export function customTextureUrl(dir, file) {
  if (!isNonEmptyString(dir) || !CUSTOM_TEXTURE_FILE.test(file ?? '')) return null;
  return `${dir}/${file}`;
}

/** The URL of a card texture for either kind of record: custom records carry a `dir`, TCG Live ones a base. */
export const recordTextureUrl = (record, texName, base) =>
  record.dir ? customTextureUrl(record.dir, texName) : textureUrl(texName, base);

/**
 * One custom set's foil.json → Map of normalized card key → record (same shape parseFoilManifest builds, plus the
 * `dir` its textures live in). Rows without a shader, material or front texture are skipped.
 */
export function parseCustomFoil(setId, json) {
  const records = new Map();
  if (!CUSTOM_SET_ID.test(setId ?? '')) throw new Error(`custom foil: bad set id ${setId}`);
  if (!json || typeof json !== 'object') throw new Error('custom foil: not an object');
  if (json.v !== CUSTOM_FOIL_VERSION) throw new Error(`custom foil: unsupported version ${json.v}`);
  const dir = `${CUSTOM_ASSET_ROOT}/${setId}/foil`;
  const file = (value) => (customTextureUrl(dir, value) ? value : null);
  for (const [localId, row] of Object.entries(json.cards && typeof json.cards === 'object' ? json.cards : {})) {
    const key = normalizeCardKey(`${setId}-${localId}`);
    if (!key || !row || typeof row !== 'object') continue;
    if (!isNonEmptyString(row.shader) || !isNonEmptyString(row.material) || !file(row.front)) continue;
    records.set(key, {
      tcglId: String(row.tcgl ?? ''),
      shader: row.shader,
      material: row.material,
      front: row.front,
      etch: file(row.etch),
      wp: file(row.wp),
      cf: file(row.cf),
      cc: isNonEmptyString(row.cc) ? row.cc : null,
      dir,
    });
  }
  return records;
}

/** Adds custom records to a parsed manifest's base printings (a custom id never collides with a printed one). */
export function mergeCustomFoil(parsed, records) {
  for (const [key, record] of records) parsed.records.set(key, record);
  return parsed;
}

/** URL of a shared material texture from its materials.json path (`tex/<name>.webp`, relative to the base). */
export function materialTextureUrl(relativePath, base = FOIL_ASSET_ROOT) {
  if (!isNonEmptyString(relativePath) || !/^tex\/[a-z0-9_-]+\.webp$/i.test(relativePath)) return null;
  return `${base}/${relativePath}`;
}
