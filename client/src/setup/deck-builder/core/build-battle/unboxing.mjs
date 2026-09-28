// The Build & Battle unboxing scene as pure data (design 052 § Beats, § State machine, § Pure
// poses). No DOM: the builder tab's DOM twin samples these poses into WAAPI keyframes. The scene
// is cosmetic — it reads the pool `openBox` produced and never changes it.

import { createRng } from '../../../../../../shared/engine/rng.mjs';
import { resolveHoloEffect } from '../holo.mjs';
import { BOX_FACE_TEXTURES, packArtSrc } from './box-textures.mjs';
import { REVERSE_POOL } from './pack-models.mjs';

// ── Beats and timing ─────────────────────────────────────────────────────────
export const WRAP_TEAR_MS = 320;
export const LID_OPEN_MS = 520;
export const TRAY_RISE_MS = 380;
export const TRAY_STAGGER_MS = 70;
export const DECK_UNWRAP_MS = 300;
export const PROMO_LIFT_MS = 620;
export const PROMO_HOLD_MS = 900;
export const PACK_TEAR_MS = 260;
export const PACK_SPILL_MS = 340;
export const CARD_LIFT_MS = 220;
export const CARD_FLIP_MS = 320;
export const CARD_SETTLE_MS = 260;
export const REVEAL_STAGGER_MS = 90;
export const HIT_LIFT_MS = 520;
export const HIT_FLARE_MS = 700;
export const HIT_HOLD_MS = 600;
export const FAN_COLLAPSE_MS = 380;
export const SCENE_BACKSTOP_MS = 4000;

export const EASE_LIFT = 'cubic-bezier(.2,.8,.2,1)';
export const EASE_FLIP = 'cubic-bezier(.4,0,.2,1)';
export const EASE_LID = 'cubic-bezier(.3,1.2,.4,1)';

// Tray items: deck, packs 1–4, code card, tip sheet.
export const TRAY_ITEM_COUNT = 7;
export const TRAY_TOTAL_MS = TRAY_RISE_MS + (TRAY_ITEM_COUNT - 1) * TRAY_STAGGER_MS;

export const PACK_COUNT = 4;
export const CARDS_PER_PACK = 10;
export const PACK_TORN_AT = 0.4;
// A press that moves less than this is a click, and a click tears.
export const TAP_SLOP_PX = 6;

const clamp01 = (value) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const lerp = (from, to, t) => from + (to - from) * t;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
// Symmetric, so a flip passes 90° exactly at the middle of its window: the card face is swapped
// in at 50 % of CARD_FLIP_MS and is edge-on at that instant (design 052 row 14).
const easeInOutSine = (t) => (1 - Math.cos(Math.PI * t)) / 2;

/**
 * A CSS `cubic-bezier(x1, y1, x2, y2)` as a function of time, solved for x by bisection. Used to
 * fold an overshooting easing into a pose so the sampled keyframes play with `linear`.
 */
export function cubicBezier(x1, y1, x2, y2) {
  const at = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (t) => {
    const x = clamp01(t);
    if (x === 0 || x === 1) return x;
    let lo = 0;
    let hi = 1;
    let s = x;
    for (let step = 0; step < 40; step += 1) {
      s = (lo + hi) / 2;
      if (at(x1, x2, s) < x) lo = s;
      else hi = s;
    }
    return at(y1, y2, s);
  };
}

const easeLid = cubicBezier(0.3, 1.2, 0.4, 1);
const easeLift = cubicBezier(0.2, 0.8, 0.2, 1);

// ── State machine ────────────────────────────────────────────────────────────
export const UNBOXING_STAGES = ['sealed', 'opened', 'deckShown', 'packs', 'done'];

/**
 * @typedef {{stage: 'sealed'|'opened'|'deckShown'|'packs'|'done', wrapTorn: boolean,
 *   packsTorn: boolean[], revealed: number[]}} Unboxing
 * `revealed[i]` counts the cards revealed in pack i (0..10). `wrapTorn` splits the sealed stage
 * into "shrink-wrap on" and "wrap off, lid still closed".
 */

/** @returns {Unboxing} a sealed box. */
export function createUnboxing() {
  return {
    stage: 'sealed',
    wrapTorn: false,
    packsTorn: Array(PACK_COUNT).fill(false),
    revealed: Array(PACK_COUNT).fill(0),
  };
}

/** @returns {Unboxing} every beat played: the state a skipped scene or an older session lands in. */
export function finishedUnboxing() {
  return {
    stage: 'done',
    wrapTorn: true,
    packsTorn: Array(PACK_COUNT).fill(true),
    revealed: Array(PACK_COUNT).fill(CARDS_PER_PACK),
  };
}

const isPackIndex = (index) =>
  Number.isInteger(index) && index >= 0 && index < PACK_COUNT;

const allRevealed = (revealed) => revealed.every((count) => count === CARDS_PER_PACK);

// A pack is mid-reveal while it is torn and still has face-down cards.
const hasPackMidReveal = (u) =>
  u.packsTorn.some((torn, index) => torn && u.revealed[index] < CARDS_PER_PACK);

/**
 * The pack the player may tear next, or -1: packs open one after the other, in order, and the
 * next one waits until every card of the last one is face up.
 */
export function nextPackToTear(u) {
  if (!u || (u.stage !== 'deckShown' && u.stage !== 'packs') || hasPackMidReveal(u)) return -1;
  return u.packsTorn.indexOf(false);
}

function withReveal(u, packIndex, count) {
  const revealed = u.revealed.map((value, index) => (index === packIndex ? count : value));
  return { ...u, revealed, stage: allRevealed(revealed) ? 'done' : u.stage };
}

/**
 * The scene's reducer. `event` is `{ type, packIndex? }` with type one of `tearWrap`, `openLid`,
 * `unwrapDeck`, `tearPack`, `revealCard`, `revealAll`, `finish`. An event the current state does
 * not allow returns `u` itself, so callers can test `next === u` to do nothing.
 *
 * `tearPack` takes only `nextPackToTear(u)`: packs open in order, one at a time.
 *
 * `finish` (Skip scene) is refused while a torn pack still has face-down cards: the player is
 * mid-pack, and "Reveal all" is the way through it.
 *
 * @returns {Unboxing}
 */
export function advanceUnboxing(u, event) {
  const type = event?.type;
  const packIndex = event?.packIndex;
  if (!u || u.stage === 'done') return u;
  switch (type) {
    case 'tearWrap':
      return u.stage === 'sealed' && !u.wrapTorn ? { ...u, wrapTorn: true } : u;
    case 'openLid':
      return u.stage === 'sealed' && u.wrapTorn ? { ...u, stage: 'opened' } : u;
    case 'unwrapDeck':
      return u.stage === 'opened' ? { ...u, stage: 'deckShown' } : u;
    case 'tearPack': {
      if (!isPackIndex(packIndex) || packIndex !== nextPackToTear(u)) return u;
      const packsTorn = u.packsTorn.map((torn, index) => torn || index === packIndex);
      return { ...u, stage: 'packs', packsTorn };
    }
    case 'revealCard':
    case 'revealAll': {
      if (u.stage !== 'packs' || !isPackIndex(packIndex)) return u;
      const count = u.revealed[packIndex];
      if (!u.packsTorn[packIndex] || count >= CARDS_PER_PACK) return u;
      return withReveal(u, packIndex, type === 'revealAll' ? CARDS_PER_PACK : count + 1);
    }
    case 'finish':
      return hasPackMidReveal(u) ? u : finishedUnboxing();
    default:
      return u;
  }
}

function isStageConsistent(u) {
  const anyTorn = u.packsTorn.some(Boolean);
  switch (u.stage) {
    case 'sealed':
    case 'opened':
      return (u.stage === 'sealed' || u.wrapTorn) && !anyTorn;
    case 'deckShown':
      return u.wrapTorn && !anyTorn;
    case 'packs':
      return u.wrapTorn && anyTorn && !allRevealed(u.revealed);
    case 'done':
      return u.wrapTorn && allRevealed(u.revealed);
    default:
      return false;
  }
}

/** @returns {Unboxing|null} a copy of a stored scene state, or null for anything inconsistent. */
export function parseUnboxing(value) {
  if (!value || typeof value !== 'object') return null;
  const { stage, wrapTorn, packsTorn, revealed } = value;
  if (!UNBOXING_STAGES.includes(stage) || typeof wrapTorn !== 'boolean') return null;
  if (!Array.isArray(packsTorn) || packsTorn.length !== PACK_COUNT) return null;
  if (!Array.isArray(revealed) || revealed.length !== PACK_COUNT) return null;
  if (!packsTorn.every((torn) => typeof torn === 'boolean')) return null;
  const countsValid = revealed.every(
    (count, index) =>
      Number.isInteger(count) &&
      count >= 0 &&
      count <= CARDS_PER_PACK &&
      (count === 0 || packsTorn[index])
  );
  if (!countsValid) return null;
  const u = { stage, wrapTorn, packsTorn: [...packsTorn], revealed: [...revealed] };
  return isStageConsistent(u) ? u : null;
}

/** @returns {number} how many packs are torn (design 051's `openedPacks`). */
export function tornPackCount(u) {
  return (u?.packsTorn || []).filter(Boolean).length;
}

// ── Pure poses (t ∈ [0, 1] across the beat) ──────────────────────────────────
const LID_OPEN_DEG = -112;
const LID_RAISE_PX = 4;

/** Hinged at the back edge; the overshoot easing is folded in. */
export function lidPose(t) {
  const eased = easeLid(clamp01(t));
  // `+ 0` turns the −0 of a closed lid into 0.
  return { rotateXDeg: LID_OPEN_DEG * eased + 0, translateYPx: -LID_RAISE_PX * eased + 0 };
}

// Clips the unit square (percent units) to the half-plane `value(point) >= cut`.
function clipSquare(value, cut) {
  const square = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const out = [];
  square.forEach((point, index) => {
    const next = square[(index + 1) % square.length];
    const a = value(point) - cut;
    const b = value(next) - cut;
    if (a >= 0) out.push(point);
    if (a >= 0 !== b >= 0) {
      const s = a / (a - b);
      out.push([lerp(point[0], next[0], s), lerp(point[1], next[1], s)]);
    }
  });
  return out;
}

const WRAP_POINTS = 5;
const pct = (value) => `${Number(value.toFixed(2))}%`;

/**
 * The shrink-wrap still on the box: a diagonal wipe from the top-right corner. Always five
 * points (the last repeated as needed) so neighbouring keyframes interpolate.
 */
export function wrapTearPose(t) {
  const cut = 200 * easeOutCubic(clamp01(t));
  const distanceFromTopRight = ([x, y]) => 100 - x + y;
  let points = clipSquare(distanceFromTopRight, cut);
  if (!points.length) points = [[0, 100]];
  while (points.length < WRAP_POINTS) points.push(points.at(-1));
  const list = points.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(', ');
  return { clipPath: `polygon(${list})` };
}

const TRAY_RISE_PX = 24;

/** Tray item `index` (0 deck, 1–4 packs, 5 code card, 6 tip sheet) rising into place. */
export function trayRisePose(t, index) {
  const elapsed = clamp01(t) * TRAY_TOTAL_MS - Math.max(0, index) * TRAY_STAGGER_MS;
  const local = easeLift(clamp01(elapsed / TRAY_RISE_MS));
  return { translateYPx: TRAY_RISE_PX * (1 - local), opacity: local };
}

const PROMO_LIFT_PX = 40;
const PROMO_SCALE = 1.1;

/** The promo lifts out of the deck window, tilts −8°/+6°, then settles flat (holo tilt takes over). */
export function promoLiftPose(t) {
  const x = clamp01(t);
  const lift = easeLift(Math.min(1, x / 0.5));
  const tilt = Math.sin(Math.PI * x);
  return {
    translateYPx: -PROMO_LIFT_PX * lift,
    rotateXDeg: -8 * tilt,
    rotateYDeg: 6 * tilt,
    scale: lerp(1, PROMO_SCALE, lift),
  };
}

/** @returns {number} how far a tear drag has gone, 0..1 of the pack's width. */
export function packTearProgress(dxPx, packWidthPx) {
  if (!(packWidthPx > 0) || !Number.isFinite(dxPx)) return 0;
  return clamp01(dxPx / packWidthPx);
}

/** @returns {boolean} whether a drag has gone far enough to tear. */
export function packTornAt(progress) {
  return Number.isFinite(progress) && progress >= PACK_TORN_AT;
}

/**
 * What a released press on the wrap or a pack top does: a press that barely moved is a click and
 * tears; a drag tears once it passed PACK_TORN_AT, else it springs back.
 *
 * @returns {'tear'|'spring'}
 */
export function tearReleaseOutcome({ dxPx, movedPx, widthPx }) {
  if (Number.isFinite(movedPx) && movedPx < TAP_SLOP_PX) return 'tear';
  return packTornAt(packTearProgress(dxPx, widthPx)) ? 'tear' : 'spring';
}

const SPILL_RISE = 0.55;
const SPILL_STACK_STEP_PX = 2;
const SPILL_MAX_FAN_DEG = 8;
const SPILL_CARD_DELAY = 0.03;

/**
 * Card `cardIndex` of ten rising out of the torn mouth by 55 % of the pack height, then settling
 * into a slightly offset stack beside the pack.
 */
export function packSpillPose(t, cardIndex, { packWidthPx = 100, packHeightPx = 180 } = {}) {
  const index = Math.min(CARDS_PER_PACK - 1, Math.max(0, cardIndex | 0));
  const x = clamp01(t);
  const delay = index * SPILL_CARD_DELAY;
  const rise = easeLift(clamp01((x - delay) / (0.5 - delay)));
  const settle = easeLift(clamp01((x - 0.5) / 0.5));
  const stackX = packWidthPx + 12 + index * SPILL_STACK_STEP_PX;
  const stackY = -index * SPILL_STACK_STEP_PX;
  const fan = (index / (CARDS_PER_PACK - 1)) * SPILL_MAX_FAN_DEG;
  return {
    translateXPx: lerp(0, stackX, settle),
    translateYPx: lerp(-SPILL_RISE * packHeightPx * rise, stackY, settle),
    rotateZDeg: lerp(0, fan, settle),
  };
}

/**
 * Where lift, flip and settle fall inside one card reveal, in ms. Tier ≥ 2 (a hit) lifts
 * slower and holds.
 */
export function cardRevealPhases(tier = 0) {
  const isHit = tier >= 2;
  const liftMs = isHit ? HIT_LIFT_MS : CARD_LIFT_MS;
  const settleMs = isHit ? HIT_HOLD_MS : CARD_SETTLE_MS;
  const totalMs = liftMs + CARD_FLIP_MS + settleMs;
  return {
    liftMs,
    flipMs: CARD_FLIP_MS,
    settleMs,
    totalMs,
    flipStart: liftMs / totalMs,
    flipMid: (liftMs + CARD_FLIP_MS / 2) / totalMs,
    flipEnd: (liftMs + CARD_FLIP_MS) / totalMs,
  };
}

const FLARE_PEAK = 0.55;
const FLARE_HALF_WIDTH = 0.3;

/** One face-down card lifting, flipping 0 → 180°, and settling; `flare` > 0 only on hits. */
export function cardRevealPose(t, { tier = 0 } = {}) {
  const x = clamp01(t);
  const { flipStart, flipEnd } = cardRevealPhases(tier);
  const liftPx = tier >= 1 ? 34 : 18;
  const lift = easeLift(clamp01(x / flipStart));
  const settle = easeLift(clamp01((x - flipEnd) / (1 - flipEnd)));
  const height = lift * (1 - settle);
  const flip = easeInOutSine(clamp01((x - flipStart) / (flipEnd - flipStart)));
  const flare =
    tier >= 2 ? Math.max(0, 1 - Math.abs(x - FLARE_PEAK) / FLARE_HALF_WIDTH) : 0;
  return {
    translateYPx: -liftPx * height,
    rotateYDeg: 180 * flip,
    scale: 1 + (tier >= 1 ? 0.1 : 0.06) * height,
    flare,
  };
}

// ── Pocket-style packs (fullscreen rework): fly-out, spread, swipe, hit flip ──────────────────
export const PACK_FLY_MS = 680;
export const PACK_FLY_STAGGER_MS = 120;
export const POCKET_CUT_MS = 420;
export const SWIPE_AWAY_MS = 300;
export const HIT_FLIP_MS = 640;
export const SUMMARY_STAGGER_MS = 45;
// A card dragged this share of its width is swiped away; less springs back.
export const SWIPE_AT = 0.28;

const SPREAD_SIDE_SCALE = 0.62;
const SPREAD_SIDE_BRIGHTNESS = 0.55;
const FLY_ARC_PX = 90;
const FLY_SPIN_DEG = -24;
const SWIPE_LIFT_PX = 30;
const SWIPE_TILT_DEG = 20;
const HIT_FLIP_POP = 0.14;

/**
 * Pack `index` in the fullscreen spread with pack `focus` (`spacingPx` wide) centred at full
 * size: packs after it queue to the right, smaller and darker, clear of each other.
 */
export function packSpreadSlot(index, focus, spacingPx) {
  const offset = index - focus;
  if (!Number.isFinite(offset) || offset === 0 || !Number.isFinite(spacingPx)) {
    return { xPx: 0, scale: 1, brightness: 1, zIndex: 10 };
  }
  const distance = Math.abs(offset);
  const sideStep = spacingPx * (SPREAD_SIDE_SCALE + 0.06);
  const xPx = Math.sign(offset) * ((spacingPx + spacingPx * SPREAD_SIDE_SCALE) / 2 + 12 + sideStep * (distance - 1));
  return { xPx, scale: SPREAD_SIDE_SCALE, brightness: SPREAD_SIDE_BRIGHTNESS, zIndex: 10 - distance };
}

/**
 * A pack flying out of the box into its spread slot: it starts `dxPx, dyPx` away (the box
 * mouth, in the slot's own pixels) at `fromScale`, arcs up, spins level and lands at rest.
 */
export function packFlyPose(t, { dxPx = 0, dyPx = 0, fromScale = 0.3 } = {}) {
  const x = easeLift(clamp01(t));
  const arc = Math.sin(Math.PI * clamp01(t)) * FLY_ARC_PX;
  return {
    translateXPx: lerp(dxPx, 0, x),
    translateYPx: lerp(dyPx, 0, x) - arc,
    rotateZDeg: lerp(FLY_SPIN_DEG, 0, x),
    scale: lerp(fromScale, 1, x),
  };
}

/** A released drag on the top card: swipe it away, treat it as a tap, or spring back. */
export function swipeOutcome({ dxPx, movedPx, widthPx }) {
  if (Number.isFinite(movedPx) && movedPx < TAP_SLOP_PX) return 'tap';
  if (!(widthPx > 0) || !Number.isFinite(dxPx)) return 'spring';
  return Math.abs(dxPx) >= SWIPE_AT * widthPx ? 'swipe' : 'spring';
}

/** The top card leaving the stack toward `direction` (±1), from `fromPx` across `distancePx`. */
export function swipeAwayPose(t, { direction = 1, fromPx = 0, distancePx = 400 } = {}) {
  const x = clamp01(t);
  const side = direction < 0 ? -1 : 1;
  return {
    translateXPx: lerp(fromPx, side * distancePx, x * x),
    translateYPx: -SWIPE_LIFT_PX * x,
    rotateZDeg: side * SWIPE_TILT_DEG * x,
    opacity: 1 - clamp01((x - 0.6) / 0.4),
  };
}

/**
 * A face-down hit turning over in place: 180° (back to the camera) → 0°, crossing 90° exactly at
 * the middle, with a pop in scale and, for tier ≥ 2, the flare bell of `cardRevealPose`.
 */
export function hitFlipPose(t, { tier = 2 } = {}) {
  const x = clamp01(t);
  const flip = easeInOutSine(x);
  const flare = tier >= 2 ? Math.max(0, 1 - Math.abs(x - FLARE_PEAK) / FLARE_HALF_WIDTH) : 0;
  return {
    rotateYDeg: 180 * (1 - flip),
    scale: 1 + HIT_FLIP_POP * Math.sin(Math.PI * x),
    flare,
  };
}

const FAN_MAX_DEG = 8;

/** Revealed card `index` of `count` fanned across `widthPx`, centred. */
export function fanSlot(index, count, widthPx) {
  if (!(count > 1) || !Number.isFinite(widthPx) || !Number.isFinite(index)) {
    return { xPx: 0, rotateZDeg: 0 };
  }
  const offset = index - (count - 1) / 2;
  return {
    xPx: offset * (widthPx / count),
    rotateZDeg: offset * ((2 * FAN_MAX_DEG) / (count - 1)),
  };
}

// ── Slots, tiers, foil ───────────────────────────────────────────────────────
/**
 * Whether card `index` of a pack came from a reverse-holo draw. A slot that also names hit classes
 * (the IR/SIR, Trainer Gallery or ACE SPEC slot) is a reverse draw unless the card is one of them.
 *
 * @param {object|null} packModel from `resolvePackModel`
 * @returns {'normal'|'reverse'}
 */
export function packSlotKind(packModel, index, card) {
  let start = 0;
  for (const slot of packModel?.slots || []) {
    const end = start + (slot.count || 0);
    if (index >= start && index < end) {
      const rows = slot.rows || [];
      if (!rows.some((row) => row.pool === REVERSE_POOL)) return 'normal';
      const isHit = rows.some((row) => row.pool !== REVERSE_POOL && row.ids.includes(card?.id));
      return isHit ? 'normal' : 'reverse';
    }
    start = end;
  }
  return 'normal';
}

// Design 054 § Unboxing skin: tiers follow the card's hit class (`cardClass`), not its rarity
// string, so every era's hits reveal alike.
const TIER_BY_CLASS = {
  hit: 1,
  ultra: 2,
  illustration: 2,
  aceSpec: 2,
  specialIllustration: 3,
  top: 3,
};

/**
 * @param {string|null} className the card's `cardClass` in its box's era
 * @returns {0|1|2|3} how big the reveal is: 0 plain, 1 reverse or ex-class, 2 full art /
 *   illustration / ACE SPEC, 3 special illustration or the era's top tier.
 */
export function hitTierFor(card, slot, className = null) {
  const tier = card ? TIER_BY_CLASS[className] || 0 : 0;
  return slot === 'reverse' ? Math.max(1, tier) : tier;
}

// ME-era Rares are holo prints (TCGdex me02 Rare records carry `variants.holo: true`), as are the
// holo rares of SM and SWSH (`Rare Holo`, `Holo Rare`); promos are "foil promo cards" (pokemon.com
// Build & Battle box listing).
const HOLO_PRINT_RARITIES = new Set(['Rare', 'Rare Holo', 'Holo Rare', 'Promo']);
const NO_FOIL_RARITIES = new Set(['Common', 'Uncommon']);

/** @returns {string|null} the holo family (`data-rarity`) the revealed card wears, or null for none. */
export function unboxingHoloRarity(card, slot) {
  if (!card) return null;
  if (slot === 'reverse') return resolveHoloEffect({ ...card, rarity: 'Reverse Holo' });
  if (HOLO_PRINT_RARITIES.has(card.rarity)) {
    return resolveHoloEffect({ ...card, rarity: 'Rare Holo' });
  }
  if (NO_FOIL_RARITIES.has(card.rarity)) return null;
  return resolveHoloEffect(card);
}

// ── Sound ────────────────────────────────────────────────────────────────────
const VOICE_BY_EVENT = {
  tearWrap: 'unbox-tear',
  tearPack: 'unbox-tear',
  openLid: 'unbox-lid',
  unwrapDeck: 'unbox-unwrap',
  finish: 'unbox-done',
};

/** @returns {string|null} the `STATIC_VOICES` effect a beat plays; a reveal's pitch rises with its tier. */
export function unboxingVoiceFor(event, tier = 0) {
  if (event === 'revealCard') return tier >= 1 ? `unbox-hit-${Math.min(3, tier)}` : 'unbox-flip';
  return Object.hasOwn(VOICE_BY_EVENT, event) ? VOICE_BY_EVENT[event] : null;
}

// ── Pack art and tear edge (seeded, separate from the pool's RNG stream) ─────
// The four vendored Phantasmal Flames pack fronts (design 052).
export const PACK_ARTS = ['charizard', 'gengar', 'heracross', 'lopunny'];

/**
 * One pack-front art per pack, an index into the box skin's four `packArts`. A stream of its own
 * (`seed ^ 0x9e3779b9`), so adding art never shifts the pool `openBox(seed)` draws. Duplicates are
 * allowed, as in real boxes.
 */
export function packArtIndexes(seed, count = PACK_COUNT) {
  const rng = createRng(seed ^ 0x9e3779b9);
  return Array.from({ length: Math.max(0, count | 0) }, () => rng.int(PACK_ARTS.length));
}

const withWebp = (base) => (base ? `${base}.webp` : null);
const largeImageOf = (card) => card?.images?.large || card?.image || null;

/**
 * What the unboxing scene dresses the box in (design 054 § Unboxing skin, D5): the set's TCGdex
 * logo and symbol, the key card's art for a procedural front, the era palette, the four pack
 * fronts (vendored files or a procedural front over a card's art) and the vendored box faces.
 *
 * @param {{box: object, setInfo?: object, cards?: object[], data?: {cardsById?: Map<string, object>}}} args
 * @returns {{setLogoUrl: string|null, setSymbolUrl: string|null, keyArtUrl: string|null,
 *   palette: string, packArts: ({kind: 'vendored', src: string}|{kind: 'procedural', cardId: string,
 *   imageUrl: string|null})[], faces: object|null}}
 */
export function boxSkin({ box, setInfo = {}, cards = [], data = {} }) {
  const skin = box?.skin || {};
  const cardById = (id) => cards.find((card) => card.id === id) || data.cardsById?.get(id) || null;
  const packArts = skin.vendored?.packs
    ? PACK_ARTS.map((key) => ({ kind: 'vendored', src: packArtSrc(box.setId, key) }))
    : (skin.packArtCardIds || []).map((cardId) => ({
        kind: 'procedural',
        cardId,
        imageUrl: largeImageOf(cardById(cardId)),
      }));
  return {
    setLogoUrl: withWebp(setInfo.logo),
    setSymbolUrl: withWebp(setInfo.symbol),
    keyArtUrl: largeImageOf(cardById(skin.keyArtCardId)),
    palette: skin.palette || box?.era || 'me',
    packArts,
    faces: skin.vendored?.box ? BOX_FACE_TEXTURES : null,
  };
}

const TEAR_LINE_PCT = 7;
const TOOTH_MIN_PCT = 2;
const TOOTH_MAX_PCT = 5;

/**
 * The torn top strip as a `clip-path` polygon in the pack's own percent space: the full top edge,
 * then a jagged tear line whose teeth reach 2–5 % of the pack height below the crimp. Seeded per
 * pack so a reload shows the same tear.
 */
export function packTearEdge(seed, packIndex, teeth = 12) {
  const toothCount = Math.max(1, teeth | 0);
  const rng = createRng(((seed ^ 0x85ebca6b) + Math.imul(packIndex + 1, 0x632be5ab)) >>> 0);
  const points = ['0% 0%', '100% 0%'];
  for (let step = 0; step <= 2 * toothCount; step += 1) {
    const x = 100 - (step * 100) / (2 * toothCount);
    const depth =
      step % 2 === 1 ? lerp(TOOTH_MIN_PCT, TOOTH_MAX_PCT, rng.next()) : 0;
    points.push(`${pct(x)} ${pct(TEAR_LINE_PCT + depth)}`);
  }
  return `polygon(${points.join(', ')})`;
}

// ── Box face perspective ─────────────────────────────────────────────────────
const SINGULAR_PIVOT = 1e-9;

// Solves `a · x = b` in place by Gaussian elimination with partial pivoting.
function solveLinear(a, b) {
  const n = b.length;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < SINGULAR_PIVOT) throw new Error('faceMatrix3d: degenerate quad');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / a[col][col];
      for (let k = col; k < n; k += 1) a[row][k] -= factor * a[col][k];
      b[row] -= factor * b[col];
    }
  }
  const x = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let k = row + 1; k < n; k += 1) sum -= a[row][k] * x[k];
    x[row] = sum / a[row][row];
  }
  return x;
}

const isPoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);

/** @returns {number[]} `[h0..h7]` of the homography taking `src[i]` to `dst[i]` (h8 = 1). */
export function homography(src, dst) {
  const a = [];
  const b = [];
  src.forEach(({ x, y }, index) => {
    const { x: u, y: v } = dst[index];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  });
  return solveLinear(a, b);
}

/**
 * The CSS `matrix3d(...)` that maps a face's four corners in a reference image (clockwise from
 * top-left, image pixels) onto a `dstWidthPx × dstHeightPx` rectangle. The image it is applied to
 * needs `transform-origin: 0 0`. Throws on a degenerate quad (the face then falls back to its
 * procedural layout).
 */
export function faceMatrix3d(srcQuad, dstWidthPx, dstHeightPx) {
  if (!Array.isArray(srcQuad) || srcQuad.length !== 4 || !srcQuad.every(isPoint)) {
    throw new Error('faceMatrix3d: srcQuad needs four {x, y} corners');
  }
  if (!(dstWidthPx > 0) || !(dstHeightPx > 0)) {
    throw new Error('faceMatrix3d: the face needs a positive size');
  }
  const dst = [
    { x: 0, y: 0 },
    { x: dstWidthPx, y: 0 },
    { x: dstWidthPx, y: dstHeightPx },
    { x: 0, y: dstHeightPx },
  ];
  const [h0, h1, h2, h3, h4, h5, h6, h7] = homography(srcQuad, dst);
  // Column-major 4×4 with the homography in the x/y/w rows and z passed through.
  const values = [h0, h3, 0, h6, h1, h4, 0, h7, 0, 0, 1, 0, h2, h5, 0, 1];
  return `matrix3d(${values.map((value) => Number(value.toPrecision(10))).join(', ')})`;
}

// ── Reveal all ───────────────────────────────────────────────────────────────
/**
 * The beats "Reveal all" plays for one pack, from its next face-down card. A hit holds the stage:
 * the card after it starts once the hit settles. When this pack is the last one with face-down
 * cards, a `collapse` beat closes the scene.
 *
 * @param {Unboxing} unboxing
 * @param {{packIndex?: number, tiers?: number[]}} options `tiers[k]` = hitTierFor of card k
 *   (default: the first torn pack still face-down; all tier 0)
 * @returns {{at: number, durationMs: number, kind: 'reveal'|'hit'|'collapse', packIndex: number,
 *   cardIndex?: number}[]}
 */
export function unboxingTimeline(unboxing, { packIndex, tiers = [] } = {}) {
  if (!unboxing || unboxing.stage !== 'packs') return [];
  const pack =
    packIndex ??
    unboxing.packsTorn.findIndex(
      (torn, index) => torn && unboxing.revealed[index] < CARDS_PER_PACK
    );
  if (!isPackIndex(pack) || !unboxing.packsTorn[pack]) return [];

  const beats = [];
  let at = 0;
  let end = 0;
  for (let cardIndex = unboxing.revealed[pack]; cardIndex < CARDS_PER_PACK; cardIndex += 1) {
    const tier = tiers[cardIndex] || 0;
    const { totalMs } = cardRevealPhases(tier);
    const kind = tier >= 2 ? 'hit' : 'reveal';
    beats.push({ at, durationMs: totalMs, kind, packIndex: pack, cardIndex });
    end = Math.max(end, at + totalMs);
    at = kind === 'hit' ? at + totalMs : at + REVEAL_STAGGER_MS;
  }
  const othersDone = unboxing.revealed.every(
    (count, index) => index === pack || count === CARDS_PER_PACK
  );
  if (othersDone) {
    beats.push({ at: end, durationMs: FAN_COLLAPSE_MS, kind: 'collapse', packIndex: pack });
  }
  return beats;
}
