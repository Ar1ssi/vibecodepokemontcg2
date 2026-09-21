// Pure geometry helpers for the TCG Live-style attack preview overlay
// (design 008, Component 1). No DOM access — attack-preview.js is the thin
// caller that applies these numbers to real elements (R9).

// The attack block occupies this band of the card's rendered face, expressed
// as a percentage from the top. An Ability sits above the attacks and pushes
// the whole band down by ABILITY_SHIFT_PCT per ability (cards only ever carry
// one Ability slot today, but the shift is per-count for forward safety).
export const DEFAULT_ATTACK_BAND = {
  topPct: 52,
  bottomPct: 85,
  abilityShiftPct: 8,
  abilityHeightPct: 7,
};

// Printed attack text length drives how much of the band an attack row claims: a row with a long
// effect paragraph needs more height than a bare damage line. One weight unit is the header row;
// each started TEXT_CHARS_PER_LINE of effect text adds TEXT_LINE_WEIGHT.
const TEXT_CHARS_PER_LINE = 40;
const TEXT_LINE_WEIGHT = 0.5;

/**
 * Relative height share of each attack row, in attack order. Rows with more effect text weigh
 * more; every row weighs at least 1 so a text-less attack still gets its header.
 */
export function attackWeights(attacks = []) {
  return attacks.map((attack) => {
    const length = String(attack?.text ?? '').trim().length;
    return 1 + Math.ceil(length / TEXT_CHARS_PER_LINE) * TEXT_LINE_WEIGHT;
  });
}

/**
 * Bounds (as percentages of the card's rendered content box) for one attack
 * zone out of `attackCount` shares of the attack band. Shares are equal unless
 * `weights` (one per attack, see attackWeights) says otherwise. `band` is the
 * frame's band; it defaults to DEFAULT_ATTACK_BAND.
 *
 * @returns {{ topPct: number, heightPct: number } | null} null when there are
 *   no attacks to lay out (E1 — attacks not yet resolved).
 */
export function attackZoneBounds({
  attackCount,
  index,
  abilityCount = 0,
  band = DEFAULT_ATTACK_BAND,
  weights = null,
}) {
  if (!attackCount || attackCount <= 0) return null;
  if (index < 0 || index >= attackCount) return null;

  const top = band.topPct + abilityCount * band.abilityShiftPct;
  const bottom = band.bottomPct + abilityCount * band.abilityShiftPct;
  const bandHeight = bottom - top;

  const shares =
    Array.isArray(weights) && weights.length === attackCount
      ? weights
      : Array.from({ length: attackCount }, () => 1);
  const totalShare = shares.reduce((sum, w) => sum + w, 0);
  const before = shares.slice(0, index).reduce((sum, w) => sum + w, 0);

  return {
    topPct: top + (bandHeight * before) / totalShare,
    heightPct: (bandHeight * shares[index]) / totalShare,
  };
}

/** All attack zone bounds for a card at once, in attack order. */
export function listAttackZoneBounds({
  attackCount,
  abilityCount = 0,
  band = DEFAULT_ATTACK_BAND,
  weights = null,
}) {
  if (!attackCount || attackCount <= 0) return [];
  return Array.from({ length: attackCount }, (_, index) =>
    attackZoneBounds({ attackCount, index, abilityCount, band, weights })
  );
}

/**
 * Bounds for the ability zone that sits above the (possibly absent) attack
 * band. Returns null when the card has no ability to show one for.
 */
export function abilityZoneBounds({
  abilityCount = 0,
  band = DEFAULT_ATTACK_BAND,
}) {
  if (!abilityCount) return null;
  const bottom = band.topPct + abilityCount * band.abilityShiftPct;
  const top = bottom - band.abilityHeightPct;
  return { topPct: top, heightPct: band.abilityHeightPct };
}

/**
 * Anchor for the Stadium effect panel. A Stadium prints its effect in a wide box below the
 * header, so there is no attack band to subdivide — a single panel anchored here covers the
 * printed text the way an attack panel covers its attack.
 *
 * `band` is the frame's `{ topPct, bottomPct }` for the printed effect box. With a `bottomPct`
 * the panel is stretched over the whole box (`heightPct`); without one it stays content-sized
 * and `heightPct` is null (013: the stack must not stretch over art it has no box for).
 */
export const DEFAULT_STADIUM_BAND = { topPct: 30, bottomPct: null };
export function stadiumZoneBounds({ band = DEFAULT_STADIUM_BAND } = {}) {
  const heightPct =
    band.bottomPct == null ? null : band.bottomPct - band.topPct;
  return { topPct: band.topPct, heightPct };
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
