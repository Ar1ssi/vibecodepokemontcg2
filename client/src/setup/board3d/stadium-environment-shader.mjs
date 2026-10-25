// Design 077 (prototype): procedural Stadium boards. GLSL only — no textures, so the board is sharp
// at any size. Positions arrive in table px (`vPos`, origin at the near-left corner), the frame
// `table-mesh.js` uses, so crack and zone sizes read the same on every viewport.
// Colors are written as authored sRGB without `colorspace_fragment`, matching how the mat art shows.

export const MAX_ZONES = 24;

export const ENVIRONMENT_VERTEX = /* glsl */ `
uniform vec2 uSize;
varying vec2 vPos;
void main() {
  vPos = position.xy + uSize * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const NOISE = /* glsl */ `
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
`;

// Zone wells (design 077 O4): darken and desaturate every zone rect so empty slots stay visible,
// with a faint outline in the scene's own glow color.
const ZONES = /* glsl */ `
uniform vec4 uZones[${MAX_ZONES}];
uniform int uZoneCount;
vec3 applyZoneWells(vec3 col, vec2 p, vec3 lineColor) {
  float well = 0.0;
  float line = 0.0;
  for (int i = 0; i < ${MAX_ZONES}; i++) {
    if (i >= uZoneCount) break;
    vec4 zone = uZones[i];
    vec2 halfSize = zone.zw * 0.5;
    vec2 d = abs(p - (zone.xy + halfSize)) - halfSize + 10.0;
    float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 10.0;
    well = max(well, 1.0 - smoothstep(-4.0, 3.0, sd));
    line = max(line, 1.0 - smoothstep(0.4, 1.8, abs(sd)));
  }
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, mix(col, vec3(luma), 0.4) * 0.6, well);
  return col + lineColor * line * 0.22;
}
`;

/**
 * Scorched Earth (customhb-299): charred, cracked ground; ember seams that still glow in patches and
 * pulse slowly; ash haze drifting across. One palette — char, umber, ash, and an ember ramp that tops
 * out at warm orange, never white. Intro: a burn front spreads from the Stadium zone, blackening the
 * mat just ahead of it. Exit: the ground burns away in noisy patches, ember-edged.
 */
export const SCORCHED_EARTH_FRAGMENT = /* glsl */ `
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform float uTime;
uniform float uReveal;
uniform float uExit;
uniform float uHeat;
varying vec2 vPos;
${NOISE}
${ZONES}
vec3 emberRamp(float x) {
  x = clamp(x, 0.0, 1.5);
  vec3 deep = vec3(0.42, 0.04, 0.0);
  vec3 hot = vec3(1.0, 0.33, 0.06);
  vec3 core = vec3(1.0, 0.66, 0.26);
  if (x < 0.5) return mix(vec3(0.0), deep, x * 2.0);
  if (x < 1.0) return mix(deep, hot, (x - 0.5) * 2.0);
  return mix(hot, core, (x - 1.0) * 2.0);
}
void main() {
  vec2 p = vPos;
  vec2 warp = vec2(fbm(p * 0.006), fbm(p * 0.006 + 7.3)) - 0.5;
  vec2 q = p + warp * 70.0;
  vec2 plates = voronoiEdge(q / 150.0);
  vec2 shards = voronoiEdge(q / 52.0 + 3.1);
  float plateEdge = plates.x * 150.0;
  float shardEdge = shards.x * 52.0;

  // Where the ground is still hot: patches, not everywhere (Magma Basin is the all-lava one).
  float heatField = smoothstep(0.4, 0.72, fbm(p * 0.0022 + vec2(3.0, 1.0)));

  vec3 charColor = vec3(0.07, 0.055, 0.05);
  vec3 umber = vec3(0.21, 0.135, 0.09);
  vec3 ash = vec3(0.34, 0.31, 0.29);
  vec3 col = mix(charColor, umber, smoothstep(0.3, 0.72, fbm(p * 0.012)));
  col = mix(col, ash, smoothstep(0.55, 0.85, fbm(p * 0.05 + 11.0)) * 0.5);
  col *= 0.82 + 0.32 * plates.y;
  col *= mix(0.45, 1.0, smoothstep(0.0, 24.0, plateEdge));

  float crackWidth = 2.2 + 2.6 * fbm(p * 0.02);
  float crack = 1.0 - smoothstep(crackWidth * 0.5, crackWidth, plateEdge);
  float fineCrack = (1.0 - smoothstep(0.6, 1.6, shardEdge)) * 0.7;
  col = mix(col, vec3(0.02, 0.015, 0.012), max(crack, fineCrack * (1.0 - crack)));

  float flow = fbm(p * 0.004 + vec2(uTime * 0.03, -uTime * 0.02));
  float pulse = 0.72 + 0.28 * sin(uTime * 1.1 + plates.y * 6.283);
  float glow = (crack + fineCrack * 0.45) * heatField * (0.5 + 0.7 * flow) * pulse * uHeat;
  col += emberRamp(glow * 1.25);
  col += vec3(1.0, 0.32, 0.06) * exp(-plateEdge / 14.0) * heatField * pulse * 0.16 * uHeat;

  float speck = hash12(floor(p / 5.0));
  float spark = step(0.9975, speck) * heatField * (0.5 + 0.5 * sin(uTime * (2.0 + speck * 6.0) + speck * 40.0));
  col += vec3(1.0, 0.55, 0.18) * spark * uHeat;

  float haze = fbm(p * 0.003 + vec2(uTime * 0.012, uTime * 0.028));
  col = mix(col, ash, smoothstep(0.55, 0.9, haze) * 0.14);

  vec2 uvn = p / uSize;
  float edgeDistance = min(min(uvn.x, 1.0 - uvn.x), min(uvn.y, 1.0 - uvn.y));
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.16, edgeDistance));

  col = applyZoneWells(col, p, vec3(1.0, 0.45, 0.15));
  col *= 0.9;

  // Intro: the burn front.
  float reach = distance(p, uOrigin) / length(uSize) + (fbm(p * 0.008) - 0.5) * 0.12;
  float front = uReveal * 1.25 - 0.05;
  float burned = 1.0 - smoothstep(front - 0.004, front, reach);
  float frontBand = smoothstep(front - 0.04, front - 0.004, reach) * burned;
  float preheat = (1.0 - smoothstep(front, front + 0.035, reach)) * (1.0 - burned) * step(0.001, uReveal);
  col += emberRamp(frontBand * 1.3) * step(uReveal, 0.999);
  col = mix(vec3(0.05, 0.02, 0.01), col, burned);
  float alpha = max(burned, preheat * 0.5);

  // Exit: the ground burns away in patches.
  float patchNoise = fbm(p * 0.01 + 5.0);
  float gone = uExit * 1.1;
  float keep = smoothstep(gone - 0.05, gone, patchNoise);
  float exitBand = keep * (1.0 - smoothstep(gone, gone + 0.05, patchNoise)) * step(0.001, uExit);
  col += emberRamp(exitBand * 1.3);
  alpha *= keep;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha);
}
`;

/** Embers rising off the hot ground; one Points draw, all motion on the GPU from `uTime`. */
export const EMBER_VERTEX = /* glsl */ `
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform float uTime;
uniform float uReveal;
uniform float uExit;
uniform float uPixelRatio;
attribute vec4 aSeed;
varying float vLife;
void main() {
  float period = 4.0 + aSeed.w * 4.0;
  float life = mod(uTime + aSeed.z * period, period) / period;
  vec3 pos = vec3((aSeed.x - 0.5) * uSize.x, (aSeed.y - 0.5) * uSize.y, 0.0);
  pos.x += sin(life * 6.283 + aSeed.w * 20.0) * 14.0;
  pos.y += life * 50.0 + sin(life * 9.42 + aSeed.z * 10.0) * 8.0;
  pos.z = 4.0 + life * 110.0;
  vec2 tablePos = pos.xy + uSize * 0.5;
  float reach = distance(tablePos, uOrigin) / length(uSize);
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
  vec3 col = mix(vec3(1.0, 0.62, 0.24), vec3(0.6, 0.08, 0.0), vLife);
  gl_FragColor = vec4(col * disc * fade, 1.0);
}
`;
