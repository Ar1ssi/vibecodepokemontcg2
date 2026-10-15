// Design 073: both players' deck boxes, drawn beside the mat, and the opening deal out of them, in one
// three.js scene on a transparent canvas over the page. Lazy-loaded by deck-box.js, the only importer of
// three on this path. Placements and the schedule come from deck-box-math.mjs; this file owns GPU objects.
//
// The camera puts one world unit on one CSS pixel at z = 0, so a screen placement drops straight into
// the scene. Each box is a rig in box space (deck-box-math.mjs): the body, a lid hinged on the back edge
// of the cap seam, flat rims closing the cut walls, the card stack inside, and the floor shadow.
import * as THREE from 'three';
import {
  loadAssets,
  loadTexture,
  staticTexture,
} from '../../deck-builder/core/customize-stage/object-stage.js';
import { boxAtlasUrl, boxById, loadBoxCatalog } from '../../deck-builder/core/customize-stage/boxes.mjs';
import { DEFAULT_TILT_DEG } from '../../sizing/table-tilt.mjs';
import {
  BOX_HEIGHT,
  CARD_SIZE,
  STACK_BACK_Z,
  STACK_DEPTH,
  STACK_FLOOR_Y,
  bezier2,
  boxTravel,
  cameraDistance,
  cardPhase,
  cardsLaunched,
  dealTimeline,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  lidProgress,
  splitBoxMesh,
  stackDepthAfter,
} from './deck-box-math.mjs';

const ASSET_DIR = '/src/assets/deckbox/';
const DEFAULT_CARD_BACK = '/src/assets/cardback.png';
const FOV_DEG = 20;
/** Light levels of the Customize stage (object-stage.js), tuned there against the game's box thumbnails. */
const AMBIENT_INTENSITY = 1.8;
const KEY_INTENSITY = 1.6;
const KEY_DIRECTION = [-400, 900, 1200];
const INTERIOR_TINT = 0.915;
const BOX_FALLBACK_COLOR = 0x4a5068;
const CARD_EDGE_COLOR = 0xeae6dc;
const CARD_FACE_COLOR = 0x2a2d38;
/** scene.json poses are in the Customize stage's units, where the box mesh is scaled 35 times. */
const CUSTOMIZE_MESH_SCALE = 35;
const SHADOW_PLANE_SIZE = 10;
const DEG = Math.PI / 180;
const REST_PITCH = 15 * DEG;
const REST_YAW = 25 * DEG;
const HOVER_YAW = 12 * DEG;
const HOVER_ROLL = 16 * DEG;
const HOVER_LIFT_PX = 160;
const BOX_ARC = { up: 40, toward: 220 };
const CARD_ARC = { up: 90, toward: 120 };
/** The lid swings back past upright, so the long front flap stands behind the box. */
const LID_OPEN = 160 * DEG;
/** How far a card rises out of the stack before it flies (box units; the body is 6.25 tall). */
const RISE_UNITS = 7;
/** Each landed card sits a hair above the one before, so the pile grows toward the camera. */
const PILE_STEP = { up: 0.4, toward: 0.3 };
const SLEEVE_WAIT_MS = 1200;
const STRIPE_REPEAT = 30;

/** A colour given as display (sRGB) channels in 0..1, as the game's material data uses. */
const displayColor = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

/** Top edges of a stack of cards: thin light and grey rows, repeated along the stack's depth. */
const stripeTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 4;
  const context = canvas.getContext('2d');
  context.fillStyle = '#f2efe8';
  context.fillRect(0, 0, 2, 3);
  context.fillStyle = '#a9a59c';
  context.fillRect(0, 3, 2, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  return texture;
};

/** A flat ring between two rectangles in box space's xz plane, at y = 0. */
const rimGeometry = ({ outer, inner }) => {
  const shape = new THREE.Shape([
    new THREE.Vector2(outer.x0, outer.z0),
    new THREE.Vector2(outer.x1, outer.z0),
    new THREE.Vector2(outer.x1, outer.z1),
    new THREE.Vector2(outer.x0, outer.z1),
  ]);
  shape.holes.push(
    new THREE.Path([
      new THREE.Vector2(inner.x0, inner.z0),
      new THREE.Vector2(inner.x0, inner.z1),
      new THREE.Vector2(inner.x1, inner.z1),
      new THREE.Vector2(inner.x1, inner.z0),
    ])
  );
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  return geometry;
};

const loadSleeve = (url) => {
  if (!url) return Promise.reject(new Error('no sleeve'));
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('sleeve timed out')), SLEEVE_WAIT_MS));
  return Promise.race([loadTexture(url), timeout]);
};

const lerp = (a, b, u) => a + (b - a) * u;

/**
 * The deck box stage. Rejects when WebGL2 is missing or an asset fails to load, leaving nothing behind;
 * the caller then plays no deal. `onLost` runs once if the browser drops the context.
 *
 * @param {{ onLost?: () => void }} [options]
 */
export async function createDeckBoxStage({ onLost = () => {} } = {}) {
  // Everything that can fail on the network first: a rejection leaves no canvas or context behind.
  const [{ scene: layout, boxMesh, cardMesh }, interiorTexture, shadowTexture, defaultBack] = await Promise.all([
    loadAssets(),
    staticTexture(`${ASSET_DIR}interior.webp`),
    staticTexture(`${ASSET_DIR}shadow-box.webp`),
    staticTexture(DEFAULT_CARD_BACK),
  ]);
  const split = splitBoxMesh(boxMesh);

  const canvas = document.createElement('canvas');
  canvas.id = 'deckBoxStage';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const owned = new Set();
  const own = (disposable) => {
    owned.add(disposable);
    return disposable;
  };
  const state = { closed: false, lost: false, frame: null, deal: null, viewport: { width: 1, height: 1 } };

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));
  const key = new THREE.DirectionalLight(0xffffff, KEY_INTENSITY);
  key.position.set(...KEY_DIRECTION);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 10, 10000);

  const meshAttributes = (mesh) => ({
    position: new THREE.Float32BufferAttribute(mesh.p, 3),
    normal: new THREE.Float32BufferAttribute(mesh.n, 3),
    uv: new THREE.Float32BufferAttribute(mesh.uv, 2),
  });
  const geometryFrom = (attributes, part) => {
    const geometry = own(new THREE.BufferGeometry());
    for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(part.index ?? part.i);
    part.submeshes.forEach((submesh, index) => geometry.addGroup(submesh.start, submesh.count, index));
    return geometry;
  };
  const boxAttributes = meshAttributes(boxMesh);
  const bodyGeometry = geometryFrom(boxAttributes, split.body);
  const lidGeometry = geometryFrom(boxAttributes, split.lid);
  const cardGeometry = geometryFrom(meshAttributes(cardMesh), cardMesh);
  const ringGeometry = own(rimGeometry(split.rim));
  const stackGeometry = own(new THREE.BoxGeometry(CARD_SIZE.width, CARD_SIZE.height, 1));
  const shadowGeometry = own(new THREE.PlaneGeometry(SHADOW_PLANE_SIZE, SHADOW_PLANE_SIZE));
  shadowGeometry.rotateX(-Math.PI / 2);

  const interior = own(
    new THREE.MeshLambertMaterial({ color: displayColor(INTERIOR_TINT, INTERIOR_TINT, INTERIOR_TINT), map: interiorTexture })
  );
  const rim = own(
    new THREE.MeshLambertMaterial({ color: displayColor(INTERIOR_TINT, INTERIOR_TINT, INTERIOR_TINT), side: THREE.DoubleSide })
  );
  const cardEdge = own(new THREE.MeshLambertMaterial({ color: CARD_EDGE_COLOR }));
  const meshQuaternion = new THREE.Quaternion(...layout.slots.box.mesh.q);
  const shadowPose = layout.slots.box.shadow;

  const createRig = () => {
    const exterior = own(new THREE.MeshLambertMaterial({ color: BOX_FALLBACK_COLOR }));
    const sleeve = own(new THREE.MeshBasicMaterial({ color: 0xffffff, map: defaultBack }));
    const cardFace = own(new THREE.MeshBasicMaterial({ color: CARD_FACE_COLOR }));
    const cardEdgeFade = own(new THREE.MeshLambertMaterial({ color: CARD_EDGE_COLOR }));
    const stripes = own(stripeTexture());
    const stackTop = own(new THREE.MeshLambertMaterial({ color: 0xffffff, map: stripes }));
    const [r, g, b, a] = shadowPose.tint;
    const shadowMaterial = own(
      new THREE.MeshBasicMaterial({ map: shadowTexture, color: displayColor(r, g, b), opacity: a, transparent: true, depthWrite: false })
    );

    const root = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry, [exterior, interior]);
    body.quaternion.copy(meshQuaternion);
    const bodyRim = new THREE.Mesh(ringGeometry, rim);
    bodyRim.position.y = split.cutY;

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, split.hinge.y, split.hinge.z);
    const lidOffset = new THREE.Group();
    lidOffset.position.set(0, -split.hinge.y, -split.hinge.z);
    const lid = new THREE.Mesh(lidGeometry, [exterior, interior]);
    lid.quaternion.copy(meshQuaternion);
    const lidRim = new THREE.Mesh(ringGeometry, rim);
    lidRim.position.y = split.cutY;
    lidOffset.add(lid, lidRim);
    lidPivot.add(lidOffset);

    const stack = new THREE.Mesh(stackGeometry, [cardEdge, cardEdge, stackTop, cardEdge, sleeve, sleeve]);
    stack.position.y = STACK_FLOOR_Y + CARD_SIZE.height / 2;

    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.renderOrder = -1;
    shadow.position.set(...shadowPose.p.map((value) => value / CUSTOMIZE_MESH_SCALE));
    shadow.quaternion.set(...shadowPose.q);
    shadow.scale.set(...shadowPose.s.map((value) => value / CUSTOMIZE_MESH_SCALE));

    root.add(body, bodyRim, lidPivot, stack, shadow);
    root.visible = false;
    scene.add(root);
    return {
      root,
      exterior,
      sleeve,
      cardMaterials: [sleeve, cardFace, cardEdgeFade],
      stripes,
      lidPivot,
      stack,
      shadow,
      shadowOpacity: a,
      boxId: undefined,
      atlasToken: 0,
      rest: null,
      open: false,
      sleeveTexture: null,
    };
  };

  const rigs = { self: createRig(), opp: createRig() };

  const releaseAll = () => {
    for (const disposable of owned) disposable.dispose();
    owned.clear();
    renderer.dispose();
    if (!state.lost) renderer.forceContextLoss();
    canvas.remove();
  };

  const worldPoint = (x, y, z = 0) =>
    new THREE.Vector3(x - state.viewport.width / 2, state.viewport.height / 2 - y, z);

  /** A box standing at a screen placement, turned by yaw/roll, pitched toward the camera. */
  const boxPose = (placement, { yaw, roll = 0, lift = 0 }) => {
    const scale = placement.height / BOX_HEIGHT;
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(REST_PITCH, yaw, roll, 'XZY'));
    const halfUp = new THREE.Vector3(0, (BOX_HEIGHT / 2) * scale, 0).applyQuaternion(quaternion);
    const position = worldPoint(placement.cx, placement.cy, lift).sub(halfUp);
    return { position, quaternion, scale };
  };
  const restPose = (placement) => boxPose(placement, { yaw: placement.side === 'right' ? -REST_YAW : REST_YAW });
  const hoverPose = (hover) => boxPose(hover, { yaw: -hover.dir * HOVER_YAW, roll: -hover.dir * HOVER_ROLL, lift: HOVER_LIFT_PX });

  const applyPose = (object, pose) => {
    object.position.copy(pose.position);
    object.quaternion.copy(pose.quaternion);
    object.scale.setScalar(pose.scale);
  };

  const blendPose = (from, to, u, arc) => {
    const control = from.position.clone().lerp(to.position, 0.5);
    control.y += arc.up;
    control.z += arc.toward;
    const position = new THREE.Vector3(...bezier2(from.position.toArray(), control.toArray(), to.position.toArray(), u));
    const quaternion = from.quaternion.clone().slerp(to.quaternion, u);
    return { position, quaternion, scale: lerp(from.scale, to.scale, u) };
  };

  const setLid = (rig, opening) => {
    rig.lidPivot.rotation.x = -LID_OPEN * opening;
  };

  const setStackDepth = (rig, depth) => {
    rig.stack.visible = depth > 0.001;
    rig.stack.scale.z = Math.max(depth, 0.001);
    rig.stack.position.z = STACK_BACK_Z + depth / 2;
    rig.stripes.repeat.set(1, (STRIPE_REPEAT * depth) / STACK_DEPTH);
  };

  const showRest = (rig) => {
    rig.root.visible = Boolean(rig.rest);
    if (!rig.rest) return;
    applyPose(rig.root, restPose(rig.rest));
    setLid(rig, rig.open ? 1 : 0);
    setStackDepth(rig, rig.open ? 0 : STACK_DEPTH);
    rig.shadow.visible = true;
    rig.shadow.material.opacity = rig.shadowOpacity;
  };

  const render = () => {
    state.frame = null;
    if (state.closed || state.lost) return;
    renderer.render(scene, camera);
  };
  const requestRender = () => {
    if (state.frame !== null || state.closed || state.deal) return;
    state.frame = requestAnimationFrame(render);
  };

  const resize = () => {
    const width = Math.max(1, window.innerWidth || canvas.clientWidth);
    const height = Math.max(1, window.innerHeight || canvas.clientHeight);
    state.viewport = { width, height };
    renderer.setSize(width, height, false);
    const distance = cameraDistance(height, FOV_DEG);
    camera.aspect = width / height;
    camera.position.set(0, 0, distance);
    camera.near = distance / 10;
    camera.far = distance * 4;
    camera.updateProjectionMatrix();
    for (const rig of Object.values(rigs)) if (!state.deal) showRest(rig);
    requestRender();
  };

  /** Shows `side`'s box resting at `placement` (null hides it), shut and full or open and empty. */
  const setRest = (side, placement, open) => {
    const rig = rigs[side];
    if (!rig) return;
    rig.rest = placement;
    rig.open = Boolean(open);
    if (state.deal) return;
    showRest(rig);
    requestRender();
  };

  /**
   * Paints `side`'s box with the catalog box `boxId` (null: the default box). A newer call wins; a box
   * whose art fails to load stays the plain fallback colour and is not retried until the id changes.
   */
  const setBox = async (side, boxId) => {
    const rig = rigs[side];
    if (!rig || rig.boxId === boxId) return;
    rig.boxId = boxId;
    rig.atlasToken += 1;
    const token = rig.atlasToken;
    const catalog = await loadBoxCatalog();
    const texture = await loadTexture(boxAtlasUrl(boxById(catalog, boxId)));
    if (state.closed || rig.atlasToken !== token) {
      texture.dispose();
      return;
    }
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (rig.exterior.map) {
      owned.delete(rig.exterior.map);
      rig.exterior.map.dispose();
    }
    rig.exterior.map = own(texture);
    rig.exterior.color.set(0xffffff);
    rig.exterior.needsUpdate = true;
    requestRender();
  };

  const useSleeve = async (rig, url) => {
    let texture = null;
    try {
      texture = await loadSleeve(url);
    } catch {
      texture = null;
    }
    if (rig.sleeveTexture) {
      owned.delete(rig.sleeveTexture);
      rig.sleeveTexture.dispose();
    }
    rig.sleeveTexture = texture ? own(texture) : null;
    rig.sleeve.map = texture ?? defaultBack;
    rig.sleeve.needsUpdate = true;
  };

  /** Blending is on only while the landed cards fade out, so the pile sorts as solid cards until then. */
  const setCardOpacity = (rig, opacity) => {
    const fading = opacity < 1;
    for (const material of rig.cardMaterials) {
      material.opacity = opacity;
      if (material.transparent === fading) continue;
      material.transparent = fading;
      material.needsUpdate = true;
    }
  };

  /**
   * Plays the deal for every plan at once and resolves when the boxes are home. A plan:
   * `{ side, rest, start, hover, deckRect, far, deckCount, sleeveUrl, onLanded }` — `start` is where the
   * box flies from and back to (its rest spot, or just off the board when its band has no room);
   * `onLanded` runs once that side's last card is down, when the real deck may show again.
   *
   * @returns {Promise<void>}
   */
  const playDeal = async (plans) => {
    if (state.closed || state.lost || state.deal || plans.length === 0) return;
    await Promise.all(plans.map((plan) => useSleeve(rigs[plan.side], plan.sleeveUrl)));
    if (state.closed || state.lost) return;

    const runs = plans.map((plan) => {
      const rig = rigs[plan.side];
      const timeline = dealTimeline(plan.deckCount);
      const cards = Array.from({ length: timeline.cards }, () => {
        const card = new THREE.Mesh(cardGeometry, rig.cardMaterials);
        card.visible = false;
        scene.add(card);
        return card;
      });
      const landScale = plan.deckRect.width / CARD_SIZE.width;
      const landQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-DEFAULT_TILT_DEG * DEG, 0, plan.far ? Math.PI : 0, 'XYZ')
      );
      const deckCenter = worldPoint(plan.deckRect.left + plan.deckRect.width / 2, plan.deckRect.top + plan.deckRect.height / 2);
      return {
        plan,
        rig,
        timeline,
        cards,
        start: boxPose(plan.start, { yaw: plan.start.side === 'right' ? -REST_YAW : REST_YAW }),
        hover: hoverPose(plan.hover),
        // A box already resting open (a reset board dealt again) keeps its lid open rather than snapping it shut.
        wasOpen: rig.open,
        landed: false,
        land: (k) => ({
          position: deckCenter.clone().add(new THREE.Vector3(0, k * PILE_STEP.up, k * PILE_STEP.toward)),
          quaternion: landQuaternion,
          scale: landScale,
        }),
      };
    });
    const schedule = runs.reduce((longest, run) => (run.timeline.totalMs > longest.totalMs ? run.timeline : longest), runs[0].timeline);

    const risePose = (run, k, u) => {
      const depthAtLaunch = stackDepthAfter(k, run.timeline.cards);
      const local = new THREE.Vector3(
        0,
        STACK_FLOOR_Y + CARD_SIZE.height / 2 + RISE_UNITS * easeOutCubic(u),
        STACK_BACK_Z + depthAtLaunch - 0.04
      );
      return {
        position: run.rig.root.localToWorld(local),
        quaternion: run.rig.root.quaternion.clone(),
        scale: run.rig.root.scale.x,
      };
    };

    const step = (run, ms) => {
      const { rig, timeline } = run;
      const travel = boxTravel(schedule, ms);
      const eased = easeInOutCubic(travel.u);
      const pose =
        travel.leg === 'out'
          ? blendPose(run.start, run.hover, eased, BOX_ARC)
          : travel.leg === 'hover'
            ? run.hover
            : blendPose(run.hover, run.start, eased, BOX_ARC);
      applyPose(rig.root, pose);
      rig.root.updateMatrixWorld(true);
      rig.root.visible = travel.leg !== 'home' || travel.u < 1 || Boolean(run.plan.rest);
      const away = travel.leg === 'out' ? eased : travel.leg === 'hover' ? 1 : 1 - eased;
      rig.shadow.material.opacity = rig.shadowOpacity * (1 - away);

      setLid(rig, run.wasOpen ? 1 : easeOutBack(lidProgress(schedule, ms), 0.9));
      setStackDepth(rig, stackDepthAfter(cardsLaunched(timeline, ms), timeline.cards));

      run.cards.forEach((card, k) => {
        const { phase, u } = cardPhase(timeline, k, ms);
        card.visible = phase !== 'waiting';
        if (phase === 'waiting') return;
        if (phase === 'rising') {
          applyPose(card, risePose(run, k, u));
          return;
        }
        const land = run.land(k);
        applyPose(card, phase === 'landed' ? land : blendPose(risePose(run, k, 1), land, easeInOutCubic(u), CARD_ARC));
      });

      if (!run.landed && ms >= timeline.lastLandMs) {
        run.landed = true;
        run.plan.onLanded?.();
      }
      const fade = Math.min(1, Math.max(0, (ms - timeline.lastLandMs) / timeline.revealMs));
      setCardOpacity(rig, 1 - fade);
    };

    const finish = (run) => {
      for (const card of run.cards) scene.remove(card);
      setCardOpacity(run.rig, 1);
      if (!run.landed) run.plan.onLanded?.();
      run.rig.rest = run.plan.rest;
      run.rig.open = true;
      showRest(run.rig);
    };

    await new Promise((resolve) => {
      let started = null;
      let failed = false;
      let ended = false;
      const done = () => {
        if (ended) return;
        ended = true;
        state.deal = null;
        runs.forEach(finish);
        render();
        resolve();
      };
      const tick = (now) => {
        if (state.closed || state.lost || failed) return done();
        started ??= now;
        const ms = now - started;
        try {
          runs.forEach((run) => step(run, ms));
          renderer.render(scene, camera);
        } catch (error) {
          failed = true;
          console.error('deck box deal: a frame failed', error);
          return done();
        }
        if (ms >= schedule.totalMs) return done();
        state.deal.frame = requestAnimationFrame(tick);
      };
      state.deal = { frame: requestAnimationFrame(tick), stop: done };
    });
  };

  const onContextLost = (event) => {
    event.preventDefault();
    state.lost = true;
    onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  resize();

  const dispose = () => {
    if (state.closed) return;
    state.closed = true;
    if (state.frame !== null) cancelAnimationFrame(state.frame);
    if (state.deal) {
      cancelAnimationFrame(state.deal.frame);
      state.deal.stop();
    }
    canvas.removeEventListener('webglcontextlost', onContextLost);
    releaseAll();
  };

  return { canvas, setBox, setRest, resize, playDeal, dispose, isDealing: () => Boolean(state.deal) };
}
