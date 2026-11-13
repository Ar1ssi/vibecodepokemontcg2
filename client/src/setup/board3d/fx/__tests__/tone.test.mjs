// Design 089 D6: the FX composite's highlight roll-off (tone.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import { ROLL_OFF_GLSL, SPLIT_COVER_GLSL, TONE, compositeOver, rollOff, splitCover } from '../tone.mjs';

const close = (a, b, label, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${label}: ${a} vs ${b}`);
const hueOf = ([r, g, b]) => {
  const peak = Math.max(r, g, b);
  return [r / peak, g / peak, b / peak];
};

test('light under the knee passes unchanged', () => {
  for (const colour of [[0, 0, 0], [0.2, 0.1, 0.05], [TONE.knee, 0.3, 0.1]]) assert.deepEqual(rollOff(colour), colour);
  assert.deepEqual(rollOff([-1, Number.NaN, 0.5]), [0, 0, 0.5], 'bad channels are black, not NaN');
});

test('a colour too bright keeps its hue instead of clipping to white', () => {
  // The old composite clamped each channel: this yellow became (1, 1, 0.9).
  const yellow = [3, 2.4, 0.9];
  const out = rollOff(yellow);
  assert.ok(Math.max(...out) < 1, `stays under 1: ${out}`);
  // It leans a little to white (it is over `whitenFrom`), far less than a clamp does.
  assert.ok(out[2] / out[0] < 0.5, `still yellow: ${out}`);
  // Under `whitenFrom` the hue is exact.
  const orange = [1.5, 0.6, 0.15];
  const kept = hueOf(rollOff(orange));
  hueOf(orange).forEach((value, i) => close(kept[i], value, `channel ${i}`, 1e-9));
});

test('brighter in means brighter out, with no step at the knee, and never past 1', () => {
  let previous = 0;
  for (let peak = 0.05; peak <= 40; peak += 0.05) {
    const out = Math.max(...rollOff([peak, peak * 0.5, peak * 0.1]));
    assert.ok(out >= previous - 1e-12, `monotone at ${peak}`);
    assert.ok(out <= 1, `at most 1 at ${peak}`);
    if (peak < 4) assert.ok(out < 1, `under 1 at ${peak}`);
    assert.ok(out - previous < 0.06, `no step at ${peak}`);
    previous = out;
  }
  assert.ok(previous > 0.99, 'a very hot light is all but full');
});

test('only light many times over leans to white, and never all the way', () => {
  const lean = (peak) => {
    const [r, , b] = rollOff([peak, peak * 0.4, 0]);
    return b / r;
  };
  assert.equal(lean(1.2), 0);
  assert.ok(lean(4) > 0 && lean(4) < lean(20));
  assert.ok(lean(100) <= TONE.whiten + 1e-9, 'a hot core stays a colour');
});

test('the shader is built from the same numbers', () => {
  for (const value of [TONE.knee, TONE.whiten, TONE.whitenFrom, TONE.whitenTo]) assert.ok(ROLL_OFF_GLSL.includes(value.toFixed(4)), String(value));
  assert.ok(ROLL_OFF_GLSL.includes('vec3 fxRollOff(vec3 colour)'));
});

test('a texel that only covers goes over the board exactly: no roll-off, no screen', () => {
  // Smoke at 80 %, and a white card bent through a lens at full cover.
  const board = [0.9, 0.6, 0.2];
  compositeOver(board, [0.24, 0.2, 0.16], 0.8).forEach((v, i) => close(v, board[i] * 0.2 + [0.24, 0.2, 0.16][i], `smoke ${i}`));
  assert.deepEqual(compositeOver(board, [1, 1, 1], 1), [1, 1, 1], 'a bright card seen through a lens is not dimmed');
  assert.deepEqual(splitCover([0.3, 0.2, 0.1], 0.5).light, [0, 0, 0]);
});

test('light with no cover is screened on: the card under it still shows, and nothing passes 1', () => {
  const out = compositeOver([0.5, 0.5, 0.5], [0.4, 0.2, 0], 0);
  [0.5 * 0.6 + 0.4, 0.5 * 0.8 + 0.2, 0.5].forEach((v, i) => close(out[i], v, `screen ${i}`));
  for (const board of [[1, 1, 1], [0.2, 0.9, 0.4]]) {
    for (const [colour, alpha] of [[[9, 7, 1], 0], [[3, 2.5, 1], 0.9], [[0.5, 4, 0.5], 0.3]]) {
      assert.ok(compositeOver(board, colour, alpha).every((v) => v <= 1 + 1e-12 && v >= 0), `${board} under ${colour}@${alpha}`);
    }
  }
});

test('bright light on top of cover keeps its hue: the cover does not turn it white', () => {
  // A yellow-orange far over 1 on a texel that is 90 % covered.
  const { matter, light, cover } = splitCover([3, 2.5, 1], 0.9);
  assert.equal(cover, 0.9);
  hueOf(matter).forEach((v, i) => close(v, hueOf([3, 2.5, 1])[i], `matter hue ${i}`));
  hueOf(light).forEach((v, i) => close(v, hueOf([3, 2.5, 1])[i], `light hue ${i}`));
  const out = compositeOver([1, 1, 1], [3, 2.5, 1], 0.9);
  assert.ok(out[2] < 0.65 && out[0] > 0.95, `still yellow-orange: ${out}`);
  assert.deepEqual(splitCover([Number.NaN, -2, 0], 5), { matter: [0, 0, 0], light: [0, 0, 0], cover: 1 });
});

test('the split shader is the same split', () => {
  assert.ok(SPLIT_COVER_GLSL.includes('min(1.0, cover / peak)'));
  assert.ok(SPLIT_COVER_GLSL.includes('light = fxRollOff(c - matter)'));
});
