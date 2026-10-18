// The "(N)" zone counts of the three.js board (design 074 §D3 "Piles", O6-B): one text plane per
// pile, centred just above it where overlay-plan.mjs `countLabelPlan` puts legacy's #deckText,
// lying on the table and turned with its seat like that side's cards. Lives in the TABLE frame
// (x right, y up the table, z off the cloth); board-scene.js adds `group` to the tilted frame.
// `three` is the namespace from `import('three')`; this module never imports it statically.
import { CARD_ASPECT, countLabelPlan } from './overlay-plan.mjs';
import { createTextPlane } from './text-plane.js';

const DEG = Math.PI / 180;
/** `.self-text { font-size: clamp(10px, 4vh, 20px) }` at a 1080 px viewport. */
const DEFAULT_FONT_PX = 20;
/** Canvas font size of every label; the plane is scaled to `fontPx` on the table. */
const TEXT_PX = 28;
/** Above the cloth and its mat overlay (table-mesh Z.overlay = 1) and the cards' 1.5 px lift. */
const LABEL_LIFT_PX = 2;

/**
 * @typedef {{ x: number, y: number, z?: number, yawDeg: number, widthPx: number,
 *   heightPx?: number, fontPx?: number }} CountAnchor
 *   The pile the label belongs to: its centre, height of its top (z), yaw and card width in
 *   flat table px; `heightPx` defaults to the card's height (CARD_ASPECT × width), `fontPx` to 20.
 */

/**
 * @param {{ group: import('three').Group, three: typeof import('three') }} deps
 * @returns {{ setCount: (side: 'self'|'opp', zone: string, count: number, anchorPose: CountAnchor|null) => void,
 *   count: () => number, dispose: () => void }}
 *   `setCount` with a null anchor (or a zone without a label) removes that label; `count()` is
 *   how many labels are shown.
 */
export function createCountLabels({ group, three }) {
  const labels = new Map();
  let disposed = false;

  const remove = (key) => {
    const label = labels.get(key);
    if (!label) return;
    labels.delete(key);
    label.plane.dispose();
  };

  const setCount = (side, zone, count, anchor) => {
    if (disposed) return;
    const key = `${side}:${zone}`;
    const plan = countLabelPlan(zone, count);
    if (!plan || !anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
      remove(key);
      return;
    }
    let label = labels.get(key);
    if (!label) {
      const plane = createTextPlane({ three, text: plan.text, px: TEXT_PX });
      plane.mesh.name = `board3d-count-${key}`;
      // A count reads over whatever card overlaps it, as the DOM text did over the covers.
      plane.mesh.material.depthTest = false;
      plane.mesh.renderOrder = 2;
      group.add(plane.mesh);
      label = { plane };
      labels.set(key, label);
    } else {
      label.plane.setText(plan.text);
    }
    const widthPx = anchor.widthPx > 0 ? anchor.widthPx : 0;
    const heightPx = anchor.heightPx > 0 ? anchor.heightPx : widthPx * CARD_ASPECT;
    const fontPx = anchor.fontPx > 0 ? anchor.fontPx : DEFAULT_FONT_PX;
    const yaw = (Number.isFinite(anchor.yawDeg) ? anchor.yawDeg : 0) * DEG;
    const [u, v] = plan.anchor;
    // Card units → table px, then turned clockwise by the seat's yaw (CSS rotate, seen from above).
    const localX = u * widthPx;
    const localY = v * heightPx;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const mesh = label.plane.mesh;
    mesh.position.set(
      anchor.x + localX * cos + localY * sin,
      anchor.y - localX * sin + localY * cos,
      (Number.isFinite(anchor.z) ? anchor.z : 0) + LABEL_LIFT_PX
    );
    mesh.rotation.set(0, 0, -yaw);
    mesh.scale.setScalar(fontPx / TEXT_PX);
  };

  const dispose = () => {
    if (disposed) return;
    for (const key of [...labels.keys()]) remove(key);
    disposed = true;
  };

  return { setCount, count: () => labels.size, dispose };
}
