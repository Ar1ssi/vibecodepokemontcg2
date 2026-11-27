import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, isDarkFistPalette } from '../../materials/_units.js';

const hexRgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const paletteOf = (tint) => Object.fromEntries(Object.entries(tint).map(([key, hex]) => [key, hexRgb(hex)]));
// The fist tints of design 092's specs (max/specs/electric-poison-fighting.mjs).
const KNUCKLE = paletteOf({ deep: '#4A0C22', body: '#9A2A50', hot: '#FF6AA8', core: '#FFD0E2' });
const CHI = paletteOf({ deep: '#22080A', body: '#5E1A0E', hot: '#F08A2A', core: '#A0402A' });

/** A context that keeps every radial gradient's stops as [r, g, b] triples. */
const gradientContext = () => {
  const gradients = [];
  const ctx = new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'createRadialGradient' || key === 'createLinearGradient') {
          return () => {
            const stops = [];
            gradients.push(stops);
            return { addColorStop: (_at, css) => stops.push(css.match(/\d+/g).slice(0, 3).map(Number)) };
          };
        }
        return () => {};
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    }
  );
  return { ctx, gradients };
};

/** The fist's lit body gradients: the ones that start from its core. */
const litGradients = (palette) => {
  const { ctx, gradients } = gradientContext();
  UNITS.maxFist(ctx, 0, 0, 40, 30, 0.5, palette);
  return gradients.filter((stops) => stops.length >= 3 && stops[0].join() === palette.core.join());
};

test('isDarkFistPalette: a core darker than its hot marks a dark fist', () => {
  assert.equal(isDarkFistPalette(KNUCKLE), false);
  assert.equal(isDarkFistPalette(CHI), true);
});

test('maxFist: a dark fist keeps its hot out of its lit body; a light one lights through it', () => {
  const dark = litGradients(CHI);
  assert.equal(dark.length, 6, 'hand, four fingers, thumb');
  for (const stops of dark) assert.ok(!stops.some((rgb) => rgb.join() === CHI.hot.join()), 'no hot band in a dark fist');
  const light = litGradients(KNUCKLE);
  assert.equal(light.length, 6);
  for (const stops of light) assert.ok(stops.some((rgb) => rgb.join() === KNUCKLE.hot.join()), 'Knuckle stays lit through its hot');
});
