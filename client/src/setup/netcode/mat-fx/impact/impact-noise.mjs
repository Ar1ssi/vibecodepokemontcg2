// Design 068: the vector noise field behind Unity's particle Noise module — three decorrelated
// samples of 3-D gradient (Perlin) noise, summed over octaves. Unity's own field is not
// published; this one has its character (smooth, zero-mean, range about −1 … 1). DOM-free.

const PERMUTATION = (() => {
  const table = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, index) => index);
  let state = 0x2545f491;
  for (let index = 255; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [base[index], base[swap]] = [base[swap], base[index]];
  }
  for (let index = 0; index < 512; index += 1) table[index] = base[index & 255];
  return table;
})();

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a, b, t) => a + (b - a) * t;

const gradient = (hash, x, y, z) => {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

/** Improved Perlin noise, about −1 … 1, 0 at every lattice point. */
export function noise3(x, y, z) {
  const xf = Math.floor(x);
  const yf = Math.floor(y);
  const zf = Math.floor(z);
  const X = xf & 255;
  const Y = yf & 255;
  const Z = zf & 255;
  const dx = x - xf;
  const dy = y - yf;
  const dz = z - zf;
  const u = fade(dx);
  const v = fade(dy);
  const w = fade(dz);
  const p = PERMUTATION;
  const a = p[X] + Y;
  const aa = p[a] + Z;
  const ab = p[a + 1] + Z;
  const b = p[X + 1] + Y;
  const ba = p[b] + Z;
  const bb = p[b + 1] + Z;
  return mix(
    mix(mix(gradient(p[aa], dx, dy, dz), gradient(p[ba], dx - 1, dy, dz), u), mix(gradient(p[ab], dx, dy - 1, dz), gradient(p[bb], dx - 1, dy - 1, dz), u), v),
    mix(
      mix(gradient(p[aa + 1], dx, dy, dz - 1), gradient(p[ba + 1], dx - 1, dy, dz - 1), u),
      mix(gradient(p[ab + 1], dx, dy - 1, dz - 1), gradient(p[bb + 1], dx - 1, dy - 1, dz - 1), u),
      v
    ),
    w
  );
}

const OFFSETS = [
  [0, 0, 0],
  [37.2, 11.7, 5.3],
  [-19.1, 7.9, 23.4],
];

/**
 * The field at `point` (already times the module's frequency, plus its scroll): `octaves`
 * layers, each `scale` times finer and `multiplier` times weaker than the last.
 * @returns {[number, number, number]}
 */
export function noiseVector(point, { octaves = 1, multiplier = 0.5, scale = 2 } = {}) {
  const out = [0, 0, 0];
  let amplitude = 1;
  let frequency = 1;
  for (let octave = 0; octave < Math.max(1, octaves); octave += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const offset = OFFSETS[axis];
      out[axis] += amplitude * noise3(point[0] * frequency + offset[0], point[1] * frequency + offset[1], point[2] * frequency + offset[2]);
    }
    amplitude *= multiplier;
    frequency *= scale;
  }
  return out;
}
