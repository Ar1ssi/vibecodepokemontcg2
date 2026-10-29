// In-card overlays of the three.js board (design 074 §D3 "Overlays in scene", O6-B): the damage
// counter, the Poison/Burn badges, the rotation-condition marker, the ability-used tab, the
// attached-Energy token row with its "Nx" badges, the held-condition idle loop, and the
// selection ring, glow ring and mat-pick outline. Every overlay is a plane parented to its
// card's mesh, so it tilts and tweens with the card. Placement comes from overlay-plan.mjs and
// status-loop-frame.mjs; looks follow the stylesheets the iframe board uses (damage-counter.css,
// status-marker.css, energy-token.css, the `.self-tab`/`.opp-tab`, `.selectHighlight`,
// `.has-glow` rules, and mat-picker.js's outline).
//
// Frames, as on the iframe board: the counter, markers, tab and tokens are placed on the card's
// FOOTPRINT (apply-view measures the turned card's bounding box), upright in its seat's frame,
// so they undo the server `rotation` but keep the far seat's 180°; rings hug the card itself;
// the idle loop's card parts turn with the card and its sky parts stay upright on the screen.
// The Tera crystal skin (mat-fx/tera-skin.js, css/mat-ambient.css) rides the card's face: tint,
// facets, sheen, rim glow and glints, put on by `setUiState(id, { teraSkin: palette | null })`.
// `three` is the namespace from `import('three')`; this module never imports it statically.
import { textureUrlFor } from '../gl/card-art-hosts.mjs';
import { STATUS_CONDITION_KEYS } from '../netcode/mat-fx/sfx-cues.mjs';
import { FACET_VIEW, teraSkinFacets, teraSkinGlints } from '../netcode/mat-fx/tera-skin.mjs';
import { CARD_UNITS, cardScaleFor } from './card-geometry.mjs';
import { counterPlan, energyRowPlan, markerPlan } from './overlay-plan.mjs';
import { STATUS_LOOP_PAINT, loopBoxOffset, loopPartFrame, statusLoopLayers } from './status-loop-frame.mjs';
import { TERA_SKIN_LOOK, teraGlintFrame, teraRimOpacity, teraSheenLeft, teraSkinFade } from './tera-skin-frame.mjs';

const DEG = Math.PI / 180;
const ASSETS = '/src/assets';
/** damage-counter.css: one TCG Live orange coin for every amount (the tier classes no longer change it). */
const COUNTER_ART = `${ASSETS}/damage-counter/counter-flat.webp`;
/** The coin's darker underside, shown under it like the CSS `::before` (shifted 11 %, scaled 0.9). */
const COUNTER_BACK_ART = `${ASSETS}/damage-counter/counter-back.webp`;
const COUNTER_BACK = { drop: 0.11, scale: 0.9 };
const COUNTER_TEXT = { fill: '#fff4d6', stroke: '#3d2200', strokeEm: 0.08, dropEm: 0.06 };
/** status-token-assets.mjs STATUS_TOKEN_FRONT. */
const BADGE_ART = {
  poison: `${ASSETS}/status-markers/poison-badge.webp`,
  burn: `${ASSETS}/status-markers/burn-badge.webp`,
};
/** status-marker.css: the rotation-condition marker's colours, with apply-view's codes. */
const CONDITION_MARKER = {
  Asleep: { code: 'A', background: '#3b8dad', color: '#fff' },
  Paralyzed: { code: 'PA', background: '#f4d03f', color: '#111' },
  Confused: { code: 'C', background: '#8e44ad', color: '#fff' },
};
const DEFAULT_MARKER = { background: '#fff', color: '#111' };
/** `.self-tab` / `.opp-tab` (self/opp-containers.css). */
const TAB_COLOR = { self: 'rgba(59, 141, 173, 0.708)', opp: 'rgba(255, 60, 0, 0.392)' };
/** `.energy-token-count`: the pill's background. */
const PILL_BACKGROUND = 'rgba(0, 0, 0, 0.62)';
/** `.selectHighlight`: a 4 px ring that breathes a 14 px halo over 1.8 s. */
const SELECTED = { rgb: '143, 215, 153', alpha: 0.864, ringPx: 4, haloBlurPx: 14, haloSpreadPx: 5, periodMs: 1800 };
/** `.has-glow`: a 10 px halo and a lit rim whose two hotspot sets turn every 3.2 s and 4.9 s. */
const GLOW = { blurPx: 10, spreadPx: 2, alpha: 0.6, rimPx: 3, periods: [3200, 4900], defaultRgb: '120, 200, 255' };
/** mat-picker.js: `4px solid` outline, `2px` offset; idle / picked colours. */
const MAT_PICK = { idle: '#ffd23f', picked: '#38d66b', widthPx: 4, offsetPx: 2 };
/** The card corner radius of the board's images (`border-radius: 4.55% / 3.5%`). */
const CORNER = { x: 0.0455, y: 0.035 };
/** Each idle-loop part's draw order within its layer, after the layer's own order. */
const LOOP_PART_ORDER_STEP = 1e-4;
/** The radial-glow part's texture: a white-to-clear disc, tinted per part. */
const LOOP_RADIAL_PX = 128;
const MAX_PIXEL_RATIO = 2;
/** Heights above the card face (px) and draw order, bottom first. */
const LAYER = {
  loopUnder: { z: -0.3, order: 1 },
  teraTint: { z: 0.3, order: 1.1 },
  teraFacets: { z: 0.32, order: 1.2 },
  teraSheen: { z: 0.34, order: 1.3 },
  teraAura: { z: 0.36, order: 1.4 },
  teraGlint: { z: 0.42, order: 1.5 },
  ring: { z: 0.3, order: 2 },
  loop: { z: 0.3, order: 3 },
  tab: { z: 0.4, order: 4 },
  token: { z: 0.5, order: 5 },
  counterBack: { z: 0.5, order: 6 },
  counter: { z: 0.6, order: 7 },
  marker: { z: 0.6, order: 7 },
  text: { z: 0.7, order: 8 },
  loopSky: { z: 0.8, order: 9 },
};

const pixelRatio = () => {
  const ratio = Number(globalThis.devicePixelRatio);
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(ratio, MAX_PIXEL_RATIO) : 1;
};

/** `.fx-tera-crystal__aura::before`'s box-shadows: [blur, spread, colour key, alpha]; the inset one apart. */
const TERA_RIM = {
  outline: { widthPx: 1.5, color: 'ice', alpha: 0.95 },
  outer: [
    [6, 2, 'cyan', 0.85],
    [18, 5, 'deep', 0.55],
  ],
  inset: [8, 1, 'ice', 0.8],
  marginPx: 30,
};
const TERA_GLINT_PX = 64;

const rgbOf = (palette, key) => (Array.isArray(palette?.[key]) ? palette[key].join(', ') : '255, 255, 255');

const isSideways = (rotation) => Math.abs(Math.round((Number(rotation) || 0) / 90)) % 2 === 1;

/** A canvas `wPx` × `hPx` CSS px at the device pixel ratio, its context scaled to CSS px. */
function makeCanvas(wPx, hPx) {
  const ratio = pixelRatio();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(wPx * ratio));
  canvas.height = Math.max(1, Math.ceil(hPx * ratio));
  const ctx = canvas.getContext('2d');
  ctx?.scale(ratio, ratio);
  return { canvas, ctx };
}

/** `newPath: false` adds the outline to the current path (an even-odd frame round the card). */
function roundedRectPath(ctx, x, y, w, h, rx, ry, newPath = true) {
  if (newPath) ctx.beginPath();
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + w - rx, y);
  ctx.ellipse(x + w - rx, y + ry, rx, ry, 0, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - ry);
  ctx.ellipse(x + w - rx, y + h - ry, rx, ry, 0, 0, Math.PI / 2);
  ctx.lineTo(x + rx, y + h);
  ctx.ellipse(x + rx, y + h - ry, rx, ry, 0, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + ry);
  ctx.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

const fontOf = (px, weight = 800) => `${weight} ${px}px 'Arial Rounded MT Bold', Nunito, 'Segoe UI', sans-serif`;

/**
 * @param {{ group?: import('three').Object3D|null, three: typeof import('three'),
 *   textures: { acquire: (url: string, o?: object) => Promise<import('three').Texture>,
 *     release: (url: string, o?: object) => void },
 *   clock: { now: () => number }, motionReduced?: () => boolean, onNeedsRender?: () => void,
 *   loadImage?: (src: string) => Promise<CanvasImageSource> }} deps
 *   `group` is unused by the overlays themselves (they ride on card meshes) and accepted for the
 *   scene's uniform wiring; `loadImage` loads the idle-loop sprite sheets (default: an <img>).
 * @returns {{ sync: (instanceId: number, placement: object, cardMesh: import('three').Object3D,
 *     options: { widthPx: number, tokens?: object[] }) => void,
 *   remove: (instanceId: number) => void, update: (now: number) => boolean,
 *   count: () => number, dispose: () => void }}
 *   `placement` is the card's placement with the scene's UI state merged in (`selected`, `glow`,
 *   `matPick`); `tokens` = the `energyToken`s of the Energy attached to its stack (shown on the
 *   stack's visible card). `count()` = overlay meshes drawn.
 */
export function createOverlayMeshes({
  three,
  textures,
  clock,
  motionReduced = () => false,
  onNeedsRender = () => {},
  loadImage = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`image failed: ${src}`));
      image.src = src;
    }),
}) {
  const entries = new Map();
  const art = new Map();
  const shared = new Map();
  const sheets = new Map();
  const sheetImages = new Map();
  /** The idle loop's GPU textures: processed sheets and radial discs, by sheets' key. Parts wear clones. */
  const loopTextures = new Map();
  // When each card's Tera skin went on, so a re-dress (damage, a ring) does not fade it in again.
  const teraSince = new Map();
  const plane = new three.PlaneGeometry(1, 1);
  const disc = new three.CircleGeometry(0.5, 40);
  let frozenAt = null;
  let disposed = false;

  const basicMaterial = (map = null) =>
    new three.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, side: three.DoubleSide });

  const canvasTexture = (canvas) => {
    const texture = new three.CanvasTexture(canvas);
    texture.colorSpace = three.SRGBColorSpace;
    return texture;
  };

  // ── art textures (counter coin, badges, Energy tokens): one material per src, refcounted.
  const holdArt = (src) => {
    let entry = art.get(src);
    if (!entry) {
      const material = basicMaterial();
      material.opacity = 0;
      entry = { src, url: textureUrlFor(src), refs: 0, material, texture: null, released: false };
      art.set(src, entry);
      const pending = entry;
      textures.acquire(pending.url, { colorSpace: 'srgb' }).then(
        (texture) => {
          if (pending.released || disposed) {
            textures.release(pending.url, { colorSpace: 'srgb' });
            return;
          }
          pending.texture = texture;
          pending.material.map = texture;
          pending.material.opacity = 1;
          pending.material.needsUpdate = true;
          onNeedsRender();
        },
        (error) => {
          if (!pending.released) console.warn(`board3d: overlay art failed (${pending.url})`, error?.message || error);
        }
      );
    }
    entry.refs += 1;
    return entry;
  };

  const dropArt = (src) => {
    const entry = art.get(src);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    art.delete(src);
    entry.released = true;
    if (entry.texture) textures.release(entry.url, { colorSpace: 'srgb' });
    entry.material.dispose();
  };

  // ── shared canvas materials (tab, rings, halo, glow), refcounted by key.
  const holdShared = (key, build) => {
    let entry = shared.get(key);
    if (!entry) {
      entry = { key, refs: 0, ...build() };
      shared.set(key, entry);
    }
    entry.refs += 1;
    return entry;
  };

  const dropShared = (key) => {
    const entry = shared.get(key);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    shared.delete(key);
    entry.material.map?.dispose();
    entry.material.dispose();
  };

  const tabMaterial = (side) =>
    holdShared(`tab:${side}`, () => {
      const { canvas, ctx } = makeCanvas(100, 20);
      if (ctx) {
        roundedRectPath(ctx, 0, 0, 100, 20, 10, 2);
        ctx.fillStyle = TAB_COLOR[side] ?? TAB_COLOR.self;
        ctx.fill();
      }
      return { material: basicMaterial(canvasTexture(canvas)) };
    });

  /** A ring around a card `w` × `h` px: `draw(ctx, x, y, w, h)` paints it inside `margin`. */
  const ringMaterial = (key, w, h, margin, draw, extra = {}) =>
    holdShared(key, () => {
      const W = w + 2 * margin;
      const H = h + 2 * margin;
      const { canvas, ctx } = makeCanvas(W, H);
      if (ctx) draw(ctx, margin, margin, w, h);
      return { material: basicMaterial(canvasTexture(canvas)), canvas, ctx, w, h, margin, size: [W, H], ...extra };
    });

  const sizeKey = (w, h) => `${Math.round(w)}x${Math.round(h)}`;

  const cardPath = (ctx, x, y, w, h, grow = 0, newPath = true) =>
    roundedRectPath(ctx, x - grow, y - grow, w + 2 * grow, h + 2 * grow, w * CORNER.x + grow, h * CORNER.y + grow, newPath);

  const selectedRing = (w, h) =>
    ringMaterial(`selected-ring:${sizeKey(w, h)}`, w, h, SELECTED.ringPx + 1, (ctx, x, y, cw, ch) => {
      cardPath(ctx, x, y, cw, ch, SELECTED.ringPx / 2);
      ctx.lineWidth = SELECTED.ringPx;
      ctx.strokeStyle = `rgba(${SELECTED.rgb}, ${SELECTED.alpha})`;
      ctx.stroke();
    });

  const selectedHalo = (w, h) =>
    ringMaterial(
      `selected-halo:${sizeKey(w, h)}`,
      w,
      h,
      SELECTED.haloBlurPx + SELECTED.haloSpreadPx + 4,
      (ctx, x, y, cw, ch) => {
        ctx.shadowColor = `rgba(${SELECTED.rgb}, 0.55)`;
        ctx.shadowBlur = SELECTED.haloBlurPx;
        cardPath(ctx, x, y, cw, ch, SELECTED.ringPx + SELECTED.haloSpreadPx);
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(${SELECTED.rgb}, 0.55)`;
        ctx.stroke();
      },
      { animated: 'pulse' }
    );

  const matPickRing = (state, w, h) => {
    const color = state === 'picked' ? MAT_PICK.picked : MAT_PICK.idle;
    const grow = MAT_PICK.offsetPx + MAT_PICK.widthPx / 2;
    return ringMaterial(`matpick:${state}:${sizeKey(w, h)}`, w, h, grow + MAT_PICK.widthPx, (ctx, x, y, cw, ch) => {
      cardPath(ctx, x, y, cw, ch, grow);
      ctx.lineWidth = MAT_PICK.widthPx;
      ctx.strokeStyle = color;
      ctx.stroke();
    });
  };

  /** The glow's blurred halo, which never changes: painted once, then copied under each rim frame. */
  const bakeGlowHalo = ({ w, h, margin, rgb, size }) => {
    const { canvas, ctx } = makeCanvas(size[0], size[1]);
    if (!ctx) return null;
    ctx.shadowColor = `rgba(${rgb}, ${GLOW.alpha})`;
    ctx.shadowBlur = GLOW.blurPx;
    cardPath(ctx, margin, margin, w, h, GLOW.spreadPx);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(${rgb}, ${GLOW.alpha})`;
    ctx.stroke();
    return canvas;
  };

  /** The glow halo and rim; the rim's hotspots are repainted as the clock turns them. */
  const paintGlow = (entry, now) => {
    const { ctx, w, h, margin, rgb, size } = entry;
    if (!ctx) return;
    entry.halo ??= bakeGlowHalo(entry);
    ctx.clearRect(0, 0, size[0], size[1]);
    if (entry.halo) {
      // Both canvases are at the device pixel ratio: copy pixel for pixel.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(entry.halo, 0, 0);
      ctx.restore();
    }
    const cx = margin + w / 2;
    const cy = margin + h / 2;
    const rim = ctx.createConicGradient ? [0, 1] : [];
    cardPath(ctx, margin, margin, w, h, GLOW.rimPx / 2);
    ctx.lineWidth = GLOW.rimPx;
    ctx.strokeStyle = `rgb(${rgb})`;
    ctx.stroke();
    for (const set of rim) {
      const turn = ((now % GLOW.periods[set]) / GLOW.periods[set]) * 360 * (set === 0 ? 1 : -1);
      const gradient = ctx.createConicGradient((turn - 90) * DEG, cx, cy);
      const stops =
        set === 0
          ? [[0, 0], [30, 0.85], [70, 0], [150, 0], [175, 0.7], [205, 0], [250, 0], [290, 0.8], [320, 0], [360, 0]]
          : [[0, 0], [40, 0.6], [95, 0], [200, 0], [235, 0.6], [280, 0], [360, 0]];
      for (const [deg, alpha] of stops) gradient.addColorStop(deg / 360, `rgba(255, 255, 255, ${alpha})`);
      ctx.strokeStyle = gradient;
      ctx.stroke();
    }
    entry.material.map.needsUpdate = true;
  };

  const glowRing = (rgb, w, h) =>
    ringMaterial(`glow:${rgb}:${sizeKey(w, h)}`, w, h, GLOW.blurPx + GLOW.spreadPx + 6, () => {}, {
      animated: 'glow',
      rgb,
    });

  // ── idle-loop sprite sheets, processed once per (sprite, tint) as the stylesheet paints them.
  const sheetImage = (src) => {
    let pending = sheetImages.get(src);
    if (!pending) {
      pending = { image: null, failed: false };
      sheetImages.set(src, pending);
      loadImage(src).then(
        (image) => {
          pending.image = image;
          onNeedsRender();
        },
        (error) => {
          pending.failed = true;
          console.warn('board3d: status loop sheet failed', error?.message || error);
        }
      );
    }
    return pending.image;
  };

  const processSheet = (image, paint, tint) => {
    const w = image.naturalWidth || image.width;
    const h = image.naturalHeight || image.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx || !w || !h) return null;
    const color = `rgb(${tint ?? '255, 255, 255'})`;
    if (paint === 'multiply' || paint === 'alpha') {
      if (paint === 'multiply') {
        ctx.drawImage(image, 0, 0);
        ctx.globalCompositeOperation = 'multiply';
      }
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(image, 0, 0);
      return canvas;
    }
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, w, h);
    const data = pixels.data;
    const [tr, tg, tb] = (tint ?? '255, 255, 255').split(',').map(Number);
    for (let i = 0; i < data.length; i += 4) {
      const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      let alpha = luma * data[i + 3];
      if (paint === 'wisp') {
        const px = (i / 4) % w;
        const py = Math.floor(i / 4 / w);
        const dist = Math.hypot((px + 0.5) / w - 0.5, (py + 0.5) / h - 0.5) * 2;
        alpha *= Math.max(0, 1 - dist);
      }
      if (paint !== 'self') {
        data[i] = tr;
        data[i + 1] = tg;
        data[i + 2] = tb;
      }
      data[i + 3] = alpha;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  };

  const sheetFor = (part) => {
    const look = STATUS_LOOP_PAINT[part.sprite];
    if (!look?.src) return null;
    const key = `${part.sprite}|${part.tint ?? ''}`;
    if (sheets.has(key)) return sheets.get(key);
    const image = sheetImage(look.src);
    if (!image) return null;
    const sheet = processSheet(image, look.paint, part.tint);
    sheets.set(key, sheet);
    return sheet;
  };

  /** A texture the loop's parts share (one upload), made once per key; null until it can be. */
  const loopTextureFor = (part) => {
    const radial = STATUS_LOOP_PAINT[part.sprite]?.paint === 'radial';
    const key = radial ? `radial|${part.tint ?? ''}` : `${part.sprite}|${part.tint ?? ''}`;
    if (loopTextures.has(key)) return loopTextures.get(key);
    let canvas = null;
    if (radial) {
      canvas = document.createElement('canvas');
      canvas.width = LOOP_RADIAL_PX;
      canvas.height = LOOP_RADIAL_PX;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const r = LOOP_RADIAL_PX / 2;
      const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
      gradient.addColorStop(0, `rgba(${part.tint ?? '255, 255, 255'}, 1)`);
      gradient.addColorStop(1, `rgba(${part.tint ?? '255, 255, 255'}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, LOOP_RADIAL_PX, LOOP_RADIAL_PX);
    } else {
      canvas = sheetFor(part);
    }
    if (!canvas) return null;
    const texture = canvasTexture(canvas);
    // Sampled like the canvas drawImage it replaces: no mips, so a frame never bleeds its neighbours.
    texture.generateMipmaps = false;
    texture.minFilter = three.LinearFilter;
    loopTextures.set(key, texture);
    return texture;
  };

  /** Gives a part its own clone of the shared texture (its own frame offset, one GPU upload). */
  const dressLoopPiece = (piece) => {
    if (piece.material.map) return true;
    const texture = loopTextureFor(piece.part);
    if (!texture) return false;
    piece.material.map = texture.clone();
    piece.material.needsUpdate = true;
    return true;
  };

  /**
   * One part at `t` ms of the loop: its plane's place, turn, size, opacity and sprite frame, as
   * the stylesheet's keyframes put them (status-loop-frame.mjs). Card widths → px by `cardW`.
   */
  const poseLoopPiece = (piece, t, { cardW, sky, sideways }) => {
    const { mesh, material, part } = piece;
    const frame = loopPartFrame(part, t);
    if (!frame || !dressLoopPiece(piece)) {
      mesh.visible = false;
      return;
    }
    const offset = loopBoxOffset(frame, part, { sky, sideways });
    mesh.visible = true;
    mesh.position.x = offset.x * cardW;
    mesh.position.y = -offset.y * cardW;
    mesh.rotation.z = -frame.rotateDeg * DEG;
    mesh.scale.set(frame.w * cardW * frame.scale, frame.h * cardW * frame.scale, 1);
    material.opacity = Math.max(0, Math.min(1, frame.alpha));
    if (STATUS_LOOP_PAINT[part.sprite]?.paint !== 'radial') {
      material.map.repeat.set(1 / frame.cols, 1 / frame.rows);
      material.map.offset.set(frame.col / frame.cols, 1 - (frame.row + 1) / frame.rows);
    }
  };

  /** Poses every part of a card's loop; answers whether a part still waits for its sheet. */
  const poseLoop = (loop, now) => {
    const t = now - loop.start;
    let waiting = false;
    for (const layer of loop.layers) {
      for (const piece of layer.pieces) {
        poseLoopPiece(piece, t, layer);
        if (!piece.material.map && loopPartFrame(piece.part, t)) waiting = true;
      }
    }
    loop.waiting = waiting;
    return waiting;
  };

  // ── per card
  const addMesh = (entry, parent, geometry, material, { x = 0, y = 0, z = 0, w = 1, h = 1, order = 0 }) => {
    const mesh = new three.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, 1);
    mesh.renderOrder = order;
    parent.add(mesh);
    entry.meshes.push(mesh);
    return mesh;
  };

  const addCanvasPlane = (entry, parent, wPx, hPx, paint, layout) => {
    const { canvas, ctx } = makeCanvas(wPx, hPx);
    if (ctx) paint(ctx);
    const material = basicMaterial(canvasTexture(canvas));
    entry.owned.push(material);
    return addMesh(entry, parent, plane, material, { ...layout, w: wPx, h: hPx });
  };

  const buildCounter = (entry, root, plan, box) => {
    const size = plan.size * box.w;
    const [u, v] = plan.anchor;
    const x = u * box.w;
    const y = v * box.h;
    entry.art.push(COUNTER_BACK_ART, COUNTER_ART);
    const back = COUNTER_BACK.scale * size;
    addMesh(entry, root, disc, holdArt(COUNTER_BACK_ART).material, {
      x,
      y: y - COUNTER_BACK.drop * size,
      z: LAYER.counterBack.z,
      w: back,
      h: back,
      order: LAYER.counterBack.order,
    });
    addMesh(entry, root, disc, holdArt(COUNTER_ART).material, { x, y, z: LAYER.counter.z, w: size, h: size, order: LAYER.counter.order });
    // damage-counter.css: font-size = card width / 6 (half the coin), heavy, stroked, dropped shadow.
    const fontPx = size / 2;
    addCanvasPlane(entry, root, size * 1.4, size, (ctx) => {
      ctx.font = fontOf(fontPx, 900);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const cx = (size * 1.4) / 2;
      const cy = size / 2;
      ctx.lineWidth = COUNTER_TEXT.strokeEm * fontPx * 2;
      ctx.strokeStyle = COUNTER_TEXT.stroke;
      ctx.fillStyle = COUNTER_TEXT.stroke;
      ctx.strokeText(plan.digits, cx, cy + COUNTER_TEXT.dropEm * fontPx);
      ctx.fillText(plan.digits, cx, cy + COUNTER_TEXT.dropEm * fontPx);
      ctx.strokeText(plan.digits, cx, cy);
      ctx.fillStyle = COUNTER_TEXT.fill;
      ctx.fillText(plan.digits, cx, cy);
    }, { x, y, z: LAYER.text.z, order: LAYER.text.order });
  };

  const buildMarkers = (entry, root, plan, box, side) => {
    const size = plan.markerSize * box.w;
    for (const key of ['poison', 'burn']) {
      const anchor = plan[key];
      if (!anchor) continue;
      entry.art.push(BADGE_ART[key]);
      addMesh(entry, root, plane, holdArt(BADGE_ART[key]).material, {
        x: anchor[0] * box.w,
        y: anchor[1] * box.h,
        z: LAYER.marker.z,
        w: size,
        h: size,
        order: LAYER.marker.order,
      });
    }
    if (plan.conditionLabel) {
      const look = CONDITION_MARKER[plan.conditionLabel.text] ?? { ...DEFAULT_MARKER, code: plan.conditionLabel.text };
      const [u, v] = plan.conditionLabel.anchor;
      // status-marker.css: a filled circle with an inset shade; apply-view sizes the code at width / 4.
      const fontPx = box.w / 4;
      addCanvasPlane(entry, root, size, size, (ctx) => {
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = look.background;
        ctx.fill();
        ctx.lineWidth = 0.14 * fontPx * 2;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.save();
        ctx.clip();
        ctx.stroke();
        ctx.restore();
        ctx.font = fontOf(fontPx * (look.code.length > 1 ? 0.8 : 1), 800);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = look.color;
        ctx.fillText(look.code, size / 2, size / 2 + fontPx * 0.04);
      }, { x: u * box.w, y: v * box.h, z: LAYER.text.z, order: LAYER.text.order });
    }
    if (plan.abilityTab) {
      const [tw, th] = plan.abilityTabSize;
      entry.shared.push(`tab:${side}`);
      addMesh(entry, root, plane, tabMaterial(side).material, {
        x: plan.abilityTab[0] * box.w,
        y: plan.abilityTab[1] * box.h,
        z: LAYER.tab.z,
        w: tw * box.w,
        h: th * box.w,
        order: LAYER.tab.order,
      });
    }
  };

  const buildTokens = (entry, root, tokens, box) => {
    const ordered = [...tokens].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    const row = energyRowPlan(
      ordered.map((token) => token.src),
      1,
      { aspect: box.h / box.w }
    );
    const size = row.tokenSize * box.w;
    row.tokens.forEach((token, i) => {
      const { src, double } = ordered[i];
      entry.art.push(src);
      // energy-token.css: single tokens are round-cropped discs; two-orb tokens keep their square art.
      addMesh(entry, root, double ? plane : disc, holdArt(src).material, {
        x: token.anchor[0] * box.w,
        y: token.anchor[1] * box.h,
        z: LAYER.token.z + i * 0.02,
        w: size,
        h: size,
        order: LAYER.token.order,
      });
    });
    for (const badge of row.badges) {
      const fontPx = badge.fontSize * box.w;
      const heightPx = 1.4 * fontPx;
      const ctxProbe = makeCanvas(1, 1).ctx;
      if (ctxProbe) ctxProbe.font = fontOf(fontPx, 800);
      const textW = ctxProbe ? ctxProbe.measureText(badge.label).width : badge.label.length * 0.62 * fontPx;
      const widthPx = textW + 0.5 * fontPx;
      addCanvasPlane(entry, root, widthPx, heightPx, (ctx) => {
        roundedRectPath(ctx, 0, 0, widthPx, heightPx, heightPx / 2, heightPx / 2);
        ctx.fillStyle = PILL_BACKGROUND;
        ctx.fill();
        ctx.font = fontOf(fontPx, 800);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(badge.label, widthPx / 2, heightPx / 2);
      }, {
        x: badge.anchor[0] * box.w + widthPx / 2,
        // `margin-bottom: 0.3em` lifts the pill off the tokens' bottom line.
        y: badge.anchor[1] * box.h + 0.3 * fontPx + heightPx / 2,
        z: LAYER.text.z,
        order: LAYER.text.order,
      });
    }
  };

  const buildRings = (entry, ringRoot, placement, card) => {
    const { w, h } = card;
    const add = (key, material) => {
      entry.shared.push(key.key);
      const [W, H] = key.size;
      addMesh(entry, ringRoot, plane, material, { z: 0, w: W, h: H, order: LAYER.ring.order });
    };
    if (placement.selected) {
      const halo = selectedHalo(w, h);
      add(halo, halo.material);
      const ring = selectedRing(w, h);
      add(ring, ring.material);
    }
    if (placement.glow) {
      const glow = glowRing(String(placement.glow).trim() || GLOW.defaultRgb, w, h);
      if (!glow.painted) {
        paintGlow(glow, clock.now());
        glow.painted = true;
      }
      add(glow, glow.material);
    }
    if (placement.matPick === 'idle' || placement.matPick === 'picked') {
      const ring = matPickRing(placement.matPick, w, h);
      add(ring, ring.material);
    }
  };

  // Each part is its own sprite plane posed per frame (no canvas repainted and re-uploaded per
  // frame), drawn in the stylesheet's order inside its layer.
  const buildLoop = (entry, root, sky, keys, card, sideways, now) => {
    const layers = statusLoopLayers(keys);
    const loopLayers = [];
    const addLayer = (parts, parent, z, order, isSky) => {
      if (parts.length === 0) return;
      const pieces = parts.map((part, index) => {
        const material = basicMaterial();
        entry.owned.push(material);
        const mesh = addMesh(entry, parent, plane, material, { z, order: order + (index + 1) * LOOP_PART_ORDER_STEP });
        mesh.visible = false;
        return { part, mesh, material };
      });
      loopLayers.push({ pieces, cardW: card.w, sky: isSky, sideways });
    };
    addLayer(layers.under, entry.cardRoot, LAYER.loopUnder.z - card.t, LAYER.loopUnder.order, false);
    addLayer(layers.card, entry.cardRoot, LAYER.loop.z, LAYER.loop.order, false);
    addLayer(layers.sky, sky, LAYER.loopSky.z, LAYER.loopSky.order, true);
    if (loopLayers.length === 0) return;
    entry.loop = { start: now, layers: loopLayers, waiting: false };
    poseLoop(entry.loop, frozenAt ?? now);
  };

  // ── the Tera crystal skin, on the card's face (css/mat-ambient.css `.fx-tera-crystal__*`).
  /** The card's rounded box, white on black: the sheen's alpha map (the rotator clips the strip). */
  const cardMaskTexture = (w, h) => {
    const { canvas, ctx } = makeCanvas(w, h);
    if (ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      cardPath(ctx, 0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    return new three.CanvasTexture(canvas);
  };

  /**
   * `.fx-tera-crystal__tint`'s 160° gradient. The DOM blends it `color` (hue/saturation only); a
   * blend can't do that, so the plane multiplies the art toward the tint by its alpha:
   * dst × (1 − a + c·a), which keeps dark ink dark like the CSS does.
   */
  const buildTeraTint = (entry, palette, w, h) => {
    const { canvas, ctx } = makeCanvas(w, h);
    if (ctx) {
      const angle = 160 * DEG;
      const dx = Math.sin(angle);
      const dy = -Math.cos(angle);
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      const gradient = ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half);
      gradient.addColorStop(0, `rgba(${rgbOf(palette, 'ice')}, 0.9)`);
      gradient.addColorStop(0.38, `rgba(${rgbOf(palette, 'cyan')}, 0.75)`);
      gradient.addColorStop(0.7, `rgba(${rgbOf(palette, 'deep')}, 0.8)`);
      gradient.addColorStop(1, `rgba(${rgbOf(palette, 'deep')}, 0.85)`);
      cardPath(ctx, 0, 0, w, h);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
    const material = basicMaterial(canvasTexture(canvas));
    material.premultipliedAlpha = true;
    material.blending = three.CustomBlending;
    material.blendEquation = three.AddEquation;
    material.blendSrc = three.DstColorFactor;
    material.blendDst = three.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = three.ZeroFactor;
    material.blendDstAlpha = three.OneFactor;
    entry.owned.push(material);
    return addMesh(entry, entry.cardRoot, plane, material, { z: LAYER.teraTint.z, w, h, order: LAYER.teraTint.order });
  };

  /** `.fx-tera-crystal__facets`: tera-skin.mjs's seeded facet mesh, painted from its triangles. */
  const buildTeraFacets = (entry, instanceId, palette, w, h) => {
    const { canvas, ctx } = makeCanvas(w, h);
    if (ctx) {
      const sx = w / FACET_VIEW.width;
      const sy = h / FACET_VIEW.height;
      cardPath(ctx, 0, 0, w, h);
      ctx.clip();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 0.5 * Math.min(sx, sy);
      for (const facet of teraSkinFacets(instanceId, palette).facets) {
        ctx.beginPath();
        facet.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * sx, y * sy) : ctx.lineTo(x * sx, y * sy)));
        ctx.closePath();
        ctx.globalAlpha = facet.opacity;
        ctx.fillStyle = facet.fill;
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }
    const material = basicMaterial(canvasTexture(canvas));
    entry.owned.push(material);
    return addMesh(entry, entry.cardRoot, plane, material, { z: LAYER.teraFacets.z, w, h, order: LAYER.teraFacets.order });
  };

  /** `.fx-tera-crystal__sheen`: a 250 %-wide 115° strip, swept by the texture offset (screen ≈ additive). */
  const buildTeraSheen = (entry, palette, w, h) => {
    const span = TERA_SKIN_LOOK.sheenSpan;
    const W = w * span;
    const { canvas, ctx } = makeCanvas(W, h);
    if (ctx) {
      const angle = 115 * DEG;
      const dx = Math.sin(angle);
      const dy = -Math.cos(angle);
      const half = (Math.abs(W * dx) + Math.abs(h * dy)) / 2;
      const gradient = ctx.createLinearGradient(W / 2 - dx * half, h / 2 - dy * half, W / 2 + dx * half, h / 2 + dy * half);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(0.38, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(0.47, 'rgba(255, 255, 255, 0.4)');
      gradient.addColorStop(0.5, `rgba(${rgbOf(palette, 'ice')}, 0.65)`);
      gradient.addColorStop(0.53, 'rgba(255, 255, 255, 0.4)');
      gradient.addColorStop(0.62, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, h);
    }
    const texture = canvasTexture(canvas);
    texture.wrapS = three.ClampToEdgeWrapping;
    texture.repeat.set(1 / span, 1);
    const material = basicMaterial(texture);
    material.alphaMap = cardMaskTexture(w, h);
    material.blending = three.AdditiveBlending;
    entry.owned.push(material, { dispose: () => material.alphaMap?.dispose() });
    addMesh(entry, entry.cardRoot, plane, material, { z: LAYER.teraSheen.z, w, h, order: LAYER.teraSheen.order });
    return material;
  };

  /** `.fx-tera-crystal__aura::before`: the outline, two outer glows and the inner glow round the card. */
  const buildTeraAura = (entry, palette, w, h) => {
    const m = TERA_RIM.marginPx;
    const W = w + 2 * m;
    const H = h + 2 * m;
    const { canvas, ctx } = makeCanvas(W, H);
    if (ctx) {
      for (const [blur, spread, key, alpha] of TERA_RIM.outer) {
        ctx.save();
        ctx.shadowColor = `rgba(${rgbOf(palette, key)}, ${alpha})`;
        ctx.shadowBlur = blur;
        cardPath(ctx, m, m, w, h, spread);
        ctx.fillStyle = `rgba(${rgbOf(palette, key)}, ${alpha})`;
        ctx.fill();
        ctx.restore();
      }
      // Outer box-shadows never paint inside the box.
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      cardPath(ctx, m, m, w, h);
      ctx.fill();
      ctx.restore();
      const { widthPx, color, alpha } = TERA_RIM.outline;
      cardPath(ctx, m, m, w, h, widthPx / 2);
      ctx.lineWidth = widthPx;
      ctx.strokeStyle = `rgba(${rgbOf(palette, color)}, ${alpha})`;
      ctx.stroke();
      const [blur, spread, key, insetAlpha] = TERA_RIM.inset;
      ctx.save();
      cardPath(ctx, m, m, w, h);
      ctx.clip();
      ctx.shadowColor = `rgba(${rgbOf(palette, key)}, ${insetAlpha})`;
      ctx.shadowBlur = blur;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      cardPath(ctx, m, m, w, h, -spread, false);
      ctx.fillStyle = `rgba(${rgbOf(palette, key)}, ${insetAlpha})`;
      ctx.fill('evenodd');
      ctx.restore();
    }
    const material = basicMaterial(canvasTexture(canvas));
    entry.owned.push(material);
    addMesh(entry, entry.cardRoot, plane, material, { z: LAYER.teraAura.z, w: W, h: H, order: LAYER.teraAura.order });
    return material;
  };

  /** `.fx-tera-crystal__glint`: a radial star with two crossed diamond rays. */
  const glintTexture = (palette) => {
    const S = TERA_GLINT_PX;
    const { canvas, ctx } = makeCanvas(S, S);
    if (ctx) {
      const c = S / 2;
      const radial = ctx.createRadialGradient(c, c, 0, c, c, Math.SQRT2 * c);
      radial.addColorStop(0, '#fff');
      radial.addColorStop(0.09, '#fff');
      radial.addColorStop(0.16, `rgba(${rgbOf(palette, 'ice')}, 0.85)`);
      radial.addColorStop(0.3, `rgba(${rgbOf(palette, 'cyan')}, 0.35)`);
      radial.addColorStop(0.48, `rgba(${rgbOf(palette, 'cyan')}, 0)`);
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, S, S);
      for (const turn of [0, 90]) {
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(turn * DEG);
        ctx.translate(-c, -c);
        const ray = ctx.createLinearGradient(0, 0, S, 0);
        ray.addColorStop(0, `rgba(${rgbOf(palette, 'ice')}, 0)`);
        ray.addColorStop(0.3, `rgba(${rgbOf(palette, 'ice')}, 0.9)`);
        ray.addColorStop(0.5, '#fff');
        ray.addColorStop(0.7, `rgba(${rgbOf(palette, 'ice')}, 0.9)`);
        ray.addColorStop(1, `rgba(${rgbOf(palette, 'ice')}, 0)`);
        ctx.beginPath();
        ctx.moveTo(0, c);
        ctx.lineTo(c, 0.44 * S);
        ctx.lineTo(S, c);
        ctx.lineTo(c, 0.56 * S);
        ctx.closePath();
        ctx.fillStyle = ray;
        ctx.fill();
        ctx.restore();
      }
    }
    return canvasTexture(canvas);
  };

  const buildTeraGlints = (entry, instanceId, palette, w, h) => {
    const texture = glintTexture(palette);
    entry.owned.push({ dispose: () => texture.dispose() });
    return teraSkinGlints(instanceId).map((glint) => {
      const material = basicMaterial(texture);
      entry.owned.push({ dispose: () => material.dispose() });
      const size = glint.size * w;
      const mesh = addMesh(entry, entry.cardRoot, plane, material, {
        x: (glint.x / 100 - 0.5) * w,
        y: (0.5 - glint.y / 100) * h,
        z: LAYER.teraGlint.z,
        w: size,
        h: size,
        order: LAYER.teraGlint.order,
      });
      return { mesh, material, size, delay: glint.delay };
    });
  };

  /** Poses every Tera layer at `t` ms; `still` = motion off, as the CSS with `animation: none`. */
  const paintTera = (tera, t, still) => {
    const elapsed = t - tera.start;
    const fade = still ? 1 : teraSkinFade(elapsed);
    tera.tint.material.opacity = TERA_SKIN_LOOK.tintAlpha * fade;
    tera.facets.material.opacity = TERA_SKIN_LOOK.facetAlpha * fade;
    tera.sheen.opacity = fade;
    tera.sheen.map.offset.x = -(still ? 0 : teraSheenLeft(elapsed)) / TERA_SKIN_LOOK.sheenSpan;
    tera.aura.opacity = (still ? 1 : teraRimOpacity(elapsed)) * fade;
    for (const glint of tera.glints) {
      const frame = still ? { scale: 0, rotateDeg: 0, opacity: 0 } : teraGlintFrame(elapsed, glint.delay);
      glint.mesh.visible = frame.opacity > 0 && frame.scale > 0;
      glint.mesh.scale.set(glint.size * frame.scale, glint.size * frame.scale, 1);
      glint.mesh.rotation.z = -frame.rotateDeg * DEG;
      glint.material.opacity = frame.opacity * fade;
    }
  };

  const buildTera = (entry, instanceId, palette, card, now) => {
    if (!teraSince.has(instanceId)) teraSince.set(instanceId, now);
    const { w, h } = card;
    entry.tera = {
      start: teraSince.get(instanceId),
      tint: buildTeraTint(entry, palette, w, h),
      facets: buildTeraFacets(entry, instanceId, palette, w, h),
      sheen: buildTeraSheen(entry, palette, w, h),
      aura: buildTeraAura(entry, palette, w, h),
      glints: buildTeraGlints(entry, instanceId, palette, w, h),
    };
    paintTera(entry.tera, frozenAt ?? now, motionReduced());
  };

  const clearEntry = (entry) => {
    entry.root.removeFromParent();
    entry.ringRoot.removeFromParent();
    entry.cardRoot.removeFromParent();
    for (const material of entry.owned) {
      material.map?.dispose();
      material.dispose();
    }
    for (const src of entry.art) dropArt(src);
    for (const key of entry.shared) dropShared(key);
  };

  const remove = (instanceId) => {
    teraSince.delete(instanceId);
    const entry = entries.get(instanceId);
    if (!entry) return;
    entries.delete(instanceId);
    clearEntry(entry);
    onNeedsRender();
  };

  const keyOf = (placement, widthPx, tokens) =>
    JSON.stringify([
      widthPx,
      placement.side,
      placement.face,
      placement.rotation,
      placement.damage,
      placement.conditions,
      placement.abilityUsed,
      placement.selected,
      placement.glow,
      placement.matPick,
      placement.teraSkin ?? null,
      tokens.map((token) => [token.src, token.double, token.zIndex]),
    ]);

  const sync = (instanceId, placement, cardMesh, { widthPx, tokens = [] } = {}) => {
    if (disposed) return;
    if (!placement || !cardMesh || !(widthPx > 0)) {
      remove(instanceId);
      return;
    }
    const list = Array.isArray(tokens) ? tokens.filter((token) => token?.src) : [];
    const key = keyOf(placement, widthPx, list);
    const existing = entries.get(instanceId);
    if (existing && existing.key === key && existing.parent === cardMesh) return;
    if (existing) {
      entries.delete(instanceId);
      clearEntry(existing);
    }

    const w = widthPx;
    const h = (w * CARD_UNITS.h) / CARD_UNITS.w;
    const t = CARD_UNITS.t * cardScaleFor(w);
    const card = { w, h, t };
    const rotation = Number(placement.rotation) || 0;
    const sideways = isSideways(rotation);
    const box = sideways ? { w: h, h: w } : { w, h };
    const front = placement.face !== 'back';
    const seatYaw = rotation + (placement.side === 'opp' ? 180 : 0);

    // Footprint frame: the server turn undone, on the front face.
    const root = new three.Group();
    root.rotation.z = rotation * DEG;
    root.position.z = t / 2;
    // Card frame on the visible face (a face-down card is turned over).
    const cardRoot = new three.Group();
    cardRoot.position.z = t / 2;
    const ringRoot = new three.Group();
    ringRoot.position.z = (front ? 1 : -1) * (t / 2 + LAYER.ring.z);
    // Screen-upright: also undoes the far seat's 180° (opp-containers.css --status-fx-upright).
    const sky = new three.Group();
    sky.rotation.z = (seatYaw - rotation) * DEG;
    root.add(sky);
    cardMesh.add(root, cardRoot, ringRoot);

    const entry = { key, parent: cardMesh, root, cardRoot, ringRoot, meshes: [], owned: [], art: [], shared: [], loop: null, tera: null };
    entries.set(instanceId, entry);

    if (front) {
      const aspect = box.h / box.w;
      const counter = counterPlan(placement, { aspect });
      if (counter) buildCounter(entry, root, counter, box);
      buildMarkers(entry, root, markerPlan(placement, { aspect }), box, placement.side === 'opp' ? 'opp' : 'self');
      if (list.length > 0) buildTokens(entry, root, list, box);
      // status-loop.mjs statusLoopKeys over the placement's conditions (already in Checkup order).
      const keys = (placement.conditions ?? []).map((c) => STATUS_CONDITION_KEYS[c]).filter(Boolean);
      if (keys.length > 0) buildLoop(entry, root, sky, keys, card, sideways, clock.now());
    }
    if (front && placement.teraSkin) buildTera(entry, instanceId, placement.teraSkin, card, clock.now());
    else teraSince.delete(instanceId);
    buildRings(entry, ringRoot, placement, card);
    onNeedsRender();
  };

  const update = (nowMs) => {
    if (disposed) return false;
    const now = Number.isFinite(nowMs) ? nowMs : clock.now();
    const still = motionReduced();
    if (still && frozenAt === null) frozenAt = now;
    if (!still) frozenAt = null;
    const t = frozenAt ?? now;
    let animating = false;
    for (const entry of entries.values()) {
      if (!entry.parent.visible) continue;
      if (entry.tera) {
        paintTera(entry.tera, t, still);
        animating = true;
      }
      if (!entry.loop) continue;
      // Held still, a part whose sheet loaded since is still posed once.
      if (!still || entry.loop.waiting) poseLoop(entry.loop, t);
      animating = true;
    }
    for (const entry of shared.values()) {
      if (entry.animated === 'glow') {
        if (!still) paintGlow(entry, t);
        animating = true;
      } else if (entry.animated === 'pulse') {
        // `select-highlight-pulse`: the halo breathes in and out over 1.8 s, eased.
        const phase = (t % SELECTED.periodMs) / SELECTED.periodMs;
        const k = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
        entry.material.opacity = k * k * (3 - 2 * k);
        animating = true;
      }
    }
    return animating && !still;
  };

  const count = () => [...entries.values()].reduce((sum, entry) => sum + entry.meshes.length, 0);

  const dispose = () => {
    if (disposed) return;
    for (const id of [...entries.keys()]) remove(id);
    disposed = true;
    plane.dispose();
    disc.dispose();
    for (const texture of loopTextures.values()) texture.dispose();
    loopTextures.clear();
    sheets.clear();
    sheetImages.clear();
    teraSince.clear();
  };

  return { sync, remove, update, count, dispose };
}
