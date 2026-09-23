// Design 027 / 034 / 035: signature entry animations. A Tera Pokémon turns
// into a mint crystal that grows a Tera jewel, fills with white light and
// bursts in violet smoke; a Mega Pokémon floods the mat with a prismatic hex
// field, goes white-hot inside a 3D keystone orb (mega-orb.mjs) whose cracked
// shell shatters into a vortex of orange and blue brush strokes. Played by
// `evolve` (lifecycle.js) and by `enter` (a Pokémon put into play from hand,
// deck or discard). Self-removing layers; no-op when the card is unknown.
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
  TERA_FACETS_SVG,
  hexTile,
  megaSlashSvg,
  svgDataUrl,
  teraJewelSvg,
} from './entry-art.mjs';
import { signatureEntryKind } from './entry-kind.mjs';
import { buildMegaShell, drawMegaOrb, megaOrbPose } from './mega-orb.mjs';
import {
  MEGA_BURST_AT,
  MEGA_ENTRY_MS,
  TERA_BURST_AT,
  TERA_ENTRY_MS,
  TERA_GLINT_AT,
  megaFieldPose,
  megaFieldPlacement,
  megaFlashPose,
  megaLensPose,
  megaSilhouettePose,
  megaSlashPose,
  megaStageRect,
  megaWashPose,
  megaWavePose,
  teraFillPose,
  teraFlashPose,
  teraJewelPose,
  teraRaysPose,
  teraRingPose,
  teraSlabPose,
  teraSmokePose,
  teraStreakPose,
  teraWhiteoutPose,
} from './entry-pose.mjs';
import { rgbCss } from './fx-colors.mjs';
import { burstParticles } from './particles.mjs';

const BACKSTOP_PAD_MS = 400;
// TCG Live draws every Tera crystal in the same mint, whatever the Tera type.
const TERA_MINT_RGB = [95, 225, 185];
const TERA_GLITTER_COLOURS = ['#8dffc0', '#ff9fe2', '#b690ff', '#ffffff'];
const MEGA_EMBER_RGB = [255, 150, 60];
const MEGA_SPARK_COLOURS = ['#ff8a2a', '#2ab8ff'];

const layer = (className, html) => {
  const el = document.createElement('div');
  el.className = className;
  if (html) el.innerHTML = html;
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

const opacityFrames = (pose, samples = 16) =>
  sampleKeyframes(pose, (p) => ({ opacity: p.opacity }), samples);

const spinFrames = (pose, samples = 24) =>
  sampleKeyframes(
    pose,
    (p) => ({
      transform: `rotate(${p.rotate}deg) scale(${p.scale})`,
      opacity: p.opacity,
    }),
    samples
  );

/** A twinkle: a four-point star that pops, turns and shrinks away. */
const twinkleFrames = [
  { transform: 'scale(0) rotate(0deg)', opacity: 0 },
  { transform: 'scale(1) rotate(45deg)', opacity: 1, offset: 0.35 },
  { transform: 'scale(0) rotate(90deg)', opacity: 0 },
];

// Where the glitter twinkles after the Tera reveal, as fractions of the card.
const TERA_GLINT_SPOTS = [
  [-0.08, 0.12, 0],
  [1.04, 0.3, 0.12],
  [0.86, 1.02, 0.22],
  [-0.02, 0.78, 0.32],
  [0.5, -0.06, 0.4],
];

function playTeraEntry(rect) {
  const W = rect.width;
  const H = rect.height;
  const cx = W / 2;
  const cy = H / 2;
  const mint = TERA_MINT_RGB;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-tera-entry' });
  host.style.setProperty('--fx-tera-rgb', mint.join(', '));
  const at = (fraction) => TERA_ENTRY_MS * fraction;

  const smoke = placeCentered(layer('fx-tera-entry__smoke'), cx, cy, H * 2.4);
  const PUFFS = 14;
  for (let i = 0; i < PUFFS; i += 1) {
    const angle = (i / PUFFS) * Math.PI * 2 + (i % 2) * 0.2;
    const radius = H * (0.66 + 0.08 * (i % 3));
    const puff = layer('fx-tera-entry__puff');
    placeCentered(
      puff,
      H * 1.2 + Math.cos(angle) * radius,
      H * 1.2 + Math.sin(angle) * radius * 0.85,
      H * (0.46 + 0.1 * ((i * 7) % 3))
    );
    smoke.appendChild(puff);
  }
  const rays = placeCentered(layer('fx-tera-entry__rays'), cx, cy, H * 3.4);
  const ringA = placeCentered(layer('fx-tera-entry__ring'), cx, cy, H * 2.1);
  const ringB = placeCentered(
    layer('fx-tera-entry__ring fx-tera-entry__ring--wide'),
    cx,
    cy,
    H * 2.6,
    H * 2.2
  );
  const streakA = placeCentered(
    layer('fx-tera-entry__streak'),
    cx,
    cy,
    W * 7,
    H * 0.09
  );
  const streakB = placeCentered(
    layer('fx-tera-entry__streak fx-tera-entry__streak--thin'),
    cx,
    cy * 0.8,
    W * 5,
    H * 0.05
  );
  const slabGlow = layer('fx-tera-entry__slab-glow');
  const slab = layer('fx-tera-entry__slab', TERA_FACETS_SVG);
  const fill = layer('fx-tera-entry__fill');
  slab.appendChild(fill);
  const jewel = placeCentered(
    layer('fx-tera-entry__jewel', teraJewelSvg()),
    cx,
    H * 0.2,
    W * 1.3
  );
  const jewelWhite = layer(
    'fx-tera-entry__jewel-white',
    teraJewelSvg({ fill: '#fff', edge: '#fff' })
  );
  jewel.appendChild(jewelWhite);
  const flash = layer('fx-tera-entry__flash');
  const whiteout = layer('fx-tera-entry__whiteout');
  const dust = layer('fx-tera-entry__particles');
  const glitter = layer('fx-tera-entry__particles');
  const glints = layer('fx-tera-entry__particles');
  host.append(
    smoke,
    rays,
    ringA,
    ringB,
    streakA,
    streakB,
    slabGlow,
    slab,
    jewel,
    flash,
    whiteout,
    dust,
    glitter,
    glints
  );

  const streakFrames = sampleKeyframes(
    teraStreakPose,
    (p) => ({ transform: `scaleX(${p.scaleX})`, opacity: p.opacity }),
    20
  );
  const done = [
    animateFrames(flash, opacityFrames(teraFlashPose), {
      duration: TERA_ENTRY_MS,
    }),
    animateFrames(slab, scaleFrames(teraSlabPose, 40), {
      duration: TERA_ENTRY_MS,
    }),
    animateFrames(
      slabGlow,
      sampleKeyframes(
        teraSlabPose,
        (p) => ({
          transform: `scale(${p.scale})`,
          opacity: p.opacity * p.glow,
        }),
        40
      ),
      { duration: TERA_ENTRY_MS }
    ),
    animateFrames(
      fill,
      sampleKeyframes(
        teraFillPose,
        (p) => ({ transform: `scaleY(${p.scaleY})`, opacity: p.opacity }),
        32
      ),
      { duration: TERA_ENTRY_MS }
    ),
    animateFrames(streakA, streakFrames, { duration: TERA_ENTRY_MS }),
    animateFrames(streakB, streakFrames, {
      duration: TERA_ENTRY_MS,
      delay: at(0.03),
    }),
    animateFrames(jewel, scaleFrames(teraJewelPose, 40), {
      duration: TERA_ENTRY_MS,
    }),
    animateFrames(
      jewelWhite,
      sampleKeyframes(teraJewelPose, (p) => ({ opacity: p.white }), 24),
      { duration: TERA_ENTRY_MS }
    ),
    animateFrames(ringA, spinFrames(teraRingPose), { duration: TERA_ENTRY_MS }),
    animateFrames(
      ringB,
      sampleKeyframes(
        teraRingPose,
        (p) => ({
          transform: `rotate(${-0.7 * p.rotate}deg) scale(${p.scale})`,
          opacity: p.opacity * 0.7,
        }),
        24
      ),
      { duration: TERA_ENTRY_MS }
    ),
    animateFrames(whiteout, scaleFrames(teraWhiteoutPose, 32), {
      duration: TERA_ENTRY_MS,
    }),
    animateFrames(rays, spinFrames(teraRaysPose), { duration: TERA_ENTRY_MS }),
    animateFrames(smoke, spinFrames(teraSmokePose), {
      duration: TERA_ENTRY_MS,
    }),
  ];

  const rising = burstParticles({
    count: 16,
    distance: H * 0.8,
    direction: -90,
    spread: 160,
    size: [W * 0.03, W * 0.07],
    gravity: -H * 0.2,
    maxDelay: 0.5,
    seed: randomSeed(),
  });
  done.push(
    ...spawnParticles(dust, rising, {
      className: 'fx-particle--mote',
      color: rgbCss([200, 255, 235]),
      duration: at(0.4),
      delay: at(0.14),
    })
  );
  for (const colour of TERA_GLITTER_COLOURS) {
    const sparks = burstParticles({
      count: 16,
      distance: W * 1.5,
      size: [W * 0.03, W * 0.065],
      gravity: H * 0.25,
      maxDelay: 0.12,
      orient: false,
      seed: randomSeed(),
    });
    done.push(
      ...spawnParticles(glitter, sparks, {
        className: 'fx-particle fx-tera-entry__glitter',
        color: colour,
        duration: at(0.34),
        delay: at(TERA_BURST_AT - 0.01),
      })
    );
  }
  TERA_GLINT_SPOTS.forEach(([fx, fy, lag]) => {
    const glint = placeCentered(
      layer('fx-tera-entry__glint'),
      W * fx,
      H * fy,
      W * 0.28
    );
    glints.appendChild(glint);
    done.push(
      animateFrames(glint, twinkleFrames, {
        duration: at(0.16),
        delay: at(TERA_GLINT_AT + lag * 0.5),
        easing: 'ease-out',
      })
    );
  });
  removeWhen(host, done, TERA_ENTRY_MS + BACKSTOP_PAD_MS);
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

// Brush strokes of the vortex: [colour, phase°, orbit radius ×H, length ×H,
// orbit tilt°, spin, launch lag]. Mixed radii and tilts read as a 3D swirl.
const MEGA_SLASHES = [
  ['blue', 0, 1.25, 1.3, -6, 1, 0],
  ['orange', 40, 1.55, 1.1, 10, 1, 0.01],
  ['blue', 85, 1.0, 0.9, 4, 1, 0.02],
  ['orange', 130, 1.35, 1.4, -12, 1, 0],
  ['blue', 175, 1.7, 1.2, 8, 1, 0.015],
  ['orange', 220, 1.1, 1.0, -4, 1, 0.025],
  ['blue', 265, 1.45, 1.5, 14, 1, 0.005],
  ['orange', 310, 1.8, 1.0, -10, 1, 0.02],
  ['blue', 20, 2.05, 0.8, 22, -1, 0.03],
  ['orange', 150, 0.85, 0.7, -24, -1, 0.035],
  ['blue', 200, 2.2, 1.1, -18, -1, 0.04],
  ['orange', 330, 0.95, 0.8, 30, -1, 0.03],
];
const MEGA_ORBIT_SQUASH = 0.5;

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

const MEGA_ORB_STAGE = 7;
const MEGA_ORB_RADIUS = 0.72;

/**
 * The keystone orb on a canvas (mega-orb.mjs), inserted under the vortex.
 * Its clock is the canvas's own WAAPI animation, read on every frame, so the
 * orb stays in step with the other layers and stops with them.
 */
function playMegaOrb(host, cx, cy, H) {
  const size = H * MEGA_ORB_STAGE;
  const canvas = placeCentered(document.createElement('canvas'), cx, cy, size);
  canvas.className = 'fx-mega-entry__orb';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  host.insertBefore(canvas, host.querySelector('.fx-mega-entry__vortex'));
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.animate !== 'function') return Promise.resolve();
  const shell = buildMegaShell(randomSeed());
  const clock = canvas.animate([{ opacity: 1 }, { opacity: 1 }], {
    duration: MEGA_ENTRY_MS,
    fill: 'both',
  });
  const frame = () => {
    if (!canvas.isConnected) return;
    const elapsed = Number(clock.currentTime) || 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawMegaOrb(
      ctx,
      megaOrbPose(elapsed / MEGA_ENTRY_MS, MEGA_BURST_AT),
      shell,
      {
        cx: size / 2,
        cy: size / 2,
        unit: H * MEGA_ORB_RADIUS,
        time: elapsed / 1000,
      }
    );
    if (clock.playState !== 'finished') requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return clock.finished.then(
    () => undefined,
    () => undefined
  );
}

/** The card-local part: white-hot card, keystone orb, burst and slash vortex. */
function playMegaCard(rect, run) {
  const W = rect.width;
  const H = rect.height;
  const cx = W / 2;
  const cy = H / 2;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-mega-entry' });
  const silhouette = layer('fx-mega-entry__silhouette');
  const flash = placeCentered(layer('fx-mega-entry__flash'), cx, cy, H * 3);
  const vortex = layer('fx-mega-entry__vortex');
  const burst = layer('fx-mega-entry__burst');
  const embers = placeCentered(
    layer('fx-mega-entry__burst'),
    cx,
    cy - H * 0.4,
    W * 2.6,
    H
  );
  host.append(silhouette, vortex, flash, burst, embers);

  const done = [
    run(silhouette, scaleFrames(megaSilhouettePose)),
    playMegaOrb(host, cx, cy, H),
    run(flash, scaleFrames(megaFlashPose, 32)),
  ];

  for (const [colour, phase, orbit, length, tilt, spin, lag] of MEGA_SLASHES) {
    const len = H * length * 1.5;
    const slash = placeCentered(
      layer(
        `fx-mega-entry__slash fx-mega-entry__slash--${colour}`,
        megaSlashSvg(colour)
      ),
      cx,
      cy,
      len * 0.3,
      len
    );
    vortex.appendChild(slash);
    const frames = sampleKeyframes(
      (t) => megaSlashPose(t, { phase, spin, lag }),
      (p) => ({
        transform: `rotate(${tilt}deg) scaleY(${MEGA_ORBIT_SQUASH}) rotate(${p.rotate}deg) translateX(${p.radius * orbit * H * 1.2}px) scale(${p.scale}, ${p.scale * spin})`,
        opacity: p.opacity,
      }),
      60
    );
    done.push(run(slash, frames));
  }

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

/** Play the signature entry for `kind` over the card at `rect`. Returns false for other kinds. */
export function playSignatureEntry(kind, rect) {
  if (!rect) return false;
  if (kind === 'tera') {
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
  playSignatureEntry(kind, rectForInstance(plan.instanceId, registry));
};
