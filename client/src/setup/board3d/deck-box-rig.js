// Design 073 on the three.js board: both players' deck boxes standing on the table in the blurred
// band beside the mat, and the opening deal out of them, drawn by the board's own scene, camera and
// lights. Lazy-loaded by netcode/mat-fx/deck-box.js. Poses and the schedule come from the pure
// deck-box-math.mjs (table px: x right, y up the table, z off the cloth); this file owns GPU objects.
//
// Each box is a rig in box space (y up from its floor, +z toward its front): the body, a lid hinged on
// the back edge of the cap seam, flat rims closing the cut walls, and the card stack inside. Box space
// and the table frame share axes, so with no turn the box lies on its back, front art up, its top up the
// table; a pose pitches it up off its back (about its width) and turns it (about the table's z). The
// root is the box's centre.
import * as THREE from 'three';
import {
  faceWindow,
  fitFace,
  loadAssets,
  loadTexture,
  staticTexture,
} from '../deck-builder/core/customize-stage/object-stage.js';
import { boxAtlasUrl, boxById, loadBoxCatalog } from '../deck-builder/core/customize-stage/boxes.mjs';
import { textureUrlFor } from '../gl/card-art-hosts.mjs';
import { createCardArtMaterial } from '../gl/card-art-material.js';
import {
  BOX_HEIGHT,
  CARD_SIZE,
  STACK_BACK_Z,
  STACK_DEPTH,
  STACK_FLOOR_Y,
  bezier2,
  boxTravel,
  cardPhase,
  cardsLaunched,
  dealTimeline,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  landPose,
  lidProgress,
  splitBoxMesh,
  stackDepthAfter,
} from '../netcode/mat-fx/deck-box-math.mjs';
import { DEFAULT_CARD_BACK_PATH } from '../deck-constructor/default-card-back.mjs';

const ASSET_DIR = '/src/assets/deckbox/';
const DEG = Math.PI / 180;
/** `deckbox_interior`'s tint (object-stage.js) and what an exterior shows before its atlas lands. */
const INTERIOR_TINT = 0.915;
const BOX_FALLBACK_COLOR = 0x4a5068;
const CARD_EDGE_COLOR = 0xeae6dc;
const CARD_BACK_COLOR = 0x2a2d38;
/** Box materials: matte card stock under the board's key light and room environment. */
const BOX_ROUGHNESS = 0.62;
/** Resting boxes stand a hair above the cloth's art and zone overlay (table-mesh.js Z.overlay = 1). */
const REST_LIFT_PX = 1.5;
/** How far the lid swings back off the standing box; the long front flap then hangs behind it. */
const LID_OPEN = 118 * DEG;
/** How far a card rises out of the stack before it flies (box units; the body is 6.25 tall). */
const RISE_UNITS = 4.5;
/** A box's flight arcs this many of its own heights above the straight line (in table z). */
const BOX_ARC_HEIGHTS = 0.35;
/** A card's flight arcs this many card heights above the straight line. */
const CARD_ARC_HEIGHTS = 0.3;
const SLEEVE_WAIT_MS = 1200;
const STRIPE_REPEAT = 30;

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

const withTimeout = (promise, ms, label) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))]);

/** A table pose → the root's position, orientation (turn · pitch) and uniform scale. */
const rootTransform = (pose) => {
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (pose.yawDeg || 0) * DEG);
  const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (pose.pitchDeg || 0) * DEG);
  return {
    position: new THREE.Vector3(pose.x, pose.y, (pose.z || 0) + REST_LIFT_PX),
    quaternion: turn.multiply(pitch),
    scale: pose.scale,
  };
};

/** A flat card pose (lying sleeve up, turned `yawDeg`) → position, orientation and scale. */
const flatTransform = (pose, scale) => ({
  position: new THREE.Vector3(pose.x, pose.y, pose.z + REST_LIFT_PX),
  quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (pose.yawDeg || 0) * DEG),
  scale,
});

const applyTransform = (object, transform) => {
  object.position.copy(transform.position);
  object.quaternion.copy(transform.quaternion);
  object.scale.setScalar(transform.scale);
};

/** Between two transforms along a lifted arc: `arc` table px above the midpoint. */
const blendTransform = (from, to, u, arc) => {
  const control = from.position.clone().lerp(to.position, 0.5);
  control.z += arc;
  return {
    position: new THREE.Vector3(...bezier2(from.position.toArray(), control.toArray(), to.position.toArray(), u)),
    quaternion: from.quaternion.clone().slerp(to.quaternion, u),
    scale: from.scale + (to.scale - from.scale) * u,
  };
};

/**
 * Both deck boxes inside the board scene. Rejects when an asset fails to load, leaving nothing in
 * `parent`; the caller then draws no boxes and plays no deal.
 *
 * @param {{ parent: import('three').Object3D, onNeedsRender: () => void,
 *   findPile: (side: 'self'|'opp') => import('three').Object3D|null }} options
 *   `parent` is the board's table frame; `findPile` returns a side's deck pile so the deal can hide it
 *   until its cards land.
 */
export async function createDeckBoxRigs({ parent, onNeedsRender, findPile }) {
  const [{ scene: layout, boxMesh, cardMesh }, interiorTexture, defaultBack] = await Promise.all([
    loadAssets(),
    staticTexture(`${ASSET_DIR}interior.webp`),
    staticTexture(DEFAULT_CARD_BACK_PATH),
  ]);
  const split = splitBoxMesh(boxMesh);
  const face = faceWindow(cardMesh);

  const owned = new Set();
  const own = (disposable) => {
    owned.add(disposable);
    return disposable;
  };
  const state = { closed: false, deal: null };
  const group = new THREE.Group();
  group.name = 'board3d-deck-boxes';

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

  const tint = displayColor(INTERIOR_TINT, INTERIOR_TINT, INTERIOR_TINT);
  const interior = own(new THREE.MeshStandardMaterial({ color: tint, map: interiorTexture, roughness: BOX_ROUGHNESS }));
  const rim = own(new THREE.MeshStandardMaterial({ color: tint, roughness: BOX_ROUGHNESS, side: THREE.DoubleSide }));
  const cardEdge = own(new THREE.MeshStandardMaterial({ color: CARD_EDGE_COLOR, roughness: 0.8 }));
  const cardBack = own(new THREE.MeshBasicMaterial({ color: CARD_BACK_COLOR }));
  // Box space is mesh space turned by the Customize stage's box slot (scene.json; deck-box-math meshToBox).
  const meshQuaternion = new THREE.Quaternion(...layout.slots.box.mesh.q);

  const fittedBack = own(fitFace(defaultBack.clone(), face));
  fittedBack.needsUpdate = true;

  const createRig = () => {
    const exterior = own(new THREE.MeshStandardMaterial({ color: BOX_FALLBACK_COLOR, roughness: BOX_ROUGHNESS }));
    const sleeve = own(createCardArtMaterial(THREE, { map: fittedBack }));
    const stripes = own(stripeTexture());
    const stackTop = own(new THREE.MeshStandardMaterial({ color: 0xffffff, map: stripes, roughness: 0.8 }));

    const root = new THREE.Group();
    // Box space with its origin moved from the floor's centre to the box's centre.
    const centred = new THREE.Group();
    centred.position.y = -BOX_HEIGHT / 2;
    centred.updateMatrix();
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

    for (const mesh of [body, lid]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    centred.add(body, bodyRim, lidPivot, stack);
    root.add(centred);
    root.visible = false;
    group.add(root);
    return {
      root,
      centred,
      exterior,
      sleeve,
      stripes,
      lidPivot,
      stack,
      boxId: undefined,
      atlasToken: 0,
      rest: null,
      dealt: false,
      sleeveSrc: null,
      sleeveMap: null,
    };
  };

  const rigs = { self: createRig(), opp: createRig() };
  parent.add(group);

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
    applyTransform(rig.root, rootTransform(rig.rest));
    setLid(rig, 0);
    setStackDepth(rig, rig.dealt ? 0 : STACK_DEPTH);
  };

  /** Shows `side`'s box resting shut at `pose` (null hides it), full or, once dealt, empty. */
  const setRest = (side, pose, dealt) => {
    const rig = rigs[side];
    if (!rig || state.closed) return;
    rig.rest = pose;
    rig.dealt = Boolean(dealt);
    if (state.deal) return;
    showRest(rig);
    onNeedsRender();
  };

  /**
   * Paints `side`'s box with the catalog box `boxId` (null: the default box). A newer call wins; a box
   * whose art fails to load keeps the plain fallback colour until the id changes.
   */
  const setBox = async (side, boxId) => {
    const rig = rigs[side];
    if (!rig || rig.boxId === boxId || state.closed) return;
    rig.boxId = boxId;
    rig.atlasToken += 1;
    const token = rig.atlasToken;
    const catalog = await loadBoxCatalog();
    const texture = await loadTexture(boxAtlasUrl(boxById(catalog, boxId)));
    if (state.closed || rig.atlasToken !== token) {
      texture.dispose();
      return;
    }
    if (rig.exterior.map) {
      owned.delete(rig.exterior.map);
      rig.exterior.map.dispose();
    }
    rig.exterior.map = own(texture);
    rig.exterior.color.set(0xffffff);
    rig.exterior.needsUpdate = true;
    onNeedsRender();
  };

  /** The deck's sleeve on the flying cards and the stack's faces, stretched to the card face's window. */
  const useSleeve = async (rig, src) => {
    if ((src || null) === rig.sleeveSrc) return;
    rig.sleeveSrc = src || null;
    let texture = null;
    try {
      if (src) texture = await withTimeout(loadTexture(textureUrlFor(src)), SLEEVE_WAIT_MS, 'sleeve');
    } catch {
      texture = null;
    }
    if (state.closed) {
      texture?.dispose();
      return;
    }
    if (rig.sleeveMap) {
      owned.delete(rig.sleeveMap);
      rig.sleeveMap.dispose();
    }
    rig.sleeveMap = texture ? own(fitFace(texture, face)) : null;
    rig.sleeve.map = rig.sleeveMap ?? fittedBack;
    rig.sleeve.needsUpdate = true;
  };

  const setPileShown = (side, shown) => {
    const pile = findPile(side);
    if (pile) pile.visible = shown;
  };

  /**
   * Plays the deal for every plan at once and resolves when the boxes are home. A plan:
   * `{ side, rest, start, hover, deck, deckCount, topZ, seatYawDeg, sleeveSrc, onLanded }` — `start` is
   * where the box flies from and back to (its rest pose, or just off the table when its band has no
   * room), `deck` the deck pile's pose, `topZ` the real deck's top; `onLanded` runs once that side's
   * last card is down.
   *
   * @returns {Promise<void>}
   */
  const playDeal = async (plans) => {
    if (state.closed || state.deal || plans.length === 0) return;
    await Promise.all(plans.map((plan) => useSleeve(rigs[plan.side], plan.sleeveSrc)));
    if (state.closed) return;

    const runs = plans.map((plan) => {
      const rig = rigs[plan.side];
      const timeline = dealTimeline(plan.deckCount);
      const cards = Array.from({ length: timeline.cards }, () => {
        const card = new THREE.Mesh(cardGeometry, [rig.sleeve, cardBack, cardEdge]);
        card.visible = false;
        card.castShadow = true;
        group.add(card);
        return card;
      });
      return {
        plan,
        rig,
        timeline,
        cards,
        start: rootTransform(plan.start),
        hover: rootTransform(plan.hover),
        arc: BOX_ARC_HEIGHTS * CARD_SIZE.height * plan.hover.scale,
        cardArc: CARD_ARC_HEIGHTS * CARD_SIZE.height * plan.hover.scale,
        landed: false,
        land: (k) =>
          flatTransform(
            landPose({ deck: plan.deck, k, cards: timeline.cards, topZ: plan.topZ, yawDeg: plan.seatYawDeg }),
            plan.hover.scale
          ),
      };
    });
    const schedule = runs.reduce((longest, run) => (run.timeline.totalMs > longest.totalMs ? run.timeline : longest), runs[0].timeline);

    const risePose = (run, k, u) => {
      const local = new THREE.Vector3(
        0,
        STACK_FLOOR_Y + CARD_SIZE.height / 2 + RISE_UNITS * easeOutCubic(u),
        STACK_BACK_Z + stackDepthAfter(k, run.timeline.cards) - 0.04
      );
      return {
        position: local.applyMatrix4(run.rig.centred.matrix).applyMatrix4(run.rig.root.matrix),
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
          ? blendTransform(run.start, run.hover, eased, run.arc)
          : travel.leg === 'hover'
            ? run.hover
            : blendTransform(run.hover, run.start, eased, run.arc);
      applyTransform(rig.root, pose);
      rig.root.updateMatrix();
      rig.root.visible = travel.leg !== 'home' || travel.u < 1 || Boolean(run.plan.rest);

      // The lid springs open once the box is up, and shuts on the way home.
      setLid(rig, travel.leg === 'home' ? 1 - eased : easeOutBack(lidProgress(schedule, ms), 0.9));
      setStackDepth(rig, stackDepthAfter(cardsLaunched(timeline, ms), timeline.cards));

      run.cards.forEach((card, k) => {
        const { phase, u } = cardPhase(timeline, k, ms);
        card.visible = phase !== 'waiting' && !run.landed;
        if (phase === 'waiting') return;
        if (phase === 'rising') {
          applyTransform(card, risePose(run, k, u));
          return;
        }
        const land = run.land(k);
        applyTransform(card, phase === 'landed' ? land : blendTransform(risePose(run, k, 1), land, easeInOutCubic(u), run.cardArc));
      });

      // The flying cards are the deck until the last one is down; then the real pile takes over.
      if (!run.landed && ms >= timeline.lastLandMs) {
        run.landed = true;
        run.cards.forEach((card) => (card.visible = false));
        run.plan.onLanded?.();
      }
      setPileShown(run.plan.side, run.landed);
    };

    const finish = (run) => {
      for (const card of run.cards) group.remove(card);
      setPileShown(run.plan.side, true);
      if (!run.landed) run.plan.onLanded?.();
      run.rig.rest = run.plan.rest;
      run.rig.dealt = true;
      showRest(run.rig);
    };

    await new Promise((resolve) => {
      let started = null;
      let ended = false;
      const done = () => {
        if (ended) return;
        ended = true;
        if (state.deal?.frame) cancelAnimationFrame(state.deal.frame);
        state.deal = null;
        runs.forEach(finish);
        onNeedsRender();
        resolve();
      };
      const tick = (now) => {
        if (state.closed) return done();
        started ??= now;
        const ms = now - started;
        try {
          runs.forEach((run) => step(run, ms));
          onNeedsRender();
        } catch (error) {
          console.error('deck box deal: a frame failed', error);
          return done();
        }
        if (ms >= schedule.totalMs) return done();
        state.deal.frame = requestAnimationFrame(tick);
      };
      state.deal = { frame: requestAnimationFrame(tick), stop: done };
    });
  };

  const dispose = () => {
    if (state.closed) return;
    state.deal?.stop();
    state.closed = true;
    parent.remove(group);
    for (const disposable of owned) disposable.dispose();
    owned.clear();
  };

  return { setBox, setRest, playDeal, dispose, isDealing: () => Boolean(state.deal) };
}
