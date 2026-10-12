// TCG Live card foil manifest (design 069): which of our cards wear the game's own foil, and with which
// shader, material and per-card textures. Pure — shared by the client and the importer (no DOM, no three).
//   manifest.json: { v: 1, uv, shaders: [name], materials: [name],
//                    cards: { key: [tcglId, shaderIdx, materialIdx, front, etch, wp, cf, cc] }, flat: [key] }

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
  const records = new Map();
  for (const [key, row] of Object.entries(json.cards ?? {})) {
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
  const flat = new Set((Array.isArray(json.flat) ? json.flat : []).filter(isNonEmptyString));
  const uv = json.uv && Number.isFinite(json.uv.u0) ? { ...json.uv } : { ...DEFAULT_FOIL_UV };
  return { uv, records, flat };
}

export function foilRecordFor(parsed, cardId) {
  const key = normalizeCardKey(cardId);
  if (!parsed || !key) return null;
  return parsed.records.get(key) ?? null;
}

/** 'foil' — TCG Live foils it; 'flat' — TCG Live prints it without foil; null — not covered. */
export function foilCoverage(parsed, cardId) {
  const key = normalizeCardKey(cardId);
  if (!parsed || !key) return null;
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

/** URL of a shared material texture from its materials.json path (`tex/<name>.webp`, relative to the base). */
export function materialTextureUrl(relativePath, base = FOIL_ASSET_ROOT) {
  if (!isNonEmptyString(relativePath) || !/^tex\/[a-z0-9_-]+\.webp$/i.test(relativePath)) return null;
  return `${base}/${relativePath}`;
}
