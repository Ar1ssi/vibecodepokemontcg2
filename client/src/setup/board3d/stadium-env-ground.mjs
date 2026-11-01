// Design 082: the BDSP ground kit, painted-ground GLSL every Stadium board shares so their grounds
// read as one game's: Brilliant Diamond / Shining Pearl's hand-painted overworld. Each material is a
// broad soft value pattern plus one low-contrast motif of its own (grass: little clover marks; sand:
// soft ripples; paths: flagstones or cobbles with grout and a lit bevel; cliffs: strata), never grain
// or speckle. Every motif fades by FILTERING's patternFade (`filterPixel`, set first thing in main)
// and by the field's calm (fieldCalm: 1 on a card), so the cards keep a quiet ground under them.
// Water's own motif is its slow ribbons of sky light and a few slow sparkles (WATER), over each board's
// own blues. Chunks go after NOISE and FILTERING (STONEWORK after VORONOI too); colours are the
// board's own.

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
 * shoulder facing away from the sun .. 1 toward it, 0 on its flat top). `cobbles(p, size, sun)`: the
 * same for BDSP's cave cobbles, each a rounded dome: z its light, the dome lit from the sun's side.
 * Where the stones fall under a few px on screen, their grout and bevels fade to the stone's mean.
 */
export const STONEWORK = /* glsl */ `
vec3 flagstones(vec2 p, float size, float gap, vec3 sun) {
  vec4 cell = voronoiCell(p / size);
  float edge = cell.x * size - gap;
  float fine = patternFade(filterPixel, size);
  float shoulder = mix(1.0, smoothstep(-0.6, 0.9, edge), fine);
  vec2 outward = normalize(-cell.zw + 1e-4);
  // A rounded shoulder a few px wide: lit where it faces the sun, in shade where it faces away; the
  // stone's middle a touch lighter, as a worn top.
  float bevel = (1.0 - smoothstep(0.5, size * 0.11, edge)) * step(0.0, edge);
  float lit = (bevel * dot(outward, normalize(sun.xy + 1e-4)) + 0.25 * smoothstep(size * 0.12, size * 0.4, edge)) * fine;
  return vec3(shoulder, mix(0.5, cell.y, fine), lit);
}
vec3 cobbles(vec2 p, float size, vec3 sun) {
  vec4 cell = voronoiCell(p / size);
  float edge = cell.x * size;
  float fine = patternFade(filterPixel, size);
  float dome = sqrt(clamp(edge / (size * 0.32), 0.0, 1.0));
  vec2 fromMiddle = -cell.zw;
  float lit = dot(normalize(fromMiddle + 1e-4), normalize(sun.xy + 1e-4)) * (1.0 - dome) + dome * 0.35;
  return vec3(mix(1.0, smoothstep(0.0, size * 0.06, edge), fine), mix(0.5, cell.y, fine), mix(0.35, lit, fine));
}
`;

/** Sand. `bdspSand(p, base, calm)`: the base in broad soft patches with soft ripples drawn across it, quieter near the cards. */
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
`;

/**
 * Water's motif (uTime declared before it). `lightStreaks(p, t)`: the sky caught in the ripples, broken
 * iso-lines of two slow drifting noise fields stretched across the water, 0..1. `sparkles(p, t)`: a
 * few slow winks of light, 0..1. Each fades where it falls under a few px; a board scales both down
 * near the cards (fieldCalm) and adds them over its own blues.
 */
export const WATER = /* glsl */ `
float lightStreaks(vec2 p, float t) {
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
`;

/**
 * Cliffs. `strata(z, p, band)`: BDSP's layered rock in courses ~`band` px high, wavering a little
 * along the face: x 0..1 light across a course (0 in the dark groove under it), y the course's own
 * 0..1 tone. Where the courses fall under a few px on screen they fade to their mean.
 */
export const STRATA = /* glsl */ `
vec2 strata(float z, vec2 p, float band) {
  float h = z + 4.0 * gnoise(p / 60.0) + 2.0 * gnoise(p / 23.0);
  float course = floor(h / band);
  float inBand = fract(h / band);
  float groove = smoothstep(0.0, 0.16, inBand) * (0.75 + 0.25 * smoothstep(0.75, 1.0, inBand));
  float fine = patternFade(filterPixel, band);
  return vec2(mix(0.8, groove, fine), mix(0.5, hash12(vec2(course, 4.1)), fine));
}
`;

/**
 * Design 083: light that moves over the land, after NOISE and FILTERING. `cloudShade(p, t, scale)`:
 * 0..1, the soft shadow of slow clouds drifting over (`scale` about a cloud's size, px).
 * `dapple(p, t, size)`: -0.3..1, sun flecks about `size` px across under a canopy, slowly shifting as
 * its leaves move (faded where they fall under a few screen px). A board fades both out near the
 * cards, (1 - smoothstep(0, 0.4, fieldCalm(p, ~120))), so no moving light crosses them (D232).
 */
export const LIGHT_MOTION = /* glsl */ `
float cloudShade(vec2 p, float t, float scale) {
  float cover = fbm3((p - vec2(t * 7.0, t * 2.6)) / scale + 6.1);
  return smoothstep(0.54, 0.72, cover);
}
float dapple(vec2 p, float t, float size) {
  vec2 q = p / size;
  float a = gnoise(q + vec2(t * 0.11, t * 0.07));
  float b = gnoise(q * 1.7 - vec2(t * 0.09, -t * 0.05) + 3.7);
  float light = smoothstep(0.6, 0.76, a * 0.6 + b * 0.4);
  return mix(-0.3, 1.0, light) * patternFade(filterPixel, size);
}
`;
