// Pooled card meshes for the three.js board (design 074 §D3 "Cards", O5-A, O12). One
// ExtrudeGeometry per card width (rounded corners, a real edge), material groups [front, back,
// rim]. Materials are shared: one front per card image, one back per sleeve, one foil material
// per TCG Live foil record (edge case 32), one rim for every card. Poses are flat table px
// (card-poses.mjs) placed with board-camera.mjs `tableToWorld` and tweened on the scene clock.
// `three` is the namespace from `import('three')`; this module never imports it statically.
import { textureUrlFor } from '../gl/card-art-hosts.mjs';
import { createCardArtMaterial } from '../gl/card-art-material.js';
import { DEFAULT_FOIL_UV } from '../foil/tcgl-foil-manifest.mjs';
import { DEFAULT_TILT_DEG } from '../sizing/table-tilt.mjs';
import { tableToWorld } from './board-camera.mjs';
import {
  CARD_UNITS,
  cardCornerRadius,
  cardScaleFor,
  roundedRectShapePoints,
} from './card-geometry.mjs';
import { flightPlacement } from './flight-pose.mjs';
import { createTween, easeOutCubic } from './tween.mjs';

const DEG = Math.PI / 180;
/** mat-ambient.css `.mat-holo .card__rotator { transition: transform 0.12s ease-out }`, as a time constant. */
const HOVER_TILT_TAU_MS = 40;
const HOVER_TILT_SNAP_DEG = 0.01;
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
/**
 * After a flight lands the mesh stays shown this long (scene clock) before the card's own hidden
 * state applies again: the effect that hid the card reveals it a beat after the flight resolves.
 */
const FLIGHT_TAIL_MS = 100;
/** `.cmd-pending` (index.css): a card whose command is in flight shows at 60 % opacity. */
const PENDING_OPACITY = 0.6;

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
 *   viewOrigin?: () => { left: number, top: number },
 *   timers?: { set: (fn: () => void, ms: number) => unknown, clear: (id: unknown) => void } }} deps
 *   `foil.createMaterial` is `createFoilMaterial` (tcgl-foil-material.js): its `ready`, `update`
 *   and `release` are used; `uv` is the manifest's card window of the square foil front.
 * @returns {{ acquire: (id: number, o: { widthPx: number }) => import('three').Mesh,
 *   release: (id: number) => void,
 *   setFaces: (id: number, faces: { src?: string|null, backSrc?: string|null,
 *     face?: 'front'|'back', foilRecord?: object|null }) => void,
 *   setPose: (id: number, pose: import('./card-poses.mjs').CardPose, ms: number) => void,
 *   tween: (id: number, poseFn: (t: number) => object, ms: number, o?: { ease?: (t: number) => number }) =>
 *     Promise<void>,
 *   lift: (id: number, pose: object, o?: { ms?: number, ease?: (t: number) => number }) => Promise<void>,
 *   unlift: (id: number, o?: { ms?: number, ease?: (t: number) => number }) => Promise<void>,
 *   liftedId: () => number|null,
 *   setHidden: (id: number, hidden: boolean) => void, setCamera: (desc: object|null) => void,
 *   setTilt: (id: number, tilt: { roll: number, pitch: number }|null) => void,
 *   setHoverTilt: (id: number, tilt: { x: number, y: number }|null) => void,
 *   wearsFoil: (id: number) => boolean,
 *   setDim: (id: number, dim: boolean) => void,
 *   has: (id: number) => boolean, placed: (id: number) => boolean, meshOf: (id: number) => import('three').Mesh|null,
 *   idAt: (object3d: import('three').Object3D|null) => number|null, ids: () => number[],
 *   cornersOf: (id: number, o?: { rest?: boolean }) => number[][]|null, update: (nowMs: number) => boolean,
 *   dispose: () => void }}
 *   A card whose image fails shows its back on both faces and the image is tried once more
 *   after 5 s (edge case 12); its name label is a text plane of slice C5. `update(now)` places
 *   every moving card and answers whether another frame is needed (a tween is running, or a
 *   visible foil animates while motion is allowed).
 *   `tween` (design 074 H1) flies a card: for `ms` of scene time `poseFn(t)` (t eased 0 → 1) gives
 *   `{ rect, rotateZDeg, tiltXDeg, lift, flipDeg }` in viewport px (flight-pose.mjs) and the mesh
 *   sits there; the card's own pose is suspended and the mesh is shown, hidden or not. It resolves
 *   when t reaches 1 (one frame after, with motion reduced), when a newer tween on the card
 *   replaces it, or when the card is released. The next frame after it ends puts the mesh back on
 *   the card's own pose.
 *   `lift` (design 074 H2, card focus) flies the mesh from where it is to a held `pose` (the tween
 *   pose shape, constant) and keeps it there: the card's own pose is suspended (setPose and hover
 *   re-poses update their tween but do not move the mesh), the mesh is shown, hidden or not, and
 *   the held pose is re-fitted every frame so a camera change (a resize) keeps its screen rect.
 *   The flight blends the mesh's transform to the target's (position, slerp, scale), so it starts
 *   exactly where the card stands. Lifting a card already lifted retargets it with no flight when
 *   `ms` is 0, else flies from where it is. The promise resolves when the mesh has landed. `unlift`
 *   flies it back to its own (current) pose and releases it, resolving then; `ms` 0, motion reduced,
 *   or the card leaving the board release at once. A lifted card ignores `tween`.
 *   `cornersOf(id, { rest: true })` gives a lifted card's corners at its own pose.
 */
export function createCardMeshPool({
  group,
  three,
  textures,
  clock,
  foil = null,
  motionReduced = () => false,
  onNeedsRender = () => {},
  viewOrigin = () => ({ left: 0, top: 0 }),
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
        material: createCardArtMaterial(three),
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

  /**
   * This card's own see-through copy of a shared front material (it shares the texture). A
   * card keeps one, rebuilt when its front changes, and drops it when it is no longer dimmed.
   */
  const dimmedFront = (card, base) => {
    if (card.dimFront?.base === base && card.dimFront.material.map === base.map) return card.dimFront.material;
    card.dimFront?.material.dispose();
    const material = createCardArtMaterial(three, { map: base.map });
    material.transparent = true;
    material.opacity = PENDING_OPACITY;
    card.dimFront = { base, material };
    return material;
  };

  const dropDimmedFront = (card) => {
    card.dimFront?.material.dispose();
    card.dimFront = null;
  };

  /**
   * Front: foil when ready, else the card image when ready, else the back (loading or failed).
   * A dimmed card (a command in flight) shows its plain front at PENDING_OPACITY; its foil, a
   * shared shader, waits until the dim ends.
   */
  function applyMaterials(card) {
    const back = card.back?.state === 'ready' ? card.back.material : blankBack;
    const wearsFoil = card.foil?.state === 'ready' && !card.dim;
    let front = back;
    if (wearsFoil) front = card.foil.material;
    else if (card.front?.state === 'ready') front = card.front.material;
    if (card.dim) front = dimmedFront(card, front);
    else if (card.dimFront) dropDimmedFront(card);
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

  /**
   * Writes the card's own (model) pose for `now` onto `target`: the mesh, or a scratch object.
   * `hoverTilt: false` leaves out the pointer tilt (a rect measured for that tilt must not move with it).
   */
  const writeRestPose = (card, now, target, { hoverTilt = true } = {}) => {
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
    target.rotation.set(
      -tiltDeg * DEG,
      flipDeg * DEG,
      -pose.yawDeg * DEG,
      'XZY'
    );
    if (card.tilt) applyTilt(target, card.tilt, tiltDeg);
    // mat-ambient.css's holo tilt, `rotateY(x) rotateX(y)` about the card itself (its y is up).
    if (hoverTilt && card.hoverTilt) {
      target.rotateY(card.hoverTilt.x * DEG);
      target.rotateX(-card.hoverTilt.y * DEG);
    }
    target.position.set(x, y, z);
    target.scale.setScalar(scale);
  };

  const placeMesh = (card, now) => {
    if (card.flight || card.lift) return;
    writeRestPose(card, now, card.mesh);
  };

  // A held card's swing (drag-tilt.mjs) about the table's own axes, whatever the card's yaw or
  // face: pitch about the table's x (positive = top edge away, CSS rotateX), roll about the
  // table's normal (positive = clockwise as seen from above, CSS rotateZ).
  const tableX = new three.Vector3(1, 0, 0);
  const tableNormal = new three.Vector3();
  const swing = new three.Quaternion();
  const applyTilt = (mesh, { roll, pitch }, tiltDeg) => {
    tableNormal.set(0, Math.sin(tiltDeg * DEG), Math.cos(tiltDeg * DEG));
    mesh.quaternion.premultiply(swing.setFromAxisAngle(tableX, -pitch * DEG));
    mesh.quaternion.premultiply(swing.setFromAxisAngle(tableNormal, -roll * DEG));
  };

  // ── flights (tween): a card flown by a mat-fx pose instead of its own pose.
  /** Shown while flying or just after landing, else by the card's own hidden state. */
  const visibleOf = (card) =>
    Boolean(card.flight) ||
    Boolean(card.lift) ||
    card.flightTailUntil > 0 ||
    (Boolean(card.pose) && !card.hidden);

  /** Ends a card's flight; the promise resolves. `now` given = it landed (keep the mesh shown a beat). */
  const endFlight = (card, now) => {
    const { flight } = card;
    if (!flight) return;
    card.flight = null;
    if (now !== undefined) card.flightTailUntil = now + FLIGHT_TAIL_MS;
    card.dirty = true;
    flight.resolve();
  };

  /** Puts the mesh at the flight's pose for `now`; true once the flight has reached t = 1. */
  const placeFlight = (card, now) => {
    const { flight } = card;
    const raw = flight.ms > 0 ? Math.min(1, Math.max(0, (now - flight.start) / flight.ms)) : 1;
    const t = raw >= 1 ? 1 : flight.ease(raw);
    let pose = null;
    try {
      pose = flight.poseFn(t);
    } catch (error) {
      console.warn('board3d: card flight pose failed', error?.message || error);
      return true;
    }
    const flipDeg = Number.isFinite(pose?.flipDeg) ? pose.flipDeg : card.flip ? card.flip.at(now) : 0;
    const placement = flightPlacement(
      camera,
      { ...pose, flipDeg },
      { widthPx: card.geometry.w, heightPx: card.geometry.h },
      viewOrigin()
    );
    if (placement) {
      card.mesh.position.set(...placement.position);
      card.mesh.quaternion.set(...placement.quaternion);
      card.mesh.scale.setScalar(placement.scale);
    }
    card.mesh.visible = true;
    return raw >= 1;
  };

  const tween = (id, poseFn, ms, { ease = easeOutCubic } = {}) => {
    const card = disposed ? null : cards.get(id);
    // A lifted card (card focus) is held by `lift`: a flight does not take it over.
    if (!card?.pose || card.lift || !camera || typeof poseFn !== 'function') return Promise.resolve();
    endFlight(card);
    return new Promise((resolve) => {
      const now = clock.now();
      card.flight = { poseFn, ease, start: now, ms: durationFor(ms), resolve };
      card.flightTailUntil = 0;
      placeFlight(card, now);
      onNeedsRender();
    });
  };

  // ── lifts (card focus, design 074 H2): a card held at a pose above the table until released.
  const scratch = new three.Object3D();
  const fromPosition = new three.Vector3();
  const toPosition = new three.Vector3();
  const fromQuaternion = new three.Quaternion();
  const toQuaternion = new three.Quaternion();

  /** The mesh's current transform, as a blend start. */
  const snapshot = (mesh) => ({
    position: mesh.position.toArray(),
    quaternion: mesh.quaternion.toArray(),
    scale: mesh.scale.x,
  });

  /** Where the held pose puts the mesh now (it follows the camera, so a resize re-fits it). */
  const liftTarget = (card, now) => {
    const { pose } = card.lift;
    const flipDeg = Number.isFinite(pose.flipDeg) ? pose.flipDeg : card.flip ? card.flip.at(now) : 0;
    return flightPlacement(
      camera,
      { ...pose, flipDeg, fit: 'leaned' },
      { widthPx: card.geometry.w, heightPx: card.geometry.h, thicknessPx: card.geometry.t },
      viewOrigin()
    );
  };

  /** Where the card's own pose puts the mesh now (what an unlift flies back to). */
  const restTarget = (card, now) => {
    writeRestPose(card, now, scratch);
    return snapshot(scratch);
  };

  const settleLift = (lift) => {
    const waiters = lift.waiters;
    lift.waiters = [];
    for (const resolve of waiters) resolve();
  };

  /** Drops the lift; the card's own pose owns the mesh again from the next placement. */
  const endLift = (card, now) => {
    const { lift } = card;
    if (!lift) return;
    card.lift = null;
    card.dirty = true;
    if (now !== undefined) placeMesh(card, now);
    card.mesh.visible = visibleOf(card);
    settleLift(lift);
  };

  /** Puts the mesh where the lift has it at `now`; true once the current phase has run its time. */
  const placeLift = (card, now) => {
    const { lift } = card;
    const raw = lift.ms > 0 ? Math.min(1, Math.max(0, (now - lift.start) / lift.ms)) : 1;
    const k = raw >= 1 ? 1 : lift.ease(raw);
    const to = lift.phase === 'out' ? restTarget(card, now) : liftTarget(card, now);
    if (to) {
      const { mesh } = card;
      if (lift.from && k < 1) {
        fromPosition.fromArray(lift.from.position);
        toPosition.fromArray(to.position);
        mesh.position.lerpVectors(fromPosition, toPosition, k);
        fromQuaternion.fromArray(lift.from.quaternion);
        toQuaternion.fromArray(to.quaternion);
        mesh.quaternion.copy(fromQuaternion.slerp(toQuaternion, k));
        mesh.scale.setScalar(lift.from.scale + (to.scale - lift.from.scale) * k);
      } else {
        mesh.position.fromArray(to.position);
        mesh.quaternion.fromArray(to.quaternion);
        mesh.scale.setScalar(to.scale);
      }
    }
    card.mesh.visible = true;
    return raw >= 1;
  };

  const liftOf = (card, pose, from, now, ms, ease, phase) => ({
    pose,
    phase,
    from,
    start: now,
    ms,
    ease,
    waiters: card.lift?.waiters ?? [],
  });

  const isUsableRect = (rect) =>
    Boolean(rect) &&
    [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0;

  const lift = (id, pose, { ms = 0, ease = easeOutCubic } = {}) => {
    const card = disposed ? null : cards.get(id);
    if (!card?.pose || !camera || !isUsableRect(pose?.rect)) return Promise.resolve();
    const now = clock.now();
    const duration = durationFor(ms);
    const current = card.lift;
    if (current && current.phase !== 'out' && duration === 0) {
      // Same lift, new target (a resize): no flight.
      current.pose = pose;
      placeLift(card, now);
      onNeedsRender();
      return Promise.resolve();
    }
    endFlight(card);
    card.flightTailUntil = 0;
    if (!current) placeMesh(card, now);
    const from = snapshot(card.mesh);
    return new Promise((resolve) => {
      if (current) settleLift(current);
      card.lift = liftOf(card, pose, from, now, duration, ease, 'in');
      card.lift.waiters.push(resolve);
      if (placeLift(card, now)) {
        card.lift.phase = 'held';
        card.lift.from = null;
        settleLift(card.lift);
      }
      onNeedsRender();
    });
  };

  const unlift = (id, { ms = 0, ease = easeOutCubic } = {}) => {
    const card = disposed ? null : cards.get(id);
    if (!card?.lift) return Promise.resolve();
    const now = clock.now();
    const duration = durationFor(ms);
    if (duration === 0) {
      endLift(card, now);
      onNeedsRender();
      return Promise.resolve();
    }
    const current = card.lift;
    return new Promise((resolve) => {
      if (current.phase !== 'out') {
        // Anyone waiting on the lift-in is released: the card is on its way back.
        settleLift(current);
        card.lift = liftOf(card, current.pose, snapshot(card.mesh), now, duration, ease, 'out');
      }
      card.lift.waiters.push(resolve);
      onNeedsRender();
    });
  };

  /** The card held by a lift (in, held or out), or null. */
  const liftedId = () => {
    for (const card of cards.values()) if (card.lift) return card.id;
    return null;
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
      tilt: null,
      hoverTilt: null,
      hoverTiltGoal: null,
      hoverTiltAt: 0,
      dim: false,
      dimFront: null,
      flight: null,
      flightTailUntil: 0,
      lift: null,
      dirty: true,
    });
    mesh.visible = false;
    return mesh;
  };

  const release = (id) =>
    withCard(id, (card) => {
      endFlight(card);
      endLift(card);
      cards.delete(id);
      group.remove(card.mesh);
      dropDimmedFront(card);
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
      card.mesh.visible = visibleOf(card);
      card.dirty = true;
      placeMesh(card, now);
      onNeedsRender();
    });

  /**
   * A card's pointer tilt in degrees (mat-tilt.mjs `matTiltAngles`: x = rotateY, y = rotateX);
   * null = flat. The card eases there (`stepHoverTilt`).
   */
  const setHoverTilt = (id, tilt) =>
    withCard(id, (card) => {
      const x = Number(tilt?.x) || 0;
      const y = Number(tilt?.y) || 0;
      const heading = card.hoverTiltGoal ?? card.hoverTilt ?? { x: 0, y: 0 };
      if (heading.x === x && heading.y === y) return;
      card.hoverTiltGoal = { x, y };
      card.hoverTiltAt = clock.now();
      onNeedsRender();
    });

  /** Eases a card's pointer tilt toward its goal; true while it moved this frame. */
  const stepHoverTilt = (card, now) => {
    const goal = card.hoverTiltGoal;
    if (!goal) return false;
    const from = card.hoverTilt ?? { x: 0, y: 0 };
    const k = 1 - Math.exp(-Math.max(0, now - card.hoverTiltAt) / HOVER_TILT_TAU_MS);
    card.hoverTiltAt = now;
    const x = from.x + (goal.x - from.x) * k;
    const y = from.y + (goal.y - from.y) * k;
    if (Math.abs(goal.x - x) >= HOVER_TILT_SNAP_DEG || Math.abs(goal.y - y) >= HOVER_TILT_SNAP_DEG) {
      card.hoverTilt = { x, y };
      return true;
    }
    // Arrived: hold the goal (flat = no tilt at all) and stop stepping.
    card.hoverTilt = goal.x === 0 && goal.y === 0 ? null : { ...goal };
    card.hoverTiltGoal = null;
    return true;
  };

  /** Whether the card shows its TCG Live foil now (the 3D board's holo). */
  const wearsFoil = (id) => Boolean(cards.get(id)?.foilLive);

  /** A held card's swing in degrees (drag-tilt.mjs `stepDragTilt`); null or zeros = upright. */
  const setTilt = (id, tilt) =>
    withCard(id, (card) => {
      const roll = Number(tilt?.roll) || 0;
      const pitch = Number(tilt?.pitch) || 0;
      card.tilt = roll || pitch ? { roll, pitch } : null;
      card.dirty = true;
      onNeedsRender();
    });

  /** Dims a card while a command it sent is in flight (`.cmd-pending`); false restores it. */
  const setDim = (id, dim) =>
    withCard(id, (card) => {
      const next = Boolean(dim);
      if (card.dim === next) return;
      card.dim = next;
      applyMaterials(card);
      onNeedsRender();
    });

  const setHidden = (id, hidden) =>
    withCard(id, (card) => {
      card.hidden = Boolean(hidden);
      card.mesh.visible = visibleOf(card);
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
      if (card.lift) {
        if (placeLift(card, now)) {
          if (card.lift.phase === 'out') endLift(card);
          else {
            card.lift.phase = 'held';
            card.lift.from = null;
            settleLift(card.lift);
          }
        }
        if (card.lift) {
          if (card.lift.phase !== 'held') moving = true;
          continue;
        }
      }
      if (card.flight) {
        if (placeFlight(card, now)) endFlight(card, now);
        moving = true;
        continue;
      }
      if (card.flightTailUntil > 0) {
        if (now < card.flightTailUntil) moving = true;
        else {
          card.flightTailUntil = 0;
          card.mesh.visible = visibleOf(card);
        }
      }
      const tilting = stepHoverTilt(card, now);
      const running =
        !card.pose.done(now) || (card.flip && !card.flip.done(now)) || tilting;
      if (running || card.dirty) placeMesh(card, now);
      card.dirty = Boolean(running);
      if (running) moving = true;
      if (card.foilLive && card.mesh.visible && card.face === 'front')
        foilShown = true;
    }
    return moving || (foilShown && !motionReduced());
  };

  const has = (id) => cards.has(id);
  /** True once a card has a pose, i.e. it stands somewhere (hidden or not). */
  const placed = (id) => Boolean(cards.get(id)?.pose);
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
  const cornersOf = (id, { rest = false } = {}) => {
    const card = cards.get(id);
    if (!card) return null;
    const { w, h, t } = card.geometry;
    let object = card.mesh;
    if (rest && (card.lift || card.hoverTilt) && card.pose) {
      // A lifted card still stands at its slot as far as the board is concerned, and a tilted
      // one lies flat there.
      writeRestPose(card, clock.now(), scratch, { hoverTilt: false });
      object = scratch;
      group.updateMatrixWorld();
      scratch.updateMatrix();
      scratch.matrixWorld.multiplyMatrices(group.matrixWorld, scratch.matrix);
    } else {
      card.mesh.updateMatrixWorld();
    }
    return [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([x, y]) =>
      object.localToWorld(new three.Vector3(x, y, t / 2)).toArray()
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
    tween,
    lift,
    unlift,
    liftedId,
    setTilt,
    setHoverTilt,
    wearsFoil,
    setDim,
    setHidden,
    setCamera,
    has,
    placed,
    meshOf,
    idAt,
    ids,
    cornersOf,
    update,
    dispose,
  };
}
