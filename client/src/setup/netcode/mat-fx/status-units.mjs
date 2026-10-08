// TCG Live's status prefabs (E:/TCGLive_Extract/vfx_dump) are authored in Unity
// world units. The card quads fix the scale: Status_Damage's Card_Silhouette is a
// 10.68-unit quad whose card fills 62.2% of its width, and the Burned singed edge
// (10.41 units x the 0.78 Scale_Container x its own 1.28) fills 63.4% — both a
// card 6.62 units wide. Our FX measure everything in card widths (`em` on the
// board, the card's short side in an overlay), so one card width = 6.62 units.
// Unity's +y is up; ours is down.

export const CARD_WIDTH_UNITS = 6.62;
/** Card height / width (63 x 88 mm). */
export const CARD_ASPECT = 88 / 63;

/** A Unity length (`units` inside a container scaled by `scale`) in card widths. */
export const unitsToCard = (units, scale = 1) => (units * scale) / CARD_WIDTH_UNITS;

/** A Unity local position [x, y] in card widths, y turned to point down. */
export function unityPosToCard([x, y], scale = 1) {
  return { x: unitsToCard(x, scale), y: -unitsToCard(y, scale) };
}

/**
 * Materials whose _TintColor is (1, 1, 1, 0.5) double the particle colour, as
 * Unity's legacy particle shaders do (2 x tint x vertex colour); those with the
 * grey (0.5, 0.5, 0.5) default leave it as is.
 */
export const TINT_GAIN_BRIGHT = 2;

/**
 * A Unity colour [r, g, b] (0..1), times the material's `gain`, as a clamped
 * CSS `r, g, b` triple for `rgb(var(--x))`.
 */
export const unityRgb = ([r, g, b], gain = 1) =>
  [r, g, b].map((c) => Math.round(Math.max(0, Math.min(1, c * gain)) * 255)).join(', ');
