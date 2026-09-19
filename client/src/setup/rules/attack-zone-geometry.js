// Pure geometry helpers for the TCG Live-style attack preview overlay
// (design 008, Component 1). No DOM access — attack-preview.js is the thin
// caller that applies these numbers to real elements (R9).

// The attack block occupies this band of the card's rendered face, expressed
// as a percentage from the top. An Ability sits above the attacks and pushes
// the whole band down by ABILITY_SHIFT_PCT per ability (cards only ever carry
// one Ability slot today, but the shift is per-count for forward safety).
const ATTACK_BAND_TOP_PCT = 52;
const ATTACK_BAND_BOTTOM_PCT = 85;
const ABILITY_SHIFT_PCT = 8;
const ABILITY_BAND_HEIGHT_PCT = 7;

/**
 * Bounds (as percentages of the card's rendered content box) for one attack
 * zone out of `attackCount` equal shares of the attack band.
 *
 * @returns {{ topPct: number, heightPct: number } | null} null when there are
 *   no attacks to lay out (E1 — attacks not yet resolved).
 */
export function attackZoneBounds({ attackCount, index, abilityCount = 0 }) {
  if (!attackCount || attackCount <= 0) return null;
  if (index < 0 || index >= attackCount) return null;

  const top = ATTACK_BAND_TOP_PCT + abilityCount * ABILITY_SHIFT_PCT;
  const bottom = ATTACK_BAND_BOTTOM_PCT + abilityCount * ABILITY_SHIFT_PCT;
  const bandHeight = bottom - top;
  const heightPct = bandHeight / attackCount;
  const topPct = top + index * heightPct;

  return { topPct, heightPct };
}

/** All attack zone bounds for a card at once, in attack order. */
export function listAttackZoneBounds({ attackCount, abilityCount = 0 }) {
  if (!attackCount || attackCount <= 0) return [];
  return Array.from({ length: attackCount }, (_, index) =>
    attackZoneBounds({ attackCount, index, abilityCount })
  );
}

/**
 * Bounds for the ability zone that sits above the (possibly absent) attack
 * band. Returns null when the card has no ability to show one for.
 */
export function abilityZoneBounds({ abilityCount = 0 }) {
  if (!abilityCount) return null;
  const bottom = ATTACK_BAND_TOP_PCT + abilityCount * ABILITY_SHIFT_PCT;
  const top = bottom - ABILITY_BAND_HEIGHT_PCT;
  return { topPct: top, heightPct: ABILITY_BAND_HEIGHT_PCT };
}

/**
 * Anchor for the Stadium effect panel. A Stadium prints its effect in a wide box below the
 * header, so there is no attack band to subdivide — a single content-sized panel anchored here
 * covers the printed text the same way an attack panel covers its attack. Only `topPct` is
 * returned; the renderer sizes the panel by its content (013: the stack must not stretch).
 */
const STADIUM_BAND_TOP_PCT = 30;
export function stadiumZoneBounds() {
  return { topPct: STADIUM_BAND_TOP_PCT };
}

/**
 * The rendered content box of a card image inside its `boxWidth`x`boxHeight`
 * container, given the image's natural size and CSS `object-fit`.
 *
 * `cover` (and any box with no known natural size) fills the box exactly —
 * that's the mat-holo path, whose wrapper is forced to 100%/100% by CSS
 * (R4). `contain` letterboxes when the aspect ratios differ — that's the
 * plain `<img>` path — and this computes the actual visible rectangle so
 * zone percentages land on the artwork instead of the letterbox bars.
 */
export function computeContentBox({
  boxWidth,
  boxHeight,
  naturalWidth,
  naturalHeight,
  fit = 'contain',
}) {
  if (fit !== 'contain' || !naturalWidth || !naturalHeight || !boxWidth || !boxHeight) {
    return { left: 0, top: 0, width: boxWidth, height: boxHeight };
  }

  const boxRatio = boxWidth / boxHeight;
  const imageRatio = naturalWidth / naturalHeight;

  let width;
  let height;
  if (imageRatio > boxRatio) {
    width = boxWidth;
    height = boxWidth / imageRatio;
  } else {
    height = boxHeight;
    width = boxHeight * imageRatio;
  }

  return {
    left: (boxWidth - width) / 2,
    top: (boxHeight - height) / 2,
    width,
    height,
  };
}
