// Design 073: both players' deck boxes stand on the table in the blurred band beside the mat, and when
// both players are ready each box flies onto its owner's half, opens and deals the deck onto the deck
// spot. This file reads the three.js board (layout, model, mat art) and runs the sequence;
// board3d/deck-box-rig.js (three.js, loaded on first need) draws it inside the board's scene.
import { systemState } from '../../../state.js';
import { board3dActive, getBoardScene } from '../../board3d/board3d.js';
import { cardScaleFor } from '../../board3d/card-geometry.mjs';
import { pilePose, pileThicknessPx } from '../../board3d/pile-poses.mjs';
import { tableBounds } from '../../board3d/table-uv.mjs';
import { isE2eMode } from '../../general/e2e-mode.mjs';
import { fxDisabled, motionReduced } from '../../image-logic/mat-fx.mjs';
import { isSpectatingAuthoritative } from '../../spectator/spectator-session.js';
import { beginOpeningDeal, endOpeningDeal } from './deck-box-gate.mjs';
import { dealTimeline, hoverPose, offTablePose, restPose } from './deck-box-math.mjs';
import { DECK_BOX_SIDES, deckBoxes } from './deck-box-state.mjs';

/** How long the deal waits for rigs that are still loading before the game goes on without them. */
const RIGS_WAIT_MS = 2000;
/** A slow backstop for layout changes no event reports (a mat's art landing after a swap). */
const LAYOUT_POLL_MS = 1500;
/** pile-mesh.js PILE_LIFT_PX: the deck's bottom layer sits this far off the cloth. */
const PILE_LIFT_PX = 1.5;
const SEAT_YAW_DEG = { self: 0, opp: 180 };

/** The rigs and the board scene they were built in (a lost WebGL context builds a new scene). */
let rigs = null;
let rigsScene = null;
let rigsPromise = null;
let rigsFailed = false;
let syncQueued = false;
let lastRestKey = '';

const liveScene = () => {
  if (!board3dActive()) return null;
  try {
    return getBoardScene() ?? null;
  } catch {
    return null;
  }
};

const tableFrameOf = (scene) => scene?.inspect?.()?.scene?.getObjectByName('board3d-table-frame') ?? null;

const boardHidden = () => isSpectatingAuthoritative() || Boolean(document.body?.classList.contains('spectator-broadcast'));

/** The deck pile on `side`: its pose on the table, its count, its sleeve and its top's height. */
const deckOf = (scene, side) => {
  const { layout, model } = scene?.inspect?.() ?? {};
  const pose = layout ? pilePose(side, 'deck', layout) : null;
  const pile = model?.piles?.[side]?.deck;
  const count = Math.max(0, Number(pile?.count) || 0);
  if (!pose || count === 0) return null;
  const layers = Math.max(0, Number(pile?.layers) || 0);
  return {
    pose,
    count,
    sleeveSrc: pile?.sleeve || null,
    topZ: PILE_LIFT_PX + pileThicknessPx(layers, cardScaleFor(pose.widthPx)),
  };
};

const tableSpanOf = (scene) => {
  const layout = scene?.inspect?.()?.layout;
  const bounds = layout ? tableBounds(layout) : null;
  return bounds && bounds.w > 0 ? { x0: bounds.x, x1: bounds.x + bounds.w } : null;
};

/** The x-span (table px) of the mat art shown on either half, or null when neither shows art. */
const artSpanOf = (scene) => {
  const frame = tableFrameOf(scene);
  if (!frame) return null;
  frame.updateMatrixWorld(true);
  const xs = [];
  frame.traverse((object) => {
    if (object.name !== 'board3d-mat-art' || !object.visible) return;
    for (const [cx, cy] of [
      [-0.5, -0.5],
      [0.5, 0.5],
    ]) {
      const corner = object.localToWorld(new object.position.constructor(cx, cy, 0));
      xs.push(frame.worldToLocal(corner).x);
    }
  });
  return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs) } : null;
};

const restFor = (scene, side) => {
  if (boardHidden()) return null;
  const deck = deckOf(scene, side);
  if (!deck) return null;
  return restPose({ deck: deck.pose, art: artSpanOf(scene), table: tableSpanOf(scene) });
};

const dropRigs = () => {
  rigs?.dispose();
  rigs = null;
  rigsScene = null;
  rigsPromise = null;
  lastRestKey = '';
};

/** The rigs for the live board scene, built on first need; null when there is no board or they failed. */
const ensureRigs = (scene) => {
  if (!scene || rigsFailed) return Promise.resolve(null);
  if (rigs && rigsScene === scene) return Promise.resolve(rigs);
  if (rigsScene !== scene) dropRigs();
  const frame = tableFrameOf(scene);
  if (!frame) return Promise.resolve(null);
  rigsScene = scene;
  rigsPromise ??= import('../../board3d/deck-box-rig.js')
    .then(({ createDeckBoxRigs }) =>
      createDeckBoxRigs({
        parent: frame,
        onNeedsRender: () => scene.invalidate?.(),
        findPile: (side) => frame.getObjectByName(`board3d-pile-${side}:deck`) ?? null,
      })
    )
    .then((created) => {
      if (rigsScene !== scene) {
        created.dispose();
        return null;
      }
      rigs = created;
      lastRestKey = '';
      scheduleSync();
      return created;
    })
    .catch((error) => {
      rigsFailed = true;
      console.warn('deck boxes: the 3D deck boxes are unavailable, so none are drawn', error);
      return null;
    });
  return rigsPromise;
};

const paintBoxes = () => {
  for (const side of DECK_BOX_SIDES) {
    rigs.setBox(side, deckBoxes.idFor(side)).catch((error) => console.warn('deck boxes: box art failed to load', error));
  }
};

/** Puts each side's box at its resting spot (or hides it), touching nothing that has not changed. */
const syncRest = () => {
  syncQueued = false;
  const scene = liveScene();
  if (!scene) {
    if (rigs) dropRigs();
    return;
  }
  const rests = Object.fromEntries(DECK_BOX_SIDES.map((side) => [side, restFor(scene, side)]));
  if (!rigs || rigsScene !== scene) {
    if (Object.values(rests).some(Boolean)) ensureRigs(scene);
    return;
  }
  if (rigs.isDealing()) return;
  paintBoxes();
  const key = JSON.stringify(
    DECK_BOX_SIDES.map((side) => {
      const rest = rests[side];
      return rest && [Math.round(rest.x), Math.round(rest.y), rest.scale.toFixed(3), deckBoxes.isDealt(side)];
    })
  );
  if (key === lastRestKey) return;
  lastRestKey = key;
  for (const side of DECK_BOX_SIDES) rigs.setRest(side, rests[side], deckBoxes.isDealt(side));
};

function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(syncRest);
}

const shouldSkipDeal = () =>
  isE2eMode() || fxDisabled() || motionReduced() || document.hidden || boardHidden() || Boolean(systemState.isReplay);

const waitForRigs = (scene) =>
  Promise.race([ensureRigs(scene), new Promise((resolve) => setTimeout(() => resolve(null), RIGS_WAIT_MS))]);

const dealPlanFor = (scene, side) => {
  const deck = deckOf(scene, side);
  const table = tableSpanOf(scene);
  if (!deck || !table) return null;
  const hover = hoverPose({ deck: deck.pose, table });
  const rest = restFor(scene, side);
  const start = rest ?? offTablePose({ deck: deck.pose, table });
  if (!hover || !start) return null;
  return {
    side,
    rest,
    start,
    hover,
    deck: deck.pose,
    deckCount: deck.count,
    topZ: deck.topZ,
    seatYawDeg: SEAT_YAW_DEG[side],
    sleeveSrc: deck.sleeveSrc,
  };
};

/**
 * Both players are ready: every side with a deck on the board deals it out of its box. Resolves once
 * the boxes are home (at once when the deal is skipped: e2e, effects off, reduced motion, a hidden
 * tab, spectating, a replay, no 3D board or no rigs). The opening coin waits for it through the deal
 * gate (deck-box-gate.mjs).
 *
 * @returns {Promise<void>}
 */
export async function playOpeningDeal() {
  const scene = liveScene();
  const sides = DECK_BOX_SIDES.filter((side) => deckOf(scene, side));
  if (sides.length === 0) return;
  const markDealt = () => sides.forEach((side) => deckBoxes.setDealt(side, true));
  if (shouldSkipDeal()) {
    markDealt();
    return;
  }
  const ready = await waitForRigs(scene);
  const plans = sides.map((side) => dealPlanFor(scene, side)).filter(Boolean);
  if (!ready || ready.isDealing() || plans.length === 0) {
    markDealt();
    return;
  }

  const totalMs = Math.max(...plans.map((plan) => dealTimeline(plan.deckCount).totalMs));
  beginOpeningDeal(totalMs);
  document.dispatchEvent(new CustomEvent('opening-deal-started', { detail: { ms: totalMs } }));
  try {
    paintBoxes();
    await ready.playDeal(plans);
  } catch (error) {
    console.error('deck boxes: the opening deal failed', error);
  } finally {
    markDealt();
    lastRestKey = '';
    endOpeningDeal();
    scheduleSync();
  }
}

const onDeckBoxChanged = (event) => {
  const { target, deckBoxId } = event.detail || {};
  // A room opponent's box comes from their own deck packet, never from this player's builder; a solo
  // room's far deck is this player's own second deck (design 074 D7).
  if (target === 'opp' && systemState.isTwoPlayer && !systemState.solo) return;
  deckBoxes.setId(target, deckBoxId ?? null);
};

if (typeof document !== 'undefined') {
  document.addEventListener('deck-box-changed', onDeckBoxChanged);
  document.addEventListener('game-restarted', () => deckBoxes.clearDealt());
  document.addEventListener('room-changed', () => {
    deckBoxes.setId('opp', null);
    deckBoxes.clearDealt();
  });
  deckBoxes.subscribe(() => {
    lastRestKey = '';
    scheduleSync();
  });
}

/** Starts tracking the board so the resting boxes follow the layout. Called once at startup. */
export function installDeckBoxes() {
  const events = ['action-processed', 'mat-layout-applied', 'board-layout-changed', 'playmat-changed', 'board-view-applied'];
  for (const name of events) document.addEventListener(name, scheduleSync);
  window.addEventListener('resize', () => {
    lastRestKey = '';
    scheduleSync();
  });
  setInterval(scheduleSync, LAYOUT_POLL_MS);
  scheduleSync();
}
