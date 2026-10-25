// Design 077 (prototype): procedural Stadium boards. GLSL only — no textures, so the board is sharp
// at any size. Geometry is in the table frame of board-layout.mjs (x right, y up the table from the
// near edge, z off the cloth, 1 unit = 1 flat CSS px), so river, crack and zone sizes read the same
// on every viewport. Colors are written as authored sRGB without `colorspace_fragment`, matching how
// the mat art shows.

export const MAX_ZONES = 24;
/** Grid of the relief mesh: one vertex every ~6 table px on a 1920 px table. */
export const RELIEF_SEGMENTS = { x: 320, y: 152 };

const COMMON = /* glsl */ `
uniform vec2 uMin;
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform float uTime;
uniform float uReveal;
uniform float uExit;
uniform float uHeat;
uniform float uRelief;
uniform float uRiverY;
uniform vec4 uZones[${MAX_ZONES}];
uniform int uZoneCount;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = turn * p * 2.02;
    amplitude *= 0.5;
  }
  return value;
}
// Distance to the nearest cell border (Quilez's exact form) and the owning cell's hash.
vec2 voronoiEdge(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  vec2 nearestCell = vec2(0.0);
  vec2 nearestOffset = vec2(0.0);
  float best = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash22(n + g) - f;
      float d = dot(r, r);
      if (d < best) { best = d; nearestOffset = r; nearestCell = g; }
    }
  }
  float edge = 8.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 g = nearestCell + vec2(float(i), float(j));
      vec2 r = g + hash22(n + g) - f;
      vec2 between = r - nearestOffset;
      if (dot(between, between) > 0.00001) edge = min(edge, dot(0.5 * (nearestOffset + r), normalize(between)));
    }
  }
  return vec2(edge, hash12(n + nearestCell));
}

// Signed px to the nearest card footprint (rounded rects): < 0 inside one.
float footprintDistance(vec2 p) {
  float best = 100000.0;
  for (int i = 0; i < ${MAX_ZONES}; i++) {
    if (i >= uZoneCount) break;
    vec4 zone = uZones[i];
    vec2 halfSize = zone.zw * 0.5;
    vec2 d = abs(p - (zone.xy + halfSize)) - halfSize + 8.0;
    best = min(best, length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 8.0);
  }
  return best;
}

// The lava river along the seam between the two halves. It narrows to squeeze between cards and
// ducks under a card that sits on the seam (the Stadium), so it never runs under a card's art.
float riverCenter(float x) {
  return uRiverY + 9.0 * sin(x * 0.0045 + 1.3) + 10.0 * (noise(vec2(x * 0.006, 3.1)) - 0.5);
}
float riverHalfWidth(float x) {
  float base = 30.0 + 14.0 * noise(vec2(x * 0.004, 7.7));
  return min(base, footprintDistance(vec2(x, riverCenter(x))) - 4.0);
}
// Signed px from the bank: < 0 in the lava.
float riverDistance(vec2 p) {
  return abs(p.y - riverCenter(p.x)) - riverHalfWidth(p.x);
}

// Basalt broken into angular chunks with seams between them (Primal Groudon art, the secondary
// reference): x = px to the nearest seam, y = the chunk's hash.
vec2 rockChunks(vec2 p) {
  vec2 warp = vec2(fbm(p * 0.006), fbm(p * 0.006 + 7.3)) - 0.5;
  vec2 cell = voronoiEdge((p + warp * 40.0) / 70.0);
  return vec2(cell.x * 70.0, cell.y);
}

// Basalt rising only where no card lies: flat under and around footprints, low by the river, a
// volcanic ridge along the far edge and a low one along the near edge.
float terrainHeight(vec2 p) {
  float clearance = footprintDistance(p);
  float rd = riverDistance(p);
  float open = smoothstep(16.0, 90.0, clearance);
  float bank = smoothstep(4.0, 80.0, rd);
  float masses = fbm(p * 0.0045 + 2.0);
  float yn = (p.y - uMin.y) / uSize.y;
  float farRidge = smoothstep(0.78, 1.0, yn);
  float nearRidge = 1.0 - smoothstep(0.0, 0.13, yn);
  float rock = 14.0 + 70.0 * smoothstep(0.38, 0.8, masses)
    + 130.0 * farRidge * (0.45 + 0.9 * masses) + 30.0 * nearRidge * masses;
  vec2 chunk = rockChunks(p);
  float facets = (0.6 + 0.4 * chunk.y) * mix(0.55, 1.0, smoothstep(0.0, 9.0, chunk.x));
  float levee = 6.0 * exp(-pow((rd - 9.0) / 10.0, 2.0)) * smoothstep(8.0, 30.0, clearance);
  return (open * bank * rock * facets + levee) * uRelief;
}

float revealReach(vec2 p) {
  return distance(p, uOrigin) / length(uSize) + (fbm(p * 0.008) - 0.5) * 0.12;
}
float revealFront() {
  return uReveal * 1.25 - 0.05;
}
float exitKeep(vec2 p) {
  float gone = uExit * 1.1;
  return smoothstep(gone - 0.05, gone, fbm(p * 0.01 + 5.0));
}
`;

/**
 * Relief mesh: the plane's vertices lift by `terrainHeight`; rocks rise behind the burn front on
 * entry and sink where the ground burns away on exit. Normals by finite differences.
 */
export const SCORCHED_EARTH_VERTEX = /* glsl */ `
${COMMON}
varying vec2 vPos;
varying vec3 vNormal;
varying float vHeight;
void main() {
  vec2 p = position.xy;
  float rise = 1.0 - smoothstep(revealFront() - 0.1, revealFront(), revealReach(p));
  float scale = rise * rise * (3.0 - 2.0 * rise) * exitKeep(p);
  float delta = 6.0;
  float h = terrainHeight(p) * scale;
  float hx = terrainHeight(p + vec2(delta, 0.0)) * scale;
  float hy = terrainHeight(p + vec2(0.0, delta)) * scale;
  vNormal = normalize(vec3(h - hx, h - hy, delta));
  vPos = p;
  vHeight = h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, h, 1.0);
}
`;

/**
 * Scorched Earth (customhb-299), after its card art (Ryo Ueda, PRC 138): dark basalt masses lit
 * from a smoky sky and orange from below; a molten river streaked along its flow, hottest in the
 * middle, crusting dark toward the banks; thin lava veins running down the rock. From the secondary
 * reference (Primal Groudon, Ryota Murayama): the rock breaks into angular chunks whose seams glow,
 * top facets catch a cool teal sheen against the warm light, the haze is golden amber, sparks fly.
 * One palette — basalt, amber haze, and a lava ramp that tops out at pale amber, never white.
 * Intro: a burn front spreads from the Stadium zone, blackening the mat just ahead of it.
 * Exit: the ground burns away in patches, ember-edged.
 */
export const SCORCHED_EARTH_FRAGMENT = /* glsl */ `
${COMMON}
varying vec2 vPos;
varying vec3 vNormal;
varying float vHeight;

vec3 lavaRamp(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 deep = vec3(0.30, 0.03, 0.0);
  vec3 red = vec3(0.88, 0.19, 0.03);
  vec3 orange = vec3(1.0, 0.5, 0.1);
  vec3 amber = vec3(1.0, 0.82, 0.42);
  if (x < 0.33) return mix(deep, red, x / 0.33);
  if (x < 0.66) return mix(red, orange, (x - 0.33) / 0.33);
  return mix(orange, amber, (x - 0.66) / 0.34);
}

// Zone wells (design 077 O4): darken and desaturate every footprint so empty slots stay visible,
// with a faint ember outline.
vec3 applyZoneWells(vec3 col, vec2 p) {
  float well = 0.0;
  float line = 0.0;
  for (int i = 0; i < ${MAX_ZONES}; i++) {
    if (i >= uZoneCount) break;
    vec4 zone = uZones[i];
    vec2 halfSize = zone.zw * 0.5;
    vec2 d = abs(p - (zone.xy + halfSize)) - halfSize + 8.0;
    float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 8.0;
    well = max(well, 1.0 - smoothstep(-4.0, 3.0, sd));
    line = max(line, 1.0 - smoothstep(0.4, 1.8, abs(sd)));
  }
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, mix(col, vec3(luma), 0.4) * 0.6, well);
  return col + vec3(1.0, 0.45, 0.15) * line * 0.22;
}

void main() {
  vec2 p = vPos;
  float yn = (p.y - uMin.y) / uSize.y;
  float farRidge = smoothstep(0.78, 1.0, yn);
  float center = riverCenter(p.x);
  float halfWidth = riverHalfWidth(p.x);
  float rd = abs(p.y - center) - halfWidth;

  // Basalt: chunks with dark seams, grain in the normal.
  vec3 n = normalize(vNormal);
  vec2 grain = vec2(fbm(p * 0.07), fbm(p * 0.07 + 5.0)) - 0.5;
  n = normalize(n + vec3(grain * 0.3, 0.0));
  vec2 chunk = rockChunks(p);
  float seam = 1.0 - smoothstep(1.0, 2.6, chunk.x);
  vec3 albedo = mix(vec3(0.075, 0.07, 0.075), vec3(0.15, 0.135, 0.13), smoothstep(0.35, 0.75, fbm(p * 0.01)));
  albedo *= 0.85 + 0.25 * chunk.y;
  albedo = mix(albedo, vec3(0.02), seam * 0.8);

  vec3 sky = normalize(vec3(-0.35, 0.55, 0.75));
  vec3 viewDir = normalize(vec3(0.0, -0.35, 1.0));
  float diffuse = max(dot(n, sky), 0.0);
  float sheen = pow(max(dot(n, normalize(sky + viewDir)), 0.0), 14.0);
  vec3 amberSky = vec3(0.62, 0.42, 0.30);
  vec3 tealSheen = vec3(0.36, 0.50, 0.52);
  float raised = smoothstep(4.0, 40.0, vHeight);
  vec3 col = albedo * amberSky * (0.25 + 0.75 * diffuse) + tealSheen * sheen * (0.12 + 0.3 * raised);

  // Underglow: rock faces turned toward the river catch its light.
  vec3 towardLava = normalize(vec3(0.0, sign(center - p.y), 0.55));
  float lavaNear = exp(-max(rd, 0.0) / 50.0) * step(0.0, halfWidth);
  col += vec3(1.0, 0.36, 0.07) * lavaNear * (0.25 + 0.75 * max(dot(n, towardLava), 0.0)) * 0.55 * uHeat;

  // Veins: the chunk seams glow near the river, on raised rock, and down the far ridge.
  float pulse = 0.72 + 0.28 * sin(uTime * 1.1 + chunk.y * 6.283);
  float flow = fbm(p * 0.004 + vec2(uTime * 0.03, -uTime * 0.02));
  float veinZone = smoothstep(0.45, 0.72, fbm(p * 0.003 + 9.0)) * (exp(-max(rd, 0.0) / 160.0) + farRidge + raised * 0.6);
  float vein = (1.0 - smoothstep(1.2, 3.6, chunk.x)) * veinZone * pulse * (0.5 + 0.7 * flow) * uHeat;
  col += lavaRamp(vein * 0.9) * vein;

  float speck = hash12(floor(p / 5.0));
  float spark = step(0.997, speck) * (lavaNear + raised * 0.5) * (0.5 + 0.5 * sin(uTime * (2.0 + speck * 6.0) + speck * 40.0));
  col += vec3(1.0, 0.7, 0.28) * spark * uHeat;

  float haze = fbm(p * 0.003 + vec2(uTime * 0.012, uTime * 0.028));
  col = mix(col, vec3(0.55, 0.32, 0.12), smoothstep(0.5, 0.9, haze) * 0.16 + farRidge * 0.22);

  vec2 uvn = (p - uMin) / uSize;
  float edgeDistance = min(min(uvn.x, 1.0 - uvn.x), min(uvn.y, 1.0 - uvn.y));
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.12, edgeDistance));
  col = applyZoneWells(col, p) * 0.92;

  // The river: streaked along its flow (+x), hottest mid-stream, crust plates drifting at the banks.
  if (rd < 1.5 && halfWidth > 0.0) {
    float across = clamp((p.y - center) / max(halfWidth, 1.0), -1.0, 1.0);
    float core = 1.0 - across * across;
    vec2 flowP = vec2(p.x - uTime * 16.0, p.y);
    float streak = fbm(vec2(flowP.x * 0.006, flowP.y * 0.07 + fbm(flowP * 0.01) * 2.0));
    vec2 crustCell = voronoiEdge(vec2(flowP.x / 34.0, flowP.y / 20.0));
    float crustChance = smoothstep(0.75, 0.2, core) * 0.9 + 0.25 * (1.0 - streak);
    float crust = step(1.0 - crustChance * 0.75, crustCell.y) * smoothstep(0.03, 0.12, crustCell.x);
    float heat = clamp(core * 0.75 + streak * 0.55 - 0.15, 0.0, 1.0) * (0.85 + 0.15 * sin(uTime * 0.9 + p.x * 0.01));
    vec3 lava = lavaRamp(heat * uHeat);
    lava = mix(lava, vec3(0.07, 0.045, 0.035), crust * 0.92);
    col = mix(col, lava, smoothstep(1.5, -3.0, rd));
  }

  // Intro: the burn front.
  float reach = revealReach(p);
  float front = revealFront();
  float burned = 1.0 - smoothstep(front - 0.004, front, reach);
  float frontBand = smoothstep(front - 0.04, front - 0.004, reach) * burned;
  float preheat = (1.0 - smoothstep(front, front + 0.035, reach)) * (1.0 - burned) * step(0.001, uReveal);
  col += lavaRamp(frontBand) * frontBand * step(uReveal, 0.999);
  col = mix(vec3(0.05, 0.02, 0.01), col, burned);
  float alpha = max(burned, preheat * 0.5);

  // Exit: the ground burns away in patches.
  float keep = exitKeep(p);
  float gone = uExit * 1.1;
  float exitBand = keep * (1.0 - smoothstep(gone, gone + 0.05, fbm(p * 0.01 + 5.0))) * step(0.001, uExit);
  col += lavaRamp(exitBand) * exitBand;
  alpha *= keep;
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha);
}
`;

/** Embers rising off the river and the hot ground; one Points draw, all motion from `uTime`. */
export const EMBER_VERTEX = /* glsl */ `
uniform vec2 uMin;
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform float uTime;
uniform float uReveal;
uniform float uExit;
uniform float uRiverY;
uniform float uPixelRatio;
attribute vec4 aSeed;
varying float vLife;
void main() {
  float period = 4.0 + aSeed.w * 4.0;
  float life = mod(uTime + aSeed.z * period, period) / period;
  float y = aSeed.w < 0.65 ? uRiverY + (aSeed.y - 0.5) * 90.0 : uMin.y + aSeed.y * uSize.y;
  vec3 pos = vec3(uMin.x + aSeed.x * uSize.x, y, 0.0);
  pos.x += sin(life * 6.283 + aSeed.w * 20.0) * 14.0 + life * 30.0;
  pos.y += sin(life * 9.42 + aSeed.z * 10.0) * 8.0;
  pos.z = 6.0 + life * 150.0;
  float reach = distance(pos.xy, uOrigin) / length(uSize);
  float shown = step(reach, uReveal * 1.25 - 0.08) * (1.0 - uExit);
  vLife = life;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = (2.0 + aSeed.z * 3.5) * (1.0 - life * 0.5) * uPixelRatio * shown;
}
`;

export const EMBER_FRAGMENT = /* glsl */ `
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float disc = 1.0 - smoothstep(0.15, 0.5, d);
  float fade = smoothstep(0.0, 0.1, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
  vec3 col = mix(vec3(1.0, 0.74, 0.3), vec3(0.6, 0.08, 0.0), vLife);
  gl_FragColor = vec4(col * disc * fade, 1.0);
}
`;
