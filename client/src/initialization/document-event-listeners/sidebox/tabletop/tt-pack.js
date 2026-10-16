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
  STRIP_V,
  packShape,
  packSpaceY,
  packTearLine,
  peelAngleDeg,
  peelVertex,
  pillowZ,
  tearHingeV,
} from '../../../../setup/deck-builder/core/build-battle/pack3d.mjs';
import { PACK } from '../../../../setup/deck-builder/core/build-battle/tabletop/physical.mjs';
import { averageColor, drawPackBack } from './tt-print.js';
import { makeCanvas } from './tt-textures.js';

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

/** Fine vertical ridges across both crimped seals (the heat-sealer's teeth). */
function crimpTexture(shape) {
  const { sealTopV, sealBottomV } = packShape(shape);
  const w = 512;
  const h = 512;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, w, h);
  const band = (v0, v1) => {
    const y0 = Math.round(v0 * h);
    const y1 = Math.round(v1 * h);
    for (let x = 0; x < w; x += 1) {
      const slope = Math.cos((x / w) * Math.PI * 2 * 70);
      ctx.fillStyle = `rgb(${Math.round(128 + slope * 70)},128,${Math.round(255 - Math.abs(slope) * 25)})`;
      ctx.fillRect(x, y0, 1, y1 - y0);
    }
  };
  band(0, sealTopV * 0.96);
  band(Math.min(1, sealBottomV * 1.004), 1);
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
    const crimp = track(crimpTexture(shape));

    const look = {
      metalness: 0.5,
      roughness: 0.3,
      clearcoat: 0.35,
      clearcoatRoughness: 0.14,
      envMap,
      envMapIntensity: 1,
      normalMap: crimp,
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
      setDim,
      meshes: [bodyFront, bodyBack, stripFront, stripBack],
      dispose: () => disposables.forEach((thing) => thing.dispose?.()),
    };
  };

  return { makePack };
}
