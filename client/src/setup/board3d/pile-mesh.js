// The deck, discard and Lost Zone piles of the three.js board (design 074 §D3 "Piles", edge case
// 7): a stack of thin rounded-rect card layers per pile. The deck's top layer wears the side's
// sleeve; discard / Lost Zone layers are plain paper under the face-up top card, which the card
// pool (card-mesh.js) draws. A count change tweens the stack height on the scene clock. Lives in
// the TABLE frame (x right, y up the table, z off the cloth, 1 unit = 1 flat px); board-scene.js
// adds `group` to the tilted frame. `three` is the namespace from `import('three')`; this module
// never imports it statically.
import { textureUrlFor } from '../gl/card-art-hosts.mjs';
import { createCardArtMaterial } from '../gl/card-art-material.js';
import { CARD_UNITS, cardCornerRadius, cardScaleFor, roundedRectShapePoints } from './card-geometry.mjs';
import { createTween } from './tween.mjs';

const DEG = Math.PI / 180;
/** Material groups of every layer geometry. */
const TOP = 0;
const BOTTOM = 1;
const RIM = 2;
/** `#deckStack` layers: `linear-gradient(#9a9aa3, #5d5d66)` with a `#2e2e35` edge (self-containers.css). */
const PAPER_COLOR = 0x8a8a93;
const RIM_COLOR = 0x5d5d66;
/** A pile's height tween when its count changes (design 074 §D3 "Cards" pose timing). */
const HEIGHT_MS = 180;
/** The bottom layer rests where card-mesh.js rests a card: over the mat overlay (Z.overlay = 1). */
const PILE_LIFT_PX = 1.5;
const MIN_SCALE = 1e-3;

const widthKeyOf = (widthPx) => Math.round(widthPx * 100) / 100;

/**
 * One card layer `w` wide, one card thickness tall (z from 0 to t), regrouped [top, bottom, rim]
 * like card-mesh.js; the top lid's UVs span 0..1 over the card so the sleeve fills it.
 */
function buildLayerGeometry(three, w) {
  const h = (w * CARD_UNITS.h) / CARD_UNITS.w;
  const t = CARD_UNITS.t * cardScaleFor(w);
  const outline = roundedRectShapePoints(w, h, cardCornerRadius(w));
  const shape = new three.Shape(outline.map(([x, y]) => new three.Vector2(x, y)));
  const geometry = new three.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  const caps = geometry.groups.find((g) => g.materialIndex === 0);
  const sides = geometry.groups.find((g) => g.materialIndex === 1);
  const lid = caps.count / 2;
  geometry.clearGroups();
  geometry.addGroup(caps.start + lid, lid, TOP);
  geometry.addGroup(caps.start, lid, BOTTOM);
  geometry.addGroup(sides.start, sides.count, RIM);
  const position = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  for (let i = caps.start; i < caps.start + caps.count; i++) {
    uvs.setXY(i, position.getX(i) / w + 0.5, position.getY(i) / h + 0.5);
  }
  uvs.needsUpdate = true;
  geometry.computeBoundingSphere();
  return { geometry, t };
}

/**
 * @param {{ group: import('three').Group, three: typeof import('three'),
 *   textures: { acquire: (url: string, o?: object) => Promise<import('three').Texture>,
 *     release: (url: string, o?: object) => void },
 *   clock: { now: () => number }, motionReduced?: () => boolean, onNeedsRender?: () => void }} deps
 *   `onNeedsRender` runs when a sleeve finishes loading after `setPile` returned.
 * @returns {{
 *   setPile: (side: 'self'|'opp', zone: 'deck'|'discard'|'lostZone',
 *     pile: { count: number, layers: number, topSrc?: string|null },
 *     pose: { x: number, y: number, yawDeg: number, widthPx: number }|null,
 *     options: { thicknessPx: number }) => void,
 *   clear: (side: string, zone: string) => void, update: (now: number) => boolean,
 *   objects: () => import('three').Object3D[], pileAt: (object3d: import('three').Object3D|null) =>
 *     { side: string, zone: string }|null, meshCount: () => number, dispose: () => void }}
 *   `thicknessPx` = the stack's height (pile-poses.mjs `pileThicknessPx(layers, scale)`).
 *   Count 0, no layers or no pose draws nothing (edge case 7). `update(now)` places every
 *   tweening stack and answers whether another frame is needed. `objects()` / `pileAt()` let
 *   the scene raycast the piles; `meshCount()` counts the layer meshes drawn.
 */
export function createPileMeshes({
  group,
  three,
  textures,
  clock,
  motionReduced = () => false,
  onNeedsRender = () => {},
}) {
  const piles = new Map();
  const geometries = new Map();
  const paper = new three.MeshStandardMaterial({ color: PAPER_COLOR, roughness: 0.8, metalness: 0 });
  const rim = new three.MeshStandardMaterial({ color: RIM_COLOR, roughness: 0.85, metalness: 0 });
  let disposed = false;

  const holdGeometry = (widthPx) => {
    const key = widthKeyOf(widthPx);
    let entry = geometries.get(key);
    if (!entry) {
      entry = { key, refs: 0, ...buildLayerGeometry(three, key) };
      geometries.set(key, entry);
    }
    entry.refs += 1;
    return entry;
  };

  const dropGeometry = (entry) => {
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    geometries.delete(entry.key);
    entry.geometry.dispose();
  };

  /** The deck's top face: its sleeve once loaded, plain paper until then (or if it fails). */
  const topMaterialOf = (pile) => (pile.sleeve?.state === 'ready' ? pile.sleeve.material : paper);

  const dressLayers = (pile) => {
    const last = pile.meshes.length - 1;
    pile.meshes.forEach((mesh, i) => {
      mesh.material = [i === last ? topMaterialOf(pile) : paper, paper, rim];
    });
  };

  const releaseSleeve = (pile) => {
    const sleeve = pile.sleeve;
    if (!sleeve) return;
    pile.sleeve = null;
    sleeve.released = true;
    if (sleeve.texture) textures.release(sleeve.url, { colorSpace: 'srgb' });
    sleeve.material.dispose();
  };

  const setSleeve = (pile, src) => {
    const next = src || null;
    if ((pile.sleeve?.src ?? null) === next) return;
    releaseSleeve(pile);
    if (!next) return;
    const sleeve = {
      src: next,
      url: textureUrlFor(next),
      state: 'loading',
      texture: null,
      released: false,
      material: createCardArtMaterial(three),
    };
    pile.sleeve = sleeve;
    textures.acquire(sleeve.url, { colorSpace: 'srgb' }).then(
      (texture) => {
        // Replaced or disposed while loading: hand the reference straight back.
        if (sleeve.released || disposed) {
          textures.release(sleeve.url, { colorSpace: 'srgb' });
          return;
        }
        sleeve.texture = texture;
        sleeve.material.map = texture;
        sleeve.material.needsUpdate = true;
        sleeve.state = 'ready';
        dressLayers(pile);
        onNeedsRender();
      },
      (error) => {
        if (sleeve.released || disposed) return;
        sleeve.state = 'failed';
        console.warn(`board3d: pile sleeve failed (${sleeve.url})`, error?.message || error);
      }
    );
  };

  /** Layer meshes at one card thickness apart, each stretched to the stack's own step. */
  const setLayers = (pile, layers, thicknessPx) => {
    while (pile.meshes.length > layers) pile.stack.remove(pile.meshes.pop());
    while (pile.meshes.length < layers) {
      const mesh = new three.Mesh(pile.geometry.geometry, [paper, paper, rim]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.boardPile = pile.key;
      pile.stack.add(mesh);
      pile.meshes.push(mesh);
    }
    const step = thicknessPx / layers;
    const stretch = step / pile.geometry.t;
    pile.meshes.forEach((mesh, i) => {
      mesh.geometry = pile.geometry.geometry;
      mesh.position.set(0, 0, i * step);
      mesh.scale.set(1, 1, stretch);
    });
    dressLayers(pile);
  };

  /** The stack's drawn height is `thicknessPx × stack.scale.z`; the tween runs that scale. */
  const placeHeight = (pile, now) => {
    const height = pile.height.at(now);
    pile.stack.scale.set(1, 1, Math.max(MIN_SCALE, height / pile.thicknessPx));
  };

  const clear = (side, zone) => {
    const key = `${side}:${zone}`;
    const pile = piles.get(key);
    if (!pile) return;
    piles.delete(key);
    group.remove(pile.stack);
    releaseSleeve(pile);
    dropGeometry(pile.geometry);
  };

  const setPile = (side, zone, { count, layers, topSrc } = {}, pose, { thicknessPx } = {}) => {
    if (disposed) return;
    const total = Number.isFinite(layers) ? Math.max(0, Math.floor(layers)) : 0;
    const valid = pose && Number.isFinite(pose.x) && Number.isFinite(pose.y) && pose.widthPx > 0;
    if (!(count > 0) || total === 0 || !valid || !(thicknessPx > 0)) {
      clear(side, zone);
      return;
    }
    const key = `${side}:${zone}`;
    const now = clock.now();
    let pile = piles.get(key);
    if (!pile) {
      const stack = new three.Group();
      stack.name = `board3d-pile-${key}`;
      group.add(stack);
      pile = {
        key,
        side,
        zone,
        stack,
        meshes: [],
        geometry: holdGeometry(pose.widthPx),
        sleeve: null,
        thicknessPx,
        height: createTween({ from: thicknessPx, to: thicknessPx, ms: 0, now }),
      };
      piles.set(key, pile);
    } else {
      if (widthKeyOf(pose.widthPx) !== pile.geometry.key) {
        const next = holdGeometry(pose.widthPx);
        dropGeometry(pile.geometry);
        pile.geometry = next;
      }
      if (Math.abs(pile.height.target - thicknessPx) > 1e-6) {
        pile.height.retarget(thicknessPx, now, motionReduced() ? 0 : HEIGHT_MS);
      }
      pile.thicknessPx = thicknessPx;
    }
    setSleeve(pile, topSrc);
    setLayers(pile, total, thicknessPx);
    pile.stack.position.set(pose.x, pose.y, PILE_LIFT_PX);
    pile.stack.rotation.set(0, 0, -(Number.isFinite(pose.yawDeg) ? pose.yawDeg : 0) * DEG);
    placeHeight(pile, now);
  };

  const update = (nowMs) => {
    if (disposed) return false;
    const now = Number.isFinite(nowMs) ? nowMs : clock.now();
    let moving = false;
    for (const pile of piles.values()) {
      placeHeight(pile, now);
      if (!pile.height.done(now)) moving = true;
    }
    return moving;
  };

  const objects = () => [...piles.values()].map((pile) => pile.stack);

  const pileAt = (object3d) => {
    for (let node = object3d; node; node = node.parent) {
      const key = node.userData?.boardPile;
      const pile = key ? piles.get(key) : null;
      if (pile) return { side: pile.side, zone: pile.zone };
    }
    return null;
  };

  const meshCount = () => [...piles.values()].reduce((sum, pile) => sum + pile.meshes.length, 0);

  const dispose = () => {
    if (disposed) return;
    for (const pile of [...piles.values()]) clear(pile.side, pile.zone);
    disposed = true;
    for (const entry of geometries.values()) entry.geometry.dispose();
    geometries.clear();
    paper.dispose();
    rim.dispose();
  };

  return { setPile, clear, update, objects, pileAt, meshCount, dispose };
}
