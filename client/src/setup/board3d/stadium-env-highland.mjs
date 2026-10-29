// Design 077 (prototype): the highland recipe. Stormy Mountains (customhb-051) after its card art
// (Toyste Beach, swsh7-161): the arena is the floor of a crater high in a storm. The mountain is
// round, centred on the table's middle, the crater in its own middle (stadium-environment-layout.mjs
// craterBowl); every Active and Bench card lies on the crater floor, and the scene runs on past the
// table (sceneBounds) so the whole rim closes round it. The lesser peak stands proud of the left rim
// and the summit of the right (mountainPeaks). A sea of cyan cloud turns slowly round the mountain's
// outer slopes, lightning cracks between the clouds and the peaks, and the Poké Ball emblem etched
// in the floor glows at the arena's middle. Cold light: slate rock cut into flat faces, deep blue in
// shadow, pale steel blue to the light, snow on the summits, a cyan storm glow round the
// silhouettes, in the style of TCG Live's own board_lightning.
//
// Bake, once per layout: BAKE_MOUNTAIN works out the mountain's height alone; BAKE_FIELD cuts it into
// faces and writes R height px, G signed px from the crater floor's edge, B the rock's tone 0..1,
// A the ground's kind (-1 floor dust, 0 rock, 1 scree and pebbles); the shared BAKE_LIGHT
// (stadium-environment-glsl.mjs) adds normals, occlusion and the sun shadow.
// Per frame: TERRAIN paints the ground, the emblem and the lightning's flash; CLOUDS is the cloud
// sea, domes turning round the mountain on a grid of their own; BOLT draws one lightning stroke and
// its fork as a camera-facing ribbon (the mesh schedules the strikes).
import {
  NOISE,
  OUTPUT,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  VORONOI,
} from './stadium-environment-glsl.mjs';
import { RIDGE_HALF_WIDTH } from './stadium-environment-layout.mjs';

/** Base of the cloud sea round the mountain, px off the cloth. */
export const CLOUD_LEVEL = 60;
/** Cloud grid spacing in table px: the domes are broad and smooth. */
export const CLOUD_SPACING_PX = 6;
/** Ribbon segments of a lightning stroke and of its fork. */
export const BOLT_SEGMENTS = { stroke: 48, fork: 24 };

const BOWL = /* glsl */ `
// The mountain (craterBowl): centre x, y, the crater floor's radius and the rim's; its foot's radius.
uniform vec4 uBowl;
uniform float uFoot;
// Noise round the mountain, continuous all the way round: dir is a unit vector from its centre.
float around(vec2 dir, float turns, float seed) {
  return clamp(fbm3(dir * turns + seed), 0.0, 1.0);
}
// The crater floor's edge along dir: it wanders outward only, so a wall never starts nearer a card.
float floorEdge(vec2 dir) {
  return uBowl.z + 24.0 * around(dir, 2.2, 3.7);
}
float rimAt(vec2 dir) {
  return uBowl.w + 34.0 * (around(dir, 2.8, 8.1) - 0.35);
}
// Signed px from the crater floor's edge, negative on the floor.
float floorDistance(vec2 p) {
  vec2 rel = p - uBowl.xy;
  float d = length(rel);
  return d - floorEdge(rel / max(d, 1.0));
}
// How much cloud sea p has: none inside the rim, all of it a little way down the outer slope.
float cloudPresence(vec2 p) {
  vec2 rel = p - uBowl.xy;
  float d = length(rel);
  float rim = rimAt(rel / max(d, 1.0));
  return smoothstep(rim + 10.0, rim + 90.0, d);
}
`;

const PEAKS = /* glsl */ `
// Centre x, y, base radius (0: none) and height of each peak, and where its ridge ends (mountainPeaks).
uniform vec4 uPeakLeft;
uniform vec4 uPeakRight;
uniform vec2 uRidgeLeft;
uniform vec2 uRidgeRight;
// One peak: an irregular five-sided pyramid, its faces leaning out from the summit, so the ridges
// where they meet run sharp like the crags of the card art and each face takes the light as one
// broad plane, a little dished toward its foot. Zero outside its base circle.
float peak(vec2 p, vec4 spot, float seed) {
  if (spot.z <= 0.0) return 0.0;
  vec2 rel = p - spot.xy;
  vec2 bent = rel + (vec2(fbm3(p / 120.0 + seed * 3.0), fbm3(p / 120.0 + seed * 3.0 + 7.1)) - 0.5) * spot.z * 0.1;
  float reach = 0.0;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float angle = seed * 2.4 + fk * 1.2566 + (hash12(vec2(seed, fk)) - 0.5) * 0.7;
    float spread = 0.8 + 0.3 * hash12(vec2(fk + 3.0, seed * 5.0));
    reach = max(reach, dot(bent, vec2(cos(angle), sin(angle))) / spread);
  }
  float t = min(1.0 - reach / spot.z, 1.0 - length(rel) / spot.z);
  return t > 0.0 ? spot.w * pow(t, 1.15) : 0.0;
}
// A peak with the ridge it trails along the rim: a knife-edged crest falling from near the summit's
// height toward its end, jagged along its line.
float ridgedPeak(vec2 p, vec4 spot, vec2 ridgeEnd, float seed) {
  float h = peak(p, spot, seed);
  vec2 along = ridgeEnd - spot.xy;
  float span = dot(along, along);
  if (spot.z <= 0.0 || span < 1.0) return h;
  float s = clamp(dot(p - spot.xy, along) / span, 0.0, 1.0);
  float across = distance(p, spot.xy + along * s) / (spot.z * ${RIDGE_HALF_WIDTH.toFixed(2)});
  float crest = spot.w * mix(0.72, 0.22, s) * (0.85 + 0.3 * gnoise(vec2(s * 5.0, seed)));
  return max(h, crest * pow(max(1.0 - across, 0.0), 1.2));
}
float peaks(vec2 p) {
  return max(ridgedPeak(p, uPeakLeft, uRidgeLeft, 1.0), ridgedPeak(p, uPeakRight, uRidgeRight, 3.0));
}
`;

const EMBLEM = /* glsl */ `
// The Poke Ball emblem in the floor: centre x, y and outline radius (0: none; craterEmblem).
uniform vec3 uEmblem;
// px from the emblem's nearest line: its outline, the band across its middle and the button's ring.
float emblemDistance(vec2 p) {
  if (uEmblem.z <= 0.0) return 100000.0;
  vec2 rel = p - uEmblem.xy;
  float r = length(rel);
  float buttonRadius = uEmblem.z * 0.22;
  float band = r > buttonRadius && r < uEmblem.z ? abs(rel.y) : 100000.0;
  return min(min(abs(r - uEmblem.z), abs(r - buttonRadius)), band);
}
`;

const FLASH = /* glsl */ `
// The lightning strike lighting the scene: its point in table px and its power 0..1.
uniform vec4 uFlash;
vec3 flashLight(vec3 at, vec3 n) {
  vec3 toStrike = uFlash.xyz - at;
  float dist = length(toStrike);
  float facing = max(dot(n, toStrike / max(dist, 1.0)), 0.0);
  return vec3(0.4, 0.62, 1.0) * uFlash.w * exp(-dist / 240.0) * (0.2 + 0.8 * facing) * 0.55;
}
`;

/** Width of the rock's flat faces in table px. */
const FACET_PX = 92;

/**
 * Bake 1, first pass (into uPre; stadium-environment-mesh.js renders it before the field): the
 * mountain's own height, without faces or debris. The wall climbs steeply from the crater floor's
 * edge and rounds over to a crest broken into crags round the mountain, then the outer slope falls
 * away under the cloud sea, gullies running straight down both; the peaks rise from the rim, never
 * steeper than a cliff off the floor's edge. R the mountain, G the wall and outer slope alone, B the
 * peaks alone. Apart from the field so the faces below sample it instead of working it out again at
 * three more points: as one shader its compile stalled the board for seconds.
 */
export const BAKE_MOUNTAIN_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${BOWL}
${PEAKS}
// Smooth max that blends only where both are up, so ground at zero keeps its height.
float smaxUp(float a, float b, float k) {
  float blend = k * clamp(min(a, b) / k, 0.0, 1.0);
  if (blend < 0.001) return max(a, b);
  float h = clamp(0.5 + 0.5 * (a - b) / blend, 0.0, 1.0);
  return mix(b, a, h) + blend * h * (1.0 - h);
}
// Sharp-crested noise 0..1: a ridge wherever the noise crosses its middle.
float ridged(vec2 q) {
  return 1.0 - abs(2.0 * gnoise(q) - 1.0);
}
// The same ridges with rounded crests.
float rounded(vec2 q) {
  float n = 2.0 * gnoise(q) - 1.0;
  return 1.0 - n * n;
}
// The crest's height round the mountain: broad swells broken into crags.
float crestHeight(vec2 dir) {
  float swell = mix(84.0, 130.0, around(dir, 1.6, 1.3));
  return swell + 34.0 * pow(ridged(dir * 5.0 + 2.3), 4.0) + 14.0 * pow(ridged(dir * 11.0 + 8.9), 5.0);
}
// The crater's wall and the outer slope at p, without the peaks: steep off the floor's edge, rounding
// over the crest, falling under the cloud sea, gullies running straight down both. 0 on the floor.
float wallAt(vec2 p) {
  vec2 rel = p - uBowl.xy;
  float d = length(rel);
  vec2 dir = rel / max(d, 1.0);
  float edge = floorEdge(dir);
  if (d <= edge) return 0.0;
  float rim = rimAt(dir);
  float crest = crestHeight(dir);
  vec2 warp = (vec2(fbm3(p / 90.0), fbm3(p / 90.0 + 5.2)) - 0.5) * 0.4;
  float gully = rounded(dir * 6.0 + warp + 4.1) - 0.5;
  if (d <= rim) {
    float s = clamp((d - edge) / max(rim - edge, 1.0), 0.0, 1.0);
    return crest * (1.0 - pow(1.0 - s, 1.8)) + 16.0 * gully * sin(3.14159 * s);
  }
  float fall = clamp((d - rim) / max(uFoot - rim, 1.0), 0.0, 1.0);
  float slope = mix(crest, ${(CLOUD_LEVEL - 40).toFixed(1)}, 1.0 - pow(1.0 - fall, 1.5));
  return slope + 20.0 * gully * (1.0 - fall) * smoothstep(0.0, 0.15, fall);
}
void main() {
  vec2 p = uMin + vUv * uSize;
  float wall = wallAt(p);
  float summits = min(peaks(p), max(floorDistance(p), 0.0) * 2.6);
  gl_FragColor = vec4(smaxUp(wall, summits, 26.0), wall, summits, 0.0);
}
`;

/**
 * Bake 1, second pass: the ground. The crater floor is level dust with faint swells and the emblem's
 * groove; the mountain (uPre) is cut into flat faces; round scree heaps lie at the wall's foot and a
 * few pebbles out on the floor.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uPre;
varying vec2 vUv;
${NOISE}
${VORONOI}
${BOWL}
${EMBLEM}
float mountainAt(vec2 p) {
  return texture2D(uPre, (p - uMin) / uSize).r;
}
// The rock cut into flat faces: each Voronoi cell takes the mountain's plane at its point, leaned a
// little at random, so the slopes break into broad faces that each take the light as one; along the
// cells' borders the faces meet the mountain again in a short bevel. x: height, y: the face's id.
vec2 faceted(vec2 p, float h, float amount) {
  vec4 cell = voronoiCell(p / ${FACET_PX.toFixed(1)} + 17.0);
  vec2 c = p + cell.zw * ${FACET_PX.toFixed(1)};
  float hc = mountainAt(c);
  vec2 g = vec2(mountainAt(c + vec2(3.0, 0.0)) - hc, mountainAt(c + vec2(0.0, 3.0)) - hc) / 3.0;
  vec2 lean = (hash22(vec2(cell.y * 71.0, 3.0)) - 0.5) * 0.3 * min(length(g), 1.2);
  // Never far off the mountain, so a face on a sharp crest can't run out into a shard.
  float plane = max(clamp(hc + dot(g + lean, p - c), h - 20.0, h + 20.0), 0.0);
  float inner = smoothstep(0.0, 16.0, cell.x * ${FACET_PX.toFixed(1)});
  return vec2(mix(h, plane, amount * inner), cell.y);
}
// Oval stones: a low dome in a share of the Voronoi cells of this size, well inside its cell. The share
// is weighed at the stone's centre by smoothstep(zone.x, zone.y, d) - smoothstep(zone.z, zone.w, d),
// d its px from the floor's edge, so no stone is cut where the zone ends. x: height px, y: its id.
vec2 pebbles(vec2 p, float seed, float size, float share, vec4 zone) {
  vec4 cell = voronoiCell(p / size + seed);
  float d = floorDistance(p + cell.zw * size);
  float weight = smoothstep(zone.x, zone.y, d) - smoothstep(zone.z, zone.w, d);
  if (fract(cell.y * 37.3) >= share * weight) return vec2(0.0, cell.y);
  float radius = size * (0.14 + 0.12 * fract(cell.y * 13.7));
  float angle = cell.y * 40.0;
  vec2 local = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * cell.zw * size;
  float across = length(local * vec2(1.0, 1.6)) / radius;
  return vec2(across < 1.0 ? sqrt(1.0 - across * across) * radius * 0.45 : 0.0, cell.y);
}
void main() {
  vec2 p = uMin + vUv * uSize;
  float floorSD = floorDistance(p);
  float ground = 2.0 * (fbm3(p / 240.0) - 0.5) + 5.0 * smoothstep(-90.0, 0.0, floorSD);
  ground -= 1.6 * (1.0 - smoothstep(1.0, 3.2, emblemDistance(p)));

  vec3 pre = texture2D(uPre, vUv).rgb;
  float mountain = pre.r;
  // Faces all over the rock, softer on the peaks, whose own broad planes carry them; none in the
  // wall's first px off the floor, so no face leans out over a card.
  float onPeak = smoothstep(4.0, 40.0, pre.b - pre.g);
  float amount = smoothstep(6.0, 22.0, floorSD) * smoothstep(2.0, 12.0, mountain) * mix(0.85, 0.25, onPeak);
  // None down in the cloud sea, where a face would poke out of the cloud as a sliver.
  amount *= 1.0 - cloudPresence(p) * (1.0 - smoothstep(${CLOUD_LEVEL.toFixed(1)}, ${(CLOUD_LEVEL + 40).toFixed(1)}, mountain));
  vec2 rock = amount > 0.0 ? faceted(p, mountain, amount) : vec2(mountain, 0.0);

  vec2 scree = pebbles(p, 5.3, 26.0, 0.35, vec4(-46.0, -6.0, 10.0, 34.0));
  vec2 pebble = pebbles(p, 11.7, 52.0, 0.05, vec4(-100001.0, -100000.0, -40.0, 0.0));
  float debris = max(scree.x, pebble.x);

  float onRock = step(debris, rock.x) * step(1.0, rock.x);
  float kind = onRock > 0.5 ? 0.0 : (debris > 0.4 ? 1.0 : -1.0);
  float tone = onRock > 0.5 ? rock.y : (scree.x >= pebble.x ? scree.y : pebble.y);
  gl_FragColor = vec4(ground + max(rock.x, debris), floorSD, tone, kind);
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
${NOISE}
${REVEAL}
${BOWL}
${EMBLEM}
${FLASH}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;

void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float ground = field.r;
  float floorSD = field.g;
  float tone = field.b;
  float onFloor = step(field.a, -0.5);
  float onDebris = step(0.5, field.a);

  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sun = normalize(uSun);
  float facing = dot(n, sun) * mix(0.4, 1.0, light.a);

  // Rock in three painted cold tones, each face taking one: deep blue in shadow, slate, pale steel
  // blue on the faces to the light. Steep faces turned from the light catch the storm's cyan; frost
  // dusts the summits and the highest crags.
  vec3 rock = mix(vec3(0.04, 0.046, 0.066), vec3(0.15, 0.165, 0.2), smoothstep(0.4, 0.52, facing));
  rock = mix(rock, vec3(0.37, 0.4, 0.46), smoothstep(0.8, 0.92, facing));
  rock *= 0.84 + 0.32 * tone;
  float away = clamp(-dot(n.xy, normalize(sun.xy)), 0.0, 1.0);
  rock += vec3(0.01, 0.03, 0.045) * smoothstep(0.1, 0.45, away);
  // Summits and high crags catch the light; the low slopes sink into the storm's gloom.
  rock *= mix(0.72, 1.12, smoothstep(30.0, 200.0, ground));
  float snow = smoothstep(150.0, 172.0, ground + (gnoise(p / 26.0) - 0.5) * 44.0) * smoothstep(0.25, 0.5, n.z);
  vec3 snowColor = mix(vec3(0.34, 0.45, 0.58), vec3(0.86, 0.93, 1.0), smoothstep(0.5, 0.85, facing));
  rock = mix(rock, snowColor, snow * 0.92);

  // The floor: warm grey dust, cool in shadow, mottled, darker toward the bowl's edge.
  vec3 dust = mix(vec3(0.1, 0.1, 0.11), vec3(0.24, 0.215, 0.18), smoothstep(0.35, 0.8, facing));
  dust *= 0.9 + 0.18 * fbm3(p / 80.0);
  dust *= mix(1.0, 0.68, smoothstep(-140.0, 0.0, floorSD));
  vec3 col = mix(rock, dust, onFloor);
  vec3 stone = mix(vec3(0.05, 0.055, 0.065), vec3(0.19, 0.185, 0.19), smoothstep(0.3, 0.85, facing));
  col = mix(col, stone * (0.85 + 0.3 * tone), onDebris);

  // Convex edges catch a cyan stroke of the storm's light.
  vec2 t2 = uTexel * 3.0;
  float laplace = texture2D(uField, vUv + vec2(t2.x, 0.0)).r + texture2D(uField, vUv - vec2(t2.x, 0.0)).r
    + texture2D(uField, vUv + vec2(0.0, t2.y)).r + texture2D(uField, vUv - vec2(0.0, t2.y)).r - 4.0 * ground;
  float convex = smoothstep(0.8, 3.5, -laplace) * vGrowth;
  col = mix(col, vec3(0.3, 0.5, 0.6), convex * 0.45 * (1.0 - onFloor));
  // The storm's glow round the silhouettes: steep rock seen edge-on from the camera rims cyan,
  // so the crags and peaks stand out against the cloud.
  float edgeOn = 1.0 - clamp(dot(n, normalize(uEye - vec3(p, ground))), 0.0, 1.0);
  col += vec3(0.16, 0.42, 0.52) * pow(edgeOn, 3.0) * smoothstep(0.2, 0.6, 1.0 - n.z) * (1.0 - onFloor);

  // Occlusion into deep navy; a cold sky fill on faces turned up; cyan haze where the outer slope
  // sinks toward the cloud sea.
  col = mix(vec3(0.018, 0.024, 0.045), col, smoothstep(0.3, 0.9, light.b));
  col += vec3(0.008, 0.02, 0.032) * n.z;
  float haze = (1.0 - smoothstep(${(CLOUD_LEVEL - 30).toFixed(1)}, ${(CLOUD_LEVEL + 60).toFixed(1)}, ground)) * cloudPresence(p);
  col = mix(col, vec3(0.16, 0.34, 0.4), haze * 0.55);
  // Rock out past the mountain's foot stands far off in the storm and fades toward the cloud.
  float distant = smoothstep(uFoot - 20.0, uFoot + 160.0, length(p - uBowl.xy));
  col = mix(col, vec3(0.22, 0.45, 0.54), distant * 0.45 * (1.0 - onFloor));

  // The emblem glows in its groove, pulsing slowly and flaring with each strike.
  float emblem = emblemDistance(p);
  float pulse = 0.85 + 0.15 * sin(uTime * 1.3) + uFlash.w * 0.5;
  col += vec3(1.0, 0.8, 0.42) * ((1.0 - smoothstep(0.6, 2.2, emblem)) * 0.9 + exp(-emblem / 10.0) * 0.22) * pulse * onFloor;

  col += flashLight(vec3(p, ground), n);

  vec2 edgeUv = min(vUv, 1.0 - vUv);
  col *= mix(0.6, 1.0, smoothstep(0.0, 0.03, min(edgeUv.x, edgeUv.y)));

  // The reveal's front and the exit's edge run electric cyan.
  vec3 spark = vec3(0.45, 0.9, 1.2);
  float front = revealFront();
  col += spark * smoothstep(front - 0.03, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  float gone = uExit * 1.1;
  col += spark * (1.0 - smoothstep(gone, gone + 0.04, fbm3(p / 110.0 + 5.0))) * step(0.001, uExit);

  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

const DOMES = /* glsl */ `
// How softly neighbouring domes merge (1/px), and the height their weights are taken about.
const float CLOUD_BLEND = 0.08;
const float CLOUD_PIVOT = 60.0;
// Domes are flattened to this share of their height: a low sea the peaks rise out of.
const float CLOUD_SQUASH = 0.55;
// Adds one scale of domes round p into the sea's soft union: spheres sitting in the 3x3 cells,
// each swelling and shrinking slowly and sunk by its own share of its radius, turning round the
// mountain at its rate. weight sums exp(CLOUD_BLEND * (top - CLOUD_PIVOT)); slope sums each dome's
// height gradient in the table frame, weighted alike.
void addDomes(vec2 p, float rate, float size, float sink, float seed, inout float weight, inout vec2 slope) {
  float a = uTime * rate;
  mat2 turn = mat2(cos(a), sin(a), -sin(a), cos(a));
  vec2 q = uBowl.xy + turn * (p - uBowl.xy) + seed * 37.0;
  vec2 cell = floor(q / size);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      vec2 jitter = hash22(c + seed * 17.0);
      float radius = size * (0.7 + 0.3 * hash12(c + seed * 31.0)) * (1.0 + 0.06 * sin(uTime * 0.4 + jitter.x * 6.28));
      vec2 rel = q - (c + 0.2 + 0.6 * jitter) * size;
      float under = radius * radius - dot(rel, rel);
      if (under <= 0.0) continue;
      float root = sqrt(under);
      float w = exp(CLOUD_BLEND * (root - radius * (sink + 0.2 * hash12(c + seed * 53.0)) - CLOUD_PIVOT));
      weight += w;
      slope += w * ((-rel / max(root, radius * 0.25)) * turn);
    }
  }
}
// The cloud sea's surface: three sizes of dome merged softly over the sea's base, the smaller ones
// turning faster. xyz: its normal, w: its height over the base.
vec4 cloudSurface(vec2 p) {
  float weight = exp(-CLOUD_BLEND * CLOUD_PIVOT);
  vec2 slope = vec2(0.0);
  addDomes(p, 0.006, 150.0, 0.2, 1.0, weight, slope);
  addDomes(p, 0.009, 72.0, 0.25, 2.0, weight, slope);
  addDomes(p, 0.013, 34.0, 0.35, 3.0, weight, slope);
  float height = (log(weight) / CLOUD_BLEND + CLOUD_PIVOT) * CLOUD_SQUASH;
  return vec4(normalize(vec3(-slope / weight * CLOUD_SQUASH, 1.0)), height);
}
`;

export const CLOUD_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${BOWL}
${DOMES}
varying vec2 vPos;
void main() {
  vec2 p = position.xy;
  float presence = cloudPresence(p);
  // Off the sea the surface sinks under the rock, out of sight.
  float z = presence > 0.0
    ? ${CLOUD_LEVEL.toFixed(1)} + max(cloudSurface(p).w, 0.0) * presence - 140.0 * (1.0 - presence)
    : -140.0;
  vPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, z, 1.0);
}
`;

/**
 * The cloud sea: painted cold cloud, deep teal in the creases, cyan on the body, near white where
 * the light hits the high domes; the peaks' shadows fall across it, a strike lights it from inside;
 * soft where it laps the rock and wispy at its inner edge.
 */
export const CLOUD_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${BOWL}
${DOMES}
${FLASH}
varying vec2 vPos;
void main() {
  vec2 p = vPos;
  float shown = revealBurned(p) * exitKeep(p);
  float presence = cloudPresence(p);
  if (shown * presence < 0.01) discard;
  vec4 dome = cloudSurface(p);
  float top = ${CLOUD_LEVEL.toFixed(1)} + max(dome.w, 0.0);
  vec3 n = normalize(dome.xyz);
  // Lit by the sun on the domes' tops and their sides to it, dark in the creases between them.
  float shade = max(dot(n, normalize(uSun)), 0.0) * 0.55 + clamp(dome.w / 55.0, 0.0, 1.0) * 0.45;
  vec3 col = mix(vec3(0.1, 0.26, 0.35), vec3(0.34, 0.64, 0.73), smoothstep(0.3, 0.55, shade));
  col = mix(col, vec3(0.8, 0.96, 1.0), smoothstep(0.68, 0.88, shade));
  vec2 uv = (p - uMin) / uSize;
  col *= mix(0.62, 1.0, texture2D(uLight, uv).a);
  col += flashLight(vec3(p, top), n) * 1.6;
  float lap = smoothstep(0.0, 8.0, top - texture2D(uField, uv).r);
  float wisp = clamp(presence * 1.4 - (1.0 - fbm3(p / 60.0 + uTime * 0.05)) * 0.4, 0.0, 1.0);
  // Thinned out toward the scene's edges, past which the table's dark floor shows.
  vec2 edgeUv = min(uv, 1.0 - uv);
  float edgeFade = smoothstep(0.0, 0.03, min(edgeUv.x, edgeUv.y));
  gl_FragColor = vec4(col, lap * wisp * shown * edgeFade);
${OUTPUT}
}
`;

export const BOLT_VERTEX = /* glsl */ `
uniform vec3 uBoltFrom;
uniform vec3 uBoltTo;
uniform float uBoltSeed;
attribute float aAlong;
attribute float aSide;
attribute float aFork;
varying float vAcross;
varying float vAlong;
varying float vFork;
${NOISE}
// Piecewise-linear noise in -1..1: straight runs between sharp kinks, the way lightning breaks.
float kinks(float x) {
  float i = floor(x);
  return mix(hash12(vec2(i, uBoltSeed)), hash12(vec2(i + 1.0, uBoltSeed)), fract(x)) * 2.0 - 1.0;
}
vec3 strokeSide(vec3 axis) {
  vec3 side = cross(axis, vec3(0.0, 0.0, 1.0));
  return length(side) > 0.001 ? normalize(side) : vec3(1.0, 0.0, 0.0);
}
// The stroke from the cloud to the strike point, kinked sideways and up, pinned at both ends.
vec3 mainStroke(float t) {
  vec3 axis = uBoltTo - uBoltFrom;
  vec3 side = strokeSide(axis);
  vec3 lift = normalize(cross(side, axis));
  float sway = kinks(t * 7.0) * 0.07 + kinks(t * 19.0 + 7.0) * 0.02;
  float rise = kinks(t * 6.0 + 19.0) * 0.05;
  return uBoltFrom + axis * t + (side * sway + lift * rise) * length(axis) * sin(t * 3.14159);
}
// A fork leaving the stroke partway down, turned off to one side, about a third as long.
vec3 forkStroke(float t) {
  vec3 axis = uBoltTo - uBoltFrom;
  vec3 side = strokeSide(axis);
  float turn = hash12(vec2(uBoltSeed, 9.0)) > 0.5 ? 1.0 : -1.0;
  vec3 heading = normalize(normalize(axis) + side * turn * 0.9);
  float span = length(axis) * (0.25 + 0.15 * hash12(vec2(uBoltSeed, 2.0)));
  vec3 start = mainStroke(0.3 + 0.3 * hash12(vec2(uBoltSeed, 4.0)));
  return start + heading * span * t + side * kinks(t * 8.0 + 41.0) * 0.08 * span * sin(t * 3.14159);
}
vec3 stroke(float t) {
  return aFork > 0.5 ? forkStroke(t) : mainStroke(t);
}
void main() {
  vec3 here = stroke(aAlong);
  vec3 along = stroke(min(aAlong + 0.01, 1.0)) - stroke(max(aAlong - 0.01, 0.0));
  vec4 view = modelViewMatrix * vec4(here, 1.0);
  // Camera-facing: the ribbon widens across the stroke's direction on screen, so it never twists
  // where the stroke kinks.
  vec2 tangent = (modelViewMatrix * vec4(along, 0.0)).xy;
  vec2 across = length(tangent) > 0.0001 ? normalize(vec2(-tangent.y, tangent.x)) : vec2(1.0, 0.0);
  // The stroke thins toward where it leaves the storm, so it fades in rather than starting blunt.
  float head = aFork > 0.5 ? 1.0 : mix(0.35, 1.0, smoothstep(0.0, 0.25, aAlong));
  view.xy += across * aSide * mix(16.0, 9.0, aFork) * head;
  gl_Position = projectionMatrix * view;
  vAcross = aSide;
  vAlong = aAlong;
  vFork = aFork;
}
`;

/** A lightning stroke: a white-blue core in a periwinkle glow (TCG Live's lightning sprites). */
export const BOLT_FRAGMENT = /* glsl */ `
uniform float uBoltPower;
uniform float uBoltGrow;
varying float vAcross;
varying float vAlong;
varying float vFork;
void main() {
  // The stroke reaches down its path in the strike's first frames, the fork once the stroke passes it.
  float reached = vFork > 0.5 ? uBoltGrow * 1.6 - 0.6 : uBoltGrow;
  if (vAlong > reached) discard;
  float s = abs(vAcross);
  float core = 1.0 - smoothstep(0.1, 0.22, s);
  float glow = exp(-s * s * 5.0);
  float tip = vFork > 0.5 ? 1.0 - smoothstep(0.6, 1.0, vAlong) : smoothstep(0.0, 0.2, vAlong);
  vec3 col = vec3(0.28, 0.5, 1.15) * glow * 0.6 + vec3(1.0, 1.2, 1.4) * core;
  gl_FragColor = vec4(col * uBoltPower * tip * mix(1.0, 0.6, vFork), 1.0);
${OUTPUT}
}
`;
