// Design 077 (prototype): the volcanic recipe. Scorched Earth (customhb-299) as a procedural three.js
// environment, in the style of TCG Live's own board art (board_fire in the extracted client): chunky
// sculpted stones with a few broad facets on rounded shoulders, mid slate greys, cool shadows, thin
// painted highlights on their rims, and saturated lava glowing in the gaps. No photographic
// micro-detail. Content after the card art (Ryo Ueda, PRC 138): a volcano spills lava down its flanks
// into a lava river that splits the two halves along the seam; its side streams run on to the table
// edge. The ground has its own lie of plateaus, ridges and hollows, cards or not: the scene draws the
// environment first and the board over it (board-scene.js), so no card place is marked.
//
// Two stages:
// 1. Bake, once per layout: BAKE_FIELD renders the ground into a half-float target at ~1.6 texels
//    per table px (R height px, G signed px from the river bank, B the lava table: the height the
//    lava in the cracks and the volcano's side streams fills to, A stone id, -1 off the stones,
//    2 on the volcano); the shared BAKE_LIGHT (stadium-environment-glsl.mjs) turns it into normals,
//    occlusion and a soft sun shadow.
// 2. Per frame: TERRAIN displaces a dense grid by the baked height, raised to the lava table where
//    the ground dips under it, and paints that lava itself: the cracks between the stones and the
//    side streams run at the land's own level, the stones standing only a little proud of them.
//    LAVA is one sheet at LAVA_LEVEL for the river, which sits lower; EMBERS and SMOKE rise off it.
import {
  NOISE,
  OUTPUT,
  REVEAL,
  STONES,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  VORONOI,
} from './stadium-environment-glsl.mjs';

/** Lava surface height (px below the cloth). */
export const LAVA_LEVEL = -10;
/** Volcano proportions, relative to its base radius: height, crater radius, crater depth. */
export const VOLCANO_SHAPE = { height: 1.2, crater: 0.24, craterDepth: 0.09 };
/** Lava table above the bare ground between the stones, px: the cracks fill to here. */
const CRACK_FILL_PX = 0.8;
/** Ground level the volcano's side streams run at, px. */
const STREAM_LEVEL_PX = 4;

const LAVA_RAMP = /* glsl */ `
// Lava in linear HDR, banded like painted lava: deep red at the edges, red, orange, a gold core.
// The gold stays below white after Neutral tone mapping.
vec3 lavaColor(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 deep = vec3(0.16, 0.004, 0.0);
  vec3 red = vec3(0.72, 0.028, 0.0);
  vec3 orange = vec3(1.15, 0.24, 0.0);
  vec3 gold = vec3(1.25, 0.62, 0.06);
  vec3 c = mix(deep, red, smoothstep(0.12, 0.2, t));
  c = mix(c, orange, smoothstep(0.42, 0.5, t));
  return mix(c, gold, smoothstep(0.72, 0.8, t));
}
`;

const VOLCANO = /* glsl */ `
// Centre x, y and base radius (0: no volcano) in table px.
uniform vec4 uVolcano;
uniform float uRiverY;
// Angle between the volcano's streams: the middle one runs downstream (+x), one either side of it.
const float STREAM_SPREAD = 1.05;
float angleBetween(float a, float b) {
  return mod(a - b + 3.14159265, 6.2831853) - 3.14159265;
}
float volcanoHeight() {
  return uVolcano.z * ${VOLCANO_SHAPE.height.toFixed(3)};
}
float craterRadius() {
  return uVolcano.z * ${VOLCANO_SHAPE.crater.toFixed(3)};
}
float craterRimHeight() {
  return volcanoHeight() * pow(1.0 - ${VOLCANO_SHAPE.crater.toFixed(3)}, 1.25);
}
// Lava from the volcano: the crater pool and three streams down its flanks, the middle one
// downstream into the river, the others toward the near and far sides, running on in their own
// direction to the table edge. x = 1 on lava, y = signed px from its edge.
vec2 volcanoLava(vec2 p) {
  float r = uVolcano.z;
  if (r <= 0.0) return vec2(0.0, 100000.0);
  vec2 rel = p - uVolcano.xy;
  float d = length(rel);
  float crater = craterRadius();
  float best = d - crater * 0.82;
  float angle = atan(rel.y, rel.x);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    // A slight wiggle: an angle on the cone, a small constant sway (in px) past its foot.
    float course = (fk - 1.0) * STREAM_SPREAD + 0.06 * sin(d * 0.02 + fk * 1.7) * min(1.0, r / max(d, 1.0));
    float width = mix(3.0, 8.5, clamp((d - crater) / r, 0.0, 1.0));
    float across = abs(angleBetween(angle, course)) * d - width;
    float reach = k == 1 ? r * 1.3 : 100000.0;
    best = min(best, max(across, max(crater * 0.7 - d, d - reach)));
  }
  return vec2(1.0 - smoothstep(-0.8, 0.8, best), best);
}
`;

const RIVER = /* glsl */ `
// The river splits the halves the whole width of the table. It leaves the volcano (when there is
// one) at the volcano's height and bends onto the seam downstream.
float riverCenter(float x) {
  float seam = uRiverY + 16.0 * sin(x * 0.003 + 1.3) + 24.0 * (fbm3(vec2(x / 600.0, 3.1)) - 0.5);
  if (uVolcano.z <= 0.0) return seam;
  return mix(uVolcano.y, seam, smoothstep(uVolcano.x, uVolcano.x + 420.0, x));
}
float riverHalfWidth(float x) {
  return 70.0 + 22.0 * (fbm3(vec2(x / 380.0, 7.7)) - 0.5);
}
`;

/**
 * Bake 1: the ground. The land has its own lie (terraced plateaus, ridges, hollows) and falls to
 * the river. Stones in three sizes ride on the land, a little proud of it; every gap between the
 * big and mid stones holds lava at the land's own level (the lava table), the way TCG Live's fire
 * board glows between its rocks. The volcano rises with broad sculpted facets, a crater and grooves
 * where its streams run; past its foot the streams run on at the land's level, in beds cleared of
 * stones, all the way to the table edge.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${VORONOI}
${STONES}
${VOLCANO}
${RIVER}
// The volcano's cone: a nine-sided pyramid softened toward a cone, so its flanks catch the light
// in broad panels; a raised rim round a flat crater pool; soft grooves where the streams run
// (streamEdge: volcanoLava's px from a stream's edge). Zero outside its foot.
float volcanoCone(vec2 p, float streamEdge) {
  float r = uVolcano.z;
  if (r <= 0.0) return 0.0;
  vec2 rel = p - uVolcano.xy;
  float d = length(rel);
  float sector = 6.2831853 / 9.0;
  float offAxis = mod(atan(rel.y, rel.x) + 0.3, sector) - sector * 0.5;
  float panelled = mix(d, d * cos(offAxis) / cos(sector * 0.5), 0.55) + (fbm3(p / 38.0) - 0.5) * r * 0.08;
  float cone = volcanoHeight() * pow(clamp(1.0 - panelled / r, 0.0, 1.0), 1.25);
  float crater = craterRadius();
  // Gullies down the flanks between rounded ridges, fading out at the rim and the foot.
  float gullies = abs(sin(atan(rel.y, rel.x) * 8.0 + fbm3(p / 60.0) * 2.0)) - 0.5;
  cone += gullies * r * 0.05 * smoothstep(crater, crater * 1.6, d) * (1.0 - smoothstep(r * 0.7, r * 0.95, d));
  float rim = craterRimHeight();
  if (d < crater) cone = mix(rim - r * ${VOLCANO_SHAPE.craterDepth.toFixed(3)}, rim + 2.0, smoothstep(crater * 0.8, crater, d));
  cone -= 5.0 * (1.0 - smoothstep(-3.0, 6.0, streamEdge)) * step(crater, d);
  return cone * (1.0 - smoothstep(r * 0.92, r * 1.04, d));
}
// The land's own lie in px: terraced plateaus with soft cliffs between them, ridges, hollows.
float landHeight(vec2 p) {
  float terraces = fbm3(p / 520.0 + 4.1) * 3.2;
  float level = (floor(terraces) + smoothstep(0.35, 1.0, fract(terraces))) / 3.2;
  float ridge = 1.0 - abs(2.0 * fbm3(p / 240.0 + 1.7) - 1.0);
  float hollow = smoothstep(0.62, 0.85, fbm3(p / 300.0 + 8.8));
  return 46.0 * level + 20.0 * ridge * ridge - 22.0 * hollow - 10.0;
}
void main() {
  vec2 p = uMin + vUv * uSize;
  vec2 warp = vec2(fbm3(p / 260.0), fbm3(p / 260.0 + 17.3)) - 0.5;
  vec2 q = p + warp * 46.0;
  float wobble = (fbm3(p / 90.0) - 0.5) * 22.0;

  float lavaSD = abs(p.y - riverCenter(p.x)) - riverHalfWidth(p.x) + wobble;
  float nearLava = 1.0 - smoothstep(0.0, 110.0, lavaSD);
  float inLava = 1.0 - smoothstep(-14.0, 0.0, lavaSD);
  float bank = 1.0 - smoothstep(-26.0, 0.0, lavaSD);
  float base = mix(landHeight(p), ${LAVA_LEVEL.toFixed(1)} - 7.0, nearLava) - 16.0 * bank;
  // The volcano's side streams run level, down a broad valley eased into the land: over the hills
  // a straight stream would bow on screen under the tilted camera.
  vec2 lava = volcanoLava(p);
  float vd = distance(p, uVolcano.xy);
  float valley = (1.0 - smoothstep(6.0, 70.0, lava.y)) * smoothstep(uVolcano.z * 0.7, uVolcano.z * 1.1, vd)
    * step(0.001, uVolcano.z);
  base = mix(base, ${STREAM_LEVEL_PX.toFixed(1)}, valley * (1.0 - nearLava));

  // Hills: broad swells of taller rock, so the stones vary with the land.
  float hills = fbm3(p / 340.0 + 2.3);
  float swell = 0.45 + 1.25 * smoothstep(0.25, 0.8, hills);
  vec3 big = stones(q + 31.0, mix(115.0, 175.0, fbm3(p / 500.0 + 9.0)), 1.5);
  vec3 mid = stones(q, 60.0, 1.2);
  vec3 pebble = stones(q + 113.0, 27.0, 1.6);
  float dry = smoothstep(-4.0, 60.0, lavaSD);
  // A few stones stand in the river as islands.
  float islands = 30.0 * step(0.88, mid.y) * smoothstep(-60.0, -24.0, lavaSD);
  float hBig = big.x * 20.0 * swell * dry;
  float hMid = mid.x * max(13.0 * mix(0.7, 1.4, hills) * (1.0 - inLava), islands * inLava);
  float hPebble = pebble.x * 5.0 * (1.0 - 0.7 * inLava) * (0.4 + 0.6 * nearLava);
  float rock = max(max(hBig, hMid), hPebble);
  float id = rock == hBig ? big.y : (rock == hMid ? mid.y : pebble.y);

  // Cracks: the gaps between the big stones, and the mid gaps splitting some of them (all of them
  // by the river, where the big stones give way), are carved down to bare ground; the floor dips
  // toward the gap's middle, where the lava runs deepest and hottest. Lava fills only part of the
  // network, more of it near the river and the volcano; the other cracks stay dry. None in the last
  // px before the table edge.
  vec2 fromEdge = min(vUv, 1.0 - vUv) * uSize;
  float crackOn = smoothstep(12.0, 20.0, min(fromEdge.x, fromEdge.y));
  float split = max(step(0.85, fract(big.y * 23.7)), 1.0 - dry);
  float gap = min(big.z, mix(40.0, mid.z, split));
  rock *= mix(1.0, smoothstep(0.0, 7.0, gap), crackOn);
  float dip = 2.0 * smoothstep(0.0, -1.5, gap) * crackOn;
  float nearHeat = max(1.0 - smoothstep(0.0, 220.0, lavaSD),
    step(0.001, uVolcano.z) * (1.0 - smoothstep(uVolcano.z, uVolcano.z * 2.2, vd)));
  float crackLava = crackOn * smoothstep(0.6, 0.68, fbm3(p / 230.0 + 13.0) + 0.3 * nearHeat);

  // Past the cone's foot the streams run on in beds cleared of stones.
  float pastFoot = step(uVolcano.z * 0.9, vd) * step(0.001, uVolcano.z);
  float bed = (1.0 - smoothstep(0.0, 14.0, lava.y)) * pastFoot;
  rock *= 1.0 - bed;
  dip = max(dip, 3.0 * (1.0 - smoothstep(-6.0, 0.0, lava.y)) * pastFoot);

  float height = base + rock - dip;
  float lavaTable = base + mix(-4.0, ${CRACK_FILL_PX.toFixed(1)}, max(crackLava, bed));
  if (rock < 0.6) id = -1.0;

  float cone = volcanoCone(p, lava.y);
  if (cone > 0.5) {
    height = max(height, base + cone);
    id = 2.0;
  }

  gl_FragColor = vec4(height, lavaSD, lavaTable, id);
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
  float ground = groundAt(uv);
  // Where the ground dips under the lava table the surface is the lava's, flat; the river's own
  // sheet (LAVA_LEVEL) covers the ground under it instead.
  float lavaTable = texture2D(uField, uv).b;
  float h = mix(ground, max(ground, lavaTable), smoothstep(${LAVA_LEVEL.toFixed(1)} + 0.3, ${LAVA_LEVEL.toFixed(1)} + 1.0, lavaTable));
  float growth = terrainGrowth(p);
  vPos = p;
  vUv = uv;
  vGrowth = growth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, h * growth * edgeSkirt(uv), 1.0);
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${LAVA_RAMP}
${REVEAL}
${VOLCANO}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;

// Streaks running along a flow (frame: px along it, px across it): two noise phases cross-faded,
// so they keep moving without stretching.
float flowStreaks(vec2 frame, float speed, float period) {
  float phaseA = fract(uTime / period);
  float phaseB = fract(uTime / period + 0.5);
  float weightA = 1.0 - abs(2.0 * phaseA - 1.0);
  vec2 scale = vec2(1.0 / 26.0, 1.0 / 5.0);
  float a = gnoise((frame - vec2(speed * period * phaseA, 0.0)) * scale);
  float b = gnoise((frame - vec2(speed * period * phaseB, 0.0)) * scale + vec2(3.7, 1.3));
  return mix(b, a, weightA);
}

// The crater pool: lava turning slowly, swirled with bright bands, cooling red toward the shore.
// rel: px from the volcano's centre.
vec3 craterPool(vec2 rel, float poolRadius) {
  float d = length(rel);
  float spin = uTime * 0.08 + (1.0 - d / poolRadius) * 0.9;
  vec2 turned = mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * rel;
  float churn = fbm3(turned / 14.0 + uTime * 0.12);
  float swirl = smoothstep(0.45, 0.7, gnoise(turned / 7.0 - uTime * 0.2));
  float shore = smoothstep(poolRadius * 0.6, poolRadius, d);
  return lavaColor(0.6 + (churn - 0.5) * 0.5 + swirl * 0.18 - shore * 0.35);
}

void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float ground = field.r;
  float riverSD = field.g;
  float lavaTable = field.b;
  float id = field.a;
  float isStone = step(0.0, id);
  float onVolcano = step(1.5, id);

  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sun = normalize(uSun);

  // Painted three-tone ramp: cool shadow on faces turned away, mid slate on flat tops, light grey
  // on faces turned to the sun; the baked sun shadow pushes faces toward the shadow tone.
  float tone = fract(id * 13.7) * isStone;
  float facing = dot(n, sun) * mix(0.45, 1.0, light.a);
  vec3 col = mix(vec3(0.058, 0.06, 0.074), vec3(0.088, 0.092, 0.108), smoothstep(0.3, 0.5, facing));
  col = mix(col, vec3(0.138, 0.143, 0.16), smoothstep(0.8, 0.92, facing));
  col *= 0.9 + 0.2 * tone;
  col *= 0.88 + 0.16 * smoothstep(-6.0, 50.0, ground);
  // Bare ground between stones is darker ash; the volcano is darker basalt.
  col *= mix(0.72, 1.0, isStone) * mix(1.0, 0.85, onVolcano);

  // Painted rim: convex edges (negative height Laplacian) catch a light stroke.
  vec2 t2 = uTexel * 3.0;
  float laplace = texture2D(uField, vUv + vec2(t2.x, 0.0)).r + texture2D(uField, vUv - vec2(t2.x, 0.0)).r
    + texture2D(uField, vUv + vec2(0.0, t2.y)).r + texture2D(uField, vUv - vec2(0.0, t2.y)).r - 4.0 * ground;
  float convex = smoothstep(0.8, 3.5, -laplace) * vGrowth;
  col = mix(col, vec3(0.2, 0.21, 0.24), convex * 0.55 * smoothstep(0.35, 0.85, n.z));

  // Painted cracks: thin light lines across the tops of some stones.
  vec4 crack = voronoiCell(p / 22.0 + id * 17.0);
  float crackLine = (1.0 - smoothstep(0.015, 0.04, crack.x)) * smoothstep(0.82, 0.95, n.z)
    * smoothstep(0.55, 0.7, gnoise(p / 26.0 + id * 5.0)) * isStone * step(0.4, tone);
  col = mix(col, col * 1.45 + 0.01, crackLine * 0.6);

  // Occlusion: crevices and the feet of stones go deep blue-grey.
  col = mix(vec3(0.036, 0.034, 0.046), col, smoothstep(0.3, 0.9, light.b));

  // Lava light. Lava near the river and the volcano runs hotter than out in the cracks. Rock just
  // above the lava beside it (the river's sheet, or the lava in its own cracks) glows red, side
  // faces most; the river throws a broader bounce on the rock along its banks.
  vec2 rel = p - uVolcano.xy;
  float vd = length(rel);
  float hasVolcano = step(0.001, uVolcano.z);
  float hot = max(1.0 - smoothstep(-20.0, 170.0, riverSD), hasVolcano * (1.0 - smoothstep(uVolcano.z, uVolcano.z * 2.4, vd)));
  float aboveLava = max(ground - max(lavaTable, ${LAVA_LEVEL.toFixed(1)}), 0.0);
  float flicker = 0.88 + 0.12 * gnoise(vec2(uTime * 0.8, p.x / 80.0 + p.y / 120.0));
  float sideFacing = 1.0 - smoothstep(0.55, 0.95, n.z);
  float underglow = exp(-aboveLava / 3.0) * mix(0.2, 1.0, sideFacing) * mix(0.3, 0.6, hot);
  float bounce = exp(-max(riverSD, 0.0) / 45.0) * exp(-max(ground - ${LAVA_LEVEL.toFixed(1)}, 0.0) / 24.0) * mix(0.15, 1.0, sideFacing);
  col += vec3(1.0, 0.16, 0.02) * (underglow + bounce * 0.28) * flicker;

  // The volcano: its streams warm the rock right beside them; the crater lights its rim and inner
  // walls.
  vec2 volcanic = volcanoLava(p);
  float besideLava = exp(-max(volcanic.y, 0.0) / 6.0) * hasVolcano * mix(0.5, 1.0, sideFacing);
  col += vec3(1.0, 0.14, 0.01) * besideLava * flicker * 0.45;
  float crater = craterRadius();
  float craterGlow = (1.0 - smoothstep(crater * 0.85, crater * 1.35, vd)) * hasVolcano * onVolcano;
  col += vec3(1.0, 0.3, 0.03) * craterGlow * 0.5 * mix(0.4, 1.0, sideFacing) * flicker;

  // Lava the terrain carries itself: the cracks and the side streams, filled flat to the lava table
  // (above the river's sheet only), and on the cone the crater pool and the streams down its flanks.
  float lavaDepth = lavaTable - ground;
  float feather = max(fwidth(lavaDepth), 0.05);
  float pooled = smoothstep(-feather, feather, lavaDepth - 0.2)
    * smoothstep(${LAVA_LEVEL.toFixed(1)}, ${LAVA_LEVEL.toFixed(1)} + 0.3, lavaTable) * (1.0 - onVolcano);
  float slopeLava = volcanic.x * hasVolcano * (1.0 - step(uVolcano.z * 0.95, vd));
  float lavaCover = max(pooled, slopeLava);
  if (lavaCover > 0.001) {
    // Cracks: still lava, crusted dark red at the shore, brighter down the middle, a slow
    // breathing glow moving through it.
    float breathe = gnoise(p / 34.0 + vec2(uTime * 0.22, -uTime * 0.17));
    float grain = gnoise(p / 7.0 + vec2(0.0, uTime * 0.5));
    float crackHeat = 0.1 + smoothstep(0.5, 3.0, lavaDepth) * 0.22 + hot * 0.14 + (breathe - 0.5) * 0.6
      + (grain - 0.5) * 0.12;
    // Streams: running away from the volcano, streaked along their course, a molten core.
    float inStream = (1.0 - smoothstep(-1.0, 2.0, volcanic.y)) * hasVolcano;
    float angle = atan(rel.y, rel.x);
    float course = clamp(floor(angle / STREAM_SPREAD + 0.5), -1.0, 1.0) * STREAM_SPREAD;
    float streak = flowStreaks(vec2(vd, (angle - course) * vd), 18.0, 3.0);
    float streamHeat = 0.38 + smoothstep(0.0, 5.0, -volcanic.y) * 0.3 + (streak - 0.5) * 0.5;
    vec3 lavaCol = lavaColor(mix(crackHeat, streamHeat, inStream));
    float poolRadius = crater * 0.82;
    if (vd < poolRadius + 1.0) lavaCol = mix(lavaCol, craterPool(rel, poolRadius), 1.0 - smoothstep(poolRadius - 2.0, poolRadius, vd));
    col = mix(col, lavaCol, lavaCover);
  }

  vec2 edgeUv = min(vUv, 1.0 - vUv);
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.05, min(edgeUv.x, edgeUv.y)));

  float front = revealFront();
  col += lavaColor(0.7) * smoothstep(front - 0.035, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  float gone = uExit * 1.1;
  col += lavaColor(0.7) * (1.0 - smoothstep(gone, gone + 0.04, fbm3(p / 110.0 + 5.0))) * step(0.001, uExit);

  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const LAVA_VERTEX = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The lava sheet. Shallow lava (the gaps, the banks, the stream channels) is deep red; the open
 * river runs orange with a gold core. Banded colour, soft wavy flow lines streaming downstream
 * (+x, bending along the banks), round rafts of crust with glowing rims, bubbles that swell and pop.
 */
export const LAVA_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform vec2 uTexel;
uniform float uTime;
uniform vec3 uSun;
${NOISE}
${LAVA_RAMP}
${REVEAL}
varying vec2 vPos;

// One flow phase: x heat noise 0..1, y flow-line strength 0..1.
vec2 flowPhase(vec2 q) {
  float swirl = fbm3(q / 110.0);
  float ripple = gnoise(q / 34.0 + 4.0);
  float wave = sin((q.y + (swirl - 0.5) * 70.0 + (ripple - 0.5) * 18.0) / 9.0);
  float line = smoothstep(0.82, 0.97, wave) * smoothstep(0.35, 0.65, gnoise(q / vec2(140.0, 60.0) + 2.0));
  return vec2(swirl * 0.7 + ripple * 0.3, line);
}

void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec2 uv = (p - uMin) / uSize;
  vec4 field = texture2D(uField, uv);
  float ground = field.r;
  if (ground > ${LAVA_LEVEL.toFixed(1)} + 1.0) discard;
  float depth = ${LAVA_LEVEL.toFixed(1)} - ground;
  float riverSD = field.g;

  // Flow follows the smooth bank distance (G), never the stones under the lava.
  vec2 e = uTexel * 6.0;
  vec2 towardBank = vec2(
    texture2D(uField, uv + vec2(e.x, 0.0)).g - texture2D(uField, uv - vec2(e.x, 0.0)).g,
    texture2D(uField, uv + vec2(0.0, e.y)).g - texture2D(uField, uv - vec2(0.0, e.y)).g);
  vec2 downstream = vec2(1.0, 0.0);
  vec2 bankNormal = length(towardBank) > 0.0001 ? normalize(towardBank) : vec2(0.0);
  vec2 alongBank = downstream - bankNormal * dot(downstream, bankNormal);
  // Mid-stream (where the bank normal flips) runs straight downstream; near banks it follows them.
  vec2 direction = normalize(downstream + (alongBank - downstream) * (1.0 - smoothstep(4.0, 24.0, -riverSD)));
  float openRiver = 1.0 - smoothstep(-20.0, 4.0, riverSD);
  float smoothDepth = mix(min(depth, 6.0), clamp(-riverSD * 0.35, 0.0, 16.0), openRiver);
  float speed = mix(2.0, 20.0, openRiver * smoothstep(2.0, 16.0, smoothDepth));
  vec2 velocity = direction * speed;

  float period = 4.0;
  float jitter = fbm3(p / 260.0) * 2.0;
  float phaseA = fract(uTime / period + jitter);
  float phaseB = fract(uTime / period + jitter + 0.5);
  float weightA = 1.0 - abs(2.0 * phaseA - 1.0);
  vec2 flow = mix(flowPhase(p - velocity * phaseB * period + vec2(53.0, 29.0)), flowPhase(p - velocity * phaseA * period), weightA);

  float pools = smoothstep(0.35, 0.75, fbm3((p - vec2(uTime * 6.0, 0.0)) / 180.0));
  float core = smoothstep(-24.0, -58.0, riverSD);
  float heat = smoothstep(1.0, 16.0, smoothDepth) * 0.36 + openRiver * 0.06 + core * 0.16 + (flow.x - 0.5) * 0.6
    + pools * 0.16 + flow.y * 0.38;
  // Shallow lava and the river's edge stay red like the cracks' lava, never a dark smudge.
  heat = max(heat, 0.25);
  heat += 0.06 * sin(uTime * 1.1 + p.x / 90.0);
  vec3 col = lavaColor(heat);

  // Crust: round cartoon rafts of cooled rock, domed, with a glowing rim, drifting downstream as
  // one rigid sheet so they never stretch or ghost.
  vec2 raft = p - vec2(uTime * 7.0, 0.0);
  vec2 raftCell = floor(raft / 40.0);
  vec2 raftCentre = (raftCell + 0.3 + 0.4 * hash22(raftCell + 5.0)) * 40.0;
  float raftRadius = mix(8.0, 16.0, hash12(raftCell + 9.0));
  vec2 fromCentre = (raft - raftCentre) / vec2(1.35, 1.0);
  float raftDistance = length(fromCentre) + (gnoise(raft / 9.0) - 0.5) * 4.0 - raftRadius;
  float coverage = mix(0.3, 0.16, openRiver) + (fbm3(raft / 220.0) - 0.5) * 0.4;
  float hasRaft = step(hash12(raftCell + 2.0), coverage) * smoothstep(3.0, 9.0, smoothDepth);
  float body = (1.0 - smoothstep(-1.0, 0.0, raftDistance)) * hasRaft;
  float raftRim = (1.0 - smoothstep(0.0, 3.0, raftDistance)) * hasRaft;
  vec3 raftNormal = normalize(vec3(fromCentre / raftRadius * 0.9, 1.0));
  float raftKey = smoothstep(0.55, 0.95, dot(raftNormal, normalize(uSun)));
  vec3 crust = mix(vec3(0.06, 0.06, 0.07), vec3(0.12, 0.12, 0.135), raftKey);
  crust += vec3(0.45, 0.05, 0.0) * smoothstep(-3.5, -0.5, raftDistance);
  col = mix(col, lavaColor(0.88), raftRim * (1.0 - body));
  col = mix(col, crust, body);

  // Bubbles: swell for most of their life, then pop as a widening ring.
  vec2 cell = floor(raft / 42.0);
  float bubblePeriod = 2.6 + 2.4 * hash12(cell + 3.0);
  float life = fract(uTime / bubblePeriod + hash12(cell));
  float hasBubble = step(0.55, hash12(cell + 11.0)) * smoothstep(6.0, 12.0, smoothDepth) * (1.0 - body);
  vec2 centre = (cell + 0.2 + 0.6 * hash22(cell + 7.0)) * 42.0;
  float r = distance(raft, centre);
  float swell = smoothstep(0.0, 0.8, life) * 7.0;
  float dome = (1.0 - smoothstep(swell - 1.2, swell, r)) * step(life, 0.82);
  float pop = smoothstep(0.82, 1.0, life);
  float ring = (1.0 - smoothstep(0.6, 1.6, abs(r - (7.0 + pop * 9.0)))) * step(0.82, life) * (1.0 - pop);
  col = mix(col, lavaColor(0.95) * (1.0 + 0.25 * (1.0 - r / max(swell, 0.001))), dome * hasBubble * 0.85);
  col += lavaColor(0.9) * ring * hasBubble * 0.8;

  float front = revealFront();
  col += lavaColor(0.7) * smoothstep(front - 0.035, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * Motes and embers (TCG Live's board motes): most rise off the river, a share bursts from the
 * crater. Size in table px, perspective-scaled; HDR so they read as glowing.
 */
export const EMBER_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${REVEAL}
${VOLCANO}
${RIVER}
attribute vec4 aSeed;
varying float vLife;
varying float vKind;
void main() {
  float fromCrater = step(aSeed.w, 0.12) * step(0.001, uVolcano.z);
  float period = mix(3.5 + aSeed.w * 4.5, 2.2 + aSeed.z * 1.6, fromCrater);
  float life = mod(uTime + aSeed.z * period, period) / period;
  float cycle = floor((uTime + aSeed.z * period) / period);
  vec2 jitter = hash22(aSeed.xy * 97.0 + cycle) - 0.5;
  float x = uMin.x + fract(aSeed.x + jitter.x * 0.3) * uSize.x;
  float y = riverCenter(x) + (aSeed.y - 0.5) * 150.0 + jitter.y * 40.0;
  vec3 pos = vec3(x, y, ${LAVA_LEVEL.toFixed(1)} + 2.0);
  pos.x += life * 36.0 + sin(life * 6.0 + aSeed.z * 20.0) * 10.0 * life;
  pos.y += sin(life * 4.0 + aSeed.w * 30.0) * 8.0 * life;
  pos.z += life * (100.0 + 120.0 * aSeed.w);
  vec2 spread = (hash22(aSeed.zy * 53.0 + cycle) - 0.5) * craterRadius() * 1.2;
  vec3 crater = vec3(uVolcano.xy + spread + jitter * life * 170.0, craterRimHeight() - 4.0 + life * (130.0 + 90.0 * aSeed.y));
  pos = mix(pos, crater, fromCrater);
  float onTable = smoothstep(uMin.x + 20.0, uMin.x + 90.0, pos.x) * (1.0 - smoothstep(uMin.x + uSize.x - 90.0, uMin.x + uSize.x - 20.0, pos.x));
  float shown = revealBurned(pos.xy) * exitKeep(pos.xy) * max(onTable, fromCrater);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizePx = (1.6 + aSeed.z * 2.4) * (1.0 - life * 0.5);
  gl_PointSize = max(sizePx * uFocal / -mv.z, 2.0) * 2.4 * shown;
  vLife = life;
  vKind = max(step(0.75, aSeed.w), fromCrater);
}
`;

export const EMBER_FRAGMENT = /* glsl */ `
varying float vLife;
varying float vKind;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.35, 0.5, d);
  float glow = exp(-d * d * 3.0) * 0.5;
  float fade = smoothstep(0.0, 0.1, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
  vec3 hot = mix(vec3(2.0, 0.55, 0.05), vec3(1.8, 0.8, 0.14), vKind);
  vec3 col = mix(hot, vec3(0.7, 0.05, 0.0), smoothstep(0.3, 1.0, vLife));
  gl_FragColor = vec4(col * (core + glow) * fade, 1.0);
${OUTPUT}
}
`;

/**
 * Smoke from the crater: round cartoon puffs painted in two tones (lit on the sun's side, charcoal
 * in shadow), warmed by the crater from below while young, drifting off on the wind.
 */
export const SMOKE_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${REVEAL}
${VOLCANO}
attribute vec4 aSeed;
varying float vLife;
varying float vSeed;
void main() {
  float period = 5.0 + aSeed.w * 2.5;
  float life = mod(uTime + aSeed.z * period, period) / period;
  vec2 wobble = vec2(sin(life * 5.0 + aSeed.x * 20.0), cos(life * 4.0 + aSeed.y * 20.0)) * 8.0;
  vec3 pos = vec3(uVolcano.xy + (aSeed.xy - 0.5) * craterRadius() + wobble + vec2(110.0, 70.0) * life,
    craterRimHeight() + 6.0 + life * 170.0);
  float shown = step(0.001, uVolcano.z) * revealBurned(uVolcano.xy) * (1.0 - uExit);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizePx = mix(10.0, 40.0, sqrt(life)) * (0.8 + 0.4 * aSeed.z) * uVolcano.z / 100.0;
  gl_PointSize = sizePx * uFocal / -mv.z * shown;
  vLife = life;
  vSeed = aSeed.x * 31.0;
}
`;

export const SMOKE_FRAGMENT = /* glsl */ `
${NOISE}
${LAVA_RAMP}
varying float vLife;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float edge = length(c) * 2.0 + (gnoise(c * 3.0 + vSeed) - 0.5) * 0.25;
  float puff = 1.0 - smoothstep(0.55, 0.9, edge);
  // Shade the puff as a ball (point-sprite y runs down the screen), softly so overlapping puffs merge.
  vec2 disc = c * 2.0;
  vec3 ball = vec3(disc.x, -disc.y, sqrt(max(1.0 - dot(disc, disc), 0.0)));
  float key = dot(ball, normalize(vec3(-0.45, 0.5, 0.74)));
  vec3 smoke = mix(vec3(0.13, 0.125, 0.145), vec3(0.29, 0.28, 0.32), smoothstep(0.0, 0.6, key));
  float warm = smoothstep(-0.05, 0.4, c.y) * (1.0 - smoothstep(0.0, 0.55, vLife));
  smoke = mix(smoke, lavaColor(0.45) * 0.55, warm * 0.65);
  // Thin over the crater, so it stays in sight from above; fuller as the puff drifts off.
  float fade = smoothstep(0.25, 0.5, vLife) * (1.0 - smoothstep(0.65, 1.0, vLife));
  gl_FragColor = vec4(smoke, puff * fade * 0.6);
${OUTPUT}
}
`;
