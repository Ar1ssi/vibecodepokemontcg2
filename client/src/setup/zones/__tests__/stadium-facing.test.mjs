import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  setStadiumFacing,
  STADIUM_OPP_FACING_CLASS,
} from '../stadium-facing.mjs';

const fakeElement = () => {
  const classes = new Set();
  return {
    style: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
  };
};

test('setStadiumFacing toggles the opponent-facing class without an inline transform', () => {
  const stadium = fakeElement();
  setStadiumFacing(stadium, true);
  assert.equal(stadium.classList.contains(STADIUM_OPP_FACING_CLASS), true);
  assert.equal(stadium.style.transform, undefined);

  setStadiumFacing(stadium, false);
  assert.equal(stadium.classList.contains(STADIUM_OPP_FACING_CLASS), false);
  assert.equal(stadium.style.transform, undefined);
});

test('setStadiumFacing ignores a missing element', () => {
  assert.doesNotThrow(() => setStadiumFacing(null, true));
  assert.doesNotThrow(() => setStadiumFacing({}, true));
});

// Opponent-played Stadiums vanished: an inline scale(-1,-1) on #stadium replaced
// the tilt transform and pivoted around the tilt origin, far off-screen.
test('index.css flips the Stadium image, leaving #stadium on the tilt transform', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../../css/index.css', import.meta.url)),
    'utf8'
  ).replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = css.match(/#stadium\.stadium-opp-facing img\s*\{([^}]*)\}/);
  assert.ok(rule, 'missing #stadium.stadium-opp-facing img rule');
  // `rotate`, not `transform`: reset-image.js's inline transform would win.
  assert.match(rule[1], /(^|;)\s*rotate:\s*180deg/);
  assert.doesNotMatch(css, /#stadium\.stadium-opp-facing\s*\{/);
});
