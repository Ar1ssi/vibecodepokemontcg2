// The three.js board's scene (design 074 §D3): camera matched to the CSS tilt, the table, the
// cards in play (C2), the piles, prizes, Stadium and zone counts (C3), both hands fanned with
// hover lift and the card-focus lowered pose (C4), in-card overlays and UI rings (C5), and
// on-demand rendering. `three` is the
// namespace from `import('three')`; this module never imports it statically.
import { projectToScreen, tableToWorld } from './board-camera.mjs';
import { diffModels, placementById } from './board-model.mjs';
import { CARD_UNITS, cardScaleFor } from './card-geometry.mjs';
import { createCardMeshPool } from './card-mesh.js';
import { handGroupsOf, posesFor } from './card-poses.mjs';
import { createCountLabels, createStackBadges } from './count-labels.js';
import { createOverlayMeshes } from './overlay-meshes.js';
import { createPileMeshes } from './pile-mesh.js';
import { PILE_ZONES, pilePose, pileThicknessPx } from './pile-poses.mjs';
import { pileVisualCount } from './pile-stack.mjs';
import { createTable } from './table-mesh.js';

const DEG = Math.PI / 180;
/** A card moving between slots or stacks (design 074 §D3 "Cards"). */
const CARD_POSE_MS = 180;
const FOIL_ROLES = new Set(['root', 'stage']);
const SIDES = ['self', 'opp'];
/** `.self-text { font-size: clamp(10px, 4vh, 20px) }` (self-containers.css), vh of the iframe. */
const COUNT_FONT = { minPx: 10, vh: 4, maxPx: 20 };
/** Card height per width of every card mesh (card-geometry.mjs). */
const CARD_HEIGHT_PER_WIDTH = CARD_UNITS.h / CARD_UNITS.w;
/** Lift of a card's underside off the cloth (card-mesh.js CARD_LIFT_PX, pile-mesh.js PILE_LIFT_PX). */
const CARD_LIFT_PX = 1.5;
/** Pose fields whose change re-poses a card (a tween) even when diffModels saw no move. */
const POSE_FIELDS = ['x', 'y', 'z', 'yawDeg', 'widthPx', 'face', 'hidden'];

const HAND_POSES = new Set(['normal', 'lowered']);

const samePose = (a, b) => Boolean(a && b) && POSE_FIELDS.every((field) => a[field] === b[field]);

const defaultRequestFrame = (fn) => globalThis.requestAnimationFrame?.(fn) ?? globalThis.setTimeout(fn, 16);
const defaultCancelFrame = (id) => (globalThis.cancelAnimationFrame ?? globalThis.clearTimeout)?.(id);

const isPoint = (offset) =>
  offset && Number.isFinite(offset.x) && Number.isFinite(offset.y) && Number.isFinite(offset.ms);

/**
 * Screen offset at `elapsed` ms along a keyframe list `{ x, y, ms }` (ms from the shake's start,
 * ascending), interpolated linearly; past the last key it holds the last key.
 */
function offsetAt(keys, elapsed) {
  if (elapsed <= keys[0].ms) return keys[0];
  for (let i = 1; i < keys.length; i += 1) {
    const prev = keys[i - 1];
    const next = keys[i];
    if (elapsed <= next.ms) {
      const span = next.ms - prev.ms;
      const t = span > 0 ? (elapsed - prev.ms) / span : 1;
      return { x: prev.x + (next.x - prev.x) * t, y: prev.y + (next.y - prev.y) * t };
    }
  }
  return keys[keys.length - 1];
}

/**
 * @param {{ host: HTMLElement, canvas: HTMLCanvasElement, renderer: import('three').WebGLRenderer,
 *   textures: { acquire: Function, release: Function },
 *   clock: ReturnType<typeof import('./scene-clock.js').createSceneClock>,
 *   three: typeof import('three'), RoomEnvironment?: Function|null,
 *   foil?: { recordFor: (placement: object) => object|null, createMaterial: Function,
 *     uv?: Function|object }|null, motionReduced?: () => boolean,
 *   requestFrame?: (fn: FrameRequestCallback) => number, cancelFrame?: (id: number) => void }} deps
 *   The scene does not own `renderer`, `textures` or `clock`; its `dispose()` leaves them to the caller.
 *   `foil` (card-mesh.js) dresses the visible card of a stack in its TCG Live foil; null = none.
 * @returns {{ applyModel: (model: object) => void, setLayout: (layout: object) => void,
 *   setCamera: (desc: ReturnType<typeof import('./board-camera.mjs').cameraFromCssTilt>) => void,
 *   setViewport: (size: { w: number, h: number }) => void, invalidate: () => void, render: () => void,
 *   rects: () => Record<string, { left: number, top: number, width: number, height: number }>,
 *   hitTest: (clientX: number, clientY: number) => ({ instanceId: number|null, side: string|null,
 *     zone: string, index?: number, pile?: true, point: number[] })|null, refreshCards: () => void,
 *   shake: (offsets: { x: number, y: number, ms: number }[]) => Promise<void>,
 *   setUiState: (id: number, patch: object) => void, setMat: (spec: object|null) => void,
 *   setHover: (instanceId: number|null) => void, setHandPose: (pose: 'normal'|'lowered') => void,
 *   inspect: () => { scene: import('three').Scene, camera: import('three').PerspectiveCamera,
 *     host: HTMLElement, canvas: HTMLCanvasElement, layout: object|null, cameraDesc: object|null, model: object|null, uiState: Map<number, object>,
 *     cards: ReturnType<typeof createCardMeshPool>, piles: ReturnType<typeof createPileMeshes>,
 *     labels: ReturnType<typeof createCountLabels>, badges: ReturnType<typeof createStackBadges>,
 *     overlays: ReturnType<typeof createOverlayMeshes>,
 *     hover: number|null, handPose: 'normal'|'lowered' },
 *   dispose: () => void, clock: object }}
 */
export function createBoardScene({
  host,
  canvas,
  renderer,
  textures,
  clock,
  three,
  RoomEnvironment = null,
  foil = null,
  motionReduced = () => false,
  requestFrame = defaultRequestFrame,
  cancelFrame = defaultCancelFrame,
}) {
  const scene = new three.Scene();
  scene.name = 'board3d';
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = three.PCFSoftShadowMap;

  // The table frame of board-layout.mjs, turned by the tilt about the pivot (board-camera.mjs).
  const tableFrame = new three.Group();
  tableFrame.name = 'board3d-table-frame';
  scene.add(tableFrame);

  const table = createTable({ scene, textures, three, renderer, RoomEnvironment });
  tableFrame.add(table.group);

  // Piles and count labels sit in the table frame, so they tilt with the cloth.
  const pilesGroup = new three.Group();
  pilesGroup.name = 'board3d-piles';
  tableFrame.add(pilesGroup);
  const labelsGroup = new three.Group();
  labelsGroup.name = 'board3d-count-labels';
  tableFrame.add(labelsGroup);

  const camera = new three.PerspectiveCamera(30, 1, 1, 10000);
  let cameraDesc = null;
  let layout = null;
  let model = null;
  /** Last pose given to each card mesh, so a pose change without a diff move still tweens. */
  const appliedPoses = new Map();
  /** Height of each pile's top surface off its resting height (flat px), by `side:zone`. */
  const pileTops = new Map();
  /** Hand card under the pointer (its fan slot lifts) and the near hand's pose (card focus). */
  let hover = null;
  let handPose = 'normal';
  const uiState = new Map();
  let shakeOffset = { x: 0, y: 0 };
  let stopShake = null;
  let frameId = null;
  let disposed = false;

  const contextLost = () => {
    try {
      return renderer.getContext().isContextLost();
    } catch {
      return true;
    }
  };

  // Cards live in world space: card-mesh.js places them with tableToWorld (the camera's tilt).
  const cardsGroup = new three.Group();
  cardsGroup.name = 'board3d-cards';
  scene.add(cardsGroup);
  const raycaster = new three.Raycaster();

  /** Renders one frame; keeps rendering on the next frame while a card tween or foil runs. */
  const render = () => {
    if (disposed || contextLost()) return;
    const now = clock.now();
    const cardsMoving = pool.update(now);
    const pilesMoving = piles.update(now);
    const overlaysMoving = overlays.update(now);
    const animating = cardsMoving || pilesMoving || overlaysMoving;
    renderer.render(scene, camera);
    if (animating) invalidate();
  };

  const invalidate = () => {
    if (disposed || frameId !== null) return;
    frameId = requestFrame(() => {
      frameId = null;
      render();
    });
  };

  const pool = createCardMeshPool({
    group: cardsGroup,
    three,
    textures,
    clock,
    foil,
    motionReduced,
    onNeedsRender: invalidate,
  });

  const piles = createPileMeshes({
    group: pilesGroup,
    three,
    textures,
    clock,
    motionReduced,
    onNeedsRender: invalidate,
  });
  const labels = createCountLabels({ group: labelsGroup, three });
  const badges = createStackBadges({ three });
  const overlays = createOverlayMeshes({ three, textures, clock, motionReduced, onNeedsRender: invalidate });

  table.onChange(invalidate);

  /** A screen-px shake moves the image, so it shifts the view window, not the eye. */
  const applyViewOffset = () => {
    if (!cameraDesc) return;
    const view = cameraDesc.viewOffset;
    camera.setViewOffset(
      view.fullWidth,
      view.fullHeight,
      view.x - shakeOffset.x,
      view.y - shakeOffset.y,
      view.width,
      view.height
    );
  };

  const setCamera = (desc) => {
    if (disposed || !desc) return;
    cameraDesc = desc;
    camera.fov = desc.fov;
    camera.aspect = desc.aspect;
    camera.near = desc.near;
    camera.far = desc.far;
    camera.position.set(...desc.position);
    camera.up.set(...desc.up);
    camera.lookAt(...desc.target);
    tableFrame.rotation.x = -desc.tiltDeg * DEG;
    camera.updateProjectionMatrix();
    applyViewOffset();
    pool.setCamera(desc);
    invalidate();
  };

  const setViewport = ({ w, h } = {}) => {
    if (disposed || !(w > 0 && h > 0)) return;
    renderer.setSize(Math.round(w), Math.round(h), false);
    if (!cameraDesc) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    invalidate();
  };

  const setLayout = (next) => {
    if (disposed || !next) return;
    layout = next;
    table.setLayout(next);
    syncCards(model, model, { relayout: true });
    syncPiles(model);
    invalidate();
  };

  const setMat = (spec) => {
    if (disposed) return;
    table.setMat(spec);
    invalidate();
  };

  /** The visible card of a stack (no offset, not a Tool/Energy) keeps its foil, as apply-view does. */
  const foilRecordOf = (placement) => {
    if (!foil || placement.face !== 'front' || !FOIL_ROLES.has(placement.role)) return null;
    const [right, up] = placement.stackOffset ?? [0, 0];
    if (right !== 0 || up !== 0) return null;
    try {
      return foil.recordFor?.(placement) ?? null;
    } catch (error) {
      console.warn('board3d: foil lookup failed', error);
      return null;
    }
  };

  const facesOf = (placement) => ({
    src: placement.face === 'front' ? placement.src : null,
    backSrc: placement.backSrc,
    face: placement.face,
    foilRecord: foilRecordOf(placement),
  });

  /** The Stadium as a card for the pool: face up, no sleeve, no foil (role outside FOIL_ROLES). */
  const stadiumCardOf = (stadium) => ({
    instanceId: stadium.instanceId,
    face: 'front',
    src: stadium.src,
    backSrc: null,
    role: 'stadium',
  });

  const isStadium = (source, id) => source?.stadium?.instanceId === id;

  /** What the pool draws for an instance id: its placement, or the Stadium. */
  const cardOf = (source, id) =>
    isStadium(source, id) ? stadiumCardOf(source.stadium) : placementById(source, id);

  /**
   * Reconciles the card meshes with `next` (§D3 "Reconcile"): new cards appear at their pose,
   * moved or restyled ones tween there, cards without a pose (hand, deck, buried discard /
   * Lost Zone cards, Energy tokens) or gone from the view are released. A card whose pose
   * changed without a move (a discard top settling as its pile shrinks) tweens too; the Stadium
   * re-dresses when it changes (a facing toggle turns it 180°). `relayout` snaps every card to
   * the new layout; `refresh` re-applies every card's faces (the foil manifest arrived).
   */
  function syncCards(prev, next, { relayout = false, refresh = false } = {}) {
    const handOptions = { hover: hover === null ? null : { instanceId: hover }, lowered: handPose === 'lowered' };
    const poses = layout && next ? posesFor(next, layout, handOptions) : new Map();
    for (const id of pool.ids()) {
      if (poses.has(id)) continue;
      overlays.remove(id);
      pool.release(id);
      appliedPoses.delete(id);
    }
    const diff = diffModels(prev, next);
    for (const [id, pose] of poses) {
      const card = cardOf(next, id);
      if (!pool.has(id)) {
        pool.acquire(id, { widthPx: pose.widthPx });
        pool.setFaces(id, facesOf(card));
        pool.setHidden(id, hiddenOf(id, pose));
        pool.setPose(id, pose, 0);
        appliedPoses.set(id, pose);
        continue;
      }
      const restyled = diff.restyled.has(id) || (isStadium(next, id) && diff.stadiumChanged);
      if (restyled || refresh) {
        pool.setFaces(id, facesOf(card));
        pool.setHidden(id, hiddenOf(id, pose));
      }
      const posed = !samePose(appliedPoses.get(id), pose);
      if (relayout) pool.setPose(id, pose, 0);
      else if (restyled || posed || diff.moved.has(id)) pool.setPose(id, pose, CARD_POSE_MS);
      appliedPoses.set(id, pose);
    }
    syncStackBadges(next);
    for (const id of poses.keys()) syncOverlaysOf(next, id);
  }

  /** A card's placement with the scene's UI state (selection, glow, mat pick, hidden) over it. */
  const withUiState = (card, id) => ({ ...card, ...(uiState.get(id) || {}) });

  const hiddenOf = (id, pose) => {
    const hidden = uiState.get(id)?.hidden;
    return typeof hidden === 'boolean' ? hidden : Boolean(pose?.hidden);
  };

  /**
   * The Energy tokens a card shows: those attached to its stack, on the stack's visible card
   * only (a root or Stage with no offset), as apply-view draws the row over the visible card.
   */
  const tokensOf = (source, card) => {
    if (!card || !FOIL_ROLES.has(card.role)) return [];
    const [right, up] = card.stackOffset ?? [0, 0];
    if (right !== 0 || up !== 0) return [];
    const rootId = card.host ?? card.instanceId;
    return (source?.placements ?? [])
      .filter((p) => p.role === 'energy' && p.energyToken && p.host === rootId && p.side === card.side)
      .map((p) => p.energyToken);
  };

  /** Re-dresses one card's overlays (overlay-meshes.js compares and skips an unchanged card). */
  function syncOverlaysOf(source, id) {
    const card = cardOf(source, id);
    const widthPx = appliedPoses.get(id)?.widthPx;
    overlays.sync(id, card ? withUiState(card, id) : null, pool.meshOf(id), {
      widthPx,
      tokens: tokensOf(source, card),
    });
  }

  /** "×N" on the front card of every hand stack of two or more (design 014), centred near its top. */
  function syncStackBadges(source) {
    const wanted = [];
    const fontPx = countFontPx();
    for (const side of SIDES) {
      for (const ids of source ? handGroupsOf(source, side) : []) {
        const mesh = ids.length >= 2 ? pool.meshOf(ids[0]) : null;
        if (!mesh) continue;
        const widthPx = appliedPoses.get(ids[0])?.widthPx ?? 0;
        const offsetY = (widthPx * CARD_HEIGHT_PER_WIDTH) / 2 - fontPx * 0.8;
        wanted.push({ id: ids[0], mesh, text: `×${ids.length}`, offsetY, fontPx });
      }
    }
    badges.sync(wanted);
  }

  /** Lifts the hovered hand card's fan slot (null = none); the hand re-poses on a 180 ms tween. */
  const setHover = (instanceId) => {
    const next = Number.isFinite(instanceId) ? instanceId : null;
    if (disposed || next === hover) return;
    hover = next;
    syncCards(model, model);
    invalidate();
  };

  /** 'lowered' drops the near hand below the screen edge (card focus), 'normal' brings it back. */
  const setHandPose = (pose) => {
    if (disposed || !HAND_POSES.has(pose) || pose === handPose) return;
    handPose = pose;
    syncCards(model, model);
    invalidate();
  };

  const countFontPx = () => {
    const px = (COUNT_FONT.vh * (layout?.half?.h ?? 0)) / 100;
    return Math.min(COUNT_FONT.maxPx, Math.max(COUNT_FONT.minPx, px));
  };

  /** The prize area's bounding box on `side` as a count anchor (the label centres above it). */
  const prizeAnchorOf = (side) => {
    const slots = layout?.[side]?.prizes ?? [];
    if (slots.length === 0) return null;
    const left = Math.min(...slots.map((r) => r.x));
    const right = Math.max(...slots.map((r) => r.x + r.w));
    const bottom = Math.min(...slots.map((r) => r.y));
    const top = Math.max(...slots.map((r) => r.y + r.h));
    const cardW = layout[side].cardBox.prizes.w;
    return {
      x: (left + right) / 2,
      y: (bottom + top) / 2,
      z: pileThicknessPx(slots.length, cardScaleFor(cardW)),
      yawDeg: side === 'opp' ? 180 : 0,
      widthPx: right - left,
      heightPx: top - bottom,
      fontPx: countFontPx(),
    };
  };

  /**
   * Draws `source.piles` (§D3 "Piles"): the deck as `layers` sleeve-topped layers, discard and
   * Lost Zone as `pileVisualCount(count) - 1` plain layers under the face-up top card the pool
   * draws, nothing for an empty pile (edge case 7), and every "(N)" count label (prizes too).
   */
  function syncPiles(source) {
    pileTops.clear();
    for (const side of SIDES) {
      const sidePiles = source?.piles?.[side] ?? null;
      for (const zone of PILE_ZONES) {
        const pose = layout ? pilePose(side, zone, layout) : null;
        const pile = sidePiles?.[zone] ?? null;
        const count = Math.max(0, Number(pile?.count) || 0);
        const isDeck = zone === 'deck';
        const layers = isDeck ? Math.max(0, Number(pile?.layers) || 0) : Math.max(0, pileVisualCount(count) - 1);
        const scale = pose ? cardScaleFor(pose.widthPx) : 0;
        const thicknessPx = pileThicknessPx(layers, scale);
        piles.setPile(side, zone, { count, layers, topSrc: isDeck ? pile?.sleeve : null }, pose, { thicknessPx });
        // The open piles' face-up top card adds one card thickness above the layers.
        const top = thicknessPx + (!isDeck && count > 0 ? CARD_UNITS.t * scale : 0);
        pileTops.set(`${side}:${zone}`, top);
        labels.setCount(side, zone, count, pose && sidePiles ? { ...pose, z: top, fontPx: countFontPx() } : null);
      }
      const prizeCount = Math.max(0, Number(sidePiles?.prizes?.count) || 0);
      labels.setCount(side, 'prizes', prizeCount, layout && sidePiles ? prizeAnchorOf(side) : null);
    }
  }

  let pilesApplied = false;

  /**
   * Renders a board model (board-model.mjs `boardModelFrom`): reconciles the card meshes (prizes,
   * pile tops and the Stadium among them) and, on the first apply or when the piles or the
   * Stadium changed, the pile stacks and the count labels.
   */
  const applyModel = (next) => {
    if (disposed) return;
    const prev = model;
    model = next ?? null;
    syncCards(prev, model);
    const diff = diffModels(prev, model);
    if (!pilesApplied || diff.pilesChanged || diff.stadiumChanged) {
      syncPiles(model);
      pilesApplied = true;
    }
    invalidate();
  };

  /** Re-applies every card's faces, e.g. once the foil manifest has loaded. */
  const refreshCards = () => {
    if (disposed) return;
    syncCards(model, model, { refresh: true });
    invalidate();
  };

  /**
   * Selection / glow / mat-pick / hidden state per card instance, merged over the model's (the
   * mirror's read-back, §D4): re-dresses that card's rings and overlays and its visibility now.
   */
  const setUiState = (id, patch) => {
    if (disposed || id === undefined || id === null || !patch || typeof patch !== 'object') return;
    uiState.set(id, { ...(uiState.get(id) || {}), ...patch });
    if (pool.has(id)) {
      pool.setHidden(id, hiddenOf(id, appliedPoses.get(id)));
      syncOverlaysOf(model, id);
    }
    invalidate();
  };

  const canvasBox = () => {
    const box = canvas.getBoundingClientRect?.();
    return box && box.width > 0 && box.height > 0 ? box : null;
  };

  /** Client-px bounding box of world points, or null when one is at or behind the eye. */
  const screenRectOf = (corners, box) => {
    const points = corners.map((corner) => projectToScreen(cameraDesc, corner));
    if (points.length !== 4 || points.some((point) => !point)) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return {
      left: box.left + left,
      top: box.top + top,
      width: Math.max(...xs) - left,
      height: Math.max(...ys) - top,
    };
  };

  /** World corners of a flat table footprint centred at (x, y), `w` × `h`, `z` off the cloth. */
  const footprintCorners = ({ x, y }, w, h, z) =>
    [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([dx, dy]) => tableToWorld({ x: x + dx, y: y + dy, z }, cameraDesc));

  /**
   * Client-px rects keyed by card instance id (every visible card: the bounding box of its front
   * face's four corners), `pile:<side>:<zone>` (each deck / discard / Lost Zone footprint at its
   * stack's top, drawn or empty) and `stadium` (the Stadium zone's card footprint). Projected
   * with the pure camera description (board-camera.mjs `projectToScreen`, the same math
   * `PerspectiveCamera` runs) and offset by the canvas's page position. A running shake is not
   * included.
   */
  const rects = () => {
    const out = {};
    if (disposed || !cameraDesc) return out;
    pool.update(clock.now());
    const box = canvasBox() ?? { left: 0, top: 0 };
    for (const id of pool.ids()) {
      if (!pool.meshOf(id)?.visible) continue;
      const rect = screenRectOf(pool.cornersOf(id) ?? [], box);
      if (rect) out[id] = rect;
    }
    if (!layout) return out;
    for (const side of SIDES) {
      for (const zone of PILE_ZONES) {
        const pose = pilePose(side, zone, layout);
        if (!pose) continue;
        const z = CARD_LIFT_PX + (pileTops.get(`${side}:${zone}`) ?? 0);
        const corners = footprintCorners(pose, pose.widthPx, pose.widthPx * CARD_HEIGHT_PER_WIDTH, z);
        const rect = screenRectOf(corners, box);
        if (rect) out[`pile:${side}:${zone}`] = rect;
      }
    }
    if (layout.stadium) {
      const { x, y, w } = layout.stadium;
      const centre = { x: x + w / 2, y: y + layout.stadium.h / 2 };
      const rect = screenRectOf(footprintCorners(centre, w, w * CARD_HEIGHT_PER_WIDTH, CARD_LIFT_PX), box);
      if (rect) out.stadium = rect;
    }
    return out;
  };

  /**
   * Nearest thing under a client-px point (raycast against the card meshes and the pile stacks):
   * a card `{ instanceId, side, zone, index, point }`, the Stadium `{ zone: 'stadium', side: null,
   * instanceId, point }`, a pile stack `{ zone, side, instanceId: null, pile: true, point }`, or null.
   */
  const hitTest = (clientX, clientY) => {
    if (disposed || !cameraDesc || !model) return null;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const box = canvasBox();
    if (!box) return null;
    pool.update(clock.now());
    const ndc = new three.Vector2(
      ((clientX - box.left) / box.width) * 2 - 1,
      -((clientY - box.top) / box.height) * 2 + 1
    );
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const meshes = pool
      .ids()
      .map((id) => pool.meshOf(id))
      .filter((mesh) => mesh?.visible);
    for (const hit of raycaster.intersectObjects([...meshes, ...piles.objects()], true)) {
      const pile = piles.pileAt(hit.object);
      if (pile) return { zone: pile.zone, side: pile.side, instanceId: null, pile: true, point: hit.point.toArray() };
      const id = pool.idAt(hit.object);
      if (id !== null && isStadium(model, id)) {
        return { zone: 'stadium', side: null, instanceId: id, point: hit.point.toArray() };
      }
      const placement = id === null ? null : placementById(model, id);
      if (!placement) continue;
      return {
        instanceId: id,
        side: placement.side,
        zone: placement.zone,
        index: placement.index,
        point: hit.point.toArray(),
      };
    }
    return null;
  };

  /**
   * Screen shake as a camera view-offset sequence on the scene clock. `offsets` are keyframes
   * `{ x, y, ms }` in screen px, `ms` from the start (combat-pose.mjs `screenShakeOffsets`
   * spread over its duration). A new shake replaces a running one. Resolves when it ends.
   */
  const shake = (offsets) => {
    const keys = Array.isArray(offsets) ? offsets.filter(isPoint).sort((a, b) => a.ms - b.ms) : [];
    stopShake?.();
    if (disposed || keys.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const start = clock.now();
      let unsubscribe = null;
      const finish = () => {
        unsubscribe?.();
        unsubscribe = null;
        if (stopShake === finish) stopShake = null;
        shakeOffset = { x: 0, y: 0 };
        applyViewOffset();
        invalidate();
        resolve();
      };
      stopShake = finish;
      unsubscribe = clock.onTick((time) => {
        const elapsed = time - start;
        const offset = offsetAt(keys, elapsed);
        shakeOffset = { x: offset.x, y: offset.y };
        applyViewOffset();
        render();
        if (elapsed >= keys[keys.length - 1].ms) finish();
      });
    });
  };

  // `host` sizes the canvas; the boot code observes it and calls setViewport/setCamera.
  const inspect = () => ({
    scene,
    camera,
    host,
    canvas,
    layout,
    cameraDesc,
    model,
    uiState,
    cards: pool,
    piles,
    labels,
    badges,
    overlays,
    hover,
    handPose,
  });

  const dispose = () => {
    if (disposed) return;
    stopShake?.();
    disposed = true;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    overlays.dispose();
    pool.dispose();
    scene.remove(cardsGroup);
    piles.dispose();
    labels.dispose();
    badges.dispose();
    tableFrame.remove(pilesGroup);
    tableFrame.remove(labelsGroup);
    appliedPoses.clear();
    pileTops.clear();
    table.dispose();
    scene.remove(tableFrame);
    uiState.clear();
    model = null;
  };

  return {
    applyModel,
    refreshCards,
    setLayout,
    setCamera,
    setViewport,
    invalidate,
    render,
    rects,
    hitTest,
    shake,
    setUiState,
    setMat,
    setHover,
    setHandPose,
    inspect,
    dispose,
    clock,
  };
}
