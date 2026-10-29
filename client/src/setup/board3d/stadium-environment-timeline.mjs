// Design 077: which Stadium board shows and how it changes. The view sets the target at once; a
// queued plan plays the change later (`play`), and a skipped or cleared plan snaps to it (`settle`).
// Pure: the mesh (stadium-environment-mesh.js) reads `frame(now)` into its uniforms.

export const INTRO_MS = 1600;
export const EXIT_MS = 900;

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInQuad = (t) => t * t;

/**
 * @returns {{
 *   setTarget: (key: string|null) => boolean,
 *   play: (options?: { swapReady?: boolean }) => number,
 *   settle: () => void,
 *   start: (now: number) => void,
 *   frame: (now: number) => { key: string|null, under: string|null, reveal: number, exit: number, animating: boolean },
 *   current: () => { shown: string|null, target: string|null, phase: 'enter'|'swap'|'exit'|null },
 * }}
 *   `play` starts the change from the shown board to the target and returns its hold: INTRO_MS to
 *   reveal a board (over the mat, or over the outgoing board when `swapReady`), EXIT_MS to dissolve
 *   one, 0 when nothing changes. A transition still running when `play` is called ends where it was
 *   headed first. The phase's clock starts at `start(now)` (the mesh calls it once the board's
 *   programs are ready); until then the frame holds its first pose.
 */
export function createEnvironmentTimeline() {
  let target = null;
  let shown = null;
  /** @type {{ kind: 'enter'|'swap'|'exit', key: string|null, under: string|null, startedAt: number|null }|null} */
  let phase = null;

  const finish = () => {
    shown = phase.kind === 'exit' ? null : phase.key;
    phase = null;
  };

  const setTarget = (next) => {
    const wanted = next ?? null;
    if (wanted === target) return false;
    target = wanted;
    return true;
  };

  const play = ({ swapReady = false } = {}) => {
    if (phase) finish();
    if (target === shown) return 0;
    if (target === null) {
      phase = { kind: 'exit', key: shown, under: null, startedAt: null };
      return EXIT_MS;
    }
    const swap = shown !== null && swapReady;
    phase = { kind: swap ? 'swap' : 'enter', key: target, under: swap ? shown : null, startedAt: null };
    return INTRO_MS;
  };

  const settle = () => {
    phase = null;
    shown = target;
  };

  const start = (now) => {
    if (phase && phase.startedAt === null) phase.startedAt = now;
  };

  const frame = (now) => {
    if (phase) {
      const length = phase.kind === 'exit' ? EXIT_MS : INTRO_MS;
      const t = phase.startedAt === null ? 0 : clamp01((now - phase.startedAt) / length);
      if (t < 1) {
        if (phase.kind === 'exit') return { key: phase.key, under: null, reveal: 1, exit: easeInQuad(t), animating: true };
        return { key: phase.key, under: phase.under, reveal: easeOutCubic(t), exit: 0, animating: true };
      }
      finish();
    }
    return { key: shown, under: null, reveal: 1, exit: 0, animating: false };
  };

  const current = () => ({ shown, target, phase: phase?.kind ?? null });

  return { setTarget, play, settle, start, frame, current };
}
