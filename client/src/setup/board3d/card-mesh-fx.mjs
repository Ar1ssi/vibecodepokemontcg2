// Design 076 row 5: per-card shader effects on the 3D board's card meshes, after VFX Essential's
// dissolve (noise eats the card, the hole rims burn) and rim (an edge glow). DOM-free and
// three-free: the effect values over time, the shared GLSL, and the shader maths mirrored in JS
// so the tests can pin what the GPU does. card-mesh-fx.js builds the materials from these.

/** Dissolve look: band width (noise units), HDR gain of the ember line, noise cells per card height. */
export const DISSOLVE = Object.freeze({ width: 0.09, gain: 3.6, scale: 3.2 });
/** The char ring reaches this many band widths past the ember line into the intact card. */
export const CHAR_REACH = 2.5;
/** How much the burn sweeps up the card (0 = holes anywhere, 1 = a straight line bottom → top). */
export const DISSOLVE_SWEEP = 0.45;
/**
 * Rim look: glow band as a fraction of the card width, gain at full glow. It draws in the board
 * pass (card-mesh-fx.js), so the canvas clamps it and nothing blooms it.
 */
export const RIM = Object.freeze({ band: 0.075, gain: 1 });

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** No effect: the values a card has at rest and after its effect ends. */
export const CARD_FX_REST = Object.freeze({ dissolve: 0, rim: 0 });

/**
 * The effect values of a card effect `elapsedMs` into its run: `at(elapsedMs)` clamped to 0–1
 * per channel; rest (all 0) before 0, from `ms` on, or for a missing or non-finite value.
 * @param {{ at: (elapsedMs: number) => ({ dissolve?: number, rim?: number }|null), ms: number }} fx
 */
export function cardFxValuesAt(fx, elapsedMs) {
  if (!fx || !(elapsedMs >= 0) || !(elapsedMs < fx.ms)) return CARD_FX_REST;
  const value = fx.at(elapsedMs);
  return { dissolve: clamp01(value?.dissolve), rim: clamp01(value?.rim) };
}

/**
 * The noise threshold for `amount`: what the shader subtracts from a texel's burn noise (0–1).
 * Below 0 the texel is gone; 0 – width is the ember line; width – CHAR_REACH·width is charred.
 * At amount 0 every texel sits past the char ring (untouched); at 1 every texel is gone.
 */
export function dissolveThreshold(amount, width = DISSOLVE.width) {
  const a = clamp01(amount);
  return -CHAR_REACH * width + (1 + CHAR_REACH * width) * a;
}

/**
 * A texel's burn state for `noise` (0–1, after the sweep) at `amount`: `cut` (discarded),
 * `ember` (0–1, the glowing line at the hole) and `char` (0–1, the darkened ring before it).
 */
export function burnAt(noise, amount, width = DISSOLVE.width) {
  if (!(clamp01(amount) > 0)) return { cut: false, ember: 0, char: 0 };
  const k = noise - dissolveThreshold(amount, width);
  if (k < 0) return { cut: true, ember: 0, char: 0 };
  const smooth = (e0, e1, x) => {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };
  return { cut: false, ember: 1 - smooth(0, width, k), char: 1 - smooth(width, CHAR_REACH * width, k) };
}

/** 0–255 RGB → 0–1, for a uniform; a bad colour gives `fallback`. */
export function unitRgb(rgb, fallback = [255, 255, 255]) {
  const valid = Array.isArray(rgb) && rgb.length >= 3 && rgb.slice(0, 3).every(Number.isFinite);
  return (valid ? rgb : fallback).slice(0, 3).map((c) => Math.max(0, Math.min(255, c)) / 255);
}

// The burn noise, in card heights of the card's own frame, so front, back and edge walls cut alike.
const NOISE_GLSL = /* glsl */ `
float cardFxHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float cardFxNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(cardFxHash(i), cardFxHash(i + vec3(1, 0, 0)), f.x), mix(cardFxHash(i + vec3(0, 1, 0)), cardFxHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(cardFxHash(i + vec3(0, 0, 1)), cardFxHash(i + vec3(1, 0, 1)), f.x), mix(cardFxHash(i + vec3(0, 1, 1)), cardFxHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}
float cardFxFbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * cardFxNoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.875;
}
// Distance from the burn line: < 0 gone, 0 – width ember, width – CHAR_REACH·width char.
float cardBurnK() {
  float cardH = max(2.0 * uCardHalf.y, 1e-3);
  vec2 q = vCardLocal / cardH;
  float n = clamp((cardFxFbm(vec3(q * uCardDissolveScale, 7.0)) - 0.5) * 1.8 + 0.5, 0.0, 1.0);
  float sweep = clamp(0.5 + vCardLocal.y / cardH, 0.0, 1.0);
  n = mix(n, sweep, ${DISSOLVE_SWEEP.toFixed(3)});
  float w = uCardDissolveWidth;
  return n - (-${CHAR_REACH.toFixed(3)} * w + (1.0 + ${CHAR_REACH.toFixed(3)} * w) * uCardDissolve);
}
`;

/** Uniform declarations every card-FX shader shares (values from card-mesh-fx.js). */
export const CARD_FX_UNIFORMS_GLSL = /* glsl */ `
uniform float uCardDissolve;
uniform float uCardDissolveWidth;
uniform float uCardDissolveScale;
uniform float uCardDissolveGain;
uniform vec3 uCardEdge;
uniform vec2 uCardHalf;
uniform float uCardRadius;
uniform float uCardRim;
uniform float uCardRimBand;
uniform float uCardRimGain;
uniform vec3 uCardRimColor;
`;

/** Vertex additions for a built-in material: the card-local position, after `#include <begin_vertex>`. */
export const CARD_FX_VERTEX = Object.freeze({
  head: 'varying vec2 vCardLocal;\n',
  body: 'vCardLocal = position.xy;\n',
});

/**
 * Fragment additions for a built-in material (card art, edge walls, shadow depth): `head` before
 * main; `cut` after `#include <clipping_planes_fragment>` discards what has burnt; `tint` before
 * `#include <opaque_fragment>` chars the ring and lays the ember line on `outgoingLight`.
 */
export const CARD_FX_FRAGMENT = Object.freeze({
  head: `varying vec2 vCardLocal;\n${CARD_FX_UNIFORMS_GLSL}${NOISE_GLSL}`,
  cut: /* glsl */ `
  float cardBurn = uCardDissolve > 0.0 ? cardBurnK() : 1e3;
  if (cardBurn < 0.0) discard;
`,
  tint: /* glsl */ `
  if (uCardDissolve > 0.0) {
    float w = max(uCardDissolveWidth, 1e-3);
    float charK = 1.0 - smoothstep(w, ${CHAR_REACH.toFixed(3)} * w, cardBurn);
    float emberK = 1.0 - smoothstep(0.0, w, cardBurn);
    outgoingLight *= 1.0 - 0.78 * charK;
    outgoingLight = mix(outgoingLight, uCardEdge, emberK);
  }
`,
});

/** The glow twin (additive): the ember line (FX layer, HDR, bloomed) and the rim (board pass). */
export const CARD_GLOW_VERTEX = /* glsl */ `
varying vec2 vCardLocal;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
void main() {
  vCardLocal = position.xy;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const CARD_GLOW_FRAGMENT = /* glsl */ `
varying vec2 vCardLocal;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
${CARD_FX_UNIFORMS_GLSL}${NOISE_GLSL}
// Signed distance to the card's rounded outline (negative inside), in card px.
float cardOutlineDistance(vec2 p) {
  vec2 q = abs(p) - uCardHalf + vec2(uCardRadius);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCardRadius;
}
void main() {
  vec3 light = vec3(0.0);
  float cardBurn = 1e3;
  if (uCardDissolve > 0.0) {
    cardBurn = cardBurnK();
    if (cardBurn < 0.0) discard;
    float w = max(uCardDissolveWidth, 1e-3);
    float ember = 1.0 - smoothstep(0.0, w, cardBurn);
    light += uCardEdge * ember * ember * (1.0 + uCardDissolveGain);
  }
  if (uCardRim > 0.0) {
    float inside = max(0.0, -cardOutlineDistance(vCardLocal));
    float band = max(uCardRimBand * 2.0 * uCardHalf.x, 1e-3);
    float edge = exp(-inside / band);
    // Fresnel: grazing faces (a tipped or lunging card) light up more.
    float facing = abs(dot(normalize(vViewNormal), normalize(vViewPosition)));
    float fresnel = pow(1.0 - facing, 2.0);
    float rim = clamp(edge + 0.35 * fresnel, 0.0, 1.0) * uCardRim;
    light += uCardRimColor * rim * (1.0 + uCardRimGain * rim);
  }
  if (max(light.r, max(light.g, light.b)) <= 0.002) discard;
  gl_FragColor = vec4(light, 0.0);
}
`;

/**
 * The rim's strength `insidePx` in from the card's outline (the shader's `edge` term, no Fresnel),
 * at `rim` glow on a card `widthPx` wide: 1 at the outline, fading inward over the band.
 */
export function rimEdgeAt(insidePx, rim, widthPx) {
  const band = Math.max(RIM.band * widthPx, 1e-3);
  return clamp01(Math.exp(-Math.max(0, insidePx) / band)) * clamp01(rim);
}
