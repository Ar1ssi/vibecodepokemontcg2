// Test helper (not a test): where a Stadium board's props land on screen in both camera presets,
// against the screen boxes of every card footprint, for the boards' "never covers a card" tests.
import { cameraFromCssTilt, cameraTcgLive, projectToScreen, tableToWorld } from '../board-camera.mjs';
import { flatLayout, halfFromViewport } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints } from '../stadium-environment-layout.mjs';

const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];

/** The no-mat board at three window sizes, then every other mat profile at 1920x1080. */
export const SCREEN_VIEWS = [
  ...[
    { w: 1920, h: 1080 },
    { w: 1366, h: 768 },
    { w: 2560, h: 1440 },
  ].map((viewport) => ({ viewport, profile: NO_MAT_LAYOUT_ID })),
  ...PROFILES.slice(1).map((profile) => ({ viewport: { w: 1920, h: 1080 }, profile })),
];

/** A view's layout and its two cameras, each as `project(x, y, z)` → screen px (null behind the eye). */
export function screenView({ viewport, profile }) {
  const half = halfFromViewport(viewport);
  const layout = flatLayout(getMatLayout(profile), half, { viewport });
  const params = { viewportW: viewport.w, viewportH: viewport.h, nearHalf: half };
  const cameras = { tilt12: cameraFromCssTilt(params), tcgl: cameraTcgLive({ ...params, cardHeightPx: layout.self.cardBox.active.h }) };
  const projectors = Object.entries(cameras).map(([preset, camera]) => ({
    preset,
    project: (x, y, z) => projectToScreen(camera, tableToWorld({ x, y, z }, camera)),
  }));
  return { layout, projectors };
}

/** Every card footprint's box on screen through `project`. */
export function cardScreenBoxes(layout, project) {
  const { slabs, flats } = environmentFootprints(layout);
  return [...slabs, ...flats].map((rect) => {
    const corners = [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x, rect.y + rect.h],
      [rect.x + rect.w, rect.y + rect.h],
    ].map(([x, y]) => project(x, y, 0));
    return {
      x0: Math.min(...corners.map((p) => p.x)),
      x1: Math.max(...corners.map((p) => p.x)),
      y0: Math.min(...corners.map((p) => p.y)),
      y1: Math.max(...corners.map((p) => p.y)),
    };
  });
}

/** The first of `points` ([x, y, z] table px) that lands on a card's screen box, or null. */
export function pointOnCard(points, layout, project) {
  const boxes = cardScreenBoxes(layout, project);
  for (const point of points) {
    const p = project(...point);
    if (p && boxes.some((b) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1)) return point;
  }
  return null;
}
