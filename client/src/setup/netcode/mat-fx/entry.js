// Design 027 / 034 / 035 / 036 / 037: signature entry animations. A Tera
// Pokémon is struck by the Tera Orb, crowned by the Tera Jewel and encased in
// a glittering crystal cluster that bursts to reveal it (tera-crystal.mjs);
// from then on it wears the crystal skin (tera-skin.js). A Mega Pokémon floods
// the mat with a prismatic hex field, goes white-hot inside a 3D keystone orb
// (mega-orb.mjs) whose cracked shell shatters into a vortex of orange and blue
// brush strokes (mega-vortex.mjs). Played by `evolve` (lifecycle.js) and by
// `enter` (a Pokémon put into play from hand, deck or discard). Self-removing
// layers; no-op when the card is unknown.
import { getCardRegistry } from '../apply-view.js';
import {
  animateFrames,
  rectForInstance,
  removeWhen,
  sampleKeyframes,
  spawnOverlay,
  spawnParticles,
} from '../../image-logic/mat-fx.mjs';
import {
  HEX_TINT_CELLS,
  HEX_WHITE_CELLS,
  hexTile,
  svgDataUrl,
} from './entry-art.mjs';
import { signatureEntryKind } from './entry-kind.mjs';
import { buildMegaShell, drawMegaOrb, megaOrbPose } from './mega-orb.mjs';
import { drawMegaVortex } from './mega-vortex.mjs';
import {
  MEGA_BURST_AT,
  MEGA_ENTRY_MS,
  megaFieldPose,
  megaFieldPlacement,
  megaFlashPose,
  megaLensPose,
  megaSilhouettePose,
  megaStageRect,
  megaWashPose,
  megaWavePose,
} from './entry-pose.mjs';
import { rgbCss } from './fx-colors.mjs';
import { burstParticles } from './particles.mjs';
import {
  TERA_ENTRY_MS,
  TERA_REVEAL_AT,
  buildTeraScene,
  drawTeraEntry,
} from './tera-crystal.mjs';
import { holdTeraSkin } from './tera-skin.js';

const BACKSTOP_PAD_MS = 400;
const MEGA_EMBER_RGB = [255, 150, 60];
const MEGA_SPARK_COLOURS = ['#ff8a2a', '#2ab8ff'];

const layer = (className) => {
  const el = document.createElement('div');
  el.className = className;
  return el;
};

const randomSeed = () => Math.floor(Math.random() * 1e6);

/** Size and centre `el` on (cx, cy) in its host's pixels. */
const placeCentered = (el, cx, cy, width, height = width) => {
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.left = `${cx - width / 2}px`;
  el.style.top = `${cy - height / 2}px`;
  return el;
};

const scaleFrames = (pose, samples = 24) =>
  sampleKeyframes(
    pose,
    (p) => ({ transform: `scale(${p.scale})`, opacity: p.opacity }),
    samples
  );

/**
 * A square canvas of `size` px centred on (cx, cy) in `host`, cleared and
 * redrawn every frame by `draw(ctx, t, elapsedMs)` in CSS pixels. Its clock
 * is the canvas's own WAAPI animation, read on every frame, so the drawing
 * stays in step with the other layers and stops with them.
 */
function playCanvasStage(
  host,
  { className, cx, cy, size, duration, draw, before = null }
) {
  const canvas = placeCentered(document.createElement('canvas'), cx, cy, size);
  canvas.className = className;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  host.insertBefore(canvas, before);
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.animate !== 'function') return Promise.resolve();
  const clock = canvas.animate([{ opacity: 1 }, { opacity: 1 }], {
    duration,
    fill: 'both',
  });
  const frame = () => {
    if (!canvas.isConnected) return;
    const elapsed = Number(clock.currentTime) || 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    draw(ctx, elapsed / duration, elapsed);
    if (clock.playState !== 'finished') requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return clock.finished.then(
    () => undefined,
    () => undefined
  );
}

// The Tera stage spans the rainbow fan and the burst's outer ring.
const TERA_STAGE = 7;

/** The Tera entry (tera-crystal.mjs): one canvas centred on the card. */
function playTeraEntry(rect) {
  const W = rect.width;
  const H = rect.height;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-tera-entry' });
  const scene = buildTeraScene(randomSeed());
  const size = H * TERA_STAGE;
  const done = playCanvasStage(host, {
    className: 'fx-tera-entry__stage',
    cx: W / 2,
    cy: H / 2,
    size,
    duration: TERA_ENTRY_MS,
    draw: (ctx, t) =>
      drawTeraEntry(ctx, t, {
        cx: size / 2,
        cy: size / 2,
        unit: H,
        card: { width: W, height: H },
        scene,
      }),
  });
  removeWhen(host, [done], TERA_ENTRY_MS + BACKSTOP_PAD_MS);
}

const viewportRect = () => ({
  left: 0,
  top: 0,
  width: window.innerWidth,
  height: window.innerHeight,
});

/**
 * Host for the Mega hex field. TCG Live paints it onto the mat itself, so it
 * goes inside the parent page's mat surface: it inherits the table tilt and
 * the mat outline, and the card zones (iframes) stay on top of it. Without a
 * mat surface it floats as a soft-edged overlay around the card.
 */
const spawnMegaField = (rect) => {
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
  const host = spawnOverlay({
    rect: stage,
    className: 'fx-overlay fx-mega-field fx-mega-field--floating',
  });
  return { host, place };
};

/** The mat-wide part: hex field revealed from the card, wavefront and glass lens. */
function playMegaField(rect, run) {
  const spawned = spawnMegaField(rect);
  if (!spawned) return [];
  const { host, place } = spawned;
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
        (p) => ({
          clipPath: `circle(${Math.max(0.5, p.reveal * reach)}px at ${x}px ${y}px)`,
          opacity: p.opacity,
        }),
        32
      )
    ),
    run(
      wash,
      sampleKeyframes(
        megaWashPose,
        (p) => ({ transform: `translate(${p.x * 100}%, ${p.y * 100}%)` }),
        8
      )
    ),
    run(
      sheen,
      sampleKeyframes(
        megaWashPose,
        (p) => ({ transform: `translateX(${p.x * 500}%)`, opacity: p.opacity }),
        8
      )
    ),
    run(wave, scaleFrames(megaWavePose)),
    run(lens, scaleFrames(megaLensPose, 32)),
  ];
  removeWhen(host, done, MEGA_ENTRY_MS + BACKSTOP_PAD_MS);
  return done;
}

const MEGA_ORB_STAGE = 8;
const MEGA_ORB_RADIUS = 0.72;

/**
 * The keystone orb (mega-orb.mjs) and the brush-stroke vortex it bursts into
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
  const embers = placeCentered(
    layer('fx-mega-entry__burst'),
    cx,
    cy - H * 0.4,
    W * 2.6,
    H
  );
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
  const run = (el, frames, options = {}) =>
    animateFrames(el, frames, { duration: MEGA_ENTRY_MS, ...options });
  playMegaField(rect, run);
  playMegaCard(rect, run);
}

/**
 * Play the signature entry for `kind` over the card at `rect`. Returns false
 * for other kinds. A Tera entry keeps `instanceId`'s crystal skin off until the
 * cluster bursts open, so the card is revealed already wearing it.
 */
export function playSignatureEntry(kind, rect, instanceId) {
  if (!rect) return false;
  if (kind === 'tera') {
    holdTeraSkin(instanceId, TERA_ENTRY_MS * TERA_REVEAL_AT);
    playTeraEntry(rect);
    return true;
  }
  if (kind === 'mega') {
    playMegaEntry(rect);
    return true;
  }
  return false;
}

/** `enter` effect: a Pokémon was put into play; only Mega/Tera get an animation. */
export const enter = (plan) => {
  const registry = getCardRegistry();
  const card = registry.get(plan.instanceId)?.card;
  const kind = signatureEntryKind(card);
  if (!kind) return;
  playSignatureEntry(
    kind,
    rectForInstance(plan.instanceId, registry),
    plan.instanceId
  );
};
