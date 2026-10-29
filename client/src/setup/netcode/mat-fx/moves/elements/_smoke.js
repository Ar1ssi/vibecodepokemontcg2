// Design 077 slice 5: the smoke and cloud drawers as element beats. Each puff the drawers'
// poses place (smokePuffs, cloudPose) becomes a lit, billowing smoke element in a type's own
// look — soot, ghost wisps, dark ink — at the same place, size and timing.
import { anchorOf, centreOf } from '../move-drawers.js';
import { cloudPose, smokePuffs } from '../move-poses.mjs';
import { alphaOf, dissolveOf, emit, stageLen, stageOf } from './_emit.js';

/** How much larger the element puffs draw than the canvas gradients (they fade to nothing at r). */
export const PUFF_SCALE = 1.5;

/**
 * Smoke and cloud beats in a look. `look(info)` → `{ tint, light, density, rise, glow, alphaGain }`
 * (0–1 colours; light may exceed 1). The smoke drawer only draws for a material with a smoke
 * colour; these beats keep that rule.
 */
export function smokeBeats(look) {
  const puff = (ctx, info, x, y, r, alpha, index, extra = {}) => {
    const style = look(info);
    emit(ctx, 'smoke', {
      at: stageOf(ctx, x, y),
      radius: stageLen(ctx, r) * PUFF_SCALE,
      alpha: alphaOf(ctx, alpha * (style.alphaGain ?? 1)),
      seed: (info.seed ?? 0) + index * 1.37,
      tint: style.tint,
      light: style.light,
      density: style.density,
      rise: style.rise,
      glow: extra.glow ?? style.glow,
      dissolve: dissolveOf(ctx),
    });
  };
  return {
    smoke(ctx, lane, s, info) {
      if (!info.material?.smoke) return;
      const c = centreOf(lane, info.params?.target);
      smokePuffs(s, lane.h, info.params).forEach((p, index) => puff(ctx, info, c.x + p.dx, c.y + p.dy, p.r, p.alpha, index));
    },
    cloud(ctx, lane, s, info) {
      const c = anchorOf(lane, info.params ?? {});
      cloudPose(s, lane.h, info.seed, info.params).forEach((p, index) =>
        puff(ctx, info, c.x + p.dx, c.y + p.dy, p.r, p.alpha, index, { glow: look(info).cloudGlow })
      );
    },
  };
}
