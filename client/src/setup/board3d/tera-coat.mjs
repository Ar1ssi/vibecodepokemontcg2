// The crystal coat a Tera Pokémon wears on the three.js board: one shader plane over the card's
// face and a margin round it (overlay-meshes.js builds it). The card is set in cut crystal: a
// frame of flat-faced shards in the type's colour closes over its border and leaves the art
// clear. Every shard is one flat face with its own tilt, so neighbours differ in tone like the
// faces of a gem; each flashes in its own turn, and all of them in a band when the sweep crosses
// the card; their creases are thin lines of light with a little spectral fire; a few lone faces
// glint over the art; a breathing glow leaves the card's edge.
// Pure: the GLSL as strings and the timing as functions of ms, so the tests can pin both.

export const TERA_COAT = Object.freeze({
  /** The coat forms from the border inward over this long, shard by shard. */
  formMs: 900,
  /** One sweep of light crosses the card in `sweepMs`, then rests until the period ends. */
  sweepPeriodMs: 5200,
  sweepMs: 1500,
  /** The rim glow breathes over this long. */
  breathMs: 3200,
  /** The plane reaches this far past the card on every side, in card widths: room for the glow. */
  margin: 0.2,
});

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeInOut = (t) => t * t * (3 - 2 * t);
const cycle = (elapsed, period) => (((elapsed % period) + period) % period) / period;

/** How far the coat has formed `elapsedMs` after it went on: 0 nothing, 1 the whole coat. */
export const teraCoatForm = (elapsedMs) => clamp01(elapsedMs / TERA_COAT.formMs);

/**
 * Where the sweep's band sits `elapsedMs` after the coat formed: −0.2 before the card's top-left
 * corner, 1.2 past its bottom-right; it rests off the card between crossings.
 */
export function teraCoatSweep(elapsedMs) {
  const t = elapsedMs - TERA_COAT.formMs;
  if (!(t > 0)) return -0.2;
  const phase = cycle(t, TERA_COAT.sweepPeriodMs) * (TERA_COAT.sweepPeriodMs / TERA_COAT.sweepMs);
  return -0.2 + 1.4 * easeInOut(clamp01(phase));
}

/** The rim glow's strength: it breathes 0.7 → 1 → 0.7. */
export function teraCoatBreath(elapsedMs) {
  const phase = cycle(Math.max(0, elapsedMs), TERA_COAT.breathMs);
  return 0.7 + 0.3 * easeInOut(phase < 0.5 ? phase * 2 : (1 - phase) * 2);
}

// The shard lattice (column-major mat2) and its inverse: card heights ↔ cell space. Stretched
// across one diagonal, so the cells are long shards and not round pebbles.
const LATTICE = [9.2, 4.4, -3.4, 6.6];
const LATTICE_DET = LATTICE[0] * LATTICE[3] - LATTICE[2] * LATTICE[1];
const UNLATTICE = [LATTICE[3], -LATTICE[1], -LATTICE[2], LATTICE[0]].map((v) => (v / LATTICE_DET).toFixed(6));

export const TERA_COAT_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Colours are display values (the board pass writes sRGB): the palette goes in as rgb / 255.
// Output is premultiplied: alpha is how much of the card a shard covers, colour past it is light.
export const TERA_COAT_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uPlane;      // the plane's size in card heights
uniform vec2 uHalf;       // the card's half size in card heights
uniform float uRadius;    // its corner radius, card heights
uniform vec3 uDeep;
uniform vec3 uBody;
uniform vec3 uHot;
uniform float uSeed;
uniform float uTime;      // seconds; held while motion is off
uniform float uForm;      // 0 no coat … 1 formed
uniform float uSweep;     // the band's place along the card's diagonal
uniform float uBreath;
uniform float uFade;

vec2 hash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + uSeed * 0.0137);
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
float cardDistance(vec2 p) {
  vec2 q = abs(p) - uHalf + vec2(uRadius);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
}
// The shard under a point: its seed (in cell space), its own random pair, and how far the point
// is from the crease it shares with the next shard.
void shardAt(vec2 p, out vec2 seedAt, out vec2 rnd, out float crease) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 nearest = vec2(0.0);
  vec2 nearestId = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash2(cell + g) - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        nearest = r;
        nearestId = cell + g;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  seedAt = p + nearest;
  rnd = hash2(nearestId + 17.0);
  crease = sqrt(d2) - sqrt(d1);
}
vec3 spectrum(float h) {
  return 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
}
void main() {
  vec2 p = (vUv - 0.5) * uPlane;
  float d = cardDistance(p);
  float inside = step(d, 0.0);
  mat2 lattice = mat2(${LATTICE.join(', ')});
  mat2 unlattice = mat2(${UNLATTICE.join(', ')});
  vec2 seedAt;
  vec2 rnd;
  float crease;
  shardAt(lattice * p, seedAt, rnd, crease);
  // A whole shard belongs to the frame or it does not, by how deep in the card its seed lies:
  // the frame's inner edge is a line of cut faces, not a fade.
  vec2 seedCard = unlattice * seedAt;
  float depth = max(-cardDistance(seedCard), 0.0);
  float reach = 0.022 + 0.058 * rnd.x;
  float frame = 1.0 - smoothstep(reach, reach + 0.01, depth);
  // A few lone faces over the art: they only glint, they cover nothing.
  float lone = step(0.93, rnd.y) * (1.0 - frame);
  // The coat forms from the border inward, each shard at its own moment, flashing as it sets.
  float formAt = depth * 4.2 + rnd.y * 0.28;
  float formed = smoothstep(formAt, formAt + 0.1, uForm * 1.45);
  float flash = formed * (1.0 - smoothstep(formAt + 0.1, formAt + 0.45, uForm * 1.45));
  frame *= formed * inside;
  lone *= formed * inside;

  // One flat face per shard: its tone by its tilt to the light, and a slope across it.
  vec2 lean = rnd - 0.5;
  float slope = dot(p - seedCard, normalize(lean + 1e-3)) * 5.0;
  float tone = clamp(0.5 + dot(lean, vec2(-1.1, 1.4)) + slope * 0.3, 0.0, 1.0);
  vec3 glass = mix(uDeep, uBody, tone);
  float cover = frame * (0.26 + 0.26 * (1.0 - tone));
  vec3 colour = glass * cover + uBody * frame * tone * 0.2;

  // Each face flashes in its own turn (fast on, slow off), and every face in the sweep's band.
  float beat = fract(uTime * 0.21 + rnd.y * 7.0 + uSeed * 0.1);
  float twinkle = smoothstep(0.0, 0.05, beat) * (1.0 - smoothstep(0.05, 0.3, beat));
  float along = dot(p / (2.0 * uHalf) + 0.5, vec2(0.5));
  float band = exp(-pow((along - uSweep) / 0.11, 2.0));
  float lit = twinkle * 0.42 + band * (0.25 + 0.75 * rnd.x) * 0.55 + flash * 0.5;
  colour += mix(uBody, uHot, 0.6) * (frame + lone * 0.6) * lit;

  // Creases: a thin line of light where two faces meet, with a little fire in it.
  float line = 1.0 - smoothstep(0.0, 0.05, crease);
  vec3 fire = mix(uHot, spectrum(rnd.x + along * 1.4 + uSeed * 0.07), 0.35);
  colour += fire * line * (frame * (0.4 + 0.5 * lit) + lone * lit);
  // The art takes a breath of the sweep, so the whole card answers it.
  colour += uBody * band * 0.05 * inside * uForm;

  // The card's own edge, and the glow that leaves it.
  float edge = exp(-abs(d) / 0.006) * (0.3 + 0.4 * band);
  float glow = exp(-max(d, 0.0) / 0.04) * (1.0 - inside) * uBreath;
  float halo = exp(-max(d, 0.0) / 0.012) * (1.0 - inside);
  vec3 rimLight = mix(uBody, uHot, 0.5);
  colour += (rimLight * edge + uBody * glow * 0.5 + rimLight * halo * 0.2) * uForm;

  colour *= uFade;
  cover *= uFade;
  if (max(max(colour.r, colour.g), max(colour.b, cover)) < 0.003) discard;
  gl_FragColor = vec4(colour, cover);
}
`;
