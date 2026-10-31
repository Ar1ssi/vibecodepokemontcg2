// Test helper (not a test): where a Stadium board's props land on screen in both camera presets,
// against the projected outline of every card footprint, for the boards' "never covers a card" tests.
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

const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
/** True when screen segments ab and cd cross (each one's ends strictly either side of the other). */
const crosses = (a, b, c, d) => side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0;
/** True when screen segment ab has any point inside the quad. */
const segmentMeetsQuad = (a, b, quad) =>
  quad.every(Boolean) && (insideQuad(a, quad) || insideQuad(b, quad) || quad.some((c, k) => crosses(a, b, c, quad[(k + 1) % 4])));

/** The first of `points` ([x, y, z] table px) that lands on a card's outline on screen, or null. */
export function pointOnCard(points, layout, project) {
  const quads = cardScreenQuads(layout, project);
  for (const point of points) {
    const p = project(...point);
    if (p && quads.some((quad) => insideQuad(p, quad))) return point;
  }
  return null;
}

/**
 * The first vertex of a built geometry ([x, y, z] table px) that lands on a card's outline on screen
 * while standing above the cloth, or null; every vertex is tested. (One below the cloth that shows
 * inside a card's outline lies behind that card along the eye's ray, so the card rightly hides it.)
 * `ground(x, y)` → [lowest, highest] px, for a board whose kit stands on its baked ground
 * (stadium-kit.mjs kitGround): a vertex whose foot stands on the ground (aFoot.z 1) rises by the
 * ground's height at its foot, somewhere in that range, so it is tested along the whole rise (a
 * straight segment on screen).
 */
export function geometryOnCard(geometry, layout, project, { ground = null } = {}) {
  const quads = cardScreenQuads(layout, project);
  const position = geometry.getAttribute('position');
  const foot = ground ? geometry.getAttribute('aFoot') : null;
  const rises = new Map();
  for (let i = 0; i < position.count; i += 1) {
    const at = [position.getX(i), position.getY(i), position.getZ(i)];
    if (!foot || foot.getZ(i) < 0.5) {
      if (at[2] <= 0) continue;
      const p = project(...at);
      if (p && quads.some((quad) => insideQuad(p, quad))) return at;
      continue;
    }
    const key = `${foot.getX(i)},${foot.getY(i)}`;
    if (!rises.has(key)) rises.set(key, ground(foot.getX(i), foot.getY(i)));
    const [low, high] = rises.get(key);
    if (at[2] + high <= 0) continue;
    const a = project(at[0], at[1], Math.max(at[2] + low, 0));
    const b = project(at[0], at[1], at[2] + high);
    if (a && b && quads.some((quad) => segmentMeetsQuad(a, b, quad))) return at;
  }
  return null;
}
