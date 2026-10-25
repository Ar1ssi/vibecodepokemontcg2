// The three.js board's table (design 074 §D3 "Table"): the mat art on the flat table, a dark
// floor around it, and the lighting. Lives in the TABLE frame of board-layout.mjs (x right,
// y up the table, z off the cloth, 1 unit = 1 flat CSS px); board-scene.js tilts `group`.
// `three` is the namespace from `import('three')`; this module never imports it statically.
import { textureUrlFor } from '../gl/card-art-hosts.mjs';
import { artQuadFor, clipQuad, matBoxRect, matUvFor, nestRect, tableBounds } from './table-uv.mjs';

/** `.mat-half { background: #0a0a0c }` (index.css): what a letterboxed mat shows around its art. */
const BACKING_COLOR = 0x0a0a0c;
const FLOOR_SCALE = 2.2;
const ENVIRONMENT_INTENSITY = 0.6;
const LIGHT_INTENSITY = 1.4;
const SHADOW_MAP_PX = 2048;
/** Heights off the cloth: layers 0.5 px apart, well inside depth-buffer precision at ~1400 px. */
const Z = { floor: -2, backing: 0, ambient: 0.25, art: 0.5, overlay: 1 };
/** Program cache key of a material carrying a Stadium environment cutout (design 077). */
const CUTOUT_PROGRAM_KEY = 'stadium-env-cutout';
/**
 * `img.mat-ambient-image` (index.css): the art, cover-fitted to a box 124% of the half, scaled
 * 1.08, blurred 32px, darkened and saturated, at 0.75 opacity behind the letterboxed art.
 */
const AMBIENT = { zoom: 1.24 * 1.08, blurOfWidth: 32 / 1450, filter: 'brightness(0.4) saturate(1.4)', opacity: 0.75 };
const AMBIENT_RASTER_WIDTH = 256;
const HALVES = ['self', 'opp'];
const SLOTS = ['selfArt', 'oppArt', 'selfOverlay', 'oppOverlay'];

const positive = (value) => Number.isFinite(value) && value > 0;

/** Width an SVG mat overlay is rasterized at: an `<img>` of a viewBox-only SVG decodes tiny. */
const SVG_RASTER_WIDTH = 2048;

const isSvgUrl = (url) => {
  try {
    return new URL(url, globalThis.location?.href ?? 'http://localhost/').pathname.toLowerCase().endsWith('.svg');
  } catch {
    return false;
  }
};

/** viewBox aspect of an SVG document's text, or null. */
function svgAspect(text) {
  const match = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(text);
  const w = Number(match?.[1]);
  const h = Number(match?.[2]);
  return positive(w) && positive(h) ? w / h : null;
}

async function rasterizeSvg(three, url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`svg ${response.status}`);
  const text = await response.text();
  const aspect = svgAspect(text) ?? 2;
  const blobUrl = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = blobUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = SVG_RASTER_WIDTH;
    canvas.height = Math.round(SVG_RASTER_WIDTH / aspect);
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new three.CanvasTexture(canvas);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * A `createTextureCache` loader for mat textures: SVGs (the zone overlay) are rasterized at
 * 2048 px wide from their viewBox; everything else goes through three's TextureLoader (CORS).
 * @param {typeof import('three')} three
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {{ loadAsync: (url: string) => Promise<import('three').Texture> }}
 */
export function createMatTextureLoader(three, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  const images = new three.TextureLoader();
  images.setCrossOrigin('anonymous');
  return {
    loadAsync: (url) => (isSvgUrl(url) && fetchImpl ? rasterizeSvg(three, url, fetchImpl) : images.loadAsync(url)),
  };
}

/** The ambient backdrop of a mat image, pre-blurred on a small canvas; null if it cannot be drawn. */
function ambientTexture(three, image) {
  const w = image?.naturalWidth || image?.width;
  const h = image?.naturalHeight || image?.height;
  if (!positive(w) || !positive(h)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = AMBIENT_RASTER_WIDTH;
  canvas.height = Math.max(1, Math.round((AMBIENT_RASTER_WIDTH * h) / w));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.filter = `blur(${(AMBIENT.blurOfWidth * AMBIENT_RASTER_WIDTH).toFixed(1)}px) ${AMBIENT.filter}`;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

/** Radial vignette for the floor: lighter under the table, near black at the edges. */
function vignetteTexture(three) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(256, 256, 40, 256, 256, 256);
    gradient.addColorStop(0, '#20262e');
    gradient.addColorStop(0.55, '#0e1115');
    gradient.addColorStop(1, '#030405');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
  }
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

/** A unit quad whose UVs we rewrite; PlaneGeometry(1, 1) vertex order is TL, TR, BL, BR. */
function setQuadUv(geometry, { u0, v0, u1, v1 }) {
  const uv = geometry.getAttribute('uv');
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

/** Places a unit quad over the plane-fraction rect `rect` of a `w` × `h` half centred at its origin. */
function placeQuad(mesh, rect, w, h, z) {
  mesh.scale.set((rect.x1 - rect.x0) * w, (rect.y1 - rect.y0) * h, 1);
  mesh.position.set(((rect.x0 + rect.x1) / 2) * w - w / 2, ((rect.y0 + rect.y1) / 2) * h - h / 2, z);
}

const FULL_UV = { u0: 0, v0: 0, u1: 1, v1: 1 };

/** Normalises a `setMat` spec into per-half descriptions. */
function halvesFromSpec(spec) {
  const mode = spec?.mode === 'two-player' ? 'two-player' : 'one-player';
  const far = spec?.far || {};
  const near = {
    src: spec?.src || null,
    fit: spec?.fit || '100% 100%',
    imageAspect: spec?.imageAspect ?? null,
    boxAspect: spec?.boxAspect ?? null,
    overlaySrc: spec?.overlaySrc || null,
  };
  const farHalf = {
    src: mode === 'two-player' ? null : spec?.farSrc || null,
    fit: far.fit || near.fit,
    imageAspect: far.imageAspect ?? (spec?.farSrc && spec.farSrc !== near.src ? null : near.imageAspect),
    boxAspect: far.boxAspect ?? near.boxAspect,
    overlaySrc: mode === 'two-player' ? null : spec?.farOverlaySrc || null,
  };
  const scale = Number(spec?.scale);
  return { mode, flip: Boolean(spec?.flip), scale: positive(scale) ? scale : 1, self: near, opp: farHalf };
}

/**
 * @param {{ scene: import('three').Scene, textures: { acquire: Function, release: Function },
 *   three: typeof import('three'), renderer?: import('three').WebGLRenderer|null,
 *   RoomEnvironment?: Function|null }} deps
 *   `renderer` + `RoomEnvironment` give the scene its image-based light; without them the table is
 *   lit by the directional light only.
 * @returns {{ group: import('three').Group, light: import('three').DirectionalLight,
 *   setLayout: (layout: object) => void, setMat: (spec: object|null) => void,
 *   setCutout: (cutout: { glsl: string, uniforms: object }|null) => void,
 *   onChange: (fn: () => void) => void, dispose: () => void }}
 *   `setMat({ src, farSrc, mode: 'one-player'|'two-player', fit, imageAspect, boxAspect,
 *   overlaySrc, farOverlaySrc, far: { fit, imageAspect, boxAspect }, flip, scale })`: `src` is the near
 *   half's art (the whole table's for 'two-player', turned 180° when `flip`), `farSrc` the far
 *   half's, drawn rotated 180° like `.mat-half-opp`; `fit` is the profile's `matFit` inside the mat
 *   box of aspect `boxAspect`; overlays (the zone-outline svg) fill that box. `far` overrides the
 *   near half's fit/aspects for the far half; `scale` is `--mat-scale`. `onChange` fires when a
 *   texture lands.
 */
export function createTable({ scene, textures, three, renderer = null, RoomEnvironment = null }) {
  const group = new three.Group();
  group.name = 'board3d-table';
  scene.add(group);

  const disposables = [];
  const keep = (thing) => {
    disposables.push(thing);
    return thing;
  };

  const floorTexture = keep(vignetteTexture(three));
  const floor = new three.Mesh(
    keep(new three.PlaneGeometry(1, 1)),
    keep(new three.MeshStandardMaterial({ map: floorTexture, roughness: 1, metalness: 0 }))
  );
  floor.receiveShadow = true;
  floor.name = 'board3d-floor';
  group.add(floor);

  const makeHalf = (key) => {
    const halfGroup = new three.Group();
    halfGroup.name = `board3d-mat-${key}`;
    const backing = new three.Mesh(
      keep(new three.PlaneGeometry(1, 1)),
      keep(new three.MeshStandardMaterial({ color: BACKING_COLOR, roughness: 0.95, metalness: 0 }))
    );
    backing.receiveShadow = true;
    const ambient = new three.Mesh(
      keep(new three.PlaneGeometry(1, 1)),
      keep(new three.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: AMBIENT.opacity }))
    );
    ambient.visible = false;
    const artMaterial = keep(new three.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 }));
    const art = new three.Mesh(keep(new three.PlaneGeometry(1, 1)), artMaterial);
    art.receiveShadow = true;
    art.visible = false;
    const overlayMaterial = keep(
      new three.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, transparent: true })
    );
    const overlay = new three.Mesh(keep(new three.PlaneGeometry(1, 1)), overlayMaterial);
    overlay.receiveShadow = true;
    overlay.visible = false;
    halfGroup.add(backing, ambient, art, overlay);
    group.add(halfGroup);
    return { group: halfGroup, backing, ambient, art, overlay, ambientTexture: null };
  };
  const halves = { self: makeHalf('self'), opp: makeHalf('opp') };

  const light = new three.DirectionalLight(0xffffff, LIGHT_INTENSITY);
  light.name = 'board3d-key-light';
  // On every layer, so the attack-FX passes (design 075) see the same lights and lit board
  // materials keep their programs instead of rebuilding them each frame.
  light.layers.enableAll();
  light.castShadow = true;
  light.shadow.mapSize.set(SHADOW_MAP_PX, SHADOW_MAP_PX);
  light.shadow.bias = -0.0005;
  group.add(light, light.target);

  let environment = null;
  if (renderer && RoomEnvironment) {
    const pmrem = new three.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose?.();
    pmrem.dispose();
    scene.environment = environment;
    scene.environmentIntensity = ENVIRONMENT_INTENSITY;
  }

  let layout = null;
  let mat = halvesFromSpec(null);
  /** slot → { url, texture|null } currently held from the cache. */
  const held = new Map();
  const listeners = new Set();
  let disposed = false;

  const notify = () => {
    for (const fn of listeners) fn();
  };

  const halfSize = () => {
    const bounds = tableBounds(layout);
    const twoPlayer = mat.mode === 'two-player';
    return { bounds, w: bounds.w, h: twoPlayer ? bounds.h : bounds.h / 2 };
  };

  const textureAspect = (texture) => {
    const image = texture?.image;
    const w = image?.naturalWidth || image?.width;
    const h = image?.naturalHeight || image?.height;
    return positive(w) && positive(h) ? w / h : null;
  };

  /** Shows `mesh` over `quad` (clipped to the half), or hides it when it has nothing to show. */
  const showQuad = (mesh, quad, w, h, z, hasTexture) => {
    const clipped = quad ? clipQuad(quad) : null;
    mesh.visible = Boolean(hasTexture && clipped);
    if (!clipped) return;
    setQuadUv(mesh.geometry, clipped.uv);
    placeQuad(mesh, clipped.rect, w, h, z);
  };

  /** Fits one half's art and overlay quads to its plane, mat box and loaded image. */
  const fitHalf = (key) => {
    const parts = halves[key];
    const desc = mat[key];
    const { w, h } = halfSize();
    if (!(w > 0 && h > 0)) return;
    const artTexture = held.get(`${key}Art`)?.texture;
    // The loaded image is the truth; the spec's aspect (apply-mat-layout's last onload) may lag a swap.
    const imageAspect = textureAspect(artTexture) ?? (positive(desc.imageAspect) ? desc.imageAspect : null);
    // A one-player contain mat's box follows its art (mat-layouts.mjs withImageAspect).
    const followsArt = mat.mode === 'one-player' && desc.fit === 'contain' && positive(imageAspect);
    const box = matBoxRect({
      boxAspect: followsArt ? imageAspect : desc.boxAspect,
      planeAspect: w / h,
      scale: mat.scale,
    });
    const boxAspect = ((box.x1 - box.x0) * w) / ((box.y1 - box.y0) * h);
    const inBox = artQuadFor(matUvFor({ fit: desc.fit, imageAspect, planeAspect: boxAspect }));
    showQuad(parts.art, { rect: nestRect(box, inBox.rect), uv: inBox.uv }, w, h, Z.art, artTexture);

    const cover = matUvFor({ fit: 'cover', imageAspect, planeAspect: w / h });
    const shrink = (lo, hi) => [(lo + hi) / 2 - (hi - lo) / (2 * AMBIENT.zoom), (lo + hi) / 2 + (hi - lo) / (2 * AMBIENT.zoom)];
    const [au0, au1] = shrink(cover.u0, cover.u1);
    const [av0, av1] = shrink(cover.v0, cover.v1);
    const ambientQuad = { rect: { x0: 0, y0: 0, x1: 1, y1: 1 }, uv: { u0: au0, v0: av0, u1: au1, v1: av1 } };
    showQuad(parts.ambient, ambientQuad, w, h, Z.ambient, parts.ambientTexture && artTexture);

    const overlayTexture = held.get(`${key}Overlay`)?.texture;
    showQuad(parts.overlay, { rect: box, uv: FULL_UV }, w, h, Z.overlay, overlayTexture);
  };

  const placeGeometry = () => {
    const { bounds, w, h } = halfSize();
    if (!(bounds.w > 0 && bounds.h > 0)) return;
    const centre = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    const depth = bounds.h / 2;

    floor.scale.set(bounds.w * FLOOR_SCALE, bounds.h * FLOOR_SCALE, 1);
    floor.position.set(centre.x, centre.y, Z.floor);

    const twoPlayer = mat.mode === 'two-player';
    halves.self.group.position.set(centre.x, twoPlayer ? centre.y : depth / 2, 0);
    halves.self.group.rotation.z = twoPlayer && mat.flip ? Math.PI : 0;
    halves.opp.group.visible = !twoPlayer;
    halves.opp.group.position.set(centre.x, 1.5 * depth, 0);
    halves.opp.group.rotation.z = Math.PI;
    for (const key of HALVES) {
      halves[key].backing.scale.set(w, h, 1);
      halves[key].backing.position.set(0, 0, Z.backing);
      fitHalf(key);
    }

    // Key light from the far-left, high above the cloth; its shadow box spans the table.
    const reach = Math.hypot(bounds.w, bounds.h);
    light.position.set(bounds.x - 0.35 * bounds.w, bounds.y + 1.4 * bounds.h, 1.1 * reach);
    light.target.position.set(centre.x, centre.y, 0);
    const radius = (reach / 2) * 1.05;
    const distance = light.position.distanceTo(light.target.position);
    const camera = light.shadow.camera;
    camera.left = -radius;
    camera.right = radius;
    camera.top = radius;
    camera.bottom = -radius;
    camera.near = Math.max(1, distance - radius * 2);
    camera.far = distance + radius * 2;
    camera.updateProjectionMatrix();
  };

  const releaseSlot = (slot) => {
    const entry = held.get(slot);
    if (!entry) return;
    held.delete(slot);
    entry.released = true;
    textures.release(entry.url);
  };

  const materialFor = (slot) => {
    const key = slot.startsWith('self') ? 'self' : 'opp';
    return slot.endsWith('Art') ? halves[key].art.material : halves[key].overlay.material;
  };

  const assign = (slot, texture) => {
    const material = materialFor(slot);
    material.map = texture;
    material.needsUpdate = true;
    if (slot.endsWith('Art')) setAmbient(halves[slot.startsWith('self') ? 'self' : 'opp'], texture);
  };

  /** Rebuilds a half's ambient backdrop from its art (or clears it). */
  const setAmbient = (parts, texture) => {
    parts.ambientTexture?.dispose();
    parts.ambientTexture = texture ? ambientTexture(three, texture.image) : null;
    parts.ambient.material.map = parts.ambientTexture;
    parts.ambient.material.needsUpdate = true;
  };

  const wantedUrls = () => ({
    selfArt: mat.self.src,
    oppArt: mat.opp.src,
    selfOverlay: mat.self.overlaySrc,
    oppOverlay: mat.opp.overlaySrc,
  });

  const loadSlot = (slot, src) => {
    const url = textureUrlFor(src);
    const entry = { url, texture: null, released: false };
    held.set(slot, entry);
    textures.acquire(url, { colorSpace: 'srgb' }).then(
      (texture) => {
        // Superseded or disposed while loading: releaseSlot already gave the reference back.
        if (disposed || entry.released) return;
        if (renderer?.capabilities?.getMaxAnisotropy) texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        entry.texture = texture;
        assign(slot, texture);
        placeGeometry();
        notify();
      },
      (error) => {
        if (disposed || entry.released) return;
        // A failed load leaves nothing in the cache to release.
        held.delete(slot);
        console.warn(`board3d: mat texture failed (${url})`, error?.message || error);
        assign(slot, null);
        placeGeometry();
        notify();
      }
    );
  };

  const syncTextures = () => {
    const wanted = wantedUrls();
    for (const slot of SLOTS) {
      const src = wanted[slot];
      const current = held.get(slot);
      const url = src ? textureUrlFor(src) : null;
      if (current && current.url === url) continue;
      releaseSlot(slot);
      assign(slot, null);
      if (url) loadSlot(slot, src);
    }
  };

  const setLayout = (next) => {
    if (disposed || !next?.half) return;
    layout = next;
    placeGeometry();
  };

  const setMat = (spec) => {
    if (disposed) return;
    mat = halvesFromSpec(spec);
    syncTextures();
    placeGeometry();
  };

  /** The materials a Stadium environment covers: the cloth, its art, backdrop and zone outlines, the floor. */
  const coveredMaterials = () => [
    floor.material,
    ...HALVES.flatMap((key) => [
      halves[key].backing.material,
      halves[key].ambient.material,
      halves[key].art.material,
      halves[key].overlay.material,
    ]),
  ];

  /**
   * Design 077: with a cutout, the covered materials discard their fragments wherever the Stadium
   * environment shows (`cutout.glsl` defines `environmentShown(tablePoint)`; `cutout.uniforms`
   * carries `uTableFromWorld`, world → table frame), the zone outlines and labels too (user,
   * 2026-10-25: the place shows alone). Null removes it.
   * @param {{ glsl: string, uniforms: object }|null} cutout
   */
  const setCutout = (cutout) => {
    if (disposed) return;
    for (const material of coveredMaterials()) {
      if (cutout) {
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, cutout.uniforms);
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform mat4 uTableFromWorld;\nvarying vec2 vTablePos;')
            .replace(
              '#include <project_vertex>',
              '#include <project_vertex>\n\tvTablePos = (uTableFromWorld * modelMatrix * vec4(transformed, 1.0)).xy;'
            );
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\nvarying vec2 vTablePos;\n${cutout.glsl}`)
            .replace('void main() {', 'void main() {\n\tif (environmentShown(vTablePos) >= 0.5) discard;');
        };
        material.customProgramCacheKey = () => CUTOUT_PROGRAM_KEY;
      } else {
        delete material.onBeforeCompile;
        delete material.customProgramCacheKey;
      }
      material.needsUpdate = true;
    }
  };

  const onChange = (fn) => {
    if (typeof fn === 'function') listeners.add(fn);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const slot of SLOTS) releaseSlot(slot);
    for (const key of HALVES) halves[key].ambientTexture?.dispose();
    listeners.clear();
    scene.remove(group);
    for (const thing of disposables) thing.dispose?.();
    light.dispose?.();
    if (environment) {
      if (scene.environment === environment) scene.environment = null;
      environment.dispose();
    }
  };

  return { group, light, setLayout, setMat, setCutout, onChange, dispose };
}
