// Design 077 (prototype): Surfing Beach (customhb-209) as a procedural three.js place, after its card
// art (Ayumi Odashima, MEG 129): a sunny bay seen from above, the sea in the far-left corner rolling
// in to golden sand, rocks at the waterline, palm trees on the dry sand. The far-left is the sun's
// side (the board's own light), so the sea glints there.
// What makes it read as a real shore:
// - Depth: the seabed falls away from the waterline with a sandbar offshore, cut by rip channels.
//   The shallows are clear (sand, ripple marks and caustics show through, bent by the surface),
//   turquoise over the bar, deep blue past it.
// - Waves: swell comes in at a slight angle, slows and bunches up in shallow water (its phase grows
//   with the square root of the distance out), steepens with a sunlit turquoise face, breaks: big
//   waves on the bar, every wave at the shore. Broken crests roll in white, trailing lacy foam.
// - Swash: each bore runs up the beach as a thin sheet with a fingered foam front, stops, and drains
//   back faster than it came; the sand it leaves is glassy, then dull wet, dry above the highest
//   run-up, where a wrack line of seaweed lies.
// Two stages, as Scorched Earth: BEACH_FIELD bakes the ground once per layout (R height px, sea
// level 0; G signed px from the mean waterline, + seaward; B rock height px; A rock id or -1) and the
// shared BAKE_LIGHT turns it into normals, occlusion and sun shadow. Per frame SAND draws the
// beach, rocks and swash; SEA one displaced sheet at sea level; PALM the trees, and PALM_SHADOW their
// shadows into a table-space target the sand reads.
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
  TABLE_UNIFORMS,
} from './stadium-environment-glsl.mjs';
import { environmentFootprints } from './stadium-environment-layout.mjs';
import { beachSpots } from './stadium-env-beach-layout.mjs';
import { palmGeometry } from './stadium-env-palms.mjs';

export const MAX_ROCKS = 4;
export const WAVE_PERIOD_S = 6.5;
/** Run-up of an average wave, px up the beach from the mean waterline. */
export const RUNUP_PX = 56;
/** Palm shadow target, texels per table px. */
export const PALM_SHADOW_TEXELS_PER_PX = 0.5;
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
  float foam;    // roller and trail, 0..1, before the lace
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
  float foam;   // its foam front, the line it leaves at the top, 0..1 before the lace
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

const CELLS = /* glsl */ `
// Distance (cell units) from x to the border between its two nearest cell points (F2 - F1); the
// points wander on circles as time runs.
float cellBorder(vec2 x, float time) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 h = hash22(n + g);
      vec2 r = g + 0.5 + 0.38 * sin(time + 6.2831853 * h) - f;
      float d = dot(r, r);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return sqrt(f2) - sqrt(f1);
}
// Foam as bubble rafts seen from above: white with round holes of many sizes. The holes grow as
// the foam thins, until only threads remain between them; then the threads break up in patches.
float foamLace(vec2 q, float amount) {
  if (amount < 0.02) return 0.0;
  vec2 warp = (vec2(gnoise(q / 23.0), gnoise(q / 23.0 + 5.3)) - 0.5) * 9.0;
  vec2 x = (q + warp) / 8.0;
  vec2 cell = floor(x);
  vec2 f = fract(x);
  float open = 1.25 - amount;
  float hole = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      float radius = (0.3 + 0.42 * hash12(cell + g + 17.0)) * open;
      float d = length(g + 0.15 + 0.7 * hash22(cell + g) - f);
      hole = max(hole, 1.0 - smoothstep(radius - 0.1, radius, d));
    }
  }
  float patches = smoothstep(0.08, 0.16, amount + 0.4 * (gnoise(q / 34.0 + 3.0) - 0.5));
  return (1.0 - hole) * patches;
}
// Old foam adrift between the breakers, seen from above: thin marbled threads round wide open cells,
// drawn out along the shore (q.x), broken here and there, gathered in drifts with clear water between.
float foamThreads(vec2 q, float time) {
  float drift = smoothstep(0.45, 0.72, fbm3(q / vec2(150.0, 60.0)));
  if (drift < 0.01) return 0.0;
  vec2 warp = (vec2(gnoise(q / 41.0), gnoise(q / 41.0 + 5.7)) - 0.5) * 18.0;
  warp += (vec2(gnoise(q / 11.0 + 2.1), gnoise(q / 11.0 + 7.9)) - 0.5) * 7.0;
  float border = cellBorder((q + warp) / vec2(44.0, 22.0), time * 0.15);
  float width = mix(0.04, 0.1, gnoise(q / 23.0 + 1.3)) * drift;
  float broken = smoothstep(0.3, 0.45, gnoise(q / 15.0 + 8.2));
  return (1.0 - smoothstep(width * 0.5, width, border)) * broken * drift;
}
// Caustics on the sea floor: two drifting nets of light.
float caustics(vec2 q, float time) {
  float a = 1.0 - smoothstep(0.0, 0.16, cellBorder(q / 24.0 + vec2(0.11, 0.07) * time, time * 0.9));
  float b = 1.0 - smoothstep(0.0, 0.2, cellBorder(q / 17.0 - vec2(0.08, -0.1) * time + 3.7, time * 1.2));
  return a * a * 0.65 + b * b * 0.45;
}
`;

const PALETTE = /* glsl */ `
// Linear colours before tone mapping (Neutral compresses above ~0.76 and takes ~0.04 off dark ones).
const vec3 SAND_DRY = vec3(0.86, 0.64, 0.38);
const vec3 SAND_WET = vec3(0.52, 0.29, 0.12);
const vec3 SAND_UNDER = vec3(0.68, 0.52, 0.31);
const vec3 SKY_LIGHT = vec3(0.36, 0.4, 0.5);
const vec3 SUN_LIGHT = vec3(0.86, 0.78, 0.64);
const vec3 SEA_SHALLOW = vec3(0.2, 0.72, 0.66);
const vec3 SEA_TURQUOISE = vec3(0.03, 0.46, 0.52);
const vec3 SEA_TEAL = vec3(0.01, 0.2, 0.4);
const vec3 SEA_DEEP = vec3(0.008, 0.075, 0.28);
const vec3 FOAM_LIT = vec3(0.95, 0.97, 0.98);
const vec3 FOAM_SHADE = vec3(0.55, 0.68, 0.78);
const vec3 ROCK_LIGHT = vec3(0.52, 0.36, 0.22);
const vec3 ROCK_MID = vec3(0.32, 0.21, 0.13);
const vec3 ROCK_DARK = vec3(0.13, 0.085, 0.07);
vec3 skyColor(vec3 dir) {
  return mix(vec3(0.7, 0.82, 0.93), vec3(0.2, 0.45, 0.86), pow(clamp(dir.z, 0.0, 1.0), 0.6));
}
`;

const BEACH_UNIFORMS = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform sampler2D uLight;
uniform sampler2D uPalmShadow;
uniform vec2 uTexel;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uEye;
`;

const ROCK_UNIFORMS = /* glsl */ `
uniform vec4 uRocks[${MAX_ROCKS}];
`;

const ROCKS = /* glsl */ `
${ROCK_UNIFORMS}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// A cluster of three boulders (centre, radius, seed), chunky with broad facets like the card's rocks:
// x height px over the ground, y the boulder's id. \`lift\` (the water's depth there) stands a rock
// out in the sea on a steep base, so it breaks the surface as a whole boulder.
vec2 rockCluster(vec2 p, vec4 rock, float lift) {
  vec2 best = vec2(0.0, -1.0);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 jitter = hash22(vec2(rock.w * 7.3, fk * 3.1)) - 0.5;
    vec2 centre = rock.xy + (k == 0 ? vec2(0.0) : jitter * rock.z * 1.9);
    float radius = rock.z * (k == 0 ? 1.0 : 0.42 + 0.3 * hash12(vec2(fk, rock.w)));
    float angle = hash12(vec2(rock.w, fk + 9.0)) * 6.2831853;
    mat2 turn = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
    vec2 q = turn * (p - centre) / (radius * vec2(1.0, 0.74));
    // A rounded dome cut by six broad, soft-edged facets.
    float top = sqrt(max(1.0 - dot(q, q), 0.0)) * 1.08;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0472 + (hash12(vec2(rock.w + fk, float(i))) - 0.5) * 0.7;
      float lean = 1.0 + 0.35 * hash12(vec2(float(i), rock.w * 3.0 + fk));
      top = smin(top, 1.1 - lean * dot(q, vec2(cos(a), sin(a))), 0.2);
    }
    float h = max(top, 0.0) * radius * 0.85 + lift * smoothstep(0.0, 0.3, top);
    if (h > best.x) best = vec2(h, rock.w + fk * 0.1 + 0.05);
  }
  return best;
}
`;

/**
 * Bake 1: the ground. The beach face rises from the waterline to a berm and soft dunes behind; out
 * to sea the floor falls away past a trough to the bar, then deep. Rock clusters sit on top.
 */
export const BEACH_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${SHORE}
${ROCKS}
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
  vec2 rock = vec2(0.0, -1.0);
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    if (uRocks[i].z <= 0.0) continue;
    vec2 at = shoreFrame(uRocks[i].xy);
    float offshoreAt = at.y + shoreWobble(at.x);
    vec2 cluster = rockCluster(p, uRocks[i], offshoreAt > 0.0 ? seaDepth(offshoreAt, at.x) : 0.0);
    if (cluster.x > rock.x) rock = cluster;
  }
  gl_FragColor = vec4(ground + rock.x, offshore, rock.x, rock.x > 0.6 ? rock.y : -1.0);
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

const FINDS = /* glsl */ `
// Signed distance to a five-armed star (Inigo Quilez's sdStar5): arm length r, inner share.
float starDistance(vec2 p, float r, float inner) {
  const vec2 k1 = vec2(0.809016994, -0.587785252);
  const vec2 k2 = vec2(-0.809016994, -0.587785252);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = inner * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
mat2 rotation(float angle) {
  return mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
}
float upBeachAt(vec2 q) {
  return -texture2D(uField, (q - uMin) / uSize).g;
}
// Things on the sand: starfish and shells washed up around the wet line, tufts of beach grass at the
// back of the beach. rgb colour, a coverage; shadow is theirs, falling away from the sun.
vec4 beachFinds(vec2 p, float top, out float shadow) {
  vec4 found = vec4(0.0);
  shadow = 0.0;
  vec2 away = normalize(uSun.xy) * 1.8;
  vec2 starCell = floor(p / 150.0);
  if (hash12(starCell + 7.0) < 0.4) {
    vec2 centre = (starCell + 0.2 + 0.6 * hash22(starCell + 41.0)) * 150.0;
    float up = upBeachAt(centre);
    if (up > top * 0.75 && up < top * 2.2) {
      mat2 spin = rotation(hash12(starCell + 3.0) * 6.2831853);
      float radius = 6.0 + 3.0 * hash12(starCell + 5.0);
      float d = starDistance(spin * (p - centre), radius, 0.42) - 1.3;
      vec3 colour = mix(vec3(0.95, 0.36, 0.12), vec3(0.88, 0.22, 0.32), hash12(starCell + 9.0));
      colour = mix(colour * 0.72, colour * 1.12, smoothstep(0.0, radius * 0.5, -d));
      colour = mix(colour, vec3(1.0, 0.85, 0.6), step(0.9, hash12(floor(p * 0.9))) * step(d, -1.0) * 0.6);
      found = vec4(colour, 1.0 - smoothstep(-0.6, 0.4, d));
      shadow = 1.0 - smoothstep(-1.0, 1.4, starDistance(spin * (p + away - centre), radius, 0.42) - 1.3);
    }
  }
  vec2 shellCell = floor(p / 80.0);
  if (hash12(shellCell + 13.0) < 0.45) {
    vec2 centre = (shellCell + 0.15 + 0.7 * hash22(shellCell + 23.0)) * 80.0;
    float up = upBeachAt(centre);
    if (up > top * 0.9 && up < top * 2.6) {
      mat2 spin = rotation(hash12(shellCell + 31.0) * 6.2831853);
      float radius = 3.2 + 2.2 * hash12(shellCell + 37.0);
      vec2 q = spin * (p - centre);
      vec2 qs = spin * (p + away * 0.7 - centre);
      // A scallop: a ribbed fan on its hinge.
      float d = max(length(q * vec2(1.0, 1.15)) - radius, -q.y - radius * 0.35);
      float ds = max(length(qs * vec2(1.0, 1.15)) - radius, -qs.y - radius * 0.35);
      float ribs = 0.86 + 0.14 * cos(atan(q.x, q.y + radius * 0.35) * 18.0);
      vec3 colour = mix(vec3(0.96, 0.9, 0.82), vec3(0.95, 0.66, 0.6), hash12(shellCell + 43.0)) * ribs;
      float cover = 1.0 - smoothstep(-0.5, 0.5, d);
      found = mix(found, vec4(colour, 1.0), cover);
      shadow = max(shadow, (1.0 - smoothstep(-0.8, 1.0, ds)) * 0.8);
    }
  }
  // Beach grass grows in clumps along the back of the beach, by the table's edges.
  vec2 tuftCell = floor(p / 46.0);
  vec2 centre = (tuftCell + 0.2 + 0.6 * hash22(tuftCell + 57.0)) * 46.0;
  vec2 inside = min(centre - uMin, uMin + uSize - centre);
  float byEdge = 1.0 - smoothstep(90.0, 170.0, min(inside.x, inside.y));
  float clumps = smoothstep(0.5, 0.7, gnoise(tuftCell / 3.0 + 8.0)) * byEdge;
  if (hash12(tuftCell + 51.0) < clumps * 0.8) {
    if (upBeachAt(centre) > top + 170.0) {
      // Blades fan out from the root and curl a little; their tips pale in the sun.
      vec2 q = p - centre;
      float r = length(q);
      float share = (atan(q.y, q.x) + 3.14159265) / 6.2831853 * 9.0 + r * 0.03;
      float bladeLength = 9.0 + 10.0 * hash12(tuftCell + floor(share) * 1.7);
      float cover = step(abs(fract(share) - 0.5), 0.34 * (1.0 - r / bladeLength)) * step(r, bladeLength);
      vec3 colour = mix(vec3(0.2, 0.36, 0.1), vec3(0.62, 0.68, 0.3), r / bladeLength);
      found = mix(found, vec4(colour, 1.0), cover);
      vec2 qs = q + away * 3.0;
      float rs = length(qs);
      float shareS = (atan(qs.y, qs.x) + 3.14159265) / 6.2831853 * 9.0 + rs * 0.03;
      float lengthS = 9.0 + 10.0 * hash12(tuftCell + floor(shareS) * 1.7);
      shadow = max(shadow, step(abs(fract(shareS) - 0.5), 0.4 * (1.0 - rs / lengthS)) * step(rs, lengthS) * 0.7);
    }
  }
  return found;
}
`;

const SHADING = /* glsl */ `
float palmShadowAt(vec2 uv) {
  vec2 t = 2.5 / uSize;
  float s = texture2D(uPalmShadow, uv).r * 0.4;
  s += texture2D(uPalmShadow, uv + vec2(t.x, 0.0)).r * 0.15;
  s += texture2D(uPalmShadow, uv - vec2(t.x, 0.0)).r * 0.15;
  s += texture2D(uPalmShadow, uv + vec2(0.0, t.y)).r * 0.15;
  s += texture2D(uPalmShadow, uv - vec2(0.0, t.y)).r * 0.15;
  return s;
}
// Sun and sky on a matte surface; shade 0..1 is the sun's share (cast shadows).
vec3 lit(vec3 albedo, vec3 n, float shade, float occlusion) {
  return albedo * (SKY_LIGHT * mix(0.55, 1.0, occlusion) + SUN_LIGHT * max(dot(n, normalize(uSun)), 0.0) * shade);
}
vec3 bakedNormal(vec4 light, float growth) {
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  return normalize(vec3(nxy / nz * growth, 1.0));
}
// Wind ripples on the dry sand: low ridges across the onshore breeze, broken into patches.
vec2 sandRipples(vec2 p, vec2 seaward) {
  float across = dot(p, seaward) + 7.0 * gnoise(p / 40.0) + 3.0 * gnoise(p / 13.0 + 2.0);
  float patches = smoothstep(0.4, 0.75, gnoise(p / 150.0 + 6.0));
  return seaward * cos(across * 0.62) * 0.2 * patches;
}
vec3 rockShading(float id, vec3 n, float shade, float occlusion, float wetBand) {
  float tone = fract(id * 13.7);
  float facing = dot(n, normalize(uSun)) * mix(0.4, 1.0, shade);
  vec3 c = mix(ROCK_DARK, ROCK_MID, smoothstep(0.2, 0.42, facing));
  c = mix(c, ROCK_LIGHT, smoothstep(0.7, 0.86, facing));
  c *= 0.88 + 0.24 * tone;
  // Wet and weedy at the foot, where the swash reaches.
  c = mix(c, c * vec3(0.55, 0.62, 0.5), wetBand);
  return mix(c * 0.6, c, smoothstep(0.25, 0.8, occlusion));
}
`;

/** The beach: dry and wet sand, rocks, the swash with its foam, the palms' shadows. */
export const SAND_FRAGMENT = /* glsl */ `
${BEACH_UNIFORMS}
${NOISE}
${REVEAL}
${SHORE}
${SURF}
${CELLS}
${PALETTE}
${SHADING}
${FINDS}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float offshore = field.g;
  float upBeach = -offshore;
  float rockHeight = field.b;
  float isRock = step(0.0, field.a);
  float along = shoreFrame(p).x;
  vec2 seaward = seawardDirection();
  vec3 sun = normalize(uSun);
  vec3 eye = normalize(uEye - vec3(p, vHeight));
  float shade = light.a * (1.0 - 0.75 * palmShadowAt(vUv));

  Swash swash = swashAt(upBeach, along, uTime);
  float top = runupMax(along);
  float damp = 1.0 - smoothstep(0.93, 1.0, upBeach / top + 0.06 * (gnoise(vec2(along / 30.0, 7.0)) - 0.5));
  float wet = max(damp * 0.72, max(swash.gloss, step(0.02, swash.film)));
  float dry = smoothstep(top, top + 50.0, upBeach);

  vec3 n = bakedNormal(light, vGrowth);
  n = normalize(vec3(n.xy - sandRipples(p, seaward) * dry * (1.0 - isRock), n.z));

  vec3 sand = mix(SAND_DRY, SAND_DRY * vec3(1.05, 0.96, 0.86), smoothstep(0.3, 0.7, fbm3(p / 420.0 + 2.0)));
  sand *= (0.93 + 0.12 * fbm3(p / 210.0)) * (0.97 + 0.06 * hash12(floor(p * 1.5)));
  vec3 albedo = mix(sand, SAND_WET * (0.94 + 0.1 * gnoise(p / 50.0)), wet);
  vec3 col = lit(albedo, n, shade, light.b);
  // Grains of quartz glint in the sun on the dry sand.
  float grain = step(0.985, hash12(floor(p * 1.1))) * dry * shade;
  col += vec3(0.35, 0.32, 0.26) * grain;
  // Starfish, shells and beach grass, out of the swash's reach.
  float findShadow;
  vec4 find = beachFinds(p, top, findShadow);
  float settled = (1.0 - isRock) * (1.0 - step(0.02, swash.film));
  col *= 1.0 - 0.35 * findShadow * settled * shade;
  col = mix(col, lit(find.rgb, vec3(0.0, 0.0, 1.0), shade, 1.0), find.a * settled);

  // Rocks: sculpted brown stone, wet and dark at the foot.
  if (isRock > 0.5) {
    // Wet up to the waves' reach: a little over sea level out in the water, the swash's height on the beach.
    float below = field.r - rockHeight;
    float wetLine = max(6.0, below + 6.0 * (1.0 - smoothstep(0.0, top, upBeach)));
    col = rockShading(field.a, n, shade, light.b, 1.0 - smoothstep(wetLine - 2.0, wetLine + 3.0, field.r));
  }

  // The sheet: a thin tint, then the sky and sun off its surface and off glassy drained sand.
  float film = swash.film * (1.0 - isRock);
  col = mix(col, col * vec3(0.8, 0.93, 0.97) + vec3(0.0, 0.025, 0.035), film);
  float sheen = max(film, swash.gloss * 0.8) * (1.0 - isRock);
  vec3 ripple = vec3((vec2(gnoise(p / 7.0 + uTime * 1.3), gnoise(p / 7.0 + 9.1 - uTime * 1.1)) - 0.5) * 0.18 * film, 1.0);
  vec3 mirror = reflect(-eye, normalize(ripple));
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(normalize(ripple), eye), 0.0), 5.0);
  col = mix(col, mix(skyColor(mirror), vec3(0.85, 0.9, 0.95), 0.5), sheen * clamp(fresnel * 2.5, 0.0, 0.3));
  col += vec3(1.0, 0.95, 0.85) * pow(max(dot(mirror, sun), 0.0), 500.0) * 14.0 * sheen * shade;

  // Foam riding the sheet: the lace moves with its edge.
  float foam = foamLace(vec2(along, upBeach - swash.reach * 0.9), swash.foam) * (1.0 - isRock);
  col = mix(col, mix(FOAM_SHADE, FOAM_LIT, shade), foam);

  // The wrack line: a broken line of dried seaweed above the highest run-up.
  float wrackAt = top * 1.2 + 8.0 * (gnoise(vec2(along / 50.0, 1.0)) - 0.5);
  float clumps = step(0.62, gnoise(vec2(along / 5.0, upBeach / 5.0) + 3.0)) * step(0.45, gnoise(vec2(along / 90.0, 3.0)));
  float wrack = (1.0 - smoothstep(1.5, 3.5, abs(upBeach - wrackAt))) * clumps;
  col = mix(col, vec3(0.2, 0.17, 0.08), wrack * 0.55 * (1.0 - isRock));

  vec2 edgeUv = min(vUv, 1.0 - vUv);
  col *= mix(0.72, 1.0, smoothstep(0.0, 0.04, min(edgeUv.x, edgeUv.y)));

  // The reveal's edge: a line of surf foam washing the place in.
  float front = revealFront();
  float rim = smoothstep(front - 0.035, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  float gone = uExit * 1.1;
  rim = max(rim, (1.0 - smoothstep(gone, gone + 0.04, fbm3(p / 110.0 + 5.0))) * step(0.001, uExit));
  col = mix(col, FOAM_LIT, rim * 0.85);

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

/** The sea: depth colour over a refracted, caustic-lit floor; waves, foam, sky and sun off the surface. */
export const SEA_FRAGMENT = /* glsl */ `
${BEACH_UNIFORMS}
${NOISE}
${REVEAL}
${SHORE}
${SURF}
${CELLS}
${PALETTE}
${SHADING}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vGrowth;
${ROCK_UNIFORMS}
// Foam where the sea washes round a rock: a thin collar at rest, thrown wide and white as a crest
// passes (surge 0..1).
float rockWash(vec2 p, float surge) {
  float ring = 0.0;
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    vec4 rock = uRocks[i];
    if (rock.z <= 0.0) continue;
    ring = max(ring, 1.0 - smoothstep(0.0, 4.0 + 14.0 * surge, distance(p, rock.xy) - rock.z * 1.2));
  }
  return ring * (0.2 + 0.7 * surge);
}
// Short wind waves on the swell: three trains with their slopes in closed form, plus a little noise.
vec2 chopTrain(vec2 p, float time, vec2 dir, float span, float speed, float slope) {
  float k = 6.2831853 / span;
  return dir * slope * cos(dot(p, dir) * k - time * speed * k);
}
vec2 windChop(vec2 p, float time) {
  vec2 g = chopTrain(p, time, vec2(0.83, 0.55), 31.0, 9.0, 0.035);
  g += chopTrain(p, time, vec2(-0.35, 0.94), 19.0, 7.0, 0.025);
  g += chopTrain(p, time, vec2(0.98, -0.2), 47.0, 12.0, 0.03);
  return g + (vec2(gnoise(p / 13.0 + time * 0.3), gnoise(p / 13.0 + 7.7 - time * 0.3)) - 0.5) * 0.06;
}
vec3 waterBody(float depth) {
  vec3 c = mix(SEA_SHALLOW, SEA_TURQUOISE, smoothstep(3.0, 14.0, depth));
  c = mix(c, SEA_TEAL, smoothstep(12.0, 32.0, depth));
  return mix(c, SEA_DEEP, smoothstep(28.0, 58.0, depth));
}
// The floor where the bent view ray meets it: wet sand with ripple marks, rocks, caustics.
vec3 seabed(vec2 q, float depth) {
  vec2 uv = clamp((q - uMin) / uSize, 0.0, 1.0);
  vec4 floorField = texture2D(uField, uv);
  vec3 sand = SAND_UNDER * (0.92 + 0.14 * gnoise(q / 40.0));
  float marks = sin((floorField.g + 5.0 * gnoise(q / 30.0)) * 0.55);
  sand *= 0.92 + 0.09 * marks * smoothstep(2.0, 10.0, depth);
  vec3 rock = mix(ROCK_MID, vec3(0.16, 0.2, 0.1), 0.5);
  vec3 c = mix(sand, rock, step(0.0, floorField.a));
  float shade = 1.0 - 0.6 * palmShadowAt(uv);
  c *= mix(0.75, 1.0, shade);
  float light = caustics(q, uTime) * smoothstep(0.5, 3.5, depth) * exp(-depth / 18.0);
  return c + vec3(0.9, 0.95, 0.8) * light * 1.3 * shade;
}
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  float ground = field.r * vGrowth;
  float offshore = field.g;
  if (ground > vHeight + 0.35) discard;
  float along = shoreFrame(p).x;
  Sea sea = seaAt(max(offshore, 0.0), along, uTime);
  vec2 seaward = seawardDirection();
  vec3 sun = normalize(uSun);
  vec2 edgeUv = min(vUv, 1.0 - vUv);
  float calm = smoothstep(0.0, 24.0, offshore) * smoothstep(0.0, 0.02, min(edgeUv.x, edgeUv.y));

  vec2 gradient = (sea.slope * seaward * calm + windChop(p, uTime) * mix(0.35, 1.0, calm)) * vGrowth;
  vec3 n = normalize(vec3(-gradient, 1.0));
  vec3 eye = normalize(uEye - vec3(p, vHeight));
  float depth = max(vHeight - ground, 0.0);

  // Looking into the water: the floor through the bent ray, fading into the water's own colour.
  vec3 bent = refract(-eye, n, 0.75);
  vec2 floorPoint = p + bent.xy / max(-bent.z, 0.25) * depth;
  float clarity = exp(-depth / 7.5);
  vec3 col = mix(waterBody(depth), seabed(floorPoint, depth) * vec3(0.66, 0.93, 1.0), clarity);
  // Swell bands: faces turned to the sun catch the light, faces turned away go darker.
  col *= 1.0 + 3.0 * (dot(n, sun) - sun.z) * calm;
  // A steep crest is thin: the sun shines through it, turquoise.
  col += vec3(0.06, 0.45, 0.38) * sea.glow * 0.9;

  // Off the surface: the sky by Fresnel; the sun glitters on ripples a few px across.
  vec3 mirror = reflect(-eye, n);
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, eye), 0.0), 5.0);
  col = mix(col, skyColor(mirror), clamp(fresnel * 2.5, 0.0, 1.0));
  vec2 ripples = (vec2(gnoise(p / 3.6 + uTime * 1.5), gnoise(p / 3.6 + 4.2 - uTime * 1.7)) - 0.5) * 0.3;
  float sunAlign = max(dot(reflect(-eye, normalize(vec3(-gradient - ripples, 1.0))), sun), 0.0);
  // Only along the sun's path (where the swell itself mirrors the sun within ~20 degrees), and only
  // a few ripples at a time twinkle.
  float sunPath = smoothstep(0.92, 0.985, dot(mirror, sun));
  float twinkle = step(0.7, hash12(floor(p / 5.0) + floor(uTime * 4.0) * 7.31));
  float glint = pow(sunAlign, 2000.0) * 10.0 * sunPath * twinkle + pow(max(dot(mirror, sun), 0.0), 200.0) * 0.25;

  // Foam: rollers on broken crests, the lace they trail, the lip's burst; whitecaps out past the bar;
  // a ring round each rock; old foam marbling the surf zone, drifting in and along the shore.
  float amount = max(max(sea.foam, sea.fresh), sea.cap * 0.55) * calm;
  amount = max(amount, rockWash(p, smoothstep(0.5, 3.0, sea.height)));
  vec2 laceAt = vec2(along, offshore + uTime * 3.0 + sea.behind * 0.12);
  float foam = foamLace(laceAt, amount);
  foam = max(foam, sea.fresh * calm * 0.9);
  float surfZone = smoothstep(barAt(along) + 30.0, barAt(along) - 30.0, offshore) * smoothstep(4.0, 30.0, offshore);
  foam = max(foam, foamThreads(vec2(along - uTime * 2.0, offshore + uTime * 3.0), uTime) * surfZone * calm * 0.75);
  float foamShade = 1.0 - 0.6 * palmShadowAt(vUv);
  vec3 foamColor = mix(FOAM_SHADE, FOAM_LIT, smoothstep(-0.1, 0.5, dot(n, sun)) * foamShade);
  col += vec3(1.0, 0.96, 0.88) * glint * (1.0 - foam) * foamShade;
  col = mix(col, foamColor, foam);

  col *= mix(0.72, 1.0, smoothstep(0.0, 0.04, min(edgeUv.x, edgeUv.y)));
  float front = revealFront();
  float rim = smoothstep(front - 0.035, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  float gone = uExit * 1.1;
  rim = max(rim, (1.0 - smoothstep(gone, gone + 0.04, fbm3(p / 110.0 + 5.0))) * step(0.001, uExit));
  col = mix(col, FOAM_LIT, rim * 0.85);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Fronds are feathered: narrow leaflets from the rib out to the edge, slanting toward the tip, each
// tapering to a point; some shorter, a few torn.
const LEAFLETS = /* glsl */ `
float leafletIndex(vec4 part) {
  return part.y * 26.0 - abs(part.z) * 2.6;
}
bool leafletGap(vec4 part, float frond) {
  if (part.x < 0.5 || part.x > 1.5) return false;
  float across = abs(part.z);
  float leaflet = leafletIndex(part);
  float own = fract(sin(floor(leaflet) * 91.7 + frond * 437.1 + sign(part.z) * 3.3) * 43758.5453);
  float width = mix(0.5, 0.8, own) * (1.0 - 0.55 * across);
  float reach = 0.97 - 0.3 * part.y * part.y - 0.4 * step(0.85, own);
  return (across > 0.08 && fract(leaflet) > width) || across > reach;
}
`;

const PALM_COMMON = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uEye;
uniform vec2 uBreeze;
attribute vec4 aTree;
attribute vec4 aPart;
attribute float aFrond;
${NOISE}
${REVEAL}
${GROW}
// A palm vertex in the table frame: its tree stood on the ground, grown in with the reveal, and
// swaying in the sea breeze (fronds most at their tips, the trunk only near its top).
vec3 palmPoint(vec3 local) {
  vec2 base = aTree.xy;
  float ground = texture2D(uField, (base - uMin) / uSize).r;
  float growth = growthAt(base);
  float seed = aTree.z;
  float gust = 0.65 * sin(uTime * 1.05 + seed * 6.0) + 0.35 * sin(uTime * 2.4 + seed * 2.0);
  vec3 swayed = local + vec3(uBreeze, 0.0) * gust * aPart.w * 3.2;
  float frond = step(0.5, aPart.x) * step(aPart.x, 1.5);
  swayed.z += frond * sin(uTime * 3.1 + seed * 4.0 + aPart.y * 4.0) * aPart.w * 1.6;
  return vec3(base, ground * growth) + swayed * growth;
}
`;

export const PALM_VERTEX = /* glsl */ `
${PALM_COMMON}
varying vec3 vNormal;
varying vec3 vWorld;
varying vec4 vPart;
varying float vSeed;
varying float vFrond;
void main() {
  vec3 world = palmPoint(position);
  vNormal = normal;
  vWorld = world;
  vPart = aPart;
  vSeed = aTree.z;
  vFrond = aFrond;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

/** Palms in the painted style: a ringed grey-brown trunk, glossy green fronds lit through by the sun. */
export const PALM_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform vec3 uSun;
uniform vec3 uEye;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec4 vPart;
varying float vSeed;
varying float vFrond;
${NOISE}
${LEAFLETS}
void main() {
  if (leafletGap(vPart, vFrond)) discard;
  vec3 sun = normalize(uSun);
  vec3 eye = normalize(uEye - vWorld);
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float kind = vPart.x;
  float diffuse = max(dot(n, sun), 0.0);
  vec3 col;
  if (kind < 0.5) {
    // Trunk: rings of old leaf scars, darker toward the foot.
    float rings = smoothstep(0.55, 0.9, fract(vPart.y * 26.0 + 0.15 * sin(vPart.z * 6.2831853)));
    vec3 bark = mix(vec3(0.42, 0.33, 0.23), vec3(0.24, 0.17, 0.11), rings);
    bark *= 0.8 + 0.25 * vPart.y;
    col = bark * (vec3(0.4, 0.42, 0.5) + vec3(0.95, 0.85, 0.7) * diffuse);
  } else if (kind < 1.5) {
    float across = abs(vPart.z);
    float upper = step(0.0, n.z);
    vec3 leaf = mix(vec3(0.07, 0.26, 0.08), vec3(0.3, 0.58, 0.1), upper * 0.7 + 0.3);
    leaf *= 0.85 + 0.3 * hash12(vec2(vFrond * 31.0, floor(leafletIndex(vPart))));
    // Old fronds yellow toward their tips; the rib is pale.
    leaf = mix(leaf, vec3(0.5, 0.46, 0.14), smoothstep(0.7, 1.0, vPart.y) * step(0.7, vFrond));
    leaf = mix(leaf, vec3(0.6, 0.6, 0.3), 1.0 - smoothstep(0.03, 0.08, across));
    float through = max(dot(-n, sun), 0.0) * max(dot(eye, -sun) * 0.5 + 0.5, 0.0);
    col = leaf * (vec3(0.42, 0.46, 0.52) + vec3(0.95, 0.88, 0.7) * diffuse) + vec3(0.32, 0.5, 0.06) * through * 0.7;
    col += vec3(0.9, 0.95, 0.8) * pow(max(dot(reflect(-eye, n), sun), 0.0), 40.0) * 0.25 * upper;
  } else {
    col = vec3(0.26, 0.24, 0.07) * (vec3(0.4, 0.42, 0.5) + vec3(0.9, 0.85, 0.7) * diffuse);
  }
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** The palms flattened along the sun onto the ground, into a table-space target: 1 in shadow. */
export const PALM_SHADOW_VERTEX = /* glsl */ `
${PALM_COMMON}
varying vec4 vPart;
varying float vFrond;
void main() {
  vec3 world = palmPoint(position);
  vec3 sun = normalize(uSun);
  vec2 onGround = world.xy - sun.xy / sun.z * world.z;
  float ground = texture2D(uField, (onGround - uMin) / uSize).r;
  onGround = world.xy - sun.xy / sun.z * (world.z - ground);
  vPart = aPart;
  vFrond = aFrond;
  gl_Position = vec4((onGround - uMin) / uSize * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const PALM_SHADOW_FRAGMENT = /* glsl */ `
varying vec4 vPart;
varying float vFrond;
${LEAFLETS}
void main() {
  if (leafletGap(vPart, vFrond)) discard;
  gl_FragColor = vec4(1.0);
}
`;

/**
 * Surfing Beach: the sand, the sea sheet and the palms, at the spots stadium-env-beach-layout.mjs
 * `beachSpots` picks. Each frame the palms' shadows are drawn into a table-space target the sand and
 * the sea read (`beforeRender`).
 */
export function surfingBeachBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uShoreA: { value: new three.Vector2() },
    uShoreB: { value: new three.Vector2() },
    uShoreBend: { value: 0 },
    uBarAt: { value: 160 },
    uRocks: { value: Array.from({ length: MAX_ROCKS }, () => new three.Vector4()) },
    uBreeze: { value: new three.Vector2(1, 0) },
    uPalmShadow: { value: null },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    bakeField: make(FULLSCREEN_VERTEX, BEACH_FIELD_FRAGMENT, bakeOptions),
    sand: make(SAND_VERTEX, SAND_FRAGMENT),
    sea: make(SEA_VERTEX, SEA_FRAGMENT),
    palms: make(PALM_VERTEX, PALM_FRAGMENT, { side: three.DoubleSide }),
    palmShadow: make(PALM_SHADOW_VERTEX, PALM_SHADOW_FRAGMENT, {
      side: three.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  };
  const sand = new three.Mesh(new three.BufferGeometry(), materials.sand);
  const sea = new three.Mesh(new three.BufferGeometry(), materials.sea);
  const palms = new three.Mesh(new three.BufferGeometry(), materials.palms);
  // The sand first, so the sea under the beach fails the depth test early.
  sea.renderOrder = 1;
  palms.renderOrder = 2;

  const shadowMesh = new three.Mesh(palms.geometry, materials.palmShadow);
  shadowMesh.frustumCulled = false;
  const shadowScene = new three.Scene();
  shadowScene.add(shadowMesh);
  const shadowCamera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const clearColour = new three.Color();
  let shadowTarget = null;
  let palmCount = 0;

  const setPalms = (trees) => {
    const arrays = palmGeometry(trees);
    const geometry = new three.BufferGeometry();
    geometry.setAttribute('position', new three.BufferAttribute(arrays.position, 3));
    geometry.setAttribute('normal', new three.BufferAttribute(arrays.normal, 3));
    geometry.setAttribute('aTree', new three.BufferAttribute(arrays.tree, 4));
    geometry.setAttribute('aPart', new three.BufferAttribute(arrays.part, 4));
    geometry.setAttribute('aFrond', new three.BufferAttribute(arrays.frond, 1));
    geometry.setIndex(new three.BufferAttribute(arrays.index, 1));
    replaceGeometry(palms, geometry);
    shadowMesh.geometry = geometry;
    palmCount = trees.length;
  };

  const setSpots = ({ shore, barAt, rocks, palms: trees }) => {
    own.uShoreA.value.set(shore.a.x, shore.a.y);
    own.uShoreB.value.set(shore.b.x, shore.b.y);
    own.uShoreBend.value = shore.bend;
    own.uBarAt.value = barAt;
    own.uRocks.value.forEach((rock, i) =>
      rock.set(rocks[i]?.x ?? 0, rocks[i]?.y ?? 0, rocks[i]?.r ?? 0, rocks[i]?.seed ?? 0)
    );
    // The sea breeze blows onshore, against the seaward direction.
    const span = Math.hypot(shore.b.x - shore.a.x, shore.b.y - shore.a.y) || 1;
    own.uBreeze.value.set(-(shore.b.y - shore.a.y) / span, (shore.b.x - shore.a.x) / span);
    setPalms(trees);
  };

  const fitShadowTarget = (bounds) => {
    const width = Math.max(2, Math.round(bounds.w * PALM_SHADOW_TEXELS_PER_PX));
    const height = Math.max(2, Math.round(bounds.h * PALM_SHADOW_TEXELS_PER_PX));
    if (shadowTarget && shadowTarget.width === width && shadowTarget.height === height) return;
    shadowTarget?.dispose();
    shadowTarget = new three.WebGLRenderTarget(width, height, {
      type: three.UnsignedByteType,
      minFilter: three.LinearFilter,
      magFilter: three.LinearFilter,
      depthBuffer: false,
    });
    own.uPalmShadow.value = shadowTarget.texture;
  };

  return {
    objects: [sand, sea, palms],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    spots: (layout) => beachSpots(layout, environmentFootprints(layout)),
    apply(spots, bounds) {
      if (spots) setSpots(spots);
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
      fitShadowTarget(bounds);
    },
    /** Draws the palms' shadows for this frame (they sway with the fronds). */
    beforeRender(renderer) {
      if (!shadowTarget) return;
      const previous = renderer.getRenderTarget();
      renderer.getClearColor(clearColour);
      const alpha = renderer.getClearAlpha();
      renderer.setRenderTarget(shadowTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      if (palmCount > 0) renderer.render(shadowScene, shadowCamera);
      renderer.setClearColor(clearColour, alpha);
      renderer.setRenderTarget(previous);
    },
    dispose() {
      shadowTarget?.dispose();
      shadowTarget = null;
    },
  };
}
