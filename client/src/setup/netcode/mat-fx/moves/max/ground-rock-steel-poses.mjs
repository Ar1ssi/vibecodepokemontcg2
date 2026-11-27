// Design 092 ground-rock-steel: the pure pose of the `monolith` drawer (Max Rockfall, G-Max
// Volcalith). A slab of stone the size of a Pokémon drops out of the sky onto the ground just
// beyond the struck card: it eases out of the sky, falls faster and faster (gravity), lands with
// a jolt that drives it a little into the ground, stands while the rubble flies, then sinks back
// into the ground as it fades. Its shadow on the cloth darkens and tightens as it nears.
// DOM-free: lengths in px for a lane height `h`, times as beat fractions.
import { withDefaults } from '../move-spec.mjs';

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInQuad = (t) => t * t;
/** How far (slab heights) the landing jolt drives the stone into the ground. */
const BITE = 0.06;
/** How much of the slab is under the ground when it has sunk away. */
const SUNK = 0.6;
/** How much larger the stone draws at the top of its fall (nearer the camera). */
const NEAR_GROWTH = 0.3;

/**
 * The monolith at beat progress `s` (any number; clamped). `height` px between the stone's foot
 * and the ground (0 once landed), `sink` px of it under the ground, `scale` its size factor (it is
 * nearer the camera high up), `lean` deg, `alpha`, `shadow` 0–1 (its shadow's strength: it darkens
 * as the stone nears), `impact` 0–1 (the landing jolt, peaking as it lands, gone by the hold's end)
 * and `landed` whether it has struck the ground.
 * @returns {{ height: number, sink: number, scale: number, lean: number, alpha: number,
 *   shadow: number, impact: number, landed: boolean, w: number, tall: number }}
 */
export function monolithPose(s, h, params) {
  const p = withDefaults('monolith', params);
  const c = clamp01(Number.isFinite(s) ? s : 0);
  const land = p.land;
  const w = p.w * h;
  const tall = p.tall * h;
  if (c < land) {
    const u = c / land;
    const fall = easeInQuad(u);
    const remaining = 1 - fall;
    return {
      height: p.drop * h * remaining,
      sink: 0,
      scale: 1 + NEAR_GROWTH * remaining,
      lean: p.lean * (0.4 + 0.6 * remaining),
      alpha: clamp01(u / 0.2),
      shadow: 0.25 + 0.75 * fall,
      impact: 0,
      landed: false,
      w,
      tall,
    };
  }
  const after = (c - land) / Math.max(1e-6, 1 - land);
  const jolt = clamp01(after / 0.12);
  const sinkFrom = Math.min(0.95, land + p.hold);
  const sinkU = clamp01((c - sinkFrom) / (1 - sinkFrom));
  return {
    height: 0,
    sink: tall * (BITE * easeOutCubic(jolt) + SUNK * easeInQuad(sinkU)),
    scale: 1,
    lean: p.lean * 0.4,
    alpha: 1 - easeInQuad(sinkU),
    shadow: 1 - sinkU,
    impact: 1 - clamp01(after / 0.35),
    landed: true,
    w,
    tall,
  };
}
