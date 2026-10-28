// Design 077 (prototype): Surfing Beach (customhb-209) after its card art (MEG 129, Ayumi Odashima):
// golden-orange sand, the sea rolling in from beyond it in turquoise breakers that curl over in white
// lace, swash sheets running up the sand and draining off glassy, brown rocks wrapped in surf. The art
// looks across the sand at the sea; the board looks up the table from the near end, so the sea lies
// past the cards, in the far-left corner and down the left margin, where both camera presets see it
// (the right margin lies under the sidebox), its waves rolling in toward the near right. The shore is
// laid out from the cards: every footprint keeps dry sand with room for the highest run-up.
// The surf model (shoaling swell, breakers on a sandbar cut by rip channels, run-up and drain, glassy
// drained sand) comes from the first Surfing Beach prototype (feature/077-beach-board).
// World scale: a card's footprint is about a beach towel; a big breaker's crest is a few feet high.
//
// Bake, once per layout: BAKE_FIELD writes R height px (sea level 0 is SEA_LEVEL off the cloth),
// G signed px from the mean waterline (+ seaward), B rock height px, A rock id (-1 none); the shared
// light bake adds normals, occlusion and the sun's shadow. Per frame: TERRAIN paints the sand, the
// swash and the rocks; SEA is one displaced sheet at SEA_LEVEL, painting the water over the seabed,
// the breakers and their foam, the foam round the rocks; SPRAY the droplets off the rocks.
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  VORONOI,
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { tableBounds } from './table-uv.mjs';

export const BEACH_KEY = 'surfing-beach';
/** The sea's surface, px off the cloth. */
export const SEA_LEVEL = -6;
export const WAVE_PERIOD_S = 6.5;
/** Run-up of an average wave, px up the beach from the mean waterline. */
export const RUNUP_PX = 56;
/** The highest a wave runs (RUNUP_PX x 1.3, cusps and all): no card lies within it. */
export const RUNUP_MAX_PX = RUNUP_PX * 1.3 * 1.16;
/** Dry sand kept between the highest run-up and any card, and the waterline's wander either way. */
export const DRY_MARGIN_PX = 24;
export const SHORE_WANDER_PX = 16;
/** Seaward: toward the far-left corner (table frame). */
export const SEAWARD = Object.freeze([-0.74, 0.67]);
export const MAX_ROCKS = 4;
/** Sea sheet grid spacing in table px. */
export const SEA_SPACING_PX = 5;
const SPRAY_COUNT = 160;

const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));

/** A small deterministic 0..1 from three numbers. */
const hash = (x, y, salt) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** px the sea's straight shore comes in past the line that would clear every card on its own. */
export const BAY_PX = 300;
/** Smooth-min radius where the straight shore meets the shore round the cards. */
export const SHORE_BLEND_PX = 150;
export const MAX_CARD_RECTS = 24;
/** Dry sand kept round every card before the shore: the highest run-up, DRY_MARGIN_PX, the wander. */
export const SHORE_KEEP_PX = RUNUP_MAX_PX + DRY_MARGIN_PX + SHORE_WANDER_PX;

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};

/**
 * Signed px from the mean waterline at (x, y), + seaward, before its wander: the straight shore
 * square to SEAWARD (`offset` px out from the table's middle), smoothly turned aside round every
 * card so each keeps SHORE_KEEP_PX of dry sand (the shader's `shoreDistance`).
 */
export function shoreDistance({ centre, offset, cards, u }, x, y) {
  const line = (x - centre.x) * SEAWARD[0] + (y - centre.y) * SEAWARD[1] - offset;
  const near = Math.min(...cards.map((card) => distanceToRect(x, y, card)));
  // The run-up is the same at every card size, so the dry margin is too.
  return smin(line, near - SHORE_KEEP_PX, SHORE_BLEND_PX * u);
}

/**
 * Surfing Beach's layout: the mean waterline (a straight shore square to SEAWARD, BAY_PX nearer the
 * cards than the line that would clear them all, turned aside round each card), the sandbar's
 * distance out, and the rocks in the surf. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function beachSpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const cards = [...slabs, ...flats].slice(0, MAX_CARD_RECTS);
  if (!cards.length) return null;
  const scene = sceneBounds(layout, BEACH_KEY);
  const u = (layout.self.cardBox?.active?.w ?? 100) / 100;
  const centre = { x: table.x + table.w / 2, y: layout.depth };
  const [sx, sy] = SEAWARD;
  const seaward = (x, y) => (x - centre.x) * sx + (y - centre.y) * sy;
  const reach = Math.max(...cards.flatMap((r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]).map(([x, y]) => seaward(x, y)));
  const offset = reach + SHORE_KEEP_PX - BAY_PX * u;
  const shore = { centre, offset, cards, u };
  const corners = [[scene.x, scene.y], [scene.x + scene.w, scene.y], [scene.x, scene.y + scene.h], [scene.x + scene.w, scene.y + scene.h]];
  const deepest = Math.max(...corners.map(([x, y]) => shoreDistance(shore, x, y)));
  // Rocks: in the surf a little off the waterline, clear of the cards, inside the scene.
  const rocks = [];
  for (let k = 0; rocks.length < MAX_ROCKS && k < 400; k += 1) {
    const x = scene.x + scene.w * hash(k, 3, 1);
    const y = scene.y + scene.h * hash(k, 3, 2);
    const r = (30 + 26 * hash(k, 3, 3)) * u;
    const out = shoreDistance(shore, x, y);
    if (out < -6 * u || out > 70 * u) continue;
    const inside = x - r > scene.x + 20 && x + r < scene.x + scene.w - 20 && y - r > scene.y + 20 && y + r < scene.y + scene.h - 20;
    if (!inside || cards.some((card) => distanceToRect(x, y, card) < r + RUNUP_MAX_PX * u)) continue;
    if (rocks.some((rock) => Math.hypot(rock.x - x, rock.y - y) < rock.r + r + 90 * u)) continue;
    rocks.push({ x, y, r, h: (16 + 18 * hash(k, 3, 4)) * u, id: rocks.length });
  }
  return { table, scene, u, centre, offset, cards, deepest, bar: Math.min(150 * u, Math.max(70, deepest * 0.4)), rocks };
}

const SHORE = /* glsl */ `
// After SHORE_WOBBLE (uShore declared before it: the table's middle x, y, the straight shore's
// offset seaward of it, the sandbar's distance out); every rock (x, y, radius, height; 0 radius:
// none); every card (x0, y0, x1, y1; unused ones far off) and the dry sand kept round them, the
// smooth-min radius.
uniform vec4 uRocks[${MAX_ROCKS}];
uniform vec4 uCards[${MAX_CARD_RECTS}];
uniform vec2 uKeep;
const vec2 SEAWARD = vec2(${SEAWARD[0]}, ${SEAWARD[1]});
float shoreDistance(vec2 p) {
  float line = dot(p - uShore.xy, SEAWARD) - uShore.z;
  float near = 100000.0;
  for (int i = 0; i < ${MAX_CARD_RECTS}; i++) {
    vec4 card = uCards[i];
    near = min(near, length(max(max(card.xy - p, p - card.zw), 0.0)));
  }
  float b = near - uKeep.x;
  float h = max(uKeep.y - abs(line - b), 0.0) / uKeep.y;
  return min(line, b) - h * h * uKeep.y * 0.25;
}
// x: px along the shore; y: signed px from the waterline, + seaward, its wander and cusps in.
vec2 shoreFrame(vec2 p) {
  vec2 rel = p - uShore.xy;
  float along = rel.x * SEAWARD.y - rel.y * SEAWARD.x;
  return vec2(along, shoreDistance(p) - shoreWobble(along));
}
`;

const SHORE_WOBBLE = /* glsl */ `
// The waterline's own wander, and beach cusps: shallow scallops about every 84 px, uneven.
float shoreWobble(float along) {
  return ${(SHORE_WANDER_PX * 2 - 4).toFixed(1)} * (fbm3(vec2(along / 320.0, 4.2)) - 0.5) + 2.0 * sin(along * 0.0748 + 3.0 * gnoise(vec2(along / 200.0, 1.7)));
}
float barAt(float along) {
  return uShore.w * (0.88 + 0.24 * gnoise(vec2(along / 300.0, 5.1)));
}
// 1 on the sandbar, 0 in the rip channels that cut it.
float barPresence(float along) {
  return smoothstep(0.32, 0.5, gnoise(vec2(along / 230.0, 9.3)));
}
`;

// The surf model of the first prototype: crests shoal and bunch up toward the shore, big ones break
// on the bar, every one breaks at the shore, each bore runs up the sand and drains.
const SURF = /* glsl */ `
const float WAVE_PERIOD = ${WAVE_PERIOD_S.toFixed(2)};
const float WAVE_K = 0.19;
const float WAVE_S0 = 90.0;
const float SWASH_SHARE = 0.9;
const float RUNUP = ${RUNUP_PX.toFixed(1)};
float waveTravel(float offshore) {
  return WAVE_K * (sqrt(max(offshore, 0.0) + WAVE_S0) - sqrt(WAVE_S0));
}
float waveSpacing(float offshore) {
  return 2.0 * sqrt(max(offshore, 0.0) + WAVE_S0) / WAVE_K;
}
float waveDrift(float along) {
  return along * 0.001 + 0.22 * (gnoise(vec2(along / 420.0, 2.3)) - 0.5);
}
float wavePhase(float offshore, float along, float time) {
  return time / WAVE_PERIOD + waveTravel(offshore) + waveDrift(along);
}
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
float steepness(float n, float crest, float along) {
  float size = waveSize(n, along);
  float bar = barAt(along);
  float toBar = breaksOnBar(size, along) * smoothstep(bar + 70.0, bar + 4.0, crest) * step(bar - 4.0, crest);
  float shore = shoreBreakAt(size);
  float toShore = smoothstep(shore + 55.0, shore + 3.0, crest) * step(shore - 3.0, crest);
  return max(toBar, toShore) * min(size, 1.3);
}
struct Sea {
  float height;
  float slope;
  float foam;
  float fresh;
  float glow;
  float behind;
  float ahead;
  float size;
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
  vec2 leftHere = roller(n, offshore, along);
  float shoal = 1.0 + 1.3 * exp(-offshore / 110.0);
  float steep = steepness(n + 1.0, offshore + ahead, along);
  float frontWidth = spacing * mix(0.13, 0.07, clamp(steep, 0.0, 1.0));
  float backWidth = spacing * 0.3;
  float heightNext = 3.8 * waveSize(n + 1.0, along) * shoal * (1.0 - 0.45 * rollNext.x);
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
  sea.behind = behind;
  sea.ahead = ahead;
  sea.size = waveSize(n + 1.0, along);
  return sea;
}
float runupOf(float n, float along) {
  return RUNUP * (0.6 + 0.45 * waveSize(n, along)) * (1.0 + 0.1 * sin(along * 0.0748 + 3.14159 + 3.0 * gnoise(vec2(along / 200.0, 1.7))));
}
float runupMax(float along) {
  return RUNUP * 1.3 * (1.0 + 0.1 * sin(along * 0.0748 + 3.14159 + 3.0 * gnoise(vec2(along / 200.0, 1.7))));
}
struct Swash {
  float film;
  float foam;
  float gloss;
};
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
  float edge = reach
    + (gnoise(vec2(along / 9.0, n * 3.1)) - 0.5) * 5.0 * smoothstep(0.0, 10.0, reach)
    + (gnoise(vec2(along / 37.0, n * 1.3 + 4.0)) - 0.5) * 9.0 * smoothstep(0.0, 20.0, reach);
  float under = edge - upBeach;
  swash.film = smoothstep(0.0, 1.5, under) * clamp(under / 16.0 + 0.25, 0.0, 1.0) * mix(1.0, 0.55, x);
  float front = (1.0 - smoothstep(0.0, mix(14.0, 7.0, x), under)) * smoothstep(-1.0, 0.5, under);
  float sheet = smoothstep(0.0, 1.0, under) * exp(-under / 22.0) * 0.6;
  swash.foam = max(front * mix(1.0, 0.6, x), sheet * (1.0 - 0.5 * x));
  float sinceTop = (age - pow(0.5, 1.0 / 0.7)) * SWASH_SHARE * WAVE_PERIOD;
  float mark = runup + (gnoise(vec2(along / 11.0, n * 2.3)) - 0.5) * 4.0;
  float line = 1.0 - smoothstep(0.0, 2.5, abs(upBeach - mark));
  swash.foam = max(swash.foam, line * step(0.0, sinceTop) * exp(-sinceTop / 1.8) * 0.85);
  float leftAt = drainedAt(upBeach, runup);
  float since = 100.0;
  if (leftAt >= 0.0 && age >= leftAt) {
    since = (age - leftAt) * SWASH_SHARE * WAVE_PERIOD;
  } else if (under < 0.0) {
    float leftLast = drainedAt(upBeach, runupOf(n - 1.0, along));
    if (leftLast >= 0.0) since = (age + 1.0 / SWASH_SHARE - leftLast) * SWASH_SHARE * WAVE_PERIOD;
  }
  swash.gloss = under < 0.0 ? exp(-since / 2.2) : 0.0;
  return swash;
}
`;

/** Foam as lace: a network of bright threads round open holes, drifting with the water. */
const LACE = /* glsl */ `
float lace(vec2 p, float scale, float amount) {
  if (amount <= 0.01) return 0.0;
  // Patches of foam with ragged edges, holes of every size opening in them as they thin (warped
  // cells, so the holes never line up); where the foam is thin it breaks into patches, never a net.
  vec2 q = p / scale + 0.7 * vec2(fbm3(p / (scale * 3.0)), fbm3(p / (scale * 3.0) + 5.2));
  vec4 cell = voronoiCell(q);
  float density = amount + 0.4 * (fbm3(p / (scale * 1.4) + 2.0) - 0.5);
  float holeSize = 0.5 * (1.0 - amount) * (0.4 + 0.9 * fract(cell.y * 7.0));
  float hole = 1.0 - smoothstep(holeSize - 0.06, holeSize + 0.06, length(cell.zw));
  return smoothstep(0.32, 0.46, density) * (1.0 - hole);
}
`;

// The card art's colours (pixel samples, inverted through Neutral tone mapping).
const PALETTE = /* glsl */ `
const vec3 SAND_DRY = vec3(0.793, 0.345, 0.154);
const vec3 SAND_LIT = vec3(1.0, 0.509, 0.219);
const vec3 SAND_WET = vec3(0.525, 0.196, 0.093);
const vec3 SAND_GLOSS = vec3(0.65, 0.302, 0.167);
const vec3 SEA_SHALLOW = vec3(0.228, 0.618, 0.586);
const vec3 SEA_TURQUOISE = vec3(0.046, 0.435, 0.461);
const vec3 SEA_TEAL = vec3(0.028, 0.228, 0.285);
const vec3 SEA_DEEP = vec3(0.022, 0.099, 0.242);
const vec3 FOAM = vec3(1.0, 1.04, 1.06);
const vec3 FOAM_SHADE = vec3(0.442, 0.65, 0.72);
const vec3 ROCK = vec3(0.345, 0.211, 0.12);
const vec3 ROCK_DARK = vec3(0.129, 0.084, 0.065);
const vec3 ROCK_LIT = vec3(0.618, 0.442, 0.245);
const vec3 SKY = vec3(0.35, 0.62, 0.95);
vec3 edgeHaze(vec3 col, vec2 uv) {
  vec2 edgeUv = min(uv, 1.0 - uv);
  return col * mix(0.5, 1.0, smoothstep(0.0, 0.035, min(edgeUv.x, edgeUv.y)));
}
`;

/**
 * Bake: the beach shelves gently from just under the cloth down to the waterline, then the seabed
 * falls away, rising again over the sandbar; ripple marks on the wet sand and under water; each rock
 * a rounded, lumpy dome standing seaOut of it.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
uniform vec4 uShore;
${SHORE_WOBBLE}
${SHORE}
void main() {
  vec2 p = uMin + vUv * uSize;
  vec2 frame = shoreFrame(p);
  float seaOut = frame.y;
  // Sand: just under the cloth inland, sloping to sea level at the waterline (heights are px off
  // the cloth here, sea level at ${SEA_LEVEL}).
  float h = mix(-1.0, ${SEA_LEVEL.toFixed(1)}, smoothstep(-${(RUNUP_MAX_PX + 80).toFixed(1)}, 0.0, seaOut));
  h += 0.5 * (fbm3(p / 90.0) - 0.5);
  // Low dunes on the dry sand, only well away from the cards (they keep flat sand) and the water.
  float nearCards = 100000.0;
  for (int i = 0; i < ${MAX_CARD_RECTS}; i++) {
    vec4 card = uCards[i];
    nearCards = min(nearCards, length(max(max(card.xy - p, p - card.zw), 0.0)));
  }
  h += 9.0 * smoothstep(40.0, 160.0, nearCards) * smoothstep(-60.0, -200.0, seaOut) * smoothstep(0.35, 0.75, fbm3(p / 230.0 + 2.0));
  if (seaOut > 0.0) {
    float bar = barAt(frame.x);
    float depth = 0.09 * seaOut + 10.0 * smoothstep(0.0, 300.0, seaOut) - 7.0 * barPresence(frame.x) * exp(-pow((seaOut - bar) / 34.0, 2.0));
    h = ${SEA_LEVEL.toFixed(1)} - max(depth, 0.0);
  }
  // Ripple marks, square to the waves, where the water reaches.
  h += 0.4 * sin(seaOut * 0.55 + 2.0 * fbm3(p / 40.0)) * smoothstep(-${RUNUP_MAX_PX.toFixed(1)}, 0.0, seaOut);
  float rockHeight = 0.0;
  float id = -1.0;
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    vec4 rock = uRocks[i];
    if (rock.z <= 0.0) continue;
    vec2 q = (p - rock.xy) / rock.z;
    // A chunky boulder as the art's: broad flat facets meeting in creases, tipped its own way, its
    // outline uneven; flat-topped where the facets meet.
    float fi = float(i);
    float top = 1.0;
    for (int k = 0; k < 6; k++) {
      float fk = float(k);
      float angle = fi * 2.3 + fk * 1.047 + (hash12(vec2(fi, fk)) - 0.5) * 0.8;
      float slope = 0.8 + 0.6 * hash12(vec2(fk * 3.1, fi + 9.0));
      top = min(top, 1.15 - slope * dot(q, vec2(cos(angle), sin(angle))));
    }
    top -= 0.35 * dot(q, vec2(cos(fi * 1.7), sin(fi * 1.7)));
    float lumpy = top * (1.0 - smoothstep(0.95, 1.25, length(q) + 0.15 * (fbm3(p / 18.0 + fi * 7.0) - 0.5)));
    if (lumpy <= 0.0) continue;
    top = ${SEA_LEVEL.toFixed(1)} + rock.w * smoothstep(0.0, 0.55, lumpy) * (0.85 + 0.15 * min(lumpy, 1.0));
    if (top > h) {
      h = top;
      rockHeight = top - ${SEA_LEVEL.toFixed(1)};
      id = float(i);
    }
  }
  gl_FragColor = vec4(h, seaOut, rockHeight, id);
}
`;

export const TERRAIN_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = position.xy;
  vec2 uv = (p - uMin) / uSize;
  float growth = terrainGrowth(p);
  vPos = p;
  vUv = uv;
  vGrowth = growth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, groundAt(uv) * growth * edgeSkirt(uv), 1.0);
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
uniform vec4 uShore;
${NOISE}
${VORONOI}
${REVEAL}
${PALETTE}
${SHORE_WOBBLE}
${SURF}
${LACE}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float seaOut = field.g;
  vec2 rel = p - uShore.xy;
  float along = rel.x * ${SEAWARD[1]} - rel.y * ${SEAWARD[0]};
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sun = normalize(uSun);
  float lit = clamp(dot(n, sun) / sun.z, 0.0, 1.3) * mix(0.55, 1.0, light.a);

  // Dry sand: the art's golden orange, wind-rippled, a fine grain, a few darker patches.
  vec3 col = mix(SAND_DRY, SAND_LIT, 0.35 + 0.3 * fbm3(p / 120.0));
  col *= 0.93 + 0.1 * fbm3(p / 34.0 + 4.0);
  // Wind ripples on the dry sand: curving, broken, low, crossing the beach in patches.
  vec2 warp = p + 40.0 * vec2(fbm3(p / 260.0), fbm3(p / 260.0 + 3.0));
  float ripple = sin(dot(warp, vec2(0.18, 0.11)) + 2.5 * fbm3(p / 70.0));
  float patches = smoothstep(0.45, 0.7, fbm3(p / 190.0 + 8.0)) * smoothstep(-30.0, -120.0, seaOut);
  col *= 1.0 + 0.05 * ripple * patches;
  col *= 0.95 + 0.08 * gnoise(p / 3.0);
  // Damp up to the highest run-up, wet below it.
  float upBeach = -seaOut;
  float damp = smoothstep(runupMax(along) + 26.0 + 14.0 * gnoise(p / 40.0), runupMax(along) - 10.0, upBeach);
  col = mix(col, mix(SAND_DRY, SAND_WET, 0.45), damp * 0.6);
  col = mix(col, SAND_WET, smoothstep(30.0, -8.0, upBeach + 6.0 * gnoise(p / 25.0)));
  // The swash: each sheet runs up in a thin film with a lacy foam front, drains, and leaves the sand
  // glassy for a moment, mirroring the sky.
  float t = uTime;
  Swash swash = swashAt(max(upBeach, 0.0), along, t);
  col = mix(col, SAND_GLOSS * 1.1 + SKY * 0.12, swash.gloss * 0.7);
  col = mix(col, mix(SEA_SHALLOW * 1.2, col, 0.45), swash.film * 0.75);
  float foam = lace(vec2(along, upBeach) + vec2(0.0, t * 3.0), 9.0, swash.foam);
  col *= 0.7 + 0.3 * min(lit, 1.2);
  col = mix(col, FOAM, foam * 0.92);

  // Rocks: brown, lit faces pale sandstone, cracks dark; wet and darker near the water.
  if (field.a >= 0.0) {
    float facet = smoothstep(0.3, 0.9, dot(n, sun));
    vec3 rock = mix(ROCK_DARK, ROCK, smoothstep(0.0, 0.4, facet));
    rock = mix(rock, ROCK_LIT, smoothstep(0.55, 0.95, facet));
    rock *= 0.85 + 0.3 * gnoise(p / 6.0 + field.a * 9.0);
    rock *= mix(0.65, 1.0, smoothstep(2.0, 12.0, field.b));
    col = mix(col, rock, smoothstep(0.5, 2.0, field.b));
  }
  col *= mix(0.6, 1.0, smoothstep(0.3, 0.9, light.b));
  col = edgeHaze(col, vUv);
  vec3 spray = vec3(0.9, 1.0, 1.05);
  col += spray * revealGlow(p, 0.035) * 0.6;
  col += spray * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const SEA_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
uniform vec4 uShore;
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
${SHORE_WOBBLE}
${SURF}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vSlope;
void main() {
  vec2 p = position.xy;
  vec2 uv = (p - uMin) / uSize;
  float seaOut = texture2D(uField, uv).g;
  vec2 rel = p - uShore.xy;
  float along = rel.x * ${SEAWARD[1]} - rel.y * ${SEAWARD[0]};
  Sea sea = seaAt(max(seaOut, 0.0), along, uTime);
  // The swell dies away into the swash at the waterline.
  float height = sea.height * smoothstep(-4.0, 20.0, seaOut);
  vPos = p;
  vUv = uv;
  vHeight = height;
  vSlope = sea.slope * smoothstep(-4.0, 20.0, seaOut);
  float growth = terrainGrowth(p);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, (${SEA_LEVEL.toFixed(1)} + height) * growth, 1.0);
}
`;

/**
 * The water over the seabed: clear in the shallows (the sand and its ripples show through, a caustic
 * net of light on it), turquoise over the bar, teal then deep blue past it; a breaker's steep face
 * lit turquoise through, its roller white lace, its trail fading; the sun's glints; foam round the
 * rocks with each wave.
 */
export const SEA_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
uniform vec4 uShore;
uniform vec4 uRocks[${MAX_ROCKS}];
${NOISE}
${VORONOI}
${REVEAL}
${PALETTE}
${SHORE_WOBBLE}
${SURF}
${LACE}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vSlope;
void main() {
  vec2 p = vPos;
  vec4 field = texture2D(uField, vUv);
  float seaOut = field.g;
  if (seaOut < -2.0 || field.b > 1.0 || revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec2 rel = p - uShore.xy;
  float along = rel.x * ${SEAWARD[1]} - rel.y * ${SEAWARD[0]};
  float t = uTime;
  Sea sea = seaAt(max(seaOut, 0.0), along, t);
  float depth = max(${SEA_LEVEL.toFixed(1)} + vHeight - field.r, 0.0);

  // The seabed seen through the water, rippled, a caustic net of light drifting on it.
  // Caustics: soft bright wavy threads, the noise's middle line, drifting with the swell.
  vec2 wobbled = p + 14.0 * vec2(gnoise(p / 40.0 + t * 0.2), gnoise(p / 40.0 - t * 0.2 + 4.0));
  float caustic = 1.0 - smoothstep(0.0, 0.06, abs(gnoise(wobbled / 22.0) - 0.5));
  vec3 bed = SAND_WET * 1.15 * (0.92 + 0.22 * caustic * smoothstep(0.5, 3.0, depth) * exp(-depth / 12.0));
  vec3 water = mix(SEA_SHALLOW, SEA_TURQUOISE, smoothstep(2.0, 9.0, depth));
  water = mix(water, SEA_TEAL, smoothstep(9.0, 20.0, depth));
  water = mix(water, SEA_DEEP, smoothstep(20.0, 42.0, depth));
  vec3 col = mix(bed, water, 1.0 - exp(-depth / 4.5));
  // The water's surface: the steep face of a building breaker lit through, the back of a crest a
  // shade darker, the sky in the slopes facing it, the sun's glints.
  col = mix(col, SEA_SHALLOW * 1.35 + vec3(0.03, 0.08, 0.06), sea.glow * 0.6);
  col *= 1.0 - 0.18 * clamp(-vSlope * 0.6, 0.0, 1.0);
  vec3 sun = normalize(uSun);
  vec3 nrm = normalize(vec3(-vec2(${SEAWARD[0]}, ${SEAWARD[1]}) * vSlope * 0.6 + 0.06 * (vec2(gnoise(p / 24.0 + t * 0.4), gnoise(p / 24.0 - t * 0.4 + 3.0)) - 0.5), 1.0));
  vec3 view = normalize(uEye - vec3(p, ${SEA_LEVEL.toFixed(1)}));
  float glint = pow(max(dot(reflect(-sun, nrm), view), 0.0), 220.0);
  col += vec3(1.0, 0.97, 0.9) * glint * 0.8 * smoothstep(0.0, 6.0, depth);
  col += SKY * 0.25 * (1.0 - nrm.z);

  // Foam: the roller and its trail as lace, the fresh lip solid white; it thins as it spreads.
  vec2 drift = vec2(along, seaOut + t * 9.0);
  float foam = lace(drift, 14.0, sea.foam);
  foam = max(foam, sea.fresh * 0.95);
  // Out past the breakers, a big swell's crest spills into a short whitecap here and there.
  float phaseHere = wavePhase(max(seaOut, 0.0), along, t);
  float capped = step(0.48, gnoise(vec2(along / 60.0, floor(phaseHere) * 1.7)));
  float whitecap = smoothstep(0.9, 1.1, sea.size) * exp(-sea.ahead * sea.ahead / 40.0) * capped * smoothstep(barAt(along) + 20.0, barAt(along) + 70.0, seaOut);
  foam = max(foam, lace(drift, 9.0, whitecap));
  // Foam wrapped round each rock, swelling as each wave reaches it.
  float swell = 0.5 + 0.5 * sin(6.2831853 * wavePhase(max(seaOut, 0.0), along, t));
  float ring = 0.0;
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    vec4 rock = uRocks[i];
    if (rock.z <= 0.0) continue;
    float edge = distance(p, rock.xy) / rock.z;
    ring = max(ring, (1.0 - smoothstep(0.85, 1.25 + 0.35 * swell, edge)) * smoothstep(0.6, 0.85, edge));
  }
  foam = max(foam, lace(p + vec2(t * 4.0, 0.0), 10.0, ring * (0.6 + 0.4 * swell)));
  vec3 foamCol = mix(FOAM_SHADE, FOAM, 0.6 + 0.4 * clamp(vSlope * 0.4 + 0.5, 0.0, 1.0));
  col = mix(col, foamCol, foam);
  // The water's very edge: thin, glassy, the sand showing through.
  col = mix(col, mix(bed, col, 0.5), smoothstep(6.0, -2.0, seaOut) * (1.0 - foam));

  col = edgeHaze(col, vUv);
  vec3 spray = vec3(0.9, 1.0, 1.05);
  col += spray * revealGlow(p, 0.035) * 0.6;
  col += spray * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** Spray thrown up off the rocks as each wave strikes them, and drifting off the breakers' lips. */
export const SPRAY_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
uniform vec4 uRocks[${MAX_ROCKS}];
${NOISE}
${REVEAL}
attribute vec4 aSeed;
varying float vLife;
void main() {
  float rocks = 0.0;
  for (int i = 0; i < ${MAX_ROCKS}; i++) rocks += step(0.001, uRocks[i].z);
  float pick = floor(aSeed.x * max(rocks, 1.0));
  vec4 rock = uRocks[0];
  float seen = 0.0;
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    if (uRocks[i].z <= 0.0) continue;
    if (seen == pick) rock = uRocks[i];
    seen += 1.0;
  }
  float period = ${WAVE_PERIOD_S.toFixed(2)};
  float clock = uTime + aSeed.y * 0.6;
  float life = fract(clock / period) / 0.35;
  float angle = aSeed.z * 6.2831853;
  vec2 start = rock.xy + vec2(cos(angle), sin(angle)) * rock.z * (0.8 + 0.3 * aSeed.w);
  vec3 pos = vec3(start + vec2(cos(angle), sin(angle)) * life * 26.0 * aSeed.w, ${SEA_LEVEL.toFixed(1)} + rock.w * 0.5 + life * (50.0 + 50.0 * aSeed.y) - life * life * 70.0);
  float shown = step(life, 1.0) * revealBurned(start) * exitKeep(start) * step(0.001, rock.z);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max((1.4 + 1.8 * aSeed.w) * uFocal / -mv.z, 1.5) * 2.2 * shown;
  vLife = life;
}
`;

export const SPRAY_FRAGMENT = /* glsl */ `
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float drop = 1.0 - smoothstep(0.35, 0.6, d);
  float fade = 1.0 - smoothstep(0.5, 1.0, vLife);
  gl_FragColor = vec4(vec3(0.95, 1.0, 1.02) * drop * fade * 0.9, 1.0);
${OUTPUT}
}
`;

/** Surfing Beach's board (stadium-environment-mesh.js BOARDS). */
export function surfingBeachBoard({ three, material, seeded, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uShore: { value: new three.Vector4() },
    uRocks: { value: Array.from({ length: MAX_ROCKS }, () => new three.Vector4()) },
    uCards: { value: Array.from({ length: MAX_CARD_RECTS }, () => new three.Vector4()) },
    uKeep: { value: new three.Vector2(1, 1) },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    // Pushed back a hair so the sand right at the water's edge wins the depth test, not flickers.
    sea: make(SEA_VERTEX, SEA_FRAGMENT, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }),
    spray: make(SPRAY_VERTEX, SPRAY_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const sea = new three.Mesh(new three.BufferGeometry(), materials.sea);
  const spray = new three.Points(seeded(SPRAY_COUNT), materials.spray);
  spray.renderOrder = 2;
  return {
    objects: [terrain, sea, spray],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => beachSpots(layout),
    apply(spots, bounds) {
      own.uShore.value.set(spots?.centre.x ?? 0, spots?.centre.y ?? 0, spots?.offset ?? 1e5, spots?.bar ?? 100);
      own.uRocks.value.forEach((slot, i) => {
        const rock = spots?.rocks[i];
        return rock ? slot.set(rock.x, rock.y, rock.r, rock.h) : slot.set(0, 0, 0, 0);
      });
      own.uCards.value.forEach((slot, i) => {
        const card = spots?.cards[i];
        return card ? slot.set(card.x, card.y, card.x + card.w, card.y + card.h) : slot.set(-1e5, -1e5, -1e5, -1e5);
      });
      const u = spots?.u ?? 1;
      own.uKeep.value.set(SHORE_KEEP_PX, SHORE_BLEND_PX * u);
      replaceGeometry(terrain, terrainGrid(bounds));
      replaceGeometry(
        sea,
        new three.PlaneGeometry(bounds.w, bounds.h, Math.round(bounds.w / SEA_SPACING_PX), Math.round(bounds.h / SEA_SPACING_PX)).translate(
          bounds.x + bounds.w / 2,
          bounds.y + bounds.h / 2,
          0
        )
      );
    },
  };
}
