import {
  BoxGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { BULGE } from '../../../../setup/deck-builder/core/build-battle/pack3d.mjs';
import { boxFaceQuads } from '../../../../setup/deck-builder/core/build-battle/tabletop/box-faces.mjs';
import { CARD, PACK, deckThickness } from '../../../../setup/deck-builder/core/build-battle/tabletop/physical.mjs';
import { createFilmMaterials } from './tt-film.js';
import { boardPanel } from './tt-geometry.js';
import {
  drawBoxBack,
  drawBoxEnd,
  drawProceduralFront,
  drawProceduralSide,
  mirrorCanvas,
  paletteFor,
  rectifyFace,
} from './tt-print.js';
import { assetUrl, loadImage, makeCanvas } from './tt-textures.js';

/**
 * The Build & Battle box (design 073 Options 5): a flip-top deck box folded from 0.5 mm board.
 * The lid covers the top, `lidFront` of the front and `lidBack` of the back, its sides cut on the
 * diagonal between, and swings back on a hinge across the back panel; an unprinted collar rises
 * inside the base. Printed faces come from the product render (rectified) or are drawn; the
 * insides are bare board. The shrink-wrap is a film shell around everything.
 *
 * Box space: origin at the bottom centre, +y up, +z out of the front, +x to the front's right.
 */

const FACE_PX = 1024;

function textureOf(canvas, renderer) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const drawn = (width, height, draw) => {
  const canvas = makeCanvas(width, height);
  draw(canvas.getContext('2d'), width, height);
  return canvas;
};

/**
 * The six face canvases for a box. Photo faces come from the skin's vendored cuts (Mega Evolution
 * camera) or else from the box's product render through its measured corners (`box-faces.mjs`);
 * a render showing the right side gives the right, and the other side is it mirrored, as the box
 * sides carry mirrored art. Faces no photo shows are drawn.
 */
export async function prepareBoxFaces({ look, dims, boxKey = null }) {
  const palette = paletteFor(look?.skin?.palette);
  const labels = look?.labels || {};
  const frontW = FACE_PX;
  const frontH = Math.round((FACE_PX * dims.height) / dims.width);
  const sideW = Math.round((FACE_PX * dims.depth) / dims.width);
  const cuts = look?.skin?.faces || null;
  const quads = cuts ? null : boxFaceQuads(boxKey);
  const renderSrc = quads ? look?.skin?.render?.src : null;
  const [frontImage, leftImage, render, keyArt, logo] = await Promise.all([
    cuts?.front ? loadImage(assetUrl(cuts.front.src)) : null,
    cuts?.left ? loadImage(assetUrl(cuts.left.src)) : null,
    renderSrc ? loadImage(assetUrl(renderSrc)) : null,
    cuts ? null : loadImage(look?.skin?.keyArtUrl),
    cuts ? null : loadImage(look?.skin?.setLogoUrl),
  ]);
  // Corners are measured on the render as vendored: a resized file would sample the wrong place.
  const photo =
    render && render.naturalWidth === quads.size[0] && render.naturalHeight === quads.size[1] ? render : null;
  let front = null;
  if (frontImage && cuts.front.quad) front = rectifyFace(frontImage, cuts.front.quad, frontW, frontH);
  else if (photo) front = rectifyFace(photo, quads.front, frontW, frontH);
  else front = drawn(frontW, frontH, (ctx, w, h) => drawProceduralFront(ctx, w, h, { palette, keyArt, logo, labels }));
  let left = null;
  let right = null;
  if (leftImage && cuts.left.quad) left = rectifyFace(leftImage, cuts.left.quad, sideW, frontH);
  else if (photo && quads.left) left = rectifyFace(photo, quads.left, sideW, frontH);
  else if (photo && quads.right) right = rectifyFace(photo, quads.right, sideW, frontH);
  if (!left && !right) left = drawn(sideW, frontH, (ctx, w, h) => drawProceduralSide(ctx, w, h, { palette, labels }));
  left ||= mirrorCanvas(right);
  right ||= mirrorCanvas(left);
  return {
    front,
    left,
    right,
    back: drawn(frontW, frontH, (ctx, w, h) => drawBoxBack(ctx, w, h, { labels, palette })),
    top: drawn(frontW, sideW, (ctx, w, h) => drawBoxEnd(ctx, w, h, { kind: 'top', labels })),
    bottom: drawn(frontW, sideW, (ctx, w, h) => drawBoxEnd(ctx, w, h, { kind: 'bottom', labels })),
  };
}

/**
 * @param {{renderer: object, envMap: object, dims: object, faces: object, board: object,
 *   crinkle: object}} args
 */
export function buildBox({ renderer, envMap, dims, faces, board, crinkle }) {
  const { width: W, height: H, depth: D, board: b, lidFront, lidBack, collar } = dims;
  const yFront = H - lidFront;
  const yHinge = H - lidBack;
  const disposables = [];
  const track = (thing) => {
    disposables.push(thing);
    return thing;
  };

  const printed = (canvas) =>
    track(
      new MeshPhysicalMaterial({
        map: track(textureOf(canvas, renderer)),
        roughness: 0.5,
        metalness: 0,
        clearcoat: 0.22,
        clearcoatRoughness: 0.3,
        envMap,
        envMapIntensity: 0.9,
      })
    );
  const inner = track(
    new MeshStandardMaterial({ map: board, roughness: 0.93, metalness: 0, envMap, envMapIntensity: 0.5 })
  );
  const cutEdge = track(
    new MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.95, metalness: 0, envMap, envMapIntensity: 0.4 })
  );
  const materials = {
    front: [printed(faces.front), inner, cutEdge],
    back: [printed(faces.back), inner, cutEdge],
    left: [printed(faces.left), inner, cutEdge],
    right: [printed(faces.right), inner, cutEdge],
    top: [printed(faces.top), inner, cutEdge],
    bottom: [printed(faces.bottom), inner, cutEdge],
    collar: [inner, inner, cutEdge],
  };

  // UV mappers: each face's texture spans the whole face, so lid and base panels line up.
  const frontUv = (x, y) => [(x + W / 2) / W, y / H];
  const sideUv = (x, y) => [(x + D / 2) / D, y / H];
  const topUv = (x, y) => [(x + W / 2) / W, (y + D / 2) / D];

  const panel = (points, uv, mats, place) => {
    const geometry = track(boardPanel(points, b, uv));
    const mesh = new Mesh(geometry, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    place(mesh);
    return mesh;
  };
  // Panel placements (outer face outward); `x` in each panel runs as seen from outside.
  const atFront = (mesh) => mesh.position.set(0, 0, D / 2);
  const atBack = (mesh) => {
    mesh.position.set(0, 0, -D / 2);
    mesh.rotation.y = Math.PI;
  };
  const atLeft = (mesh) => {
    mesh.position.set(-W / 2, 0, 0);
    mesh.rotation.y = -Math.PI / 2;
  };
  const atRight = (mesh) => {
    mesh.position.set(W / 2, 0, 0);
    mesh.rotation.y = Math.PI / 2;
  };
  const atTop = (mesh) => {
    mesh.position.set(0, H, 0);
    mesh.rotation.x = -Math.PI / 2;
  };
  const atBottom = (mesh) => {
    mesh.position.set(0, 0, 0);
    mesh.rotation.x = Math.PI / 2;
  };

  const rect = (x0, y0, x1, y1) => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  // Side panels: the left runs back → front (x = −D/2 is the back edge), the right front → back.
  const leftCut = (x) => yHinge + ((yFront - yHinge) * (x + D / 2)) / D;
  const rightCut = (x) => yFront + ((yHinge - yFront) * (x + D / 2)) / D;

  const box = new Group();
  box.name = 'tt-box';
  const base = new Group();
  base.name = 'tt-box-base';
  base.add(
    panel(rect(-W / 2, 0, W / 2, yFront), frontUv, materials.front, atFront),
    panel(rect(-W / 2, 0, W / 2, yHinge), frontUv, materials.back, atBack),
    panel(
      [
        [-D / 2, 0],
        [D / 2, 0],
        [D / 2, yFront],
        [-D / 2, yHinge],
      ],
      sideUv,
      materials.left,
      atLeft
    ),
    panel(
      [
        [-D / 2, 0],
        [D / 2, 0],
        [D / 2, yHinge],
        [-D / 2, yFront],
      ],
      sideUv,
      materials.right,
      atRight
    ),
    panel(rect(-W / 2, -D / 2, W / 2, D / 2), topUv, materials.bottom, atBottom)
  );
  // The collar: bare board inside the front and sides, standing `collar` mm proud of the cut.
  const inset = b;
  const collarFront = panel(
    rect(-W / 2 + 2 * inset, inset, W / 2 - 2 * inset, yFront + collar),
    frontUv,
    materials.collar,
    (mesh) => mesh.position.set(0, 0, D / 2 - inset)
  );
  const collarSide = (sign) =>
    panel(
      [
        [-D / 2 + 2 * inset, inset],
        [D / 2 - 2 * inset, inset],
        [D / 2 - 2 * inset, (sign < 0 ? leftCut(D / 2) : rightCut(-D / 2)) + collar],
        [-D / 2 + 2 * inset, (sign < 0 ? leftCut(-D / 2) : rightCut(D / 2)) + collar],
      ].map(([x, y]) => [x, y]),
      sideUv,
      materials.collar,
      (mesh) => {
        mesh.position.set(sign * (W / 2 - inset), 0, 0);
        mesh.rotation.y = sign < 0 ? -Math.PI / 2 : Math.PI / 2;
      }
    );
  base.add(collarFront, collarSide(-1), collarSide(1));
  box.add(base);

  // The lid hangs from its hinge: a pivot on the back panel at `yHinge`.
  const lidPivot = new Group();
  lidPivot.name = 'tt-box-lid';
  lidPivot.position.set(0, yHinge, -D / 2);
  const lid = new Group();
  lid.position.set(0, -yHinge, D / 2);
  lid.add(
    panel(rect(-W / 2, yFront, W / 2, H), frontUv, materials.front, atFront),
    panel(rect(-W / 2, yHinge, W / 2, H), frontUv, materials.back, atBack),
    panel(
      [
        [-D / 2, yHinge],
        [D / 2, yFront],
        [D / 2, H],
        [-D / 2, H],
      ],
      sideUv,
      materials.left,
      atLeft
    ),
    panel(
      [
        [-D / 2, yFront],
        [D / 2, yHinge],
        [D / 2, H],
        [-D / 2, H],
      ],
      sideUv,
      materials.right,
      atRight
    ),
    panel(rect(-W / 2, -D / 2, W / 2, D / 2), topUv, materials.top, atTop)
  );
  lidPivot.add(lid);
  box.add(lidPivot);

  const film = buildFilmShell({ W, H, D, envMap, crinkle, renderer, track });
  box.add(film.group);

  const setLidAngle = (deg) => {
    lidPivot.rotation.x = (-deg * Math.PI) / 180;
  };

  return {
    group: box,
    lidPivot,
    film,
    dims,
    setLidAngle,
    hitMeshes: () => {
      const list = [];
      box.traverse((node) => {
        if (node.isMesh) list.push(node);
      });
      return list;
    },
    isLidMesh: (mesh) => {
      let node = mesh;
      while (node) {
        if (node === lidPivot) return true;
        node = node.parent;
      }
      return false;
    },
    dispose: () => {
      box.traverse((node) => {
        if (node.isMesh) node.geometry.dispose();
      });
      disposables.forEach((thing) => thing.dispose?.());
    },
  };
}

// ── Shrink-wrap ────────────────────────────────────────────────────────────
// BoxGeometry builds its faces in this order: +x, −x, +y, −y, +z, −z.
const FILM_SEGMENTS = { x: 12, y: 18, z: 8 };

/**
 * The film shell: a subdivided box 0.5 mm proud of the board, its UVs remapped into a 3 × 2 atlas
 * (one cell per face) for the seam/milkiness map, with a second UV set in mm for the crinkle.
 */
function buildFilmShell({ W, H, D, envMap, crinkle, renderer, track }) {
  const gap = 0.5;
  const sx = W + 2 * gap;
  const sy = H + 2 * gap;
  const sz = D + 2 * gap;
  const geometry = track(new BoxGeometry(sx, sy, sz, FILM_SEGMENTS.x, FILM_SEGMENTS.y, FILM_SEGMENTS.z));
  geometry.translate(0, H / 2, 0);
  const uv = geometry.getAttribute('uv');
  const uv1 = new Float32Array(uv.count * 2);
  const { x: gx, y: gy, z: gz } = FILM_SEGMENTS;
  const faces = [
    { count: (gz + 1) * (gy + 1), size: [sz, sy] },
    { count: (gz + 1) * (gy + 1), size: [sz, sy] },
    { count: (gx + 1) * (gz + 1), size: [sx, sz] },
    { count: (gx + 1) * (gz + 1), size: [sx, sz] },
    { count: (gx + 1) * (gy + 1), size: [sx, sy] },
    { count: (gx + 1) * (gy + 1), size: [sx, sy] },
  ];
  let start = 0;
  faces.forEach((face, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    for (let v = start; v < start + face.count; v += 1) {
      const u0 = uv.getX(v);
      const v0 = uv.getY(v);
      uv1[v * 2] = (u0 * face.size[0]) / 120;
      uv1[v * 2 + 1] = (v0 * face.size[1]) / 120;
      uv.setXY(v, (col + u0) / 3, (row + v0) / 2);
    }
    start += face.count;
  });
  geometry.setAttribute('uv1', new Float32BufferAttribute(uv1, 2));
  const seams = track(filmAtlasTexture(renderer));
  const crinkleTexture = crinkle.clone();
  crinkleTexture.channel = 1;
  crinkleTexture.wrapS = crinkleTexture.wrapT = RepeatWrapping;
  crinkleTexture.needsUpdate = true;
  track(crinkleTexture);
  const film = createFilmMaterials({ envMap, crinkle: crinkleTexture, seams });
  track(film);
  film.uniforms.uOrigin.value.set(0, H / 2, 0);
  const haze = new Mesh(geometry, film.haze);
  haze.renderOrder = 4;
  const gloss = new Mesh(geometry, film.gloss);
  gloss.renderOrder = 5;
  const group = new Group();
  group.name = 'tt-wrap';
  group.add(haze, gloss);
  return { group, uniforms: film.uniforms, meshes: [haze, gloss], size: { x: sx, y: sy, z: sz } };
}

/**
 * The film's milkiness and seams per face (alpha in the green channel): a side seam down the left
 * face, gift-wrap folds sealed across the top and bottom, whiter film along every edge where it is
 * stretched over the board.
 */
function filmAtlasTexture(renderer) {
  const cell = 256;
  const canvas = makeCanvas(cell * 3, cell * 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(78,78,78)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 6; index += 1) {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = col * cell;
    // Canvas y runs down; atlas row 0 is the bottom of the texture.
    const y = (1 - row) * cell;
    const edge = ctx.createLinearGradient(x, 0, x + cell, 0);
    edge.addColorStop(0, 'rgba(200,200,200,0.55)');
    edge.addColorStop(0.06, 'rgba(200,200,200,0)');
    edge.addColorStop(0.94, 'rgba(200,200,200,0)');
    edge.addColorStop(1, 'rgba(200,200,200,0.55)');
    ctx.fillStyle = edge;
    ctx.fillRect(x, y, cell, cell);
    const edgeY = ctx.createLinearGradient(0, y, 0, y + cell);
    edgeY.addColorStop(0, 'rgba(200,200,200,0.55)');
    edgeY.addColorStop(0.05, 'rgba(200,200,200,0)');
    edgeY.addColorStop(0.95, 'rgba(200,200,200,0)');
    edgeY.addColorStop(1, 'rgba(200,200,200,0.55)');
    ctx.fillStyle = edgeY;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = 'rgb(235,235,235)';
    ctx.lineCap = 'round';
    if (index === 1) {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + cell * 0.47, y);
      ctx.lineTo(x + cell * 0.49, y + cell);
      ctx.stroke();
    }
    if (index === 2 || index === 3) {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + cell * 0.3, y + cell * 0.5);
      ctx.lineTo(x, y + cell);
      ctx.moveTo(x + cell, y);
      ctx.lineTo(x + cell * 0.7, y + cell * 0.5);
      ctx.lineTo(x + cell, y + cell);
      ctx.moveTo(x + cell * 0.3, y + cell * 0.5);
      ctx.lineTo(x + cell * 0.7, y + cell * 0.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(230,230,230,0.35)';
      ctx.fillRect(x + cell * 0.3, y + cell * 0.44, cell * 0.4, cell * 0.12);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

// ── What sits inside ───────────────────────────────────────────────────────
/**
 * Box-space resting places of the contents (design 073 § Assumptions): the leaflet against the
 * back wall, the packs upright in front of it leaning back a little, the code card, then the
 * deck behind the front wall with its bottom card (the promo) facing out.
 *
 * @returns {{leaflet: object, packs: object[], code: object, deck: object}} each
 *   `{x, y, z, rotX}` (the item stands upright, facing +z, tilted back by rotX radians)
 */
export function interiorSlots(dims, { packCount = 4, deckCount = 40, leaflet = { height: 112, thickness: 1.2 } } = {}) {
  const { depth: D, board: b } = dims;
  // A full pack bulges BULGE × its width each side (pack3d.mjs), so packs stand that far apart.
  const packPitch = 2 * BULGE * PACK.width + 0.4;
  let z = -D / 2 + b + 0.4;
  const leafletSlot = { x: 0, y: b + leaflet.height / 2, z: z + leaflet.thickness / 2, rotX: -0.03 };
  z += leaflet.thickness + 0.4;
  const packs = [];
  for (let index = 0; index < packCount; index += 1) {
    packs.push({ x: (index % 2 ? 1 : -1) * 0.8, y: b + PACK.height / 2, z: z + packPitch / 2, rotX: -0.045 });
    z += packPitch;
  }
  const deckT = deckThickness(deckCount) + 0.6;
  // The deck leans back a little, so its promo face tips up toward whoever opens the lid.
  const deck = { x: 0, y: b + CARD.height / 2 + 0.3, z: D / 2 - b - 1.6 - deckT / 2, rotX: -0.06 };
  const code = { x: 1.5, y: b + CARD.height / 2, z: Math.min(z + 1, deck.z - deckT / 2 - 1), rotX: -0.02 };
  return { leaflet: leafletSlot, packs, code, deck };
}
