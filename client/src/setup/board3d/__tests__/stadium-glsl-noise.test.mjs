// Design 083: the boards' ground ceilings (VITALITY_GROUND_CEILING_PX, GRAND_GROUND_CEILING_PX,
// FAIRY_GROUND_CEILING_PX) add up each bake's swell as if fbm3 never left 0..1. This checks that
// assumption on a port of the shared NOISE chunk (stadium-environment-glsl.mjs), and that the chunk
// still says what the port does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOISE } from '../stadium-environment-glsl.mjs';

const fract = (x) => x - Math.floor(x);

/** hash22 as NOISE writes it. */
function hash22(px, py) {
  const p3 = [fract(px * 0.1031), fract(py * 0.103), fract(px * 0.0973)];
  const d = p3[0] * (p3[1] + 33.33) + p3[1] * (p3[2] + 33.33) + p3[2] * (p3[0] + 33.33);
  const [x, y, z] = p3.map((v) => v + d);
  return [fract((x + y) * z), fract((x + z) * y)];
}

/** gnoise as NOISE writes it: gradient noise, quintic fade, 0.5 + 0.9 × the blend. */
function gnoise(px, py) {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const fade = (f) => f * f * f * (f * (f * 6 - 15) + 10);
  const corner = (cx, cy) => {
    const [gx, gy] = hash22(ix + cx, iy + cy);
    return (gx * 2 - 1) * (fx - cx) + (gy * 2 - 1) * (fy - cy);
  };
  const ux = fade(fx);
  const uy = fade(fy);
  const ab = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * ux;
  const cd = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * ux;
  return 0.5 + 0.9 * (ab + (cd - ab) * uy);
}

/** fbm3 as NOISE writes it: three octaves turned by TURN, over 0.875. */
function fbm3(px, py) {
  let value = 0;
  let amplitude = 0.5;
  let [x, y] = [px, py];
  for (let i = 0; i < 3; i += 1) {
    value += amplitude * gnoise(x, y);
    [x, y] = [(0.8 * x - 0.6 * y) * 2.03 + 11.7, (0.6 * x + 0.8 * y) * 2.03 + 11.7];
    amplitude *= 0.5;
  }
  return value / 0.875;
}

test('the port follows the NOISE chunk line for line', () => {
  assert.match(NOISE, /vec3 p3 = fract\(vec3\(p\.xyx\) \* vec3\(0\.1031, 0\.1030, 0\.0973\)\);/);
  assert.match(NOISE, /return fract\(\(p3\.xx \+ p3\.yz\) \* p3\.zy\);/);
  assert.match(NOISE, /return 0\.5 \+ 0\.9 \* mix\(mix\(a, b, u\.x\), mix\(c, d, u\.x\), u\.y\);/);
  assert.match(NOISE, /const mat2 TURN = mat2\(0\.8, 0\.6, -0\.6, 0\.8\);/);
  assert.match(NOISE, /p = TURN \* p \* 2\.03 \+ 11\.7;/);
  assert.match(NOISE, /return value \/ 0\.875;/);
});

test('fbm3 stays inside 0..1 over the table\'s range, so the ceilings that add it up hold', () => {
  let low = Infinity;
  let high = -Infinity;
  // The bakes read fbm3(p / 70 .. p / 210) over scenes about ±1500 px: up to ±25 lattice units; wider here.
  for (let i = 0; i < 400000; i += 1) {
    const x = fract(Math.sin(i * 12.9898) * 43758.5453) * 160 - 80;
    const y = fract(Math.sin(i * 78.233) * 24634.6345) * 160 - 80;
    const v = fbm3(x, y);
    low = Math.min(low, v);
    high = Math.max(high, v);
  }
  assert.ok(high < 1, `fbm3 tops out at ${high}`);
  assert.ok(low > 0, `fbm3 bottoms out at ${low}`);
});
