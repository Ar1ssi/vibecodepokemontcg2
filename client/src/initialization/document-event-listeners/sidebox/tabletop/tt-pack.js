import {
  CanvasTexture,
  Color,
  FrontSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  NoColorSpace,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import {
  PEEL_MAX_DEG,
  STRIP_V,
  packShape,
  packShapeKey,
  packSpaceY,
  packTearLine,
  peelAngleDeg,
  peelVertex,
  pillowZ,
  tearHingeV,
} from '../../../../setup/deck-builder/core/build-battle/pack3d.mjs';
import { PACK } from '../../../../setup/deck-builder/core/build-battle/tabletop/physical.mjs';
import { averageColor, drawPackBack } from './tt-print.js';
import { fbm, makeCanvas, normalTextureFromHeights, prng } from './tt-textures.js';

/**
 * A booster pack on the tabletop (design 073): the design-055 pillow (front and back grids bulged
 * by `pillowZ`, the wrapper art's alpha cutting the crimped silhouette) in millimetres, with the
 * crimp's ridges as relief, a printed back with its fin seam, and the top strip as its own mesh
 * so a finger can peel it along the seeded tear line (`packTearLine`) and rip it off.
 *
 * Pack space: centred, +y up the art, +z out of the front, mm.
 */

const GRID_X = 40;
const GRID_Y = 72;
const STRIP_GRID_Y = 10;
// A torn-off strip of wrapper film lies in a loose curl of about this radius (mm).
const STRIP_CURL_MM = 16;
const MASK_W = 256;
const MASK_H = 468;
const MASK_OVERLAP_PX = 1.5;
const PW = PACK.width;
const PH = PACK.height;

function maskTexture(line, keepBelow) {
  const canvas = makeCanvas(MASK_W, MASK_H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MASK_W, MASK_H);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  const shift = keepBelow ? 0 : MASK_OVERLAP_PX;
  ctx.moveTo(0, keepBelow ? MASK_H : 0);
  line.forEach((point, index) => {
    const x = point.x * MASK_W;
    const y = point.y * MASK_H + shift;
    if (index === 0) ctx.lineTo(0, y);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(MASK_W, line.at(-1).y * MASK_H + shift);
  ctx.lineTo(MASK_W, keepBelow ? MASK_H : 0);
  ctx.closePath();
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const SURFACE_W = 384;
const SURFACE_H = 704;

/**
 * The wrapper's relief as a normal map: the heat-sealer's fine teeth across both crimped seals,
 * the creases where the foil pinches flat into a seal (short folds fanning into the body, deepest
 * at the corners), and the faint dents a pack picks up in its box. Seeded, so a reload shows the
 * same pack.
 */
function packSurfaceTexture(shape, seed) {
  const { sealTopV, sealBottomV } = packShape(shape);
  const w = SURFACE_W;
  const h = SURFACE_H;
  const heights = new Float32Array(w * h);
  const topSeal = sealTopV * 0.96 * h;
  const bottomSeal = Math.min(1, sealBottomV * 1.004) * h;
  for (let y = 0; y < h; y += 1) {
    const inSeal = y < topSeal || y > bottomSeal;
    for (let x = 0; x < w; x += 1) {
      const teeth = inSeal ? Math.cos((x / w) * Math.PI * 2 * 80) * 0.09 : 0;
      const dent = (fbm(x / 48, y / 48, w / 48, 3, seed) - 0.5) * 2.2;
      heights[y * w + x] = teeth + dent;
    }
  }
  const rand = prng(seed + 17);
  // A crease: a narrow ridge or trough from (x0, y0) running `length` px along `angle`, fading out.
  const crease = (x0, y0, angle, length, depth, width) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const reach = Math.ceil(width * 2.5);
    for (let s = 0; s < length; s += 1) {
      const fade = 1 - s / length;
      const cx = x0 + cos * s;
      const cy = y0 + sin * s;
      for (let oy = -reach; oy <= reach; oy += 1) {
        for (let ox = -reach; ox <= reach; ox += 1) {
          const px = Math.round(cx + ox);
          const py = Math.round(cy + oy);
          if (px < 0 || px >= w || py < 0 || py >= h) continue;
          const d = Math.abs(ox * -sin + oy * cos);
          heights[py * w + px] += (depth * fade * Math.exp(-(d * d) / (width * width))) / length * 9;
        }
      }
    }
  };
  for (const [edge, inward] of [
    [topSeal, 1],
    [bottomSeal, -1],
  ]) {
    let x = rand() * 10;
    while (x < w) {
      // Folds crowd toward the corners, where the pillow pinches hardest.
      const corner = Math.min(x, w - x) / (w / 2);
      const length = (14 + rand() * 46) * (1.25 - 0.5 * corner);
      const lean = (rand() - 0.5) * 0.7 + (x < w / 2 ? 0.25 : -0.25) * (1 - corner);
      crease(x, edge, Math.PI / 2 * inward + lean * inward, length, (rand() < 0.5 ? -1 : 1) * (0.6 + rand() * 0.6), 1.1 + rand() * 1.2);
      x += 6 + rand() * 16 * (0.4 + corner);
    }
  }
  return normalTextureFromHeights(heights, w, h, 1, null, { repeat: false });
}

const BODY_ROUGHNESS = 0.3;
const SEAL_ROUGHNESS = 0.55;

/** Roughness across the wrapper (green channel): the heat-pressed seals are duller than the body. */
function packRoughnessTexture(shape) {
  const { sealTopV, sealBottomV } = packShape(shape);
  const w = 8;
  const h = 256;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const shade = (roughness) => `rgb(0,${Math.round(roughness * 255)},0)`;
  ctx.fillStyle = shade(BODY_ROUGHNESS);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = shade(SEAL_ROUGHNESS);
  ctx.fillRect(0, 0, w, Math.round(sealTopV * 0.96 * h));
  const bottom = Math.round(Math.min(1, sealBottomV * 1.004) * h);
  ctx.fillRect(0, bottom, w, h - bottom);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function pillowGrid(width, height, segX, segY, vFrom, vTo, shape, sign) {
  const geometry = new PlaneGeometry(width, height, segX, segY);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i += 1) {
    const u = uv.getX(i);
    const planeV = uv.getY(i);
    const v = vTo - planeV * (vTo - vFrom);
    uv.setXY(i, u, 1 - v);
    position.setZ(i, sign * pillowZ(u, v, shape) * PW);
  }
  if (sign < 0) {
    const index = geometry.getIndex();
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, a);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * @param {{envMap: object, renderer: object}} options
 */
export function createPackKit({ envMap, renderer }) {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // Two wrinkle patterns per seal shape, alternating down the row: packs differ, the work is shared.
  const surfaces = new Map();
  const surfaceFor = (shape, packIndex) => {
    const key = `${packShapeKey(shape)}#${packIndex % 2}`;
    if (!surfaces.has(key)) {
      surfaces.set(key, {
        relief: packSurfaceTexture(shape, 401 + (packIndex % 2) * 97),
        roughness: packRoughnessTexture(shape),
      });
    }
    return surfaces.get(key);
  };

  /**
   * @param {{art: HTMLImageElement|HTMLCanvasElement, shape: object|null, seed: number,
   *   packIndex: number}} options
   */
  const makePack = ({ art, shape, seed, packIndex }) => {
    const disposables = [];
    const track = (thing) => {
      disposables.push(thing);
      return thing;
    };
    const line = packTearLine(seed, packIndex);
    const hingeV = tearHingeV(line);
    const artTexture = track(new CanvasTexture(art));
    artTexture.colorSpace = SRGBColorSpace;
    artTexture.anisotropy = anisotropy;
    // The back grid keeps the front's UVs (so its silhouette and tear mask line up in space), so
    // its print is drawn mirrored to read correctly from behind.
    const printed = makeCanvas(art.width, art.height);
    drawPackBack(printed.getContext('2d'), art.width, art.height, { tint: averageColor(art) });
    const backCanvas = makeCanvas(art.width, art.height);
    const bctx = backCanvas.getContext('2d');
    bctx.save();
    bctx.translate(art.width, 0);
    bctx.scale(-1, 1);
    bctx.drawImage(printed, 0, 0);
    bctx.restore();
    bctx.globalCompositeOperation = 'destination-in';
    bctx.drawImage(art, 0, 0);
    const backTexture = track(new CanvasTexture(backCanvas));
    backTexture.colorSpace = SRGBColorSpace;
    backTexture.anisotropy = anisotropy;
    const bodyMask = track(maskTexture(line, true));
    const stripMask = track(maskTexture(line, false));
    const surface = surfaceFor(shape, packIndex);

    // Roughness comes from the map (body 0.3, seals 0.55); the clearcoat scales the same map.
    const look = {
      metalness: 0.5,
      roughness: 1,
      roughnessMap: surface.roughness,
      clearcoat: 0.35,
      clearcoatRoughness: 0.47,
      clearcoatRoughnessMap: surface.roughness,
      envMap,
      envMapIntensity: 1,
      normalMap: surface.relief,
      alphaTest: 0.5,
    };
    const frontMaterial = (alphaMap) =>
      track(new MeshPhysicalMaterial({ ...look, map: artTexture, alphaMap, side: FrontSide }));
    const backMaterial = (alphaMap) =>
      track(new MeshPhysicalMaterial({ ...look, map: backTexture, alphaMap, side: FrontSide }));

    const group = new Group();
    group.name = `tt-pack-${packIndex}`;
    const bodyFront = new Mesh(track(pillowGrid(PW, PH, GRID_X, GRID_Y, 0, 1, shape, 1)), frontMaterial(bodyMask));
    const bodyBack = new Mesh(track(pillowGrid(PW, PH, GRID_X, GRID_Y, 0, 1, shape, -1)), backMaterial(bodyMask));
    const stripH = STRIP_V * PH;
    const stripFrontGeometry = track(pillowGrid(PW, stripH, GRID_X, STRIP_GRID_Y, 0, STRIP_V, shape, 1));
    const stripBackGeometry = track(pillowGrid(PW, stripH, GRID_X, STRIP_GRID_Y, 0, STRIP_V, shape, -1));
    for (const geometry of [stripFrontGeometry, stripBackGeometry]) geometry.translate(0, PH / 2 - stripH / 2, 0);
    const stripFront = new Mesh(stripFrontGeometry, frontMaterial(stripMask));
    const stripBack = new Mesh(stripBackGeometry, backMaterial(stripMask));
    const strip = new Group();
    strip.name = 'tt-pack-strip';
    strip.add(stripFront, stripBack);
    for (const mesh of [bodyFront, bodyBack, stripFront, stripBack]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    group.add(bodyFront, bodyBack, strip);

    const rest = [stripFrontGeometry, stripBackGeometry].map((geometry) => {
      const position = geometry.getAttribute('position');
      return Float32Array.from(position.array);
    });
    const stripU = (() => {
      const uv = stripFrontGeometry.getAttribute('uv');
      return Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    })();
    const hingeY = packSpaceY(hingeV);

    /** Folds the strip back toward the viewer, `progress` 0..1 along the tear from `side`. */
    const setPeel = (progress, side = 1) => {
      [stripFrontGeometry, stripBackGeometry].forEach((geometry, which) => {
        const position = geometry.getAttribute('position');
        const base = rest[which];
        for (let i = 0; i < position.count; i += 1) {
          const angleDeg = peelAngleDeg(stripU[i], progress, side);
          const folded = peelVertex(
            { y: base[i * 3 + 1] / PW, z: base[i * 3 + 2] / PW },
            { hingeY, angleDeg }
          );
          position.setXYZ(i, base[i * 3], folded.y * PW, folded.z * PW);
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
      });
    };

    /**
     * The torn strip relaxing as it flies off (`amount` 0 → 1): the fold about the tear opens out
     * while the film takes a loose curl up from its torn edge, so it lands lying on its back
     * instead of standing folded in the mat.
     */
    const relaxStrip = (amount) => {
      const relaxed = Math.max(0, Math.min(1, amount));
      const radius = STRIP_CURL_MM / Math.max(relaxed, 1e-3);
      const angleDeg = PEEL_MAX_DEG * (1 - relaxed);
      const hingeMm = hingeY * PW;
      [stripFrontGeometry, stripBackGeometry].forEach((geometry, which) => {
        const position = geometry.getAttribute('position');
        const base = rest[which];
        for (let i = 0; i < position.count; i += 1) {
          const theta = (base[i * 3 + 1] - hingeMm) / radius;
          const lever = radius - base[i * 3 + 2];
          const curled = { y: (hingeMm + lever * Math.sin(theta)) / PW, z: (radius - lever * Math.cos(theta)) / PW };
          const folded = peelVertex(curled, { hingeY, angleDeg });
          position.setXYZ(i, base[i * 3], folded.y * PW, folded.z * PW);
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
      });
    };

    const setDim = (amount) => {
      const level = Math.max(0, Math.min(1, amount));
      for (const material of disposables) {
        if (material.isMaterial) material.color = new Color(level, level, level);
      }
    };

    return {
      group,
      strip,
      body: [bodyFront, bodyBack],
      line,
      // The mouth: where the torn top's line runs, in pack space (mm).
      mouthY: hingeY * PW,
      setPeel,
      relaxStrip,
      setDim,
      meshes: [bodyFront, bodyBack, stripFront, stripBack],
      dispose: () => disposables.forEach((thing) => thing.dispose?.()),
    };
  };

  return {
    makePack,
    dispose: () => {
      surfaces.forEach(({ relief, roughness }) => {
        relief.dispose();
        roughness.dispose();
      });
      surfaces.clear();
    },
  };
}
