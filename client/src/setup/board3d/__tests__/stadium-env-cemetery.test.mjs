import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  CEMETERY_KEY,
  MAX_GRAVES,
  MAX_PATH_POINTS,
  MAX_PINES,
  MIST_FRAGMENT,
  MIST_VERTEX,
  MOON,
  PATH_CARD_GAP_PX,
  PROP_FRAGMENT,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  cemeteryProps,
  cemeterySpots,
} from '../stadium-env-cemetery.mjs';
import { SCREEN_VIEWS, pointOnCard, screenView } from './stadium-screen.mjs';

const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));
const cardsOf = (layout) => {
  const { slabs, flats } = environmentFootprints(layout);
  return [...slabs, ...flats];
};
const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));

// customhb-198 is Old Cemetery in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Old Cemetery by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-198' }), CEMETERY_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '198' }), CEMETERY_KEY);
});

test('the moon stands beyond the far end, so every shadow falls toward the player', () => {
  assert.ok(MOON[1] > 0.5 && MOON[2] > 0);
});

test('cemeterySpots: the path runs in past one edge and out past another, clear of every card', () => {
  for (const layout of layouts) {
    const { path, scene, halfPath, u } = cemeterySpots(layout);
    assert.ok(path.length >= 10 && path.length <= MAX_PATH_POINTS);
    const outside = ([x, y]) => x < scene.x || x > scene.x + scene.w || y < scene.y || y > scene.y + scene.h;
    assert.ok(outside(path[0]) && outside(path[path.length - 1]), 'both ends leave the scene');
    for (let i = 0; i < path.length - 1; i += 1) {
      for (let k = 0; k <= 4; k += 1) {
        const x = path[i][0] + ((path[i + 1][0] - path[i][0]) * k) / 4;
        const y = path[i][1] + ((path[i + 1][1] - path[i][1]) * k) / 4;
        // The shader widens the path up to 1.45 times its half width where it wears.
        for (const card of cardsOf(layout)) assert.ok(distanceToRect(x, y, card) >= halfPath * 1.45 + PATH_CARD_GAP_PX * u * 0.5);
      }
    }
  }
});

test('cemeterySpots: graves off the path and every card, in the side bands and off the far end', () => {
  for (const layout of layouts) {
    const { graves, pines, core } = cemeterySpots(layout);
    assert.ok(graves.length >= 10 && graves.length <= MAX_GRAVES);
    assert.ok(pines.length <= MAX_PINES);
    for (const grave of graves) {
      assert.ok(grave.y >= core.y, 'none toward the near end');
      for (const card of cardsOf(layout)) assert.ok(distanceToRect(grave.x, grave.y, card) > grave.width * 0.5);
    }
  }
});

test('no grave, pine or the bare tree covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const spots = cemeterySpots(layout);
    const points = [
      ...spots.graves.flatMap((g) => [[g.x, g.y, 0], [g.x, g.y + g.lean * g.height, g.height]]),
      ...spots.pines.flatMap((p) => [[p.x - p.r, p.y, p.h * 0.2], [p.x + p.r, p.y, p.h * 0.2], [p.x, p.y - p.r, p.h * 0.2], [p.x, p.y, p.h]]),
      [spots.tree.x, spots.tree.y, spots.tree.h],
      [spots.post.x, spots.post.y, spots.post.h],
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('cemeterySpots is null without a layout; the props build', () => {
  assert.equal(cemeterySpots(null), null);
  assert.ok(cemeteryProps(cemeterySpots(layouts[0])).vertexCount() > 500);
});

test('Old Cemetery shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, PROP_FRAGMENT, MIST_VERTEX, MIST_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
