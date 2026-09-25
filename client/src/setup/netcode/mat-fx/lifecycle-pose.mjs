// Design 022 slice 4: pure math + id helpers for the lifecycle effects
// (evolve burst, energy snap, retreat slide, trainer/stadium card present).
// DOM-free; lifecycle.js drives the overlays.

export const EVOLVE_BURST_MS = 1150;
export const ENERGY_SNAP_MS = 560;
export const RETREAT_SLIDE_MS = 520;
export const CARD_PRESENT_MS = 1700;
export const PROMOTE_MS = 560;
export const DISCARD_PUFF_MS = 420;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const rectCenter = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const isId = (v) => v != null && v !== '';

/**
 * Instance ids whose on-board position changes for a retreat/switch, so their
 * pre-diff rects can be captured. Shape-based so it accepts both the raw event
 * and the fx plan (which drops `type`): `cardRetreated` carries
 * {activeId, promotedId}; `pokemonSwapped` {instanceId, replacedInstanceId}.
 * Empty for anything else.
 */
export function moveIdsForEvent(event) {
  if (!event) return [];
  if (event.activeId != null || event.promotedId != null) {
    return [event.activeId, event.promotedId].filter(isId);
  }
  if (event.replacedInstanceId != null) {
    return [event.instanceId, event.replacedInstanceId].filter(isId);
  }
  return [];
}

/** Flash + scale pop on the evolved card; peaks mid-way. */
export function evolveBurstPose(t) {
  const c = clamp01(t);
  const bell = Math.sin(c * Math.PI);
  return { scale: 1 + 0.16 * bell, opacity: bell, ringScale: 0.8 + 0.9 * easeOutCubic(c), ringOpacity: 1 - c };
}

/**
 * Design 026: the evolved card glows to a pure white silhouette, swells, then
 * the white drains away to reveal the new art (Pokémon-games evolution beat).
 */
export function evolveSilhouettePose(t) {
  const c = clamp01(t);
  if (c < 0.4) {
    const e = easeOutCubic(c / 0.4);
    return { opacity: e, scale: 1 + 0.07 * e };
  }
  const out = easeInOutCubic((c - 0.4) / 0.6);
  return { opacity: 1 - out, scale: 1.07 - 0.07 * out };
}

/** Light pillar above the card: shoots up, then thins and fades. */
export function evolvePillarPose(t) {
  const c = clamp01(t);
  const up = easeOutCubic(Math.min(1, c / 0.35));
  return {
    scaleY: up,
    scaleX: c < 0.35 ? 1 : 1 - 0.7 * ((c - 0.35) / 0.65),
    opacity: c < 0.35 ? up : 1 - (c - 0.35) / 0.65,
  };
}

/** Energy token drops in large and snaps to its size at the card center. */
export function energySnapPose(t) {
  const c = clamp01(t);
  const snap = easeOutCubic(Math.min(1, c / 0.55));
  return {
    scale: 2.4 - 1.4 * snap,
    opacity: c < 0.55 ? snap : Math.max(0, 1 - (c - 0.55) / 0.45),
    glow: c < 0.55 ? 0 : Math.max(0, 1 - (c - 0.55) / 0.45),
  };
}

/**
 * Ghost slide from a captured origin rect to the card's new rect, fading out
 * over the last quarter so the real (already placed) card takes over. The
 * card lifts (scale bump) mid-slide so it reads as picked up and set down.
 * @returns {(t:number) => {x:number,y:number,scale:number,opacity:number}}
 */
export function slidePoseFor(fromRect, toRect) {
  const a = rectCenter(fromRect);
  const b = rectCenter(toRect);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return (t) => {
    const c = clamp01(t);
    const remain = 1 - easeInOutCubic(c);
    return {
      x: dx * remain,
      y: dy * remain,
      scale: 1 + 0.07 * Math.sin(Math.PI * c),
      opacity: c < 0.75 ? 1 : 1 - (c - 0.75) / 0.25,
    };
  };
}

/**
 * Trainer/Stadium presentation: flies from `fromRect` (or grows from the
 * center) to a centered hold, then fades. `targetRect` is the centered box the
 * host was spawned on.
 * @returns {(t:number) => {x:number,y:number,scale:number,opacity:number}}
 */
export function presentPoseFor(fromRect, targetRect) {
  const b = rectCenter(targetRect);
  const a = fromRect ? rectCenter(fromRect) : b;
  const startScale = fromRect ? Math.max(0.15, fromRect.width / targetRect.width) : 0.5;
  return (t) => {
    const c = clamp01(t);
    if (c < 0.2) {
      const e = easeOutCubic(c / 0.2);
      return {
        x: (a.x - b.x) * (1 - e),
        y: (a.y - b.y) * (1 - e),
        scale: startScale + (1 - startScale) * e,
        rotateY: 38 * (1 - e),
        opacity: Math.min(1, e * 1.6),
      };
    }
    if (c < 0.75) return { x: 0, y: 0, scale: 1, rotateY: 0, opacity: 1 };
    const out = (c - 0.75) / 0.25;
    return { x: 0, y: 0, scale: 1 + 0.08 * out, rotateY: 0, opacity: Math.max(0, 1 - out) };
  };
}

/** Backdrop behind the presented card: eases in, holds, fades with the card. */
export function presentDimPose(t, peak = 0.38) {
  const c = clamp01(t);
  if (c < 0.15) return { opacity: peak * easeOutCubic(c / 0.15) };
  if (c < 0.75) return { opacity: peak };
  return { opacity: Math.max(0, peak * (1 - (c - 0.75) / 0.25)) };
}

/** Centered card-shaped box (in the viewport) for the presentation overlay. */
export function presentTargetRect(viewportWidth, viewportHeight, aspect = 0.716) {
  const height = Math.min(viewportHeight * 0.5, 420);
  const width = height * aspect;
  return {
    left: (viewportWidth - width) / 2,
    top: (viewportHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Design 024 slice 4: a Pokemon promoted to Active rises into the slot behind
 * a brightening glow — the beat after a Knockout that previously had none.
 */
export function promotePose(t) {
  const c = clamp01(t);
  const out = easeOutCubic(c);
  return {
    y: 26 * (1 - out),
    scale: 0.92 + 0.08 * out,
    glowOpacity: c < 0.3 ? c / 0.3 : Math.max(0, 1 - (c - 0.3) / 0.7),
    glowScale: 0.9 + 0.5 * out,
  };
}

/**
 * Design 024 slice 4: cards leaving for the discard pile puff outward and fade,
 * so a discard is visible without animating every individual card.
 */
export function discardPuffPose(t) {
  const c = clamp01(t);
  const out = easeOutCubic(c);
  return {
    y: -18 * out,
    scale: 1 + 0.35 * out,
    opacity: c < 0.2 ? c / 0.2 : Math.max(0, 1 - (c - 0.2) / 0.8),
  };
}

/**
 * Design 024 slice 4: devolution is the evolve burst run backwards — the ring
 * collapses inward instead of expanding, so the two read as opposites.
 */
export function devolveBurstPose(t) {
  const c = clamp01(t);
  const bell = Math.sin(c * Math.PI);
  return {
    scale: 1 - 0.12 * bell,
    opacity: bell,
    ringScale: 1.7 - 0.9 * easeOutCubic(c),
    ringOpacity: 1 - c,
  };
}

/** The played card's face: the post-update element image beats the pre-diff
 * snapshot, which for an opponent's hand card is still the sleeve.
 *
 * `src` first, not `currentSrc`: setting the attribute updates `src`
 * synchronously, while `currentSrc` still names the previously loaded resource
 * until the image's update-the-image-data task runs. Reading `currentSrc` here
 * (same task as the DOM diff) replayed the pre-diff sleeve. */
export const presentSrcFor = (origin, element) => element?.src || element?.currentSrc || origin?.src;
