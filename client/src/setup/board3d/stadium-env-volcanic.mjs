// Design 077 (prototype): the volcanic recipe. Scorched Earth as a procedural three.js
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
// Design 082 (Brilliant Diamond / Shining Pearl, Stark Mountain): the stones warm basalt on a smooth
// ramp in BDSP's soft light.
// Design 084 (the visual audit): the scene runs on past the table (the board's margins); the volcano
// is the top-left landmark, its main stream running down into the river; the river runs open only
// out past the cards' block, through the free band left of the cards and out to the margins, and
// under the cards it is cooled dark crust with a few dim cracks; the stones take the kit's soft
// wrapped key with deep creases between them, so the board joins the set; the lava cracks gather
// near the river and fade toward the Benches.
// Design 085 (a hostile review: "procedural and empty"): the card's values: near-black basalt and one
// bright thing, the lava. The river is a wide striated gold-orange flow down the free strip left of the
// cards (lavaPath), from the volcano's foot to the near margin, never under the card block; the rock
// is dark, lit orange within ~150 px of the lava; big plate-like landforms instead of one stone tile;
// the volcano a low lumpy mountain with two winding forked channels and a dimmer crater; dark smoke
// lit from below; the far margin hazed red-brown, the near margin dark.
import {
  FOOTPRINTS,
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
// Design 085: lower and broader, a smaller crater (stadium-environment-layout.mjs VOLCANO_RISE matches).
export const VOLCANO_SHAPE = { height: 0.7, crater: 0.14, craterDepth: 0.07 };
/** Design 085: the most points the lava river's course holds (stadium-environment-layout.mjs LAVA_PATH). */
export const MAX_RIVER_POINTS = 6;
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
// Design 085: the lava river's course (lavaPath): points (x, y, half width), source first.
uniform vec4 uRiver[${MAX_RIVER_POINTS}];
uniform float uRiverCount;
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
// The way the volcano's channels run: toward the river's source below it (straight down the screen
// without a river).
float streamHeading() {
  vec2 to = uRiverCount > 0.5 ? uRiver[0].xy - uVolcano.xy : vec2(0.0, -1.0);
  return atan(to.y, to.x);
}
// Lava from the volcano: the crater pool and two winding channels down its flanks toward the river,
// each forking once past mid-slope, all ending at the cone's foot. x = 1 on lava, y = signed px from
// its edge, z = the nearest channel's course (rad).
vec3 volcanoLava(vec2 p) {
  float r = uVolcano.z;
  if (r <= 0.0) return vec3(0.0, 9000.0, 0.0);
  vec2 rel = p - uVolcano.xy;
  float d = length(rel);
  float crater = craterRadius();
  float best = d - crater * 0.82;
  float course = streamHeading();
  float angle = atan(rel.y, rel.x);
  float heading = course;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float side = mod(fk, 2.0) < 0.5 ? -1.0 : 1.0;
    float fork = step(1.5, fk);
    float wind = 0.16 * sin(d * 0.035 + fk * 2.1) * smoothstep(crater, r * 0.5, d);
    // Two channels close together down toward the river, each forking a little way off its course
    // (wide forks read as spider legs).
    float way = heading + side * 0.2 + fork * side * 0.24 * smoothstep(r * 0.55, r * 0.95, d) + wind;
    float from = mix(crater * 0.7, r * 0.55, fork);
    float width = mix(3.0, 7.5, clamp((d - crater) / r, 0.0, 1.0)) * mix(1.0, 0.7, fork);
    float sd = max(abs(angleBetween(angle, way)) * d - width, max(from - d, d - r * 1.02));
    if (sd < best) {
      best = sd;
      course = way;
    }
  }
  return vec3(1.0 - smoothstep(-0.8, 0.8, best), best, course);
}
`;

const RIVER = /* glsl */ `
// Design 085: the river at p, from its course (uRiver): x px from its bank (negative in it), y px
// along it from its source, z signed px across its centre line, w its way downstream (rad). 9000 off
// it when it has no course.
vec4 riverFrame(vec2 p) {
  vec4 frame = vec4(9000.0, 0.0, 0.0, -1.5707963);
  float run = 0.0;
  for (int i = 0; i < ${MAX_RIVER_POINTS - 1}; i++) {
    if (float(i) >= uRiverCount - 1.0) break;
    vec4 a = uRiver[i];
    vec4 b = uRiver[i + 1];
    vec2 ab = b.xy - a.xy;
    float len = max(length(ab), 0.001);
    vec2 unit = ab / len;
    float t = clamp(dot(p - a.xy, unit), 0.0, len);
    vec2 off = p - (a.xy + unit * t);
    float sd = length(off) - mix(a.z, b.z, t / len);
    if (sd < frame.x) frame = vec4(sd, run + t, dot(off, vec2(-unit.y, unit.x)), atan(unit.y, unit.x));
    run += len;
  }
  return frame;
}
// The river's centre line at share s of its course (0 source .. 1 mouth): xy, and its half width.
vec3 riverPoint(float s) {
  float at = clamp(s, 0.0, 0.9999) * max(uRiverCount - 1.0, 1.0);
  float t = fract(at);
  vec4 a = uRiver[0];
  vec4 b = uRiver[1];
  for (int k = 0; k < ${MAX_RIVER_POINTS - 1}; k++) {
    if (float(k) == floor(at)) {
      a = uRiver[k];
      b = uRiver[k + 1];
    }
  }
  return vec3(mix(a.xy, b.xy, t), mix(a.z, b.z, t));
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
${FOOTPRINTS}
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
  // Design 085: a lumpy outline (never past r, the layout's circle), panels only hinted.
  float outline = r * (1.0 - 0.18 * fbm3(rel / max(d, 1.0) * 2.2 + 7.0));
  float sector = 6.2831853 / 9.0;
  float offAxis = mod(atan(rel.y, rel.x) + 0.3, sector) - sector * 0.5;
  float panelled = mix(d, d * cos(offAxis) / cos(sector * 0.5), 0.25) + (fbm3(p / 38.0) - 0.5) * r * 0.08;
  float cone = volcanoHeight() * pow(clamp(1.0 - panelled / outline, 0.0, 1.0), 1.25);
  float crater = craterRadius();
  // Gullies down the flanks between rounded ridges, fading out at the rim and the foot.
  float gullies = abs(sin(atan(rel.y, rel.x) * 8.0 + fbm3(p / 60.0) * 2.0)) - 0.5;
  cone += gullies * r * 0.035 * smoothstep(crater, crater * 1.6, d) * (1.0 - smoothstep(r * 0.7, r * 0.95, d));
  float rim = craterRimHeight();
  if (d < crater) cone = mix(rim - r * ${VOLCANO_SHAPE.craterDepth.toFixed(3)}, rim + 2.0, smoothstep(crater * 0.8, crater, d));
  cone -= 5.0 * (1.0 - smoothstep(-3.0, 6.0, streamEdge)) * step(crater, d);
  return cone * (1.0 - smoothstep(outline * 0.92, outline * 1.02, d));
}
// The land's own lie in px: terraced plateaus with soft cliffs between them, ridges, hollows.
float landHeight(vec2 p) {
  float terraces = fbm3(p / 520.0 + 4.1) * 3.2;
  float level = (floor(terraces) + smoothstep(0.35, 1.0, fract(terraces))) / 3.2;
  float ridge = 1.0 - abs(2.0 * fbm3(p / 240.0 + 1.7) - 1.0);
  // Design 085: broad ridges about 500 px apart, the big dark masses the card's slope has.
  float broad = 1.0 - abs(2.0 * fbm3(p / 500.0 + 6.1) - 1.0);
  float hollow = smoothstep(0.62, 0.85, fbm3(p / 300.0 + 8.8));
  // Never under the lava's level out of the river's bed (the river's sheet would show in a hollow).
  return max(46.0 * level + 20.0 * ridge * ridge + 40.0 * broad * broad - 22.0 * hollow - 10.0, -6.0);
}
void main() {
  vec2 p = uMin + vUv * uSize;
  vec2 warp = vec2(fbm3(p / 260.0), fbm3(p / 260.0 + 17.3)) - 0.5;
  vec2 q = p + warp * 46.0;
  float wobble = (fbm3(p / 90.0) - 0.5) * 22.0;

  float lavaSD = riverFrame(p).x + wobble;
  float nearLava = 1.0 - smoothstep(0.0, 110.0, lavaSD);
  float inLava = 1.0 - smoothstep(-14.0, 0.0, lavaSD);
  float bank = 1.0 - smoothstep(-26.0, 0.0, lavaSD);
  float base = mix(landHeight(p), ${LAVA_LEVEL.toFixed(1)} - 7.0, nearLava) - 16.0 * bank;
  // The volcano's side streams run level, down a broad valley eased into the land: over the hills
  // a straight stream would bow on screen under the tilted camera.
  vec3 lava = volcanoLava(p);
  float vd = distance(p, uVolcano.xy);
  float valley = (1.0 - smoothstep(6.0, 70.0, lava.y)) * smoothstep(uVolcano.z * 0.7, uVolcano.z * 1.1, vd)
    * step(0.001, uVolcano.z);
  base = mix(base, ${STREAM_LEVEL_PX.toFixed(1)}, valley * (1.0 - nearLava));

  float nearHeat = max(1.0 - smoothstep(0.0, 220.0, lavaSD),
    step(0.001, uVolcano.z) * (1.0 - smoothstep(uVolcano.z, uVolcano.z * 2.2, vd)));
  // Hills: broad swells of taller rock, so the stones vary with the land. Design 085: big plates
  // (260-420 px) with soft creases, the mid stones and pebbles only by the heat (one repeated tile read
  // as a floor decal).
  float hills = fbm3(p / 340.0 + 2.3);
  float swell = 0.45 + 1.25 * smoothstep(0.25, 0.8, hills);
  vec3 big = stones(q + 31.0, mix(260.0, 420.0, fbm3(p / 600.0 + 9.0)), 6.0);
  vec3 mid = stones(q, 60.0, 1.2);
  vec3 pebble = stones(q + 113.0, 27.0, 1.6);
  float byHeat = smoothstep(0.2, 0.4, nearHeat);
  float dry = smoothstep(-4.0, 60.0, lavaSD);
  // A few stones stand in the river as islands.
  float islands = 30.0 * step(0.88, mid.y) * smoothstep(-60.0, -24.0, lavaSD);
  float hBig = big.x * 26.0 * swell * dry;
  float hMid = mid.x * max(13.0 * mix(0.7, 1.4, hills) * (1.0 - inLava) * byHeat, islands * inLava);
  float hPebble = pebble.x * 5.0 * (1.0 - 0.7 * inLava) * (0.4 + 0.6 * nearLava) * byHeat;
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
  // Design 085: crisp cracks only by the heat; out in the field the big plates meet in broad soft
  // creases (crisp lines everywhere read as cracked tiles).
  rock *= mix(1.0, smoothstep(0.0, mix(36.0, 7.0, smoothstep(0.2, 0.5, nearHeat)), gap), crackOn);
  float dip = 2.0 * smoothstep(0.0, -1.5, gap) * crackOn;
  // Design 080: the cracks round the cards run dry (dark ash), so no glowing line lies beside a card.
  // Design 084: the lava cracks gather near the river and the volcano and fade out toward the Benches.
  // Design 085: none within 140 px of a card (a red smear beside an Active).
  float crackLava = crackOn * smoothstep(0.6, 0.68, fbm3(p / 230.0 + 13.0) + 0.45 * nearHeat - 0.15)
    * (1.0 - fieldCalm(p, 140.0)) * smoothstep(0.05, 0.35, nearHeat);

  // Past the cone's foot the streams run on in beds cleared of stones.
  float pastFoot = step(uVolcano.z * 0.9, vd) * step(0.001, uVolcano.z);
  float bed = (1.0 - smoothstep(0.0, 14.0, lava.y)) * pastFoot;
  rock *= 1.0 - bed;
  dip = max(dip, 3.0 * (1.0 - smoothstep(-6.0, 0.0, lava.y)) * pastFoot);

  float height = base + rock - dip;
  // Design 085: a dry crack's lava table lies well under it (4 px under, its floor glowed as if lava ran
  // there: a red vein net over the whole field).
  float lavaTable = base + mix(-12.0, ${CRACK_FILL_PX.toFixed(1)}, max(crackLava, bed));
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
${FOOTPRINTS}
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
  // Design 085: a crusted pool, its heat in the swirl's cracks (a bright orange ball read as a stamp).
  return lavaColor(0.34 + (churn - 0.5) * 0.4 + swirl * 0.3 - shore * 0.2);
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

  // Design 082 (Brilliant Diamond / Shining Pearl, Stark Mountain): warm basalt in BDSP's soft light.
  // Design 084: lit as the kit lights its solids, a soft key wrapping round each stone's form (no hard
  // terminator), the warm fill of the lava's light from below and the sky's from above; the baked sun
  // shadow pushes faces toward the fill.
  float tone = fract(id * 13.7) * isStone;
  float wrapKey = clamp((dot(n, sun) + 0.35) / 1.35, 0.0, 1.0);
  wrapKey = wrapKey * wrapKey * (3.0 - 2.0 * wrapKey) * mix(0.5, 1.0, light.a);
  // Design 085: near-black basalt (the card's #302a27-#3a302b) under a warm fill: the lava is the one
  // bright thing.
  vec3 basalt = vec3(0.052, 0.043, 0.038);
  vec3 col = basalt * (vec3(1.0, 0.94, 0.88) * wrapKey * 1.1) + vec3(0.05, 0.04, 0.036) * (0.32 + 0.18 * n.z);
  col *= 0.9 + 0.2 * tone;
  col *= 0.88 + 0.16 * smoothstep(-6.0, 50.0, ground);
  // Design 083: not one basalt: some stones cool slate, some rusty, and broad soft patches of ash
  // lighter and darker across the field, all quieter by the cards.
  float family = fract(id * 7.31);
  float calm = fieldCalm(p, 80.0);
  float quietStone = 1.0 - 0.7 * calm;
  col = mix(col, col * vec3(1.12, 0.95, 0.85), step(family, 0.16) * isStone * quietStone);
  col *= 1.0 + 0.16 * (fbm3(p / 320.0 + 2.0) - 0.5) * quietStone;
  // Bare ground between stones is darker ash; the volcano is darker basalt.
  col *= mix(0.72, 1.0, isStone) * mix(1.0, 0.85, onVolcano);

  // Lava light's reach: near the river and the volcano.
  vec2 rel = p - uVolcano.xy;
  float vd = length(rel);
  float hasVolcano = step(0.001, uVolcano.z);
  float hot = max(1.0 - smoothstep(-20.0, 170.0, riverSD), hasVolcano * (1.0 - smoothstep(uVolcano.z, uVolcano.z * 2.4, vd)));
  // Painted rim: convex edges (negative height Laplacian) catch a light stroke (design 085: only in
  // the lava's light; lit rims everywhere read as a floor decal).
  vec2 t2 = uTexel * 3.0;
  float laplace = texture2D(uField, vUv + vec2(t2.x, 0.0)).r + texture2D(uField, vUv - vec2(t2.x, 0.0)).r
    + texture2D(uField, vUv + vec2(0.0, t2.y)).r + texture2D(uField, vUv - vec2(0.0, t2.y)).r - 4.0 * ground;
  float convex = smoothstep(0.8, 3.5, -laplace) * vGrowth;
  col = mix(col, vec3(0.42, 0.17, 0.08), convex * 0.5 * smoothstep(0.35, 0.85, n.z) * smoothstep(0.05, 0.45, hot));

  // Painted cracks: thin light lines across the tops of some stones, out in the world only
  // (design 080: no fine lines round the cards).
  vec4 crack = voronoiCell(p / 22.0 + id * 17.0);
  float crackLine = (1.0 - smoothstep(0.015, 0.04, crack.x)) * smoothstep(0.82, 0.95, n.z)
    * smoothstep(0.55, 0.7, gnoise(p / 26.0 + id * 5.0)) * isStone * step(0.4, tone);
  col = mix(col, col * 1.45 + 0.01, crackLine * 0.4 * (1.0 - fieldCalm(p, 140.0)));

  // Occlusion: crevices and the feet of stones go deep (design 084: the lump creases, deeper).
  col = mix(vec3(0.03, 0.022, 0.026), col, smoothstep(0.38, 0.92, light.b));

  // Lava light. Lava near the river and the volcano runs hotter than out in the cracks. Rock just
  // above the lava beside it (the river's sheet, or the lava in its own cracks) glows red, side
  // faces most; the river throws a broader bounce on the rock along its banks.
  float aboveLava = max(ground - max(lavaTable, ${LAVA_LEVEL.toFixed(1)}), 0.0);
  // A slow breath, not a flicker: light pulsing beside the cards pulls the eye off them.
  float flicker = 0.95 + 0.05 * gnoise(vec2(uTime * 0.35, p.x / 160.0 + p.y / 240.0));
  float sideFacing = 1.0 - smoothstep(0.55, 0.95, n.z);
  // Design 085: only by the lava (every far crack glowed red, a vein net over the whole field).
  float underglow = exp(-aboveLava / 3.0) * mix(0.2, 1.0, sideFacing) * 0.36 * smoothstep(0.05, 0.6, hot);
  float bounce = exp(-max(riverSD, 0.0) / 45.0) * exp(-max(ground - ${LAVA_LEVEL.toFixed(1)}, 0.0) / 24.0) * mix(0.15, 1.0, sideFacing);
  col += vec3(1.0, 0.16, 0.02) * (underglow + bounce * 0.1) * flicker;

  // The volcano: its streams warm the rock right beside them; the crater lights its rim and inner
  // walls.
  vec3 volcanic = volcanoLava(p);
  // Design 085: the lava lights the rock round it: faces turned up take its orange (#9b5b3e) within
  // ~150 px of the river and the volcano's channels, bank sides a hotter red-orange (#e0582a); broad
  // and still, so it is fine by the cards.
  float radiance = clamp(exp(-max(riverSD, 0.0) / 140.0)
    + hasVolcano * exp(-max(volcanic.y, 0.0) / 70.0) * (1.0 - smoothstep(uVolcano.z * 0.95, uVolcano.z * 1.15, vd)), 0.0, 1.0);
  col = mix(col, vec3(0.33, 0.104, 0.048), radiance * 0.5 * (0.45 + 0.55 * n.z));
  col = mix(col, vec3(0.745, 0.098, 0.023), sideFacing * exp(-max(riverSD, 0.0) / 40.0) * 0.55);
  float besideLava = exp(-max(volcanic.y, 0.0) / 6.0) * hasVolcano * mix(0.5, 1.0, sideFacing);
  col += vec3(1.0, 0.14, 0.01) * besideLava * flicker * 0.45;
  float crater = craterRadius();
  float craterGlow = (1.0 - smoothstep(crater * 0.85, crater * 1.35, vd)) * hasVolcano * onVolcano;
  // Design 085: dimmer (an orange ball read as a stamp).
  col += vec3(1.0, 0.3, 0.03) * craterGlow * 0.2 * mix(0.4, 1.0, sideFacing) * flicker;

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
    float streak = flowStreaks(vec2(vd, angleBetween(angle, volcanic.z) * vd), 18.0, 3.0);
    float streamHeat = 0.38 + smoothstep(0.0, 5.0, -volcanic.y) * 0.3 + (streak - 0.5) * 0.5;
    vec3 lavaCol = lavaColor(mix(crackHeat, streamHeat, inStream));
    float poolRadius = crater * 0.82;
    if (vd < poolRadius + 1.0) lavaCol = mix(lavaCol, craterPool(rel, poolRadius), 1.0 - smoothstep(poolRadius - 2.0, poolRadius, vd));
    col = mix(col, lavaCol, lavaCover);
  }

  // Design 085: depth: the far margin hazes toward smoky red-brown (#5a2e22), the near margin falls
  // into dark (#1e1816), as the card's foreground ridge.
  float farHaze = smoothstep(uMin.y + uSize.y * 0.82, uMin.y + uSize.y, p.y);
  col = mix(col, vec3(0.1, 0.027, 0.016), farHaze * 0.6);
  float nearDark = 1.0 - smoothstep(uMin.y, uMin.y + uSize.y * 0.12, p.y);
  col = mix(col, vec3(0.013, 0.009, 0.008), nearDark * 0.5);

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
 * The lava sheet: the river. Design 085: the card's striated lava, orange to gold (never white),
 * crimson only at the banks, streaks stretched along its course, a few dark crust rafts drifting.
 */
export const LAVA_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform vec2 uTexel;
uniform float uTime;
uniform vec3 uSun;
${NOISE}
${FOOTPRINTS}
${LAVA_RAMP}
${REVEAL}
${VOLCANO}
${RIVER}
varying vec2 vPos;

void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec2 uv = (p - uMin) / uSize;
  vec4 field = texture2D(uField, uv);
  float ground = field.r;
  if (ground > ${LAVA_LEVEL.toFixed(1)} + 1.0) discard;
  float riverSD = field.g;

  // Design 085: the flow runs along the river's course, fastest in its middle.
  vec4 frame = riverFrame(p);
  // The half width here: px across the centre line less px past the bank.
  float halfWidth = max(abs(frame.z) - frame.x, 1.0);
  float middle = 1.0 - clamp(abs(frame.z) / halfWidth, 0.0, 1.0);
  float period = 6.0;
  float speed = 6.0 + 14.0 * middle;
  float phaseA = fract(uTime / period);
  float phaseB = fract(uTime / period + 0.5);
  float weightA = 1.0 - abs(2.0 * phaseA - 1.0);
  vec2 along = vec2(frame.y, frame.z);
  vec2 scale = vec2(1.0 / 60.0, 1.0 / 7.5);
  float streakA = fbm3((along - vec2(speed * period * phaseA, 0.0)) * scale);
  float streakB = fbm3((along - vec2(speed * period * phaseB, 0.0)) * scale + vec2(3.7, 1.3));
  float streak = mix(streakB, streakA, weightA);
  float calm = 1.0 - fieldCalm(p, 120.0);
  // Orange at its edges to gold down its middle, the streaks pulling bright and dim bands along it.
  float heat = 0.55 + 0.25 * smoothstep(0.1, 0.9, middle) + (streak - 0.5) * 0.36 * calm;
  // Crimson only at the banks, within a few px of the rock.
  heat = mix(0.2, heat, smoothstep(0.0, 14.0, -riverSD));
  heat = min(heat, 0.84);
  vec3 col = lavaColor(heat);
  // A few dark crust rafts drifting with the flow (#3a2620).
  float raft = smoothstep(0.64, 0.74, fbm3((along - vec2(5.0 * uTime, 0.0)) / vec2(110.0, 34.0) + 5.0))
    * smoothstep(6.0, 18.0, -riverSD);
  col = mix(col, vec3(0.042, 0.019, 0.014), raft * 0.85);
  // Shallow lava off the river (a hollow at the lava's level) stays the cracks' crimson.
  col = mix(lavaColor(0.2), col, 1.0 - smoothstep(-2.0, 4.0, riverSD));

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
${FOOTPRINTS}
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
  // Design 085: they rise off the river along its course.
  vec3 at = riverPoint(fract(aSeed.x + jitter.x * 0.3));
  vec3 pos = vec3(at.xy + (vec2(aSeed.y, 0.5 + jitter.y) - 0.5) * at.z * 1.4, ${LAVA_LEVEL.toFixed(1)} + 2.0);
  pos.x += life * 36.0 + sin(life * 6.0 + aSeed.z * 20.0) * 10.0 * life;
  pos.y += sin(life * 4.0 + aSeed.w * 30.0) * 8.0 * life;
  pos.z += life * (100.0 + 120.0 * aSeed.w);
  vec2 spread = (hash22(aSeed.zy * 53.0 + cycle) - 0.5) * craterRadius() * 1.2;
  vec3 crater = vec3(uVolcano.xy + spread + jitter * life * 170.0, craterRimHeight() - 4.0 + life * (130.0 + 90.0 * aSeed.y));
  pos = mix(pos, crater, fromCrater);
  float onTable = smoothstep(uMin.x + 20.0, uMin.x + 90.0, pos.x) * (1.0 - smoothstep(uMin.x + uSize.x - 90.0, uMin.x + uSize.x - 20.0, pos.x))
    * step(1.5, uRiverCount);
  // Design 080: none rise beside a card (motion there pulls the eye off it).
  float shown = revealBurned(pos.xy) * exitKeep(pos.xy) * max(onTable, fromCrater) * (1.0 - fieldCalm(pos.xy, 60.0));
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
  vec3 hot = mix(vec3(1.5, 0.42, 0.04), vec3(1.4, 0.62, 0.11), vKind);
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
  // Design 085: bigger, softer puffs.
  float sizePx = mix(16.0, 64.0, sqrt(life)) * (0.8 + 0.4 * aSeed.z) * uVolcano.z / 100.0;
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
  // Design 085: the card's dark smoke (#3d3230), lit orange from below (#b5502a): no grey puffs.
  vec3 smoke = mix(vec3(0.035, 0.024, 0.022), vec3(0.047, 0.031, 0.029) * 1.6, smoothstep(0.0, 0.6, key));
  float warm = smoothstep(-0.05, 0.4, c.y) * (1.0 - smoothstep(0.0, 0.7, vLife));
  smoke = mix(smoke, vec3(0.462, 0.08, 0.023), warm * 0.6);
  // Thin over the crater, so it stays in sight from above; fuller as the puff drifts off.
  float fade = smoothstep(0.25, 0.5, vLife) * (1.0 - smoothstep(0.65, 1.0, vLife));
  gl_FragColor = vec4(smoke, puff * fade * 0.35);
${OUTPUT}
}
`;
