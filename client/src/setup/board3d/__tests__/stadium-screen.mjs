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
  const quads = cardScreenQuads(layout, project);
  for (const point of points) {
    const p = project(...point);
    if (p && quads.some((quad) => insideQuad(p, quad))) return point;
  }
  return null;
}

/**
 * Every card footprint's four corners on screen through `project`, in order round it: the card's
 * own outline (a trapezoid under perspective), tighter than its box near the corners.
 */
export function cardScreenQuads(layout, project) {
  const { slabs, flats } = environmentFootprints(layout);
  return [...slabs, ...flats].map((rect) =>
    [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x + rect.w, rect.y + rect.h],
      [rect.x, rect.y + rect.h],
    ].map(([x, y]) => project(x, y, 0))
  );
}

/** True when screen point p lies strictly inside the convex quad (corners in order, either winding). */
const insideQuad = (p, quad) => {
  if (quad.some((corner) => !corner)) return false;
  let sign = 0;
  for (let k = 0; k < 4; k += 1) {
    const a = quad[k];
    const b = quad[(k + 1) % 4];
    const side = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (side === 0) return false;
    if (sign === 0) sign = Math.sign(side);
    else if (Math.sign(side) !== sign) return false;
  }
  return true;
};

/** Every `every`-th vertex of a built geometry as [x, y, z] table px (a board's solids, for pointOnCard). */
export function geometryPoints(geometry, every = 5) {
  const position = geometry.getAttribute('position');
  const points = [];
  for (let i = 0; i < position.count; i += every) points.push([position.getX(i), position.getY(i), position.getZ(i)]);
  return points;
}
