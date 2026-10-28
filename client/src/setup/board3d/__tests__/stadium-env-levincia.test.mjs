import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  LEVINCIA_KEY,
  MAX_BILLBOARDS,
  MAX_TOWERS,
  PROP_FRAGMENT,
  STAGE_MARGIN_PX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  WALKWAY,
  WATER_FRAGMENT,
  WATER_VERTEX,
  levinciaProps,
  levinciaSpots,
} from '../stadium-env-levincia.mjs';
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

// customhb-278 is Levincia in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Levincia by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-278' }), LEVINCIA_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '278' }), LEVINCIA_KEY);
});

test('levinciaSpots: the stage holds every card; the walkway rings it past the water', () => {
  for (const layout of layouts) {
    const { centre, stage, walkIn, walkOut, u } = levinciaSpots(layout);
    for (const r of cardsOf(layout)) {
      for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        assert.ok(Math.hypot(x - centre.x, y - centre.y) <= stage - STAGE_MARGIN_PX * u + 1e-6);
      }
    }
    assert.ok(walkIn > stage && Math.abs(walkOut - walkIn - WALKWAY.width * u) < 1e-9);
  }
});

test('levinciaSpots: billboards only off the near arc, towers past the walkway', () => {
  for (const layout of layouts) {
    const { centre, walkOut, billboards, towers } = levinciaSpots(layout);
    assert.ok(billboards.length <= MAX_BILLBOARDS && towers.length <= MAX_TOWERS);
    for (const board of billboards) assert.ok(board.y >= centre.y - walkOut * Math.sin(0.1 * Math.PI) - 1e-6);
    for (const tower of towers) assert.ok(Math.hypot(tower.x - centre.x, tower.y - centre.y) >= walkOut + tower.r);
  }
});

test('no billboard or tower covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { billboards, towers } = levinciaSpots(layout);
    const points = [
      ...billboards.flatMap((board) => {
        const out = [Math.cos(board.angle), Math.sin(board.angle)];
        const along = [-out[1], out[0]];
        const top = [board.x + out[0] * Math.sin(0.7) * board.height, board.y + out[1] * Math.sin(0.7) * board.height, WALKWAY.height + board.height];
        return [-1, 1].flatMap((s) => [
          [board.x + along[0] * s * board.width * 0.5, board.y + along[1] * s * board.width * 0.5, WALKWAY.height],
          [top[0] + along[0] * s * board.width * 0.5, top[1] + along[1] * s * board.width * 0.5, top[2]],
        ]);
      }),
      ...towers.flatMap((t) => [[t.x - t.r, t.y, t.h], [t.x + t.r, t.y, t.h], [t.x, t.y - t.r, t.h], [t.x, t.y + t.r, t.h]]),
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('levinciaSpots is null without a layout; the props build', () => {
  assert.equal(levinciaSpots(null), null);
  assert.ok(levinciaProps(levinciaSpots(layouts[0])).vertexCount() > 1000);
});

test('Levincia shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, WATER_VERTEX, WATER_FRAGMENT, PROP_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
