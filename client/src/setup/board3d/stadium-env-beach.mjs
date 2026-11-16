// Design 077 (prototype): Surfing Beach as a procedural three.js place, after its card
// art (Ayumi Odashima, MEG 129): a sunny bay seen from above, the sea in the far-left corner rolling
// in to golden sand, rocks at the waterline, palm trees on the dry sand. The far-left is the sun's
// side (the board's own light).
// How the shore moves:
// - Depth: the seabed falls away from the waterline with a sandbar offshore, cut by rip channels;
//   the water's colour steps by depth, turquoise over the bar, deep blue past it.
// - Waves: swell comes in at a slight angle, slows and bunches up in shallow water (its phase grows
//   with the square root of the distance out), steepens, breaks: big waves on the bar, every wave at
//   the shore. Broken crests roll in white.
// - Swash: each bore runs up the beach as a thin sheet with a foam front, stops, and drains back
//   faster than it came; the sand is wet below the highest run-up, dry above it.
// Design 081 (the Stadium kit): drawn as the Pokémon games draw a shore, not as a photograph. The
// sea is bands of flat colour by depth (pale turquoise, turquoise, blue, deep blue) under crisp white
// foam: the rollers, the swash's front, a collar round each rock; no refraction, caustics, glitter or
// lace. The sand is clean and warm, darker where wet. Palms, rocks, starfish, shells, parasols,
// towels, a beach ball, a surfboard and dune grass are the kit's solids (stadium-kit-assets.mjs),
// standing on the baked ground.
// Design 082 (Brilliant Diamond / Shining Pearl): the sea in BDSP's saturated blues, paler only in a
// band of shallows, slow ribbons of sky light and a few slow sparkles crossing it (stadium-env-ground
// WATER), quiet near the cards; the sand BDSP's warm gold with soft ripples (SAND).
// Design 084 (the visual audit): the surf is the card's subject. The water is three zones on the
// shared water body (stadium-env-ground waterBody): a reflective band of wet sand, turquoise shallows
// the sand shows through, deep blue out past them, sparkles only out in the deep; three foam bands roll
// in parallel to the shore; the sand lighter where dry, darker where wet, with a soft tide line; the
// rocks bigger lumpy clusters.
// Two stages, as Scorched Earth: BEACH_FIELD bakes the ground once per layout (R height px, sea
// level 0; G signed px from the mean waterline, + seaward) and the shared BAKE_LIGHT turns it into
// normals, occlusion and sun shadow. Per frame SAND draws the beach and the swash; SEA one displaced
// sheet at sea level; the kit's meshes the solids.
import {
  FILTERING,
  FOOTPRINTS,
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
  TABLE_UNIFORMS,
} from './stadium-environment-glsl.mjs';
import { environmentFootprints } from './stadium-environment-layout.mjs';
import { beachSpots, shoreFrame } from './stadium-env-beach-layout.mjs';
import { LIGHT_MOTION, SAND, WATER } from './stadium-env-ground.mjs';
import { createPropBuilder } from './stadium-env-props.mjs';
import { createKitProps, glslColour } from './stadium-kit.mjs';
import { placeAsset } from './stadium-kit-assets.mjs';

export const MAX_ROCKS = 4;
export const WAVE_PERIOD_S = 6.5;
/** Run-up of an average wave, px up the beach from the mean waterline. */
export const RUNUP_PX = 56;
/** Sea sheet grid spacing in table px. */
export const SEA_SPACING_PX = 4;

const SHORE = /* glsl */ `
uniform vec2 uShoreA;
uniform vec2 uShoreB;
uniform float uShoreBend;
uniform float uBarAt;
vec2 shoreDirection() {
  vec2 chord = uShoreB - uShoreA;
  return chord / max(length(chord), 1.0);
}
vec2 seawardDirection() {
  vec2 dir = shoreDirection();
  return vec2(dir.y, -dir.x);
}
// x: px along the waterline from its far-edge end; y: signed px off the waterline's chord, positive
// out to sea, with the bay's bend (stadium-env-beach-layout.mjs shoreFrame).
vec2 shoreFrame(vec2 p) {
  float span = max(length(uShoreB - uShoreA), 1.0);
  float along = dot(p - uShoreA, shoreDirection());
  float t = clamp(along / span, 0.0, 1.0);
  return vec2(along, dot(p - uShoreA, seawardDirection()) + uShoreBend * 4.0 * t * (1.0 - t));
}
// The waterline's own wander, and beach cusps: scallops every ~84 px.
float shoreWobble(float along) {
  return 24.0 * (fbm3(vec2(along / 320.0, 4.2)) - 0.5) + 4.0 * sin(along * 0.0748);
}
float barAt(float along) {
  return uBarAt * (0.88 + 0.24 * gnoise(vec2(along / 300.0, 5.1)));
}
// 1 on the sandbar, 0 in the rip channels that cut it.
float barPresence(float along) {
  return smoothstep(0.32, 0.5, gnoise(vec2(along / 230.0, 9.3)));
}
`;

const SURF = /* glsl */ `
const float WAVE_PERIOD = ${WAVE_PERIOD_S.toFixed(2)};
const float WAVE_K = 0.19;
const float WAVE_S0 = 90.0;
const float SWASH_SHARE = 0.9;
const float RUNUP = ${RUNUP_PX.toFixed(1)};
float waveTravel(float offshore) {
  return WAVE_K * (sqrt(max(offshore, 0.0) + WAVE_S0) - sqrt(WAVE_S0));
}
// px of offshore distance per unit of phase here: the local wavelength.
float waveSpacing(float offshore) {
  return 2.0 * sqrt(max(offshore, 0.0) + WAVE_S0) / WAVE_K;
}
// Crests reach the shore a little later further along it (the swell comes in at an angle), and
// not quite in step.
float waveDrift(float along) {
  return along * 0.001 + 0.22 * (gnoise(vec2(along / 420.0, 2.3)) - 0.5);
}
// Crest n is where the phase is n: it moves shoreward as time runs.
float wavePhase(float offshore, float along, float time) {
  return time / WAVE_PERIOD + waveTravel(offshore) + waveDrift(along);
}
// Bigger waves come in sets; each wave varies along its crest.
float waveSize(float n, float along) {
  float sets = 0.8 + 0.3 * sin(n * 0.83 + 1.0);
  float own = 0.82 + 0.36 * hash12(vec2(n, 3.7));
  float alongShore = 0.8 + 0.4 * gnoise(vec2(along / 260.0, n * 0.61));
  return sets * own * alongShore;
}
float shoreBreakAt(float size) {
  return 34.0 + 30.0 * size;
}
float breaksOnBar(float size, float along) {
  return smoothstep(0.88, 1.0, size) * barPresence(along);
}
// Crest n's roller when the crest is \`crest\` px offshore: big waves break on the bar and roll on
// over the trough, fading; every wave breaks again at the shore. x: foam 0..1; y: 1 at the moment
// of breaking (the lip throws).
vec2 roller(float n, float crest, float along) {
  float size = waveSize(n, along);
  float onBar = breaksOnBar(size, along);
  float pastBar = barAt(along) - crest;
  float barFoam = onBar * smoothstep(-5.0, 5.0, pastBar) * exp(-max(pastBar, 0.0) / 95.0);
  float pastShore = shoreBreakAt(size) - crest;
  float shoreFoam = smoothstep(-3.0, 4.0, pastShore) * (0.55 + 0.45 * min(size, 1.0));
  float fresh = max(onBar * exp(-abs(pastBar) / 14.0), 0.8 * exp(-abs(pastShore) / 9.0));
  return vec2(clamp(max(barFoam, shoreFoam), 0.0, 1.0), fresh);
}
// How steep crest n has grown as it nears its break: 0 far out, ~1 at the break.
float steepness(float n, float crest, float along) {
  float size = waveSize(n, along);
  float bar = barAt(along);
  float toBar = breaksOnBar(size, along) * smoothstep(bar + 70.0, bar + 4.0, crest) * step(bar - 4.0, crest);
  float shore = shoreBreakAt(size);
  float toShore = smoothstep(shore + 55.0, shore + 3.0, crest) * step(shore - 3.0, crest);
  return max(toBar, toShore) * min(size, 1.3);
}
struct Sea {
  float height;  // px above sea level
  float slope;   // d height / d offshore
  float foam;    // roller and trail, 0..1
  float fresh;   // a crest breaking right here
  float glow;    // a steep crest's thin face, lit through
  float cap;     // a whitecap on a big swell's crest, out past the bar
  float behind;  // px seaward of the last crest
};
Sea seaAt(float offshore, float along, float time) {
  float phase = wavePhase(offshore, along, time);
  float n = floor(phase);
  float f = phase - n;
  float spacing = waveSpacing(offshore);
  float behind = f * spacing;
  float ahead = (1.0 - f) * spacing;
  vec2 rollNext = roller(n + 1.0, offshore + ahead, along);
  vec2 rollLast = roller(n, max(offshore - behind, 0.0), along);
  // The foam crest n left here: its roller as it passed this point.
  vec2 leftHere = roller(n, offshore, along);
  float shoal = 1.0 + 1.3 * exp(-offshore / 110.0);
  float steep = steepness(n + 1.0, offshore + ahead, along);
  float frontWidth = spacing * mix(0.13, 0.07, clamp(steep, 0.0, 1.0));
  float backWidth = spacing * 0.3;
  float sizeNext = waveSize(n + 1.0, along);
  float heightNext = 3.8 * sizeNext * shoal * (1.0 - 0.45 * rollNext.x);
  float heightLast = 3.8 * waveSize(n, along) * shoal * (1.0 - 0.45 * rollLast.x);
  float bumpNext = exp(-ahead * ahead / (frontWidth * frontWidth));
  float bumpLast = exp(-behind * behind / (backWidth * backWidth));
  Sea sea;
  sea.height = heightNext * bumpNext + heightLast * bumpLast - 0.5 * shoal;
  sea.slope = heightNext * bumpNext * 2.0 * ahead / (frontWidth * frontWidth)
    - heightLast * bumpLast * 2.0 * behind / (backWidth * backWidth);
  float frontFoam = rollNext.x * (1.0 - smoothstep(0.0, mix(10.0, 26.0, rollNext.x), ahead));
  float backFoam = rollLast.x * (1.0 - smoothstep(0.0, 14.0, behind));
  float trail = leftHere.x * exp(-behind / 60.0);
  sea.foam = clamp(max(max(frontFoam, backFoam), trail * 0.85), 0.0, 1.0);
  sea.fresh = rollNext.y * (1.0 - smoothstep(0.0, 14.0, ahead));
  sea.glow = steep * bumpNext * (1.0 - rollNext.x);
  float capLength = step(0.58, gnoise(vec2(along / 45.0, (n + 1.0) * 1.7)));
  sea.cap = smoothstep(1.05, 1.3, sizeNext) * exp(-ahead * ahead / 25.0) * capLength
    * smoothstep(barAt(along) + 20.0, barAt(along) + 60.0, offshore);
  sea.behind = behind;
  return sea;
}
// Run-up of crest n: bigger waves run further; more in the cusps' bays than on their horns.
float runupOf(float n, float along) {
  return RUNUP * (0.6 + 0.45 * waveSize(n, along)) * (1.0 + 0.16 * sin(along * 0.0748 + 3.14159));
}
// The highest any wave runs here: the sand is damp up to it.
float runupMax(float along) {
  return RUNUP * 1.3 * (1.0 + 0.16 * sin(along * 0.0748 + 3.14159));
}
struct Swash {
  float film;   // the sheet's depth, 0..1
  float foam;   // its foam front, the line it leaves at the top, 0..1
  float gloss;  // glassy sand just drained, 0..1
  float reach;  // px the sheet has run up the beach
};
// Age (share of the swash time) when the sheet's edge passes \`upBeach\` going back down; -1 if the
// sheet never reaches it. The edge runs reach = runup * 4x(1 - x), x = age^0.7: a fast run-up,
// a slow turn, a quickening drain.
float drainedAt(float upBeach, float runup) {
  if (upBeach >= runup) return -1.0;
  return pow(0.5 * (1.0 + sqrt(1.0 - upBeach / runup)), 1.0 / 0.7);
}
Swash swashAt(float upBeach, float along, float time) {
  Swash swash;
  float atShore = time / WAVE_PERIOD + waveDrift(along);
  float n = floor(atShore);
  float age = fract(atShore) / SWASH_SHARE;
  float runup = runupOf(n, along);
  float x = pow(clamp(age, 0.0, 1.0), 0.7);
  float reach = runup * 4.0 * x * (1.0 - x) * step(age, 1.0);
  // A lacy, fingered edge.
  float edge = reach
    + (gnoise(vec2(along / 9.0, n * 3.1)) - 0.5) * 5.0 * smoothstep(0.0, 10.0, reach)
    + (gnoise(vec2(along / 37.0, n * 1.3 + 4.0)) - 0.5) * 9.0 * smoothstep(0.0, 20.0, reach);
  float under = edge - upBeach;
  swash.film = smoothstep(0.0, 1.5, under) * clamp(under / 16.0 + 0.25, 0.0, 1.0) * mix(1.0, 0.55, x);
  // Foam: a bright band at the front while it runs up, thinner as it drains; bubbles in the sheet.
  float front = (1.0 - smoothstep(0.0, mix(14.0, 7.0, x), under)) * smoothstep(-1.0, 0.5, under);
  float sheet = smoothstep(0.0, 1.0, under) * exp(-under / 22.0) * 0.6;
  swash.foam = max(front * mix(1.0, 0.6, x), sheet * (1.0 - 0.5 * x));
  // The line it leaves at the top, scalloped, fading over two seconds.
  float sinceTop = (age - pow(0.5, 1.0 / 0.7)) * SWASH_SHARE * WAVE_PERIOD;
  float mark = runup + (gnoise(vec2(along / 11.0, n * 2.3)) - 0.5) * 4.0;
  float line = 1.0 - smoothstep(0.0, 2.5, abs(upBeach - mark));
  swash.foam = max(swash.foam, line * step(0.0, sinceTop) * exp(-sinceTop / 1.8) * 0.85);
  // Drained sand stays glassy for a moment; before this sheet arrives, the last one's still is.
  float leftAt = drainedAt(upBeach, runup);
  float since = 100.0;
  if (leftAt >= 0.0 && age >= leftAt) {
    since = (age - leftAt) * SWASH_SHARE * WAVE_PERIOD;
  } else if (under < 0.0) {
    float leftLast = drainedAt(upBeach, runupOf(n - 1.0, along));
    if (leftLast >= 0.0) since = (age + 1.0 / SWASH_SHARE - leftLast) * SWASH_SHARE * WAVE_PERIOD;
  }
  swash.gloss = under < 0.0 ? exp(-since / 2.2) : 0.0;
  swash.reach = reach;
  return swash;
}
`;

const PALETTE = /* glsl */ `
// Linear colours before tone mapping (Neutral compresses above ~0.76 and takes ~0.04 off dark ones).
const vec3 SAND_DRY = vec3(0.96, 0.7, 0.4);
const vec3 SAND_WET = vec3(0.5, 0.31, 0.14);
// Design 084: the three zones' blues (the audit's, checked against the card: #1fa8ce, #59bedd).
const vec3 ZONE_SHALLOW = ${glslColour('#6cd3e8')};
const vec3 ZONE_DEEP = ${glslColour('#2a6fd6')};
const vec3 SKY_REFLECT = ${glslColour('#cfeaf6')};
const vec3 SKY_LIGHT = vec3(0.36, 0.4, 0.5);
const vec3 SUN_LIGHT = vec3(0.86, 0.78, 0.64);
// The sea's bands, authored as they show on screen (Pokémon's clear turquoise shallows, deep blue out).
const vec3 SEA_SHALLOW = ${glslColour('#86dbe6')};
const vec3 FOAM_LIT = vec3(0.95, 0.97, 0.98);
`;

const BEACH_UNIFORMS = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform sampler2D uLight;
uniform vec2 uTexel;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uEye;
`;

const ROCK_UNIFORMS = /* glsl */ `
uniform vec4 uRocks[${MAX_ROCKS}];
`;

/**
 * Bake 1: the ground. The beach face rises from the waterline to a berm and soft dunes behind; out
 * to sea the floor falls away past a trough to the bar, then deep. (The rocks are the kit's.)
 */
export const BEACH_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${SHORE}
float seaDepth(float offshore, float along) {
  float depth = 0.08 * offshore + 24.0 * (1.0 - exp(-offshore / 140.0));
  float fromBar = (offshore - barAt(along)) / 40.0;
  return depth - 15.0 * barPresence(along) * exp(-fromBar * fromBar);
}
float beachHeight(float upBeach, vec2 p) {
  float face = 15.0 * (1.0 - exp(-upBeach / 70.0)) + 0.035 * upBeach;
  float dunes = (fbm3(p / 230.0 + 3.3) - 0.45) * 22.0 * smoothstep(110.0, 260.0, upBeach);
  float hummocks = (gnoise(p / 60.0 + 1.1) - 0.5) * 4.0 * smoothstep(60.0, 140.0, upBeach);
  return face + dunes + hummocks;
}
void main() {
  vec2 p = uMin + vUv * uSize;
  vec2 frame = shoreFrame(p);
  float offshore = frame.y + shoreWobble(frame.x);
  float ground = offshore > 0.0 ? -seaDepth(offshore, frame.x) : beachHeight(-offshore, p);
  gl_FragColor = vec4(ground, offshore, 0.0, -1.0);
}
`;

const GROW = /* glsl */ `
// The place rises as the reveal passes (as Scorched Earth's terrain) and sinks as it leaves.
float growthAt(vec2 p) {
  float rise = 1.0 - smoothstep(revealFront() - 0.12, revealFront(), revealReach(p));
  return rise * rise * (3.0 - 2.0 * rise) * exitKeep(p);
}
float edgeDistance(vec2 uv) {
  vec2 fromEdge = min(uv, 1.0 - uv) * uSize;
  return min(fromEdge.x, fromEdge.y);
}
`;

export const SAND_VERTEX = /* glsl */ `
${BEACH_UNIFORMS}
${NOISE}
${REVEAL}
${GROW}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vGrowth;
void main() {
  vec2 p = position.xy;
  vec2 uv = (p - uMin) / uSize;
  float growth = growthAt(p);
  float height = texture2D(uField, uv).r * growth;
  // Sand meets the cloth along the table edge; the sea floor needs no skirt (the sea covers it).
  height = max(height, 0.0) * smoothstep(0.0, 14.0, edgeDistance(uv)) + min(height, 0.0);
  vPos = p;
  vUv = uv;
  vHeight = height;
  vGrowth = growth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, height, 1.0);
}
`;

const SHADING = /* glsl */ `
// Sun and sky on a matte surface; shade 0..1 is the sun's share (cast shadows).
vec3 lit(vec3 albedo, vec3 n, float shade, float occlusion) {
  return albedo * (SKY_LIGHT * mix(0.55, 1.0, occlusion) + SUN_LIGHT * max(dot(n, normalize(uSun)), 0.0) * shade);
}
vec3 bakedNormal(vec4 light, float growth) {
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  return normalize(vec3(nxy / nz * growth, 1.0));
}
// The reveal's edge (and the exit's): a line of surf foam washing the place in.
float revealRim(vec2 p) {
  float front = revealFront();
  float rim = smoothstep(front - 0.035, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  float gone = uExit * 1.1;
  return max(rim, (1.0 - smoothstep(gone, gone + 0.04, fbm3(p / 110.0 + 5.0))) * step(0.001, uExit));
}
`;

/** The beach: warm dry sand, darker wet sand along the water, the swash with its crisp foam front. */
export const SAND_FRAGMENT = /* glsl */ `
${BEACH_UNIFORMS}
${NOISE}
${FILTERING}
${FOOTPRINTS}
${REVEAL}
${SAND}
${LIGHT_MOTION}
${SHORE}
${SURF}
${PALETTE}
${SHADING}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  filterPixel = pixelSize(p);
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float upBeach = -field.g;
  float along = shoreFrame(p).x;
  Swash swash = swashAt(upBeach, along, uTime);
  float top = runupMax(along);
  // Wet up to the highest run-up, the sheet itself wetter; broad soft dunes of paler sand behind.
  float damp = 1.0 - smoothstep(0.86, 1.0, upBeach / top);
  float wet = max(damp * 0.7, step(0.02, swash.film) * 0.85);
  vec3 sand = bdspSand(p, mix(SAND_DRY, SAND_DRY * vec3(1.05, 0.96, 0.86), smoothstep(0.35, 0.65, fbm3(p / 420.0 + 2.0))), fieldCalm(p, 110.0));
  vec3 col = lit(mix(sand, SAND_WET, wet), bakedNormal(light, vGrowth), light.a, light.b);
  // Design 084: the wet band along the water mirrors the sky, glassiest just above the waterline;
  // a soft tide line of darker sand and dried foam marks the highest run-up.
  float mirrorBand = (1.0 - smoothstep(0.0, top * 0.75, upBeach)) * damp;
  col = mix(col, col * 0.75 + SKY_REFLECT * 0.4, mirrorBand * 0.55 + swash.gloss * 0.3);
  float tide = exp(-pow((upBeach - top * 1.02) / 5.0, 2.0)) * patternFade(filterPixel, 10.0);
  col = mix(col, col * 0.82 + FOAM_LIT * 0.06, tide * 0.7);
  // The sheet: a thin clear tint of the shallows; its front a crisp white line of foam.
  col = mix(col, mix(col, SEA_SHALLOW, 0.45), smoothstep(0.0, 0.3, swash.film));
  col = mix(col, FOAM_LIT, smoothstep(0.45, 0.6, swash.foam));
  // Design 083: the soft shadows of slow clouds drifting over the sand, none near the cards.
  col *= 1.0 - 0.16 * cloudShade(p, uTime, 420.0) * smoothstep(40.0, 160.0, length(max(max(uFootprintBox.xy - p, p - uFootprintBox.zw), 0.0)));
  vec2 edgeUv = min(vUv, 1.0 - vUv);
  col *= mix(0.72, 1.0, smoothstep(0.0, 0.04, min(edgeUv.x, edgeUv.y)));
  col = mix(col, FOAM_LIT, revealRim(p) * 0.85);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const SEA_VERTEX = /* glsl */ `
${BEACH_UNIFORMS}
${NOISE}
${REVEAL}
${GROW}
${SHORE}
${SURF}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vGrowth;
void main() {
  vec2 p = position.xy;
  vec2 uv = (p - uMin) / uSize;
  float offshore = texture2D(uField, uv).g;
  float growth = growthAt(p);
  float height = 0.0;
  if (offshore > -4.0) {
    Sea sea = seaAt(offshore, shoreFrame(p).x, uTime);
    // Calm at the waterline (the swash takes over there) and along the table edge.
    height = sea.height * smoothstep(0.0, 24.0, offshore) * smoothstep(0.0, 20.0, edgeDistance(uv)) * growth;
  }
  vPos = p;
  vUv = uv;
  vHeight = height;
  vGrowth = growth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, height, 1.0);
}
`;

/**
 * The sea: bands of colour by depth, the swells' backs a shade darker, BDSP's ribbons of sky light
 * and slow sparkles over it, crisp white foam.
 */
export const SEA_FRAGMENT = /* glsl */ `
${BEACH_UNIFORMS}
${NOISE}
${FILTERING}
${FOOTPRINTS}
${REVEAL}
${WATER}
${SHORE}
${SURF}
${PALETTE}
${SHADING}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vGrowth;
${ROCK_UNIFORMS}
// Foam where the sea washes round a rock: a thin collar at rest, thrown wider as a crest passes
// (surge 0..1).
float rockWash(vec2 p, float surge) {
  float ring = 0.0;
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    vec4 rock = uRocks[i];
    if (rock.z <= 0.0) continue;
    ring = max(ring, 1.0 - smoothstep(0.0, 3.0 + 10.0 * surge, distance(p, rock.xy) - rock.z * 1.15));
  }
  return ring * (0.55 + 0.45 * surge);
}
void main() {
  vec2 p = vPos;
  filterPixel = pixelSize(p);
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  float ground = field.r * vGrowth;
  float offshore = field.g;
  if (ground > vHeight + 0.35) discard;
  float along = shoreFrame(p).x;
  Sea sea = seaAt(max(offshore, 0.0), along, uTime);
  vec2 edgeUv = min(vUv, 1.0 - vUv);
  float calm = smoothstep(0.0, 24.0, offshore) * smoothstep(0.0, 0.02, min(edgeUv.x, edgeUv.y));
  float depth = max(vHeight - ground, 0.0);
  float quiet = (1.0 - 0.8 * fieldCalm(p, 110.0)) * calm;
  // Design 084: three zones on the shared water body: the sand shows through the turquoise shallows
  // (a broad band, the card's), deep blue past them; its sky band and streaks over the open water,
  // sparkles only out in the deep.
  float zone = 0.5 * smoothstep(0.0, 14.0, depth) + 0.5 * smoothstep(18.0, 34.0, depth);
  vec3 col = waterBody(ZONE_DEEP, ZONE_SHALLOW, SAND_WET * 1.25, zone, p, uTime * mix(0.4, 1.0, quiet));
  // A swell's face toward the shore a shade lighter, its back a shade darker; a steep crest glows.
  col *= 1.0 + 0.18 * clamp(sea.slope * 2.5, -1.0, 1.0) * calm;
  col += vec3(0.04, 0.24, 0.22) * sea.glow * 0.6;
  // Foam: three bands rolling in parallel to the shore over the shallows (design 084), the rollers
  // and fresh breaks as crisp white bands, a collar round each rock, and a thin white line where the
  // water meets the sand.
  float bands = foamBands(offshore, p, uTime, 3.0, 38.0) * smoothstep(150.0, 70.0, offshore) * quiet;
  float amount = max(max(max(sea.foam, sea.fresh), sea.cap * 0.55) * calm, bands);
  amount = max(amount, rockWash(p, smoothstep(0.5, 3.0, sea.height)));
  float foam = smoothstep(0.42, 0.56, amount);
  foam = max(foam, (1.0 - smoothstep(0.6, 2.4, depth)) * 0.9);
  col = mix(col, FOAM_LIT, foam);
  col *= mix(0.72, 1.0, smoothstep(0.0, 0.04, min(edgeUv.x, edgeUv.y)));
  col = mix(col, FOAM_LIT, revealRim(p) * 0.85);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

const ROCK = Object.freeze({ body: '#a68a6c', light: '#cdb391', dark: '#77624f' });
const PALM = Object.freeze({ frond: '#4caf4f', frondLight: '#7ccb5c', trunk: '#c29a63', trunkDark: '#97723f', coconut: '#7a5232' });
const DUNE_GRASS = Object.freeze({ grass: '#6f9a3d', tip: '#c3c56b' });
const PEBBLE = Object.freeze({ body: '#b8a48c', light: '#e2d4bc', dark: '#86735e' });

/**
 * The beach's solids, the kit's (design 081): palms where the layout stands them, each rock cluster
 * a big boulder with three or four smaller ones heaped round it (design 084: a lumpy cluster, as the
 * card's; out in the sea they stand at sea level, sunk a little, so they break the surface), the
 * dressing on the sand.
 */
export function beachProps({ shore, rocks, palms, dressing }) {
  const props = createPropBuilder();
  for (const palm of palms) {
    placeAsset(props, 'palm', { x: palm.x, y: palm.y, height: palm.height, lean: palm.lean, leanYaw: palm.leanAngle, fronds: 8, seed: palm.seed * 1013, colors: PALM });
  }
  rocks.forEach((rock, i) => {
    const turn = rock.seed * 6.28;
    const parts = [
      [0, 0, rock.r * 1.05],
      [Math.cos(turn) * rock.r * 1.1, Math.sin(turn) * rock.r * 1.1, rock.r * 0.66],
      [Math.cos(turn + 1.3) * rock.r * 0.95, Math.sin(turn + 1.3) * rock.r * 0.95, rock.r * 0.5],
      [Math.cos(turn + 2.6) * rock.r * 1.2, Math.sin(turn + 2.6) * rock.r * 1.2, rock.r * 0.42],
      [Math.cos(turn + 4.1) * rock.r * 1.05, Math.sin(turn + 4.1) * rock.r * 1.05, rock.r * 0.34],
    ];
    parts.forEach(([dx, dy, size], k) => {
      const x = rock.x + dx;
      const y = rock.y + dy;
      // Out in the sea a rock stands from sea level (its foot sunk a little), so it breaks the surface.
      const atSea = shore ? shoreFrame(shore, x, y).offshore > 0 : false;
      const sea = atSea ? { ground: false, z: -0.3 * size } : {};
      placeAsset(props, 'boulder', { x, y, size, depth: 0.8, seed: i * 17 + k * 5 + 3, yaw: turn + k, colors: ROCK, ...sea });
    });
  });
  for (const find of dressing?.finds ?? []) {
    const colors = find.kind === 'starfish' ? { body: find.warm ? '#f2834a' : '#ef6f8e' } : { body: find.warm ? '#f8e0cf' : '#f6d2dc' };
    placeAsset(props, find.kind, { x: find.x, y: find.y, size: find.size, seed: find.seed * 997, colors });
  }
  for (const set of dressing?.sets ?? []) {
    placeAsset(props, 'towel', { x: set.towel.x, y: set.towel.y, size: set.towel.size, yaw: set.towel.yaw, stripes: set.towel.stripes });
    placeAsset(props, 'parasol', { x: set.x, y: set.y, size: set.size, height: set.height, table: false, stripes: set.stripes, colors: { pole: '#f6f4ee' } });
    const extra = set.extra;
    if (extra.kind === 'beachBall') placeAsset(props, 'beachBall', { x: extra.x, y: extra.y, size: extra.size });
    else placeAsset(props, 'surfboard', { x: extra.x, y: extra.y, size: extra.size, yaw: extra.yaw });
  }
  for (const clump of dressing?.grass ?? []) {
    placeAsset(props, 'tallGrass', { x: clump.x, y: clump.y, size: clump.size, blade: clump.blade, seed: clump.seed * 991, colors: DUNE_GRASS });
  }
  for (const pebble of dressing?.pebbles ?? []) {
    placeAsset(props, 'boulder', { x: pebble.x, y: pebble.y, size: pebble.size, depth: 0.7, seed: pebble.seed * 977, yaw: pebble.seed * 6.28, colors: PEBBLE });
  }
  return props;
}

/**
 * Surfing Beach: the sand, the sea sheet and the kit's solids (beachProps), at the spots
 * stadium-env-beach-layout.mjs `beachSpots` picks.
 */
export function surfingBeachBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uShoreA: { value: new three.Vector2() },
    uShoreB: { value: new three.Vector2() },
    uShoreBend: { value: 0 },
    uBarAt: { value: 160 },
    uRocks: { value: Array.from({ length: MAX_ROCKS }, () => new three.Vector4()) },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    bakeField: make(FULLSCREEN_VERTEX, BEACH_FIELD_FRAGMENT, bakeOptions),
    sand: make(SAND_VERTEX, SAND_FRAGMENT),
    sea: make(SEA_VERTEX, SEA_FRAGMENT),
  };
  const kit = createKitProps({ three, material, own, mood: 'day', reveal: 'vec3(0.95, 0.97, 0.98)', ground: true });
  const sand = new three.Mesh(new three.BufferGeometry(), materials.sand);
  const sea = new three.Mesh(new three.BufferGeometry(), materials.sea);
  // The sand first, so the sea under the beach fails the depth test early.
  sea.renderOrder = 1;

  const setSpots = ({ shore, barAt, rocks }) => {
    own.uShoreA.value.set(shore.a.x, shore.a.y);
    own.uShoreB.value.set(shore.b.x, shore.b.y);
    own.uShoreBend.value = shore.bend;
    own.uBarAt.value = barAt;
    own.uRocks.value.forEach((rock, i) => rock.set(rocks[i]?.x ?? 0, rocks[i]?.y ?? 0, rocks[i]?.r ?? 0, rocks[i]?.seed ?? 0));
  };

  return {
    objects: [sand, sea, ...kit.objects],
    materials: [...Object.values(materials), ...kit.materials],
    bakeField: materials.bakeField,
    spots: (layout) => beachSpots(layout, environmentFootprints(layout)),
    apply(spots, bounds) {
      if (spots) setSpots(spots);
      kit.set(spots ? beachProps(spots) : null);
      replaceGeometry(sand, terrainGrid(bounds));
      replaceGeometry(
        sea,
        new three.PlaneGeometry(
          bounds.w,
          bounds.h,
          Math.max(1, Math.round(bounds.w / SEA_SPACING_PX)),
          Math.max(1, Math.round(bounds.h / SEA_SPACING_PX))
        ).translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, 0)
      );
    },
  };
}
