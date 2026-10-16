import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three';

/**
 * Textures for the tabletop (design 073): image loading that never throws, and the canvas-made
 * surfaces no photo exists for (film crinkle, board, wood grain, card edges). Asset paths resolve
 * against the client root next to this module, so a static copy of `client/` works anywhere.
 */

export const CLIENT_ROOT = new URL('../../../../../', import.meta.url);

/** @returns {string} an absolute URL for a client-relative asset path ('src/assets/…'). */
export function assetUrl(path) {
  const value = String(path || '');
  if (/^(https?:|data:|blob:)/.test(value)) return value;
  return new URL(value.replace(/^\/+/, ''), CLIENT_ROOT).href;
}

const IMAGE_TIMEOUT_MS = 9000;

/**
 * @returns {Promise<HTMLImageElement|null>} the decoded image, or null on error or timeout.
 */
export function loadImage(url, { timeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    image.onload = () => {
      if (typeof image.decode === 'function') image.decode().then(() => finish(image), () => finish(image));
      else finish(image);
    };
    image.onerror = () => finish(null);
    image.src = url;
  });
}

/** Wraps a loaded image (or canvas) as a texture. */
export function imageTexture(source, renderer, { srgb = true, repeat = false, anisotropy = 8 } = {}) {
  const texture = new Texture(source);
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(anisotropy, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  texture.needsUpdate = true;
  return texture;
}

/** @returns {Promise<Texture|null>} */
export async function loadTexture(url, renderer, options) {
  const image = await loadImage(url, options);
  return image ? imageTexture(image, renderer, options) : null;
}

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** A texture drawn once on a canvas. */
export function canvasTexture(width, height, draw, renderer, { srgb = true, repeat = false } = {}) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height, canvas);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  texture.needsUpdate = true;
  return texture;
}

// ── Noise ──────────────────────────────────────────────────────────────────
/** A small seeded PRNG (mulberry32) for procedural drawing; never a pool draw. */
export function prng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise on a `period` × `period` lattice. */
export function valueNoise(x, y, period, seed = 1) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const wrap = (v) => ((v % period) + period) % period;
  const a = hash2(wrap(xi), wrap(yi), seed);
  const b = hash2(wrap(xi + 1), wrap(yi), seed);
  const c = hash2(wrap(xi), wrap(yi + 1), seed);
  const d = hash2(wrap(xi + 1), wrap(yi + 1), seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Tileable fractal noise in [0, 1]. */
export function fbm(x, y, period, octaves = 4, seed = 1) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * valueNoise(x * freq, y * freq, period * freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * A tangent-space normal map from a height field (Float32Array, w × h, wrapping), as a texture.
 */
export function normalTextureFromHeights(heights, w, h, strength, renderer, { repeat = true } = {}) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);
  const at = (x, y) => heights[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      image.data[i] = Math.round((-dx / len) * 127.5 + 127.5);
      image.data[i + 1] = Math.round((dy / len) * 127.5 + 127.5);
      image.data[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.wrapS = texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  texture.needsUpdate = true;
  return texture;
}

// ── Surfaces ───────────────────────────────────────────────────────────────
/**
 * Shrink-film crinkle: long shallow creases at random angles, denser near the edges of the tile
 * (the film gathers where it folds over a box edge, `refs/052-box-top.webp`).
 */
export function crinkleNormalTexture(renderer, { size = 512, seed = 7, creases = 70 } = {}) {
  const heights = new Float32Array(size * size);
  const rand = prng(seed);
  for (let c = 0; c < creases; c += 1) {
    const x0 = rand() * size;
    const y0 = rand() * size;
    const angle = rand() * Math.PI;
    const length = 30 + rand() * 160;
    const width = 1.5 + rand() * 4;
    const depth = (rand() - 0.5) * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const steps = Math.ceil(length);
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const fade = Math.sin(Math.PI * t);
      const cx = x0 + cos * (s - length / 2);
      const cy = y0 + sin * (s - length / 2);
      const r = Math.ceil(width * 2);
      for (let oy = -r; oy <= r; oy += 1) {
        for (let ox = -r; ox <= r; ox += 1) {
          const d = Math.abs(ox * -sin + oy * cos);
          if (d > width * 2) continue;
          const px = Math.round(cx + ox);
          const py = Math.round(cy + oy);
          const index = (((py % size) + size) % size) * size + (((px % size) + size) % size);
          heights[index] += (depth * fade * Math.exp(-(d * d) / (width * width))) / steps * 6;
        }
      }
    }
  }
  for (let i = 0; i < heights.length; i += 1) {
    const x = i % size;
    const y = Math.floor(i / size);
    heights[i] += (fbm(x / 64, y / 64, size / 64, 3, seed + 3) - 0.5) * 0.25;
  }
  return normalTextureFromHeights(heights, size, size, 3.2, renderer);
}

/** Unprinted paperboard: warm off-white with fibre mottling (the inside of the box). */
export function boardTexture(renderer, { size = 512, tint = [226, 222, 212], seed = 11 } = {}) {
  return canvasTexture(
    size,
    size,
    (ctx, w, h) => {
      const image = ctx.createImageData(w, h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const n = fbm(x / 48, y / 48, w / 48, 4, seed) - 0.5;
          const fibre = valueNoise(x / 2.5, y / 9, w / 2.5, seed + 5) - 0.5;
          const v = n * 18 + fibre * 7;
          const i = (y * w + x) * 4;
          image.data[i] = tint[0] + v;
          image.data[i + 1] = tint[1] + v;
          image.data[i + 2] = tint[2] + v * 0.9;
          image.data[i + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    },
    renderer,
    { repeat: true }
  );
}

/** The desk's wood tile in millimetres: three boards across, one board's length along. */
export const WOOD_TILE_MM = Object.freeze({ x: 1600, z: 400 });

/**
 * A plank desk top in satin walnut. Boards run along x; each is a flat-sawn slice through a log,
 * so its growth rings are the circles around the pith cut by the board's face: straight lines near
 * the board's edges that sweep into nested cathedral arches where the face nears the pith, the cut
 * drifting along the board. Pores fleck the grain, each board ends in a butt joint, and hairline
 * seams part the boards (the last falls on the tile's edge, hiding the wrap). Returns the colour
 * map and a matching normal map; one tile covers `WOOD_TILE_MM`.
 */
export function woodTextures(renderer, { width = 1024, height = 512, seed = 23 } = {}) {
  const heights = new Float32Array(width * height);
  const mmX = WOOD_TILE_MM.x / width;
  const mmZ = WOOD_TILE_MM.z / height;
  const random = prng(seed);
  const edges = [0, 128, 266, WOOD_TILE_MM.z];
  const boards = edges.slice(1).map((to, k) => ({
    from: edges[k],
    to,
    joint: random() * WOOD_TILE_MM.x,
    pith: (random() - 0.5) * 50,
    depth: 48 + random() * 40,
    drift: 14 + random() * 18,
    ring: 3.4 + random() * 1.6,
    tint: 0.88 + random() * 0.22,
    seed: seed + 101 * (k + 1),
  }));
  const dark = [40, 25, 17];
  const light = [134, 94, 63];
  const color = canvasTexture(
    width,
    height,
    (ctx, w, h) => {
      const image = ctx.createImageData(w, h);
      for (let y = 0; y < h; y += 1) {
        const z = (y + 0.5) * mmZ;
        const board = boards.find((b) => z < b.to) || boards[boards.length - 1];
        const across = z - (board.from + board.to) / 2 - board.pith;
        const toEdge = Math.min(z - board.from, board.to - z);
        for (let x = 0; x < w; x += 1) {
          const along = ((((x + 0.5) * mmX - board.joint) % WOOD_TILE_MM.x) + WOOD_TILE_MM.x) % WOOD_TILE_MM.x;
          const toJoint = Math.min(along, WOOD_TILE_MM.x - along);
          // Where the face cuts the rings: the board was sawn a little off the log's axis, so the
          // face's depth below the pith drifts steadily along it and the arches all point one way.
          const depth =
            board.depth + board.drift * (along / WOOD_TILE_MM.x) + 3 * Math.sin((along / WOOD_TILE_MM.x) * Math.PI * 4);
          const wobble =
            (fbm(x / 64, y / 14, w / 64, 3, board.seed) - 0.5) * 2.6 +
            (valueNoise(x / 8, y / 2, w / 8, board.seed + 5) - 0.5) * 0.35;
          const radius = Math.hypot(across, depth) + wobble;
          // Some years grew wider than others.
          const years = radius / board.ring + (valueNoise(radius / 9, 0.5, 4096, board.seed + 7) - 0.5) * 0.9;
          const f = years - Math.floor(years);
          const late = f ** 2.6;
          const pore = Math.max(0, valueNoise(x / 5, y / 0.8, w / 5, board.seed + 9) - 0.74) / 0.26;
          const shade = fbm(x / 256, y / 48, w / 256, 2, board.seed + 11);
          const gap = Math.min(1, Math.max(0, 1 - (toEdge - 0.25) / 0.6, 1 - (toJoint - 0.2) / 0.5));
          const tone = Math.min(1, Math.max(0, 0.6 - 0.42 * late + 0.22 * (shade - 0.5) - 0.3 * pore));
          const lit = (1 - gap * 0.85) * board.tint;
          const i = (y * w + x) * 4;
          image.data[i] = (dark[0] + (light[0] - dark[0]) * tone) * lit;
          image.data[i + 1] = (dark[1] + (light[1] - dark[1]) * tone) * lit;
          image.data[i + 2] = (dark[2] + (light[2] - dark[2]) * tone) * lit;
          image.data[i + 3] = 255;
          // Late wood stands a hair proud of the softer early wood; pores and seams are pits.
          const bevel = Math.max(0, 1 - toEdge / 1.6) + Math.max(0, 1 - toJoint / 1.2);
          heights[y * w + x] = late * 0.12 - pore * 0.35 - bevel * 0.8;
        }
      }
      ctx.putImageData(image, 0, 0);
    },
    renderer,
    { repeat: true }
  );
  const normal = normalTextureFromHeights(heights, width, height, 1.1, renderer);
  return { color, normal };
}

/** Neoprene mat cloth: a fine woven tooth, as a normal map. */
export function clothNormalTexture(renderer, { size = 256, seed = 31 } = {}) {
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const weave = Math.sin((x / size) * Math.PI * 96) * Math.sin((y / size) * Math.PI * 96);
      heights[y * size + x] = weave * 0.35 + (valueNoise(x / 1.7, y / 1.7, size / 1.7, seed) - 0.5) * 0.6;
    }
  }
  return normalTextureFromHeights(heights, size, size, 1.1, renderer);
}

/** The edge of a card: white board with the dark core layer through its middle. */
export function cardEdgeTexture(renderer) {
  return canvasTexture(
    4,
    16,
    (ctx, w, h) => {
      ctx.fillStyle = '#f2f1ec';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#24262c';
      ctx.fillRect(0, h * 0.42, w, h * 0.16);
    },
    renderer
  );
}

/** The side of a stack of `count` cards: thin light lines with dark cores between them. */
export function stackEdgeTexture(renderer, count = 40) {
  const rows = Math.max(1, count);
  return canvasTexture(
    8,
    rows * 8,
    (ctx, w, h) => {
      for (let r = 0; r < rows; r += 1) {
        const y = r * 8;
        ctx.fillStyle = '#ecebe5';
        ctx.fillRect(0, y, w, 8);
        ctx.fillStyle = '#2a2c33';
        ctx.fillRect(0, y + 3.4, w, 1.2);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, y + 7.2, w, 0.8);
      }
    },
    renderer
  );
}

/** A soft round shadow sprite for contact shadows under objects. */
export function contactShadowTexture(renderer) {
  return canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gradient.addColorStop(0, 'rgba(0,0,0,0.85)');
      gradient.addColorStop(0.45, 'rgba(0,0,0,0.45)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    },
    renderer,
    { srgb: false }
  );
}
