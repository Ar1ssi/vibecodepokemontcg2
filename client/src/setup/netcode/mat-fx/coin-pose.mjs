// Design 024 slice 4: pure math + text for the in-attack coin chip.
export const COIN_CHIP_MS = 700;
export const COIN_SPINS = 3;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/** @returns {'HEADS'|'TAILS'|null} null for anything that is not a coin face. */
export function coinFaceLabel(face) {
  if (face === 'heads') return 'HEADS';
  if (face === 'tails') return 'TAILS';
  return null;
}

/**
 * The chip rises, spins to a stop, holds, then fades. `spin` is an X scale
 * that passes through 0 on each half-turn, which reads as a coin going
 * edge-on; it settles at 1 so the face is legible while the chip holds.
 */
export function coinChipPose(t) {
  const c = clamp01(t);
  const settle = easeOutCubic(Math.min(1, c / 0.6));
  return {
    y: -22 * settle,
    scale: 0.6 + 0.4 * settle,
    spin: c < 0.6 ? Math.cos(c * COIN_SPINS * 2 * Math.PI) : 1,
    opacity: c < 0.12 ? c / 0.12 : c < 0.75 ? 1 : Math.max(0, 1 - (c - 0.75) / 0.25),
  };
}
