// Design 027: signature entry animations. A Tera Pokémon is sealed in a crystal
// of its type colour that shatters to reveal it; a Mega Pokémon appears inside
// a keystone sphere ringed by blue and orange swooshes. Played by `evolve`
// (lifecycle.js) and by `enter` (a Pokémon put into play from hand, deck or
// discard). Detached, self-removing overlays; no-op when the card is unknown.
import { getCardRegistry } from '../apply-view.js';
import {
  animateFrames,
  rectForInstance,
  removeWhen,
  sampleKeyframes,
  spawnOverlay,
  spawnParticles,
} from '../../image-logic/mat-fx.mjs';
import { signatureEntryKind } from './entry-kind.mjs';
import {
  MEGA_ENTRY_MS,
  TERA_ENTRY_MS,
  TERA_GLINT_AT,
  TERA_SHATTER_AT,
  megaFlashPose,
  megaHexPose,
  megaSpherePose,
  megaSwirlPose,
  teraArcPose,
  teraCrownPose,
  teraFlashPose,
  teraRaysPose,
  teraSlabPose,
  teraSmokePose,
  teraWhiteoutPose,
} from './entry-pose.mjs';
import { brighten, fxRgbForCard, rgbCss } from './fx-colors.mjs';
import { burstParticles } from './particles.mjs';

const BACKSTOP_PAD_MS = 400;
const MEGA_EMBER_RGB = [255, 150, 60];

const layer = (className) => {
  const el = document.createElement('div');
  el.className = className;
  return el;
};

const randomSeed = () => Math.floor(Math.random() * 1e6);

const scaleFrames = (pose, samples = 24) =>
  sampleKeyframes(
    pose,
    (p) => ({ transform: `scale(${p.scale})`, opacity: p.opacity }),
    samples
  );

const opacityFrames = (pose, samples = 16) =>
  sampleKeyframes(pose, (p) => ({ opacity: p.opacity }), samples);

// Tera-jewel facets drawn over the crystal slab (static markup, no card data).
const TERA_FACETS_SVG = `<svg viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
  <polygon points="0,0 100,0 100,30 72,48 50,30 28,48 0,30" fill="rgba(255,255,255,0.2)"/>
  <polygon points="100,30 100,110 72,86 72,48" fill="rgba(0,0,0,0.14)"/>
  <polygon points="0,30 28,48 28,86 0,110" fill="rgba(255,255,255,0.08)"/>
  <polygon points="0,110 28,86 50,104 72,86 100,110 100,140 0,140" fill="rgba(0,0,0,0.22)"/>
  <polygon points="28,48 50,30 72,48 50,62" fill="rgba(255,255,255,0.5)"/>
  <polygon points="28,48 50,62 50,104 28,86" fill="rgba(255,255,255,0.22)"/>
  <polygon points="72,48 50,62 50,104 72,86" fill="rgba(255,255,255,0.06)"/>
  <g fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.2" vector-effect="non-scaling-stroke">
    <polygon points="50,30 72,48 72,86 50,104 28,86 28,48"/>
    <polyline points="28,48 50,62 72,48"/><line x1="50" y1="62" x2="50" y2="104"/>
    <line x1="50" y1="30" x2="50" y2="0"/><line x1="72" y1="48" x2="100" y2="30"/>
    <line x1="72" y1="86" x2="100" y2="110"/><line x1="50" y1="104" x2="50" y2="140"/>
    <line x1="28" y1="86" x2="0" y2="110"/><line x1="28" y1="48" x2="0" y2="30"/>
  </g>
</svg>`;

function playTeraEntry(rect, card) {
  const rgb = brighten(fxRgbForCard(card), 0.1);
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-tera-entry' });
  host.style.setProperty('--fx-tera-rgb', rgb.join(', '));

  const smoke = layer('fx-tera-entry__smoke');
  const arcs = layer('fx-tera-entry__arcs');
  const slab = layer('fx-tera-entry__slab');
  slab.innerHTML = TERA_FACETS_SVG;
  const slabGlow = layer('fx-tera-entry__slab-glow');
  const crown = layer('fx-tera-entry__crown');
  crown.appendChild(layer('fx-tera-entry__crown-gem'));
  const flash = layer('fx-tera-entry__flash');
  const whiteout = layer('fx-tera-entry__whiteout');
  const rays = layer('fx-tera-entry__rays');
  const sparkles = layer('fx-tera-entry__particles');
  const shards = layer('fx-tera-entry__particles');
  host.append(
    smoke,
    arcs,
    slabGlow,
    slab,
    crown,
    flash,
    sparkles,
    whiteout,
    rays,
    shards
  );

  const at = (fraction) => TERA_ENTRY_MS * fraction;
  const rising = burstParticles({
    count: 12,
    distance: rect.height * 0.75,
    direction: -90,
    spread: 70,
    size: [rect.width * 0.04, rect.width * 0.1],
    gravity: -rect.height * 0.15,
    maxDelay: 0.5,
    seed: randomSeed(),
  });
  const burst = burstParticles({
    count: 22,
    distance: rect.width * 1.15,
    size: [rect.width * 0.12, rect.width * 0.26],
    gravity: rect.height * 0.3,
    maxDelay: 0.05,
    seed: randomSeed(),
  });
  const glints = burstParticles({
    count: 5,
    distance: rect.width * 0.35,
    size: [rect.width * 0.12, rect.width * 0.2],
    maxDelay: 0.4,
    orient: false,
    seed: randomSeed(),
  });
  const shardColor = rgbCss(brighten(rgb, 0.3));

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
    animateFrames(crown, scaleFrames(teraCrownPose), {
      duration: TERA_ENTRY_MS,
    }),
    animateFrames(
      arcs,
      sampleKeyframes(
        teraArcPose,
        (p) => ({
          transform: `rotate(${p.rotate}deg) scale(${p.scale})`,
          opacity: p.opacity,
        }),
        24
      ),
      { duration: TERA_ENTRY_MS }
    ),
    animateFrames(whiteout, scaleFrames(teraWhiteoutPose, 32), {
      duration: TERA_ENTRY_MS,
    }),
    animateFrames(
      rays,
      sampleKeyframes(
        teraRaysPose,
        (p) => ({
          transform: `rotate(${p.rotate}deg) scale(${p.scale})`,
          opacity: p.opacity,
        }),
        24
      ),
      { duration: TERA_ENTRY_MS }
    ),
    animateFrames(smoke, scaleFrames(teraSmokePose), {
      duration: TERA_ENTRY_MS,
    }),
    ...spawnParticles(sparkles, rising, {
      className: 'fx-particle--mote',
      color: rgbCss(brighten(rgb, 0.5)),
      duration: at(0.4),
      delay: at(0.2),
    }),
    ...spawnParticles(shards, burst, {
      className: 'fx-particle--shard fx-tera-entry__shard',
      color: shardColor,
      duration: at(0.36),
      delay: at(TERA_SHATTER_AT),
    }),
    ...spawnParticles(shards, glints, {
      className: 'fx-particle fx-tera-entry__glint',
      color: '#fff',
      duration: at(0.18),
      delay: at(TERA_GLINT_AT),
    }),
  ];
  removeWhen(host, done, TERA_ENTRY_MS + BACKSTOP_PAD_MS);
}

// Six swooshes on tilted elliptical orbits: [colour, orbit phase, tilt, size].
const MEGA_SWOOSHES = [
  ['blue', 0, -18, 1.05],
  ['orange', 60, 24, 0.95],
  ['blue', 120, 62, 1.18],
  ['orange', 180, -48, 1.12],
  ['blue', 240, 8, 0.88],
  ['orange', 300, -75, 1.24],
];

function playMegaEntry(rect) {
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-mega-entry' });
  const diameter = Math.max(rect.width, rect.height) * 1.45;
  const centered = (el, size) => {
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${(rect.width - size) / 2}px`;
    el.style.top = `${(rect.height - size) / 2}px`;
  };

  const sphere = layer('fx-mega-entry__sphere');
  centered(sphere, diameter);
  const hex = layer('fx-mega-entry__hex');
  sphere.appendChild(hex);
  sphere.appendChild(layer('fx-mega-entry__rim'));
  const flash = layer('fx-mega-entry__flash');
  const embers = layer('fx-mega-entry__embers');
  host.append(sphere, flash, embers);

  const done = [
    animateFrames(sphere, scaleFrames(megaSpherePose, 32), {
      duration: MEGA_ENTRY_MS,
    }),
    animateFrames(
      hex,
      sampleKeyframes(
        megaHexPose,
        (p) => ({ transform: `rotate(${p.rotate}deg)`, opacity: p.opacity }),
        16
      ),
      { duration: MEGA_ENTRY_MS }
    ),
    animateFrames(flash, scaleFrames(megaFlashPose), {
      duration: MEGA_ENTRY_MS,
    }),
  ];

  for (const [colour, phase, tilt, size] of MEGA_SWOOSHES) {
    const swoosh = layer(
      `fx-mega-entry__swoosh fx-mega-entry__swoosh--${colour}`
    );
    centered(swoosh, diameter * size);
    host.appendChild(swoosh);
    const frames = sampleKeyframes(
      (t) => megaSwirlPose(t, { phase }),
      (p) => ({
        transform: `rotate(${tilt}deg) scaleY(0.55) rotate(${p.rotate}deg) scale(${p.scale})`,
        opacity: p.opacity,
      }),
      48
    );
    done.push(animateFrames(swoosh, frames, { duration: MEGA_ENTRY_MS }));
  }

  const rising = burstParticles({
    count: 18,
    distance: rect.height * 0.95,
    direction: -90,
    spread: 120,
    size: [rect.width * 0.04, rect.width * 0.09],
    gravity: -rect.height * 0.2,
    maxDelay: 0.5,
    seed: randomSeed(),
  });
  done.push(
    ...spawnParticles(embers, rising, {
      className: 'fx-particle--mote',
      color: rgbCss(MEGA_EMBER_RGB),
      duration: MEGA_ENTRY_MS * 0.6,
      delay: MEGA_ENTRY_MS * 0.1,
    })
  );
  removeWhen(host, done, MEGA_ENTRY_MS + BACKSTOP_PAD_MS);
}

/** Play the signature entry for `kind` over `rect`. Returns false for other kinds. */
export function playSignatureEntry(kind, rect, card) {
  if (!rect) return false;
  if (kind === 'tera') {
    playTeraEntry(rect, card);
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
  playSignatureEntry(kind, rectForInstance(plan.instanceId, registry), card);
};
