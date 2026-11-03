import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { BAKE_FIELD_FRAGMENT, BAKE_MOUNTAIN_FRAGMENT, craterCeiling, craterDressing, craterProps } from '../stadium-env-highland.mjs';
import { craterBowl, mountainPeaks } from '../stadium-environment-layout.mjs';
import { SCREEN_VIEWS, geometryOnCard, screenView } from './stadium-screen.mjs';

test('the mountain height craterCeiling bounds is still the bake\'s', () => {
  for (const piece of [
    'float swell = mix(84.0, 130.0, around(dir, 1.6, 1.3));',
    'swell + 34.0 * pow(ridged(dir * 5.0 + 2.3), 4.0) + 14.0 * pow(ridged(dir * 11.0 + 8.9), 5.0)',
    'return uBowl.z + 24.0 * around(dir, 2.2, 3.7);',
    'return uBowl.w + 34.0 * (around(dir, 2.8, 8.1) - 0.35);',
    'return crest * (1.0 - pow(1.0 - s, 1.8)) + 16.0 * gully * sin(3.14159 * s);',
    'float slope = mix(crest, 20.0, 1.0 - pow(1.0 - fall, 1.5));',
    'return slope + 20.0 * gully * (1.0 - fall) * smoothstep(0.0, 0.15, fall);',
    'return t > 0.0 ? spot.w * pow(t, 1.15) : 0.0;',
    'float crest = spot.w * mix(0.72, 0.22, s) * (0.85 + 0.3 * gnoise(vec2(s * 5.0, seed)));',
    'return max(h, crest * pow(max(1.0 - across, 0.0), 1.2));',
    'gl_FragColor = vec4(smaxUp(wall, summits, 26.0), wall, summits, 0.0);',
  ]) {
    assert.ok(BAKE_MOUNTAIN_FRAGMENT.includes(piece), piece);
  }
  for (const piece of [
    'float plane = max(clamp(hc + dot(g + lean, p - c), h - 20.0, h + 20.0), 0.0);',
    'float ground = 2.0 * (fbm3(p / 240.0) - 0.5) + 5.0 * smoothstep(-90.0, 0.0, floorSD);',
    'gl_FragColor = vec4(ground + max(rock.x, debris), floorSD, tone, kind);',
  ]) {
    assert.ok(BAKE_FIELD_FRAGMENT.includes(piece), piece);
  }
});

test('craterCeiling: low on the crater floor, highest round the rim, lower toward the foot, a peak tallest at its summit', () => {
  const { layout } = screenView(SCREEN_VIEWS[0]);
  const bowl = craterBowl(layout);
  const peaks = mountainPeaks(layout, bowl);
  const at = (out, angle = Math.PI / 2) => craterCeiling(bowl, { left: null, right: null }, bowl.x + Math.cos(angle) * out, bowl.y + Math.sin(angle) * out);
  assert.equal(at(0), 32.5, 'the floor: only the faces and dust allowance');
  assert.ok(at(bowl.rim) > at((bowl.floor + bowl.rim) / 2));
  assert.ok(at(bowl.rim) > at(bowl.foot));
  assert.ok(at(bowl.foot) >= 20 + 32.5);
  const summit = peaks.right ?? peaks.left;
  assert.ok(summit, 'the default layout has a peak');
  assert.ok(craterCeiling(bowl, peaks, summit.x, summit.y) >= summit.h);
});

test('craterDressing: nothing without a crater; boulders and pines, all inside the mountain', () => {
  assert.deepEqual(craterDressing(null, null, null), []);
  const { layout } = screenView(SCREEN_VIEWS[0]);
  const bowl = craterBowl(layout);
  const pieces = craterDressing(layout, bowl, mountainPeaks(layout, bowl));
  assert.ok(pieces.some((piece) => piece.asset === 'boulder') && pieces.some((piece) => piece.asset === 'pine'));
  for (const piece of pieces) assert.ok(Math.hypot(piece.x - bowl.x, piece.y - bowl.y) < bowl.foot);
});

test('no boulder or pine of the crater covers a card on screen, in either camera preset, risen on the mountain', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const bowl = craterBowl(layout);
    const peaks = mountainPeaks(layout, bowl);
    const pieces = craterDressing(layout, bowl, peaks);
    if (!pieces.length) continue;
    const geometry = craterProps(pieces).build(three);
    // The ground's lowest: the dust's dip and the emblem's groove under a flat floor.
    const ground = (x, y) => [-3, craterCeiling(bowl, peaks, x, y)];
    for (const { preset, project } of projectors) {
      const hit = geometryOnCard(geometry, layout, project, { ground });
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});
