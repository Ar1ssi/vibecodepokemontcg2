// Design 082: the BDSP ground kit, painted-ground GLSL every Stadium board shares so their grounds
// read as one game's: Brilliant Diamond / Shining Pearl's hand-painted overworld. Each material is a
// broad soft value pattern plus one low-contrast motif of its own (grass: little clover marks; sand:
// soft ripples; paths: flagstones or cobbles with grout and a lit bevel; cliffs: strata), never grain
// or speckle. Every motif fades by FILTERING's patternFade (`filterPixel`, set first thing in main)
// and by the field's calm (fieldCalm: 1 on a card), so the cards keep a quiet ground under them.
// Water is saturated blue, paler and greener in the shallows, with slow light streaks and a few slow
// sparkles. Chunks go after NOISE, VORONOI and FILTERING; colours are the board's own.

/**
 * Grass. `cloverGrass(p, base, calm)`: the base green in broad soft patches, with BDSP's clover
 * marks (four-leafed, ~9 px, a shade darker or lighter) dotted through it, quieter near the cards.
 * `grassFringe(d, p, size)`: how much of the point is grass, 0..1, along a border `d` px from it
 * (negative inside the grass): the edge stands out in little tufts up to `size` px over the path.
 * `fringeShade(d, size)`: the soft shade the tufts throw on the path just past them, 0..1.
 */
export const GRASS = /* glsl */ `
float cloverMark(vec2 p, float size) {
  vec2 cell = floor(p / size);
  float mark = 0.0;
  for (int j = 0; j <= 1; j++) {
    for (int i = 0; i <= 1; i++) {
      vec2 g = cell + vec2(float(i), float(j)) - 0.5;
      vec2 h = hash22(g + 17.0);
      vec2 o = p / size - (g + 0.2 + 0.6 * h);
      float r = length(o);
      float turn = atan(o.y, o.x) + h.x * 6.2832;
      float leaf = 0.2 + 0.11 * cos(4.0 * turn);
      float inside = 1.0 - smoothstep(leaf - 0.05, leaf + 0.03, r);
      mark += inside * (h.y > 0.5 ? 1.0 : -1.0);
    }
  }
  return clamp(mark, -1.0, 1.0);
}
vec3 cloverGrass(vec2 p, vec3 base, float calm) {
  float broad = smoothstep(0.3, 0.7, fbm3(p / 260.0 + 3.1));
  vec3 col = base * mix(0.9, 1.07, broad);
  col *= 1.0 + 0.045 * (fbm3(p / 64.0 + 8.3) - 0.5);
  float marks = cloverMark(p, 11.0) * patternFade(filterPixel, 11.0);
  col *= 1.0 + 0.075 * marks * (1.0 - 0.75 * calm);
  return col;
}
float grassFringe(float d, vec2 p, float size) {
  vec2 cell = floor(p / (size * 0.9));
  float tooth = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = cell + vec2(float(i), float(j));
      vec2 c = (g + 0.15 + 0.7 * hash22(g + 41.0)) * size * 0.9;
      tooth = max(tooth, pow(max(1.0 - length(p - c) / (size * 0.55), 0.0), 1.35));
    }
  }
  float edge = size * tooth * mix(1.0, 0.0, 1.0 - patternFade(filterPixel, size * 0.9));
  return 1.0 - smoothstep(edge - 0.8, edge + 0.8, d);
}
float fringeShade(float d, float size) {
  return smoothstep(size * 1.8, 0.0, d) * step(0.0, d);
}
`;

/**
 * Flagstones and cobbles, after VORONOI. `flagstones(p, size, gap, sun)`: x 0..1 how far into a stone
 * from its grout (its rounded shoulder), y the stone's own 0..1 tone, z the light on its bevel (-1 a
 * shoulder facing away from the sun .. 1 toward it, 0 on its flat top). `cobbles(p, size)`: the same
 * for BDSP's cave cobbles, each a rounded dome: z its light, the dome lit from the sun's side.
 */
export const STONEWORK = /* glsl */ `
vec3 flagstones(vec2 p, float size, float gap, vec3 sun) {
  vec4 cell = voronoiCell(p / size);
  float edge = cell.x * size - gap;
  float shoulder = smoothstep(-0.6, 0.9, edge);
  vec2 outward = normalize(-cell.zw + 1e-4);
  // A rounded shoulder a few px wide: lit where it faces the sun, in shade where it faces away; the
  // stone's middle a touch lighter, as a worn top.
  float bevel = (1.0 - smoothstep(0.5, size * 0.11, edge)) * step(0.0, edge);
  float lit = bevel * dot(outward, normalize(sun.xy + 1e-4)) + 0.25 * smoothstep(size * 0.12, size * 0.4, edge);
  return vec3(shoulder, cell.y, lit);
}
vec3 cobbles(vec2 p, float size, vec3 sun) {
  vec4 cell = voronoiCell(p / size);
  float edge = cell.x * size;
  float dome = sqrt(clamp(edge / (size * 0.32), 0.0, 1.0));
  vec2 fromMiddle = -cell.zw;
  float lit = dot(normalize(fromMiddle + 1e-4), normalize(sun.xy + 1e-4)) * (1.0 - dome) + dome * 0.35;
  return vec3(smoothstep(0.0, size * 0.06, edge), cell.y, lit);
}
`;

/**
 * Sand. `bdspSand(p, base, calm)`: the base in broad soft patches with soft ripples drawn across it,
 * quieter near the cards. `wetSand(shore)`: how wet the sand is (1 at the water's edge, 0 past
 * `shore` 0..1 of the wet band).
 */
export const SAND = /* glsl */ `
vec3 bdspSand(vec2 p, vec3 base, float calm) {
  float broad = smoothstep(0.3, 0.7, fbm3(p / 300.0 + 1.7));
  vec3 col = base * mix(0.93, 1.05, broad);
  vec2 q = p + 18.0 * vec2(gnoise(p / 140.0), gnoise(p / 140.0 + 5.2));
  float ripple = sin(q.y * 0.21 + q.x * 0.05) * 0.5 + 0.5;
  ripple = smoothstep(0.55, 0.95, ripple) * patternFade(filterPixel, 30.0);
  col *= 1.0 + 0.05 * ripple * (1.0 - 0.7 * calm) - 0.02 * (1.0 - ripple);
  return col;
}
float wetSand(float shore) {
  return 1.0 - smoothstep(0.0, 1.0, shore);
}
`;

/**
 * BDSP water, after NOISE and VORONOI (uTime declared before it). `bdspWater(p, depth, deep, shallow,
 * calm)`: `depth` 0 at the waterline .. 1 out in deep water; the shallows pale and green to `shallow`,
 * deep water `deep`; slow streaks of light cross it (two drifting layers of cell edges) and a few slow
 * sparkles wink, none near the cards. `waterEdge(depth)`: the soft white line at the waterline.
 */
export const WATER = /* glsl */ `
float lightStreaks(vec2 p, float t) {
  // The sky caught in the ripples: broken iso-lines of two slow drifting noise fields, stretched
  // across the water, never a network of cells.
  vec2 a = p / vec2(70.0, 26.0) + vec2(t * 0.05, t * 0.02);
  vec2 b = p / vec2(48.0, 20.0) + vec2(-t * 0.04, t * 0.03) + 5.3;
  float ridgeA = 1.0 - smoothstep(0.0, 0.035, abs(fbm3(a) - 0.5));
  float ridgeB = 1.0 - smoothstep(0.0, 0.03, abs(fbm3(b) - 0.5));
  float breaks = smoothstep(0.45, 0.7, gnoise(p / 40.0 + t * 0.06));
  return (ridgeA * 0.6 + ridgeB * 0.4) * breaks * patternFade(filterPixel, 20.0);
}
float sparkles(vec2 p, float t) {
  vec2 cell = floor(p / 22.0);
  vec2 h = hash22(cell + 9.0);
  vec2 o = p / 22.0 - (cell + 0.2 + 0.6 * h);
  float wink = pow(max(sin(t * (0.5 + 0.6 * h.y) + h.x * 40.0), 0.0), 12.0);
  float spot = 1.0 - smoothstep(0.0, 0.07, length(o));
  return spot * wink * step(0.72, h.y) * patternFade(filterPixel, 22.0);
}
vec3 bdspWater(vec2 p, float depth, vec3 deep, vec3 shallow, float calm) {
  vec3 col = mix(shallow, deep, smoothstep(0.0, 1.0, depth));
  col *= 1.0 + 0.06 * (fbm3(p / 180.0 + uTime * 0.01) - 0.5);
  float quiet = 1.0 - 0.8 * calm;
  col += vec3(0.8, 0.9, 1.0) * lightStreaks(p, uTime) * 0.3 * quiet * mix(1.0, 0.7, depth);
  col += vec3(1.2) * sparkles(p, uTime) * 0.8 * quiet;
  return col;
}
float waterEdge(float depth) {
  return 1.0 - smoothstep(0.0, 0.08, depth);
}
`;

/**
 * Cliffs. `strata(z, p)`: BDSP's layered rock, 0..1 per band: courses ~`band` px high, wavering a
 * little along the face, each a slightly different tone, a dark groove under each course.
 */
export const STRATA = /* glsl */ `
vec2 strata(float z, vec2 p, float band) {
  float h = z + 4.0 * gnoise(p / 60.0) + 2.0 * gnoise(p / 23.0);
  float course = floor(h / band);
  float inBand = fract(h / band);
  float groove = smoothstep(0.0, 0.16, inBand) * (0.75 + 0.25 * smoothstep(0.75, 1.0, inBand));
  return vec2(groove, hash12(vec2(course, 4.1)));
}
`;
