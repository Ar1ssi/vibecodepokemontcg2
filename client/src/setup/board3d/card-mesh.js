// Pooled card meshes for the three.js board (design 074 §D3 "Cards", O5-A, O12). One
// ExtrudeGeometry per card width (rounded corners, a real edge), material groups [front, back,
// rim]. Materials are shared: one front per card image, one back per sleeve, one foil material
// per TCG Live foil record (edge case 32), one rim for every card. Poses are flat table px
// (card-poses.mjs) placed with board-camera.mjs `tableToWorld` and tweened on the scene clock.
// `three` is the namespace from `import('three')`; this module never imports it statically.
import { textureUrlFor } from '../gl/card-art-hosts.mjs';
import { DEFAULT_FOIL_UV } from '../foil/tcgl-foil-manifest.mjs';
import { DEFAULT_TILT_DEG } from '../sizing/table-tilt.mjs';
import { tableToWorld } from './board-camera.mjs';
import {
  CARD_UNITS,
  cardCornerRadius,
  cardScaleFor,
  roundedRectShapePoints,
} from './card-geometry.mjs';
import { createTween } from './tween.mjs';

const DEG = Math.PI / 180;
/** Material group indices of every card geometry. */
const FRONT = 0;
const BACK = 1;
const RIM = 2;
const RIM_COLOR = 0xe8e2d4;
/** Shown on a back face whose sleeve has not loaded (or failed): a plain dark card back. */
const BLANK_BACK_COLOR = 0x1d2b4c;
/** Back → front turn when a face-down card is revealed (edge case 4). */
const FLIP_MS = 300;
/** A failed card image is tried once more after this long (edge case 12). */
const RETRY_MS = 5000;
/** Resting height of a card's underside above the cloth: over the mat overlay (table-mesh Z.overlay = 1). */
const CARD_LIFT_PX = 1.5;
const PLAIN_UV = Object.freeze({ u0: 0, u1: 1, v0: 0, v1: 1 });

const uvKeyOf = (uv) =>
  uv === PLAIN_UV ? 'plain' : `foil:${uv.u0},${uv.u1},${uv.v0},${uv.v1}`;
const widthKeyOf = (widthPx) => Math.round(widthPx * 100) / 100;

/**
 * Card slab `widthPx` wide, centred on the origin (z from -t/2 to +t/2), front cap facing +z.
 * ExtrudeGeometry puts both lids in group 0 (the back lid at z = 0 first, then the front lid at
 * z = depth, equal counts) and the side walls in group 1; they are regrouped to [front, back,
 * rim]. Its lid UVs are in shape units, so they are rewritten: the front spans `uv` over the
 * card, the back spans the sleeve mirrored in x so it reads correctly once the card is turned
 * over about its vertical axis. A +x tangent per vertex is what the foil shaders read.
 */
function buildCardGeometry(three, widthPx, uv) {
  const w = widthPx;
  const h = (w * CARD_UNITS.h) / CARD_UNITS.w;
  const t = CARD_UNITS.t * cardScaleFor(w);
  const outline = roundedRectShapePoints(w, h, cardCornerRadius(w));
  const shape = new three.Shape(
    outline.map(([x, y]) => new three.Vector2(x, y))
  );
  const geometry = new three.ExtrudeGeometry(shape, {
    depth: t,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -t / 2);

  const caps = geometry.groups.find((g) => g.materialIndex === 0);
  const sides = geometry.groups.find((g) => g.materialIndex === 1);
  const lid = caps.count / 2;
  geometry.clearGroups();
  geometry.addGroup(caps.start + lid, lid, FRONT);
  geometry.addGroup(caps.start, lid, BACK);
  geometry.addGroup(sides.start, sides.count, RIM);

  const position = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  for (let i = caps.start; i < caps.start + caps.count; i++) {
    const s = position.getX(i) / w + 0.5;
    const r = position.getY(i) / h + 0.5;
    if (i >= caps.start + lid)
      uvs.setXY(i, uv.u0 + s * (uv.u1 - uv.u0), uv.v0 + r * (uv.v1 - uv.v0));
    else uvs.setXY(i, 1 - s, r);
  }
  uvs.needsUpdate = true;
  const tangent = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i++) tangent.set([1, 0, 0, 1], i * 4);
  geometry.setAttribute('tangent', new three.BufferAttribute(tangent, 4));
  geometry.computeBoundingSphere();
  return { geometry, w, h, t };
}

/**
 * @param {{ group: import('three').Group, three: typeof import('three'),
 *   textures: { acquire: (url: string, o?: object) => Promise<import('three').Texture>,
 *     release: (url: string, o?: object) => void },
 *   clock: { now: () => number },
 *   foil?: { createMaterial: (record: object) => import('three').Material,
 *     recordFor?: (placement: object) => object|null,
 *     uv?: (() => { u0: number, u1: number, v0: number, v1: number }) | object } | null,
 *   motionReduced?: () => boolean, onNeedsRender?: () => void,
 *   timers?: { set: (fn: () => void, ms: number) => unknown, clear: (id: unknown) => void } }} deps
 *   `foil.createMaterial` is `createFoilMaterial` (tcgl-foil-material.js): its `ready`, `update`
 *   and `release` are used; `uv` is the manifest's card window of the square foil front.
 * @returns {{ acquire: (id: number, o: { widthPx: number }) => import('three').Mesh,
 *   release: (id: number) => void,
 *   setFaces: (id: number, faces: { src?: string|null, backSrc?: string|null,
 *     face?: 'front'|'back', foilRecord?: object|null }) => void,
 *   setPose: (id: number, pose: import('./card-poses.mjs').CardPose, ms: number) => void,
 *   setHidden: (id: number, hidden: boolean) => void, setCamera: (desc: object|null) => void,
 *   has: (id: number) => boolean, meshOf: (id: number) => import('three').Mesh|null,
 *   idAt: (object3d: import('three').Object3D|null) => number|null, ids: () => number[],
 *   cornersOf: (id: number) => number[][]|null, update: (nowMs: number) => boolean,
 *   dispose: () => void }}
 *   A card whose image fails shows its back on both faces and the image is tried once more
 *   after 5 s (edge case 12); its name label is a text plane of slice C5. `update(now)` places
 *   every moving card and answers whether another frame is needed (a tween is running, or a
 *   visible foil animates while motion is allowed).
 */
export function createCardMeshPool({
  group,
  three,
  textures,
  clock,
  foil = null,
  motionReduced = () => false,
  onNeedsRender = () => {},
  timers = {
    set: (fn, ms) => globalThis.setTimeout(fn, ms),
    clear: (id) => globalThis.clearTimeout(id),
  },
}) {
  const cards = new Map();
  const geometries = new Map();
  const fronts = new Map();
  const backs = new Map();
  const foils = new Map();
  const rim = new three.MeshStandardMaterial({
    color: RIM_COLOR,
    roughness: 0.7,
    metalness: 0,
  });
  const blankBack = new three.MeshStandardMaterial({
    color: BLANK_BACK_COLOR,
    roughness: 0.55,
    metalness: 0,
  });
  let camera = null;
  let disposed = false;

  const foilUv = () => {
    const uv = typeof foil?.uv === 'function' ? foil.uv() : foil?.uv;
    return uv && Number.isFinite(uv.u0) ? uv : DEFAULT_FOIL_UV;
  };

  const holdGeometry = (widthPx, uv) => {
    const key = `${widthKeyOf(widthPx)}|${uvKeyOf(uv)}`;
    let entry = geometries.get(key);
    if (!entry) {
      entry = {
        key,
        refs: 0,
        ...buildCardGeometry(three, widthKeyOf(widthPx), uv),
      };
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

  /** Re-picks every card's materials after an image or foil finished (or failed) loading. */
  const refreshAll = () => {
    if (disposed) return;
    for (const card of cards.values()) applyMaterials(card);
    onNeedsRender();
  };

  // ── card images (fronts and sleeves): one material per src, refcounted.
  const loadArt = (cache, entry) => {
    entry.state = 'loading';
    textures.acquire(entry.url, { colorSpace: 'srgb' }).then(
      (texture) => {
        if (cache.get(entry.src) !== entry) {
          textures.release(entry.url, { colorSpace: 'srgb' });
          return;
        }
        entry.texture = texture;
        entry.material.map = texture;
        entry.material.needsUpdate = true;
        entry.state = 'ready';
        refreshAll();
      },
      (error) => {
        if (cache.get(entry.src) !== entry) return;
        entry.state = 'failed';
        console.warn(
          `board3d: card image failed (${entry.url})`,
          error?.message || error
        );
        if (!entry.retried) {
          entry.retried = true;
          entry.timer = timers.set(() => {
            entry.timer = null;
            if (cache.get(entry.src) === entry) loadArt(cache, entry);
          }, RETRY_MS);
        }
        refreshAll();
      }
    );
  };

  const holdArt = (cache, src) => {
    let entry = cache.get(src);
    if (!entry) {
      entry = {
        src,
        url: textureUrlFor(src),
        refs: 0,
        state: 'loading',
        texture: null,
        retried: false,
        timer: null,
        material: new three.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.55,
          metalness: 0,
        }),
      };
      cache.set(src, entry);
      loadArt(cache, entry);
    }
    entry.refs += 1;
    return entry;
  };

  const dropArt = (cache, entry) => {
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    cache.delete(entry.src);
    if (entry.timer !== null) timers.clear(entry.timer);
    if (entry.texture) textures.release(entry.url, { colorSpace: 'srgb' });
    entry.material.dispose();
  };

  // ── foil: one material per record, shared by every mesh wearing it (edge case 32).
  const holdFoil = (record) => {
    let entry = foils.get(record);
    if (!entry) {
      let material = null;
      try {
        material = foil.createMaterial(record);
      } catch (error) {
        console.warn(
          `board3d: foil ${record.tcglId} unavailable`,
          error?.message || error
        );
      }
      entry = {
        record,
        refs: 0,
        material,
        state: material ? 'loading' : 'failed',
      };
      foils.set(record, entry);
      if (material) {
        // The material is shared: write this mesh's matrices and the clock time before each draw.
        material.onBeforeRender = (
          _renderer,
          _scene,
          renderCamera,
          _geometry,
          object
        ) => {
          material.update?.(object, renderCamera, clock.now() / 1000);
          material.uniformsNeedUpdate = true;
        };
        Promise.resolve(material.ready).then(
          () => {
            if (foils.get(record) !== entry) return;
            entry.state = 'ready';
            refreshAll();
          },
          (error) => {
            if (foils.get(record) !== entry) return;
            entry.state = 'failed';
            console.warn(
              `board3d: foil ${record.tcglId} failed`,
              error?.message || error
            );
            refreshAll();
          }
        );
      }
    }
    entry.refs += 1;
    return entry;
  };

  const dropFoil = (entry) => {
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    foils.delete(entry.record);
    if (typeof entry.material?.release === 'function') entry.material.release();
    else entry.material?.dispose?.();
  };

  // ── per card
  const setGeometry = (card, widthPx, uv) => {
    const next = holdGeometry(widthPx, uv);
    dropGeometry(card.geometry);
    card.geometry = next;
    card.widthPx = widthPx;
    card.mesh.geometry = next.geometry;
  };

  /** Front: foil when ready, else the card image when ready, else the back (loading or failed). */
  function applyMaterials(card) {
    const back = card.back?.state === 'ready' ? card.back.material : blankBack;
    const wearsFoil = card.foil?.state === 'ready';
    let front = back;
    if (wearsFoil) front = card.foil.material;
    else if (card.front?.state === 'ready') front = card.front.material;
    const uv = wearsFoil ? foilUv() : PLAIN_UV;
    if (card.geometry.key !== `${widthKeyOf(card.widthPx)}|${uvKeyOf(uv)}`) {
      setGeometry(card, card.widthPx, uv);
    }
    const materials = card.mesh.material;
    if (materials[FRONT] !== front || materials[BACK] !== back) {
      card.mesh.material = [front, back, rim];
    }
    card.foilLive = wearsFoil;
  }

  const placeMesh = (card, now) => {
    const pose = card.pose.at(now);
    const flipDeg = card.flip ? card.flip.at(now) : 0;
    const scale = pose.s;
    const height = pose.z + CARD_LIFT_PX + (card.geometry.t * scale) / 2;
    const [x, y, z] = tableToWorld(
      { x: pose.x, y: pose.y, z: height },
      camera ?? undefined
    );
    const tiltDeg = camera?.tiltDeg ?? DEFAULT_TILT_DEG;
    // Tilt with the table, then yaw on the cloth (clockwise, like CSS rotate), then the turn over.
    card.mesh.rotation.set(
      -tiltDeg * DEG,
      flipDeg * DEG,
      -pose.yawDeg * DEG,
      'XZY'
    );
    card.mesh.position.set(x, y, z);
    card.mesh.scale.setScalar(scale);
  };

  const withCard = (id, fn) => {
    if (disposed) return;
    const card = cards.get(id);
    if (card) fn(card);
  };

  const durationFor = (ms) =>
    motionReduced() ? 0 : Math.max(0, Number(ms) || 0);

  const setFace = (card, face, now) => {
    const target = face === 'back' ? 180 : 0;
    if (!card.flip) {
      card.flip = createTween({ from: target, to: target, ms: 0, now });
    } else if (card.flip.target !== target) {
      card.flip.retarget(target, now, durationFor(FLIP_MS));
    }
    card.face = face === 'back' ? 'back' : 'front';
    card.dirty = true;
  };

  const acquire = (id, { widthPx } = {}) => {
    if (disposed) return null;
    const existing = cards.get(id);
    if (existing) return existing.mesh;
    const width = widthPx > 0 ? widthPx : CARD_UNITS.w;
    const geometry = holdGeometry(width, PLAIN_UV);
    const mesh = new three.Mesh(geometry.geometry, [blankBack, blankBack, rim]);
    mesh.name = `board3d-card-${id}`;
    mesh.castShadow = true;
    mesh.userData.boardCardId = id;
    group.add(mesh);
    cards.set(id, {
      id,
      mesh,
      geometry,
      widthPx: width,
      front: null,
      frontSrc: null,
      back: null,
      backSrc: null,
      foil: null,
      foilRecord: null,
      foilLive: false,
      face: 'front',
      hidden: false,
      pose: null,
      flip: null,
      dirty: true,
    });
    mesh.visible = false;
    return mesh;
  };

  const release = (id) =>
    withCard(id, (card) => {
      cards.delete(id);
      group.remove(card.mesh);
      dropArt(fronts, card.front);
      dropArt(backs, card.back);
      dropFoil(card.foil);
      dropGeometry(card.geometry);
      onNeedsRender();
    });

  const setFaces = (id, faces = {}) =>
    withCard(id, (card) => {
      if ('src' in faces && (faces.src || null) !== card.frontSrc) {
        dropArt(fronts, card.front);
        card.frontSrc = faces.src || null;
        card.front = card.frontSrc ? holdArt(fronts, card.frontSrc) : null;
      }
      if ('backSrc' in faces && (faces.backSrc || null) !== card.backSrc) {
        dropArt(backs, card.back);
        card.backSrc = faces.backSrc || null;
        card.back = card.backSrc ? holdArt(backs, card.backSrc) : null;
      }
      if ('foilRecord' in faces) {
        const record = foil && faces.foilRecord ? faces.foilRecord : null;
        if (record !== card.foilRecord) {
          dropFoil(card.foil);
          card.foilRecord = record;
          card.foil = record ? holdFoil(record) : null;
        }
      }
      if (faces.face) setFace(card, faces.face, clock.now());
      applyMaterials(card);
      onNeedsRender();
    });

  const setPose = (id, pose, ms) =>
    withCard(id, (card) => {
      if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y)) return;
      const now = clock.now();
      const duration = durationFor(ms);
      const target = {
        x: pose.x,
        y: pose.y,
        z: Number.isFinite(pose.z) ? pose.z : 0,
        yawDeg: Number.isFinite(pose.yawDeg) ? pose.yawDeg : 0,
        s: 1,
      };
      const widthPx = pose.widthPx > 0 ? pose.widthPx : card.widthPx;
      if (!card.pose) {
        if (widthPx !== card.widthPx) setGeometry(card, widthPx, PLAIN_UV);
        card.pose = createTween({ from: target, to: target, ms: 0, now });
        applyMaterials(card);
      } else if (Math.abs(widthPx - card.widthPx) > 0.01) {
        // A new width swaps the geometry at once and tweens the scale from the size on screen.
        const current = card.pose.at(now);
        const shownPx = card.widthPx * current.s;
        setGeometry(card, widthPx, PLAIN_UV);
        applyMaterials(card);
        card.pose = createTween({
          from: { ...current, s: shownPx / widthPx },
          to: target,
          ms: duration,
          now,
        });
      } else {
        card.pose.retarget(target, now, duration);
      }
      if (pose.face) setFace(card, pose.face, now);
      card.mesh.visible = !card.hidden;
      card.dirty = true;
      placeMesh(card, now);
      onNeedsRender();
    });

  const setHidden = (id, hidden) =>
    withCard(id, (card) => {
      card.hidden = Boolean(hidden);
      card.mesh.visible = Boolean(card.pose) && !card.hidden;
      onNeedsRender();
    });

  const setCamera = (desc) => {
    if (disposed) return;
    camera = desc ?? null;
    for (const card of cards.values()) card.dirty = true;
    onNeedsRender();
  };

  const update = (nowMs) => {
    if (disposed) return false;
    const now = Number.isFinite(nowMs) ? nowMs : clock.now();
    let moving = false;
    let foilShown = false;
    for (const card of cards.values()) {
      if (!card.pose) continue;
      const running =
        !card.pose.done(now) || (card.flip && !card.flip.done(now));
      if (running || card.dirty) placeMesh(card, now);
      card.dirty = Boolean(running);
      if (running) moving = true;
      if (card.foilLive && card.mesh.visible && card.face === 'front')
        foilShown = true;
    }
    return moving || (foilShown && !motionReduced());
  };

  const has = (id) => cards.has(id);
  const meshOf = (id) => cards.get(id)?.mesh ?? null;
  const ids = () => [...cards.keys()];

  const idAt = (object3d) => {
    for (let node = object3d; node; node = node.parent) {
      const id = node.userData?.boardCardId;
      if (id !== undefined && cards.get(id)?.mesh === node) return id;
    }
    return null;
  };

  /** World corners of a card's front face as currently placed: [x, y, z][] or null. */
  const cornersOf = (id) => {
    const card = cards.get(id);
    if (!card) return null;
    const { w, h, t } = card.geometry;
    card.mesh.updateMatrixWorld();
    return [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([x, y]) =>
      card.mesh.localToWorld(new three.Vector3(x, y, t / 2)).toArray()
    );
  };

  const dispose = () => {
    if (disposed) return;
    for (const id of [...cards.keys()]) release(id);
    disposed = true;
    for (const entry of geometries.values()) entry.geometry.dispose();
    geometries.clear();
    rim.dispose();
    blankBack.dispose();
  };

  return {
    acquire,
    release,
    setFaces,
    setPose,
    setHidden,
    setCamera,
    has,
    meshOf,
    idAt,
    ids,
    cornersOf,
    update,
    dispose,
  };
}
