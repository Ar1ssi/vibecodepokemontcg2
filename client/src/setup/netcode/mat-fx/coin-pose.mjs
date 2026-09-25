// Pure timing + text for the full-screen coin-flip ceremony (coin-flip-ceremony.js).
// Every in-game flip plays that ceremony; several flips from one effect play in
// one overlay, one toss after another. DOM-free so the FX queue hold, the landing
// chimes (fx-audio.mjs) and the ceremony itself all read the same schedule.

/** Full turns per toss. Each toss lands on the next multiple, so the coin never spins back. */
export const COIN_SPINS = 5;
/** A printed count is small; the cap keeps a flip-until-tails streak from holding the board. */
export const MAX_CEREMONY_FLIPS = 20;

const HOLD_MS = 1300;
const FADE_MS = 400;
const REDUCED_STEP_MS = 700;

const isFace = (face) => face === 'heads' || face === 'tails';

/** @returns {'HEADS'|'TAILS'|null} null for anything that is not a coin face. */
export function coinFaceLabel(face) {
  if (face === 'heads') return 'HEADS';
  if (face === 'tails') return 'TAILS';
  return null;
}

/**
 * Every face one engine event flipped, in order. The engine reports flips in
 * four shapes: `coinFlipped` (one `face`, or a flip-until-tails `heads` count
 * that ended on tails), `attackCoinFlipped` (`flips`), and the attack gate /
 * marker events (`coin`).
 *
 * @returns {Array<'heads'|'tails'>}
 */
export function coinFlipFaces(event) {
  if (!event || typeof event !== 'object') return [];
  let faces = [];
  if (event.type === 'coinFlipped') {
    if (Number.isInteger(event.heads) && event.heads >= 0) {
      faces = [...Array(event.heads).fill('heads'), 'tails'];
    } else if (isFace(event.face)) {
      faces = [event.face];
    }
  } else if (event.type === 'attackCoinFlipped' && Array.isArray(event.flips)) {
    faces = event.flips.filter(isFace);
  } else if (event.type === 'attackCoinFlipped' || event.type === 'attackMarkerCoinFlipped' || event.type === 'attackFlipGateCoinFlipped') {
    faces = isFace(event.coin) ? [event.coin] : [];
  }
  return faces.slice(0, MAX_CEREMONY_FLIPS);
}

/** Toss length and the pause that lets each result read, shorter as the count grows. */
const pacingFor = (count, reducedMotion) => {
  if (reducedMotion) return { tossMs: 0, gapMs: REDUCED_STEP_MS };
  if (count <= 1) return { tossMs: 2200, gapMs: 0 };
  if (count <= 4) return { tossMs: 1500, gapMs: 700 };
  return { tossMs: 1000, gapMs: 450 };
};

/**
 * The ceremony's schedule for `count` flips. `landsAt[i]` is when toss i shows
 * its face (ms from the first toss); the overlay holds after the last landing,
 * then fades. `totalMs` is the whole ceremony including the fade.
 *
 * @param {number} count
 * @param {{ reducedMotion?: boolean, tossMs?: number, holdMs?: number, fadeMs?: number }} [options]
 */
export function coinCeremonyTimeline(count, options = {}) {
  const flips = Math.max(1, Math.min(MAX_CEREMONY_FLIPS, Number.isInteger(count) ? count : 1));
  const pacing = pacingFor(flips, options.reducedMotion === true);
  const tossMs = Number.isFinite(options.tossMs) && !options.reducedMotion ? options.tossMs : pacing.tossMs;
  const { gapMs } = pacing;
  const holdMs = Number.isFinite(options.holdMs) ? options.holdMs : HOLD_MS;
  const fadeMs = Number.isFinite(options.fadeMs) ? options.fadeMs : FADE_MS;
  const landsAt = Array.from({ length: flips }, (_, i) => i * (tossMs + gapMs) + tossMs);
  const lastLanding = landsAt[flips - 1];
  return { tossMs, gapMs, holdMs, fadeMs, landsAt, totalMs: lastLanding + holdMs + fadeMs };
}

/**
 * The coin's X rotation after toss `index` lands on `face`. Each toss adds
 * COIN_SPINS full turns; tails is the half-turn that shows the back.
 */
export function coinFlipAngle(index, face) {
  return COIN_SPINS * 360 * (index + 1) + (face === 'tails' ? 180 : 0);
}

/** "2 of 3 · 1 head" under the coin while a multi-flip plays ("Flipping 3 coins" before the first lands); empty for one flip. */
export function coinTallyText(faces, landed) {
  if (!Array.isArray(faces) || faces.length < 2) return '';
  if (!(landed > 0)) return `Flipping ${faces.length} coins`;
  const shown = faces.slice(0, landed);
  const heads = shown.filter((face) => face === 'heads').length;
  return `${shown.length} of ${faces.length} · ${heads} ${heads === 1 ? 'head' : 'heads'}`;
}
