// The idle loop a Pokémon wears while it holds a special condition: TCG Live's
// `Status_<X>` idle prefabs (Small size; vfx_dump status-vfx-spec.md) as parts
// on an overlay beside the card in its zone, reconciled from the view by
// apply-view.js like the condition markers. Pure: which conditions show, where
// the box goes, and each part's layout and timing as CSS text. The DOM twin is
// status-loop.js; textures, paint and keyframes are in status-marker.css.
//
// A Unity emitter becomes a fixed number of parts, each replaying one particle
// on a cycle: `period` is the time between its particles, `life` how long each
// shows, `delay` the emitter's startDelay plus its stagger.
import { listConditions } from '../../../../../shared/engine/rules/special-conditions.mjs';
import { STATUS_CONDITION_KEYS } from './sfx-cues.mjs';
import { CARD_ASPECT, TINT_GAIN_BRIGHT, unitsToCard, unityPosToCard, unityRgb } from './status-units.mjs';

/** The card <img> property holding its loop overlay (beside the marker slots). */
export const STATUS_LOOP_SLOT = 'statusLoop';

/**
 * Visible windows the stylesheet has keyframes for (`status-fx-life-<k>`): a
 * particle shows for 1/k of its cycle. CSS keyframe offsets cannot be variables,
 * so a part's life is snapped to the nearest period / k.
 */
export const LOOP_WINDOWS = Object.freeze([1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 40]);

/** The window k whose period / k is nearest `lifeMs`. */
export function loopWindowFor(lifeMs, periodMs) {
  const wanted = periodMs / Math.max(1, lifeMs);
  return LOOP_WINDOWS.reduce((best, k) => (Math.abs(k - wanted) < Math.abs(best - wanted) ? k : best));
}

/** Sheet grids, for the flipbook runs (cols x rows; a run uses the top-left block). */
const SHEETS = {
  glob: [4, 4], glob2: [4, 4], mainFire: [3, 3], fireSet: [4, 4], lick: [6, 2],
  cloud: [2, 2], dramaCloud: [2, 2], z: [2, 2], zap: [2, 2], collapse: [4, 4],
  sparkle: [2, 2], ring: [2, 2], pop: [2, 2],
};

/**
 * One part from Unity numbers (see status-fx.mjs `unityLayer` for the units):
 * `run` = [cols used, rows used] of a flipbook played every `life`; `cell` = a
 * still cell; `fade` = shows on a window of its cycle (else always on);
 * `rise` = drift [dx, dy] units over the life, +dy up the screen (`riseUp: 1`
 * flips it, for Sleep's upside-down velocities); `grow` = scale [from, to];
 * `rock` = degrees of a back-and-forth tilt; `turn` = a fixed tilt; `rim` = an
 * edge glow with the card cut out; `gain` = the material's tint gain.
 * `layer` 'sky' parts stay screen-upright.
 */
export function loopPart(spec) {
  const scale = spec.scale ?? 1;
  const up = spec.up ?? 1;
  const [sizeX, sizeY] = Array.isArray(spec.size) ? spec.size : [spec.size, spec.size];
  const { x, y } = unityPosToCard(spec.pos ?? [0, 0], scale);
  const [dx, dy] = spec.rise ?? [0, 0];
  const part = {
    sprite: spec.sprite,
    layer: spec.layer ?? 'sky',
    x,
    y: y * up,
    w: unitsToCard(sizeX, scale),
    h: unitsToCard(sizeY, scale),
    tint: spec.tint ? unityRgb(spec.tint, spec.gain) : undefined,
    peak: spec.peak ?? 1,
    period: spec.period,
    life: spec.life ?? spec.period,
    delay: spec.delay ?? 0,
    fade: Boolean(spec.fade),
    run: spec.run,
    cell: spec.cell,
    dx: unitsToCard(dx, scale),
    dy: unitsToCard(dy, scale) * (spec.riseUp ?? -1),
    grow: spec.grow,
    rock: spec.rock,
    turn: spec.turn,
  };
  if (spec.rim) part.cut = [100 / part.w, (100 * CARD_ASPECT) / part.h];
  return part;
}

const round = (v) => Math.round(v * 1000) / 1000;

/**
 * CSS text for a part (`part`) and its sheet (`sheet`). Positions are shares of
 * the box (a card's half-width is 50% of it, half-height 50% of it), so on a
 * sideways card a corner part still lands on the corner; sizes are `em` (the
 * overlay's font-size is the card width).
 */
export function loopPartStyle(part) {
  const p = [
    `left: calc(${round(50 + part.x * 100)}% - ${round(part.w / 2)}em)`,
    `top: calc(${round(50 + (part.y / CARD_ASPECT) * 100)}% - ${round(part.h / 2)}em)`,
    `width: ${round(part.w)}em`,
    `height: ${round(part.h)}em`,
    `--peak: ${part.peak}`,
  ];
  if (part.tint) p.push(`--fx-tint: ${part.tint}`);
  if (part.cut) p.push(`--fx-cut: ${round(part.cut[0])}% ${round(part.cut[1])}%`);
  if (part.turn) p.push(`--turn: ${part.turn}deg`);
  const animations = [];
  if (part.fade) {
    const k = loopWindowFor(part.life, part.period);
    p.push(`--dx: ${round(part.dx)}em`, `--dy: ${round(part.dy)}em`);
    if (part.grow) p.push(`--s0: ${part.grow[0]}`, `--s1: ${part.grow[1]}`);
    animations.push(`status-fx-life-${k} ${part.period}ms linear ${part.delay}ms infinite backwards`);
  } else {
    p.push('--rest: var(--peak)');
  }
  if (part.rock) {
    p.push(`--rock: ${part.rock}deg`);
    animations.push(`status-fx-rock ${part.life}ms ease-in-out ${part.delay}ms infinite`);
  }
  if (animations.length) p.push(`animation: ${animations.join(', ')}`);

  const [cols, rows] = SHEETS[part.sprite] ?? [1, 1];
  const s = [`width: ${cols * 100}%`, `height: ${rows * 100}%`];
  if (part.run) {
    const [usedCols, usedRows] = part.run;
    const stepLife = part.fade ? part.period / loopWindowFor(part.life, part.period) : part.life;
    s.push(`--x-end: ${round((-100 * usedCols) / cols)}%`, `--y-end: ${round((-100 * usedRows) / rows)}%`);
    const steps = [`status-fx-step-x ${round(stepLife / usedRows)}ms steps(${usedCols}) ${part.delay}ms infinite`];
    if (usedRows > 1) steps.push(`status-fx-step-y ${round(stepLife)}ms steps(${usedRows}) ${part.delay}ms infinite`);
    s.push(`animation: ${steps.join(', ')}`);
  } else if (part.cell != null) {
    s.push(`translate: ${round((-100 * (part.cell % cols)) / cols)}% ${round((-100 * Math.floor(part.cell / cols)) / rows)}%`);
  }
  return { part: p.join('; '), sheet: s.join('; ') };
}

// Poison (Poison_Small_Loop, container 0.676): globs swelling and bursting
// across the card (Bubbles_Lopsided + Bubbles, ~1 a second), small solid
// bubbles that never burst (Bubbles_Solid, frames 0-3), two purple smoke wisps.
const POISON = { scale: 0.676 };
const POISON_PARTS = [
  ...[
    ['wisp', [-1.84, 0.52], 5000, 'card'],
    ['wisp', [2.23, 0.52], 4500, 'card'],
  ].map(([sprite, pos, period, layer]) =>
    loopPart({ ...POISON, sprite, layer, size: 10, pos, period, fade: true, peak: 0.765, tint: [0.557, 0.045, 0.549] })
  ),
  ...[
    ['glob', 3.5, [-3.2, 0.6], 1000, [0.423, 0.193, 0.481]],
    ['glob2', 2.8, [2.8, -3.3], 2000, [0.323, 0, 0.518]],
    ['glob', 3.2, [0.6, 2.4], 3000, [0.423, 0.193, 0.481]],
    ['glob2', 2.4, [-1.6, -4.1], 4000, [0.323, 0, 0.518]],
  ].map(([sprite, size, pos, delay, tint]) =>
    loopPart({ ...POISON, sprite, size, pos, period: 4000, life: 1333, delay, fade: true, run: [4, 4], grow: [0.294, 1], tint })
  ),
  ...[
    [2.5, [2.2, 1.7], 1000],
    [1.6, [-2.8, -1.9], 2000],
  ].map(([size, pos, delay]) =>
    loopPart({ ...POISON, sprite: 'glob2', size, pos, period: 2000, life: 1000, delay, fade: true, run: [4, 1], grow: [0.294, 1], tint: [0.481, 0, 0.774] })
  ),
];

// Burned (Burn_Small_Loop, container 0.78): layered flames at the bottom
// corners (pink, orange, white core), a big layered flame at the top-left,
// FireSet flames up the sides, flame licks, and the pulsing warm glow.
const BURN = { scale: 0.78 };
const flameStack = (pos, delay, layers) =>
  layers.map(([size, tint, lift = 0]) =>
    loopPart({ ...BURN, sprite: 'mainFire', size, pos: [pos[0], pos[1] + lift], period: 600, delay, run: [3, 3], tint, gain: TINT_GAIN_BRIGHT })
  );
const PINK = [1, 0.278, 0.692];
const BURN_PARTS = [
  loopPart({ ...BURN, sprite: 'burnGlow', layer: 'card', size: [15.2 * 1.4, 15.2], pos: [0, -0.077], period: 3000, delay: 1500, fade: true, peak: 0.675, tint: [0.887, 0.599, 0], rim: true }),
  ...[
    [4.56, [2.86, -2.78]],
    [3.33, [-3.81, -2.3]],
  ].map(([size, pos]) =>
    loopPart({ ...BURN, sprite: 'fireSet', size, pos, period: 650, delay: 350, run: [4, 1], tint: [0.623, 0.454, 0.138], gain: TINT_GAIN_BRIGHT })
  ),
  ...flameStack([3.93, -5.17], 350, [[2.97, PINK], [2.79, [1, 0.731, 0]], [2.19, [1, 1, 1], 0.22]]),
  ...flameStack([-3.84, -5.01], 450, [[2.97, PINK], [2.79, [1, 0.731, 0]], [2.19, [1, 1, 1], 0.22]]),
  ...flameStack([-3.13, 4.88], 350, [[5.31, PINK], [4.93, [1, 0.802, 0.175]], [4.79, [0.838, 1, 0.278], 0.03]]),
  ...[
    [1.5, [4.42, 4.213], 2000, 700, [1, 0.974, 0.854]],
    [1.5, [-4.41, 4.153], 3450, 800, [1, 1, 1]],
    [1, [4.42, -1.827], 3250, 700, [1, 0.94, 0.816]],
  ].map(([size, pos, period, life, tint]) =>
    loopPart({ ...BURN, sprite: 'lick', size, pos, period, life, fade: true, run: [6, 2], tint })
  ),
];

// Asleep (Status_Sleep, authored upside down: up = -1): the pulsing glow
// behind the card, clouds at the bottom corners and sides, a big cloud over
// the upper half, bursts of three Zs every 4 s and small Zs drifting up.
const SLEEP = { up: -1 };
const FOG = { gain: TINT_GAIN_BRIGHT };
const SLEEP_PARTS = [
  loopPart({ ...SLEEP, sprite: 'sleepGlow', layer: 'card', size: 15, period: 8000, fade: true, tint: [0.461, 0.475, 0.585], rim: true }),
  loopPart({ ...SLEEP, ...FOG, sprite: 'cloud', cell: 1, size: 9.66, pos: [-0.01, -3.42], period: 8000, life: 4000, delay: 2000, fade: true, peak: 0.85, tint: [0.575, 0.564, 0.802], rise: [0.8, 0.8], riseUp: 1 }),
  ...[
    [[-2.37, -0.37], -1.2, 0],
    [[2.34, 0.07], 1.2, 3],
  ].map(([pos, dx, cell]) =>
    loopPart({ ...SLEEP, ...FOG, sprite: 'cloud', cell, size: 3, pos, period: 8000, life: 4000, delay: 2000, fade: true, peak: 0.52, tint: [0.649, 0.826, 0.962], rise: [dx, 0] })
  ),
  ...[
    [[3.29, 4.44], 1, 5.35, 2500, 3300, [0.746, 0.812, 0.925], 1.2],
    [[-3.29, 4.44], 2, 5.35, 2500, 3300, [0.746, 0.812, 0.925], -1.2],
    [[2.08, 4.86], 0, 1.95, 2800, 2750, [0.865, 0.844, 1], 0.6],
    [[-2.08, 4.86], 3, 1.95, 2800, 2750, [0.865, 0.844, 1], -0.6],
  ].map(([pos, cell, size, delay, life, tint, dx]) =>
    loopPart({ ...SLEEP, ...FOG, sprite: 'dramaCloud', cell, size, pos, period: 8000, life, delay, fade: true, tint, rise: [dx, 0] })
  ),
  ...[
    [[-1.24, -3.45], 1500],
    [[-2.57, -1.66], 5500],
    [[2.54, -0.63], 9500],
  ].flatMap(([pos, delay]) =>
    [0, 1, 2].map((j) =>
      loopPart({ ...SLEEP, sprite: 'z', cell: j, size: 1.97, pos, period: 12000, life: 1200, delay: delay + j * 400, fade: true, grow: [0.588, 1], rise: [0.9, 5], tint: j % 2 ? [0.746, 0.812, 0.925] : [0.655, 0.859, 1] })
    )
  ),
  ...[
    [[-4, 2], 2100],
    [[4.3, -0.7], 3100],
    [[0.7, 5], 4100],
  ].map(([pos, delay], j) =>
    loopPart({ ...SLEEP, sprite: 'z', cell: 3 - j, size: 0.9, pos, period: 3000, life: 1500, delay, fade: true, grow: [0.588, 1], rise: [0.6, 3], tint: [0.799, 0.665, 1] })
  ),
];

// Paralyzed (Status_Paralyze loop, container 0.78, starts 0.6 s in): the warm
// card glow pulsing over 7 s; every 8 s the ABCD zap ring and, 0.66 s later,
// the collapsing bolt; yellow sparks flicking around the card (StunMote_Loop).
const PARALYZE = { scale: 0.78 };
const PARALYZE_PARTS = [
  loopPart({ ...PARALYZE, sprite: 'paralyzeGlow', layer: 'card', size: 17.7, period: 7000, delay: 600, fade: true, tint: [1, 0.922, 0.646], rim: true }),
  loopPart({ ...PARALYZE, sprite: 'zap', layer: 'card', size: 17.05, period: 8000, life: 450, delay: 1600, fade: true, run: [2, 2] }),
  loopPart({ ...PARALYZE, sprite: 'collapse', layer: 'card', size: 13.01, pos: [0.66, 0], period: 8000, life: 200, delay: 2260, fade: true, run: [4, 2], tint: [1, 0.952, 0.439] }),
  ...[
    [[3.8, -4.6], 0],
    [[-4.2, -1.7], 375],
    [[4.2, 2.5], 750],
    [[-3, 5.1], 1125],
  ].map(([pos, stagger], j) =>
    loopPart({ ...PARALYZE, sprite: 'sparkle', cell: j, size: 2.2, pos, period: 1500, life: 500, delay: 1500 + stagger, fade: true, grow: [0.5, 1], tint: [0.931, 1, 0] })
  ),
];

// Confused (Confusion_Small_Loop, container 0.78): two dizzy rings around the
// card cycling and rocking 15deg (one turned 270deg), gold stars on a ring
// around it, and small pops.
const CONFUSION = { scale: 0.78 };
const CONFUSION_PARTS = [
  ...[
    [850, 270, [0.839, 0.98, 0.954]],
    [1000, 0, [0.98, 0.852, 0.541]],
  ].map(([life, turn, tint]) =>
    loopPart({ ...CONFUSION, sprite: 'ring', layer: 'card', size: 18, period: life, delay: 350, run: [2, 2], rock: 15, turn, peak: 0.35, tint, gain: TINT_GAIN_BRIGHT })
  ),
  ...[
    [[5.9, -1.6], 350],
    [[-5.5, 2.5], 850],
    [[0.8, 6.1], 1350],
  ].map(([pos, delay], j) =>
    loopPart({ ...CONFUSION, sprite: 'sparkle', cell: j, size: 1.3, pos, period: 1500, delay, fade: true, grow: [0.509, 1], rise: [0.3, 0.5], tint: [0.914, 0.879, 0.478] })
  ),
  ...[
    [[-5.1, 3.8], 550, [0.854, 0.991, 1]],
    [[4.7, -4.2], 1200, [1, 0.863, 0.978]],
  ].map(([pos, delay, tint]) =>
    loopPart({ ...CONFUSION, sprite: 'pop', size: 2.8, pos, period: 1300, life: 650, delay, fade: true, run: [2, 2], grow: [0.509, 1], tint, gain: TINT_GAIN_BRIGHT })
  ),
];

export const STATUS_LOOP_PARTS = Object.freeze({
  poison: POISON_PARTS,
  burn: BURN_PARTS,
  sleep: SLEEP_PARTS,
  paralyze: PARALYZE_PARTS,
  confusion: CONFUSION_PARTS,
});

/** Loop keys for the conditions a card holds, in Checkup order (Poison, Burn, rotation). */
export const statusLoopKeys = (card) =>
  listConditions(card)
    .map((condition) => STATUS_CONDITION_KEYS[condition])
    .filter(Boolean);

/**
 * Where the loop overlay goes in its zone. `rect` is the card's measured
 * (rotated) bounding box and `zoneRect` the zone's; the box is the card's
 * footprint, and the card itself is the footprint with its sides swapped back
 * when it lies on a quarter turn.
 *
 * @returns {{left:number, top:number, width:number, height:number,
 *            cardWidth:number, cardHeight:number, rotation:number}|null}
 *   null when the card has no measurable size.
 */
export function statusLoopBox({ rect, zoneRect, rotation }) {
  if (!(rect?.width > 0) || !(rect?.height > 0)) return null;
  const degrees = Number(rotation) || 0;
  const sideways = Math.abs(Math.round(degrees / 90)) % 2 === 1;
  return {
    left: rect.left - (zoneRect?.left ?? 0),
    top: rect.top - (zoneRect?.top ?? 0),
    width: rect.width,
    height: rect.height,
    cardWidth: sideways ? rect.height : rect.width,
    cardHeight: sideways ? rect.width : rect.height,
    rotation: degrees,
  };
}
