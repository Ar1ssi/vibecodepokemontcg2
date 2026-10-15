// Design 073: both players' deck boxes rest in the blurred band beside the mat, and when both players are
// ready each box flies onto its owner's half, opens and deals the deck onto the deck spot. This file
// measures the board and runs the sequence; deck-box-stage.js (three.js, loaded on first need) draws it.
import { selfContainerDocument, oppContainerDocument, systemState } from '../../../state.js';
import { cardBackSrcForUser } from '../../deck-constructor/hydrate-holo.js';
import { determineDeckData } from '../../general/determine-deckdata.js';
import { isE2eMode } from '../../general/e2e-mode.mjs';
import { hasDeckLoaded } from '../../general/has-deck-loaded.js';
import { visualRectOf } from '../../image-logic/iframe-rect.mjs';
import { fxDisabled, motionReduced } from '../../image-logic/mat-fx.mjs';
import { isSpectatingAuthoritative } from '../../spectator/spectator-session.js';
import { getZone } from '../../zones/get-zone.js';
import { beginOpeningDeal, endOpeningDeal } from './deck-box-gate.mjs';
import { dealTimeline, hoverPlacement, offBoardPlacement, restPlacement } from './deck-box-math.mjs';
import { DECK_BOX_SIDES, deckBoxes } from './deck-box-state.mjs';

const DEALING_CLASS = 'deckbox-dealing';
/** How long the deal waits for a stage that is still loading before the game goes on without it. */
const STAGE_WAIT_MS = 2000;
/** A slow backstop for layout changes no event reports (a mat's width easing in after a swap). */
const LAYOUT_POLL_MS = 1500;
const FRAME_IDS = { self: 'selfContainer', opp: 'oppContainer' };

let stage = null;
let stagePromise = null;
let stageFailed = false;
let syncQueued = false;
let lastRestKey = '';

const docFor = (side) => (side === 'self' ? selfContainerDocument : oppContainerDocument);

const usable = (rect) => rect && rect.width > 1 && rect.height > 1;

const rectOf = (element) => {
  if (!element) return null;
  try {
    const rect = visualRectOf(element);
    return usable(rect) ? rect : null;
  } catch {
    return null;
  }
};

/** The deck spot on screen: its top card, else its cover, else the zone. */
const deckRectFor = (side) => {
  const doc = docFor(side);
  if (!doc) return null;
  const cover = doc.getElementById('deckCover');
  return rectOf(cover?.querySelector('img')) || rectOf(cover) || rectOf(doc.getElementById('deck'));
};

const matRectFor = (side) => rectOf(docFor(side)?.querySelector('.hover-gutter-probe'));

const boardRectFor = (side) => {
  const rect = document.getElementById(FRAME_IDS[side])?.getBoundingClientRect();
  return usable(rect) ? rect : null;
};

/** The far half is the one whose frame the board shows flipped (it carries `.opp` after a board flip too). */
const isFarSide = (side) => Boolean(document.getElementById(FRAME_IDS[side])?.classList.contains('opp'));

const avoidRects = () => {
  const buttons = document.getElementById('boardButtonContainer');
  // Fixed-position, so offsetParent is always null: a hidden bar has no client rects instead.
  if (!buttons || buttons.getClientRects().length === 0) return [];
  return [buttons.getBoundingClientRect()];
};

const deckCountFor = (side) => {
  const zoneCount = getZone(side, 'deck')?.getCount?.() || 0;
  if (zoneCount > 0) return zoneCount;
  const rows = determineDeckData(side);
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => sum + (Number.parseInt(row?.[0], 10) || 0), 0);
};

const boardHidden = () => isSpectatingAuthoritative() || Boolean(document.body?.classList.contains('spectator-broadcast'));

const restFor = (side) => {
  if (boardHidden() || !hasDeckLoaded(side)) return null;
  return restPlacement({
    deckRect: deckRectFor(side),
    matRect: matRectFor(side),
    boardRect: boardRectFor(side),
    avoidRects: avoidRects(),
  });
};

const ensureStage = () => {
  if (stage) return Promise.resolve(stage);
  if (stageFailed) return Promise.resolve(null);
  stagePromise ??= import('./deck-box-stage.js')
    .then(({ createDeckBoxStage }) =>
      createDeckBoxStage({
        onLost: () => {
          console.warn('deck boxes: the WebGL context was lost; the boxes are hidden until reload');
          stageFailed = true;
          stage?.dispose();
          stage = null;
        },
      })
    )
    .then((created) => {
      stage = created;
      document.body.append(created.canvas);
      lastRestKey = '';
      scheduleSync();
      return created;
    })
    .catch((error) => {
      stageFailed = true;
      console.warn('deck boxes: the 3D stage is unavailable, so no deck boxes are drawn', error);
      return null;
    });
  return stagePromise;
};

const paintBoxes = () => {
  for (const side of DECK_BOX_SIDES) {
    stage.setBox(side, deckBoxes.idFor(side)).catch((error) => console.warn('deck boxes: box art failed to load', error));
  }
};

/** Puts each side's box at its resting spot (or hides it), drawing nothing that has not changed. */
const syncRest = () => {
  syncQueued = false;
  const rests = Object.fromEntries(DECK_BOX_SIDES.map((side) => [side, restFor(side)]));
  if (!stage) {
    if (Object.values(rests).some(Boolean)) ensureStage();
    return;
  }
  if (stage.isDealing()) return;
  paintBoxes();
  const key = JSON.stringify(
    DECK_BOX_SIDES.map((side) => {
      const rest = rests[side];
      return rest && [rest.side, Math.round(rest.cx), Math.round(rest.cy), Math.round(rest.height), deckBoxes.isDealt(side)];
    })
  );
  if (key === lastRestKey) return;
  lastRestKey = key;
  for (const side of DECK_BOX_SIDES) stage.setRest(side, rests[side], deckBoxes.isDealt(side));
};

const scheduleSync = () => {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(syncRest);
};

const setDealing = (side, dealing) => {
  docFor(side)?.documentElement?.classList.toggle(DEALING_CLASS, dealing);
};

const shouldSkipDeal = () =>
  isE2eMode() || fxDisabled() || motionReduced() || document.hidden || boardHidden() || Boolean(systemState.isReplay);

const waitForStage = () =>
  Promise.race([ensureStage(), new Promise((resolve) => setTimeout(() => resolve(null), STAGE_WAIT_MS))]);

const dealPlanFor = (side) => {
  const deckRect = deckRectFor(side);
  const matRect = matRectFor(side);
  const hover = hoverPlacement({ deckRect, matRect });
  if (!hover) return null;
  const rest = restFor(side);
  const start = rest ?? offBoardPlacement({ hover, boardRect: boardRectFor(side) });
  if (!start) return null;
  return {
    side,
    rest,
    start,
    hover,
    deckRect,
    far: isFarSide(side),
    deckCount: deckCountFor(side),
    sleeveUrl: cardBackSrcForUser(side) || null,
    onLanded: () => setDealing(side, false),
  };
};

/**
 * Both players are ready: every side with a deck deals it out of its box. Resolves once the boxes are
 * home (at once when the deal is skipped: e2e, effects off, reduced motion, a hidden tab, spectating,
 * or no 3D stage). The opening coin waits for it through the deal gate (deck-box-gate.mjs).
 *
 * @returns {Promise<void>}
 */
export async function playOpeningDeal() {
  const sides = DECK_BOX_SIDES.filter((side) => hasDeckLoaded(side));
  if (sides.length === 0) return;
  const markDealt = () => sides.forEach((side) => deckBoxes.setDealt(side, true));
  if (shouldSkipDeal()) {
    markDealt();
    return;
  }
  const ready = await waitForStage();
  const plans = sides.map(dealPlanFor).filter(Boolean);
  if (!ready || ready.isDealing() || plans.length === 0) {
    markDealt();
    return;
  }

  const totalMs = Math.max(...plans.map((plan) => dealTimeline(plan.deckCount).totalMs));
  beginOpeningDeal(totalMs);
  document.dispatchEvent(new CustomEvent('opening-deal-started', { detail: { ms: totalMs } }));
  plans.forEach((plan) => setDealing(plan.side, true));
  try {
    paintBoxes();
    await ready.playDeal(plans);
  } catch (error) {
    console.error('deck boxes: the opening deal failed', error);
  } finally {
    plans.forEach((plan) => setDealing(plan.side, false));
    markDealt();
    lastRestKey = '';
    endOpeningDeal();
    scheduleSync();
  }
}

const onDeckBoxChanged = (event) => {
  const { target, deckBoxId } = event.detail || {};
  // A room opponent's box comes from their own deck packet, never from this player's builder.
  if (target === 'opp' && systemState.isTwoPlayer) return;
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
    stage?.resize();
    lastRestKey = '';
    scheduleSync();
  });
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(scheduleSync);
    for (const id of Object.values(FRAME_IDS)) {
      const frame = document.getElementById(id);
      if (frame) observer.observe(frame);
    }
  }
  for (const id of Object.values(FRAME_IDS)) document.getElementById(id)?.addEventListener('load', scheduleSync);
  setInterval(scheduleSync, LAYOUT_POLL_MS);
  scheduleSync();
}
