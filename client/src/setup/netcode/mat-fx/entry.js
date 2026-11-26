// Design 027 / 034 / 035 / 036 / 037: signature entry animations. A Tera
// Pokémon is struck by the Tera Orb, crowned by the Tera Jewel and encased in
// a glittering crystal cluster that bursts to reveal it (tera-crystal.mjs);
// it comes out wearing its crystal coat (tera-skin.js). A Mega Pokémon floods
// the mat with a prismatic hex field, goes white-hot inside a 3D keystone orb
// (mega-orb.mjs) whose cracked shell shatters into a vortex of orange and blue
// energy ribbons (mega-vortex.mjs). A Pokémon VMAX Gigantamaxes: a magenta
// column streams up behind it, the card itself swells to giant size and a ring
// of crimson clouds circles it (gmax-entry.mjs). Every canvas stage runs through
// the stage's post pass (stage-post.js: bloom and highlight roll-off). Played by `evolve`
// (lifecycle.js) and by `enter` (a Pokémon put into play from hand, deck or
// discard). Each returns the hold its scene needs, so what follows waits for
// the reveal; the evolve sample's peak lands on the burst (`signatureBurstMs`).
// Self-removing layers; no-op when the card is unknown.
import { board3dActive, matCorners, matRect } from '../../board3d/board-rects.js';
import { getBoardScene } from '../../board3d/board3d.js';
import { getCardRegistry } from '../apply-view.js';
import {
  animateFrames,
  rectForInstance,
  removeWhen,
  sampleKeyframes,
  spawnOverlay,
  spawnParticles,
} from '../../image-logic/mat-fx.mjs';
import { HEX_TINT_CELLS, HEX_WHITE_CELLS, hexTile, svgDataUrl } from './entry-art.mjs';
import { placeCentered, playCanvasStage } from './canvas-stage.js';
import { playLanding, shownId, stageCard } from './board-fx.js';
import { landWhenFlown } from './card-flight.mjs';
import { signatureEntryKind } from './entry-kind.mjs';
import {
  GMAX_BURST_MS,
  GMAX_ENTRY_MS,
  GMAX_HOLD_MS,
  GMAX_PALETTE,
  GMAX_SETTLE_AT,
  buildGmaxScene,
  drawGmaxEntry,
  gmaxCardPose,
  gmaxPostPose,
} from './gmax-entry.mjs';
import { flyFromPile } from './transit.js';
import { buildMegaShell, drawMegaOrb, megaOrbPose } from './mega-orb.mjs';
import { drawMegaVortex } from './mega-vortex.mjs';
import {
  MEGA_BURST_AT,
  MEGA_BURST_MS,
  MEGA_ENTRY_MS,
  MEGA_HOLD_MS,
  megaFieldPlacement,
  megaFieldPose,
  megaFlashPose,
  megaLensPose,
  megaPostPose,
  megaSilhouettePose,
  megaStageRect,
  megaWashPose,
  megaWavePose,
} from './entry-pose.mjs';
import { rgbCss } from './fx-colors.mjs';
import { burstParticles } from './particles.mjs';
import {
  TERA_BURST_MS,
  TERA_ENTRY_MS,
  TERA_HOLD_MS,
  buildTeraScene,
  drawTeraEntry,
  teraEntryPaletteForCard,
  teraPostPose,
} from './tera-crystal.mjs';
import { formTeraSkinAt } from './tera-skin.js';

const BACKSTOP_PAD_MS = 400;
// A flight that never reports its landing (the scene went away) lands the card this late anyway.
const LANDING_BACKSTOP_MS = 250;
const MEGA_EMBER_RGB = [255, 150, 60];
const MEGA_SPARK_COLOURS = ['#ff8a2a', '#2ab8ff'];

const HOLD_MS = Object.freeze({ tera: TERA_HOLD_MS, mega: MEGA_HOLD_MS, gmax: GMAX_HOLD_MS });
const BURST_MS = Object.freeze({ tera: TERA_BURST_MS, mega: MEGA_BURST_MS, gmax: GMAX_BURST_MS });

/** When a signature entry's burst lands, ms from its start (its sound is aligned to it); null for no entry. */
export const signatureBurstMs = (kind) => BURST_MS[kind] ?? null;

const layer = (className) => {
  const el = document.createElement('div');
  el.className = className;
  return el;
};

const randomSeed = () => Math.floor(Math.random() * 1e6);

const scaleFrames = (pose, samples = 24) =>
  sampleKeyframes(pose, (p) => ({ transform: `scale(${p.scale})`, opacity: p.opacity }), samples);

// The Tera stage spans the rainbow fan and the burst's outer ring.
const TERA_STAGE = 7;

/**
 * The Tera entry (tera-crystal.mjs): one canvas centred on the card, its
 * crystal in the colour of the card's type. The card's crystal coat forms
 * under the whiteout, so the burst reveals it already wearing it.
 */
function playTeraEntry(rect, instanceId, card) {
  const W = rect.width;
  const H = rect.height;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-tera-entry' });
  const scene = buildTeraScene(randomSeed());
  const palette = teraEntryPaletteForCard(card);
  const size = H * TERA_STAGE;
  const board = getBoardScene();
  if (board) formTeraSkinAt(instanceId, board.clock.now() + TERA_BURST_MS);
  const done = playCanvasStage(host, {
    className: 'fx-tera-entry__stage',
    cx: W / 2,
    cy: H / 2,
    size,
    duration: TERA_ENTRY_MS,
    post: teraPostPose,
    draw: (ctx, t) =>
      drawTeraEntry(ctx, t, {
        cx: size / 2,
        cy: size / 2,
        unit: H,
        card: { width: W, height: H },
        scene,
        palette,
      }),
  });
  removeWhen(host, [done], TERA_ENTRY_MS + BACKSTOP_PAD_MS);
}

const viewportRect = () => ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });

/**
 * Design 074 §D6: on the three.js board the mat is a canvas, so the field cannot slide under
 * the cards. It goes above the canvas in a top-document layer the size of the projected table,
 * clipped to the cloth's quad and screened onto it (`mix-blend-mode: screen`), so it lights the
 * mat and the cards alike instead of covering them.
 */
const spawnBoard3dMegaField = (rect) => {
  const table = matRect();
  const corners = matCorners();
  if (!table || !(table.width > 1) || !(table.height > 1)) return null;
  const place = megaFieldPlacement(rect, table, { width: table.width, height: table.height });
  if (!place) return null;
  const clip = spawnOverlay({ rect: table, className: 'fx-overlay fx-mega-field-board3d' });
  if (corners) {
    const points = corners.map(({ x, y }) => `${(x - table.left).toFixed(1)}px ${(y - table.top).toFixed(1)}px`);
    clip.style.clipPath = `polygon(${points.join(', ')})`;
  }
  const host = layer('fx-mega-field');
  clip.appendChild(host);
  return { host, place, root: clip };
};

/**
 * Host for the Mega hex field. TCG Live paints it onto the mat itself, so on the DOM board it
 * goes inside the parent page's mat surface: it inherits the table tilt and the mat outline, and
 * the card zones stay on top of it. Without a mat surface it floats as a soft-edged overlay
 * around the card.
 */
const spawnMegaField = (rect) => {
  if (board3dActive()) return spawnBoard3dMegaField(rect);
  const surface = document.getElementById('battleMatSurface');
  if (surface?.isConnected && surface.offsetWidth > 1) {
    const place = megaFieldPlacement(rect, surface.getBoundingClientRect(), {
      width: surface.offsetWidth,
      height: surface.offsetHeight,
    });
    if (place) {
      const host = layer('fx-mega-field');
      surface.appendChild(host);
      return { host, place };
    }
  }
  const stage = megaStageRect(rect, viewportRect());
  const place = megaFieldPlacement(rect, stage, stage);
  if (!place) return null;
  const host = spawnOverlay({ rect: stage, className: 'fx-overlay fx-mega-field fx-mega-field--floating' });
  return { host, place };
};

/** The mat-wide part: hex field revealed from the card, wavefront and glass lens. */
function playMegaField(rect, run) {
  const spawned = spawnMegaField(rect);
  if (!spawned) return;
  const { host, place, root = host } = spawned;
  const { x, y, unit, reach } = place;
  const wash = layer('fx-mega-field__wash');
  const hexes = [HEX_WHITE_CELLS, HEX_TINT_CELLS].map((cells) => {
    const tile = hexTile(Math.max(8, unit * 0.16), cells);
    const hex = layer('fx-mega-field__hex');
    hex.style.backgroundImage = svgDataUrl(tile.svg);
    hex.style.backgroundSize = `${tile.width}px ${tile.height}px`;
    return hex;
  });
  const sheen = layer('fx-mega-field__sheen');
  const wave = placeCentered(layer('fx-mega-field__wave'), x, y, reach * 2);
  const lens = placeCentered(layer('fx-mega-field__lens'), x, y, unit * 3.2);
  lens.appendChild(layer('fx-mega-field__lens-core'));
  host.append(wash, ...hexes, sheen, wave, lens);

  const done = [
    run(
      host,
      sampleKeyframes(
        megaFieldPose,
        (p) => ({ clipPath: `circle(${Math.max(0.5, p.reveal * reach)}px at ${x}px ${y}px)`, opacity: p.opacity }),
        32
      )
    ),
    run(wash, sampleKeyframes(megaWashPose, (p) => ({ transform: `translate(${p.x * 100}%, ${p.y * 100}%)` }), 8)),
    run(sheen, sampleKeyframes(megaWashPose, (p) => ({ transform: `translateX(${p.x * 500}%)`, opacity: p.opacity }), 8)),
    run(wave, scaleFrames(megaWavePose)),
    run(lens, scaleFrames(megaLensPose, 32)),
  ];
  removeWhen(root, done, MEGA_ENTRY_MS + BACKSTOP_PAD_MS);
}

const MEGA_ORB_STAGE = 8;
const MEGA_ORB_RADIUS = 0.72;

/**
 * The keystone orb (mega-orb.mjs) and the energy-ribbon vortex it bursts into
 * (mega-vortex.mjs), on one canvas stage under the flash.
 */
function playMegaOrb(host, cx, cy, W, H) {
  const size = H * MEGA_ORB_STAGE;
  const shell = buildMegaShell(randomSeed());
  return playCanvasStage(host, {
    className: 'fx-mega-entry__orb',
    cx,
    cy,
    size,
    duration: MEGA_ENTRY_MS,
    before: host.querySelector('.fx-mega-entry__flash'),
    post: megaPostPose,
    draw: (ctx, t, elapsed) => {
      drawMegaOrb(ctx, megaOrbPose(t, MEGA_BURST_AT), shell, {
        cx: size / 2,
        cy: size / 2,
        unit: H * MEGA_ORB_RADIUS,
        time: elapsed / 1000,
      });
      drawMegaVortex(ctx, t, {
        cx: size / 2,
        cy: size / 2,
        unit: H,
        card: { width: W, height: H },
        burstAt: MEGA_BURST_AT,
        time: elapsed / 1000,
      });
    },
  });
}

/** The card-local part: white-hot card, keystone orb and vortex, burst, embers. */
function playMegaCard(rect, run) {
  const W = rect.width;
  const H = rect.height;
  const cx = W / 2;
  const cy = H / 2;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-mega-entry' });
  const silhouette = layer('fx-mega-entry__silhouette');
  const flash = placeCentered(layer('fx-mega-entry__flash'), cx, cy, H * 3);
  const burst = layer('fx-mega-entry__burst');
  const embers = placeCentered(layer('fx-mega-entry__burst'), cx, cy - H * 0.4, W * 2.6, H);
  host.append(silhouette, flash, burst, embers);

  const done = [
    run(silhouette, scaleFrames(megaSilhouettePose)),
    playMegaOrb(host, cx, cy, W, H),
    run(flash, scaleFrames(megaFlashPose, 32)),
  ];

  MEGA_SPARK_COLOURS.forEach((colour) => {
    const sparks = burstParticles({
      count: 12,
      distance: H * 1.9,
      size: [H * 0.18, H * 0.34],
      aspect: 0.14,
      maxDelay: 0.08,
      seed: randomSeed(),
    });
    done.push(
      ...spawnParticles(burst, sparks, {
        className: 'fx-particle--streak',
        color: colour,
        duration: MEGA_ENTRY_MS * 0.2,
        delay: MEGA_ENTRY_MS * (MEGA_BURST_AT - 0.01),
      })
    );
  });
  const rising = burstParticles({
    count: 22,
    distance: H * 1.4,
    direction: -90,
    spread: 110,
    size: [W * 0.03, W * 0.07],
    gravity: -H * 0.3,
    maxDelay: 0.6,
    seed: randomSeed(),
  });
  done.push(
    ...spawnParticles(embers, rising, {
      className: 'fx-particle--mote',
      color: rgbCss(MEGA_EMBER_RGB),
      duration: MEGA_ENTRY_MS * 0.5,
      delay: MEGA_ENTRY_MS * 0.3,
    })
  );
  removeWhen(host, done, MEGA_ENTRY_MS + BACKSTOP_PAD_MS);
}

function playMegaEntry(rect) {
  const run = (el, frames, options = {}) => animateFrames(el, frames, { duration: MEGA_ENTRY_MS, ...options });
  playMegaField(rect, run);
  playMegaCard(rect, run);
}

// The Gigantamax stage spans the column above the card and the cloud ring as it widens.
const GMAX_STAGE = 8;
const GMAX_DRIVE_MS = Math.round(GMAX_ENTRY_MS * GMAX_SETTLE_AT);

/**
 * The card mesh itself Gigantamaxes (gmaxCardPose): it crouches and strains, swells to giant
 * size at the burst, lifted clear of its neighbours, and springs back into its slot, its edge
 * burning magenta meanwhile. False where no 3D scene draws the card (the DOM board): the canvas
 * then frames the card at its own size.
 */
function driveGmaxCard(instanceId) {
  const scene = getBoardScene();
  const id = shownId(instanceId);
  const card = scene?.drive ? stageCard(scene, id) : null;
  if (!card) return false;
  scene.drive(
    id,
    (ms) => {
      const pose = gmaxCardPose(ms / GMAX_ENTRY_MS);
      return {
        dx: pose.shake * card.h,
        dy: 0,
        dz: pose.lift * card.h,
        yawDeg: pose.yawDeg,
        scale: pose.scale,
        scaleAlong: 1,
        scaleAcross: 1,
        laneAngleDeg: 0,
      };
    },
    GMAX_DRIVE_MS
  );
  scene.cardFx?.(id, { at: (ms) => ({ rim: gmaxCardPose(ms / GMAX_ENTRY_MS).rim }), ms: GMAX_DRIVE_MS, rimRgb: GMAX_PALETTE.magenta });
  return true;
}

/** A scratch 2D context the size of `ctx`'s canvas (drawGmaxEntry lays its clouds on from it). */
const scratchLayerFor = (ctx) => {
  const canvas = document.createElement('canvas');
  canvas.width = ctx.canvas.width;
  canvas.height = ctx.canvas.height;
  return canvas.getContext('2d');
};

/** The Gigantamax entry (gmax-entry.mjs): one canvas centred on the card, over the card's own swell. */
function playGmaxEntry(rect, instanceId) {
  const W = rect.width;
  const H = rect.height;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-gmax-entry' });
  const scene = buildGmaxScene(randomSeed());
  const grows = driveGmaxCard(instanceId);
  const size = H * GMAX_STAGE;
  let layer;
  const done = playCanvasStage(host, {
    className: 'fx-gmax-entry__stage',
    cx: W / 2,
    cy: H / 2,
    size,
    duration: GMAX_ENTRY_MS,
    post: gmaxPostPose,
    draw: (ctx, t) => {
      layer ??= scratchLayerFor(ctx);
      drawGmaxEntry(ctx, t, {
        cx: size / 2,
        cy: size / 2,
        unit: H,
        card: { width: W, height: H },
        scene,
        grows,
        layer,
      });
    },
  });
  removeWhen(host, [done], GMAX_ENTRY_MS + BACKSTOP_PAD_MS);
}

/**
 * Play the signature entry for `kind` over the card `instanceId`; `card` (the entering card) picks
 * a Tera crystal's type colour. `rect` is the card's on-screen box (default: its own).
 * @returns {number | false} the hold in ms, or false when it did not play (another kind, or the
 *   card is not on screen)
 */
export function playSignatureEntry(kind, instanceId, card, rect = rectForInstance(instanceId, getCardRegistry())) {
  if (!rect || !(kind in HOLD_MS)) return false;
  if (kind === 'tera') playTeraEntry(rect, instanceId, card);
  else if (kind === 'gmax') playGmaxEntry(rect, instanceId);
  else playMegaEntry(rect);
  return HOLD_MS[kind];
}

/**
 * `enter` effect: a Pokémon was put into play. A Mega, Tera or VMAX plays its signature entry; any other
 * lands on its slot (design 089: the card settles, a ring in its type colour rolls out from under
 * it). One that came out of the deck or the discard pile flies in from that pile first
 * (`plan.held`: the card, hidden since the plan was queued).
 */
export const enter = (plan) => {
  clearTimeout(plan.backstop);
  const card = getCardRegistry().get(plan.instanceId)?.card;
  const held = Array.isArray(plan.held) ? plan.held[0] : null;
  const kind = signatureEntryKind(card);
  const land = () => {
    const hold = kind ? playSignatureEntry(kind, plan.instanceId, card) : false;
    if (hold === false) playLanding(plan.instanceId, card);
    return hold;
  };
  // The landing (the Gigantamax swell, the settle) drives the card's mesh: it waits for the flight
  // to let go of it. Set before the flight can land, as its landing is reported asynchronously.
  let flown = null;
  const flightMs = held ? flyFromPile(held, plan.user, plan.from, () => flown?.()) : 0;
  if (flightMs > 0) {
    flown = landWhenFlown(land, flightMs + LANDING_BACKSTOP_MS);
    return kind ? flightMs + HOLD_MS[kind] : flightMs * 0.8;
  }
  const hold = land();
  return hold === false ? undefined : hold;
};
