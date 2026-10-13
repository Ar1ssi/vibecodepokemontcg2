// TCG Live coin toss timing and pose (design 069, slice 2). The game's flip clips are not in the
// extract, so the pose is a hand-authored arc paced by CoinFlipOverlay.cs. DOM-free: the coin stage
// reads coinPoseAt() once per frame, and the ceremony reads tcglCeremonyTimeline() for its landings.

import { MAX_CEREMONY_FLIPS, coinCeremonyTimeline, coinFlipAngle } from './coin-pose.mjs';

/** Toss length per flip in ms (`flipCountDurations`). Flip i uses entry min(i, last). */
export const TCGL_TOSS_MS = [2000, 1000, 1000, 500, 500];

const clampFlipCount = (count) => Math.max(1, Math.min(MAX_CEREMONY_FLIPS, Number.isInteger(count) ? count : 1));

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Toss length of flip `index` (0-based), the entry the game plays for that flip. */
export function tcglTossMs(index) {
  return TCGL_TOSS_MS[Math.min(index, TCGL_TOSS_MS.length - 1)];
}

/**
 * TCG Live's schedule for `count` flips. Tosses run back to back with no gap. `landsAt[i]` is when
 * toss i ends, in ms from the first toss. The hold and fade match coinCeremonyTimeline.
 *
 * @param {number} count
 * @returns {{ tossesMs: number[], landsAt: number[], holdMs: number, fadeMs: number, totalMs: number }}
 */
export function tcglCeremonyTimeline(count) {
  const flips = clampFlipCount(count);
  const tossesMs = Array.from({ length: flips }, (_, index) => tcglTossMs(index));
  let elapsedMs = 0;
  const landsAt = tossesMs.map((tossMs) => (elapsedMs += tossMs));
  const { holdMs, fadeMs } = coinCeremonyTimeline(1);
  return { tossesMs, landsAt, holdMs, fadeMs, totalMs: landsAt[flips - 1] + holdMs + fadeMs };
}

/** Fast off the table, slow into the landing. Maps 0 to 0 and 1 to 1, so a toss ends on its exact angle. */
const easeOutCubic = (progress) => 1 - (1 - progress) ** 3;

/**
 * Where the coin is `elapsedMs` after the first toss starts, for the printed `faces` (at most
 * MAX_CEREMONY_FLIPS). Each toss turns from the previous landing angle to its own (coinFlipAngle), so
 * the coin never spins back. `lift` is 0 on the table, 1 at the top of the arc. After the last landing
 * the pose holds on that landing.
 *
 * @param {Array<'heads'|'tails'>} faces
 * @param {number} elapsedMs
 * @returns {{ index: number, angle: number, lift: number } | null} null for no faces or a non-finite time.
 */
export function coinPoseAt(faces, elapsedMs) {
  if (!Array.isArray(faces) || faces.length === 0 || !Number.isFinite(elapsedMs)) return null;
  const tosses = faces.slice(0, MAX_CEREMONY_FLIPS);
  const { landsAt, tossesMs } = tcglCeremonyTimeline(tosses.length);
  const lastIndex = tosses.length - 1;
  const landedIndex = landsAt.findIndex((landAt) => elapsedMs < landAt);
  const index = landedIndex === -1 ? lastIndex : landedIndex;
  const tossStartMs = index === 0 ? 0 : landsAt[index - 1];
  const progress = clamp01((elapsedMs - tossStartMs) / tossesMs[index]);
  const fromAngle = index === 0 ? 0 : coinFlipAngle(index - 1, tosses[index - 1]);
  const toAngle = coinFlipAngle(index, tosses[index]);
  return {
    index,
    angle: fromAngle + (toAngle - fromAngle) * easeOutCubic(progress),
    lift: 4 * progress * (1 - progress),
  };
}
